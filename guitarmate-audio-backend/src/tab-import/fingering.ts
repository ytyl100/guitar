/**
 * 左手指法 / 把位推定（Fingering & Position Derivation）
 * ====================================================
 *
 * 为什么需要单独一层？
 * ------------------------------------------------------------------
 * 吉他六线谱上「品位数」与「用哪根手指按」是**两件事**：
 *
 * ```
 *    e|--3--          ← 3 是品位
 *    B|-----          ← 但用哪根手指按 3 品，取决于当前「把位」
 * ```
 *
 * 而无论是 **音频转录**（Basic Pitch 只给音高 + 弦品位置，本质上无法知道手指）
 * 还是 **外部导入**（ASCII tab 完全没有指法信息），都需要一层推定。
 * 只有 MusicXML / Guitar Pro 这类规范格式里才带真实的 `<fingering>`。
 *
 * 因此本模块负责把「弦 + 品」补成「手指 + 把位」，规则如下。
 *
 * ── 记法约定 ──────────────────────────────────────────────────────
 * | 记号 | 含义 |
 * |---|---|
 * | `finger = 0` | 空弦（不按左手，无手指） |
 * | `finger = 1` | 食指 |
 * | `finger = 2` | 中指 |
 * | `finger = 3` | 无名指 |
 * | `finger = 4` | 小指 |
 * | `position = P` | 第 P 把位 = **食指按第 P 品**；此时第 n 指负责第 `P + n - 1` 品 |
 *
 * 核心公式：`finger = fret - position + 1`（空弦除外）。
 *
 * ── 推定流程 ──────────────────────────────────────────────────────
 * 1. **分帧（frame）**：把同一发音时刻（±20ms）的音符合成一帧 —— 和弦必须整体考虑手型，
 *    逐个音符独立算手指一定会得到「和弦里三个音都是食指」这种不可能的手型；
 * 2. **定把位**：帧内已按弦的音符取 `[fmin, fmax]`；
 *    - 若 `[fmin, fmax]` 落在某个 4 品窗口内 → 沿用当前把位（不轻易换把）；
 *    - 否则换到能覆盖该帧的最近把位（优先「最高音落在小指」的上行手型，其次最低音落在食指）；
 * 3. **分手指**：`finger = fret - position + 1`，夹到 [1,4]；
 * 4. **横按**：同一帧内同一品出现在 ≥2 根弦上 → 用小指序最低的那根手指做横按，其余同指；
 * 5. **技巧修正**：显式技巧会覆盖位置推定 ——
 *    - `slide`（滑音）：与同弦上一个音**同指**（滑过去就是同一根手指）；
 *    - `hammer-on`（击弦）：目标音用手指序**递增**的手指；
 *    - `pull-off`（勾弦）：目标音用手指序**递减**的手指；
 * 6. **已有指法优先**：源文件（MusicXML / Guitar Pro）里带 `<fingering>` 的音符**不被覆盖**，
 *    并且用它们反推真实把位（`position = fret - finger + 1`）。
 *
 * ⚠️ 自动指法永远是**建议值**：同一段旋律存在多种合理指法，取决于手型习惯。
 * 因此所有推定结果都会写入 `warnings`，且 CMS 的 `NoteInspector` 允许逐音符改写。
 */

import type { TabProject, TabProjectMeasure, TabProjectNote, TabProjectWarning } from './tab-project.types';

/** 手指中文名（UI 直接展示） */
export const FINGER_NAMES: string[] = ['空弦', '食指', '中指', '无名指', '小指'];

/** 手指罗马数字 / 简化标记（谱面标注用） */
export const FINGER_SHORT: string[] = ['○', '1', '2', '3', '4'];

export function fingerLabel(finger?: number | null): string {
  if (finger === 0) return '空弦（不按左手）';
  if (!finger || finger < 0 || finger > 4) return '未指定';
  return `${FINGER_NAMES[finger]}（${finger}）`;
}

/** 把位中文名 */
export function positionLabel(position?: number | null): string {
  if (!position || position < 1) return '未指定';
  return position === 1 ? '第 1 把位（开放把位）' : `第 ${position} 把位`;
}

/** 罗马数字（谱面把位标记的传统写法）：1→Ⅰ … 12→Ⅻ */
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

