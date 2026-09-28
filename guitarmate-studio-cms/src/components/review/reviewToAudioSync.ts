import type { ApiTabProject } from '../../services/api';
import type { AudioTabSyncConfig, TabNote } from '../../types';
import { tabProjectToReviewMeasures, type ReviewChord } from './reviewTypes';

/**
 * 「① 音频导入与六线谱校正」 → 「音频与六线谱对齐（兼容）」 的桥接层
 * ==============================================================
 *
 * 为什么需要它：
 * 这两个工作台面向同一份数据，但**契约不同** ——
 * - 复核工作台（①）持有 `TabProject`（小节 `startTime/endTime` + 音符 `offsetSec` 相对小节）；
 * - 对齐工作台持有 `AudioTabSyncConfig`（小节是**绝对秒数组**、音符是**绝对秒**的 `TabNote[]`）。
 *
 * 早先两者之间只有一个「去对齐工作台精修」按钮，且**只传了 scoreId** ——
 * 于是跳过去之后谱面还是上一条曲目的内容，必须人工重列小节线/重挂音符，
 * 而且发布时会把复核阶段的**和弦标注丢掉**（对齐页的 chords 来自自己的局部 state）。
 *
 * 本模块把这些换算集中成**纯函数**（便于回归脚本直接 import 验证）：
 * 1. `buildAlignmentPatch()`：TabProject + 项目元数据 → `AudioTabSyncConfig` 的增量补丁；
 * 2. 同时回传统计信息（小节/音符/低置信度/和弦数）供 UI 提示。
 *
 * ⚠️ 音符/小节换算**复用 `tabProjectToReviewMeasures`**，不另写一份 ——
 * 两份换算必然逐渐漂移（这正是 `standardTabLayout.ts` 跨端踩过的坑）。
 */

/**
 * 从复核工作台带到对齐工作台的「种子」。
 *
 * ⚠️ `tabProject` 必须是**当前正在编辑的草稿**（可能还没保存），
 * 否则用户刚改完的音符会在跳转后消失。
 */
export interface AlignmentSeed {
  /** 转录项目 id（音乐库用 `sourceProjectId` 关联它） */
  projectId: string;
  title: string;
  artist?: string | null;
  /** 已镜像到发布链路时才有 */
  scoreId?: string | null;
  /** 用作「分轨音频路径」的地址：优先吉他分轨（转录来源），其次源混音 */
  audioUrl?: string | null;
  /** 源混音地址（仅用于提示） */
  sourceAudioUrl?: string | null;
  durationSec?: number | null;
  bpm?: number | null;
  /** '4/4' 这类拍号字符串 */
  timeSignature?: string | null;
  /** 复核页当前草稿 */
  tabProject: ApiTabProject | null;
}

export interface AlignmentPatchStats {  measureCount: number;
  noteCount: number;
  lowConfidenceCount: number;
  chordCount: number;
  /** 用到的时长（秒） */
  durationSec: number;
}

export interface AlignmentPatchResult {
  patch: Partial<AudioTabSyncConfig>;
  stats: AlignmentPatchStats;
  /** 无法从种子推导出内容时的说明（UI 直接展示，不要静默） */
  warning?: string;
}

/** TabNote 的 `technique` 联合类型里没有 `dead-note`（哑音）→ 用最接近的闷音表示 */
const TECHNIQUE_MAP: Record<string, TabNote['technique']> = {
  normal: 'normal',
  'hammer-on': 'hammer-on',
  'pull-off': 'pull-off',
  slide: 'slide',
  bend: 'bend',
  vibrato: 'vibrato',
  'palm-mute': 'palm-mute',
  harmonic: 'harmonic',
  'dead-note': 'palm-mute',
};

export const toTabNoteTechnique = (raw?: string | null): TabNote['technique'] =>
  TECHNIQUE_MAP[String(raw || 'normal')] ?? 'normal';

/** '4/4' → [4, 4]；非法值返回 undefined（不改动 config 里已有的值） */
export const parseTimeSignature = (value?: string | null): [number, number] | undefined => {
  const [beatsRaw, denomRaw] = String(value || '').split('/');
  const beats = Number(beatsRaw);
  const denom = Number(denomRaw);
  if (!Number.isFinite(beats) || !Number.isFinite(denom) || beats <= 0 || denom <= 0) return undefined;
  return [beats, denom];
};

const round3 = (v: number) => Number(Number(v || 0).toFixed(3));
const positive = (v?: number | null): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * 种子 → 对齐工作台的配置补丁。
 *
 * 只返回**确实知道**的字段：不知道的一律不放进 patch（由调用方 `{...base, ...patch}` 保留原值），
 * 避免把上一条曲目的波形/小节线/循环区带到新曲目上。
 */
