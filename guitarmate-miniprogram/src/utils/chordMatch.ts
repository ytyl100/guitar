import { STRING_OPEN_FREQS, type ChordPosition, type ChordType } from './chordLibraryData';

/**
 * 和弦微测的判定内核（**纯函数，不碰 UI / 不碰麦克风**）
 * ====================================================
 *
 * ## 为什么单独抽出来
 *
 * 判定逻辑（和弦名解析、目标音计算、命中率）是这块功能里**唯一容易被算错**的部分，
 * 而它跟"怎么拿到音频帧"（`useMicPitch`）和"怎么画图"（`ChordFretboard`）是两件事。
 * 抽成纯函数后：可以在 Node 里直接跑用例验证，不用开小程序、不用真机、不用麦克风。
 *
 * ## 与 Web 版 `InteractiveChordDrillModal` 的关系
 *
 * Web 版用 Web Audio 的 `AnalyserNode.getFloatFrequencyData()` 拿**频谱**，
 * 对每个目标频率在 ±3.5% 窗口里找能量峰值，再折算成百分比。
 *
 * 小程序**没有 Web Audio**（见 `hooks/useMicPitch.ts`），只能拿到 YIN 算出来的
 * **单音基频**（一次一个音）。所以判定方式必须换，但换得有道理：
 *
 * | | Web 版（频谱） | 这里（逐音） |
 * |---|---|---|
 * | 输入 | 一帧频谱 | 一串「检测到的 MIDI 音」 |
 * | 判定 | 每个目标频率有没有能量 | 每个目标音**在时间窗内是否被听到过** |
 * | 适合 | 同时发声（扫弦） | 分解/扫弦后逐弦消隐的余音 |
 *
 * 吉他扫弦的余音是**依次衰减**的，YIN 在 2.5 秒窗口里通常能抓到其中大部分弦
 * → 「窗口内命中了几根弦」是个**能解释、可复现**的分数，而不是随机数。
 *
 * ⚠️ **不提供"模拟评分"**：Web 版有个 `triggerSimulatedEvaluation()` 会 `Math.random()`
 * 出一个 86~97 分并计入掌握度。那在小程序里是**编造学习成果**（还会写进后端进度），
 * 所以这里没有这条路径 —— 麦克风不可用就如实告知（见页面的 `supported` 分支）。
 */

/** 和弦名后缀 → 和弦类型（数组里是**精确匹配**，所以顺序无关） */
const TYPE_SUFFIXES: ReadonlyArray<readonly [string, ChordType]> = [
  ['maj7', 'maj7'],
  ['m7', 'm7'],
  ['sus4', 'sus4'],
  ['sus2', 'sus2'],
  ['add9', 'add9'],
  ['7sus4', '7sus4'],
  ['7#9', '7#9'],
  ['9', '9'],
  ['7', '7'],
  ['5', '5'],
  ['m', 'minor'],
  ['', 'major'],
];

/**
 * 和弦名 → `{ root, type }`。
 *
 * 课程里教师填的是**和弦名**（`'C'` / `'Am'` / `'F'` / `'G'` / `'Em'` / `'Dm7'`），
 * 而指法库要的是 `getChordPositions(root, type)` 两个参数 —— 这一层转换就在这儿。
 * 认不出来的一律退成大三和弦（`major`），**不抛异常**：宁可画一个 C 大三和弦让用户看到
 * "这个和弦指法库里没有"，也不要整页白屏。
 */
export function parseChordName(name: string): { root: string; type: ChordType } {
  const s = (name || '').trim();
  if (!s) return { root: 'C', type: 'major' };
  /** 根音可能是两个字符（`C#` / `Db`）；`getChordPositions` 内部会把降号翻成升号 */
  const twoChar = s[1] === '#' || s[1] === 'b';
  const root = twoChar ? s.slice(0, 2) : s.slice(0, 1);
  const rest = (twoChar ? s.slice(2) : s.slice(1)).toLowerCase();
  const hit = TYPE_SUFFIXES.find(([suffix]) => suffix === rest);
  return { root, type: hit ? hit[1] : 'major' };
}