export interface FingeringOptions {
  /**
   * 只对**没有指法**的音符做推定（默认 true）。
   * MusicXML / GPX 里带 `<fingering>` 的真实指法必须保留，不能被启发式覆盖。
   */
  onlyMissing?: boolean;
  /** 同一帧（和弦）的发音时刻容差（秒） */
  frameToleranceSec?: number;
  /** 单手最多覆盖的品数（1 指 + 2 指 + 3 指 + 4 指 = 4 品） */
  maxSpan?: number;
}

export interface FingeringStats {
  /** 本次推定的音符数 */
  derivedCount: number;
  /** 沿用源文件已有指法的音符数 */
  preservedCount: number;
  /** 空弦音符数 */
  openStringCount: number;
  /** 识别出的横按数量 */
  barreCount: number;
  /** 音域超过单手 4 品、被迫夹取指法的音符数（需要人工确认换把） */
  clampedCount: number;
  /** 标注了把位的小节数 */
  positionsUsed: number;
}

export interface FingeringResult {
  project: TabProject;
  stats: FingeringStats;
  warnings: TabProjectWarning[];
}

/**
 * 对一个 TabProject 做左手指法 / 把位推定。
 *
 * 纯函数：不修改传入对象，返回新的 project（note.finger / measure.position 会被填充）。
 */
