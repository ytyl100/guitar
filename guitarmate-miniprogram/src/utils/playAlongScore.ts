import type { PracticeMeasure, PracticeNote } from './practice';

/**
 * AI 跟弹评测：把「麦克风听到的音高」和「谱面应该弹的音」对上分
 * =================================================================
 *
 * ## 为什么要独立成一个纯函数
 *
 * 音高检测（`utils/pitchDetect.ts` 的 YIN）本身是**逐帧**的：每 64ms 一帧，
 * 一帧只告诉你「此刻是这个频率」。而「弹对没弹对」是**按音符**判断的 ——
 * 中间这层「帧 → 音符判定」的逻辑很容易写错（窗口、容差、中位数、和弦同时响…），
 * 而且**在真机上几乎没法调试**（要一边听一边看）。所以：
 *
 * - 判定逻辑全部放在这里，**纯函数**（帧序列 + 音符表 → 逐音判定），
 *   可以用合成数据在 Node 里跑回归（`scripts/verify-play-along.ts`）；
 * - 端上只负责「取帧」和「画结果」，不参与任何阈值判断。
 *
 * ## 判定规则（与调音器同一套阈值思路，但更宽容）
 *
 * | 情况 | 判定 |
 * |---|---|
 * | 窗口内有帧、音高对上、\|\|cents\|\| ≤ `HIT_CENTS`(25) | `hit` 弹对了 |
 * | 音高对上但偏低 / 偏高超过 `HIT_CENTS` | `flat` / `sharp` |
 * | 窗口内有声音但音高对不上（差超过 `NEAR_SEMITONE`） | `wrong` 按错/走音 |
 * | 窗口内完全没检测到有效音 | `silent` 没弹出声 |
 *
 * ⚠️ 三个刻意的设计决定：
 * 1. **窗口要"往前多留一点"**：拨弦的起振（attack）到 YIN 出稳定音高之间有 1~2 帧延迟，
 *    加上人耳到手的延迟，音符起点**前**留 `LEAD_SEC`(0.12s) 才不会把弹对的说成没弹。
 * 2. **同音高取中位数而不是平均**：平均会被起振瞬间的滑音/泛音带偏。
 * 3. **`silent` 不计入命中率分母**：中途停下来喘口气不该被算成"弹错"；
 *    所以结果里同时给 `graded`（真正判了分的音符数）与 `hitRate`（命中 / graded），
 *    以及 `coverage`（有声音的音符占比）—— 分开看才知道是"没弹"还是"弹错"。
 */

/** 一帧麦克风读数（`useMicPitch` 的 `onReading` 回调产出） */
export interface PitchFrame {
  /** 相对**评测开始**的秒数（与音频播放位置同口径） */
  tSec: number;
  /** 检测到的基频（Hz） */
  freq: number;
}

/** 待评分的音符（绝对时间，秒） */
export interface EvalNote {
  id: string;
  /** 起始（绝对秒） */
  startSec: number;
  /** 结束（绝对秒） */
  endSec: number;
  /** 目标音高（MIDI 音高号，允许小数） */
  midi: number;
  /** 1-6，1 = 最细的高音弦（仅用于展示） */
  string: number;
  fret: number;
}

export type NoteVerdict = 'hit' | 'sharp' | 'flat' | 'wrong' | 'silent';

export interface NoteScore {
  note: EvalNote;
  verdict: NoteVerdict;
  /** 与目标音高的音分偏差（`silent` / `wrong` 时为 null） */
  cents: number | null;
  /** 落在窗口内、且音高对上的帧数（判定可信度参考） */
  matchedFrames: number;
  /** 窗口内的总帧数 */
  windowFrames: number;
}

export interface PlayAlongScore {
  notes: NoteScore[];
  /** 弹对的数量 */
  hit: number;
  /** 真正判了分的音符数（总数 − silent），命中率的分母 */
  graded: number;
  /** 没检测到声音的音符数 */
  silent: number;
  /** 命中率 = hit / graded（0-1；graded=0 时给 0） */
  hitRate: number;
  /** 有声音的音符占比 = (总数 − silent) / 总数 */
  coverage: number;
  /** 判过分的音符里的平均绝对音分偏差 */
  avgAbsCents: number;
}

/** 命中容差（音分）：比调音器的 ±3 宽松得多——跟弹时手指按弦、拨弦力度都会带偏差 */
export const HIT_CENTS = 25;
/** 音高"对上"的容差（半音）：超过这个就认为弹的是另一个音 */
export const NEAR_SEMITONE = 0.6;
/** 窗口前扩（秒）：见文件头第 1 条 */
export const LEAD_SEC = 0.12;
/** 窗口后扩（秒）：留出余韵与检测延迟 */
export const TAIL_SEC = 0.25;

