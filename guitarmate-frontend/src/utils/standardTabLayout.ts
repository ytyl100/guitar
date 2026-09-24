/**
 * 标准六线谱排版引擎（小程序端）
 * ==============================
 *
 * ⚠️ 本文件与 `guitarmate-studio-cms/src/components/review/standardTabLayout.ts`
 * **逻辑必须保持一致**（两个包无共享库，只能各自维护一份）——
 * 任何排版规则改动都要**同时改两处**，否则 CMS 预览与小程序实际渲染会不一致。
 * 两端唯一允许不同的是 `metrics`（像素密度）：CMS 用 1080 宽，小程序用 600 宽紧凑版。
 *
 * 输出与市面主流练习谱一致的样式（**把位优先**）：
 * ```
 *  ♪ = 90         第 1–3 小节（一个「编辑段落」= 2-3 小节并排）
 *    D        A        Bm            ← 推荐和弦（每小节一个）
 *  2 把位   1 把位    1 把位          ← 把位是第一顺位标注（每小节左上角）
 *   T│─0──2───┬─2──0───┬─4──4───│
 *   A│─────────┼─────────┼─────────│
 *   B│═════════╪═════════╪═════════│      ← 低音 E 弦线加粗
 *      │   │   │   │   │   │   │   │
 *      ╞════╡  ╞════╡  ╞══════╡        ← 节奏线：符干 + 连接符
 * ```
 */

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
}

export interface StandardTabChordInput {
  name: string;
  offsetSec: number;
}

export interface StandardTabMetrics {
  lineSpacing: number;
  staffTop: number;
  clefX: number;
  timeSignatureX: number;
  noteAreaLeft: number;
  noteAreaRight: number;
  chordRowY: number;
  measureNumberX: number;
  fontSize: number;
  fingerFontSize: number;
  staffLeftX: number;
  /** 节奏线（符干 / 连接符）与最低弦线的间距 */
  rhythmRowGap: number;
  /** 谱内进度条与最低弦线的间距（播放行进指示） */
  progressRowGap: number;
  /** 不画谱号时内容区相对 `noteAreaLeft` 的左移量（TAB 谱号 + 拍号占的宽度） */
  clefWidth: number;
}

/** 小程序紧凑版式（与 TabViewport 同为 600×142） */
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
  /** 推荐和弦（小节级）：`chords[]` 为空时画在小节左上角 */
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
  /**
   * 弦线上的数字写什么：
   * - `'fret'`（**默认**，把位优先）：数字 = **品位**；
   * - `'finger'`：数字 = 左手手指号（1-4，0 = ○），仅在复核纠错时用。
   */
  noteLabel?: 'finger' | 'fret';
  /**
   * 是否在品位数字右上角画**手指上标**（1-4 / ○）。
   * 默认 `false` —— 把位才是第一顺位标注，手指只在复核时才需要。
   */
  showFinger?: boolean;
  /** 是否画节奏线（符干 / 连接符 / 符尾）；默认 true */
  showRhythm?: boolean;
  metrics?: StandardTabMetrics;
}

export interface StandardTabText {
  text: string;
  x: number;
  y: number;
  size: number;
  role:
    | 'clef'
    | 'timeTop'
    | 'timeBottom'
    | 'tempo'
    | 'measureNumber'
    | 'chord'
    | 'position'
    | 'positionLabel'
    | 'positionShift';
}

export interface StandardTabLayoutNote {
  id: string;
  string: number;
  x: number;
  y: number;
  /** 弦线上实际绘制的字符（手指号 / 品位号 / 'x'） */
  text: string;
  /** 真实品位（永远是品位，供 title 用） */
  fret: number;
  /** 左手手指号（0 = 空弦 / 1-4） */
  finger?: number;
  maskWidth: number;
  maskHeight: number;
  /** 主数字不是手指号时，画在右上角的手指上标 */
  fingerText?: string;
  fingerX?: number;
  fingerY?: number;
  /** 该音生效的手位（换把点之后与小节把位不同） */
  position?: number;
  techniqueText?: string;
  techniqueX?: number;
  techniqueY?: number;
  strumId?: string;
}

