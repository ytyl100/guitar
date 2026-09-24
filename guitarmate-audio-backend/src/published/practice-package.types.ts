/**
 * PracticePackage —— 小程序端唯一数据契约（schemaVersion 1.0）
 * =========================================================
 *
 * 设计原则：**数据与资源分离**
 * JSON 只描述「什么时间、什么位置、显示什么、播放什么」，
 * 音频 / 图片资源一律用 URL 指向 CDN，不进入 JSON 本体。
 *
 * ```
 *  CMS 发布 → 后端组装 PracticePackage → GET /api/published/scores/:id/package → 小程序渲染
 * ```
 *
 * 无论上游来源是 SoloTrace 转录 / ASCII tab / Guitar Pro / MusicXML / 和弦谱 / 人工绘制，
 * 只要转换成符合本结构的数据，小程序端渲染器就能一视同仁地渲染、播放、跟随节点。
 */

/** 乐器类型（比 DB 的 channel 更宽，便于兼容外部导入的谱面） */
export type InstrumentType =
  | 'guitar_lead'
  | 'guitar_rhythm'
  | 'guitar_acoustic'
  | 'bass'
  | 'piano'
  | 'drums'
  | 'other';

/** 与小程序端渲染器约定：snake_case（与数据库 / CMS 的 kebab-case 做映射） */
export type NoteTechnique =
  | 'normal'
  | 'hammer_on'
  | 'pull_off'
  | 'slide'
  | 'bend'
  | 'vibrato'
  | 'harmonic'
  | 'palm_mute'
  | 'mute'
  | 'tap';

export interface ScoreMeta {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  bpm: number;
  /** "4/4" */
  timeSignature: string;
  /** "Bm" */
  key?: string;
  /** 变调夹品位 */
  capo?: number;
  /** 由低到高：["E2","A2","D3","G3","B3","E4"] */
  tuning: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
  coverUrl?: string;
}

export interface TrackMeta {
  id: string;
  instrument: InstrumentType;
  /** "主音吉他" */
  label: string;
  tuning: string[];
  capo?: number;
  /** 该轨在整曲中的完整音频（可选，未切片时使用） */
  fullAudioUrl?: string;
}

export interface PracticeNote {
  id: string;
  /** 1-6，1 = 最细的高音 E 弦 */
  string: number;
  /** 0-24，-1 表示不弹（闷音） */
  fret: number;
  /** MIDI 音高 */
  pitch: number;
  /** 相对小节起始（秒） */
  relativeTime: number;
  duration: number;
  /** 乐谱图片中的归一化坐标 0-1，用于叠加高亮 */
  x: number;
  y: number;
  technique?: NoteTechnique;
  /**
   * 左手指法：0 = 空弦（不按左手），1 = 食指，2 = 中指，3 = 无名指，4 = 小指。
   *
   * 为什么在契约里？
   * 真实六线谱（教材 / Guitar Pro / 官方谱）都会在品位数旁标出手指标记，
   * 否则学员只能看到「3 品」而不知道用哪根手指按。
   * 音频转录的指法由后端 `tab-import/fingering.ts` 推定，人工可在 CMS 复核改写。
   * 缺失（undefined）时小程序不画手指标记。
   */
  finger?: number;
  /**
   * 该音符生效的**手位**（= 食指按第几品）。
   *
   * 小程序端谱面的弦线上写的是**手指号**，品位靠 `fret = position + finger − 1` 反推；
   * 当它与 `Measure.position` 不同时，表示这一段是小节内换把，
   * 谱面会在该处多印一个小号「N把位」标记。缺失时回退到小节把位。
   */
  position?: number;
  /** 人工录入为 1.0；转录草稿 < 0.6 需复核 */
  confidence: number;
}

export interface PracticeChordMarker {
  id: string;
  /** "Bm" | "F#7" | "Cadd9" */
  chordName: string;
  /** 相对小节起始（秒） */
  startTime: number;
  duration: number;
  x: number;
  y: number;
  /** 指法图数据，小程序可直接渲染；-1 = 闷弦 */
  voicing?: number[];
}

