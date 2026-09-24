import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import type { PublishReadyMeasure, TabProject, TabSourceFormat } from './tab-project.types';
import {
  isPublishableRights,
  projectMeasureToAscii,
  projectToPublishMeasures,
  rightsToLicense,
  tuningToLabels,
} from './tab-project.utils';
import { SUPPORTED_FORMATS, parseTabInput, type ParseTabInput } from './parsers';
import { deriveLeftHandFingering, type FingeringStats } from './fingering';
import { deriveChords, type ChordDetectStats } from './chord-detect';
import {
  PUBLIC_DOMAIN_REPERTOIRE,
  TAB_SOURCES,
  copyrightHint,
  type SourceTier,
} from './tab-sources.catalog';

export interface TabImportPreview {
  success: true;
  format: TabSourceFormat;
  project: TabProject;
  /** 发布就绪的小节（可直接 POST /api/measures/publish） */
  measures: PublishReadyMeasure[];
  diagnostics: {
    measureCount: number;
    noteCount: number;
    chordCount: number;
    /** 会实际写入数据库的横按数量（已去重） */
    barreCount: number;
    durationSec: number;
    bpm: number;
    timeSignature: string;
    tuning: string;
    capo: number;
    approximateRhythmMeasures: number;
    lowConfidenceCount: number;
    /** 左手指法 / 把位推定统计 */
    fingering: FingeringStats;
    /** 和弦识别统计 */
    chords: ChordDetectStats;
    warnings: TabProject['warnings'];
  };
  copyright: {
    tier: 'public-domain' | 'copyrighted' | 'unknown';
    publishable: boolean;
    reason: string;
  };
  /** 前 3 个小节的 ASCII 回显，便于肉眼校对 */
  asciiPreview: Array<{ index: number; label: string; ascii: string; noteCount: number }>;
}

export interface TabImportSaveResult {
  success: true;
  scoreId: string;
  trackId: string;
  projectUrl: string;
  projectPath: string;
  measureCount: number;
  noteCount: number;
  /** 本次写入曲目的元数据（会出现在 C 端契约的 score.* 与 provenance.license） */
  appliedMetadata: {
    songKey?: string;
    capo?: number;
    tuning?: string[];
    license?: string;
  };
  publishPayloadTemplate: {
    scoreId: string;
    trackId: string;
    bpm: number;
    timeSignature: string;
    channel: string;
    measures: PublishReadyMeasure[];
    allowMissingAudio: boolean;
    audioFallback: 'metronome';
    note: string;
  };
  warnings: string[];
}

