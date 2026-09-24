import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeasuresService } from '../measures/measures.service';
import {
  DEFAULT_TUNING_6,
  DEFAULT_TUNING_BASS4,
  parseTuningString,
  toLicense,
  type AssetManifest,
  type InstrumentType,
  type MeasureTrackData,
  type PracticeBarreMarker,
  type PracticeChordMarker,
  type PracticeMeasure,
  type PracticeNote,
  type PracticePackage,
  type Provenance,
  type ScoreMeta,
  type TrackMeta,
  toInstrumentType,
  toTechnique,
} from './practice-package.types';

const INSTRUMENT_LABELS: Record<InstrumentType, string> = {
  guitar_lead: '主音吉他',
  guitar_rhythm: '节奏吉他',
  guitar_acoustic: '原声吉他',
  bass: '贝斯',
  piano: '钢琴',
  drums: '鼓',
  other: '其他',
};

/** 段落中文 / 英文 → 契约里的 section 枚举 */
const SECTION_MAP: Array<{ test: RegExp; value: string }> = [
  { test: /前奏|intro/i, value: 'intro' },
  { test: /主歌|verse/i, value: 'verse' },
  { test: /(预)?副歌|pre-?chorus|chorus/i, value: 'chorus' },
  { test: /间奏|过门|bridge|interlude|riff/i, value: 'bridge' },
  { test: /独奏|solo|华彩/i, value: 'solo' },
  { test: /尾奏|结束|outro|ending|coda/i, value: 'outro' },
];

/** 种子数据里的占位地址（永远不可达），不应当成真实资源下发给 C 端 */
const PLACEHOLDER_URL = /(^|\/\/)(cdn\.example\.com|example\.com)/i;

const isUsableUrl = (url?: string | null): boolean =>
  !!url && url.trim().length > 0 && !PLACEHOLDER_URL.test(url);

const audioFormatOf = (url?: string | null): 'mp3' | 'wav' | 'm4a' => {
  const path = (url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.wav')) return 'wav';
  if (path.endsWith('.m4a') || path.endsWith('.aac')) return 'm4a';
  return 'mp3';
};

const toTuningLabels = (instrument: InstrumentType): string[] =>
  instrument === 'bass' ? [...DEFAULT_TUNING_BASS4] : [...DEFAULT_TUNING_6];

/** 优先用曲目存库的调弦；没有则按乐器推默认值 */
const resolveTuning = (scoreTuning?: string | null, instrument: InstrumentType = 'guitar_acoustic'): string[] =>
  parseTuningString(scoreTuning) || toTuningLabels(instrument);

const toSection = (label?: string | null): string | undefined => {
  const text = label || '';
  for (const entry of SECTION_MAP) {
    if (entry.test.test(text)) return entry.value;
  }
  return undefined;
};

/**
 * 规范化左手指法：0 = 空弦，1-4 = 食指…小指。
 * 非数字 / 超范围 → undefined（表示「未指定」，契约里不下发，C 端不画标记）。
 */
const normalizeFinger = (raw: unknown): number | undefined => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 4) return undefined;
  return rounded;
};

/**
 * 规范化把位：1-24（第 P 把位 = 食指按第 P 品）。
 * ⚠️ 不能复用 `normalizeFinger` —— 把位可以到 12 品以上，手指只有 1-4。
 */
const normalizePosition = (raw: unknown): number | undefined => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 24) return undefined;
  return rounded;
};

/**
 * 和弦指法图：SQLite 里存 JSON 字符串；也可能已经是数组（内存构造时）。
 * 校验 6 个数字元素（-1 = 闷弦），否则不下发。
 */
const parseVoicing = (raw: unknown): number[] | undefined => {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  const nums = value.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n) || n < -1 || n > 24)) return undefined;
  return nums;
};

/**
 * PracticePackage 组装服务
 * ========================
 *
 * 把 SQLite 里的 Score / Track / Measure / MeasureTrack / Barre / ChordMarker
 * 组装成小程序端唯一数据契约 `PracticePackage`。
 *
 * 关键约定：
 * 1. **不含音频二进制**，只有 URL + 时间戳；
 * 2. 小节音频拿不到时，输出 `audioUrl: null` + `metronome` 配置 ——
 *    小程序改用节拍器时钟驱动，渲染逻辑完全不变（时间源可切换）；
 * 3. `x` / `y` 归一化坐标若缺失，按 `relativeTime / duration` 与 `(string-1)/5` 兜底推算；
 * 4. 输出前保持小节按 index 升序、音符按 relativeTime 升序 ——
 *    小程序的「当前节点」判定依赖这个顺序。
 */
@Injectable()
export class PracticePackageService {
  private readonly logger = new Logger(PracticePackageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly measures: MeasuresService,
  ) {}

