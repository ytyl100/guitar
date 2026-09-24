/**
 * 标准六线谱排版引擎（Standard Tab Layout Engine）
 * ===============================================
 *
 * 目标：让本项目渲染出来的谱面与**市面上主流练习谱**一致（TAB 谱号 / 和弦名称 /
 * 节奏连接符 / 手指标注 / 扫弦箭头），而不是自成一派的「圆圈里写数字」。
 *
 * ```
 *  ♪ = 90
 *     C                                     G                    ← 和弦名称（小节内变化处）
 *  5  0────────0────1────3──┬──3────1────0────────3──             ← 品味数直接落在弦线上（弦线被挖空）
 *  ┌───────────────────────────────────────┐
 *  T│──0───────0────1────3──┼──3────1────0───│ ← 品味数 + 手指上标
 *  A│───────────────────────┼───────────────│
 *  B│═══════════════════════╪═══════════════│ ← 最粗的低音 E 弦线（加粗）
 *  └───────────────────────────────────────┘
 *     │   │   │   │           │   │   │   │     ← 拍点刻度
 *     ╞═══════╡                   ╞═══════╡     ← 节奏连接符（8/16 分音符）
 * ```
 *
 * 为什么把布局抽成**纯函数**（不返回 JSX）？
 * - CMS 复核工作台与微信小程序是**两个独立包**，但谱面必须长得一模一样 ——
 *   纯函数让两边共用同一套坐标与规则（各写一个 30 行的渲染层即可）；
 * - 排版规则可以**单测**（`npm run verify:tab-layout`），而不是靠肉眼看截图。
 *
 * 关键规则（与参考谱面逐条对齐）：
 * | 元素 | 规则 |
 * |---|---|
 * | 弦线 | 6 条；**第 6 弦（低音 E，最下方）线更粗** |
 * | TAB 谱号 | `T` / `A` / `B` 三个字母分别压在 2 / 4 / 6 弦线上 |
 * | 拍号 | 谱号右侧，分子分母分别居中于 2-3 弦、4-5 弦之间 |
 * | 速度 | `♪ = 90` 画在第一小节左上角 |
 * | 小节号 | 小节起点上方的小号数字 |
 * | 和弦名 | 弦线上方，落在和弦开始的时间点上 |
 * | 品味数 | **直接落在弦线上**，弦线在该处被背景色挖空（`lineGaps`） |
 * | 手指 | 品味数右上角的小上标：1=食指 2=中指 3=无名指 4=小指，0=空弦 |
 * | 节奏 | 时值 < 1 拍的相邻音符用**连接符（beam）**分组，画在弦线下方 |
 * | 扫弦/和弦 | 同一时刻的多个音落在同一 x（自然竖排）；≥3 个音时画扫弦箭头 |
 * | 小节线 | 右侧竖线；末小节画**一细一粗**的收尾双线 |
 */

import type { ReviewNote } from './reviewTypes';

// ─────────────────────────────────────────────
// 输入 / 输出类型
// ─────────────────────────────────────────────

export interface StandardTabNoteInput {
  id: string;
  /** 1-6，1 = 最细高音弦（渲染在最上方） */
  string: number;
  /** 0-24；-1 = 闷弦（渲染为 x） */
  fret: number;
  /** 相对小节起点的秒数 */
  offsetSec: number;
  durationSec: number;
  /** 0 = 空弦，1-4 = 食指…小指 */
  finger?: number;
  /** 该音生效的手位（与选项里的 `position` 不同 → 小节内换把，会多印一个标记） */
  position?: number;
  technique?: string;
  chordName?: string;
}

export interface StandardTabChordInput {
  name: string;
  /** 相对小节起点的秒数 */
  offsetSec: number;
}

