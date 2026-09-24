/**
 * 音频转录流水线 —— 共享类型与常量
 * =================================
 *
 * ```
 *  上传(MP3/WAV/FLAC) ─┐
 *                      ├─► Project ─► [Demucs htdemucs_6s] ─► [Basic Pitch] ─► [Tayuya] ─► PracticePackage
 *  URL (yt-dlp)       ─┘             separate 阶段        transcribe 阶段   convert 阶段    publish 阶段
 * ```
 *
 * 设计原则（与既有 Score/Track/Measure 链路保持一致）：
 * 1. **不改动既有数据模型**：转录项目独立成 Project / TranscribeJob / TranscribeTrack / PracticePackage 四张表；
 * 2. **SQLite 约束**：没有 Json / enum，所有结构化数据以 JSON 字符串持久化；
 * 3. **可选依赖降级**：BullMQ / Redis / Python / yt-dlp 都可缺失，缺失时自动降级而不是让服务起不来；
 * 4. **与 C 端契约同源**：最终产物直接复用 `published/practice-package.types.ts` 的
 *    `PracticePackage`（schemaVersion 1.0），保证小程序端零改动即可消费。
 */

// ─────────────────────────────────────────────
// 1. 项目生命周期
// ─────────────────────────────────────────────

/**
 * Project.status —— 与需求完全对齐的 8 个状态。
 *
 * 状态推进链（失败可从任意阶段进入 `failed`，并支持再次 start 重试）：
 * `pending → downloading → separating → transcribing → converting → review → published`
 */
export type ProjectStatus =
  | 'pending'
  | 'downloading'
  | 'separating'
  | 'transcribing'
  | 'converting'
  | 'review'
  | 'published'
  | 'failed';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'pending',
  'downloading',
  'separating',
  'transcribing',
  'converting',
  'review',
  'published',
  'failed',
];

/** 状态的中文说明（CMS 直接用，避免前端再维护一份映射） */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pending: '待处理',
  downloading: '下载中',
  separating: '乐器分离中',
  transcribing: '转录中',
  converting: '生成六线谱中',
  review: '待人工复核',
  published: '已发布',
  failed: '失败',
};

export function toProjectStatus(raw?: string | null): ProjectStatus {
  const v = (raw || '').trim() as ProjectStatus;
  return PROJECT_STATUSES.includes(v) ? v : 'pending';
}

// ─────────────────────────────────────────────
// 2. 阶段与队列
// ─────────────────────────────────────────────

/**
 * 一个转录项目要经过的阶段。前 4 个是「生产」阶段（由 BullMQ 分阶段派发），
 * 后 2 个是「发布」阶段（在 PublishService 里同步执行，可单测）。
 */
export type TranscribeStage =
  | 'download'
  | 'separate'
  | 'transcribe'
  | 'convert'
  | 'slice'
  | 'publish';

/** 通过队列串行执行的生产阶段 */
export const PIPELINE_STAGES: TranscribeStage[] = [
  'download',
  'separate',
  'transcribe',
  'convert',
];

export function toStage(raw?: string | null): TranscribeStage | null {
  const v = (raw || '').trim() as TranscribeStage;
  return [...PIPELINE_STAGES, 'slice', 'publish'].includes(v) ? v : null;
}

/** 阶段 → 项目状态（CMS 轮询时会看到状态随阶段推进） */
export const STAGE_TO_PROJECT_STATUS: Record<TranscribeStage, ProjectStatus> = {
  download: 'downloading',
  separate: 'separating',
  transcribe: 'transcribing',
  convert: 'converting',
  slice: 'converting',
  publish: 'published',
};

/** 阶段 → 进度基线（0-100），阶段内可继续细调 */
export const STAGE_PROGRESS: Record<TranscribeStage, number> = {
  download: 5,
  separate: 35,
  transcribe: 65,
  convert: 85,
  slice: 92,
  publish: 100,
};

/** TranscribeJob.status */
export type JobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'skipped';

export const TERMINAL_JOB_STATUSES: JobStatus[] = ['completed', 'failed', 'skipped'];