export interface PracticeBarreMarker {
  id: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

/** 无音频时的节拍器配置（小程序端用 Web Audio 合成，时钟驱动与音频一致） */
export interface MetronomeConfig {
  enabled: boolean;
  bpm: number;
  beatsPerMeasure: number;
  accentFirstBeat: boolean;
}

export interface MeasureTrackData {
  trackId: string;
  instrument: InstrumentType;
  /** 该小节的切片音频 URL；为 null 时小程序改用 metronome 配置驱动时钟 */
  audioUrl: string | null;
  /** 原声（全轨混音）切片 —— C 端 Original 模式播放；为空回退到 audioUrl */
  originalAudioUrl?: string | null;
  metronome?: MetronomeConfig;
  /** 六线谱图片（SVG/PNG）URL；为空时小程序走矢量渲染 */
  tabImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  notes: PracticeNote[];
}

export interface PracticeMeasure {
  id: string;
  /** 从 1 开始 */
  index: number;
  label: string;
  /** "intro" | "verse" | "chorus" | "solo" | "outro" */
  section?: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  /**
   * 本小节把位：`P` = 第 P 把位（食指按第 P 品）。
   * 谱面上传统写法是罗马数字（Ⅰ / Ⅱ / Ⅲ …），小程序在谱面开头渲染该标记。
   */
  position?: number;
  trackData: MeasureTrackData[];
  chords: PracticeChordMarker[];
  barres: PracticeBarreMarker[];
  tips?: string[];
}

export interface AssetManifest {
  /** CDN 基址，前端拼接相对路径时使用 */
  cdnBase: string;
  /** 原曲音频（整曲模式） */
  originalAudioUrl?: string;
  audioFormat: 'mp3' | 'wav' | 'm4a';
  audioBitrate?: number;
}

export interface Provenance {
  source:
    | 'solotrace'
    | 'ascii_tab'
    | 'guitar_pro'
    | 'musicxml'
    | 'chord_sheet'
    | 'manual'
    | 'mixed';
  sourceDetail?: string;
  copyright?: string;
  license: 'public_domain' | 'cc_by' | 'authorized' | 'user_uploaded';
  /** 人工校正程度 0-1 */
  humanReviewLevel: number;
}

/** 顶层包：一首曲目的完整练习数据 */
export interface PracticePackage {
  /** 协议版本，用于小程序端兼容性判断 */
  schemaVersion: '1.0';
  score: ScoreMeta;
  tracks: TrackMeta[];
  measures: PracticeMeasure[];
  assets: AssetManifest;
  provenance: Provenance;
  /** ISO8601 */
  publishedAt: string;
  publishedBy: string;
}

/** 小程序端需要支持的最小版本白名单 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0'] as const;

/** 标准调弦（由低到高 → 便于直接展示） */
export const DEFAULT_TUNING_6: string[] = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
export const DEFAULT_TUNING_BASS4: string[] = ['E1', 'A1', 'D2', 'G2'];

/**
 * 解析 Score.tuning（SQLite 里存的是 JSON 字符串）→ 音名数组。
 * 非法 / 空值返回 null，由调用方决定回退到默认调弦。
 */
export function parseTuningString(raw?: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 4 && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[];
    }
  } catch {
    // 兼容「E A D G B E」这种手写格式
    const tokens = raw.match(/[A-Ga-g][#b]?\d/g);
    if (tokens && tokens.length >= 4) return tokens.map((t) => t.toUpperCase());
  }
  return null;
}

/** 合法授权状态（与 PracticePackage.provenance.license 一致） */
export const LICENSE_VALUES: string[] = [
  'public_domain',
  'cc_by',
  'authorized',
  'user_uploaded',
];

export function toLicense(raw?: string | null): 'public_domain' | 'cc_by' | 'authorized' | 'user_uploaded' {
  const v = (raw || '').trim().toLowerCase();
  return (LICENSE_VALUES.includes(v) ? v : 'user_uploaded') as
    | 'public_domain'
    | 'cc_by'
    | 'authorized'
    | 'user_uploaded';
}

/** DB / CMS 的 kebab-case technique → 契约的 snake_case */
export const TECHNIQUE_TO_CONTRACT: Record<string, NoteTechnique> = {
  normal: 'normal',
  'hammer-on': 'hammer_on',
  hammer_on: 'hammer_on',
  'pull-off': 'pull_off',
  pull_off: 'pull_off',
  slide: 'slide',
  bend: 'bend',
  vibrato: 'vibrato',
  harmonic: 'harmonic',
  'palm-mute': 'palm_mute',
  palm_mute: 'palm_mute',
  mute: 'mute',
  'dead-note': 'mute',
  dead_note: 'mute',
  tap: 'tap',
};

/** DB channel / Track.instrument → 契约的 InstrumentType */
export function toInstrumentType(raw?: string | null): InstrumentType {
  const v = (raw || '').trim().toLowerCase();
  switch (v) {
    case 'guitar_lead':
      return 'guitar_lead';
    case 'guitar_rhythm':
      return 'guitar_rhythm';
    case 'bass':
      return 'bass';
    case 'piano':
      return 'piano';
    case 'drums':
    case 'drum':
      return 'drums';
    case 'guitar':
    case 'guitar_acoustic':
    case 'acoustic_guitar':
      return 'guitar_acoustic';
    default:
      return 'other';
  }
}

export function toTechnique(raw?: string | null): NoteTechnique | undefined {
  if (!raw) return undefined;
  return TECHNIQUE_TO_CONTRACT[String(raw).trim().toLowerCase()] || 'normal';
}
