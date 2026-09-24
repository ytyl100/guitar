/**
 * 和弦识别（Chord Detection / Harmonic Analysis）
 * =============================================
 *
 * 为什么需要它？
 * ------------------------------------------------------------------
 * 参考的市面练习谱（`6strings-1.jpg`）里，谱面上方会标出**和弦名**（C / G / Am…），
 * 而下方往往是**单音分解**——和弦名描述的是这段乐句的**和声**，不是「同时扫响的音」。
 * 但音频转录（Basic Pitch → 音符）与 ASCII tab 都**没有和弦标签**，
 * 于是谱面上方永远是空的 —— 这正是「看起来不标准」的主要原因之一。
 *
 * 因此这里做**三级识别**，可靠度从高到低：
 *
 * | 级别 | 依据 | 典型来源 | 可信度 |
 * |---|---|---|---|
 * | ① 显式标注 | `<harmony>` / 和弦表 | MusicXML / Guitar Pro / 和弦表导入 | 直接采用 |
 * | ② 音簇匹配 | 同一时刻 ≥3 根弦同时按响 → 音高类集合查表 | 扫弦型谱面 | 高 |
 * | ③ 窗口和声分析 | 小节内全部音高类做**和弦模板匹配**（低音加权） | 单音分解旋律（本平台转录链路） | 中（必须人工核对） |
 *
 * ③ 的打分：
 * ```
 * score = 覆盖度(和弦音落在小节内) × 100
 *       + 低音是根音（原位）+40
 *       + 无斜杠写法 +8
 *       - 和弦外音 -12/个
 *       - 复杂度 -3/个和弦音（三和弦优先于七/九和弦）
 * 前提：根音必须出现；覆盖度 ≥ 60%；否则宁可不标（不猜错和弦）
 * ```
 *
 * 最后把「连续相同」的和弦名压成一次标注 —— 原谱只在和弦**变化处**写一次
 * （参考图里 C 会持续两小节才换成 G）。
 */

import {
  CHORD_VOICINGS,
  STANDARD_TUNING,
  fretToMidi,
  noteNameToPitchClass,
  voicingToNotes,
} from './tab-project.utils';
import type { TabProject, TabProjectChord, TabProjectMeasure, TabProjectNote } from './tab-project.types';

/** 同一发音时刻（和弦/扫弦）的判定容差 */
const CLUSTER_TOLERANCE_SEC = 0.03;
/** 窗口和声分析的最低覆盖度 */
const MIN_COVERAGE = 0.6;
/** 触发音簇级识别所需的最少同时发音弦数 */
const MIN_CLUSTER_STRINGS = 3;

interface ChordTemplate {
  name: string;
  rootPc: number;
  /** 相对根音的音程集合（升序） */
  intervals: number[];
  /** 该和弦包含的绝对音高类 */
  pcs: number[];
}

/** 候选和弦模板（来自人类常用把位库，按音程签名去重后取最简洁写法） */
let TEMPLATES: ChordTemplate[] = [];
/** `根音pc|音程签名` → 模板（精确匹配用） */
const EXACT_INDEX = new Map<string, ChordTemplate>();

function signatureOf(rootPc: number, pcs: number[]): string {
  const intervals = [...new Set(pcs.map((pc) => ((pc - rootPc) % 12 + 12) % 12))].sort((a, b) => a - b);
  return intervals.join('-');
}