/** 队列统计（CMS 顶栏展示「Redis 可用 / 已降级为进程内队列」） */
export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  /** bullmq = Redis 队列；in-process = 单机降级队列 */
  driver: 'bullmq' | 'in-process';
  queueName: string;
}

/** 入队时携带的载荷（会被序列化进 BullMQ，必须保持纯 JSON） */
export interface StageJobPayload {
  projectId: string;
  stage: TranscribeStage;
  /** 可选：只处理某一条乐器轨（separate 之后的阶段才有意义） */
  instrument?: StemInstrument;
  /** 人工在 ReviewPage 覆盖的元信息（BPM / 拍号 / 变调夹 / 调弦） */
  overrides?: TranscriptionOverrides;
}

export interface TranscriptionOverrides {
  bpm?: number;
  timeSignature?: string;
  capo?: number;
  /** 调弦 MIDI 数组，索引 0 = 一弦 */
  tuning?: number[];
  title?: string;
  artist?: string;
}

// ─────────────────────────────────────────────
// 3. 音频来源
// ─────────────────────────────────────────────

/** 允许上传的音频扩展名（需求：MP3 / WAV / FLAC） */
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac'] as const;

/** 各扩展名对应的 MIME 白名单（用于 base64 上传的魔数校验） */
export const AUDIO_MAGIC: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  '.wav': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }], // "RIFF"
  '.flac': [{ offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] }], // "fLaC"
  // MP3：ID3 头或 MPEG 帧同步（0xFF 0xEx/0xFx）
  '.mp3': [
    { offset: 0, bytes: [0x49, 0x44, 0x33] },
    { offset: 0, bytes: [0xff] },
  ],
};

/** 单文件上传上限（与 main.ts 的 30mb body limit 对齐，base64 后仍有余量） */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export type AudioSourceType = 'upload' | 'url';

export function isDirectMediaUrl(url: string): boolean {
  const path = (url || '').split('?')[0].toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// ─────────────────────────────────────────────
// 4. Demucs / Basic Pitch / Tayuya 的产物约定
// ─────────────────────────────────────────────

/** htdemucs_6s 的 6 条 stem（与 Python worker 输出目录名一致） */
export type StemInstrument =
  | 'vocals'
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'piano'
  | 'other';

export const STEM_INSTRUMENTS: StemInstrument[] = [
  'vocals',
  'drums',
  'bass',
  'guitar',
  'piano',
  'other',
];

/** 转录只关心这些乐器（vocals/drums 不做六线谱，仅留档） */
export const TABBED_INSTRUMENTS: StemInstrument[] = ['guitar', 'bass', 'piano', 'other'];

export function toStemInstrument(raw?: string | null): StemInstrument | null {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'guitar_lead' || v === 'guitar_rhythm' || v === 'guitar_acoustic') return 'guitar';
  if (v === 'drum') return 'drums';
  if (v === 'strings' || v === 'synth') return 'other';
  return (STEM_INSTRUMENTS as string[]).includes(v) ? (v as StemInstrument) : null;
}

export type TrackStatus =
  | 'pending'
  | 'separated'
  | 'transcribed'
  | 'converted'
  | 'failed';

/** 低于该置信度 → ReviewPage 标红，且发布前会写进 tips */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Python worker 的统一输出协议：stdout 最后一行以该前缀开头 */
export const WORKER_RESULT_PREFIX = 'GUITARMATE_RESULT ';

export interface WorkerResultBase {
  ok: boolean;
  message?: string;
}

/** separate.py 输出 */
export interface SeparateWorkerResult extends WorkerResultBase {
  model: string;
  stems: Array<{ instrument: string; path: string; durationSec?: number }>;
}

/** transcribe.py（Basic Pitch）输出 */
export interface TranscribedNote {
  id?: string;
  /** 1-6，1 = 最细的高音 E 弦 */
  string: number;
  fret: number;
  /** MIDI 音高 */
  pitch: number;
  /** 相对分轨文件起始（秒） */
  startSec: number;
  durationSec: number;
  confidence: number;
  velocity?: number;
  technique?: string;
}

export interface TranscribeWorkerResult extends WorkerResultBase {
  instrument: string;
  midiPath: string;
  noteCount: number;
  confidenceAvg: number;
  lowConfidenceCount: number;
  /** 推算 BPM（Basic Pitch 的节拍估计），可被人工覆盖 */
  bpm?: number;
  notes: TranscribedNote[];
}