export function deriveLeftHandFingering(
  project: TabProject,
  options: FingeringOptions = {},
): FingeringResult {
  const onlyMissing = options.onlyMissing !== false;
  const tolerance = Number.isFinite(options.frameToleranceSec) ? Number(options.frameToleranceSec) : 0.02;
  const maxSpan = Math.max(3, Math.min(6, Number(options.maxSpan) || 4));

  const stats: FingeringStats = {
    derivedCount: 0,
    preservedCount: 0,
    openStringCount: 0,
    barreCount: 0,
    clampedCount: 0,
    positionsUsed: 0,
  };
  const warnings: TabProjectWarning[] = [];
  const shiftedMeasures: number[] = [];

  const tracks = project.tracks.map((track) => {
    let previousPosition: number | null = null;

    const measures: TabProjectMeasure[] = track.measures.map((sourceMeasure) => {
      /**
       * ⚠️ 先做一层浅拷贝再写 `finger`：本函数对外承诺是**纯函数**
       * （不修改调用方传入的 TabProject，便于反复调用与测试）。
       */
      const measure: TabProjectMeasure = {
        ...sourceMeasure,
        notes: sourceMeasure.notes.map((n) => ({ ...n })),
      };

      // ── 1. 分帧：同发音时刻的音符必须整体出手型 ──
      const sorted = [...measure.notes].sort(
        (a, b) => a.offsetSec - b.offsetSec || a.string - b.string,
      );
      const frames: TabProjectNote[][] = [];
      let currentOnset: number | null = null;
      for (const note of sorted) {
        if (currentOnset === null || Math.abs(note.offsetSec - currentOnset) > tolerance) {
          frames.push([note]);
          currentOnset = note.offsetSec;
        } else {
          frames[frames.length - 1].push(note);
        }
      }

      /**
       * ── 2. 逐帧定手位（同一帧 = 同一手型；跨帧允许换把）──
       *
       * 早期实现按**整小节**定单一手位（因为谱面把位标记是小节级的），
       * 但这在真实 solo 上会崩：一小节的音域经常超过 4 品（例如 5→12 品），
       * 于是大量音符被迫「夹到可用手指」，手指号不再能反推出品位。
       *
       * 现在的做法：帧内 `[fmin, fmax]` 能用当前手位覆盖就不动；否则移动到最近的
       * 可覆盖手位（优先「最高音落在小指」，其次「最低音落在食指」），
       * 并把生效手位写回该帧每个音符的 `note.position`。
       * 谱面会在手位变化处多印一个小号换把标记 —— 这样**品位永远可反推**。
       */
      const explicitPosition = impliedPositionFromExplicitFingers(measure.notes);
      let anchor: number | null = explicitPosition ?? previousPosition;
      const framePositions: Array<number | null> = frames.map(() => null);

      frames.forEach((frame, frameIndex) => {
        const fretted = frame.filter((n) => n.fret > 0);
        if (fretted.length === 0) return;
        const fmin = Math.min(...fretted.map((n) => n.fret));
        const fmax = Math.max(...fretted.map((n) => n.fret));

        let position = anchor ?? Math.max(1, fmin);
        if (!(fmin >= position && fmax <= position + (maxSpan - 1))) {
          /** 能覆盖该帧的手位区间：[fmax − 3, fmin] */
          const low = Math.max(1, fmax - (maxSpan - 1));
          const high = Math.max(1, fmin);
          if (anchor === null) {
            position = high;
          } else {
            // 距离当前手位更近者优先；同距离时优先低把位（符合教材习惯）
            position = Math.abs(low - anchor) <= Math.abs(high - anchor) ? low : high;
            if (position > high) position = high;
          }
        }
        anchor = position;
        framePositions[frameIndex] = position;
      });

      /** 小节起始手位（整小节都是空弦时沿用上一小节的手位，不凭空造标记） */
      const stabilized = stabilizePositions(frames, framePositions, maxSpan);
      const firstFrettedFrame = stabilized.findIndex((p) => p !== null);
      const measurePosition = firstFrettedFrame >= 0 ? stabilized[firstFrettedFrame] : anchor;

      if (measurePosition !== null && measurePosition >= 1 && measurePosition !== previousPosition) {
        shiftedMeasures.push(measure.index + 1);
      }

      // ── 3. 用「本帧自己的手位」分配手指 ──
      frames.forEach((frame, frameIndex) => {
        const framePosition = stabilized[frameIndex] ?? measurePosition;
        const fretted = frame.filter((n) => n.fret > 0);
        const opens = frame.filter((n) => n.fret <= 0);

        for (const n of opens) {
          if (onlyMissing && typeof n.finger === 'number') {
            stats.preservedCount += 1;
            continue;
          }
          n.finger = 0;
          if (framePosition !== null) n.position = framePosition;
          stats.openStringCount += 1;
        }

        if (fretted.length === 0 || framePosition === null) return;

        // 同一帧内同一品出现在多根弦上 → 用同一根手指横按
        const byFret = new Map<number, TabProjectNote[]>();
        for (const n of fretted) {
          if (onlyMissing && typeof n.finger === 'number') {
            stats.preservedCount += 1;
            continue;
          }
          const bucket = byFret.get(n.fret) || [];
          bucket.push(n);
          byFret.set(n.fret, bucket);
        }

        for (const [fret, group] of byFret) {
          const raw = fret - framePosition + 1;
          const finger = Math.min(4, Math.max(1, raw));
          if (raw !== finger) stats.clampedCount += group.length;
          if (group.length >= 2) stats.barreCount += 1;
          for (const n of group) {
            n.finger = finger;
            n.position = framePosition;
            stats.derivedCount += 1;
          }
        }
      });

      // ── 4. 技巧修正（滑音同指 / 击勾弦递进）──
      applyTechniqueAdjustments(measure.notes);

      // ── 5. 小节把位落库 ──
      /**
       * 小节标记必须与**音符上实际生效的手位**一致（否则谱面左上角的「N把位」
       * 跟弦线上的手指号对不上，学员反推不出品位）。因此优先取「最早那个已标注音符」
       * 的手位 —— 二次调用（`onlyMissing`）时它会保留上一次的标注，不会被重算覆盖。
       */
      const firstAnnotated = [...measure.notes]
        .sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string)
        .find((n) => typeof n.position === 'number' && n.position >= 1);
      const resolvedPosition = firstAnnotated?.position ?? measurePosition;

      if (resolvedPosition !== null && resolvedPosition >= 1) {
        measure.position = resolvedPosition;
        stats.positionsUsed += 1;
        // 下一次「不轻易换把」的基准 = 本小节**最后一帧**的手位（手停在哪里）
        previousPosition = anchor ?? resolvedPosition;
      }

      return measure;
    });

    return { ...track, measures };
  });

  if (stats.derivedCount > 0) {
    warnings.push({
      level: 'info',
      code: 'fingering-derived',
      message:
        `已按「最低把位优先 + 同帧整体出手型」推定 ${stats.derivedCount} 个音符的左手手指` +
        `（0=空弦 / 1=食指 / 2=中指 / 3=无名指 / 4=小指），并为 ${stats.positionsUsed} 个小节标注把位。` +
        `自动指法只是建议值，可在复核工作台逐音符修改。`,
    });
  }
  if (stats.clampedCount > 0) {
    warnings.push({
      level: 'warn',
      code: 'fingering-clamped',
      message:
        `${stats.clampedCount} 个音符的音域超过了单手 4 品跨度，已强行夹到可用手指（可能出现换把不自然），建议人工确认换把位置。`,
    });
  }
  if (stats.barreCount > 0) {
    warnings.push({
      level: 'info',
      code: 'fingering-barre',
      message: `识别出 ${stats.barreCount} 处横按（同一帧内同一品出现在多根弦上）。`,
    });
  }
  if (shiftedMeasures.length > 0) {
    warnings.push({
      level: 'info',
      code: 'fingering-position-shift',
      message: `小节 ${shiftedMeasures.slice(0, 8).join(', ')}${shiftedMeasures.length > 8 ? ' 等' : ''} 需要换把（已按最近的可覆盖手位标注）。`,
    });
  }

  return {
    project: { ...project, tracks, warnings: [...project.warnings, ...warnings] },
    stats,
    warnings,
  };
}

