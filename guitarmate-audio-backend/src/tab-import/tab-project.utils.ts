/**
 * TabProject 通用工具：调弦换算 / 和弦把位库 / 时间轴 / 横按检测 / 发布结构转换
 *
 * 这一层是「格式无关」的：无论谱子来自 ASCII tab、MusicXML 还是 Guitar Pro，
 * 最终都变成同一套 `{ string, fret, midi, beat, offsetSec }` 音符。
 */

import type {
  PublishReadyMeasure,
  RightsStatus,
  TabInstrument,
  TabProject,
  TabProjectChord,
  TabProjectMeasure,
  TabProjectNote,
  TabProjectStats,
  TabTechnique,
  TabProjectWarning,
} from './tab-project.types';

export const PARSER_VERSION = '1.0.0';

// ─────────────────────────────────────────────
// 调弦
// ─────────────────────────────────────────────

/** 标准调弦 EADGBE 的 MIDI 音高，索引 0 = 一弦（高音 E4=64） */
export const STANDARD_TUNING: number[] = [64, 59, 55, 50, 45, 40];

/** 音名（由低到高）↔ MIDI，用于读写 Score.tuning */
export const TUNING_PRESETS: Record<string, number[]> = {
  standard: STANDARD_TUNING,
  dropD: [64, 59, 55, 50, 45, 38], // D A D G B E
  halfStepDown: [63, 58, 54, 49, 44, 39], // Eb
  fullStepDown: [62, 57, 53, 48, 43, 38], // D G C F A D
  dadgad: [64, 59, 57, 50, 45, 38],
  bass4: [43, 38, 33, 28],
  bass5: [43, 38, 33, 28, 23],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export function noteNameToPitchClass(name: string): number | null {
  const cleaned = name.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (PITCH_CLASS[cleaned] !== undefined) return PITCH_CLASS[cleaned];
  const m = cleaned.match(/^([A-G][#b]?)/);
  return m ? PITCH_CLASS[m[1]] ?? null : null;
}

/** MIDI → 音名（含八度），例如 64 → E4 */
export function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** 由空弦 + 品位 + 变调夹计算 MIDI */
export function fretToMidi(stringIndex: number, fret: number, tuning: number[], capo = 0): number {
  const open = tuning[Math.max(0, Math.round(stringIndex) - 1)];
  if (open === undefined) return 0;
  return open + Math.max(0, Math.round(fret)) + Math.max(0, Math.round(capo));
}

/**
 * 由 MIDI 反推最合理的弦/品（源文件只给音高时用）。
 * 策略：品位最低优先（低把位符合教材习惯），同品位时取更粗的弦。
 */
export function inferStringFret(
  midi: number,
  tuning: number[] = STANDARD_TUNING,
  capo = 0,
): { string: number; fret: number } {
  let best: { string: number; fret: number } | null = null;
  for (let s = 1; s <= tuning.length; s++) {
    const fret = midi - tuning[s - 1] - capo;
    if (fret < 0 || fret > 24) continue;
    if (!best || fret < best.fret || (fret === best.fret && s > best.string)) {
      best = { string: s, fret };
    }
  }
  if (best) return best;
  const lowest = tuning[tuning.length - 1] + capo;
  return { string: tuning.length, fret: Math.max(0, Math.min(24, midi - lowest)) };
}

/** MIDI 数组 → 音名数组（由低到高），用于写入 Score.tuning */
export function tuningToLabels(tuning: number[]): string[] {
  return [...tuning].reverse().map(midiToNoteName);
}

// ─────────────────────────────────────────────
// 和弦把位库
// ─────────────────────────────────────────────

/**
 * 常用和弦把位（人类制谱习惯记法）。
 * 6 个元素，索引 0 = 六弦（低音 E）→ 索引 5 = 一弦（高音 E）；数字 = 品位，'x' = 闷弦。
 */
export const CHORD_VOICINGS: Record<string, Array<number | 'x'>> = {
  C: ['x', 3, 2, 0, 1, 0],
  D: ['x', 'x', 0, 2, 3, 2],
  E: [0, 2, 2, 1, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  G: [3, 2, 0, 0, 0, 3],
  A: ['x', 0, 2, 2, 2, 0],
  B: ['x', 2, 4, 4, 4, 2],
  Bb: ['x', 1, 3, 3, 3, 1],
  'F#': [2, 4, 4, 3, 2, 2],
  Eb: ['x', 6, 5, 3, 4, 3],
  Ab: [4, 6, 6, 5, 4, 4],
  Db: ['x', 4, 6, 6, 6, 4],
  'C#': ['x', 4, 6, 6, 6, 4],
  Gb: [2, 4, 4, 3, 2, 2],
  Am: ['x', 0, 2, 2, 1, 0],
  Bm: ['x', 2, 4, 4, 3, 2],
  Cm: ['x', 3, 5, 5, 4, 3],
  Dm: ['x', 'x', 0, 2, 3, 1],
  Em: [0, 2, 2, 0, 0, 0],
  Fm: [1, 3, 3, 1, 1, 1],
  Gm: [3, 5, 5, 3, 3, 3],
  'F#m': [2, 4, 4, 2, 2, 2],
  'C#m': ['x', 4, 6, 6, 5, 4],
  'G#m': [4, 6, 6, 4, 4, 4],
  Bbm: ['x', 1, 3, 3, 2, 1],
  A7: ['x', 0, 2, 0, 2, 0],
  B7: ['x', 2, 1, 2, 0, 2],
  C7: ['x', 3, 2, 3, 1, 0],
  D7: ['x', 'x', 0, 2, 1, 2],
  E7: [0, 2, 0, 1, 0, 0],
  F7: [1, 3, 1, 2, 1, 1],
  G7: [3, 2, 0, 0, 0, 1],
  'F#7': [2, 4, 2, 3, 2, 2],
  Bb7: ['x', 1, 3, 1, 2, 1],
  Am7: ['x', 0, 2, 0, 1, 0],
  Cm7: ['x', 3, 5, 3, 4, 3],
  Dm7: ['x', 'x', 0, 2, 1, 1],
  Em7: [0, 2, 0, 0, 0, 0],
  Fm7: [1, 3, 1, 1, 1, 1],
  Gm7: [3, 5, 3, 3, 3, 3],
  'F#m7': [2, 4, 2, 2, 2, 2],
  'C#m7': ['x', 4, 6, 4, 5, 4],
  Cmaj7: ['x', 3, 2, 0, 0, 0],
  Dmaj7: ['x', 'x', 0, 2, 2, 2],
  Emaj7: [0, 2, 1, 1, 0, 0],
  Fmaj7: ['x', 'x', 3, 2, 1, 0],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  Amaj7: ['x', 0, 2, 1, 2, 0],
  Bmaj7: ['x', 2, 4, 3, 4, 2],
  Asus2: ['x', 0, 2, 2, 0, 0],
  Asus4: ['x', 0, 2, 2, 3, 0],
  Dsus2: ['x', 'x', 0, 2, 3, 0],
  Dsus4: ['x', 'x', 0, 2, 3, 3],
  Esus4: [0, 2, 2, 2, 0, 0],
  Gsus4: [3, 3, 0, 0, 1, 3],
  Cadd9: ['x', 3, 2, 0, 3, 3],
  Dadd9: ['x', 'x', 0, 2, 3, 0],
  Gadd9: [3, 0, 0, 2, 0, 3],
  Em9: [0, 2, 0, 0, 2, 0],
  'E7sus4': [0, 2, 0, 2, 0, 0],
  C5: ['x', 3, 5, 5, 'x', 'x'],
  D5: ['x', 'x', 0, 2, 3, 'x'],
  E5: [0, 2, 2, 'x', 'x', 'x'],
  G5: [3, 5, 5, 'x', 'x', 'x'],
  A5: ['x', 0, 2, 2, 'x', 'x'],
  'Bm7b5': ['x', 2, 3, 2, 3, 'x'],
  // 转位 / 斜杠和弦（人类谱面高频出现）
  'F#7/C#': ['x', 4, 4, 3, 2, 2],
  'F#7/A#': ['x', 'x', 4, 3, 2, 2],
  'D/F#': [2, 'x', 0, 2, 3, 2],
  'C/G': [3, 3, 2, 0, 1, 0],
  'G/B': ['x', 2, 0, 0, 0, 3],
  'Am/G': [3, 0, 2, 2, 1, 0],
  'Am7/G': [3, 0, 2, 0, 1, 0],
  'Em/B': ['x', 2, 2, 0, 0, 0],
  'A/C#': ['x', 4, 2, 2, 2, 0],
  'E/G#': [4, 2, 2, 1, 0, 0],
  'Bm/A': ['x', 0, 4, 4, 3, 2],
  'Bm/F#': [2, 2, 4, 4, 3, 2],
  'G/F#': [2, 2, 0, 0, 0, 3],
  'D/A': ['x', 0, 0, 2, 3, 2],
  'Dm/F': [1, 'x', 0, 2, 3, 1],
  Bdim: ['x', 2, 3, 4, 3, 'x'],
  'Bm7b5/A': ['x', 0, 3, 2, 3, 'x'],
  'Cdim7': ['x', 3, 4, 2, 4, 'x'],
  'G#dim7': [4, 'x', 3, 4, 3, 'x'],
  Adim: ['x', 0, 1, 2, 1, 'x'],
};

/** 移动式和弦模板（根音在六弦或五弦），索引 0 = 六弦 */
const MOVABLE_SHAPES: Record<string, { rootString: 6 | 5; offsets: Array<number | 'x'> }> = {
  major: { rootString: 6, offsets: [0, 2, 2, 1, 0, 0] },
  minor: { rootString: 6, offsets: [0, 2, 2, 0, 0, 0] },
  dom7: { rootString: 6, offsets: [0, 2, 0, 1, 0, 0] },
  min7: { rootString: 6, offsets: [0, 2, 0, 0, 0, 0] },
  maj7: { rootString: 6, offsets: [0, 2, 1, 1, 0, 0] },
  sus4: { rootString: 6, offsets: [0, 2, 2, 2, 0, 0] },
  min7b5: { rootString: 6, offsets: [0, 1, 0, 0, 'x', 'x'] },
  five: { rootString: 6, offsets: [0, 2, 2, 'x', 'x', 'x'] },
};

const SHAPE_FOR: Array<{ test: RegExp; shape: keyof typeof MOVABLE_SHAPES }> = [
  { test: /^(m7b5|ø|half.?dim)/i, shape: 'min7b5' },
  { test: /^(maj7|maj9|Δ|M7)/i, shape: 'maj7' },
  { test: /^(m7|min7|-7)/i, shape: 'min7' },
  { test: /^(m|min|-)$/i, shape: 'minor' },
  { test: /^(sus4|sus)$/i, shape: 'sus4' },
  { test: /^5$/i, shape: 'five' },
  { test: /^(7|9|11|13|dom7)/i, shape: 'dom7' },
  { test: /^(add9|6|maj)/i, shape: 'major' },
];

const OPEN_STRING_PITCH: Record<string, number> = { E: 4, A: 9, D: 2, G: 7, B: 11 };

/** 查/生成和弦把位：优先命中人工维护库，未命中用移动式模板生成 */
export function lookupVoicing(chordName: string): {
  frets: Array<number | 'x'> | null;
  source: 'library' | 'generated' | 'none';
} {
  const name = chordName.trim();
  if (!name) return { frets: null, source: 'none' };
  if (CHORD_VOICINGS[name]) return { frets: [...CHORD_VOICINGS[name]], source: 'library' };
  if (name.includes('/') && CHORD_VOICINGS[name.split('/')[0]]) {
    return { frets: [...CHORD_VOICINGS[name.split('/')[0]]], source: 'library' };
  }
  const canonical = name[0].toUpperCase() + name.slice(1);
  if (CHORD_VOICINGS[canonical]) return { frets: [...CHORD_VOICINGS[canonical]], source: 'library' };

  const m = canonical.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return { frets: null, source: 'none' };
  const rootPc = noteNameToPitchClass(m[1]);
  const quality = m[2] || '';
  if (rootPc === null) return { frets: null, source: 'none' };

  const shapeEntry = SHAPE_FOR.find((s) => s.test.test(quality));
  const shape = MOVABLE_SHAPES[shapeEntry ? shapeEntry.shape : 'major'];
  const openPc = OPEN_STRING_PITCH[shape.rootString === 6 ? 'E' : 'A'];
  let barre = (((rootPc - openPc) % 12) + 12) % 12;
  if (barre === 0) barre = 12;
  if (barre > 12) barre -= 12;

  const frets = shape.offsets.map((o) => (o === 'x' ? ('x' as const) : (o as number) + barre));
  return { frets, source: 'generated' };
}

/** 把位 → 实际音符（索引 0 = 六弦 → string 6） */
export function voicingToNotes(
  frets: Array<number | 'x'>,
  tuning: number[] = STANDARD_TUNING,
  capo = 0,
): Array<{ string: number; fret: number; midi: number }> {
  const out: Array<{ string: number; fret: number; midi: number }> = [];
  frets.forEach((f, idx) => {
    if (f === 'x' || f === undefined) return;
    const string = 6 - idx;
    if (string < 1 || string > tuning.length) return;
    const fret = Number(f) || 0;
    out.push({ string, fret, midi: fretToMidi(string, fret, tuning, capo) });
  });
  return out;
}

/** 由把位推断横按：≥2 根连续弦共用的最低品位 */
export function barreFromVoicing(
  frets: Array<number | 'x'>,
): { fret: number; fromString: number; toString: number } | null {
  const numeric = frets
    .map((f, idx) => ({ f: f === 'x' ? null : (f as number), string: 6 - idx }))
    .filter((x) => x.f !== null && (x.f as number) > 0) as Array<{ f: number; string: number }>;
  if (numeric.length < 2) return null;

  const lowest = Math.min(...numeric.map((n) => n.f));
  const onLowest = numeric.filter((n) => n.f === lowest).map((n) => n.string);
  if (onLowest.length < 2) return null;

  const min = Math.min(...onLowest);
  const max = Math.max(...onLowest);
  const covered = new Set(onLowest);
  for (let s = min + 1; s < max; s++) if (!covered.has(s)) return null;
  return { fret: lowest, fromString: min, toString: max };
}

// ─────────────────────────────────────────────
// 拍号 / 时间轴
// ─────────────────────────────────────────────

export function parseTimeSignature(ts?: string): { beats: number; beatValue: number } {
  const m = String(ts || '4/4').match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { beats: 4, beatValue: 4 };
  const beats = parseInt(m[1], 10);
  const beatValue = parseInt(m[2], 10);
  return {
    beats: Number.isFinite(beats) && beats > 0 ? beats : 4,
    beatValue: Number.isFinite(beatValue) && beatValue > 0 ? beatValue : 4,
  };
}

/**
 * 小节时长（秒）。
 *
 * ⚠️ 必须由 BPM 与拍号推导，不能硬编码：
 * `duration = 拍数 × (60 / bpm) × (4 / 拍号分母)`
 * 例：4/4 @ 90BPM → 2.667s；6/8 @ 100BPM → 1.8s
 */
export function measureDurationSec(bpm: number, timeSignature: string): number {
  const { beats, beatValue } = parseTimeSignature(timeSignature);
  return beats * (60 / Math.max(1, bpm)) * (4 / beatValue);
}

/** 小节拍数（四分音符当量）：4/4 → 4；6/8 → 3 */
export function beatsPerMeasure(timeSignature: string): number {
  const { beats, beatValue } = parseTimeSignature(timeSignature);
  return beats * (4 / beatValue);
}

/** 按「小节内偏移 → 弦序」排序音符（C 端节点判定依赖时间递增） */
export function sortMeasureNotes(measure: TabProjectMeasure): TabProjectMeasure {
  return {
    ...measure,
    notes: [...measure.notes].sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string),
  };
}

/** 为小节填充 startTime / endTime / beats（源已给真实时间时以它为准） */
export function buildTimeline(
  measures: TabProjectMeasure[],
  fallbackBpm: number,
  fallbackTimeSignature: string,
): TabProjectMeasure[] {
  let cursor = 0;
  return measures.map((m) => {
    const bpm = m.bpm && m.bpm > 0 ? m.bpm : fallbackBpm;
    const ts = m.timeSignature || fallbackTimeSignature;
    const beats = beatsPerMeasure(ts);
    const duration = measureDurationSec(bpm, ts);

    const start = Number.isFinite(m.startTime) && m.startTime > 0 ? m.startTime : cursor;
    const end = Number.isFinite(m.endTime) && m.endTime > start ? m.endTime : start + duration;
    cursor = end;

    return sortMeasureNotes({
      ...m,
      startTime: Number(start.toFixed(4)),
      endTime: Number(end.toFixed(4)),
      beats,
    });
  });
}

// ─────────────────────────────────────────────
// 横按检测
// ─────────────────────────────────────────────

export interface DetectedBarre {
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  noteCount: number;
}

/**
 * 从音符聚类检测横按：同一时刻（±toleranceMs）≥2 根连续弦上的同一品位。
 * 人工谱通常已写明横按，这里主要用于和弦表 / 转录结果这类没有横按信息的源。
 */
export function detectBarresFromNotes(
  notes: Array<{ string: number; fret: number; offsetSec: number; durationSec: number }>,
  toleranceMs = 30,
): DetectedBarre[] {
  const usable = notes
    .filter((n) => Number.isFinite(n.fret) && n.fret > 0)
    .map((n) => ({ ...n, ms: Math.round(n.offsetSec * 1000) }))
    .sort((a, b) => a.ms - b.ms || a.string - b.string);

  const clusters: Array<typeof usable> = [];
  let current: typeof usable = [];
  for (const n of usable) {
    if (current.length === 0 || n.ms - current[0].ms <= toleranceMs) {
      current.push(n);
    } else {
      clusters.push(current);
      current = [n];
    }
  }
  if (current.length > 0) clusters.push(current);

  const barres: DetectedBarre[] = [];
  for (const cluster of clusters) {
    const byFret = new Map<number, typeof cluster>();
    for (const n of cluster) {
      const arr = byFret.get(n.fret) || [];
      arr.push(n);
      byFret.set(n.fret, arr);
    }
    for (const [fret, group] of byFret) {
      const strings = Array.from(new Set(group.map((g) => g.string))).sort((a, b) => a - b);
      if (strings.length < 2) continue;
      const min = strings[0];
      const max = strings[strings.length - 1];
      const missing: number[] = [];
      for (let s = min + 1; s < max; s++) if (!strings.includes(s)) missing.push(s);
      if (missing.length > 1) continue;

      barres.push({
        fret,
        fromString: min,
        toString: max,
        startTime: Number((cluster[0].ms / 1000).toFixed(3)),
        duration: Number(Math.max(...group.map((g) => g.durationSec || 0.5)).toFixed(3)),
        noteCount: group.length,
      });
    }
  }
  return barres;
}

// ─────────────────────────────────────────────
// 发布结构转换
// ─────────────────────────────────────────────

export interface ProjectToPublishOptions {
  instrument?: TabInstrument;
  tabImageUrl?: string;
  barreToleranceMs?: number;
}

/**
 * TabProject → `POST /api/measures/publish` 的 measures[]。
 *
 * 换算：
 * - `audioTime = 小节 startTime + 音符 offsetSec`
 * - `x = offsetSec / 小节时长`（0-1）
 * - `y = (string - 1) / 5`（0-1，一弦在上）
 */
export function projectToPublishMeasures(
  project: TabProject,
  options: ProjectToPublishOptions = {},
): PublishReadyMeasure[] {
  const instrument = options.instrument || project.meta.instrument || 'guitar';
  const tabImageUrl = options.tabImageUrl || '';
  const theTrack = project.tracks[0];
  if (!theTrack) return [];

  return theTrack.measures.map((m) => {
    const span = Math.max(0.001, m.endTime - m.startTime);
    const sortedNotes = [...m.notes].sort(
      (a, b) => a.offsetSec - b.offsetSec || a.string - b.string,
    );

    const notes = sortedNotes.map((n, i) => ({
      id: n.id || `n_${m.index}_${i}`,
      audioTime: Number((m.startTime + n.offsetSec).toFixed(4)),
      string: n.string,
      fret: n.fret,
      pitch: n.midi,
      duration: Number((n.durationSec || 0.5).toFixed(4)),
      confidence: n.confidence ?? 1,
      x: Number(Math.min(0.999, Math.max(0, n.offsetSec / span)).toFixed(4)),
      y: Number(((n.string - 1) / 5).toFixed(4)),
      technique: n.technique,
      chordName: n.chordName,
      /** 左手指法 / 空弦标记：0 = 空弦，1-4 = 食指…小指（未推定则为 undefined，C 端不画） */
      finger: typeof n.finger === 'number' ? n.finger : undefined,
      /** 该音生效的手位（换把点之后的音会不同）—— 让「手指号 → 品位」始终可反推 */
      position: typeof n.position === 'number' ? n.position : undefined,
    }));

    // 横按：优先用和弦把位推出的，其次从音符聚类推断
    const barres: PublishReadyMeasure['barres'] = [];
    for (const chord of m.chords || []) {
      if (!chord.frets) continue;
      const b = barreFromVoicing(chord.frets);
      if (!b) continue;
      barres.push({
        instrument,
        fret: b.fret,
        fromString: b.fromString,
        toString: b.toString,
        startTime: Number((m.startTime + chord.offsetSec).toFixed(3)),
        duration: Number(chord.durationSec.toFixed(3)),
        x: Number(Math.min(0.999, chord.offsetSec / span).toFixed(4)),
        y: Number(((b.fromString - 1) / 5).toFixed(4)),
      });
    }

    const detected = detectBarresFromNotes(
      m.notes.map((n) => ({
        string: n.string,
        fret: n.fret,
        offsetSec: n.offsetSec,
        durationSec: n.durationSec,
      })),
      options.barreToleranceMs ?? 30,
    );
    for (const d of detected) {
      // 同一小节内同一品位的横按只保留一次：
      // 扫弦型谱面每个槽位都会重新「按下」同一个横按，全量保留会产出几十个重复标记
      const dup = barres.some(
        (b) =>
          b.fret === d.fret &&
          (Math.abs(b.startTime - (m.startTime + d.startTime)) < 0.05 || b.fromString === d.fromString),
      );
      if (dup) continue;
      barres.push({
        instrument,
        fret: d.fret,
        fromString: d.fromString,
        toString: d.toString,
        startTime: Number((m.startTime + d.startTime).toFixed(3)),
        duration: d.duration,
        x: Number(Math.min(0.999, d.startTime / span).toFixed(4)),
        y: Number(((d.fromString - 1) / 5).toFixed(4)),
      });
    }

    const chords: PublishReadyMeasure['chords'] = (m.chords || []).map((c) => ({
      instrument,
      chordName: c.name,
      /**
       * 绝对时间统一保留 4 位小数。
       * ⚠️ 以前这里是 `toFixed(3)`，而小节窗口是 4 位 —— 发布侧做
       * `startTime - measure.startTime` 时会算出 `-0.0003` 这种**负数**（浮点误差），
       * 导致 C 端和弦标记落到小节之前。精度不一致是根源，所以统一到 4 位。
       */
      startTime: Number((m.startTime + c.offsetSec).toFixed(4)),
      duration: Number(c.durationSec.toFixed(3)),
      x: Number(Math.min(0.999, Math.max(0, c.offsetSec / span)).toFixed(4)),
      y: 0.04,
      /** 把位 → 指法图（'x' 闷弦在契约里用 -1 表示） */
      voicing: c.frets ? c.frets.map((f) => (f === 'x' ? -1 : Number(f))) : undefined,
    }));

    return {
      index: m.index + 1, // 后端 index 1 起
      label: m.label || `第 ${m.index + 1} 小节`,
      startTime: m.startTime,
      endTime: m.endTime,
      /** 小节把位（第 P 把位）—— C 端在谱面开头画罗马数字标记 */
      position: typeof m.position === 'number' && m.position >= 1 ? m.position : undefined,
      notes,
      barres,
      chords,
      tabImageUrl,
    };
  });
}

/** 生成可读的 ASCII 六线谱（CMS 预览 / 人工校对） */
export function projectMeasureToAscii(measure: TabProjectMeasure, columns = 32): string {
  const labels = ['e', 'B', 'G', 'D', 'A', 'E'];
  const span = Math.max(0.001, measure.endTime - measure.startTime);

  const colOf = (n: TabProjectNote) =>
    Math.min(columns - 2, Math.max(0, Math.round((n.offsetSec / span) * (columns - 2))));

  return labels
    .map((label, idx) => {
      const stringIndex = idx + 1;
      const cells = new Array<string>(columns).fill('-');
      const onThisString = measure.notes
        .filter((n) => n.string === stringIndex)
        .map((n) => ({ col: colOf(n), text: n.fret < 0 ? 'x' : String(n.fret) }))
        .sort((a, b) => a.col - b.col);
      for (const ev of onThisString) {
        for (let i = 0; i < ev.text.length && ev.col + i < columns; i++) {
          cells[ev.col + i] = ev.text[i];
        }
      }
      return `${label}|${cells.join('')}|`;
    })
    .join('\n');
}

// ─────────────────────────────────────────────
// 统计 / 组装
// ─────────────────────────────────────────────

export function computeStats(project: {
  tracks: Array<{ measures: TabProjectMeasure[] }>;
  meta: { bpm: number; timeSignature: string };
}): TabProjectStats {
  const measures = project.tracks[0]?.measures || [];
  let noteCount = 0;
  let chordCount = 0;
  let approximateRhythmMeasures = 0;
  let timeSignatureChanges = 0;
  const timeSignatures = new Set<string>();
  const allNotes: Array<{ string: number; fret: number; offsetSec: number; durationSec: number }> = [];

  for (const m of measures) {
    noteCount += m.notes.length;
    chordCount += (m.chords || []).length;
    if (m.beats === 0) approximateRhythmMeasures++;
    for (const n of m.notes) {
      allNotes.push({
        string: n.string,
        fret: n.fret,
        offsetSec: m.startTime + n.offsetSec,
        durationSec: n.durationSec,
      });
    }
    const ts = m.timeSignature || project.meta.timeSignature;
    if (!timeSignatures.has(ts)) {
      if (timeSignatures.size > 0) timeSignatureChanges++;
      timeSignatures.add(ts);
    }
  }

  const last = measures[measures.length - 1];
  return {
    measureCount: measures.length,
    noteCount,
    chordCount,
    barreCount: detectBarresFromNotes(allNotes).length,
    approximateRhythmMeasures,
    timeSignatureChanges,
    durationSec: last ? Number(last.endTime.toFixed(2)) : 0,
  };
}

export function makeNote(params: {
  id: string;
  string: number;
  fret: number;
  offsetSec: number;
  beat: number;
  durationSec: number;
  tuning?: number[];
  capo?: number;
  technique?: TabTechnique;
  velocity?: number;
  confidence?: number;
  chordName?: string;
  rhythm?: TabProjectNote['rhythm'];
  sourceColumn?: number;
  /** 左手指法：0 = 空弦，1-4 = 食指…小指 */
  finger?: number;
}): TabProjectNote {
  const tuning = params.tuning || STANDARD_TUNING;
  return {
    id: params.id,
    string: params.string,
    fret: params.fret,
    midi: fretToMidi(params.string, params.fret, tuning, params.capo ?? 0),
    offsetSec: Number(params.offsetSec.toFixed(4)),
    beat: Number(params.beat.toFixed(4)),
    durationSec: Number(Math.max(0.05, params.durationSec).toFixed(4)),
    rhythm: params.rhythm,
    technique: params.technique || 'normal',
    velocity: params.velocity ?? 90,
    confidence: params.confidence ?? 1,
    chordName: params.chordName,
    sourceColumn: params.sourceColumn,
    finger: typeof params.finger === 'number' ? params.finger : undefined,
  };
}

export function makeChord(params: {
  name: string;
  offsetSec: number;
  beat: number;
  durationSec: number;
  frets?: Array<number | 'x'>;
  strumPattern?: string;
}): TabProjectChord {
  return {
    name: params.name,
    offsetSec: Number(params.offsetSec.toFixed(4)),
    beat: Number(params.beat.toFixed(4)),
    durationSec: Number(params.durationSec.toFixed(4)),
    frets: params.frets,
    strumPattern: params.strumPattern,
  };
}

export function makeWarning(
  level: TabProjectWarning['level'],
  code: string,
  message: string,
  measureIndex?: number,
): TabProjectWarning {
  return { level, code, message, measureIndex };
}

/** 版权状态 → 能否对外发布（C 端） */
export function isPublishableRights(rights: RightsStatus): { ok: boolean; reason?: string } {
  switch (rights) {
    case 'public-domain':
    case 'original-arrangement':
    case 'licensed':
    case 'user-submission':
      return { ok: true };
    case 'copyrighted':
      return {
        ok: false,
        reason:
          '该谱面对应作品仍在版权保护期内（例如流行歌曲的正式出版物）。' +
          '请勿将整曲六线谱直接发布到 C 端，建议仅保留「和弦进行 + 段落结构」用于教学演示，或联系版权方取得授权。',
      };
    default:
      return {
        ok: true,
        reason:
          '版权状态未知：请确认该谱面来源合法（作者授权 / 公有领域 / 自有编配）后再对外发布。',
      };
  }
}

/** 版权状态 → Score.license（写入数据库，最终出现在 C 端 provenance.license） */
export function rightsToLicense(
  rights: RightsStatus,
): 'public_domain' | 'cc_by' | 'authorized' | 'user_uploaded' {
  switch (rights) {
    case 'public-domain':
      return 'public_domain';
    case 'licensed':
      return 'authorized';
    case 'original-arrangement':
    case 'user-submission':
      return 'user_uploaded';
    default:
      return 'user_uploaded';
  }
}

/** 展开全部音符为「绝对秒」列表（供音频合成 / 对齐校验） */
export function flattenProjectNotes(
  project: TabProject,
): Array<{ atSec: number; string: number; fret: number; durationSec: number; midi: number }> {
  const out: Array<{
    atSec: number;
    string: number;
    fret: number;
    durationSec: number;
    midi: number;
  }> = [];
  for (const track of project.tracks) {
    for (const m of track.measures) {
      for (const n of m.notes) {
        out.push({
          atSec: Number((m.startTime + n.offsetSec).toFixed(4)),
          string: n.string,
          fret: n.fret,
          durationSec: n.durationSec,
          midi: n.midi,
        });
      }
    }
  }
  return out.sort((a, b) => a.atSec - b.atSec);
}
