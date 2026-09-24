/**
 * 卡农（Pachelbel's Canon in D）测试数据 —— 前 16 小节
 * ==================================================
 *
 * ### 这份数据是干什么的
 *
 * 用来**回归测试六线谱渲染**（把位 / 推荐和弦 / 品位数字 / 节奏线 / 多小节谱行）。
 * 每条数据都带齐用户要求的四类信息：
 *
 * | 字段 | 含义 | 谱面上的位置 |
 * |---|---|---|
 * | `position` | **把位**（第一顺位标注） | 小节左上角「N 把位」 |
 * | `chord` | **推荐和弦** | 小节上方（弦线上方和弦行） |
 * | `notes[].fret` | 品位（弦线上的数字） | 落在弦线上，弦线被挖空 |
 * | `notes[].offsetSec` / `durationSec` | 节奏 | 弦线下方节奏线（符干 / 连接符） |
 *
 * ### 版权说明（重要）
 *
 * Pachelbel 的《D 大调卡农》作于约 1680 年，**早已进入公有领域**。
 * 本文件里的音型是**为排版测试自行编写的**（8 分音符琶音织体），
 * 并非任何一份出版编配的转录，也未从网络曲谱逐音复制 —— 只参考了
 * 「一行 2-3 小节 / 和弦名在上 / 把位标记 / 节奏线」这类**排版惯例**。
 *
 * ### 和声骨架（公有领域的卡农固定低音）
 *
 * `D → A → Bm → F#m → G → D → G → A`，每小节一个和弦，前 8 小节一次，
 * 后 8 小节换到中高把位（5 / 7 / 2 / 3 把位）再走一遍 —— 正好覆盖
 * 「换把 → 把位标记变化」的渲染路径。
 */

/** 速度（♩ = 80）—— 一拍 0.75s，一小节（4/4）3.0s */
export const CANON_IN_D_BPM = 80;
export const CANON_IN_D_TIME_SIGNATURE = '4/4';
/** 一小节时长（秒）= 4 × 60 / 80 */
export const CANON_IN_D_MEASURE_SEC = 3;

/** 8 分音符时值 */
const EIGHTH = CANON_IN_D_MEASURE_SEC / 8;
/** 一小节 8 个八分音符的落点（0, 0.375, 0.75 … 2.625） */
const GRID_8TH = Array.from({ length: 8 }, (_, i) => Number((i * EIGHTH).toFixed(4)));

export interface CanonTabNote {
  /** 稳定 id（`canon_m<小节>_n<网格位置>_s<弦>`）——选中高亮 / 回归断言用 */
  id: string;
  /** 1-6（1 = 最细的高音 E 弦） */
  string: number;
  fret: number;
  /** 相对小节起点的秒数 */
  offsetSec: number;
  durationSec: number;
  /** 0 = 空弦，1-4 = 食指…小指（**次要标注**：品位数字右上角的小上标） */
  finger: number;
  /** 该音生效的把位 */
  position: number;
}

export interface CanonTabMeasure {
  /** 1 起的小节号 */
  index: number;
  /** 推荐和弦（每小节一个） */
  chord: string;
  /** 本小节把位（第 P 把位 = 食指按第 P 品） */
  position: number;
  /** 小节时长（秒） */
  duration: number;
  notes: CanonTabNote[];
}

/**
 * 把位 + 品位 → 左手指法：`finger = fret − position + 1`（空弦记 0）。
 * 这条不变式是「品位数字 + 把位标记」可读的前提，也是回归测试的断言之一。
 */
function fingerOf(fret: number, position: number): number {
  if (fret <= 0) return 0;
  return Math.min(4, Math.max(1, fret - position + 1));
}

/** 一个音（落在 8 分音符网格的第 `slot` 格） */
function noteAt(
  measureIndex: number,
  slot: number,
  string: number,
  fret: number,
  position: number,
  durationSec = EIGHTH,
): CanonTabNote {
  return {
    id: `canon_m${measureIndex}_n${slot}_s${string}`,
    string,
    fret,
    offsetSec: GRID_8TH[slot],
    durationSec,
    finger: fingerOf(fret, position),
    position,
  };
}