/** 版式度量：两个 App 用同一套规则、不同的像素密度 */
export interface StandardTabMetrics {
  /** 相邻弦线间距 */
  lineSpacing: number;
  /** 第一条弦线（高音 E）的 y */
  staffTop: number;
  /** TAB 谱号字母的 x */
  clefX: number;
  /** 拍号 x */
  timeSignatureX: number;
  /** 品味数可用区域的左边界 */
  noteAreaLeft: number;
  /** 右侧留白 */
  noteAreaRight: number;
  /** 和弦名称行的文字基线 y */
  chordRowY: number;
  /** 小节号 x */
  measureNumberX: number;
  /** 品味数字号 */
  fontSize: number;
  /** 手指上标字号 */
  fingerFontSize: number;
  /** 弦线最左端 x（谱号/拍号之下仍可见的那一小段） */
  staffLeftX: number;
}

/** CMS 复核工作台（宽 1080 的谱面） */
export const CMS_TAB_METRICS: StandardTabMetrics = {
  lineSpacing: 13,
  staffTop: 38,
  clefX: 16,
  timeSignatureX: 38,
  noteAreaLeft: 64,
  noteAreaRight: 16,
  chordRowY: 15,
  measureNumberX: 6,
  fontSize: 12,
  fingerFontSize: 7.5,
  staffLeftX: 6,
};

/** 小程序（宽 600 的紧凑谱面，与 TabViewport 同尺寸） */
export const MINI_TAB_METRICS: StandardTabMetrics = {
  lineSpacing: 11,
  staffTop: 34,
  clefX: 11,
  timeSignatureX: 27,
  noteAreaLeft: 46,
  noteAreaRight: 12,
  chordRowY: 12,
  measureNumberX: 4,
  fontSize: 10.5,
  fingerFontSize: 7,
  staffLeftX: 4,
};

export interface StandardTabLayoutOptions {
  notes: StandardTabNoteInput[];
  chords?: StandardTabChordInput[];
  /** 小节时长（秒）—— 时间轴横坐标的唯一依据 */
  measureDuration: number;
  /** 用于推导节奏连接符（时值 → 几分音符） */
  bpm: number;
  timeSignature?: string;
  /** 调弦数组长度决定弦线数量（默认 6） */
  tuning?: number[];
  /** 本小节把位（第 P 把位）→ 谱面左上角罗马数字 */
  position?: number;
  width: number;
  height: number;
  /** 小节号（1 起）；不传则不画 */
  measureIndex?: number;
  /** 是否画 TAB 谱号 + 拍号（通常是每条谱线的第一小节） */
  showClef?: boolean;
  /** 是否画速度标记（通常是全曲第一小节） */
  showTempo?: boolean;
  /** 是否画收尾双粗线 */
  isLastMeasure?: boolean;
  /**
   * 弦线上的数字写什么：
   * - `'finger'`（默认，市场练习谱写法）：弦线上的数字 = **左手手指号**（1-4，0 = ○）。
   *   品位由左上角把位标记 + `fret = position + finger − 1` 反推；
   * - `'fret'`：弦线上的数字 = 品位，手指号作为右上方小号上标（复核纠错时用）。
   */
  noteLabel?: 'finger' | 'fret';
  metrics?: StandardTabMetrics;
}

export interface StandardTabLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface StandardTabText {
  text: string;
  x: number;
  y: number;
  size: number;
  /** 语义标签，渲染层据此决定字重/颜色 */
  role: 'clef' | 'timeTop' | 'timeBottom' | 'tempo' | 'measureNumber' | 'chord' | 'fret' | 'finger' | 'technique' | 'position' | 'positionLabel' | 'positionShift';
}

export interface StandardTabLayoutNote {
  id: string;
  string: number;
  /** 弦线上的主数字的 x/y（`noteLabel='finger'` 时主数字是手指号） */
  x: number;
  y: number;
  /** 弦线上实际绘制的字符（品位号或手指号，或 'x'） */
  text: string;
  /** 真实品位（永远是品位，供 title / 复核面板用） */
  fret: number;
  /** 左手手指号（0 = 空弦 / 1-4），缺失表示未标注 */
  finger?: number;
  /** 该音生效的手位（换把点之后与小节把位不同） */
  position?: number;
  /** 需要挖空弦线的宽度（背景色矩形） */
  maskWidth: number;
  maskHeight: number;
  /** 主数字不是手指号时，画在右上角的手指上标 */
  fingerText?: string;
  fingerX?: number;
  fingerY?: number;
  techniqueText?: string;
  techniqueX?: number;
  techniqueY?: number;
  /** 该音符所属的扫弦簇（同一 x，≥3 个音） */
  strumId?: string;
}

