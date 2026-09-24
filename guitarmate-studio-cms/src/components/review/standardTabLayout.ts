/**
 * 标准六线谱排版引擎（Standard Tab Layout Engine）
 * ===============================================
 *
 * 目标：让本项目渲染出来的谱面与**市面上主流练习谱**一致（TAB 谱号 / 把位 /
 * 推荐和弦 / 节奏线 / 品位数字 / 扫弦箭头），而不是自成一派的「圆圈里写数字」。
 *
 * ```
 *  ♪ = 90            第 1–3 小节（一个「编辑段落」= 2-3 小节并排）
 *    D           A           Bm              ← 推荐和弦（每小节一个）
 *  2 把位      1 把位       1 把位           ← **把位是第一顺位标注**（每小节左上角）
 *  T│─0──2──3──┬─0──2──2──┬─2──4──4──│
 *  A│──────────┼──────────┼──────────│
 *  B│══════════╪══════════╪══════════│       ← 最粗的低音 E 弦线（加粗）
 *     │   │   │   │  │   │   │   │
 *     ╞═════╡  ╞════╡  ╞═════╡               ← 节奏线：符干 + 连接符（8/16 分音符）
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
 * | 和弦名 | 弦线上方，落在和弦开始的时间点上；每小节还可带一个**推荐和弦** |
 * | 把位 | **第一顺位标注**：每个小节左上角「N 把位」；小节内换把再补一个小号标记 |
 * | 品味数 | **直接落在弦线上**（六线谱的第一信息），弦线在该处被背景色挖空（`lineGaps`） |
 * | 手指 | **次要标注**：品味数右上角的小上标（1=食指…4=小指）。默认不画（`noteLabel='fret'`） |
 * | 节奏线 | 弦线下方一整行**节奏线**：符干（stem）+ 连接符（beam）/ 符尾（flag）+ 拍点刻度 |
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
  /** 节奏线（符干 / 连接符）与最低弦线的间距 */
  rhythmRowGap: number;
  /** 谱内进度条与最低弦线的间距（播放行进指示） */
  progressRowGap: number;
  /** 不画谱号时内容区相对 `noteAreaLeft` 的左移量（TAB 谱号 + 拍号占的宽度） */
  clefWidth: number;
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
  rhythmRowGap: 19,
  progressRowGap: 49,
  clefWidth: 28,
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
  rhythmRowGap: 19,
  progressRowGap: 43,
  clefWidth: 22,
};

