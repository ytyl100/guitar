import type { AudioTabSyncConfig, MusicTrack } from '../types';

/**
 * 「发布 → 音乐库」条目构造器
 * ==========================
 *
 * 为什么单独成文件：早期实现是 `{ ...prev[0], title }` —— 拿**上一条曲目当模板**，
 * 于是新条目的 `artist / keySignature / genre / difficulty / tabConfig` 全是别人的歌的：
 * 实测把一条 YouTube Audio Library 的转录音频发上去，音乐库卡片显示成
 * 「原唱/伴奏: 周杰伦 · G大调 · 流行弹唱 · 19.2s」—— 而它其实是 64.2s 的器乐曲。
 * 更隐蔽的是 `tabConfig.measureTimestamps / waveformPeaks / noteTimestamps` 也是别人的，
 * 一旦在旧工作台里打开这条曲目就会看到**另一首歌的小节线**。
 *
 * 现在的规则：**只填我们真的知道的**（来自转录项目），不知道的一律中性值 / 留空，
 * 由人工在音乐库里补（`MusicLibraryStudio` 有「编辑元数据」）。
 */

/** 发布时能拿到的转录项目元数据（ReviewPage 从项目详情里带过来） */
export interface PublishedTrackMeta {
  artist?: string | null;
  bpm?: number | null;
  durationSec?: number | null;
  /** '4/4' 这类拍号字符串 */
  timeSignature?: string | null;
  /** 调性（有镜像到 Score 链路时才有） */
  keySignature?: string | null;
  /** 后端 Score ID（未镜像时为空） */
  scoreId?: string | null;
}

/**
 * 小节时长 = 拍数 × (60/bpm) × (4/拍号分母)。
 * ⚠️ 与复核工作台、tab-import 同一口径（历史数据不要用 60/bpm 硬算）。
 */
export function measureDurationSec(meta?: PublishedTrackMeta): number {
  const bpm = Number(meta?.bpm) > 0 ? Number(meta?.bpm) : 80;
  const [beatsRaw, denomRaw] = String(meta?.timeSignature || '4/4').split('/');
  const beats = Number(beatsRaw) > 0 ? Number(beatsRaw) : 4;
  const denom = Number(denomRaw) > 0 ? Number(denomRaw) : 4;
  return beats * (60 / bpm) * (4 / denom);
}

/** 均匀铺开的小节起点（后端按同上口径切小节，因此与 C 端一致） */
export function uniformMeasureTimestamps(measureCount: number, meta?: PublishedTrackMeta): number[] {
  const count = Math.max(0, Math.floor(Number(measureCount) || 0));
  const step = measureDurationSec(meta);
  return Array.from({ length: count }, (_, i) => Number((i * step).toFixed(3)));
}

export function buildPublishedMusicTrack(input: {
  title: string;
  projectId?: string;
  revision: number;
  /** 已发布的小节数（来自 publish 结果 stats.measureCount） */
  measureCount?: number;
  meta?: PublishedTrackMeta;
  /** 幂等用：同一项目重复发布/同步时保持稳定 id */
  stamp?: string;
}): MusicTrack {
  const now = input.stamp || new Date().toISOString();
  const meta = input.meta || {};
  const durationSec = Number(meta.durationSec) > 0 ? Number(meta.durationSec) : 0;
  const bpm = Number(meta.bpm) > 0 ? Number(meta.bpm) : undefined;
  const scoreId = meta.scoreId || undefined;

  const tabConfig: AudioTabSyncConfig = {
    // 音频身份：指向转录项目，而不是上一条曲目
    audioId: input.projectId ? `transcription-project-${input.projectId}` : `music-track-${Date.now()}`,
    audioTitle: input.title,
    audioDurationSec: durationSec,
    // 波形/音符由复核工作台持有；这里**不复制别人的**
    waveformPeaks: [],
    measureTimestamps: uniformMeasureTimestamps(input.measureCount || 0, meta),
    noteTimestamps: [],
    playbackOffsetMs: 0,
    bpm,
    timeSignature: parseTimeSignature(meta.timeSignature),
    remoteScoreId: scoreId,
  };

  return {
    id: input.projectId ? `track-${input.projectId}` : `track-${Date.now()}`,
    title: input.title || '未命名曲目',
    // 转录音频通常没有歌手（器乐/伴奏）→ 用中性值，别继承上一条
    artist: (meta.artist || '').trim() || '未标注',
    genre: '综合练习曲',
    difficulty: '入门',
    keySignature: (meta.keySignature || '').trim() || '未定调',
    status: 'published',
    currentVersion: `r${input.revision}`,
    versions: [],
    tabConfig,
    tags: ['自动转录'],
    createdAt: now,
    updatedAt: now,
    cEndPlayCount: 0,
    backendScoreId: scoreId,
    sourceProjectId: input.projectId,
  };
}

function parseTimeSignature(value?: string | null): [number, number] | undefined {
  const [beatsRaw, denomRaw] = String(value || '').split('/');
  const beats = Number(beatsRaw);
  const denom = Number(denomRaw);
  if (!Number.isFinite(beats) || !Number.isFinite(denom) || beats <= 0 || denom <= 0) return undefined;
  return [beats, denom];
}