export interface StandardTabStrum {
  id: string;
  x: number;
  yTop: number;
  yBottom: number;
  /** down = 向下扫（从低音弦扫向高音弦） */
  direction: 'down' | 'up';
  stringCount: number;
}

export interface StandardTabBeam {
  x1: number;
  x2: number;
  y: number;
  /** 1 = 8 分音符，2 = 16 分音符的第二条横线 */
  level: number;
}

export interface StandardTabLayout {
  metrics: StandardTabMetrics;
  stringCount: number;
  /** 弦线 y（索引 0 = 一弦 / 最上方） */
  stringYs: number[];
  staffTop: number;
  staffBottom: number;
  lines: StandardTabLine[];
  barlines: StandardTabLine[];
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: StandardTabStrum[];
  beams: StandardTabBeam[];
  /** 需要挖空弦线的区间（渲染层在画品味数前用背景色铺上） */
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  /** 时间 → x 的换算函数（叠加层 / 播放头复用，保证与谱面像素级一致） */
  timeToX: (offsetSec: number) => number;
  beatSec: number;
}

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

/** 左手手指 → 谱面短记号（0 = 空弦） */
export const FINGER_MARKS: Record<number, string> = { 0: '○', 1: '1', 2: '2', 3: '3', 4: '4' };

const TECHNIQUE_MARKS: Record<string, string> = {
  'hammer-on': 'H',
  'pull-off': 'P',
  slide: 'S',
  bend: 'B',
  vibrato: '~',
  harmonic: '<>',
  'palm-mute': 'PM',
  'dead-note': 'x',
  tap: 'T',
};

/** 同一时刻（和弦/扫弦）的判定容差 */
const CLUSTER_TOLERANCE_SEC = 0.02;

export function toRoman(value: number): string {
  const table: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.min(24, Math.round(value)));
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/**
 * 时值 → 节奏连接符层数。
 * `flags = 0` 表示 ≥ 1 拍（四分音符及以上，不需要连接符）。
 */
export function durationToBeamLevels(durationSec: number, beatSec: number): number {
  if (!(beatSec > 0)) return 0;
  const beats = durationSec / beatSec;
  if (beats >= 0.75) return 0; // 四分音符以上
  if (beats >= 0.375) return 1; // 八分音符
  if (beats >= 0.1875) return 2; // 十六分音符
  return 3; // 三十二分
}

// ─────────────────────────────────────────────
// 主函数
// ─────────────────────────────────────────────

