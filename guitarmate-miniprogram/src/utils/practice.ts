/**
 * PracticePackage 契约类型 + 纯函数
 * =================================
 *
 * 契约与后端 `guitarmate-audio-backend/src/published/practice-package.types.ts`、
 * Web 版 `guitarmate-frontend/src/practicePackage.ts` 是**同一份**（schemaVersion 1.0）。
 * 这里只声明小程序用到的那部分（不引 zod 之类的校验库，省体积）。
 */

export interface PracticeNote {
  id: string;
  /** 1-6，1 = 最细高音弦 */
  string: number;
  fret: number;
  midi?: number;
  /** 相对**本小节起点**的秒数 */
  relativeTime: number;
  duration: number;
  confidence?: number;
  velocity?: number;
  finger?: number;
  position?: number;
  technique?: string;
  /** 归一化时间比例（0-1）；**不要直接拿它当像素坐标**，见 services/api.ts 的说明 */
  x?: number;
  /** 归一化弦位比例 (string-1)/5 */
  y?: number;
}

export interface MeasureTrackData {
  trackId: string;
  /** 契约里的乐器名（如 `guitar_acoustic`） */
  instrument: string;
  /** 练习声道（切片后的单个小节音频） */
  audioUrl: string | null;
  /** 原声全轨（含鼓/贝斯等的混音切片）；与 audioUrl 可能相同 */
  originalAudioUrl: string | null;
  /** 服务端渲染的谱面图（当前链路不用，改由 tab.png 动态出图） */
  tabImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  notes: PracticeNote[];
}

export interface PracticeChordMarker {
  id: string;
  chordName: string;
  startTime: number;
  duration: number;
}

export interface PracticeBarreMarker {
  id: string;
  fret: number;
  /** 6 = 最粗低音弦 */
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
}

export interface PracticeMeasure {
  id: string;
  /** 从 1 开始 */
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  /** 本节把位（第 P 把位） */
  position?: number;
  trackData: MeasureTrackData[];
  chords: PracticeChordMarker[];
  barres: PracticeBarreMarker[];
  tips?: string[];
}

export interface ScoreMeta {
  id: string;
  title: string;
  artist?: string | null;
  bpm: number;
  timeSignature: string;
  capo: number;
  tuning?: string[];
  difficulty?: number;
}

export interface TrackMeta {
  id: string;
  instrument: string;
  label: string;
}

export interface PracticePackage {
  schemaVersion: '1.0';
  score: ScoreMeta;
  tracks: TrackMeta[];
  measures: PracticeMeasure[];
  publishedAt: string;
  publishedBy: string;
}

/**
 * 按 index 去重（**发布是 append-only**，历史数据里同一小节可能重复：
 * 实测 Canon in D 有 8 个 index ×2）。保留第一条，与 Web 版同一口径。
 */
export function dedupeMeasuresByIndex(measures: PracticeMeasure[]): PracticeMeasure[] {
  const seen = new Set<number>();
  const out: PracticeMeasure[] = [];
  for (const m of measures || []) {
    if (seen.has(m.index)) continue;
    seen.add(m.index);
    out.push(m);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** 找到练习音轨的下标（优先吉他） */
export function pickTrackIndex(pkg: PracticePackage): number {
  const guitar = pkg.tracks.findIndex((t) => String(t.instrument || '').includes('guitar'));
  return guitar >= 0 ? guitar : 0;
}

export function trackDataOf(measure: PracticeMeasure, trackIndex: number): MeasureTrackData | undefined {
  return measure.trackData?.[trackIndex] ?? measure.trackData?.[0];
}

export interface Segment {
  /** 段序号（0 起） */
  slot: number;
  measures: PracticeMeasure[];
  from: number;
  label: string;
}

/** 把曲目按「每段 N 小节」切段（与 Web 版 MeasurePracticePanel 同逻辑） */
export function splitSegments(measures: PracticeMeasure[], perSegment: number): Segment[] {
  const size = Math.max(1, Math.min(3, perSegment));
  const out: Segment[] = [];
  for (let i = 0; i < measures.length; i += size) {
    const chunk = measures.slice(i, i + size);
    if (!chunk.length) continue;
    out.push({
      slot: out.length,
      measures: chunk,
      from: chunk[0].index,
      label: segmentLabel(chunk),
    });
  }
  return out;
}

/** 「第 3–4 小节」/ 单小节时「第 25 小节」 */
export function segmentLabel(measures: PracticeMeasure[]): string {
  if (!measures.length) return '';
  const first = measures[0].index;
  const last = measures[measures.length - 1].index;
  return first === last ? `第 ${first} 小节` : `第 ${first}–${last} 小节`;
}

/** 秒 → `3:25` */
export function formatSec(sec: number): string {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 曲目总时长（小节时长求和，比用 bpm 推更可靠：转录链路 bpm 常为 null） */
export function totalDurationSec(measures: PracticeMeasure[]): number {
  return measures.reduce((sum, m) => sum + (Number(m.duration) || 0), 0);
}