export interface StandardTabLayoutOptions {
  notes: StandardTabNoteInput[];
  chords?: StandardTabChordInput[];
  /** 推荐和弦（小节级）：没有 `chords[]` 时画在小节左上角，作为整小节的编配提示 */
  chord?: string;
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
   * - `'fret'`（**默认**，市场练习谱写法）：弦线上的数字 = **品位**；
   *   把位是第一顺位标注，品位数才是六线谱最核心的信息；
   * - `'finger'`：弦线上的数字 = **左手手指号**（1-4，0 = ○），
   *   品位由左上角把位标记 + `fret = position + finger − 1` 反推（信息量更低，仅在复核纠错时用）。
   */
  noteLabel?: 'finger' | 'fret';
  /**
   * 是否在品位数字右上角画**手指上标**（1-4 / ○）。
   * 默认 `false` —— 把位才是第一顺位标注，手指只在「复核左手指法」时才需要。
   */
  showFinger?: boolean;
  /** 是否画节奏线（符干 / 连接符 / 符尾）；默认 true */
  showRhythm?: boolean;
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

/** 节奏线的符干：从发音点最低的那根弦垂到节奏线 */
export interface StandardTabStem {
  x: number;
  /** 起点（发音簇里最低的那根弦 + 5px） */
  y1: number;
  /** 终点（节奏线 y） */
  y2: number;
  /** 0 = 四分音符及以上（只有符干）；≥1 = 需要连接符，落单时画符尾 */
  levels: number;
  /** 所属连接符组（同一组的符干共享一条横线）；落单的短音符没有此字段 → 渲染层画符尾 */
  beamId?: string;
}

export interface StandardTabLayout {
  metrics: StandardTabMetrics;
  stringCount: number;
  /** 弦线 y（索引 0 = 一弦 / 最上方） */
  stringYs: number[];
  staffTop: number;
  staffBottom: number;
  /** 节奏线的 y（符干终点 / 连接符基线） */
  rhythmY: number;
  /** 谱内进度条的 y（播放行进指示） */
  progressY: number;
  lines: StandardTabLine[];
  barlines: StandardTabLine[];
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: StandardTabStrum[];
  beams: StandardTabBeam[];
  /** 节奏线的符干（每个发音点一条，和弦簇共用一条） */
  stems: StandardTabStem[];
  /** 需要挖空弦线的区间（渲染层在画品味数前用背景色铺上） */
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  /** 音符内容区左右边界（谱行布局靠它把小节横向平移，不需要猜内部的留白常量） */
  contentLeft: number;
  contentRight: number;
  /** 时间 → x 的换算函数（叠加层 / 播放头复用，保证与谱面像素级一致） */
  timeToX: (offsetSec: number) => number;
  /** 本小节的基准拍长（= 小节时长 / 拍数，与拍点刻度同一口径） */
  beatSec: number;
}

// ─────────────────────────────────────────────
// 谱行（System）排版 —— 一个「编辑段落」= 2-3 个小节并排
// ─────────────────────────────────────────────

/** 一个谱行里的小节输入 */
export interface StandardTabSystemMeasureInput {
  /** 显示小节号（1 起）；≤0 表示不画 */
  index: number;
  notes: StandardTabNoteInput[];
  /** 小节内和弦变化（相对小节起点） */
  chords?: StandardTabChordInput[];
  /** 推荐和弦（小节级）：`chords[]` 为空时画在小节左上角 */
  chord?: string;
  /** 本小节把位（第 P 把位）——谱面上第一顺位的标注 */
  position?: number;
  /** 本小节时长（秒）；缺省用谱行的 `measureDuration` */
  duration?: number;
  /** 小节标签（复核列表 / 无障碍用） */
  label?: string;
}

/** 谱行内单小节的坐标映射 */
export interface StandardTabSystemMeasureLayout {
  index: number;
  label?: string;
  /** 小节内容区左右边界（音符可画范围） */
  contentLeft: number;
  contentRight: number;
  /** 时间 → x（**小节内**相对秒数） */
  timeToX: (offsetSec: number) => number;
  /** 小节时长（秒） */
  duration: number;
  /** 本小节把位 */
  position?: number;
  /** 本小节推荐和弦 */
  chord?: string;
  noteCount: number;
}

export interface StandardTabSystemOptions {
  /** 一个谱行 2-3 个小节（`MAX_MEASURES_PER_SYSTEM` 封顶） */
  measures: StandardTabSystemMeasureInput[];
  bpm: number;
  timeSignature?: string;
  tuning?: number[];
  /** 缺省小节时长（秒）；单小节给 `duration` 时以它为准 */
  measureDuration?: number;
  width: number;
  height: number;
  /** 画 TAB 谱号 + 拍号（通常是**每条谱行**的第一小节） */
  showClef?: boolean;
  /** 画速度标记 ♪ = N（全曲第一小节） */
  showTempo?: boolean;
  /** 收尾双粗线（全曲最后一个谱行） */
  isLastSystem?: boolean;
  /** 弦线数字：默认品位（把位优先），`'finger'` 仅复核纠错用 */
  noteLabel?: 'finger' | 'fret';
  /** 是否画手指上标（默认 false：把位优先） */
  showFinger?: boolean;
  /** 是否画节奏线（默认 true） */
  showRhythm?: boolean;
  metrics?: StandardTabMetrics;
}

export interface StandardTabSystemLayout {
  metrics: StandardTabMetrics;
  stringCount: number;
  stringYs: number[];
  staffTop: number;
  staffBottom: number;
  rhythmY: number;
  /** 谱内进度条的 y（播放行进指示） */
  progressY: number;
  lines: StandardTabLine[];
  barlines: StandardTabLine[];
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: StandardTabStrum[];
  beams: StandardTabBeam[];
  stems: StandardTabStem[];
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  /** 谱行内的小节（按顺序，含各自的 timeToX） */
  measures: StandardTabSystemMeasureLayout[];
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
  /**
   * 一拍的秒数 = **小节时长 / 拍数**（与拍点刻度同一口径）。
   *
   * ⚠️ 这里刻意**不用** `60 / bpm`：历史数据的「小节窗口」与 DB 里的 BPM 经常对不上
   * （例：Pachelbel 卡农的窗口是 2.4s 而 bpm=80/4/4 推出 3.0s），
   * 用 BPM 算节奏线会与谱面错位。BPM 只用于「♪ = N」的文字标注。
   */
  const beatSec = measureDuration / beatsPerMeasure;