/** 频率 → MIDI 音高号（69 = A4 = 440Hz） */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** MIDI 音高号 → 频率 */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 两个 MIDI 音高之间相差多少音分（正 = 偏高） */
export function centsBetween(hz: number, targetMidi: number): number {
  return (hzToMidi(hz) - targetMidi) * 100;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 标准调弦（MIDI 音高号，6→1 弦） */
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

/**
 * 音符的目标音高。
 *
 * ⚠️ 契约里的 `midi` **可能是空的**（历史数据 / 部分转录产物），所以这里能自己算：
 * `midi = 空弦 midi + 品数 + capo`。`string` 是 1 = 最细弦（与契约一致）。
 */
export function noteMidi(
  note: Pick<PracticeNote, 'string' | 'fret' | 'midi'>,
  tuning: number[] = STANDARD_TUNING_MIDI,
  capo = 0,
): number {
  if (typeof note.midi === 'number' && Number.isFinite(note.midi)) return note.midi;
  const idx = 6 - Math.max(1, Math.min(6, Number(note.string) || 1));
  const open = tuning[idx] ?? STANDARD_TUNING_MIDI[idx] ?? 40;
  return open + (Number(note.fret) || 0) + (Number(capo) || 0);
}

/**
 * 把「段落里的小节」摊平成待评分的音符表（时间取**绝对秒**）。
 *
 * 小节自带的 `startTime` 是整曲绝对时间（后端发布的切片窗口），
 * 音符的 `relativeTime` 是**小节内**偏移 → 两者相加才是评测时间轴上的位置。
 */
export function collectEvalNotes(
  measures: PracticeMeasure[],
  trackIndex: number,
  options: { tuning?: number[]; capo?: number } = {},
): EvalNote[] {
  const out: EvalNote[] = [];
  for (const measure of measures) {
    const track = measure.trackData?.[trackIndex] ?? measure.trackData?.[0];
    const notes = (track?.notes || []) as PracticeNote[];
    const base = Number(measure.startTime) || 0;
    for (const note of notes) {
      const startSec = base + (Number(note.relativeTime) || 0);
      /** ⚠️ `duration` 缺失时给一个下界：否则音符窗口为 0，窗口内永远取不到帧 */
      const duration = Math.max(0.12, Number(note.duration) || 0.12);
      out.push({
        id: `${measure.index}:${note.id}`,
        startSec,
        endSec: startSec + duration,
        midi: noteMidi(note, options.tuning, options.capo),
        string: Number(note.string) || 1,
        fret: Number(note.fret) || 0,
      });
    }
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/**
 * 核心判定：帧序列 × 音符表 → 逐音结论 + 汇总。
 *
 * @param notes  `collectEvalNotes()` 的输出（按时间升序最好，函数自身不依赖顺序）
 * @param frames 麦克风帧（**时间口径必须与 notes 相同**，都是"评测开始后第几秒"）
 */
export function scorePlayAlong(notes: EvalNote[], frames: PitchFrame[]): PlayAlongScore {
  const usable = (frames || []).filter((f) => Number.isFinite(f.tSec) && f.freq > 0);
  /**
   * ⚠️ 回归脚本抓到的真问题（第一版写错过）：**相邻音符的尾音会漏进前扩窗口**。
   * 两个音只隔 0.1s（< `LEAD_SEC`）时，上一个音的尾帧落在下一个音的窗口里，
   * 音高又对不上 → 被误判成「弹错音」，而学员其实只是**没弹那个音**。
   *
   * 修法：一帧只属于**一个**音 —— 若某帧的音高贴着**别的**音符（在 `NEAR_SEMITONE` 内），
   * 就认为那帧是那个音的（连续音、和弦各音都靠这条各归各位），本音符不采信它。
   */
  const allMidis = notes.map((n) => n.midi);
  const belongsToOther = (midi: number, myMidi: number) =>
    Math.abs(midi - myMidi) > NEAR_SEMITONE &&
    allMidis.some((m) => m !== myMidi && Math.abs(midi - m) <= NEAR_SEMITONE);

  const results: NoteScore[] = notes.map((note) => {
    const from = note.startSec - LEAD_SEC;
    const to = note.endSec + TAIL_SEC;
    /** 先按窗口取，再剔除"属于邻居"的帧（否则漏音会被算成错音） */
    const inWindow = usable
      .filter((f) => f.tSec >= from && f.tSec <= to)
      .filter((f) => !belongsToOther(hzToMidi(f.freq), note.midi));
    if (!inWindow.length) {
      return { note, verdict: 'silent', cents: null, matchedFrames: 0, windowFrames: 0 };
    }
    const matches = inWindow.filter(
      (f) => Math.abs(hzToMidi(f.freq) - note.midi) <= NEAR_SEMITONE,
    );
    if (!matches.length) {
      return {
        note,
        verdict: 'wrong',
        cents: null,
        matchedFrames: 0,
        windowFrames: inWindow.length,
      };
    }
    const cents = Math.round(centsBetween(median(matches.map((f) => f.freq)), note.midi) * 10) / 10;
    const verdict: NoteVerdict =
      Math.abs(cents) <= HIT_CENTS ? 'hit' : cents < 0 ? 'flat' : 'sharp';
    return {
      note,
      verdict,
      cents,
      matchedFrames: matches.length,
      windowFrames: inWindow.length,
    };
  });

  const hit = results.filter((r) => r.verdict === 'hit').length;
  const silent = results.filter((r) => r.verdict === 'silent').length;
  const graded = results.length - silent;
  const centsList = results
    .map((r) => r.cents)
    .filter((c): c is number => typeof c === 'number');
  const avgAbsCents = centsList.length
    ? Math.round((centsList.reduce((sum, c) => sum + Math.abs(c), 0) / centsList.length) * 10) / 10
    : 0;

  return {
    notes: results,
    hit,
    graded,
    silent,
    hitRate: graded ? Math.round((hit / graded) * 1000) / 1000 : 0,
    coverage: results.length ? Math.round(((results.length - silent) / results.length) * 1000) / 1000 : 0,
    avgAbsCents,
  };
}

/** 判定文案（界面直接显示；英文括注与调音器保持同一风格） */
export const VERDICT_LABEL: Record<NoteVerdict, { text: string; color: string }> = {
  hit: { text: '✓ 准确', color: '#10b981' },
  flat: { text: '♭ 偏低', color: '#f59e0b' },
  sharp: { text: '♯ 偏高', color: '#f59e0b' },
  wrong: { text: '✗ 弹错音', color: '#ef4444' },
  silent: { text: '· 没弹', color: '#71717a' },
};