/** 节奏线的符干：从发音点最低的那根弦垂到节奏线 */
export interface StandardTabStem {
  x: number;
  y1: number;
  y2: number;
  /** 0 = 四分音符及以上（只有符干）；≥1 = 需要连接符，落单时画符尾 */
  levels: number;
  /** 所属连接符组；落单的短音符没有此字段 → 渲染层画符尾 */
  beamId?: string;
}

export interface StandardTabLayout {
  metrics: StandardTabMetrics;
  stringCount: number;
  stringYs: number[];
  staffTop: number;
  staffBottom: number;
  /** 节奏线的 y（符干终点 / 连接符基线） */
  rhythmY: number;
  /** 谱内进度条的 y（播放行进指示） */
  progressY: number;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  barlines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: Array<{ id: string; x: number; yTop: number; yBottom: number; direction: 'down' | 'up'; stringCount: number }>;
  beams: Array<{ x1: number; x2: number; y: number; level: number }>;
  /** 节奏线的符干（每个发音点一条，和弦簇共用一条） */
  stems: StandardTabStem[];
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  /** 音符内容区左右边界（谱行布局靠它把小节横向平移） */
  contentLeft: number;
  contentRight: number;
  timeToX: (offsetSec: number) => number;
  /** 本小节的基准拍长（= 小节时长 / 拍数，与拍点刻度同一口径） */
  beatSec: number;
}

// ─────────────────────────────────────────────
// 谱行（System）排版 —— 一个「编辑段落」= 2-3 个小节并排
// ─────────────────────────────────────────────

export interface StandardTabSystemMeasureInput {
  /** 显示小节号（1 起）；≤0 表示不画 */
  index: number;
  notes: StandardTabNoteInput[];
  chords?: StandardTabChordInput[];
  /** 推荐和弦（小节级） */
  chord?: string;
  /** 本小节把位（第 P 把位） */
  position?: number;
  /** 本小节时长（秒）；缺省用谱行的 `measureDuration` */
  duration?: number;
  label?: string;
}

export interface StandardTabSystemMeasureLayout {
  index: number;
  label?: string;
  contentLeft: number;
  contentRight: number;
  /** 时间 → x（**小节内**相对秒数） */
  timeToX: (offsetSec: number) => number;
  duration: number;
  position?: number;
  chord?: string;
  noteCount: number;
}

export interface StandardTabSystemOptions {
  /** 一个谱行 2-3 个小节（`MAX_MEASURES_PER_SYSTEM` 封顶） */
  measures: StandardTabSystemMeasureInput[];
  bpm: number;
  timeSignature?: string;
  tuning?: number[];
  measureDuration?: number;
  width: number;
  height: number;
  showClef?: boolean;
  showTempo?: boolean;
  isLastSystem?: boolean;
  noteLabel?: 'finger' | 'fret';
  /** 是否画手指上标（默认 false：把位优先） */
  showFinger?: boolean;
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
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  barlines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: Array<{ id: string; x: number; yTop: number; yBottom: number; direction: 'down' | 'up'; stringCount: number }>;
  beams: Array<{ x1: number; x2: number; y: number; level: number }>;
  stems: StandardTabStem[];
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  /** 谱行内的小节（按顺序，含各自的 timeToX） */
  measures: StandardTabSystemMeasureLayout[];
  beatSec: number;
}

export const FINGER_MARKS: Record<number, string> = { 0: '○', 1: '1', 2: '2', 3: '3', 4: '4' };

const TECHNIQUE_MARKS: Record<string, string> = {
  'hammer-on': 'H',
  'pull-off': 'P',
  slide: 'S',
  bend: 'B',
  vibrato: '~',
  harmonic: '<>',
  'palm-mute': 'PM',
  mute: 'X',
  tap: 'T',
};

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

