import { AudioTabSyncConfig, TabNote } from '../../../types';

/**
 * 六线谱编辑器 · 纯逻辑层 (tabEditorModel)
 * =======================================
 *
 * 把「音频与六线谱对齐」页面的节点编辑所需的**全部数学**抽成零依赖纯函数：
 * 网格吸附、起音点检测、对齐偏差统计、时值换算、扫弦模式 → 音符的合成/反解。
 *
 * 为什么单独放一个文件？
 * - `AudioTabSyncStudio.tsx` 已经很庞大，把编辑算法塞进去会与渲染/交互纠缠；
 * - 纯函数可以被回归脚本直接 import 验证（与 `standardTabLayout.ts` 同一约定）；
 * - 遵循「.tsx 只导出组件」的约定（非组件导出会让 React Fast Refresh 失效）。
 *
 * ⚠️ 时间单位：本项目的数据模型（`TabNote.timestampSec` / `durationSec` /
 * `AudioTabSyncConfig.measureTimestamps`）一律是**秒**。规格文档里的 tick/PPQ
 * 只是描述网格精度的手段，这里用「相对一拍的秒数」等价实现，避免改动既有数据契约
 * （改动契约会连带破坏发布链路与 C 端）。
 */

/** 每根弦的标准调弦 MIDI（index 0 = 第 1 弦高音 E … index 5 = 第 6 弦低音 E） */
export const STANDARD_TUNING_MIDI: number[] = [64, 59, 55, 50, 45, 40];

/** 可选网格（规格文档 §4/§11） */
export const GRID_OPTIONS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'] as const;
export type GridValue = (typeof GRID_OPTIONS)[number];

/** 网格相对「一拍」的比例（1/8T = 三连八分 = 1/3 拍） */
const GRID_BEAT_RATIO: Record<string, number> = {
  '1/1': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 0.5,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
};

/** 一拍秒数 */
export const beatSecOf = (bpm?: number): number => 60 / Math.max(1, bpm || 80);

/** 一个网格步长的秒数 */
export const gridStepSec = (grid: string, bpm?: number): number =>
  beatSecOf(bpm) * (GRID_BEAT_RATIO[grid] ?? 0.5);

/** 吸附到网格（`enabled=false` 时只做下界保护，用于「微调」语义） */
export const snapSecToGrid = (
  sec: number,
  grid: string,
  bpm?: number,
  enabled = true,
): number => {
  if (!enabled) return Math.max(0, sec);
  const step = gridStepSec(grid, bpm);
  if (step <= 0) return Math.max(0, sec);
  return Math.max(0, Math.round(sec / step) * step);
};

/** 保留 3 位小数（避免浮点噪声写进配置） */
export const roundSec = (sec: number): number => Number(sec.toFixed(3));

/** 找到时间点所属小节（返回 -1 表示在小节范围外/无小节） */
export const findMeasureIndexAt = (timeSec: number, measureTimestamps: number[]): number => {
  if (!measureTimestamps || measureTimestamps.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < measureTimestamps.length; i++) {
    if (timeSec >= measureTimestamps[i] - 1e-6) idx = i;
    else break;
  }
  return timeSec < measureTimestamps[0] - 1e-6 ? -1 : idx;
};

/** 小节区间 [start, end) */
export const measureRangeAt = (
  index: number,
  measureTimestamps: number[],
  durationSec: number,
): { start: number; end: number; duration: number } => {
  const start = measureTimestamps[index] ?? 0;
  const end =
    index + 1 < measureTimestamps.length ? measureTimestamps[index + 1] : Math.max(start + 0.05, durationSec);
  return { start, end, duration: Math.max(0.05, end - start) };
};

/** 音符 → MIDI 音高（`midi = 空弦 + 品 + 变调夹`，与后端口径一致） */
export const noteToMidi = (stringIndex: number, fret: number | string, capo = 0): number => {
  const openMidi = STANDARD_TUNING_MIDI[stringIndex - 1];
  if (openMidi === undefined) return 0;
  const fretNum = typeof fret === 'number' ? fret : parseInt(String(fret).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(fretNum)) return 0;
  return openMidi + fretNum + capo;
};