export function buildStandardTabLayout(options: StandardTabLayoutOptions): StandardTabLayout {
  const metrics = options.metrics || CMS_TAB_METRICS;
  const stringCount = Math.max(4, Math.min(7, options.tuning?.length || 6));
  const width = Math.max(200, options.width);
  const measureDuration = Math.max(0.05, options.measureDuration || 0);
  const [beatsRaw, beatValueRaw] = String(options.timeSignature || '4/4').split('/');
  const beatsPerMeasure = parseInt(beatsRaw, 10) || 4;
  const beatValue = parseInt(beatValueRaw, 10) || 4;
  /** 一拍的秒数（与后端 `measureDurationSec` 口径一致） */
  const beatSec = (60 / (options.bpm > 0 ? options.bpm : 120)) * (4 / beatValue);

  const staffTop = metrics.staffTop;
  const stringYs = Array.from({ length: stringCount }, (_, i) => staffTop + i * metrics.lineSpacing);
  const staffBottom = stringYs[stringCount - 1];
  const staffLeft = metrics.staffLeftX;
  const staffRight = width - metrics.noteAreaRight;
  const contentLeft = options.showClef ? metrics.noteAreaLeft : metrics.noteAreaLeft - 28;
  const contentWidth = Math.max(40, staffRight - contentLeft);

  const timeToX = (offsetSec: number) => {
    const ratio = Math.min(1, Math.max(0, Number(offsetSec) / measureDuration));
    return contentLeft + ratio * contentWidth;
  };

  // ── 弦线（第 6 弦更粗）──
  const lines: StandardTabLine[] = stringYs.map((y, i) => ({
    x1: staffLeft,
    y1: y,
    x2: staffRight,
    y2: y,
    width: i === stringCount - 1 ? 2 : 1,
  }));

  // ── 小节线（末小节：一细一粗）──
  const barY1 = staffTop - 5;
  const barY2 = staffBottom + 5;
  const barlines: StandardTabLine[] = [
    { x1: staffRight, y1: barY1, x2: staffRight, y2: barY2, width: options.isLastMeasure ? 4 : 1.4 },
  ];
  if (options.isLastMeasure) {
    barlines.unshift({ x1: staffRight - 7, y1: barY1, x2: staffRight - 7, y2: barY2, width: 1 });
  }

  // ── 拍点刻度（弦线下方短竖线）──
  const beatTicks = Array.from({ length: beatsPerMeasure + 1 }, (_, i) => ({
    x: timeToX((i / beatsPerMeasure) * measureDuration),
    y1: staffBottom + 5,
    y2: staffBottom + 12,
  }));

  const texts: StandardTabText[] = [];

  // ── TAB 谱号：T → 2 弦，A → 4 弦，B → 6 弦 ──
  if (options.showClef) {
    const clefRows = [
      { text: 'T', lineIndex: 1 },
      { text: 'A', lineIndex: Math.min(3, stringCount - 1) },
      { text: 'B', lineIndex: stringCount - 1 },
    ];
    for (const row of clefRows) {
      texts.push({
        text: row.text,
        x: metrics.clefX,
        y: stringYs[row.lineIndex] + metrics.fontSize * 0.36,
        size: metrics.fontSize + 1,
        role: 'clef',
      });
    }
    // ── 拍号：分子在 2-3 弦之间，分母在 4-5 弦之间 ──
    const midY = (index: number) => (stringYs[index] + stringYs[index + 1]) / 2 + metrics.fontSize * 0.34;
    texts.push({
      text: String(beatsPerMeasure),
      x: metrics.timeSignatureX,
      y: midY(1),
      size: metrics.fontSize + 1,
      role: 'timeTop',
    });
    texts.push({
      text: String(beatValue),
      x: metrics.timeSignatureX,
      y: midY(stringCount - 3),
      size: metrics.fontSize + 1,
      role: 'timeBottom',
    });
  }

  // ── 速度标记 ♪ = 90（全曲第一小节）──
  if (options.showTempo) {
    texts.push({
      text: `♪ = ${Math.round(options.bpm > 0 ? options.bpm : 90)}`,
      x: staffLeft + 2,
      y: metrics.chordRowY - 6,
      size: metrics.fontSize - 1,
      role: 'tempo',
    });
  }

  // ── 小节号：画在**右上角**（与左上角的把位标记对角分开，两个数字不再连在一起误读）──
  if (typeof options.measureIndex === 'number' && options.measureIndex > 0) {
    const label = String(options.measureIndex);
    const size = metrics.fontSize - 2;
    texts.push({
      text: label,
      x: staffRight - 2 - label.length * size * 0.62,
      y: metrics.chordRowY - 2,
      size,
      role: 'measureNumber',
    });
  }

  // ── 把位标记：左上角，**阿拉伯数字**（不再用罗马数字）+ 「把位」小字 ──
  if (typeof options.position === 'number' && options.position >= 1) {
    const label = String(Math.round(options.position));
    const size = metrics.fontSize + 1;
    texts.push({
      text: label,
      x: staffLeft + 2,
      y: staffTop - 2,
      size,
      role: 'position',
    });
    texts.push({
      text: '把位',
      x: staffLeft + 2 + label.length * size * 0.62 + 4,
      y: staffTop - 2,
      size: metrics.fontSize - 3,
      role: 'positionLabel',
    });
  }

  // ── 和弦名称（弦线上方）──
  const seenChordAt = new Set<string>();
  for (const chord of options.chords || []) {
    const name = String(chord.name || '').trim();
    if (!name) continue;
    const key = `${name}@${Number(chord.offsetSec).toFixed(2)}`;
    if (seenChordAt.has(key)) continue;
    seenChordAt.add(key);
    texts.push({
      text: name,
      x: timeToX(chord.offsetSec),
      y: metrics.chordRowY,
      size: metrics.fontSize + 1,
      role: 'chord',
    });
  }

  // ── 品味数 + 手指上标 ──
  const sorted = [...(options.notes || [])].sort(
    (a, b) => a.offsetSec - b.offsetSec || a.string - b.string,
  );

  const notes: StandardTabLayoutNote[] = [];
  const lineGaps: StandardTabLayout['lineGaps'] = [];
  /** 与 `notes` 一一对应的原始输入（保留 offsetSec / durationSec 供后续分组） */
  const paired: Array<{ input: StandardTabNoteInput; laid: StandardTabLayoutNote }> = [];
  /** 小节内换把：手位发生变化时在谱面上补一个小号标记（否则品位无法反推） */
  let currentNotePosition: number | null = null;

  for (const note of sorted) {
    const stringIndex = Math.min(Math.max(1, note.string), stringCount);
    const x = timeToX(note.offsetSec);
    const y = stringYs[stringIndex - 1];
    const fingerMark =
      typeof note.finger === 'number' && FINGER_MARKS[note.finger] ? FINGER_MARKS[note.finger] : undefined;
    /** 主数字：默认写手指号（品位由把位标记反推），复核模式写品位 */
    const useFingerAsDigit = (options.noteLabel || 'finger') === 'finger' && !!fingerMark;
    const text = note.fret < 0 ? 'x' : useFingerAsDigit ? (fingerMark as string) : String(note.fret);
    /** 主数字「落在弦线上」，需要把弦线挖掉一块（宽 = 文字宽 + 内边距） */
    const maskWidth = metrics.fontSize * 0.68 * Math.max(1, text.length) + 5;
    const maskHeight = metrics.fontSize + 3;

    const laid: StandardTabLayoutNote = {
      id: note.id,
      string: stringIndex,
      x,
      y,
      text,
      fret: note.fret,
      finger: typeof note.finger === 'number' ? note.finger : undefined,
      position: typeof note.position === 'number' ? note.position : undefined,
      maskWidth,
      maskHeight,
    };

    // 主数字已经是手指号时不再重复画上标
    if (fingerMark && !useFingerAsDigit) {
      laid.fingerText = fingerMark;
      laid.fingerX = x + maskWidth / 2 - 1;
      laid.fingerY = y - maskHeight / 2 + 1;
    }

    const tech = String(note.technique || 'normal');
    if (tech !== 'normal' && TECHNIQUE_MARKS[tech]) {
      laid.techniqueText = TECHNIQUE_MARKS[tech];
      laid.techniqueX = x - maskWidth / 2 - 3;
      laid.techniqueY = y - maskHeight / 2 + 1;
    }

    notes.push(laid);
    paired.push({ input: note, laid });
    lineGaps.push({ y, x1: x - maskWidth / 2, x2: x + maskWidth / 2 });

    // 换把标记：与其他音符的手位不同 → 在该音左上方印一个小号「N把位」
    if (typeof note.position === 'number' && note.position >= 1) {
      if (currentNotePosition === null) {
        currentNotePosition = note.position;
      } else if (note.position !== currentNotePosition) {
        currentNotePosition = note.position;
        texts.push({
          text: `${note.position}把位`,
          x: Math.max(staffLeft + 1, x - maskWidth / 2),
          y: stringYs[0] - metrics.lineSpacing + metrics.fontSize * 0.36,
          size: metrics.fontSize - 3.5,
          role: 'positionShift',
        });
      }
    }
  }

  /**
   * ── 和弦簇 / 扫弦识别 ──
   *
   * 同一发音时刻（±20ms）落在同一 x 上：品味数自然按弦线竖排 ——
   * 这正是参考谱面里和弦的写法。若同时发音的弦 ≥ 3 根，再补一个**扫弦箭头**，
   * 明确「这几根弦是一次扫下去的」而不是分散的指弹。
   */
  const strums: StandardTabStrum[] = [];
  const clusterMemberIds = new Set<string>();
  let strumSeq = 0;

  let i = 0;
  while (i < paired.length) {
    const onset = paired[i].input.offsetSec;
    let j = i;
    while (j + 1 < paired.length && Math.abs(paired[j + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) {
      j += 1;
    }
    const group = paired.slice(i, j + 1);
    if (group.length >= 2) {
      for (const member of group) clusterMemberIds.add(member.laid.id);
      if (group.length >= 3) {
        const id = `strum_${strumSeq++}`;
        const ys = group.map((g) => g.laid.y);
        for (const member of group) member.laid.strumId = id;
        strums.push({
          id,
          x: Math.min(...group.map((g) => g.laid.x)) - 10,
          yTop: Math.min(...ys) - 5,
          yBottom: Math.max(...ys) + 5,
          /** 箭头朝下 = 从低音弦扫向高音弦（最自然的向下扫弦） */
          direction: 'down',
          stringCount: group.length,
        });
      }
    }
    i = j + 1;
  }

  /**
   * ── 节奏连接符（beam）──
   *
   * 时值短于 1 拍的相邻音符连成一组（以「拍」为界），在弦线下方画横线：
   * 1 条 = 8 分音符，2 条 = 16 分音符。和弦簇用扫弦箭头表达，不参与连接。
   */
  const beams: StandardTabBeam[] = [];
  const beamBaseY = staffBottom + 19;
  let beamGroup: Array<{ x: number; levels: number; beatIndex: number }> = [];

  const flushBeamGroup = () => {
    if (beamGroup.length >= 2) {
      const x1 = Math.min(...beamGroup.map((g) => g.x));
      const x2 = Math.max(...beamGroup.map((g) => g.x));
      const maxLevel = Math.max(...beamGroup.map((g) => g.levels));
      for (let level = 1; level <= maxLevel; level += 1) {
        beams.push({ x1, x2, y: beamBaseY + (level - 1) * 5, level });
      }
    }
    beamGroup = [];
  };

  for (const { input, laid } of paired) {
    const levels = durationToBeamLevels(input.durationSec, beatSec);
    if (levels <= 0 || clusterMemberIds.has(laid.id)) {
      flushBeamGroup();
      continue;
    }
    const beatIndex = Math.floor(input.offsetSec / (beatSec || 1) + 1e-6);
    if (beamGroup.length > 0 && beamGroup[beamGroup.length - 1].beatIndex !== beatIndex) {
      flushBeamGroup();
    }
    beamGroup.push({ x: laid.x, levels, beatIndex });
  }
  flushBeamGroup();

  return {
    metrics,
    stringCount,
    stringYs,
    staffTop,
    staffBottom,
    lines,
    barlines,
    beatTicks,
    texts,
    notes,
    strums,
    beams,
    lineGaps,
    timeToX,
    beatSec,
  };
}

/** 从复核视图模型的音符/和弦直接排版（CMS 专用便捷包装） */
export function buildLayoutFromReviewMeasure(params: {
  notes: ReviewNote[];
  chords: Array<{ name: string; offsetSec: number }>;
  measureDuration: number;
  bpm: number;
  timeSignature?: string;
  tuning?: number[];
  position?: number;
  width: number;
  height: number;
  measureIndex?: number;
  showClef?: boolean;
  showTempo?: boolean;
  isLastMeasure?: boolean;
  metrics?: StandardTabMetrics;
}): StandardTabLayout {
  return buildStandardTabLayout({
    notes: params.notes.map((n) => ({
      id: n.id,
      string: n.string,
      fret: n.fret,
      offsetSec: n.offsetSec,
      durationSec: n.durationSec,
      finger: n.finger,
      technique: n.technique,
      chordName: n.chordName,
    })),
    chords: params.chords,
    measureDuration: params.measureDuration,
    bpm: params.bpm,
    timeSignature: params.timeSignature,
    tuning: params.tuning,
    position: params.position,
    width: params.width,
    height: params.height,
    measureIndex: params.measureIndex,
    showClef: params.showClef,
    showTempo: params.showTempo,
    isLastMeasure: params.isLastMeasure,
    metrics: params.metrics,
  });
}