/** 8 个 8 分音符的琶音小节（`pattern[i] = [弦, 品]`） */
function arpeggio(
  index: number,
  chord: string,
  position: number,
  pattern: Array<[number, number]>,
): CanonTabMeasure {
  return {
    index,
    chord,
    position,
    duration: CANON_IN_D_MEASURE_SEC,
    notes: pattern.map(([string, fret], slot) => noteAt(index, slot, string, fret, position)),
  };
}

/** 空弦和弦的琶音（开放把位 / 第 1 把位） */
const OPEN_PATTERNS: Record<string, Array<[number, number]>> = {
  // D：D3 A3 D4 F#4 D4 F#4 D4 A3
  D: [
    [4, 0],
    [3, 2],
    [2, 3],
    [1, 2],
    [2, 3],
    [1, 2],
    [2, 3],
    [3, 2],
  ],
  // A：A2 E3 A3 C#4 A3 C#4 E4 C#4
  A: [
    [5, 0],
    [4, 2],
    [3, 2],
    [2, 2],
    [3, 2],
    [2, 2],
    [1, 0],
    [2, 2],
  ],
  // Bm：B2 F#3 B3 D4 B3 D4 F#4 D4
  Bm: [
    [5, 2],
    [4, 4],
    [3, 4],
    [2, 3],
    [3, 4],
    [2, 3],
    [1, 2],
    [2, 3],
  ],
  // F#m：F#2 F#3 A3 C#4 A3 C#4 F#4 C#4
  'F#m': [
    [6, 2],
    [4, 4],
    [3, 2],
    [2, 2],
    [3, 2],
    [2, 2],
    [1, 2],
    [2, 2],
  ],
  // G：G2 D3 G3 B3 G3 B3 G4 B3
  G: [
    [6, 3],
    [4, 0],
    [3, 0],
    [2, 0],
    [3, 0],
    [2, 0],
    [1, 3],
    [2, 0],
  ],
};

/** 中高把位的琶音（第 5 / 7 / 2 / 3 把位）—— 用于覆盖「换把 + 把位标记变化」 */
const HIGH_PATTERNS: Record<string, Array<[number, number]>> = {
  // 第 5 把位 D：D3 A3 D4 F#4 D4 F#4 A4 F#4
  D5: [
    [5, 5],
    [4, 7],
    [3, 7],
    [2, 7],
    [3, 7],
    [2, 7],
    [1, 5],
    [2, 7],
  ],
  // 第 5 把位 A：A2 A3 C#4 E4 C#4 E4 A4 E4
  A5: [
    [6, 5],
    [4, 7],
    [3, 6],
    [2, 5],
    [3, 6],
    [2, 5],
    [1, 5],
    [2, 5],
  ],
  // 第 7 把位 Bm：B2 B3 D4 F#4 D4 F#4 B4 F#4
  Bm7: [
    [6, 7],
    [4, 9],
    [3, 7],
    [2, 7],
    [3, 7],
    [2, 7],
    [1, 7],
    [2, 7],
  ],
  // 第 3 把位 G：G2 G3 B3 D4 B3 D4 G4 D4
  G3: [
    [6, 3],
    [4, 5],
    [3, 4],
    [2, 3],
    [3, 4],
    [2, 3],
    [1, 3],
    [2, 3],
  ],
};

/**
 * 前 16 小节。
 *
 * - 第 1-8 小节：**第 1 把位**（开放把位）琶音，和声走一遍 `D A Bm F#m G D G A`；
 * - 第 9-12 小节：换到 **5 / 5 / 7 / 2 把位**，覆盖把位标记随小节变化；
 *   其中第 10 小节故意加入一对 **16 分音符**（测试双层连接符）；
 * - 第 13-15 小节：**第 3 / 5 / 3 把位**；
 * - 第 16 小节：**第 5 把位**以 6 音 A 大调和弦收尾（测试扫弦箭头 + 长音只有符干）。
 */
