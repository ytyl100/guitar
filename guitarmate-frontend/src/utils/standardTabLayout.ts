/**
 * 标准六线谱排版引擎（小程序端）
 * ==============================
 *
 * ⚠️ 本文件与 `guitarmate-studio-cms/src/components/review/standardTabLayout.ts`
 * **逻辑必须保持一致**（两个包无共享库，只能各自维护一份）——
 * 任何排版规则改动都要**同时改两处**，否则 CMS 预览与小程序实际渲染会不一致。
 * 两端唯一允许不同的是 `metrics`（像素密度）：CMS 用 1080 宽，小程序用 600 宽紧凑版。
 *
 * 输出与市面主流练习谱一致的样式：
 * ```
 *  ♪ = 90
 *     C                        G                    ← 和弦名（弦线上方）
 *  5  0────0────1────3────┬────3────1────0────       ← 品味数直接落在弦线上（弦线被挖空）
 *   T│─0──0──1──3──┬──3──1──0─│                     ← TAB 谱号 + 手指上标
 *   A│─────────────┼──────────│
 *   B│═════════════╪══════════│                     ← 低音 E 弦线加粗
 *      │   │   │   │     │   │   │   │              ← 拍点刻度
 *      ╞═══════╡           ╞═══════╡                ← 节奏连接符
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
};

export interface StandardTabLayoutOptions {
  notes: StandardTabNoteInput[];
  chords?: StandardTabChordInput[];
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
   * - `'finger'`（默认，市场练习谱写法）：数字 = **左手手指号**（1-4，0 = ○），
   *   品位由左上角把位标记 + `fret = position + finger − 1` 反推；
   * - `'fret'`：数字 = 品位，手指号作为右上方小号上标。
   */
  noteLabel?: 'finger' | 'fret';
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

export interface StandardTabLayout {
  metrics: StandardTabMetrics;
  stringCount: number;
  stringYs: number[];
  staffTop: number;
  staffBottom: number;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  barlines: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }>;
  beatTicks: Array<{ x: number; y1: number; y2: number }>;
  texts: StandardTabText[];
  notes: StandardTabLayoutNote[];
  strums: Array<{ id: string; x: number; yTop: number; yBottom: number; direction: 'down' | 'up'; stringCount: number }>;
  beams: Array<{ x1: number; x2: number; y: number; level: number }>;
  lineGaps: Array<{ y: number; x1: number; x2: number }>;
  timeToX: (offsetSec: number) => number;
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
  const beatSec = (60 / (options.bpm > 0 ? options.bpm : 120)) * (4 / beatValue);

  const staffTop = metrics.staffTop;
  const stringYs = Array.from({ length: stringCount }, (_, i) => staffTop + i * metrics.lineSpacing);
  const staffBottom = stringYs[stringCount - 1];
  const staffLeft = metrics.staffLeftX;
  const staffRight = width - metrics.noteAreaRight;
  const contentLeft = options.showClef ? metrics.noteAreaLeft : metrics.noteAreaLeft - 22;
  const contentWidth = Math.max(40, staffRight - contentLeft);

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
    // 主数字：默认写手指号（品位由把位标记反推），复核模式写品位
    const useFingerAsDigit = (options.noteLabel || 'finger') === 'finger' && !!fingerMark;
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
  const clusterMemberIds = new Set<string>();
  let strumSeq = 0;
  let i = 0;
  while (i < paired.length) {
    const onset = paired[i].input.offsetSec;
    let j = i;
    while (j + 1 < paired.length && Math.abs(paired[j + 1].input.offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) j += 1;
    const group = paired.slice(i, j + 1);
    if (group.length >= 2) {
      for (const member of group) clusterMemberIds.add(member.laid.id);
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
    }
    i = j + 1;
  }

  /** 节奏连接符：同一拍内相邻的 8/16 分音符成组 */
  const beams: StandardTabLayout['beams'] = [];
  const beamBaseY = staffBottom + 16;
  let beamGroup: Array<{ x: number; levels: number; beatIndex: number }> = [];
  const flushBeamGroup = () => {
    if (beamGroup.length >= 2) {
      const x1 = Math.min(...beamGroup.map((g) => g.x));
      const x2 = Math.max(...beamGroup.map((g) => g.x));
      const maxLevel = Math.max(...beamGroup.map((g) => g.levels));
      for (let level = 1; level <= maxLevel; level += 1) {
        beams.push({ x1, x2, y: beamBaseY + (level - 1) * 4.5, level });
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
    if (beamGroup.length > 0 && beamGroup[beamGroup.length - 1].beatIndex !== beatIndex) flushBeamGroup();
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