/** midi_to_tab.py（Tayuya）输出 —— tabProject 即既有 TabProject 结构 */
export interface MidiToTabWorkerResult extends WorkerResultBase {
  instrument: string;
  tabProjectPath: string;
  tabProject: any;
  measureCount: number;
  noteCount: number;
  bpm: number;
  timeSignature: string;
  tuning: number[];
  warnings: string[];
}

/** 环境能力探测结果（`GET /api/transcription/capabilities`） */
export interface WorkerCapabilities {
  python: { available: boolean; bin: string; version?: string; reason?: string };
  ytDlp: { available: boolean; bin: string; reason?: string };
  demucs: { available: boolean; reason?: string };
  basicPitch: { available: boolean; reason?: string };
  tayuya: { available: boolean; reason?: string };
  ffmpeg: { available: boolean; reason?: string };
  workersDir: string;
  /** 是否允许「模拟模式」：Python 依赖缺失时用 ffmpeg 直接产出占位谱面，保证链路可跑通 */
  simulate: boolean;
}

// ─────────────────────────────────────────────
// 5. 小工具
// ─────────────────────────────────────────────

export const round4 = (n: number): number => Number((Number(n) || 0).toFixed(4));

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, Number(n) || 0));

/**
 * 归一化坐标 —— 与 TabProject / CMS / C 端契约完全一致的公式：
 * `x = relativeTime / measureDuration`，`y = (string - 1) / 5`（一弦在 y=0，最上方）。
 */
export function toNormalizedCoords(
  relativeTime: number,
  measureDuration: number,
  stringIndex: number,
): { x: number; y: number } {
  const duration = Number(measureDuration) > 0 ? Number(measureDuration) : 1;
  return {
    x: round4(clamp01(Number(relativeTime) / duration)),
    y: round4(clamp01((Number(stringIndex) - 1) / 5)),
  };
}

/**
 * 小节时长 = 拍数 × (60 / bpm) × (4 / 拍号分母)
 * ⚠️ 不要硬编码 2.4s —— 那正是历史「音频与节点不一致」问题的根源。
 */
export function measureDurationSec(
  bpm: number,
  timeSignature: string,
  beatsOverride?: number,
): number {
  const safeBpm = Number(bpm) > 0 ? Number(bpm) : 120;
  const [beatsRaw, denominatorRaw] = String(timeSignature || '4/4').split('/');
  const beats = Number(beatsOverride) || parseInt(beatsRaw, 10) || 4;
  const denominator = parseInt(denominatorRaw, 10) || 4;
  return (60 / safeBpm) * beats * (4 / denominator);
}

/** 允许的调弦音名（契约里的 tuning 为音名字符串数组） */
export const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI → 音名（例如 64 → "E4"）；与 PracticePackage 的 tuning 字段一致 */
export function midiToName(midi: number): string {
  const n = Math.round(Number(midi));
  if (!Number.isFinite(n) || n < 0) return 'E2';
  return `${MIDI_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/** 标准调弦 MIDI（索引 0 = 一弦） */
export const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
export const BASS_TUNING_MIDI = [43, 38, 33, 28];

export function defaultTuningFor(instrument: string): number[] {
  return instrument === 'bass' ? [...BASS_TUNING_MIDI] : [...STANDARD_TUNING_MIDI];
}

/** 音名数组 → MIDI 数组（解析失败返回 null） */
export function parseTuningToMidi(raw?: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) return parsed;
  } catch {
    /* 兼容 "E2 A2 D3 G3 B3 E4" 手写格式 */
  }
  const tokens = String(raw).match(/[A-Ga-g][#b]?-?\d/g);
  if (!tokens) return null;
  const semitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return tokens.map((t) => {
    const letter = t[0].toUpperCase();
    const sharp = t.includes('#') ? 1 : t.includes('b') ? -1 : 0;
    const octave = parseInt(t.replace(/[^-\d]/g, ''), 10) || 0;
    return (octave + 1) * 12 + semitone[letter] + sharp;
  });
}
