import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AudioService } from '../audio/audio.service';
import { OssService } from '../oss/oss.service';
import { MeasuresService } from '../measures/measures.service';
import { projectToPublishMeasures } from '../tab-import/tab-project.utils';
import type { PublishReadyMeasure } from '../tab-import/tab-project.types';
import { deriveLeftHandFingering } from '../tab-import/fingering';
import { deriveChords } from '../tab-import/chord-detect';
import {
  DEFAULT_TUNING_6,
  SUPPORTED_SCHEMA_VERSIONS,
  toInstrumentType,
  toTechnique,
  type AssetManifest,
  type InstrumentType,
  type MeasureTrackData,
  type MetronomeConfig,
  type PracticeBarreMarker,
  type PracticeChordMarker,
  type PracticeMeasure,
  type PracticeNote,
  type PracticePackage,
  type Provenance,
  type ScoreMeta,
  type TrackMeta,
} from '../published/practice-package.types';
import { UploadService } from './upload.service';
import {
  LOW_CONFIDENCE_THRESHOLD,
  defaultTuningFor,
  measureDurationSec,
  midiToName,
  parseTuningToMidi,
  round4,
  toNormalizedCoords,
} from './transcription.types';

export interface PublishOptions {
  publishedBy?: string;
  /** 练习声道（C 端 Simplified）。默认 guitar */
  channel?: string;
  /** 音频切片失败时：`source` = 原音频 + #t= 片段；`metronome` = 服务端合成节拍器 WAV */
  audioFallback?: 'source' | 'metronome';
  /** 允许无音频发布（纯谱面），默认 true（转录项目常有「先要谱面」的场景） */
  allowMissingAudio?: boolean;
  /** 是否镜像写入既有 Score/Track/Measure 发布链路（默认 false，保持旧数据零污染） */
  mirrorToScorePipeline?: boolean;
  /**
   * 镜像到**指定**曲目（而不是新建）：重复发布 / 反复演示时不会攒出一堆同名曲目。
   * 未指定时依次回退到 `Project.scoreId`、新建。
   */
  mirrorScoreId?: string;
  /** 每小节最大切片数（防止超长曲目把 ffmpeg 打满），0 = 不限制 */
  maxMeasures?: number;
}

export interface PublishResult {
  success: true;
  projectId: string;
  packageId: string;
  revision: number;
  schemaVersion: string;
  stats: {
    measureCount: number;
    noteCount: number;
    trackCount: number;
    lowConfidenceCount: number;
    slicedAudioCount: number;
    degradedAudioCount: number;
    metronomeFallbackCount: number;
  };
  mirrored: { enabled: boolean; scoreId?: string; trackId?: string; measureCount?: number; error?: string };
  warnings: string[];
  package: PracticePackage;
}