/**
 * 六根弦的空弦 MIDI（第 6 弦 → 第 1 弦）= `[40, 45, 50, 55, 59, 64]`（E2 A2 D3 G3 B3 E4）。
 * 由 `STRING_OPEN_FREQS` 现算，保持**单一来源**（改调弦定义时这里自动跟着变）。
 */
export const STRING_MIDI: number[] = STRING_OPEN_FREQS.map((f) =>
  Math.round(69 + 12 * Math.log2(f / 440)),
);

/**
 * 一个指法位置上**实际要发出的音**（MIDI）。
 * `frets` 里 `-1` = 闷弦/不弹（跳过），`0` = 空弦，`n` = 第 n 品。
 */
export function chordTargetMidis(position: ChordPosition): number[] {
  const out: number[] = [];
  (position.frets || []).forEach((fret, idx) => {
    if (fret < 0) return;
    const base = STRING_MIDI[idx];
    if (base === undefined) return;
    out.push(base + fret);
  });
  return out;
}

/** 一次检测到的音（来自 `useMicPitch` 的 `onFrame`，见 `MicPitchFrame`） */
export interface DetectedNote {
  at: number;
  midi: number;
}

/** 判定容差（半音）。±0.5 = 半个半音，实测能容纳按弦轻微走音又不至于把邻品算进来。 */
export const MATCH_TOLERANCE = 0.5;

/** 时间窗内有几个音 > 这个数才认为"真的弹了"（避免一两帧噪声凑出高分） */
export const MIN_FRAMES = 2;

export interface ChordMatchResult {
  /** 命中率 0~100（= 目标音里被听到过的比例） */
  percent: number;
  /** 命中了几根弦 */
  hit: number;
  /** 该和弦一共几个音 */
  total: number;
  /** 还没被听到的目标音（MIDI），页面可以提示"缺哪个音" */
  missing: number[];
  /** 窗口内有效帧数（太少说明压根没弹） */
  frames: number;
}

/**
 * 用「最近 `windowMs` 内检测到的音」给某个和弦打分。
 *
 * 取**时间窗**而不是"最近一帧"，因为一次扫弦的音是依次被检测到的：
 * 只看最后一帧永远只能命中 1 个音（这会把所有扫弦都判成低分）。
 */
export function scoreChordMatch(
  targetMidis: number[],
  detected: DetectedNote[],
  windowMs = 2500,
): ChordMatchResult {
  const total = targetMidis.length;
  if (!total) return { percent: 0, hit: 0, total: 0, missing: [], frames: 0 };

  const now = detected.length ? detected[detected.length - 1].at : 0;
  const recent = detected.filter((d) => now - d.at <= windowMs);

  let hit = 0;
  const missing: number[] = [];
  targetMidis.forEach((target) => {
    const found = recent.some((d) => Math.abs(d.midi - target) <= MATCH_TOLERANCE);
    if (found) hit += 1;
    else missing.push(target);
  });

  const percent = recent.length < MIN_FRAMES ? 0 : Math.round((hit / total) * 100);
  return { percent, hit, total, missing, frames: recent.length };
}

/** 达标线（≥ 80 才计入掌握 / 才触发 Auto 自动切换；与 Web 版同阈值） */
export const PASS_PERCENT = 80;

/** 按分数给一句教练反馈（文案与 Web 版一致，便于两端同一套话术） */
export function feedbackFor(percent: number): string {
  if (percent >= 90) return '🎯 完美发音！音色饱满且各弦发力均衡';
  if (percent >= 80) return '✨ 良好达标！和弦泛音共鸣准确';
  if (percent >= 65) return '⚠️ 接近达标！检查指尖立起，避免触碰相邻弦';
  return '💡 请再扫弦一次，关注低音根音清晰度';
}

/** 分数 → 档位（配色 / 标签用） */
export type MatchTier = 'perfect' | 'pass' | 'near' | 'adjust';

export function tierOf(percent: number): MatchTier {
  if (percent >= 90) return 'perfect';
  if (percent >= PASS_PERCENT) return 'pass';
  if (percent >= 65) return 'near';
  return 'adjust';
}

/** MIDI → 音名（缺哪个音时显示用，如 `40` → `E2`） */
export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const n = Math.round(midi);
  return `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}