export const CANON_IN_D_MEASURES: CanonTabMeasure[] = [
  // ── 第 1-8 小节：第 1 把位 ──
  arpeggio(1, 'D', 1, OPEN_PATTERNS.D),
  arpeggio(2, 'A', 1, OPEN_PATTERNS.A),
  arpeggio(3, 'Bm', 1, OPEN_PATTERNS.Bm),
  arpeggio(4, 'F#m', 1, OPEN_PATTERNS['F#m']),
  arpeggio(5, 'G', 1, OPEN_PATTERNS.G),
  arpeggio(6, 'D', 1, OPEN_PATTERNS.D),
  arpeggio(7, 'G', 1, OPEN_PATTERNS.G),
  arpeggio(8, 'A', 1, OPEN_PATTERNS.A),

  // ── 第 9-12 小节：中把位 ──
  arpeggio(9, 'D', 5, HIGH_PATTERNS.D5),
  {
    // 第 10 小节：6 个 8 分 + 一对 16 分（节奏线要画出 2 层连接符）
    index: 10,
    chord: 'A',
    position: 5,
    duration: CANON_IN_D_MEASURE_SEC,
    notes: [
      noteAt(10, 0, 6, 5, 5),
      noteAt(10, 1, 4, 7, 5),
      noteAt(10, 2, 3, 6, 5),
      // 第 3 拍前半：一对 16 分音符
      noteAt(10, 3, 2, 5, 5, EIGHTH / 2),
      {
        ...noteAt(10, 3, 3, 6, 5, EIGHTH / 2),
        id: 'canon_m10_n3b_s3',
        offsetSec: Number((GRID_8TH[3] + EIGHTH / 2).toFixed(4)),
      },
      noteAt(10, 4, 2, 5, 5),
      noteAt(10, 5, 1, 5, 5),
      noteAt(10, 6, 2, 5, 5),
      noteAt(10, 7, 3, 6, 5),
    ],
  },
  arpeggio(11, 'Bm', 7, HIGH_PATTERNS.Bm7),
  arpeggio(12, 'F#m', 2, OPEN_PATTERNS['F#m']),

  // ── 第 13-16 小节：回到中把位并收尾 ──
  arpeggio(13, 'G', 3, HIGH_PATTERNS.G3),
  arpeggio(14, 'D', 5, HIGH_PATTERNS.D5),
  arpeggio(15, 'G', 3, HIGH_PATTERNS.G3),
  {
    // 第 16 小节：6 音 A 大调和弦（扫弦箭头）+ 4 个 8 分音符
    index: 16,
    chord: 'A',
    position: 5,
    duration: CANON_IN_D_MEASURE_SEC,
    notes: [
      { ...noteAt(16, 0, 6, 5, 5, CANON_IN_D_MEASURE_SEC / 2) },
      { ...noteAt(16, 0, 5, 7, 5, CANON_IN_D_MEASURE_SEC / 2) },
      { ...noteAt(16, 0, 4, 7, 5, CANON_IN_D_MEASURE_SEC / 2) },
      { ...noteAt(16, 0, 3, 6, 5, CANON_IN_D_MEASURE_SEC / 2) },
      { ...noteAt(16, 0, 2, 5, 5, CANON_IN_D_MEASURE_SEC / 2) },
      { ...noteAt(16, 0, 1, 5, 5, CANON_IN_D_MEASURE_SEC / 2) },
      noteAt(16, 4, 1, 5, 5),
      noteAt(16, 5, 2, 5, 5),
      noteAt(16, 6, 3, 6, 5),
      noteAt(16, 7, 2, 5, 5),
    ],
  },
];

/** 按「每行 N 小节」切成谱行（段落）—— 预览与回归测试共用 */
export function chunkCanonMeasures(perSystem = 2): CanonTabMeasure[][] {
  const size = Math.max(1, Math.min(3, Math.round(perSystem) || 2));
  const out: CanonTabMeasure[][] = [];
  for (let i = 0; i < CANON_IN_D_MEASURES.length; i += size) {
    out.push(CANON_IN_D_MEASURES.slice(i, i + size));
  }
  return out;
}