/**
 * 手位序列的**去抖动（stabilization）**。
 *
 * 逐帧定手位会得到这样的序列：`8,8,8,9,9,8,5,5` —— 中间那个孤立的「8」会让谱面上
 * 出现三个换把标记（9 → 8 → 5），而吉他手实际上只换一次把（8/9 相邻，属于同一手型区）。
 *
 * 规则：长度只有 1 帧的手位段，如果**前一段或后一段的手位正好能覆盖它的音**，
 * 就并进去（优先并到后一段 —— 手已经准备往下走）。反复迭代直到稳定。
 *
 * 这样既保留了真正必要的换把（音域跨 4 品以上），又不会把手指号的语义打乱。
 */
function stabilizePositions(
  frames: TabProjectNote[][],
  positions: Array<number | null>,
  maxSpan: number,
): Array<number | null> {
  const result = [...positions];
  const covers = (position: number | null, frameIndex: number): boolean => {
    if (position === null || position < 1) return false;
    const frets = frames[frameIndex].filter((n) => n.fret > 0).map((n) => n.fret);
    if (frets.length === 0) return true; // 空弦帧（或纯空弦）不限制手位
    const fmin = Math.min(...frets);
    const fmax = Math.max(...frets);
    return fmin >= position && fmax <= position + (maxSpan - 1);
  };

  for (let pass = 0; pass < 5; pass += 1) {
    // 切分为「连续同手位」的段
    const runs: Array<{ position: number | null; from: number; to: number }> = [];
    result.forEach((position, index) => {
      const last = runs[runs.length - 1];
      if (last && last.position === position) last.to = index;
      else runs.push({ position, from: index, to: index });
    });

    let changed = false;
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      if (run.to > run.from) continue; // 只处理孤立段
      const next = runs[i + 1];
      const prev = runs[i - 1];
      const target =
        next && covers(next.position, run.from)
          ? next.position
          : prev && covers(prev.position, run.from)
            ? prev.position
            : null;
      if (target !== null && target !== run.position) {
        result[run.from] = target;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/**
 * 由源文件里已有的真实指法反推把位：`position = fret - finger + 1`。
 * 取所有样本的最小值 —— 它代表「手指序最低的那根手指按在哪一品」，即手位。
 */
function impliedPositionFromExplicitFingers(notes: TabProjectNote[]): number | null {  const implied: number[] = [];
  for (const note of notes) {
    const finger = Number(note.finger);
    if (!Number.isFinite(finger) || finger < 1 || finger > 4) continue;
    if (note.fret <= 0) continue;
    implied.push(note.fret - finger + 1);
  }
  if (implied.length === 0) return null;
  const position = Math.min(...implied);
  return position >= 1 ? position : 1;
}

/**
 * 技巧修正：显式技巧对指法的约束比位置推定更硬。
 * - `slide`：同弦滑过去，同一根手指；
 * - `hammer-on`（上行）：目标用手指序递增的手指；
 * - `pull-off`（下行）：目标用手指序递减的手指。
 */
function applyTechniqueAdjustments(notes: TabProjectNote[]): void {
  const sorted = [...notes].sort((a, b) => a.offsetSec - b.offsetSec);
  const lastByString = new Map<number, TabProjectNote>();

  for (const note of sorted) {
    const previous = lastByString.get(note.string);
    if (previous && typeof previous.finger === 'number' && note.fret > 0) {
      const technique = String(note.technique || 'normal');
      const diffFret = note.fret - previous.fret;

      if (technique === 'slide' && previous.finger > 0) {
        note.finger = previous.finger;
      } else if (technique === 'hammer-on' && diffFret >= 1 && previous.finger > 0) {
        note.finger = Math.min(4, previous.finger + Math.max(1, diffFret));
      } else if (technique === 'pull-off' && diffFret <= -1 && previous.finger > 0) {
        note.finger = Math.max(1, previous.finger - Math.max(1, Math.abs(diffFret)));
      }
    }
    lastByString.set(note.string, note);
  }
}