export function buildAlignmentPatch(seed: AlignmentSeed): AlignmentPatchResult {
  const measures = tabProjectToReviewMeasures(seed.tabProject);

  const noteTimestamps: TabNote[] = measures.flatMap((m) =>
    m.notes.map((n) => ({
      id: n.id,
      measureIndex: m.index,
      stringIndex: n.string,
      fret: n.fret,
      timestampSec: round3(n.startSec),
      durationSec: Number(Math.max(0.02, n.durationSec || 0.25).toFixed(3)),
      technique: toTabNoteTechnique(n.technique),
      velocity: Number.isFinite(Number(n.velocity)) ? Number(n.velocity) : 90,
      chordName: n.chordName,
      confidence: Number.isFinite(Number(n.confidence)) ? Number(n.confidence) : 1,
      pitch: Number.isFinite(Number(n.midi)) ? Number(n.midi) : undefined,
    })),
  );

  const measureTimestamps = measures.map((m) => round3(m.startTime));

  // 和弦标注：小节内显式和弦优先，其次用「推荐和弦」在小节起点补一个，
  // 这样复核阶段标注的和弦不会在重新发布时凭空消失。
  const chordMarkers: Array<{ id: string; chordName: string; startTime: number }> = [];
  const seen = new Set<string>();
  measures.forEach((m) => {
    const explicit: ReviewChord[] = m.chords && m.chords.length > 0 ? m.chords : [];
    const list: ReviewChord[] =
      explicit.length > 0
        ? explicit
        : m.chord
          ? [{ id: `rec_${m.index}`, name: m.chord, offsetSec: 0, durationSec: m.duration }]
          : [];
    list.forEach((c, i) => {
      const name = String(c.name || '').trim();
      if (!name) return;
      const startTime = round3(m.startTime + Number(c.offsetSec || 0));
      const key = `${name}@${startTime}`;
      if (seen.has(key)) return;
      seen.add(key);
      chordMarkers.push({ id: `seed_chord_${m.index}_${i}`, chordName: name, startTime });
    });
  });
  chordMarkers.sort((a, b) => a.startTime - b.startTime);

  const notesEnd = noteTimestamps.reduce((max, n) => Math.max(max, n.timestampSec + n.durationSec), 0);
  const measuresEnd = measures.reduce((max, m) => Math.max(max, m.endTime || m.startTime + m.duration), 0);
  const durationSec = Number(
    (positive(seed.durationSec) ?? Math.max(measuresEnd, notesEnd, 0)).toFixed(2),
  );

  const bpm = positive(seed.bpm);
  const timeSignature = parseTimeSignature(seed.timeSignature);
  const lowConfidenceCount = noteTimestamps.filter((n) => (n.confidence ?? 1) < 0.6).length;

  const patch: Partial<AudioTabSyncConfig> = {
    audioId: `transcription-project-${seed.projectId}`,
    audioTitle: seed.title,
    // 波形在 App 侧异步提取（拿到真实音频后覆盖），这里先清空，
    // 否则会残留上一条曲目的波形 → 起音线/对齐诊断全部是错的。
    waveformPeaks: [],
    measureTimestamps,
    noteTimestamps,
    lowConfidenceCount,
    chordMarkers,
    playbackOffsetMs: 0,
    // 换了曲子，旧曲子的 A-B 循环区间没有意义
    loopRegion: undefined,
    remoteAudioPath: seed.audioUrl || undefined,
    remoteChannel: 'guitar',
    transcriptionFileName: `转录项目 ${seed.projectId}`,
  };
  if (durationSec > 0) patch.audioDurationSec = durationSec;
  if (bpm) patch.bpm = bpm;
  if (timeSignature) patch.timeSignature = timeSignature;
  if (seed.scoreId) patch.remoteScoreId = seed.scoreId;

  const warning =
    noteTimestamps.length === 0
      ? '该项目还没有六线谱内容（转录可能未完成）—— 打开后需要先在小节切分里生成小节线并挂音符'
      : measureTimestamps.length === 0
        ? '谱面音符缺少小节线，已按小节窗口推导失败；请用「重排小节线」重新生成'
        : undefined;

  return {
    patch,
    stats: {
      measureCount: measureTimestamps.length,
      noteCount: noteTimestamps.length,
      lowConfidenceCount,
      chordCount: chordMarkers.length,
      durationSec,
    },
    warning,
  };
}

/** 供 UI 展示一句话摘要 */
export function describeAlignmentStats(stats: AlignmentPatchStats): string {
  return `${stats.measureCount} 个小节 · ${stats.noteCount} 个音符 · ${stats.chordCount} 处和弦标注 · 低置信度 ${stats.lowConfidenceCount}${
    stats.durationSec > 0 ? ` · ${stats.durationSec}s` : ''
  }`;
}

/**
 * 「种子」里**需要异步补做**的部分。
 *
 * 配置本身的合并由 App 一次性完成（保证首屏就是对的，不会闪一下旧曲目）；
 * 这里只承载必须等待网络/计算的副作用：
 * - `waveformUrl`：从项目音频提取真实波形（否则起音线/对齐诊断没有意义）；
 * - `autoDetectBarres`：复核阶段没有横按数据，但可以按 30ms 容差重新识别。
 *
 * `token` 必须每次跳转都不同 —— AudioTabSyncStudio 用它保证副作用**只执行一次**
 * （同一个项目连续点两次也要重新提取）。
 */
export interface AlignmentSeedPayload {
  token: string;
  waveformUrl?: string | null;
  autoDetectBarres?: boolean;
}