@Injectable()
export class TabImportService {
  private readonly logger = new Logger(TabImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 能力清单 + 合规数据源（CMS 的「从哪里拿谱子」面板用） */
  getCatalog() {
    return {
      formats: SUPPORTED_FORMATS,
      sources: TAB_SOURCES,
      publicDomainRepertoire: PUBLIC_DOMAIN_REPERTOIRE,
      tiers: [
        { tier: 'public-domain' as SourceTier, label: '✅ 公有领域 / CC0', note: '可自由抓取、可对外发布' },
        { tier: 'official-licensed' as SourceTier, label: '✅ 官方授权渠道', note: '按许可协议使用' },
        { tier: 'reference-only' as SourceTier, label: '⚠️ 仅内部参考', note: '用户投稿谱面，不可直接对外发布' },
        { tier: 'restricted' as SourceTier, label: '❌ 禁止抓取', note: 'ToS 禁止 + 私有格式 + 版权作品' },
      ],
    };
  }

  getCopyrightHint(title?: string) {
    return copyrightHint(title);
  }

  /** 解析任意格式 → TabProject + 发布就绪小节 + 诊断（**不落库**） */
  parseToPreview(input: ParseTabInput): TabImportPreview {
    const parsed = parseTabInput(input);
    /**
     * 补全左手指法 / 把位。
     * MusicXML / GPX 里已带 `<fingering>` 的音符会原样保留（`onlyMissing`），
     * ASCII tab / 和弦表 / 转录 JSON 这类无指法信息的源才会走启发式推定。
     */
    const fingering = deriveLeftHandFingering(parsed, { onlyMissing: true });
    /**
     * 补全和弦标注（谱面**上方**的和弦名）。
     * 显式 `<harmony>` / 和弦表导入的和弦不会被覆盖（`onlyMissing`）；
     * 没有和弦信息时：先看有无「≥3 根弦同时按响」的音簇，否则做窗口和声分析。
     */
    const chords = deriveChords(fingering.project, { onlyMissing: true });
    const project = chords.project;
    const measures = projectToPublishMeasures(project);

    const lowConfidenceCount = measures.reduce(
      (sum, m) => sum + m.notes.filter((n) => (n.confidence ?? 1) < 0.6).length,
      0,
    );

    const rights = isPublishableRights(project.source.rights);
    const hint = copyrightHint(project.meta.title);
    const publishable = rights.ok && hint.tier !== 'copyrighted';

    const tuningNames = project.tuning.map((m) => midiName(m)).join(' ');

    // 诊断里的横按数用「实际会发布的数量」（去重后），避免和 C 端看到的对不上
    const publishableBarreCount = measures.reduce((sum, m) => sum + m.barres.length, 0);

    const warnings = [...project.warnings];
    if (!rights.ok && rights.reason) {
      warnings.push({ level: 'error', code: 'rights-blocked', message: rights.reason });
    }
    if (hint.tier === 'copyrighted') {
      warnings.push({ level: 'warn', code: 'copyright-known-work', message: hint.reason });
    }

    return {
      success: true,
      format: project.source.kind,
      project,
      measures,
      diagnostics: {
        measureCount: project.stats.measureCount,
        noteCount: project.stats.noteCount,
        chordCount: project.stats.chordCount,
        barreCount: publishableBarreCount,
        durationSec: project.stats.durationSec,
        bpm: project.meta.bpm,
        timeSignature: project.meta.timeSignature,
        tuning: tuningNames,
        capo: project.capo,
        approximateRhythmMeasures: project.stats.approximateRhythmMeasures,
        lowConfidenceCount,
        /** 左手指法 / 把位推定统计（CMS 显示「0=空弦 1-4=食指…小指」的标注依据） */
        fingering: fingering.stats,
        /** 和弦识别统计（谱面上方和弦名的来源） */
        chords: chords.stats,
        warnings,
      },
      copyright: {
        tier: hint.tier,
        publishable,
        reason: rights.ok ? hint.reason : `${rights.reason}\n${hint.reason}`,
      },
      asciiPreview: project.tracks[0].measures.slice(0, 3).map((m) => ({
        index: m.index,
        label: m.label || `第 ${m.index + 1} 小节`,
        ascii: projectMeasureToAscii(m),
        noteCount: m.notes.length,
      })),
    };
  }

  /**
   * 把 TabProject 落到「曲目工程」：
   * - 没有 scoreId 时自动创建 Score（draft），并把**谱面元数据**一并写入
   *   （调性 / 变调夹 / 调弦 / 授权状态 —— 这些会出现在 C 端 PracticePackage 里）
   * - 复用已有曲目时只补空缺字段，不覆盖管理员手工填过的值
   * - 创建 / 复用 Track，并把 TabProject JSON 挂到 `Track.jsonUrl`（可溯源、可回灌）
   */
  async saveProject(payload: {
    scoreId?: string;
    newScore?: {
      title: string;
      artist?: string;
      bpm?: number;
      timeSignature?: string;
      originalAudio?: string;
      coverUrl?: string;
    };
    project: TabProject;
    fileName?: string;
    updateTrackId?: string;
  }): Promise<TabImportSaveResult> {
    const rawProject = payload.project;
    if (
      !rawProject ||
      rawProject.format !== 'guitarmate-tab-project' ||
      !Array.isArray(rawProject.tracks)
    ) {
      throw new BadRequestException(
        'project 必须是合法的 guitarmate-tab-project 结构（请先调用 /api/tab-import/parse）。',
      );
    }

    /** 落库前补全左手指法 / 把位（已有真实标注的音符不被覆盖） */
    const fingering = deriveLeftHandFingering(rawProject, { onlyMissing: true });
    /** 落库前补全和弦（源文件已有 <harmony> 时不被覆盖） */
    const project = deriveChords(fingering.project, { onlyMissing: true }).project;

    const warnings: string[] = [];
    const rights = isPublishableRights(project.source.rights);
    if (!rights.ok) warnings.push(rights.reason || '版权状态不允许对外发布。');
    const hint = copyrightHint(project.meta.title);
    if (hint.tier === 'copyrighted') warnings.push(hint.reason);

    const tuningLabels = tuningToLabels(project.tuning);
    const license = rightsToLicense(project.source.rights);

    // ── 1. 目标曲目 ─────────────────────────────
    let scoreId = (payload.scoreId || '').trim();
    let score = scoreId ? await this.prisma.score.findUnique({ where: { id: scoreId } }) : null;

    if (scoreId && !score) {
      throw new NotFoundException(
        `找不到 Score (id=${scoreId})。请重新选择曲目，或留空 scoreId 让本接口自动创建。`,
      );
    }

    if (!score) {
      score = await this.prisma.score.create({
        data: {
          title: payload.newScore?.title || project.meta.title,
          artist: payload.newScore?.artist || project.meta.artist,
          bpm: payload.newScore?.bpm || project.meta.bpm,
          timeSignature: payload.newScore?.timeSignature || project.meta.timeSignature,
          originalAudio: payload.newScore?.originalAudio || '',
          coverUrl: payload.newScore?.coverUrl,
          status: 'draft',
          // 谱面元数据（C 端契约的 score.* 与 provenance.license 来源）
          songKey: project.meta.key,
          capo: project.capo,
          tuning: JSON.stringify(tuningLabels),
          license,
          difficulty: undefined,
        },
      });
      scoreId = score.id;
      this.logger.log(`Created score ${scoreId} from tab import: ${score.title}`);
    } else {
      // 复用已有曲目：只补空缺，不覆盖管理员手工填过的值
      const patch: Record<string, unknown> = {};
      if (!score.songKey && project.meta.key) patch.songKey = project.meta.key;
      if ((score.capo === null || score.capo === undefined) && project.capo > 0) patch.capo = project.capo;
      if (!score.tuning) patch.tuning = JSON.stringify(tuningLabels);
      if (!score.license) patch.license = license;
      if (!score.artist && project.meta.artist) patch.artist = project.meta.artist;
      if (!score.bpm) patch.bpm = project.meta.bpm;

      if (Object.keys(patch).length > 0) {
        score = await this.prisma.score.update({ where: { id: score.id }, data: patch });
      }
    }

    // ── 2. 落盘 TabProject JSON ─────────────────
    const dir = join(process.cwd(), 'uploads', 'tab-projects', scoreId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const safeName = (payload.fileName || project.meta.title || `tab_${Date.now()}`)
      .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5\-.]/g, '_')
      .replace(/\.(json|txt|tab|musicxml|xml|gpx)$/i, '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const absolutePath = join(dir, `${safeName}_${stamp}.tabproject.json`);
    writeFileSync(absolutePath, JSON.stringify(project, null, 2), 'utf-8');

    const host = process.env.APP_URL || 'http://localhost:3000';
    const projectUrl = `${host}/uploads/tab-projects/${scoreId}/${safeName}_${stamp}.tabproject.json`;

    // ── 3. Track ───────────────────────────────
    const instrument = project.meta.instrument || 'guitar';
    let track = payload.updateTrackId
      ? await this.prisma.track.findUnique({ where: { id: payload.updateTrackId } })
      : await this.prisma.track.findFirst({
          where: { scoreId, instrument },
          orderBy: { createdAt: 'asc' },
        });

    if (track && track.scoreId !== scoreId) track = null;

    if (track) {
      track = await this.prisma.track.update({
        where: { id: track.id },
        data: { jsonUrl: projectUrl },
      });
    } else {
      track = await this.prisma.track.create({
        data: {
          scoreId,
          instrument,
          audioUrl: payload.newScore?.originalAudio || '',
          jsonUrl: projectUrl,
        },
      });
    }

    const measures = projectToPublishMeasures(project);
    const noteCount = measures.reduce((sum, m) => sum + m.notes.length, 0);

    warnings.push(
      '发布前请准备音频：① 有分轨音频 → 在发布弹窗填写路径；' +
        '② 没有音频 → 保持「允许无音频发布」并选择「节拍器占位」，C 端会以节拍器 + 六线谱进行无声练习；' +
        '③ 也可以用「按标注生成对齐音频」合成一段与标注精确对齐的示范音频再发布。',
    );
    if (project.stats.approximateRhythmMeasures > 0) {
      warnings.push(
        `${project.stats.approximateRhythmMeasures} 个小节的节奏是近似值（ASCII 谱无时值信息），发布前请在后台上核对齐。`,
      );
    }

    return {
      success: true,
      scoreId,
      trackId: track.id,
      projectUrl,
      projectPath: absolutePath,
      measureCount: measures.length,
      noteCount,
      appliedMetadata: {
        songKey: score.songKey || undefined,
        capo: score.capo ?? undefined,
        tuning: tuningLabels,
        license: score.license || license,
      },
      publishPayloadTemplate: {
        scoreId,
        trackId: track.id,
        bpm: project.meta.bpm,
        timeSignature: project.meta.timeSignature,
        channel: instrument,
        measures,
        allowMissingAudio: true,
        audioFallback: 'metronome',
        note:
          '把 trackAudioPath 填成你的分轨音频（绝对路径或可访问 URL）即可发布；' +
          '若暂无音频，保持原样发布 —— 后端会为每个小节生成「节拍器占位音频」，' +
          'C 端仍可正常高亮节点做无声练习。',
      },
      warnings,
    };
  }

  /** 列出已保存的 TabProject（可按曲目过滤） */
  listProjects(scoreId?: string) {
    const root = join(process.cwd(), 'uploads', 'tab-projects');
    if (!existsSync(root)) return [];

    const out: Array<{
      scoreId: string;
      fileName: string;
      path: string;
      url: string;
      sizeBytes: number;
      modifiedAt: string;
    }> = [];

    const host = process.env.APP_URL || 'http://localhost:3000';
    const scoreDirs = scoreId ? [scoreId] : readdirSync(root);

    for (const dir of scoreDirs) {
      const full = join(root, dir);
      if (!existsSync(full) || !statSync(full).isDirectory()) continue;
      for (const file of readdirSync(full)) {
        if (!file.endsWith('.json')) continue;
        const path = join(full, file);
        const stat = statSync(path);
        out.push({
          scoreId: dir,
          fileName: file,
          path,
          url: `${host}/uploads/tab-projects/${dir}/${file}`,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  /** 读回一个已保存的 TabProject（回灌到 CMS 继续编辑） */
  loadProject(scoreId: string, fileName: string): TabProject {
    const safeName = fileName.replace(/[/\\]/g, '');
    const path = join(process.cwd(), 'uploads', 'tab-projects', scoreId, safeName);
    if (!existsSync(path)) {
      throw new NotFoundException(`找不到 TabProject 文件：${scoreId}/${safeName}`);
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as TabProject;
    } catch (err: any) {
      throw new BadRequestException(`TabProject JSON 解析失败：${err.message}`);
    }
  }
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