  async build(scoreId: string, publishedBy = 'cms'): Promise<PracticePackage> {
    const score = await this.prisma.score.findUnique({
      where: { id: scoreId },
      include: { tracks: true },
    });
    if (!score) {
      throw new NotFoundException(`Score with ID '${scoreId}' not found`);
    }

    const rawMeasures = await this.measures.findByScore(scoreId);
    if (rawMeasures.length === 0) {
      this.logger.warn(`Score ${scoreId} has no published measures — returning an empty PracticePackage.`);
    }

    const trackById = new Map(score.tracks.map((t) => [t.id, t]));

    // ── tracks ────────────────────────────────
    const primaryInstrumentRaw = toInstrumentType(score.tracks[0]?.instrument);
    const resolvedTuning = resolveTuning(score.tuning, primaryInstrumentRaw);
    const resolvedCapo = Number(score.capo) > 0 ? Number(score.capo) : 0;

    const tracks: TrackMeta[] = score.tracks.map((t) => {
      const instrument = toInstrumentType(t.instrument);
      return {
        id: t.id,
        instrument,
        label: INSTRUMENT_LABELS[instrument],
        tuning: resolveTuning(score.tuning, instrument),
        capo: resolvedCapo,
        fullAudioUrl: isUsableUrl(t.audioUrl) ? t.audioUrl : undefined,
      };
    });

    const primaryInstrument = tracks[0]?.instrument || 'guitar_acoustic';
    const bpm = score.bpm || rawMeasures[0]?.bpm || 80;

    // ── measures ──────────────────────────────
    const measures: PracticeMeasure[] = rawMeasures.map((m, idx) => {
      const duration = m.duration > 0 ? m.duration : Math.max(0, m.endTime - m.startTime);
      const beatsPerMeasure = Math.max(
        1,
        parseInt((m.timeSignature || score.timeSignature || '4/4').split('/')[0], 10) || 4,
      );

      const trackData: MeasureTrackData[] = (m.trackData || []).map((mt) => {
        const parentTrack = trackById.get(mt.trackId);
        const instrument = toInstrumentType(mt.channel || parentTrack?.instrument);
        const audioUrl = isUsableUrl(mt.audioUrl) ? mt.audioUrl : null;
        const originalAudioUrl = isUsableUrl(mt.originalAudioUrl) ? mt.originalAudioUrl : null;

        const notes: PracticeNote[] = (mt.notes || [])
          .map((n: any, i: number): PracticeNote => {
            const relativeTime = Number(n.relativeTime ?? 0);
            const stringIndex = Number(n.string ?? 1);
            // x / y 兜底：种子或外部导入的谱面可能没写归一化坐标
            const x =
              Number(n.x) > 0 || relativeTime <= 0
                ? Number(n.x ?? 0)
                : Number((duration > 0 ? relativeTime / duration : 0).toFixed(4));
            const y =
              Number(n.y) > 0 || stringIndex <= 1
                ? Number(n.y ?? 0)
                : Number(((stringIndex - 1) / 5).toFixed(4));

            return {
              id: n.id || `n_${m.index}_${i}`,
              string: stringIndex,
              fret: Number.isFinite(Number(n.fret)) ? Number(n.fret) : -1,
              pitch: Number(n.pitch ?? 0),
              relativeTime,
              duration: Number(n.duration ?? 0.5),
              x,
              y,
              technique: toTechnique(n.technique),
              /** 左手指法（0 = 空弦，1-4 = 食指…小指）；未推定/未标注明不画 */
              finger: normalizeFinger(n.finger),
              /** 该音生效的手位（小节内换把时与小节把位不同） */
              position: normalizePosition(n.position),
              confidence: Number.isFinite(Number(n.confidence)) ? Number(n.confidence) : 1,
            };
          })
          .sort((a, b) => a.relativeTime - b.relativeTime || a.string - b.string);

        return {
          trackId: mt.trackId,
          instrument,
          audioUrl,
          originalAudioUrl,
          /**
           * 始终下发节拍器配置：
           * - 没音频 → `enabled: true`（节拍器就是主时间源）
           * - 有音频 → `enabled: false`，但配置仍在，客户端在音频 404/加载失败时
           *   可以立刻切到节拍器而不必等后端改数据（C 端「永不静音」降级）
           */
          metronome: {
            enabled: !audioUrl,
            bpm: m.bpm || bpm,
            beatsPerMeasure,
            accentFirstBeat: true,
          },
          tabImageUrl: isUsableUrl(mt.tabImageUrl) ? mt.tabImageUrl : '',
          imageWidth: mt.imageWidth || 1200,
          imageHeight: mt.imageHeight || 300,
          notes,
        };
      });

      const chords: PracticeChordMarker[] = (m.chords || []).map((c: any, i: number) => ({
        id: c.id || `chord_${m.index}_${i}`,
        chordName: c.chordName,
        startTime: Number(c.startTime ?? 0),
        duration: Number(c.duration ?? 0),
        x: Number(c.x ?? 0),
        y: Number(c.y ?? 0),
        /** 指法图：SQLite 里是 JSON 字符串 → 反序列化后下发；为空则不画和弦图 */
        voicing: parseVoicing(c.voicing),
      }));

      const barres: PracticeBarreMarker[] = (m.barres || []).map((b: any, i: number) => ({
        id: b.id || `barre_${m.index}_${i}`,
        fret: Number(b.fret ?? 0),
        fromString: Number(b.fromString ?? 1),
        toString: Number(b.toString ?? 6),
        startTime: Number(b.startTime ?? 0),
        duration: Number(b.duration ?? 0),
        x: Number(b.x ?? 0),
        y: Number(b.y ?? 0),
      }));

      const tips: string[] = [];
      const lowConfidence = trackData
        .flatMap((td) => td.notes)
        .filter((n) => n.confidence < 0.6).length;
      if (lowConfidence > 0) {
        tips.push(`本小节有 ${lowConfidence} 个低置信度音符（转录草稿），练习时以谱面为准。`);
      }
      if (trackData.some((td) => !td.audioUrl)) {
        tips.push('本小节暂无音频，使用节拍器模式练习。');
      }

      return {
        id: m.id,
        index: Number.isFinite(m.index) && m.index > 0 ? m.index : idx + 1,
        label: m.label || `第 ${idx + 1} 小节`,
        section: toSection(m.label),
        startTime: Number(m.startTime ?? 0),
        endTime: Number(m.endTime ?? 0),
        duration,
        bpm: m.bpm || bpm,
        timeSignature: m.timeSignature || score.timeSignature || '4/4',
        /** 小节把位（第 P 把位）→ C 端渲染罗马数字标记 */
        position: normalizePosition(m.position),
        trackData,
        chords,
        barres,
        tips: tips.length > 0 ? tips : undefined,
      };
    });

    measures.sort((a, b) => a.index - b.index);

    // ── assets ────────────────────────────────
    const originalAudio = isUsableUrl(score.originalAudio) ? score.originalAudio : undefined;
    const assets: AssetManifest = {
      cdnBase: this.cdnBaseOf(originalAudio || tracks[0]?.fullAudioUrl),
      originalAudioUrl: originalAudio,
      audioFormat: audioFormatOf(originalAudio || measures[0]?.trackData[0]?.audioUrl),
      audioBitrate: 192,
    };

    // ── provenance ────────────────────────────
    const allNotes = measures.flatMap((m) => m.trackData.flatMap((td) => td.notes));
    const reviewed = allNotes.filter((n) => n.confidence >= 0.6).length;
    const humanReviewLevel = allNotes.length > 0 ? Number((reviewed / allNotes.length).toFixed(2)) : 1;
    const hasTranscription = score.tracks.some((t) => /transcriptions?\//i.test(t.jsonUrl || ''));
    const provenance: Provenance = {
      source: hasTranscription ? 'solotrace' : 'manual',
      sourceDetail: score.tracks
        .map((t) => `${t.instrument}${t.jsonUrl ? ` ← ${t.jsonUrl}` : ''}`)
        .join(' | '),
      license: toLicense(score.license),
      humanReviewLevel,
    };

    const scoreMeta: ScoreMeta = {
      id: score.id,
      title: score.title,
      artist: score.artist || undefined,
      bpm,
      timeSignature: score.timeSignature || '4/4',
      key: score.songKey || undefined,
      tuning: resolvedTuning,
      capo: resolvedCapo,
      difficulty: this.normalizeDifficulty(score.difficulty, allNotes),
      coverUrl: isUsableUrl(score.coverUrl) ? score.coverUrl || undefined : undefined,
    };

    return {
      schemaVersion: '1.0',
      score: scoreMeta,
      tracks,
      measures,
      assets,
      provenance,
      publishedAt: new Date().toISOString(),
      publishedBy,
    };
  }

  /** 由资源 URL 推导 CDN 基址（协议 + 域名） */
  private cdnBaseOf(url?: string): string {
    if (url) {
      const m = url.match(/^(https?:\/\/[^/]+)/i);
      if (m) return m[1];
    }
    return process.env.APP_URL || 'http://localhost:3000';
  }

  /** 人工标注的难度优先；未标注时按最高品位与横按密度启发式推导 */
  private normalizeDifficulty(
    stored: number | null | undefined,
    notes: PracticeNote[],
  ): 1 | 2 | 3 | 4 | 5 {
    const v = Number(stored);
    if (Number.isFinite(v) && v >= 1 && v <= 5) return Math.round(v) as 1 | 2 | 3 | 4 | 5;
    return this.inferDifficulty(notes);
  }

  /** 粗略难度：按最高品位与音符密度（给小程序端展示用，可被 CMS 覆盖） */
  private inferDifficulty(notes: PracticeNote[]): 1 | 2 | 3 | 4 | 5 {
    if (notes.length === 0) return 1;
    const maxFret = notes.reduce((max, n) => Math.max(max, n.fret), 0);
    const barres = notes.filter((n) => n.fret >= 2).length / notes.length;
    if (maxFret >= 12 || barres > 0.5) return 4;
    if (maxFret >= 8) return 3;
    if (maxFret >= 5) return 2;
    return 1;
  }
}