function rootPcOf(name: string): number | null {
  const m = String(name).trim().match(/^([A-G][#b]?)/);
  return m ? noteNameToPitchClass(m[1]) : null;
}

function ensureTemplates(): void {
  if (TEMPLATES.length > 0) return;

  const bySignature = new Map<string, ChordTemplate>();
  for (const [name, frets] of Object.entries(CHORD_VOICINGS)) {
    const rootPc = rootPcOf(name);
    if (rootPc === null) continue;
    const notes = voicingToNotes(frets, STANDARD_TUNING, 0).filter((n) => n.fret >= 0);
    if (notes.length < 2) continue;

    const pcs = [...new Set(notes.map((n) => ((n.midi % 12) + 12) % 12))].sort((a, b) => a - b);
    const intervals = [...new Set(pcs.map((pc) => ((pc - rootPc) % 12 + 12) % 12))].sort((a, b) => a - b);
    const signature = `${rootPc}|${intervals.join('-')}`;

    const candidate: ChordTemplate = { name, rootPc, intervals, pcs };
    const existing = bySignature.get(signature);
    // 同音程集合可能有多种写法（C6 与 Am7）→ 优先更短、无斜杠的惯用写法
    if (
      !existing ||
      candidate.name.length < existing.name.length ||
      (existing.name.includes('/') && !candidate.name.includes('/'))
    ) {
      bySignature.set(signature, candidate);
    }
  }

  TEMPLATES = [...bySignature.values()];
  for (const t of TEMPLATES) EXACT_INDEX.set(`${t.rootPc}|${t.intervals.join('-')}`, t);
}

/** 供测试 / 调试：内置和弦模板数量 */
export function chordTemplateCount(): number {
  ensureTemplates();
  return TEMPLATES.length;
}

export interface ChordDetectOptions {
  /** 只对**没有和弦标注**的小节做识别（默认 true，不覆盖源文件真实的 `<harmony>`） */
  onlyMissing?: boolean;
  /** 是否启用③窗口和声分析（单音旋律也会标和弦）。默认 true */
  analyzeMelody?: boolean;
  tuning?: number[];
  capo?: number;
}

export interface ChordDetectStats {
  /** 最终下发的和弦标记数（已压缩连续重复） */
  chordCount: number;
  /** 来自源文件显式标注的标记数 */
  explicitCount: number;
  /** 来自音簇匹配（扫弦型）的标记数 */
  clusteredCount: number;
  /** 来自窗口和声分析的标记数 */
  estimatedCount: number;
  /** 有和弦标注的小节数 */
  measuresWithChords: number;
}

export interface ChordDetectResult {
  project: TabProject;
  stats: ChordDetectStats;
  warnings: string[];
}

interface RawHit {
  name: string;
  offsetSec: number;
  durationSec: number;
  frets?: Array<number | 'x'>;
}

/** 给一首 TabProject 补上和弦标注。纯函数（不修改传入对象）。 */
export function deriveChords(project: TabProject, options: ChordDetectOptions = {}): ChordDetectResult {
  ensureTemplates();
  const onlyMissing = options.onlyMissing !== false;
  const analyzeMelody = options.analyzeMelody !== false;
  const tuning = options.tuning?.length ? options.tuning : STANDARD_TUNING;
  const capo = options.capo ?? 0;

  const stats: ChordDetectStats = {
    chordCount: 0,
    explicitCount: 0,
    clusteredCount: 0,
    estimatedCount: 0,
    measuresWithChords: 0,
  };

  const tracks = project.tracks.map((track) => {
    /** 整轨连续处理，才能把「和弦延续到下一小节」压成一次标注 */
    let previousName: string | null = null;

    const measures: TabProjectMeasure[] = track.measures.map((sourceMeasure) => {
      const measure: TabProjectMeasure = {
        ...sourceMeasure,
        notes: sourceMeasure.notes.map((n) => ({ ...n })),
      };

      // ── ① 显式标注：源文件已有和弦 → 直接采用 ──
      const explicit: RawHit[] = (measure.chords || [])
        .filter((c) => !!c.name)
        .map((c) => ({
          name: String(c.name).trim(),
          offsetSec: Number(c.offsetSec || 0),
          durationSec: Number(c.durationSec || 0),
          frets: c.frets,
        }));

      let hits: RawHit[];
      if (explicit.length > 0) {
        hits = explicit;
        stats.explicitCount += hits.length;
      } else if (onlyMissing) {
        // ── ② 音簇匹配（扫弦 / 柱式和弦）──
        const clustered = detectClusterChords(measure);
        if (clustered.length > 0) {
          hits = clustered;
          stats.clusteredCount += hits.length;
        } else if (analyzeMelody) {
          // ── ③ 窗口和声分析（单音分解旋律）──
          const estimated = estimateMeasureChord(measure, { tuning, capo });
          hits = estimated ? [estimated] : [];
          stats.estimatedCount += hits.length;
        } else {
          hits = [];
        }
      } else {
        hits = [];
      }

      // ── 压缩：与上一小节同名的延续不重复标注 ──
      const chords: TabProjectChord[] = [];
      for (const hit of hits) {
        if (previousName === hit.name && chords.length === 0) continue;
        previousName = hit.name;
        chords.push({
          name: hit.name,
          offsetSec: Number(hit.offsetSec.toFixed(4)),
          beat: Number((hit.offsetSec / (60 / (measure.bpm || 100))).toFixed(4)),
          durationSec: Number(Math.max(0.05, hit.durationSec).toFixed(4)),
          frets: hit.frets,
        });
      }

      if (chords.length > 0) {
        measure.chords = chords;
        stats.measuresWithChords += 1;
        stats.chordCount += chords.length;
      }
      return measure;
    });

    return { ...track, measures };
  });

  const warnings: string[] = [];
  if (stats.clusteredCount > 0) {
    warnings.push(
      `已按「同一时刻 ≥${MIN_CLUSTER_STRINGS} 根弦同时按响」的音簇识别出 ${stats.clusteredCount} 个和弦。`,
    );
  }
  if (stats.estimatedCount > 0) {
    warnings.push(
      `有 ${stats.estimatedCount} 个和弦来自**单音分解旋律的和声推定**（窗口模板匹配，不是人工标注），` +
        `请人工核对和弦名是否与听感一致。`,
    );
  }

  return { project: { ...project, tracks }, stats, warnings };
}

// ─────────────────────────────────────────────
// ② 音簇匹配
// ─────────────────────────────────────────────

function detectClusterChords(measure: TabProjectMeasure): RawHit[] {
  const sorted = [...measure.notes].sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string);
  const out: RawHit[] = [];

  let i = 0;
  while (i < sorted.length) {
    const onset = sorted[i].offsetSec;
    let j = i;
    while (j + 1 < sorted.length && Math.abs(sorted[j + 1].offsetSec - onset) <= CLUSTER_TOLERANCE_SEC) {
      j += 1;
    }
    const group = sorted.slice(i, j + 1).filter((n) => n.fret >= 0);
    if (group.length >= MIN_CLUSTER_STRINGS) {
      const pcs = group.map((n) => ((n.midi % 12) + 12) % 12);
      const lowest = Math.min(...group.map((n) => n.midi));
      const name = matchExact(pcs, lowest);
      if (name) {
        out.push({
          name,
          offsetSec: Number(onset.toFixed(4)),
          durationSec: Math.max(...group.map((n) => n.durationSec)),
          frets: fretsFromCluster(group),
        });
      }
    }
    i = j + 1;
  }

  return collapse(out);
}

/** 精确匹配：音高类集合与某个和弦模板完全一致 */
function matchExact(pcs: number[], lowestMidi: number): string | null {
  const unique = [...new Set(pcs.map((pc) => ((pc % 12) + 12) % 12))];
  const lowestPc = ((lowestMidi % 12) + 12) % 12;
  let best: { name: string; score: number } | null = null;

  for (const rootPc of unique) {
    const entry = EXACT_INDEX.get(`${rootPc}|${signatureOf(rootPc, unique)}`);
    if (!entry) continue;
    let score = 100;
    if (rootPc === lowestPc) score += 40;
    if (!entry.name.includes('/')) score += 8;
    score -= entry.name.length;
    if (!best || score > best.score) best = { name: entry.name, score };
  }
  return best ? best.name : null;
}

// ─────────────────────────────────────────────
// ③ 窗口和声分析（单音分解旋律）
// ─────────────────────────────────────────────

function estimateMeasureChord(
  measure: TabProjectMeasure,
  ctx: { tuning: number[]; capo: number },
): RawHit | null {
  const notes = (measure.notes || []).filter((n) => n.fret >= 0);
  if (notes.length < 3) return null; // 音太少无法判断和声，宁可不标

  const pcs = [...new Set(notes.map((n) => ((n.midi % 12) + 12) % 12))];
  if (pcs.length < 2) return null;

  const bassPc = ((Math.min(...notes.map((n) => n.midi)) % 12) + 12) % 12;

  let best: { template: ChordTemplate; score: number } | null = null;

  for (const template of TEMPLATES) {
    // 根音必须出现，否则直接排除（避免「听起来像但根音没弹」的错误标注）
    if (!pcs.includes(template.rootPc)) continue;

    const covered = template.pcs.filter((pc) => pcs.includes(pc)).length;
    const coverage = covered / template.pcs.length;
    if (coverage < MIN_COVERAGE) continue;

    const outside = pcs.filter((pc) => !template.pcs.includes(pc)).length;

    let score = coverage * 100;
    if (template.rootPc === bassPc) score += 40;
    if (!template.name.includes('/')) score += 8;
    score -= outside * 12;
    score -= template.intervals.length * 3;
    score -= template.name.length * 0.5;

    if (!best || score > best.score) best = { template, score };
  }

  if (!best) return null;

  const measureSpan = Math.max(0.05, measure.endTime - measure.startTime);
  const lastNoteEnd = Math.max(...notes.map((n) => n.offsetSec + n.durationSec));

  return {
    name: best.template.name,
    offsetSec: 0,
    durationSec: Math.max(measureSpan, lastNoteEnd),
    /**
     * 窗口推定不是「实际同时按响的把位」→ **不下发指法图**，
     * 否则小程序会画出一个与演奏方式不符的和弦图。
     */
    frets: undefined,
  };
}

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

function fretsFromCluster(group: TabProjectNote[]): Array<number | 'x'> {
  const frets: Array<number | 'x'> = ['x', 'x', 'x', 'x', 'x', 'x'];
  for (const note of group) {
    const idx = 6 - Math.min(Math.max(1, note.string), 6);
    if (idx < 0 || idx > 5) continue;
    frets[idx] = note.fret < 0 ? 'x' : note.fret;
  }
  return frets;
}

/** 把连续相同的和弦名压成一次标注 */
function collapse(hits: RawHit[]): RawHit[] {
  const out: RawHit[] = [];
  for (const hit of hits) {
    const last = out[out.length - 1];
    if (last && last.name === hit.name) {
      last.durationSec = Number((hit.offsetSec + hit.durationSec - last.offsetSec).toFixed(4));
      continue;
    }
    out.push({ ...hit });
  }
  return out;
}

/** 供调试 / 测试：某音的 MIDI */
export function midiOf(string: number, fret: number, tuning = STANDARD_TUNING, capo = 0): number {
  return fretToMidi(string, fret, tuning, capo);
}
