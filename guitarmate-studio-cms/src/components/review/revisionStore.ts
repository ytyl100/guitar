/**
 * 修订点存储与「发布快照 → 草稿」反解
 * ==================================
 *
 * 需求 2.3「校正可以回滚到之前的修改点」分三层（见 `useDraftHistory` 注释）：
 * 本文件负责后两层里**纯数据**的部分：
 *
 * 1. **命名快照**：管理员手动「存点」→ 存 localStorage（按 projectId 隔离）。
 *    为什么不走后端？—— 校正过程中会有几十个中间态，全部落库会污染项目记录；
 *    而"存点"是**本地里程碑**，真正需要留痕的是「发布」。
 * 2. **发布快照反解**：`GET /projects/:id/package?revision=N` 拿到的是
 *    PracticePackage（C 端契约），本文件把它**反解回 TabProject**，
 *    这样「回滚到 r3」就能直接进草稿继续编辑。
 *
 * ⚠️ 反解是**有损**的：PracticePackage 的 `x` / `y` 是归一化展示坐标、
 * 和弦只有名称与时间（没有 `frets`）。因此反解只用于「回到那时的谱面」，
 * 不要把它当作无损存档。
 */

import type { ApiTabProject } from '../../services/api';

/** 本地命名快照 */
export interface DraftSnapshot {
  id: string;
  /** 用户填的备注（如「改完第 5-8 小节把位」） */
  label: string;
  createdAt: string;
  /** 快照时刻的统计（列表里快速识别用，避免为了显示去解析大对象） */
  measureCount: number;
  noteCount: number;
  tabProject: ApiTabProject;
}

/** PracticePackage 里我们真正用得到的部分（不引入后端类型，保持 CMS 独立） */
export interface PackageLike {
  revision?: number;
  publishedAt?: string;
  measures?: Array<{
    index?: number;
    label?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    position?: number;
    trackData?: Array<{
      notes?: Array<{
        id?: string;
        string: number;
        fret: number;
        relativeTime: number;
        duration: number;
        technique?: string;
        finger?: number;
        position?: number;
      }>;
    }>;
    chords?: Array<{ chordName?: string; startTime?: number; duration?: number }>;
  }>;
}

const STORAGE_PREFIX = 'guitarmate_tab_snapshots_';

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

/** 读取某项目的全部快照（按时间倒序） */
export function loadSnapshots(projectId: string): DraftSnapshot[] {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as DraftSnapshot[])
      .filter((s) => s && s.id && s.tabProject)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** 写入（新增或覆盖同 id） */
export function upsertSnapshot(projectId: string, snapshot: DraftSnapshot, limit = 20): DraftSnapshot[] {
  const next = [snapshot, ...loadSnapshots(projectId).filter((s) => s.id !== snapshot.id)].slice(0, limit);
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {
    /* 隐私模式 / 配额不足时静默降级：快照是便利功能，不能阻塞校正 */
  }
  return next;
}

export function removeSnapshot(projectId: string, snapshotId: string): DraftSnapshot[] {
  const next = loadSnapshots(projectId).filter((s) => s.id !== snapshotId);
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {
    /* 同上 */
  }
  return next;
}

/** 统计一份 TabProject 的小节 / 音符数（存点时记下来，列表展示用） */
export function summarizeTabProject(project: ApiTabProject): { measureCount: number; noteCount: number } {
  const measures = project?.tracks?.[0]?.measures || [];
  return {
    measureCount: measures.length,
    noteCount: measures.reduce((sum, m) => sum + (m.notes?.length || 0), 0),
  };
}

/** 契约的技巧写法（snake_case）→ CMS / TabProject 写法（kebab-case） */
const TECHNIQUE_FROM_CONTRACT: Record<string, string> = {
  normal: 'normal',
  hammer_on: 'hammer-on',
  pull_off: 'pull-off',
  slide: 'slide',
  bend: 'bend',
  vibrato: 'vibrato',
  harmonic: 'harmonic',
  palm_mute: 'palm-mute',
  mute: 'dead-note',
  tap: 'tap',
};

/**
 * PracticePackage（发布快照）→ TabProject（可继续编辑的草稿）。
 *
 * `template` 提供 meta / tuning / capo / source / warnings —— 快照里没有这些，
 * 但它们与谱面无关，直接沿用当前草稿即可（避免"回滚把调弦也改回默认"）。
 */
export function practicePackageToTabProject(pkg: PackageLike, template: ApiTabProject): ApiTabProject {
  const templateTrack = template?.tracks?.[0];
  const tuning = template?.tuning?.length ? template.tuning : templateTrack?.tuning || [];
  const capo = template?.capo ?? 0;
  const beatsPerMeasure = Number(String(template?.meta?.timeSignature || '4/4').split('/')[0]) || 4;

  const measures = (pkg?.measures || []).map((m, index) => {
    const startTime = Number(m.startTime ?? 0);
    const notes = (m.trackData || []).flatMap((t) => t.notes || []);
    return {
      index: Number.isFinite(Number(m.index)) ? Number(m.index) : index,
      label: m.label || `第 ${index + 1} 小节`,
      startTime,
      endTime: Number(m.endTime ?? startTime),
      beats: beatsPerMeasure,
      position: typeof m.position === 'number' ? m.position : undefined,
      notes: notes
        .map((n, noteIndex) => {
          const string = Math.max(1, Math.min(6, Number(n.string) || 1));
          const fret = Number(n.fret) || 0;
          const offsetSec = Number(n.relativeTime) || 0;
          return {
            id: String(n.id || `r_m${index}_n${noteIndex}`),
            string,
            fret,
            midi: Number(tuning[string - 1] ?? 0) + fret + capo,
            offsetSec,
            beat: Number((offsetSec / Math.max(0.01, (Number(m.duration) || 1) / beatsPerMeasure)).toFixed(4)),
            durationSec: Number(n.duration) || 0.25,
            technique: TECHNIQUE_FROM_CONTRACT[String(n.technique || 'normal')] || 'normal',
            finger: typeof n.finger === 'number' ? n.finger : undefined,
            position: typeof n.position === 'number' ? n.position : undefined,
            confidence: 1,
          };
        })
        .sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string),
      chords: (m.chords || []).map((c, chordIndex) => ({
        id: `r_m${index}_c${chordIndex}`,
        name: String(c.chordName || '').trim(),
        offsetSec: Number(c.startTime ?? 0),
        durationSec: Number(c.duration) || 0,
        beat: 0,
      })).filter((c) => !!c.name),
    };
  });

  return {
    ...template,
    tracks: [
      {
        id: templateTrack?.id || 'track-1',
        name: templateTrack?.name || '吉他',
        instrument: templateTrack?.instrument || 'guitar',
        tuning,
        capo,
        measures,
      },
      ...(template?.tracks || []).slice(1),
    ],
    warnings: [
      ...(template?.warnings || []),
      {
        level: 'info',
        code: 'rolled-back-from-package',
        message: `已从发布快照 r${pkg?.revision ?? '?'} 反解谱面（归一化坐标与和弦指法不在快照内，已按当前工程元信息重建）`,
      },
    ],
  } as ApiTabProject;
}