/** 是否是「闷音」标记 */
export const isMutedFret = (fret: number | string): boolean =>
  typeof fret === 'string' && /x/i.test(fret);

/** 是否是可弹奏的数字品位 */
export const isNumericFret = (fret: number | string): boolean => {
  if (typeof fret === 'number') return Number.isFinite(fret);
  return /^-?\d+$/.test(String(fret).trim());
};

/** 数字品位（用于键盘 0-9 输入、播放试听） */
export const numericFretOf = (fret: number | string, fallback = 0): number => {
  const n = typeof fret === 'number' ? fret : parseInt(String(fret).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** 把音符归位到正确的小节（移动后必须重算，否则发布时会被分到错误的小节） */
export const withMeasureIndex = (notes: TabNote[], measureTimestamps: number[]): TabNote[] =>
  notes.map((n) => {
    const idx = findMeasureIndexAt(n.timestampSec, measureTimestamps);
    const nextIndex = idx === -1 ? 0 : idx;
    return n.measureIndex === nextIndex ? n : { ...n, measureIndex: nextIndex };
  });

/** 按时间升序（同刻则按弦号升序，保证渲染稳定） */
export const sortNotes = (notes: TabNote[]): TabNote[] =>
  [...notes].sort((a, b) =>
    a.timestampSec === b.timestampSec ? a.stringIndex - b.stringIndex : a.timestampSec - b.timestampSec,
  );

// ─────────────────────────────────────────────────────────────
// 起音点检测（规格文档 §8.3「起音检测线」）
// ─────────────────────────────────────────────────────────────
export interface OnsetDetectOptions {
  /** 灵敏度：阈值 = max(0.12, mean + sensitivity × std)，越大越严格 */
  sensitivity?: number;
  /** 两个起音点之间的最小间隔（秒） */
  minGapSec?: number;
}

/**
 * 从 128 点能量波形里找起音点。
 *
 * ⚠️ 现实约束：本项目波形只有 128 个能量峰值（`waveformPeaks`），
 * 对 20s 音频来说一格 ≈ 0.16s —— 直接取格点会非常粗糙。
 * 因此这里做了**抛物线插值**（用相邻三点拟合峰位），把分辨率提升到亚格点级别，
 * 并在 UI 上明确标注「起音点来自能量峰值的插值估计」，避免被当成真值。
 */
export const detectOnsets = (
  peaks: number[],
  durationSec: number,
  opts: OnsetDetectOptions = {},
): number[] => {
  const n = peaks?.length ?? 0;
  if (n < 3 || durationSec <= 0) return [];

  const mean = peaks.reduce((a, b) => a + b, 0) / n;
  const variance = peaks.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sensitivity = opts.sensitivity ?? 0.6;
  const threshold = Math.max(0.12, mean + sensitivity * std);
  const minGap = opts.minGapSec ?? 0.12;
  const step = durationSec / n;

  const onsets: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const p = peaks[i];
    if (p < threshold) continue;
    // 局部极大（右侧用 <= 以便落在平台区时取最左点）
    if (p < peaks[i - 1] || p <= peaks[i + 1]) continue;

    const denom = peaks[i - 1] - 2 * p + peaks[i + 1];
    const offset = denom !== 0 ? (0.5 * (peaks[i - 1] - peaks[i + 1])) / denom : 0;
    const clamped = Math.max(-0.5, Math.min(0.5, offset));
    const t = Math.max(0, (i + clamped) * step);

    if (onsets.length === 0 || t - onsets[onsets.length - 1] >= minGap) {
      onsets.push(roundSec(t));
    }
  }
  return onsets;
};

/** 最近起音点 */
export const nearestOnset = (
  timeSec: number,
  onsets: number[],
): { time: number; deltaSec: number } | null => {
  if (!onsets || onsets.length === 0) return null;
  let best = onsets[0];
  let bestDelta = Math.abs(timeSec - best);
  for (let i = 1; i < onsets.length; i++) {
    const d = Math.abs(timeSec - onsets[i]);
    if (d < bestDelta) {
      best = onsets[i];
      bestDelta = d;
    }
  }
  return { time: best, deltaSec: timeSec - best };
};

export interface NoteOffsetStat {
  noteId: string;
  timestampSec: number;
  onsetTime: number | null;
  /** 相对最近起音点的偏差（毫秒，正 = 音符晚于起音点） */
  offsetMs: number | null;
  gridOffsetMs: number;
}

/** 对齐诊断：每个音符相对「最近起音点」与「最近网格」的偏差 */
export const computeOffsetStats = (
  notes: TabNote[],
  onsets: number[],
  grid: string,
  bpm?: number,
): NoteOffsetStat[] => {
  const step = gridStepSec(grid, bpm);
  return notes.map((n) => {
    const onset = nearestOnset(n.timestampSec, onsets);
    const gridRemainder = step > 0 ? n.timestampSec - Math.round(n.timestampSec / step) * step : 0;
    return {
      noteId: n.id,
      timestampSec: n.timestampSec,
      onsetTime: onset ? onset.time : null,
      offsetMs: onset ? Math.round(onset.deltaSec * 1000) : null,
      gridOffsetMs: Math.round(gridRemainder * 1000),
    };
  });
};

// ─────────────────────────────────────────────────────────────
// 时值（Duration）与力度（Velocity）—— 规格文档 §9 属性面板
// ─────────────────────────────────────────────────────────────
export interface DurationPreset {
  label: string;
  /** 相对一拍的倍数 */
  ratio: number;
}

/** 时值预设（四分 = 1 拍） */
export const DURATION_PRESETS: DurationPreset[] = [
  { label: '全音符', ratio: 4 },
  { label: '二分', ratio: 2 },
  { label: '附点四分', ratio: 1.5 },
  { label: '四分', ratio: 1 },
  { label: '附点八分', ratio: 0.75 },
  { label: '八分', ratio: 0.5 },
  { label: '三连八分', ratio: 1 / 3 },
  { label: '十六分', ratio: 0.25 },
  { label: '三十二分', ratio: 0.125 },
];

/** 时值 → 最接近的预设标签（用于 Inspector 显示「速率/时值」） */
export const rhythmLabelOf = (durationSec: number, bpm?: number): string => {
  const beats = durationSec / beatSecOf(bpm);
  let best = DURATION_PRESETS[0];
  let bestDelta = Math.abs(beats - best.ratio);
  for (const p of DURATION_PRESETS) {
    const d = Math.abs(beats - p.ratio);
    if (d < bestDelta) {
      best = p;
      bestDelta = d;
    }
  }
  return best.label;
};

/** 力度 → 力度记号（pp / p / mp / mf / f / ff） */
export const velocityDynamics = (velocity: number): string => {
  if (velocity < 32) return 'pp';
  if (velocity < 56) return 'p';
  if (velocity < 78) return 'mp';
  if (velocity < 98) return 'mf';
  if (velocity < 116) return 'f';
  return 'ff';
};

/** 技巧展示用标记（谱面缩写） */
export const TECHNIQUE_GLYPH: Record<string, string> = {
  normal: '',
  'hammer-on': 'H',
  'pull-off': 'P',
  slide: '/',
  bend: 'b',
  vibrato: '~',
  'palm-mute': 'P.M.',
  harmonic: '◇',
  'dead-note': 'X',
};

/** 技巧下拉选项（与 `NoteAddDialog.ADD_NOTE_TECHNIQUES` 同一套取值） */
export const TECHNIQUE_OPTIONS: Array<{ value: TabNote['technique']; label: string }> = [
  { value: 'normal', label: '正常拨弦 (normal)' },
  { value: 'hammer-on', label: '击弦 (hammer-on / H)' },
  { value: 'pull-off', label: '勾弦 (pull-off / P)' },
  { value: 'slide', label: '滑音 (slide / /)' },
  { value: 'bend', label: '推弦 (bend / b)' },
  { value: 'vibrato', label: '揉弦 (vibrato / ~)' },
  { value: 'palm-mute', label: '闷音 (palm-mute / P.M.)' },
  { value: 'harmonic', label: '泛音 (harmonic / ◇)' },
];

// ─────────────────────────────────────────────────────────────
// 扫弦模式（规格文档 §7.2「三轨分离」）
// ─────────────────────────────────────────────────────────────
export type StrumCell = '·' | '↓' | '↑' | '×';

/** 点击格子时的循环顺序 */
export const STRUM_CYCLE: StrumCell[] = ['·', '↓', '↑', '×'];

export const STRUM_CELL_LABEL: Record<StrumCell, string> = {
  '·': '空',
  '↓': '下扫',
  '↑': '上扫',
  '×': '闷音',
};

/**
 * 扫弦模式状态。
 *
 * 说明：本项目**没有** `strums` 独立表（发布载荷只有 measures[].notes/barres/chords）。
 * 因此扫弦模式被实现为「生成器」——和弦轨 + 扫弦轨是编辑期的**中间表示**，
 * 点「套用为音符」时合成成真正的 `TabNote`，与既有链路 100% 兼容。
 */
export interface StrumConfig {
  /** 和弦名称（仅用于显示/标注） */
  chordName: string;
  /** 6 根弦的按法，**index 0 = 第 6 弦（低音 E）** … index 5 = 第 1 弦 */
  chordShape: number[];
  /** 实际扫到的弦（1 = 高音 E … 6 = 低音 E） */
  strings: number[];
  /** 格子网格 */
  grid: string;
  /** 每格一个状态 */
  pattern: StrumCell[];
  /** 力度 */
  velocity: number;
  /** 是否给同一拍内的弦加 12ms 错位（模拟真实扫弦的琶音感；默认关闭） */
  stagger: boolean;
}

export const DEFAULT_STRUM_CONFIG: StrumConfig = {
  chordName: 'C',
  chordShape: [0, 1, 0, 2, 3, -1], // 第6弦→第1弦：x32010 → 这里 0/1/0/2/3 表示 6~2 弦，-1 = 不弹
  strings: [5, 4, 3, 2, 1],
  grid: '1/8',
  pattern: ['↓', '·', '↓', '↑', '·', '↑', '↓', '↑'],
  velocity: 92,
  stagger: false,
};

/** 常用和弦指法（index 0 = 第 6 弦；-1 = 不弹 / 闷掉） */
export const CHORD_SHAPES: Array<{ name: string; shape: number[] }> = [
  { name: 'C', shape: [-1, 3, 2, 0, 1, 0] },
  { name: 'G', shape: [3, 2, 0, 0, 0, 3] },
  { name: 'Am', shape: [-1, 0, 2, 2, 1, 0] },
  { name: 'Em', shape: [0, 2, 2, 0, 0, 0] },
  { name: 'F', shape: [1, 3, 3, 2, 1, 1] },
  { name: 'Dm', shape: [-1, -1, 0, 2, 3, 1] },
  { name: 'D', shape: [-1, -1, 0, 2, 3, 2] },
  { name: 'A', shape: [-1, 0, 2, 2, 2, 0] },
  { name: 'E', shape: [0, 2, 2, 1, 0, 0] },
  { name: 'Bm', shape: [-1, 2, 4, 4, 3, 2] },
];

export interface StrumPreset {
  name: string;
  grid: string;
  pattern: StrumCell[];
}

/** 内置扫弦预设库（规格文档 §7.2） */
export const STRUM_PRESETS: StrumPreset[] = [
  { name: '民谣 4/4 基础', grid: '1/8', pattern: ['↓', '·', '↓', '↑', '·', '↑', '↓', '↑'] },
  { name: 'U D D D U U', grid: '1/8', pattern: ['↑', '↓', '↓', '↓', '↑', '↑', '·', '·'] },
  { name: '8 分均匀', grid: '1/8', pattern: ['↓', '↑', '↓', '↑', '↓', '↑', '↓', '↑'] },
  {
    name: '16 分扫弦',
    grid: '1/16',
    pattern: [
      '↓', '·', '↑', '·', '↓', '·', '↑', '·',
      '↓', '·', '↑', '·', '↓', '·', '↑', '·',
    ],
  },
  {
    name: '闷音节奏',
    grid: '1/8',
    pattern: ['×', '×', '×', '×', '×', '×', '×', '×'],
  },
];

/** 和弦指法 → 每根弦的品（第 6 弦在前） */
export const shapeFretForString = (shape: number[], stringIndex: number): number =>
  shape[6 - stringIndex] ?? -1;

export interface MaterializeParams {
  strum: StrumConfig;
  measureIndex: number;
  measureStart: number;
  measureEnd: number;
  bpm?: number;
  idPrefix?: string;
}

/**
 * 扫弦轨 → 音符（规格文档 §7.2 materializeStrums）。
 * 同一个格子里的所有弦共享同一时间戳（除非开启 stagger）。
 */
export const materializeStrums = ({
  strum,
  measureIndex,
  measureStart,
  measureEnd,
  bpm,
  idPrefix = 'st',
}: MaterializeParams): TabNote[] => {
  const step = gridStepSec(strum.grid, bpm);
  const measureLen = Math.max(0.05, measureEnd - measureStart);
  const cellsInMeasure = Math.max(1, Math.round(measureLen / step));
  const out: TabNote[] = [];

  for (let i = 0; i < strum.pattern.length; i++) {
    const cell = strum.pattern[i];
    if (cell === '·') continue;
    if (i >= cellsInMeasure) break;

    const at = roundSec(measureStart + i * step);
    const isMute = cell === '×';
    // ↓ 从低音弦扫向高音弦；↑ 反之
    const ordered = cell === '↑' ? [...strum.strings].sort((a, b) => a - b) : [...strum.strings].sort((a, b) => b - a);

    ordered.forEach((stringIndex, order) => {
      const shapeFret = shapeFretForString(strum.chordShape, stringIndex);
      if (!isMute && shapeFret < 0) return; // 该弦在这个和弦里不弹
      const staggerOffset = strum.stagger ? order * 0.012 : 0;
      out.push({
        id: `${idPrefix}_${measureIndex}_${i}_${stringIndex}`,
        measureIndex,
        stringIndex,
        fret: isMute ? 'X' : shapeFret,
        timestampSec: roundSec(at + staggerOffset),
        durationSec: roundSec(Math.max(step * 0.9, 0.1)),
        technique: isMute ? 'palm-mute' : 'normal',
        velocity: strum.velocity,
        confidence: 1,
        chordName: strum.chordName || undefined,
        pitch: isMute ? 0 : noteToMidi(stringIndex, shapeFret),
      });
    });
  }
  return out;
};

export interface ReverseStrumResult {
  strum: StrumConfig;
  /** 匹配到的格子数（用于提示「反解了 N 拍」） */
  matchedCells: number;
}

/**
 * 音符 → 扫弦（规格文档 §7.2 反向）。
 * 同一「格子时间」（±1/4 网格容差）上 ≥2 个音符 → 视为一次扫弦；
 * 全部为闷音 → `×`；否则按最低音弦先响判 `↓` / 最高音弦先响判 `↑`。
 */
export const reverseEngineerStrums = (
  notes: TabNote[],
  measureStart: number,
  measureEnd: number,
  base: StrumConfig,
  bpm?: number,
): ReverseStrumResult => {
  const step = gridStepSec(base.grid, bpm);
  const measureLen = Math.max(0.05, measureEnd - measureStart);
  const cells = Math.max(1, Math.round(measureLen / step));
  const pattern: StrumCell[] = Array.from({ length: cells }, () => '·');
  const shapeAccum: number[][] = Array.from({ length: 6 }, () => []);
  const stringSet = new Set<number>();
  let matched = 0;

  const inMeasure = notes.filter((n) => n.timestampSec >= measureStart - 1e-6 && n.timestampSec < measureEnd);
  const buckets = new Map<number, TabNote[]>();
  inMeasure.forEach((n) => {
    const cellIndex = Math.max(0, Math.min(cells - 1, Math.round((n.timestampSec - measureStart) / step)));
    const list = buckets.get(cellIndex) ?? [];
    list.push(n);
    buckets.set(cellIndex, list);
  });

  buckets.forEach((list, cellIndex) => {
    if (list.length < 2) return;
    matched++;
    const allMuted = list.every((n) => isMutedFret(n.fret));
    pattern[cellIndex] = allMuted ? '×' : '↓';
    list.forEach((n) => {
      stringSet.add(n.stringIndex);
      const fretNum = numericFretOf(n.fret, 0);
      if (fretNum >= 0) shapeAccum[6 - n.stringIndex].push(fretNum);
    });
  });

  const chordShape = shapeAccum.map((vals) =>
    vals.length === 0 ? -1 : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  );

  return {
    strum: {
      ...base,
      chordShape,
      strings: stringSet.size > 0 ? [...stringSet].sort((a, b) => b - a) : base.strings,
      pattern,
    },
    matchedCells: matched,
  };
};

// ─────────────────────────────────────────────────────────────
// 汇总统计（供工具条 / 对齐诊断卡片显示）
// ─────────────────────────────────────────────────────────────
export interface EditorStats {
  noteCount: number;
  measureCount: number;
  lowConfidenceCount: number;
  /** 相对最近网格偏差 > 25ms 的音符数 */
  offGridCount: number;
  /** 有起音点可比对时，|偏差| > 80ms 的音符数 */
  offOnsetCount: number;
  meanAbsOffsetMs: number | null;
}

export const computeEditorStats = (
  notes: TabNote[],
  measureTimestamps: number[],
  onsets: number[],
  grid: string,
  bpm?: number,
  lowConfidenceThreshold = 0.6,
): EditorStats => {
  const stats = computeOffsetStats(notes, onsets, grid, bpm);
  const withOnset = stats.filter((s) => s.offsetMs !== null) as Array<NoteOffsetStat & { offsetMs: number }>;
  const meanAbs =
    withOnset.length > 0
      ? Math.round(withOnset.reduce((a, s) => a + Math.abs(s.offsetMs), 0) / withOnset.length)
      : null;

  return {
    noteCount: notes.length,
    measureCount: measureTimestamps.length,
    lowConfidenceCount: notes.filter((n) => (n.confidence ?? 1) < lowConfidenceThreshold).length,
    offGridCount: stats.filter((s) => Math.abs(s.gridOffsetMs) > 25).length,
    offOnsetCount: withOnset.filter((s) => Math.abs(s.offsetMs) > 80).length,
    meanAbsOffsetMs: meanAbs,
  };
};

/** 低置信度音符（按时间升序） */
export const lowConfidenceNotes = (notes: TabNote[], threshold = 0.6): TabNote[] =>
  sortNotes(notes.filter((n) => (n.confidence ?? 1) < threshold));

/** 在低置信度列表里找「下一个 / 上一个」（环绕） */
export const nextLowConfidence = (
  notes: TabNote[],
  fromSec: number,
  direction: 1 | -1,
  threshold = 0.6,
): TabNote | null => {
  const list = lowConfidenceNotes(notes, threshold);
  if (list.length === 0) return null;
  if (direction > 0) {
    return list.find((n) => n.timestampSec > fromSec + 1e-4) ?? list[0];
  }
  const reversed = [...list].reverse();
  return reversed.find((n) => n.timestampSec < fromSec - 1e-4) ?? reversed[0];
};

/** 生成稳定 id（不依赖 nanoid，避免新增依赖） */
export const makeNoteId = (prefix = 'n'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** 判断配置是否开启了扫弦模式 */
export const strumOf = (config: AudioTabSyncConfig): StrumConfig | null =>
  (config.strumConfig as StrumConfig | undefined) ?? null;