/** 时值 → 连接符层数（0 = 四分音符及以上，不需要连接符） */
export function durationToBeamLevels(durationSec: number, beatSec: number): number {
  if (!(beatSec > 0)) return 0;
  const beats = durationSec / beatSec;
  if (beats >= 0.75) return 0;
  if (beats >= 0.375) return 1;
  if (beats >= 0.1875) return 2;
  return 3;
}

export function buildStandardTabLayout(options: StandardTabLayoutOptions): StandardTabLayout {
  const metrics = options.metrics || MINI_TAB_METRICS;
  const stringCount = Math.max(4, Math.min(7, options.tuning?.length || 6));
  const width = Math.max(200, options.width);
  const measureDuration = Math.max(0.05, options.measureDuration || 0);
  const [beatsRaw, beatValueRaw] = String(options.timeSignature || '4/4').split('/');
  const beatsPerMeasure = parseInt(beatsRaw, 10) || 4;
  const beatValue = parseInt(beatValueRaw, 10) || 4;
  /**
   * 一拍的秒数 = **小节时长 / 拍数**（与拍点刻度同一口径）。
   * 不用 `60 / bpm`：历史数据的「小节窗口」与 BPM 经常对不上，用 BPM 算节奏线会与谱面错位。
   */
  const beatSec = measureDuration / beatsPerMeasure;

  const staffTop = metrics.staffTop;
  const stringYs = Array.from({ length: stringCount }, (_, i) => staffTop + i * metrics.lineSpacing);
  const staffBottom = stringYs[stringCount - 1];
  const staffLeft = metrics.staffLeftX;
  const staffRight = width - metrics.noteAreaRight;
  const contentLeft = options.showClef ? metrics.noteAreaLeft : metrics.noteAreaLeft - metrics.clefWidth;
  const contentWidth = Math.max(40, staffRight - contentLeft);

  /** 谱内进度条（播放行进条）的 y */
  const progressY = staffBottom + metrics.progressRowGap;

  const timeToX = (offsetSec: number) => {
    const ratio = Math.min(1, Math.max(0, Number(offsetSec) / measureDuration));
    return contentLeft + ratio * contentWidth;
  };

  const lines = stringYs.map((y, i) => ({
    x1: staffLeft,
    y1: y,
    x2: staffRight,
    y2: y,
    width: i === stringCount - 1 ? 2 : 1,
  }));

  const barY1 = staffTop - 4;
  const barY2 = staffBottom + 4;
  const barlines: StandardTabLayout['barlines'] = [
    { x1: staffRight, y1: barY1, x2: staffRight, y2: barY2, width: options.isLastMeasure ? 3.5 : 1.3 },
  ];
  if (options.isLastMeasure) {
    barlines.unshift({ x1: staffRight - 6, y1: barY1, x2: staffRight - 6, y2: barY2, width: 1 });
  }

  const beatTicks = Array.from({ length: beatsPerMeasure + 1 }, (_, i) => ({
    x: timeToX((i / beatsPerMeasure) * measureDuration),
    y1: staffBottom + 4,
    y2: staffBottom + 10,
  }));

  const texts: StandardTabText[] = [];

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
    const midY = (index: number) => (stringYs[index] + stringYs[index + 1]) / 2 + metrics.fontSize * 0.34;
    texts.push({ text: String(beatsPerMeasure), x: metrics.timeSignatureX, y: midY(1), size: metrics.fontSize + 1, role: 'timeTop' });
    texts.push({
      text: String(beatValue),
      x: metrics.timeSignatureX,
      y: midY(Math.max(1, stringCount - 3)),
      size: metrics.fontSize + 1,
      role: 'timeBottom',
    });
  }

  if (options.showTempo) {
    texts.push({
      text: `♪ = ${Math.round(options.bpm > 0 ? options.bpm : 90)}`,
      x: staffLeft + 2,
      y: metrics.chordRowY - 5,
      size: metrics.fontSize - 1.5,
      role: 'tempo',
    });
  }

  if (typeof options.measureIndex === 'number' && options.measureIndex > 0) {
    // 小节号画在右上角：与左上角把位标记对角分开，避免两个数字相连误读
    const label = String(options.measureIndex);
    const size = metrics.fontSize - 2;
    texts.push({
      text: label,
      x: staffRight - 2 - label.length * size * 0.62,
      y: metrics.chordRowY - 1,
      size,
      role: 'measureNumber',
    });
  }

  // 把位：左上角，阿拉伯数字（不再用罗马数字）+ 「把位」小字
  if (typeof options.position === 'number' && options.position >= 1) {
    const label = String(Math.round(options.position));
    const size = metrics.fontSize;
    texts.push({ text: label, x: staffLeft + 1, y: staffTop - 2, size, role: 'position' });
    texts.push({
      text: '把位',
      x: staffLeft + 1 + label.length * size * 0.62 + 3,
      y: staffTop - 2,
      size: metrics.fontSize - 3.5,
      role: 'positionLabel',
    });
  }

  const seenChordAt = new Set<string>();
  for (const chord of options.chords || []) {
    const name = String(chord.name || '').trim();
    if (!name) continue;
    const key = `${name}@${Number(chord.offsetSec).toFixed(2)}`;
    if (seenChordAt.has(key)) continue;
    seenChordAt.add(key);
    texts.push({ text: name, x: timeToX(chord.offsetSec), y: metrics.chordRowY, size: metrics.fontSize + 0.5, role: 'chord' });
  }

  // 推荐和弦（小节级）：`chords[]` 没给时当本小节的编配提示
  const recommendedChord = String(options.chord || '').trim();
  if (recommendedChord) {
    const hasChordAtStart = (options.chords || []).some(
      (c) => Math.abs(Number(c.offsetSec) || 0) < CLUSTER_TOLERANCE_SEC,
    );
    if (!hasChordAtStart) {
      texts.push({ text: recommendedChord, x: contentLeft, y: metrics.chordRowY, size: metrics.fontSize + 0.5, role: 'chord' });
    }
  }

  const sorted = [...(options.notes || [])].sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string);

  const notes: StandardTabLayoutNote[] = [];
  const lineGaps: StandardTabLayout['lineGaps'] = [];
  const paired: Array<{ input: StandardTabNoteInput; laid: StandardTabLayoutNote }> = [];
  /** 小节内换把：手位变化时在谱面上补一个小号标记（否则品位无法反推） */
  let currentNotePosition: number | null = null;

  for (const note of sorted) {
    const stringIndex = Math.min(Math.max(1, note.string), stringCount);
    const x = timeToX(note.offsetSec);
    const y = stringYs[stringIndex - 1];
    const fingerMark =
      typeof note.finger === 'number' && FINGER_MARKS[note.finger] ? FINGER_MARKS[note.finger] : undefined;
    // 主数字：默认写**品位**（把位优先），复核纠错时可切到手指号
    const useFingerAsDigit = (options.noteLabel || 'fret') === 'finger' && !!fingerMark;
    const text = note.fret < 0 ? 'x' : useFingerAsDigit ? (fingerMark as string) : String(note.fret);
    const maskWidth = metrics.fontSize * 0.68 * Math.max(1, text.length) + 4;
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

    // 主数字已经是手指号时不再重复画上标；默认也不画（把位优先）
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
          x: Math.max(0, x - maskWidth / 2 - 2),
          y: stringYs[0] - metrics.lineSpacing + metrics.fontSize * 0.36,
          size: metrics.fontSize - 3,
          role: 'positionShift',
        });
      }
    }
  }

  /** 和弦簇 / 扫弦：同一时刻 ≥3 根弦 → 画扫弦箭头 */
  const strums: StandardTabLayout['strums'] = [];
  let strumSeq = 0;
  let i = 0;
  while (i < paired.length) {
    const onset = paired[i].input.offsetSec;
    let j = i;
    while (j + 1 < paired.length && Math.abs(paired[j + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) j += 1;
    const group = paired.slice(i, j + 1);
    if (group.length >= 3) {
      const id = `strum_${strumSeq++}`;
      const ys = group.map((g) => g.laid.y);
      for (const member of group) member.laid.strumId = id;
      strums.push({
        id,
        x: Math.min(...group.map((g) => g.laid.x)) - 9,
        yTop: Math.min(...ys) - 4,
        yBottom: Math.max(...ys) + 4,
        direction: 'down',
        stringCount: group.length,
      });
    }
    i = j + 1;
  }

  /**
   * 节奏线：弦线下方一整行 —— 符干（每个发音点一条）+ 连接符（同拍内的 8/16 分音符）+ 符尾。
   * 时间轴用 `beatSec = 小节时长 / 拍数`，与拍点刻度同口径。
   */
  const stems: StandardTabStem[] = [];
  const beams: StandardTabLayout['beams'] = [];
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
    while (oj + 1 < paired.length && Math.abs(paired[oj + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) oj += 1;
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
      stems.push({ x: onset.x, y1: onset.yBottom + 4, y2: rhythmY, levels: onset.levels });
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
        /** 该层落单 → 画一小段部分横线（fractional beam） */
        const x2 = members.length === 1 ? x1 + 5 : Math.max(...xs);
        beams.push({ x1, x2, y: rhythmY + (level - 1) * 4.5, level });
      }
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
    if (beamGroup.length > 0 && beamGroup[beamGroup.length - 1].beatIndex !== onset.beatIndex) flushBeamGroup();
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
const MEASURE_GUTTER = 12;

/**
 * 谱行排版引擎：**一个「编辑段落」= 2-3 个小节并排**。
 *
 * 每个小节仍由 `buildStandardTabLayout()` 排版（同一套规则、单测已覆盖），
 * 谱行层只做：切槽位 → 整体平移（`dx = 目标 contentLeft − 实际 contentLeft`）→
 * 重铺公共元素（字符串横贯整行 / 小节线画在槽位之间 / 谱号与速度只画一次）。
 */
export function buildStandardTabSystemLayout(options: StandardTabSystemOptions): StandardTabSystemLayout {
  const metrics = options.metrics || MINI_TAB_METRICS;
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
  const beams: StandardTabSystemLayout['beams'] = [];
  const strums: StandardTabSystemLayout['strums'] = [];
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
     * 文字按「小节槽位」重新定位：
     * - 把位 / 「把位」小字 → 本小节**左上角**（第一顺位标注）
     * - 速度标记 → 谱行最左侧
     * - 小节号 → 本小节**右上角**（与把位对角分开）
     */
    for (const text of inner.texts) {
      if (text.role === 'position') {
        texts.push({ ...text, x: slotLeft + 2 });
      } else if (text.role === 'positionLabel') {
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
  const lines: StandardTabSystemLayout['lines'] = Array.from({ length: stringCount }, (_, i) => ({
    x1: staffLeft,
    y1: stringYs[i],
    x2: systemRight,
    y2: stringYs[i],
    width: i === stringCount - 1 ? 2 : 1,
  }));

  const barY1 = staffTop - 4;
  const barY2 = staffBottom + 4;
  const barlines: StandardTabSystemLayout['barlines'] = [];
  for (let slot = 0; slot < count; slot += 1) {
    const x = slot === count - 1 ? systemRight : systemLeft + (slot + 1) * slotWidth - MEASURE_GUTTER / 2;
    /** 粗收尾线只给**本谱行的最后一个小节** */
    const isFinalBar = options.isLastSystem && slot === count - 1;
    barlines.push({ x1: x, y1: barY1, x2: x, y2: barY2, width: isFinalBar ? 3.5 : 1.3 });
  }
  if (options.isLastSystem) {
    barlines.unshift({ x1: systemRight - 6, y1: barY1, x2: systemRight - 6, y2: barY2, width: 1 });
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