  const staffTop = metrics.staffTop;
  const stringYs = Array.from({ length: stringCount }, (_, i) => staffTop + i * metrics.lineSpacing);
  const staffBottom = stringYs[stringCount - 1];
  const staffLeft = metrics.staffLeftX;
  const staffRight = width - metrics.noteAreaRight;
  const contentLeft = options.showClef ? metrics.noteAreaLeft : metrics.noteAreaLeft - metrics.clefWidth;
  const contentWidth = Math.max(40, staffRight - contentLeft);

  /** 谱内进度条（播放行进条）的 y —— 渲染层用它画进度与播放头 */
  const progressY = staffBottom + metrics.progressRowGap;

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

  // ── 推荐和弦（小节级）：`chords[]` 没给时，用它当本小节的编配提示 ──
  const recommendedChord = String(options.chord || '').trim();
  if (recommendedChord && !seenChordAt.has(`${recommendedChord}@0.00`)) {
    const hasChordAtStart = (options.chords || []).some(
      (c) => Math.abs(Number(c.offsetSec) || 0) < CLUSTER_TOLERANCE_SEC,
    );
    if (!hasChordAtStart) {
      texts.push({
        text: recommendedChord,
        x: contentLeft,
        y: metrics.chordRowY,
        size: metrics.fontSize + 1,
        role: 'chord',
      });
    }
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
    /** 主数字：默认写**品位**（把位优先），复核纠错时可切到手指号 */
    const useFingerAsDigit = (options.noteLabel || 'fret') === 'finger' && !!fingerMark;
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

    // 主数字已经是手指号时不再重复画上标；默认也不画（把位优先，手指只在复核时显示）
    if (fingerMark && !useFingerAsDigit && options.showFinger) {
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
  let strumSeq = 0;

  let i = 0;
  while (i < paired.length) {
    const onset = paired[i].input.offsetSec;
    let j = i;
    while (j + 1 < paired.length && Math.abs(paired[j + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) {
      j += 1;
    }
    const group = paired.slice(i, j + 1);
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
    i = j + 1;
  }

  /**
   * ── 节奏线（rhythm row）──
   *
   * 弦线下方一整行节奏标注（参考谱面的第三行）：
   * - **符干（stem）**：每个发音点一条竖线，从该点最低的那根弦垂到节奏线；
   *   和弦簇整簇共用一条（与实际记谱一致）；
   * - **连接符（beam）**：时值 < 1 拍的相邻发音点在同一拍内连成一组横线
   *   （1 条 = 8 分音符，2 条 = 16 分音符）；同拍内落单的短音符画**符尾（flag）**；
   * - 时值 ≥ 1 拍（四分音符及以上）只有符干、没有连接符。
   *
   * 时间轴用**本小节的节拍网格**（`beatSec = 小节时长 / 拍数`），与拍点刻度同口径 ——
   * 即使历史数据的小节窗口与 BPM 对不上，节奏线也不会与谱面错位。
   */
  const stems: StandardTabStem[] = [];
  const beams: StandardTabBeam[] = [];
  const rhythmY = staffBottom + metrics.rhythmRowGap;
  /** 节奏线总开关：关掉后既不画符干也不画连接符 */
  const showRhythm = options.showRhythm !== false;

  /** 发音点（同一时刻 ±20ms 的所有弦归为一组） */
  const onsets: Array<{ x: number; yBottom: number; levels: number; beatIndex: number }> = [];
  let oi = 0;
  while (oi < paired.length) {
    const onset = paired[oi].input.offsetSec;
    let oj = oi;
    let maxDuration = 0;
    while (
      oj + 1 < paired.length &&
      Math.abs(paired[oj + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC
    ) {
      oj += 1;
    }
    const group = paired.slice(oi, oj + 1);
    for (const member of group) maxDuration = Math.max(maxDuration, member.input.durationSec);
    onsets.push({
      x: group[0].laid.x,
      yBottom: Math.max(...group.map((g) => g.laid.y)),
      levels: durationToBeamLevels(maxDuration, beatSec),
      beatIndex: Math.floor(onset / (beatSec || 1) + 1e-6),
    });
    oi = oj + 1;
  }

  if (showRhythm) {
    for (const onset of onsets) {
      stems.push({ x: onset.x, y1: onset.yBottom + 5, y2: rhythmY, levels: onset.levels });
    }
  }

  let beamSeq = 0;
  let beamGroup: Array<{ x: number; levels: number; beatIndex: number }> = [];

  const flushBeamGroup = () => {
    if (showRhythm && beamGroup.length >= 2) {
      const id = `beam_${beamSeq++}`;
      const maxLevel = Math.max(...beamGroup.map((g) => g.levels));
      for (let level = 1; level <= maxLevel; level += 1) {
        // 高层横线只覆盖真正需要的音（16 分音符的第二条横线不跨到 8 分音符上）
        const members = beamGroup.filter((g) => g.levels >= level);
        if (members.length === 0) continue;
        const xs = members.map((g) => g.x);
        const x1 = Math.min(...xs);
        /** 该层落单 → 画一小段**部分横线**（记谱里的 fractional beam），而不是硬拉过去 */
        const x2 = members.length === 1 ? x1 + 5 : Math.max(...xs);
        beams.push({ x1, x2, y: rhythmY + (level - 1) * 5, level });
      }
      // 记下同一组内的符干 → 渲染层据此不再画符尾
      for (const stem of stems) {
        if (beamGroup.some((g) => Math.abs(g.x - stem.x) < 0.01)) stem.beamId = id;
      }
    }
    beamGroup = [];
  };

  for (const onset of onsets) {
    if (onset.levels <= 0) {
      flushBeamGroup();
      continue;
    }
    if (beamGroup.length > 0 && beamGroup[beamGroup.length - 1].beatIndex !== onset.beatIndex) {
      flushBeamGroup();
    }
    beamGroup.push(onset);
  }
  flushBeamGroup();

  return {
    metrics,
    stringCount,
    stringYs,
    staffTop,
    staffBottom,
    rhythmY,
    progressY,
    lines,
    barlines,
    beatTicks,
    texts,
    notes,
    strums,
    beams,
    stems,
    lineGaps,
    contentLeft,
    contentRight: staffRight,
    timeToX,
    beatSec,
  };
}

// ─────────────────────────────────────────────
// 谱行（System）：把 2-3 个小节排进同一行
// ─────────────────────────────────────────────

/** 一个谱行最多放几个小节（参考谱面 2-3 个，超过 3 个品位数会挤到看不清） */
export const MAX_MEASURES_PER_SYSTEM = 3;
/** 小节之间的留白（避免上一小节末尾的音符压到小节线） */
const MEASURE_GUTTER = 14;

/**
 * 谱行排版引擎：**一个「编辑段落」= 2-3 个小节并排**。
 *
 * 实现方式：每个小节仍然由 `buildStandardTabLayout()` 排（同一套规则、单测已覆盖），
 * 谱行层只做三件事 ——
 * 1. **切槽位**：把小节可画区按小节数等分，得到每个小节的 `contentLeft/contentRight`；
 * 2. **整体平移**：按 `dx = 目标 contentLeft − 该小节实际 contentLeft` 平移该小节的所有坐标
 *    （弦线 / 音符 / 符干 / 挖空区 / 文字），因此不需要猜任何内部留白常量；
 * 3. **重新铺公共元素**：字符串横贯整行、小节线画在槽位之间、谱号/拍号/速度只画一次。
 *
 * 谱面元素与单小节完全一致 —— 把位（左上角「N 把位」）、推荐和弦（弦线上方）、
 * 品位数字（弦线上）、节奏线（符干 + 连接符）。
 */
export function buildStandardTabSystemLayout(options: StandardTabSystemOptions): StandardTabSystemLayout {
  const metrics = options.metrics || CMS_TAB_METRICS;
  const source: StandardTabSystemMeasureInput[] =
    options.measures && options.measures.length ? options.measures : [{ index: 0, notes: [] }];
  const inputMeasures = source.slice(0, MAX_MEASURES_PER_SYSTEM);
  const count = inputMeasures.length;

  const systemLeft = metrics.noteAreaLeft;
  const systemRight = Math.max(systemLeft + 60, options.width - metrics.noteAreaRight);
  const slotWidth = (systemRight - systemLeft) / count;

  const texts: StandardTabText[] = [];
  const notes: StandardTabLayoutNote[] = [];
  const lineGaps: StandardTabSystemLayout['lineGaps'] = [];
  const stems: StandardTabStem[] = [];
  const beams: StandardTabBeam[] = [];
  const strums: StandardTabStrum[] = [];
  const beatTicks: StandardTabSystemLayout['beatTicks'] = [];
  const layoutMeasures: StandardTabSystemMeasureLayout[] = [];

  let staffTop = metrics.staffTop;
  let staffBottom = metrics.staffTop + 5 * metrics.lineSpacing;
  let rhythmY = staffBottom + metrics.rhythmRowGap;
  let progressY = staffBottom + metrics.progressRowGap;
  let stringYs: number[] = [];
  let stringCount = 6;
  let beatSec = 0;

  inputMeasures.forEach((measure, slot) => {
    const slotLeft = systemLeft + slot * slotWidth;
    const slotRight = slot === count - 1 ? systemRight : slotLeft + slotWidth - MEASURE_GUTTER;
    const duration = Math.max(
      0.05,
      measure.duration && measure.duration > 0
        ? measure.duration
        : options.measureDuration && options.measureDuration > 0
          ? options.measureDuration
          : 2,
    );

    /** 本小节单独排版时的内容区宽度 —— 由目标槽位宽度反推画布宽度 */
    const showClef = !!options.showClef && slot === 0;
    const innerContentLeft = showClef ? metrics.noteAreaLeft : metrics.noteAreaLeft - metrics.clefWidth;
    const targetWidth = Math.max(60, slotRight - slotLeft);
    const inner = buildStandardTabLayout({
      notes: measure.notes,
      chords: measure.chords,
      chord: measure.chord,
      measureDuration: duration,
      bpm: options.bpm,
      timeSignature: options.timeSignature,
      tuning: options.tuning,
      position: measure.position,
      width: targetWidth + innerContentLeft + metrics.noteAreaRight,
      height: options.height,
      measureIndex: measure.index,
      showClef,
      showTempo: !!options.showTempo && slot === 0,
      noteLabel: options.noteLabel,
      showFinger: options.showFinger,
      showRhythm: options.showRhythm,
      metrics,
    });

    const dx = slotLeft - inner.contentLeft;
    const shift = (x: number) => x + dx;

    if (slot === 0) {
      staffTop = inner.staffTop;
      staffBottom = inner.staffBottom;
      rhythmY = inner.rhythmY;
      progressY = inner.progressY;
      stringYs = inner.stringYs;
      stringCount = inner.stringCount;
      beatSec = inner.beatSec;
    }

    for (const note of inner.notes) {
      notes.push({
        ...note,
        x: shift(note.x),
        fingerX: typeof note.fingerX === 'number' ? shift(note.fingerX) : note.fingerX,
        techniqueX: typeof note.techniqueX === 'number' ? shift(note.techniqueX) : note.techniqueX,
      });
    }
    for (const stem of inner.stems) stems.push({ ...stem, x: shift(stem.x) });
    for (const beam of inner.beams) beams.push({ ...beam, x1: shift(beam.x1), x2: shift(beam.x2) });
    for (const strum of inner.strums) strums.push({ ...strum, x: shift(strum.x) });
    for (const gap of inner.lineGaps) lineGaps.push({ ...gap, x1: shift(gap.x1), x2: shift(gap.x2) });
    for (const tick of inner.beatTicks) beatTicks.push({ ...tick, x: shift(tick.x) });

    /**
     * 文字要按「小节槽位」重新定位，而不是照搬平移结果：
     * - 把位 / 「把位」小字 → 本小节**左上角**（第一顺位标注，每个小节都有自己的）
     * - 速度标记 → 谱行最左侧（只有第一小节有）
     * - 小节号 → 本小节**右上角**（与把位对角分开）
     */
    for (const text of inner.texts) {
      if (text.role === 'position') {
        texts.push({ ...text, x: slotLeft + 2 });
      } else if (text.role === 'positionLabel') {
        // 「把位」小字紧跟在把位数字后面（宽度按实际字号与位数算，两端一致）
        const positionText = inner.texts.find((t) => t.role === 'position');
        const offset = positionText ? positionText.text.length * positionText.size * 0.62 + 4 : 0;
        texts.push({ ...text, x: slotLeft + 2 + offset });
      } else if (text.role === 'measureNumber') {
        texts.push({ ...text, x: slotRight - 2 - text.text.length * text.size * 0.62 });
      } else if (text.role === 'tempo' || text.role === 'clef' || text.role.startsWith('time')) {
        texts.push(text);
      } else {
        texts.push({ ...text, x: shift(text.x) });
      }
    }

    layoutMeasures.push({
      index: measure.index,
      label: measure.label,
      contentLeft: inner.contentLeft + dx,
      contentRight: inner.contentRight + dx,
      timeToX: (offsetSec: number) => shift(inner.timeToX(offsetSec)),
      duration,
      position: measure.position,
      chord: measure.chord,
      noteCount: inner.notes.length,
    });
  });

  const staffLeft = metrics.staffLeftX;
  const lines: StandardTabLine[] = Array.from({ length: stringCount }, (_, i) => ({
    x1: staffLeft,
    y1: stringYs[i],
    x2: systemRight,
    y2: stringYs[i],
    width: i === stringCount - 1 ? 2 : 1,
  }));

  const barY1 = staffTop - 5;
  const barY2 = staffBottom + 5;
  const barlines: StandardTabLine[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    const x = slot === count - 1 ? systemRight : systemLeft + (slot + 1) * slotWidth - MEASURE_GUTTER / 2;
    /** 粗收尾线只给**本谱行的最后一个小节**（中间的小节线一律普通粗细） */
    const isFinalBar = options.isLastSystem && slot === count - 1;
    barlines.push({ x1: x, y1: barY1, x2: x, y2: barY2, width: isFinalBar ? 4 : 1.4 });
  }
  if (options.isLastSystem) {
    barlines.unshift({ x1: systemRight - 7, y1: barY1, x2: systemRight - 7, y2: barY2, width: 1 });
  }

  return {
    metrics,
    stringCount,
    stringYs,
    staffTop,
    staffBottom,
    rhythmY,
    progressY,
    lines,
    barlines,
    beatTicks,
    texts,
    notes,
    strums,
    beams,
    stems,
    lineGaps,
    measures: layoutMeasures,
    beatSec,
  };
}

/** 从复核视图模型的音符/和弦直接排版（CMS 专用便捷包装） */
export function buildLayoutFromReviewMeasure(params: {
  notes: ReviewNote[];
  chords: Array<{ name: string; offsetSec: number }>;
  /** 推荐和弦（小节级，`chords` 为空时生效） */
  chord?: string;
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
  noteLabel?: 'finger' | 'fret';
  /** 是否画手指上标（默认 false：把位优先） */
  showFinger?: boolean;
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
      position: n.position,
      technique: n.technique,
      chordName: n.chordName,
    })),
    chords: params.chords,
    chord: params.chord,
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
    noteLabel: params.noteLabel,
    showFinger: params.showFinger,
    metrics: params.metrics,
  });
}
