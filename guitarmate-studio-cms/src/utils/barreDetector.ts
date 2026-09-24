import type { TabNote } from '../types';

/**
 * 横按 (Barre) 标记 — 与后端 Prisma `Barre` 模型对齐
 */
export interface DetectedBarre {
  id: string;
  instrument: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  /** 归一化横坐标 (0-1)，基于小节时长推算 */
  x: number;
  /** 归一化纵坐标 (0-1)，基于弦位推算 */
  y: number;
}

export interface DetectedChordMarker {
  id: string;
  instrument: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface BarreDetectOptions {
  /** 同音时间容差（毫秒），默认 30ms */
  toleranceMs?: number;
  /** 小节起始时间（秒），用于把绝对时间换算成 relativeTime */
  measureStartTime?: number;
  /** 小节时长（秒），用于归一化 X 坐标 */
  measureDuration?: number;
  instrument?: string;
}

/** 将音符时间归一化到 0-1 区间 */
const normalizeX = (absTimeSec: number, start: number, duration: number): number => {
  if (!duration || duration <= 0) return 0;
  const ratio = (absTimeSec - start) / duration;
  return Math.max(0, Math.min(1, Number(ratio.toFixed(4))));
};

/** 将弦位 (1=最细高音E, 6=最粗低音E) 归一化到 0-1 (1弦在最上方 -> y 最小) */
const normalizeY = (stringIndex: number): number =>
  Number((((stringIndex - 1) / 5) || 0).toFixed(4));

/**
 * 横按自动检测
 *
 * 算法：按 audioTime (timestampSec) 以 30ms 容差分组成"同时发声的和弦簇"，
 * 在每组内按品位二次分组，若同一品位覆盖连续多根弦 (>=2 且弦号连续)，
 * 则判定为一次横按。
 */
export function detectBarres(
  notes: Pick<TabNote, 'stringIndex' | 'fret' | 'timestampSec' | 'durationSec'>[],
  options: BarreDetectOptions = {},
): DetectedBarre[] {
  const {
    toleranceMs = 30,
    measureStartTime = 0,
    measureDuration,
    instrument = 'guitar',
  } = options;

  if (!notes || notes.length === 0) return [];

  // 1. 按 30ms 容差把同时发声音符聚成簇
  const groups = new Map<number, typeof notes>();
  const bucketSizeSec = toleranceMs / 1000;

  for (const n of notes) {
    // 仅接受数字品位（'X' / 'h' 等技巧标记不参与横按判定）
    if (typeof n.fret !== 'number') continue;
    const key = Math.round(n.timestampSec / bucketSizeSec);
    const bucket = groups.get(key) || [];
    bucket.push(n);
    groups.set(key, bucket);
  }

  const barres: DetectedBarre[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // 2. 簇内按品位再分组
    const byFret = new Map<number, typeof group>();
    for (const n of group) {
      const fret = n.fret as number;
      const list = byFret.get(fret) || [];
      list.push(n);
      byFret.set(fret, list);
    }

    for (const [fret, sameFret] of byFret.entries()) {
      if (sameFret.length < 2) continue;

      // 3. 弦号必须连续 (例如 1-2-3-4-5-6)
      const strings = Array.from(new Set(sameFret.map((n) => n.stringIndex))).sort(
        (a, b) => a - b,
      );
      let consecutive = true;
      for (let i = 1; i < strings.length; i++) {
        if (strings[i] - strings[i - 1] !== 1) {
          consecutive = false;
          break;
        }
      }
      if (!consecutive) continue;

      const startAbs = Math.min(...sameFret.map((n) => n.timestampSec));
      const endAbs = Math.max(
        ...sameFret.map((n) => n.timestampSec + (n.durationSec || 0)),
      );
      const fromString = strings[0];
      const toString = strings[strings.length - 1];
      const midString = (fromString + toString) / 2;

      barres.push({
        id: `barre_${fret}_${fromString}_${toString}_${Math.round(startAbs * 1000)}`,
        instrument,
        fret,
        fromString,
        toString,
        startTime: Number((startAbs - measureStartTime).toFixed(4)),
        duration: Number(Math.max(0.05, endAbs - startAbs).toFixed(4)),
        x: normalizeX(startAbs, measureStartTime, measureDuration ?? 0),
        y: normalizeY(midString),
      });
    }
  }

  return barres.sort((a, b) => a.startTime - b.startTime);
}

/**
 * 从音符的和弦标记中提取和弦标注 (ChordMarker)
 * 坐标使用归一化 X (按时间) 与固定 Y (谱面上方 ~0.06)
 */
export function extractChordMarkers(
  notes: Pick<TabNote, 'chordName' | 'timestampSec' | 'durationSec'>[],
  options: BarreDetectOptions = {},
): DetectedChordMarker[] {
  const {
    measureStartTime = 0,
    measureDuration,
    instrument = 'guitar',
  } = options;
  if (!notes || notes.length === 0) return [];

  const markers: DetectedChordMarker[] = [];
  for (const n of notes) {
    if (!n.chordName) continue;
    // 相同和弦名 + 时间接近（<0.2s）视为同一标记，避免重复
    const duplicated = markers.some(
      (m) =>
        m.chordName === n.chordName &&
        Math.abs(m.startTime + measureStartTime - n.timestampSec) < 0.2,
    );
    if (duplicated) continue;

    markers.push({
      id: `chord_${n.chordName}_${Math.round(n.timestampSec * 1000)}`,
      instrument,
      chordName: n.chordName,
      startTime: Number((n.timestampSec - measureStartTime).toFixed(4)),
      duration: Number(Math.max(0.1, n.durationSec || 0.5).toFixed(4)),
      x: normalizeX(n.timestampSec, measureStartTime, measureDuration ?? 0),
      y: 0.06,
    });
  }

  return markers.sort((a, b) => a.startTime - b.startTime);
}

/**
 * 按小节把音符切片，并生成可直接提交后端 /api/measures/publish 的小节数组
 */
export function sliceNotesByMeasures<T extends { timestampSec: number; durationSec: number }>(
  notes: T[],
  measureTimestamps: number[],
  audioDurationSec: number,
): Array<{ index: number; label: string; startTime: number; endTime: number; notes: T[] }> {
  if (!measureTimestamps || measureTimestamps.length === 0) return [];

  const sorted = [...measureTimestamps].sort((a, b) => a - b);
  return sorted.map((startTime, idx) => {
    const endTime = idx + 1 < sorted.length ? sorted[idx + 1] : audioDurationSec;
    return {
      index: idx + 1,
      label: `第 ${idx + 1} 小节`,
      startTime,
      endTime,
      notes: notes.filter((n) => n.timestampSec >= startTime && n.timestampSec < endTime),
    };
  });
}