/**
 * PublishService —— 生成 C 端唯一数据契约 PracticePackage
 * =====================================================
 *
 * 完整职责（对应任务 5）：
 *
 * ```
 *  ① 按小节切音频（ffmpeg，复用既有 AudioService.sliceAudio）
 *  ② 上传 OSS / 本地静态目录（复用既有 OssService.upload）
 *  ③ 计算每个音符的 relativeTime 与归一化坐标 x / y
 *  ④ 组装符合 schemaVersion 1.0 的 PracticePackage JSON
 *  ⑤ 落库到 PracticePackage 表（payload 为 String —— SQLite 不支持 Json）
 *  ⑥ 可选：镜像写入既有 Score/Track/Measure 发布链路（默认关闭）
 * ```
 *
 * 关键不变式（与既有 tab-import / published 契约完全一致）：
 * | 量 | 公式 |
 * |---|---|
 * | `relativeTime` | `audioTime - measure.startTime` |
 * | `x` | `relativeTime / measure.duration` |
 * | `y` | `(string - 1) / 5`（一弦在上） |
 * | `midi` | `空弦音高 + fret + capo`（在 TabProject 层已算好） |
 * | 小节时长 | `拍数 × (60/bpm) × (4/拍号分母)` —— **不硬编码** |
 *
 * `metronome` 字段**始终**下发（`enabled: !audioUrl`）—— 音频 404 时客户端可立即降级，
 * 不需要等后端改数据（沿用了既有 `PracticePackageService` 的「永不静音」约定）。
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audio: AudioService,
    private readonly oss: OssService,
    private readonly measures: MeasuresService,
    private readonly upload: UploadService,
  ) {}

  // ═══════════════════════════════════════════
  // 主入口：生成 + 落库
  // ═══════════════════════════════════════════

  async publish(projectId: string, options: PublishOptions = {}): Promise<PublishResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { tracks: { orderBy: { instrument: 'asc' } } },
    });
    if (!project) throw new NotFoundException(`转录项目 ${projectId} 不存在`);
    if (!project.tabProject) {
      throw new BadRequestException(
        `项目《${project.title}》还没有 TabProject（转录尚未完成）。请先 POST /api/transcription/projects/${projectId}/start 并等待状态变为 review。`,
      );
    }

    const tabProject = safeParse(project.tabProject);
    const primaryTrack = tabProject?.tracks?.[0];
    if (!primaryTrack?.measures?.length) {
      throw new BadRequestException('TabProject 里没有任何小节，无法生成 PracticePackage。');
    }

    const warnings: string[] = [];
    const publishedBy = options.publishedBy || 'cms';
    const channel = (options.channel || 'guitar').trim() || 'guitar';
    const audioFallback = options.audioFallback || 'source';
    const allowMissingAudio = options.allowMissingAudio !== false;
    // ── 音频可达性（与 measures/publish 同样的「先校验再动手」原则）──
    const sourceAudioPath = project.audioPath || '';
    let resolvedAudioPath = '';
    if (sourceAudioPath) {
      const accessibility = await this.audio.checkSourceAccessible(sourceAudioPath);
      if (accessibility.ok) {
        resolvedAudioPath = accessibility.resolved || sourceAudioPath;
      } else if (!allowMissingAudio) {
        throw new BadRequestException(
          `源音频不可达，已终止发布：${accessibility.reason}\n（如需仅发布谱面，请设置 allowMissingAudio=true）`,
        );
      } else {
        warnings.push(`源音频不可达，将只发布谱面 + 节拍器：${accessibility.reason}`);
      }
    } else {
      warnings.push('项目没有音频文件，将只发布谱面 + 节拍器（C 端仍可练习与高亮）。');
    }

    // ── ① 小节窗口 + 音符（复用 tab-import 的换算，保证与人工导入完全一致）──
    //
    // 节奏元信息的优先级：**Project 行（ReviewPage 人工可改）> TabProject.meta**。
    // 若人工在复核时改了 BPM / 拍号，TabProject 里的小节窗口就是「按旧速度切出来的」，
    // 直接用会导致「音频切片区间 ≠ 谱面小节」—— 这正是历史上
    // 「音频与节点不一致 / 节奏不对」问题的根源。因此这里必须按新 BPM 重新分小节。
    const usesOverride =
      Number(project.bpm) > 0 &&
      Math.abs(Number(project.bpm) - (Number(tabProject?.meta?.bpm) || 0)) > 0.5;
    const timeSignatureOverridden =
      !!project.timeSignature && project.timeSignature !== (tabProject?.meta?.timeSignature || '4/4');

    const bpm = Number(project.bpm) > 0 ? Number(project.bpm) : Number(tabProject.meta?.bpm) || 100;
    const timeSignature = project.timeSignature || tabProject.meta?.timeSignature || '4/4';

    let effectiveProject = tabProject;
    if (usesOverride || timeSignatureOverridden) {
      effectiveProject = this.rewindowTabProject(tabProject, bpm, timeSignature);
      warnings.push(
        `节奏元信息已按人工复核结果覆盖（BPM ${tabProject?.meta?.bpm ?? '?'} → ${bpm}` +
          `${timeSignatureOverridden ? `，拍号 ${tabProject?.meta?.timeSignature ?? '?'} → ${timeSignature}` : ''}），` +
          `小节窗口已重新划分，保证音频切片区间与谱面小节严格对应。`,
      );
    }

    /**
     * 补全左手指法 / 把位（放在「重新分小节」**之后**，因为换把是基于小节窗口判断的）。
     * 源文件已带真实 `<fingering>` 的音符不会被覆盖（`onlyMissing`）。
     */
    const fingering = deriveLeftHandFingering(effectiveProject, { onlyMissing: true });
    effectiveProject = fingering.project;
    warnings.push(...fingering.warnings.map((w) => w.message));

    /** 补全和弦标注（单音旋律走窗口和声分析；源文件已有 <harmony> 时不覆盖） */
    const chordDetection = deriveChords(effectiveProject, { onlyMissing: true });
    effectiveProject = chordDetection.project;
    warnings.push(...chordDetection.warnings);

    const tuningMidi =
      parseTuningToMidi(project.tuning) ||
      (Array.isArray(tabProject.tuning) && tabProject.tuning.length ? tabProject.tuning : null) ||
      defaultTuningFor(primaryTrack.instrument || 'guitar');
    const capo = Number(project.capo) || Number(tabProject.capo) || 0;

    let publishMeasures: PublishReadyMeasure[] = projectToPublishMeasures(effectiveProject, {
      instrument: primaryTrack.instrument || 'guitar',
      tabImageUrl: '',
    });
    if (options.maxMeasures && options.maxMeasures > 0) {
      publishMeasures = publishMeasures.slice(0, options.maxMeasures);
    }
    if (publishMeasures.length === 0) {
      throw new BadRequestException('换算后没有任何可发布小节，请检查 TabProject 结构。');
    }

    // ── ② 逐小节：切音频 → 上传 OSS → 组装 MeasureTrackData ──
    const tracksMeta: TrackMeta[] = this.buildTrackMeta(project, tabProject, tuningMidi, capo);
    const beatsPerMeasure = parseInt(String(timeSignature).split('/')[0], 10) || 4;

    const instrument: InstrumentType = toInstrumentType(channel);
    const trackIdForMeasure = project.tracks[0]?.id || `tr_${channel}`;

    let slicedAudioCount = 0;
    let degradedAudioCount = 0;
    let metronomeFallbackCount = 0;

    const measures: PracticeMeasure[] = [];
    for (const pm of publishMeasures) {
      const duration = round4(Math.max(0.01, pm.endTime - pm.startTime));
      const measureDuration =
        duration > 0 ? duration : measureDurationSec(bpm, timeSignature, beatsPerMeasure);

      // ② -1 切音频 + 上传
      let audioUrl: string | null = null;
      if (resolvedAudioPath) {
        try {
          const localSlice = await this.audio.sliceAudio(resolvedAudioPath, pm.startTime, pm.endTime);
          audioUrl = await this.oss.upload(localSlice, `transcriptions/${projectId}/measures`);
          slicedAudioCount += 1;
        } catch (err: any) {
          this.logger.warn(`小节 ${pm.index} 切片失败：${err?.message || err}`);
          if (audioFallback === 'metronome') {
            audioUrl = null;
            metronomeFallbackCount += 1;
          } else {
            degradedAudioCount += 1;
            try {
              audioUrl = await this.oss.exposeOriginalAudio(
                resolvedAudioPath,
                `transcriptions/${projectId}/measures`,
                pm.startTime,
                pm.endTime,
              );
            } catch {
              audioUrl = null;
            }
          }
          if (!audioUrl) {
            warnings.push(`第 ${pm.index} 小节没有可用切片音频，C 端将使用节拍器。`);
          }
        }
      } else {
        metronomeFallbackCount += 1;
      }

      // ② -2 音符：relativeTime + 归一化坐标
      const notes: PracticeNote[] = pm.notes
        .map((n, i): PracticeNote => {
          /** 夹到 ≥ 0：小节窗口与绝对时间各自做过舍入，直接相减会出现 -0.0003 之类的浮点负数 */
          const relativeTime = Math.max(0, round4(n.audioTime - pm.startTime));
          const { x, y } = toNormalizedCoords(relativeTime, measureDuration, n.string);
          return {
            id: n.id || `n_${pm.index}_${i}`,
            string: Number(n.string),
            fret: Number(n.fret),
            pitch: Number(n.pitch),
            relativeTime,
            duration: round4(Math.max(0.05, n.duration || 0.5)),
            // 服务端兜底：即便 TabProject 没给坐标，也一定输出合法 0-1 值
            x: Number.isFinite(n.x) && n.x > 0 ? round4(n.x) : x,
            y: Number.isFinite(n.y) && n.y > 0 ? round4(n.y) : y,
            technique: toTechnique(n.technique as any),
            /** 左手指法：0 = 空弦，1-4 = 食指…小指（由 fingering.ts 推定或人工指定） */
            finger: typeof (n as any).finger === 'number' ? Number((n as any).finger) : undefined,
            position: typeof (n as any).position === 'number' ? Number((n as any).position) : undefined,
            confidence: Number.isFinite(n.confidence) ? Number(n.confidence) : 1,
          };
        })
        .sort((a, b) => a.relativeTime - b.relativeTime || a.string - b.string);

      const barres: PracticeBarreMarker[] = (pm.barres || []).map((b, i) => ({
        id: `barre_${pm.index}_${i}`,
        fret: Number(b.fret),
        fromString: Number(b.fromString),
        toString: Number(b.toString),
        startTime: round4(b.startTime - pm.startTime),
        duration: round4(b.duration),
        x: round4(b.x),
        y: round4(b.y),
      }));

      const chords: PracticeChordMarker[] = (pm.chords || []).map((c, i) => ({
        id: `chord_${pm.index}_${i}`,
        chordName: c.chordName,
        /** 同上：夹到 ≥ 0，避免和弦标记被浮点误差推到小节之外 */
        startTime: Math.max(0, round4(c.startTime - pm.startTime)),
        duration: round4(c.duration),
        x: round4(c.x),
        y: round4(c.y),
        /** 指法图：只有「音簇匹配」出来的和弦才有实际把位；窗口推定的不下发 */
        voicing: Array.isArray(c.voicing) ? c.voicing.map((f) => Number(f)) : undefined,
      }));

      const metronome: MetronomeConfig = {
        enabled: !audioUrl,
        bpm,
        beatsPerMeasure,
        accentFirstBeat: true,
      };

      const lowConfidence = notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length;
      const tips: string[] = [];
      if (lowConfidence > 0) {
        tips.push(`本小节有 ${lowConfidence} 个低置信度音符（转录草稿），练习时以谱面为准。`);
      }
      if (!audioUrl) tips.push('本小节暂无音频，使用节拍器模式练习。');

      const trackData: MeasureTrackData = {
        trackId: trackIdForMeasure,
        instrument,
        audioUrl,
        originalAudioUrl: audioUrl,
        metronome,
        tabImageUrl: '',
        imageWidth: 1200,
        imageHeight: 300,
        notes,
      };

      measures.push({
        id: `pm_${projectId}_${pm.index}`,
        index: pm.index,
        label: pm.label || `第 ${pm.index} 小节`,
        section: toSection(pm.label),
        startTime: round4(pm.startTime),
        endTime: round4(pm.endTime),
        duration: measureDuration,
        bpm,
        timeSignature,
        /** 小节把位（第 P 把位）→ C 端渲染罗马数字标记 */
        position: typeof pm.position === 'number' && pm.position >= 1 ? pm.position : undefined,
        trackData: [trackData],
        chords,
        barres,
        tips: tips.length ? tips : undefined,
      });
    }

    measures.sort((a, b) => a.index - b.index);

    // ── ③ 组装契约 ──
    const packageJson = this.assemblePackage({
      project,
      tabProject,
      tracksMeta,
      measures,
      bpm,
      timeSignature,
      tuningMidi,
      capo,
      publishedBy,
      resolvedAudioPath,
      warnings,
    });

    // ── ④ 落库（revison 自增，保留历史快照）──
    const previous = await this.prisma.practicePackage.findFirst({
      where: { projectId },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    const revision = (previous?.revision || 0) + 1;

    const allNotes = measures.flatMap((m) => m.trackData.flatMap((td) => td.notes));
    const lowConfidenceCount = allNotes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length;

    const row = await this.prisma.practicePackage.create({
      data: {
        projectId,
        scoreId: project.scoreId || null,
        schemaVersion: '1.0',
        revision,
        payload: JSON.stringify(packageJson),
        measureCount: measures.length,
        noteCount: allNotes.length,
        trackCount: tracksMeta.length,
        lowConfidenceCount,
        slicedAudioCount,
        degradedAudioCount,
        publishedBy,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'published',
        progress: 100,
        stageNote: `已发布 PracticePackage r${revision}（${measures.length} 小节 / ${allNotes.length} 音符）`,
        error: null,
      },
    });

    // ── ⑤ 可选：镜像进既有 Score/Track/Measure 链路 ──
    const mirrored = options.mirrorToScorePipeline
      ? await this.mirrorToScorePipeline(project, tabProject, measures, {
          channel,
          bpm,
          timeSignature,
          publishMeasures,
          reuseScoreId: options.mirrorScoreId,
        })
      : { enabled: false };

    if (mirrored.error) warnings.push(`镜像到旧发布链路失败：${mirrored.error}`);

    return {
      success: true,
      projectId,
      packageId: row.id,
      revision,
      schemaVersion: packageJson.schemaVersion,
      stats: {
        measureCount: measures.length,
        noteCount: allNotes.length,
        trackCount: tracksMeta.length,
        lowConfidenceCount,
        slicedAudioCount,
        degradedAudioCount,
        metronomeFallbackCount,
      },
      mirrored,
      warnings,
      package: packageJson,
    };
  }

  /** 读取已落库的 PracticePackage（默认最新版） */
  async getPackage(projectId: string, revision?: number) {
    const row = await this.prisma.practicePackage.findFirst({
      where: { projectId, ...(revision ? { revision } : {}) },
      orderBy: { revision: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(
        `项目 ${projectId} 还没有发布过 PracticePackage。请先 POST /api/transcription/projects/${projectId}/publish`,
      );
    }
    return {
      id: row.id,
      revision: row.revision,
      schemaVersion: row.schemaVersion,
      publishedBy: row.publishedBy,
      createdAt: row.createdAt,
      stats: {
        measureCount: row.measureCount,
        noteCount: row.noteCount,
        trackCount: row.trackCount,
        lowConfidenceCount: row.lowConfidenceCount,
        slicedAudioCount: row.slicedAudioCount,
        degradedAudioCount: row.degradedAudioCount,
      },
      package: safeParse(row.payload),
    };
  }

  async listRevisions(projectId: string) {
    const rows = await this.prisma.practicePackage.findMany({
      where: { projectId },
      orderBy: { revision: 'desc' },
      select: {
        id: true,
        revision: true,
        schemaVersion: true,
        measureCount: true,
        noteCount: true,
        lowConfidenceCount: true,
        publishedBy: true,
        createdAt: true,
      },
    });
    return rows;
  }

  // ═══════════════════════════════════════════
  // 重新分小节（人工覆写 BPM / 拍号时）
  // ═══════════════════════════════════════════

  /**
   * 按**新的 BPM / 拍号**把 TabProject 的音符重新装进等长小节窗口。
   *
   * 为什么必须做这一步：
   * TabProject 里的小节窗口是按「转录时的 BPM」切出来的。管理员在 ReviewPage 改 BPM 后，
   * 如果直接沿用旧窗口，`AudioService.sliceAudio(startTime, endTime)` 切出的音频区间
   * 与谱面小节就不再对应 —— 表现为「音频与节点不一致 / 节奏不对」。
   *
   * 音符的**绝对秒时间不变**（那是从音频转录得到的，是事实），只重新划分小节边界，
   * 让 `offsetSec` / `beat` 基于新窗口重算。
   */
  private rewindowTabProject(tabProject: any, bpm: number, timeSignature: string): any {
    const measureSec = measureDurationSec(bpm, timeSignature);
    const beats = parseInt(String(timeSignature).split('/')[0], 10) || 4;
    const beatSec = 60 / (bpm > 0 ? bpm : 120);

    const tracks = (tabProject.tracks || []).map((track: any) => {
      type AbsNote = Record<string, any> & { absSec: number };
      const absolute: AbsNote[] = [];
      for (const m of track.measures || []) {
        for (const n of m.notes || []) {
          absolute.push({ ...n, absSec: Number(m.startTime || 0) + Number(n.offsetSec || 0) });
        }
      }
      absolute.sort((a, b) => a.absSec - b.absSec || Number(a.string) - Number(b.string));

      const durationSec =
        absolute.reduce((max, n) => Math.max(max, n.absSec + Number(n.durationSec || 0.25)), 0) ||
        measureSec;
      const measureCount = Math.max(1, Math.ceil(durationSec / measureSec - 1e-9));

      const measures = [];
      for (let index = 0; index < measureCount; index += 1) {
        const startTime = round4(index * measureSec);
        const rawEnd = round4(Math.min(durationSec, (index + 1) * measureSec));
        const endTime = rawEnd > startTime ? rawEnd : round4(startTime + measureSec);
        const inWindow = absolute.filter((n) => n.absSec >= startTime - 1e-6 && n.absSec < endTime + 1e-6);

        measures.push({
          index,
          label: `第 ${index + 1} 小节`,
          startTime,
          endTime,
          beats,
          notes: inWindow.map((n, noteIndex) => {
            const { absSec, ...rest } = n;
            const offsetSec = round4(absSec - startTime);
            return {
              ...rest,
              id: `${track.id || 'tr'}_m${index}_n${noteIndex}`,
              offsetSec,
              beat: round4(offsetSec / beatSec),
            };
          }),
        });
      }

      return { ...track, measures };
    });

    const noteCount = tracks.reduce(
      (sum: number, t: any) =>
        sum + t.measures.reduce((s: number, m: any) => s + m.notes.length, 0),
      0,
    );
    const lastEnd = tracks.reduce(
      (max: number, t: any) => Math.max(max, t.measures[t.measures.length - 1]?.endTime || 0),
      0,
    );

    this.logger.log(
      `已按新节奏重新分小节：BPM=${bpm} 拍号=${timeSignature} → ${tracks[0]?.measures?.length || 0} 小节 / ${noteCount} 音符`,
    );

    return {
      ...tabProject,
      meta: { ...tabProject.meta, bpm, timeSignature },
      tracks,
      stats: {
        ...(tabProject.stats || {}),
        measureCount: tracks[0]?.measures?.length || 0,
        noteCount,
        durationSec: round4(lastEnd),
      },
    };
  }

  // ═══════════════════════════════════════════
  // 组装细节
  // ═══════════════════════════════════════════

  private buildTrackMeta(
    project: any,
    tabProject: any,
    tuningMidi: number[],
    capo: number,
  ): TrackMeta[] {
    const labels: Partial<Record<string, string>> = {
      guitar: '吉他',
      guitar_lead: '主音吉他',
      guitar_rhythm: '节奏吉他',
      guitar_acoustic: '原声吉他',
      bass: '贝斯',
      piano: '钢琴',
      other: '其他',
    };

    const tracks: TrackMeta[] = [];
    for (const t of tabProject?.tracks || []) {
      const instrument = toInstrumentType(t.instrument);
      tracks.push({
        id: `${project.id}_${t.id || t.instrument}`,
        instrument,
        label: labels[instrument] || t.name || '乐器轨',
        tuning: tuningMidi.map(midiToName),
        capo,
        fullAudioUrl: project.audioPath ? this.upload.toPublicUrl(project.audioPath) : undefined,
      });
    }
    if (tracks.length === 0) {
      tracks.push({
        id: `${project.id}_guitar`,
        instrument: 'guitar_acoustic',
        label: labels.guitar!,
        tuning: tuningMidi.map(midiToName),
        capo,
        fullAudioUrl: project.audioPath ? this.upload.toPublicUrl(project.audioPath) : undefined,
      });
    }
    return tracks;
  }

  private assemblePackage(input: {
    project: any;
    tabProject: any;
    tracksMeta: TrackMeta[];
    measures: PracticeMeasure[];
    bpm: number;
    timeSignature: string;
    tuningMidi: number[];
    capo: number;
    publishedBy: string;
    resolvedAudioPath: string;
    warnings: string[];
  }): PracticePackage {
    const {
      project,
      tabProject,
      tracksMeta,
      measures,
      bpm,
      timeSignature,
      tuningMidi,
      capo,
      publishedBy,
      resolvedAudioPath,
    } = input;

    const originalAudioUrl = resolvedAudioPath ? this.upload.toPublicUrl(resolvedAudioPath) : undefined;
    const firstSlice = measures[0]?.trackData?.[0]?.audioUrl || undefined;

    const assets: AssetManifest = {
      cdnBase: cdnBaseOf(firstSlice || originalAudioUrl),
      originalAudioUrl,
      audioFormat: audioFormatOf(firstSlice || originalAudioUrl),
      audioBitrate: 192,
    };

    const allNotes = measures.flatMap((m) => m.trackData.flatMap((td) => td.notes));
    const reviewed = allNotes.filter((n) => n.confidence >= LOW_CONFIDENCE_THRESHOLD).length;
    const humanReviewLevel = allNotes.length ? round4(reviewed / allNotes.length) : 1;
    const simulated = (project.tracks || []).some((t: any) => {
      const meta = safeParse(t.meta);
      return !!meta?.simulated;
    });
    const sourceKinds = new Set((tabProject?.tracks || []).map((t: any) => t.instrument));
    const hasExtraTracks = sourceKinds.size > 1;

    const provenance: Provenance = {
      // 音频转录链路 → 契约里最贴近的枚举是 solotrace（时间轴对齐的转录 JSON）
      source: hasExtraTracks ? 'mixed' : 'solotrace',
      sourceDetail: [
        `demucs(${process.env.DEMUCS_MODEL || 'htdemucs_6s'}) → basic-pitch → tayuya`,
        simulated ? '⚠️ 含模拟转录产物（未安装 Python 依赖）' : '真实转录产物',
        input.warnings.length ? `warnings: ${input.warnings.length} 条` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      license: (['public_domain', 'cc_by', 'authorized', 'user_uploaded'] as string[]).includes(
        String(project.license),
      )
        ? (project.license as Provenance['license'])
        : 'user_uploaded',
      humanReviewLevel,
    };

    const scoreMeta: ScoreMeta = {
      id: project.id,
      title: project.title,
      artist: project.artist || undefined,
      bpm,
      timeSignature,
      key: tabProject?.meta?.key || undefined,
      capo,
      tuning: tuningMidi.map(midiToName),
      difficulty: inferDifficulty(allNotes),
      coverUrl: undefined,
    };

    const pkg: PracticePackage = {
      schemaVersion: SUPPORTED_SCHEMA_VERSIONS[0] as '1.0',
      score: scoreMeta,
      tracks: tracksMeta,
      measures,
      assets,
      provenance,
      publishedAt: new Date().toISOString(),
      publishedBy,
    };

    // 最终自检：契约层不允许失败的字段一律兜底（避免 C 端白屏）
    if (!pkg.score.tuning?.length) pkg.score.tuning = [...DEFAULT_TUNING_6];
    pkg.tracks = pkg.tracks.map((t) => (t.tuning?.length ? t : { ...t, tuning: [...DEFAULT_TUNING_6] }));

    return pkg;
  }

  // ═══════════════════════════════════════════
  // 镜像到既有 Score/Track/Measure 链路（可选）
  // ═══════════════════════════════════════════

  /**
   * 把转录结果写入**既有**发布链路，使 CMS 的「音频与六线谱对齐」工作台、
   * 旧的 `/api/published/scores/:id/measures` 接口也能看到数据。
   *
   * 为什么默认关闭？
   * ----
   * 既有链路是 append-only 且共享 Score/Track/Measure 表；自动写入会让老数据产生
   * 意料之外的重复小节。因此这里必须由调用方显式开启（`mirrorToScorePipeline: true`），
   * 并且全部失败都只降级为 warning，不影响新的 PracticePackage 发布结果。
   */
  private async mirrorToScorePipeline(
    project: any,
    tabProject: any,
    measures: PracticeMeasure[],
    ctx: {
      channel: string;
      bpm: number;
      timeSignature: string;
      publishMeasures: PublishReadyMeasure[];
      /** 指定复用的曲目 id（重复演示时避免新建同名曲目） */
      reuseScoreId?: string;
    },
  ): Promise<{ enabled: boolean; scoreId?: string; trackId?: string; measureCount?: number; error?: string }> {
    try {
      const audioUrl = project.audioPath ? this.upload.toPublicUrl(project.audioPath) : '';

      let scoreId = ctx.reuseScoreId || project.scoreId;
      if (!scoreId) {
        const score = await this.prisma.score.create({
          data: {
            title: project.title,
            artist: project.artist || null,
            bpm: ctx.bpm,
            timeSignature: ctx.timeSignature,
            originalAudio: audioUrl,
            status: 'draft',
            songKey: tabProject?.meta?.key || null,
            capo: project.capo ?? 0,
            tuning: project.tuning || null,
            license: project.license || 'user_uploaded',
          },
        });
        scoreId = score.id;
        await this.prisma.project.update({ where: { id: project.id }, data: { scoreId } });
      }

      const existingTrack = await this.prisma.track.findFirst({
        where: { scoreId, instrument: ctx.channel },
      });
      const tabJsonPath = project.tracks?.[0]?.tabPath || null;
      const trackId =
        existingTrack?.id ||
        (
          await this.prisma.track.create({
            data: {
              scoreId,
              instrument: ctx.channel,
              audioUrl,
              jsonUrl: tabJsonPath,
            },
          })
        ).id;

      // 重新发布前清空旧小节（既有链路是 append-only，必须先删）
      const deleted = await this.measures.deleteByScore(scoreId);

      for (const pm of ctx.publishMeasures) {
        const practiceMeasure = measures.find((m) => m.index === pm.index);
        const trackData = practiceMeasure?.trackData?.[0];
        await this.measures.create({
          scoreId,
          trackId,
          index: pm.index,
          label: pm.label,
          startTime: pm.startTime,
          endTime: pm.endTime,
          duration: round4(Math.max(0.01, pm.endTime - pm.startTime)),
          bpm: ctx.bpm,
          timeSignature: ctx.timeSignature,
          /** 小节把位：漏传会导致镜像后的曲目在 C 端看不到把位标记 */
          position: typeof pm.position === 'number' ? pm.position : undefined,
          audioUrl: trackData?.audioUrl || '',
          channel: ctx.channel,
          originalAudioUrl: trackData?.originalAudioUrl || null,
          tabImageUrl: '',
          imageWidth: 1200,
          imageHeight: 300,
          notes: JSON.stringify(trackData?.notes || []),
          barres: pm.barres,
          chords: pm.chords,
        });
      }

      this.logger.log(
        `已镜像到既有发布链路：scoreId=${scoreId} trackId=${trackId}（清理旧小节 ${deleted} 个，写入 ${ctx.publishMeasures.length} 个）`,
      );
      return { enabled: true, scoreId, trackId, measureCount: ctx.publishMeasures.length };
    } catch (err: any) {
      this.logger.warn(`镜像到既有发布链路失败（不影响新契约）：${err?.message || err}`);
      return { enabled: true, error: err?.message || String(err) };
    }
  }
}

// ─────────────────────────────────────────────
// 纯函数工具
// ─────────────────────────────────────────────

function safeParse(raw?: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const SECTION_MAP: Array<{ test: RegExp; value: string }> = [
  { test: /前奏|intro/i, value: 'intro' },
  { test: /主歌|verse/i, value: 'verse' },
  { test: /(预)?副歌|pre-?chorus|chorus/i, value: 'chorus' },
  { test: /间奏|过门|bridge|interlude|riff/i, value: 'bridge' },
  { test: /独奏|solo|华彩/i, value: 'solo' },
  { test: /尾奏|结束|outro|ending|coda/i, value: 'outro' },
];

function toSection(label?: string): string | undefined {
  const text = label || '';
  return SECTION_MAP.find((e) => e.test.test(text))?.value;
}

function cdnBaseOf(url?: string): string {
  const m = url?.match(/^(https?:\/\/[^/]+)/i);
  return m ? m[1] : process.env.APP_URL || 'http://localhost:3000';
}

function audioFormatOf(url?: string): 'mp3' | 'wav' | 'm4a' {
  const path = (url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.wav')) return 'wav';
  if (path.endsWith('.m4a') || path.endsWith('.aac')) return 'm4a';
  return 'mp3';
}

/** 与既有 PracticePackageService 一致：人工标注优先，缺失时按最高品位/密度启发 */
function inferDifficulty(notes: PracticeNote[]): 1 | 2 | 3 | 4 | 5 {
  if (!notes.length) return 1;
  const maxFret = notes.reduce((max, n) => Math.max(max, n.fret), 0);
  const density = notes.filter((n) => n.fret >= 2).length / notes.length;
  if (maxFret >= 12 || density > 0.5) return 4;
  if (maxFret >= 8) return 3;
  if (maxFret >= 5) return 2;
  return 1;
}
