import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHORD_LIBRARY,
  INITIAL_CHORD_GROUPS,
  INITIAL_STAGES,
  buildInitialVideoLibrary,
} from '../data/initialData';
import type { ChordConfig, ChordGroup, Stage, TeachingVideo } from '../types';
import { API_BASE_URL } from '../services/api';

/**
 * 课程大纲的唯一入口（**后端 API 为唯一数据源**）
 * ================================================
 *
 * ## 为什么要把 localStorage 换掉
 *
 * 原来课程大纲（阶段/视频库/和弦库/和弦组）存在**浏览器 localStorage** 里：
 * 换浏览器或清站点数据就没了，而且**小程序端根本读不到** ——
 * 它只能读一份自己硬编码的假课程。这就是「曲库」当初踩过的同一个坑
 * （前端硬编码 / 本地存储 → 后端删了前端还看得到、后台改了 C 端看不到），
 * 那次已经统一成「后端唯一数据源」，课程大纲现在照同一套办：
 *
 * ```
 * CMS 编辑 ──PUT /api/curriculum──▶ CurriculumDoc(单例 JSON) ──GET /api/curriculum/learn──▶ 小程序 Learn 页
 * ```
 *
 * ## 行为
 *
 * 1. 挂载时 `GET /api/curriculum`（首次后端会**自动落库内置种子**）；
 * 2. 任何一处编辑 → 800ms 防抖 → `PUT`（带 `baseRevision` 做乐观锁）；
 * 3. localStorage 降级为**本地缓存**：后端连不上时仍可继续编辑、刷新不丢，恢复后再推上去；
 * 4. **一次性迁移**：如果后端还是「刚播种、revision=1」而本地 localStorage 里已有编辑过的数据，
 *    以本地为准并立即推送 —— 否则管理员之前在本机做的课程调整会被种子覆盖掉（数据看着"消失"）；
 * 5. 409（别人改过）→ 停止自动保存并提示，避免互相覆盖；提供「重载后端」。
 */

/** 与后端 `CurriculumData` 对应；同时保留原来的 localStorage key 作为本地缓存 */
const CACHE_KEYS = {
  stages: 'guitarmate_curriculum_stages',
  videoLibrary: 'guitarmate_video_library',
  chords: 'guitarmate_chord_library',
  chordGroups: 'guitarmate_chord_groups',
} as const;

const SAVE_DEBOUNCE_MS = 800;

export interface CurriculumSyncState {
  /** loading = 首次拉取中；ready = 与后端一致；saving = 正在保存；error = 失败（见 message） */
  status: 'loading' | 'ready' | 'saving' | 'error';
  message: string;
  /** 后端当前版本号；用于乐观锁 */
  revision: number | null;
  updatedAt: string | null;
}

export interface CurriculumStore {
  stages: Stage[];
  setStages: React.Dispatch<React.SetStateAction<Stage[]>>;
  videoLibrary: TeachingVideo[];
  setVideoLibrary: React.Dispatch<React.SetStateAction<TeachingVideo[]>>;
  chords: Record<string, ChordConfig>;
  setChords: React.Dispatch<React.SetStateAction<Record<string, ChordConfig>>>;
  chordGroups: ChordGroup[];
  setChordGroups: React.Dispatch<React.SetStateAction<ChordGroup[]>>;
  sync: CurriculumSyncState;
  /** 立即保存（不等防抖） */
  save: () => Promise<void>;
  /** 丢弃本地、重新从后端拉取（冲突或想回到后端版本时用） */
  reload: () => Promise<void>;
}

/** 读本地缓存（迁移/降级用），任一项缺失或非法就返回 null */
function readCache(): {
  stages: Stage[];
  videoLibrary: TeachingVideo[];
  chords: Record<string, ChordConfig>;
  chordGroups: ChordGroup[];
} | null {
  try {
    const stagesRaw = localStorage.getItem(CACHE_KEYS.stages);
    if (!stagesRaw) return null;
    const stages = JSON.parse(stagesRaw) as Stage[];
    if (!Array.isArray(stages) || stages.length === 0) return null;
    return {
      stages,
      videoLibrary: JSON.parse(localStorage.getItem(CACHE_KEYS.videoLibrary) || '[]'),
      chords: JSON.parse(localStorage.getItem(CACHE_KEYS.chords) || '{}'),
      chordGroups: JSON.parse(localStorage.getItem(CACHE_KEYS.chordGroups) || '[]'),
    };
  } catch {
    return null;
  }
}

function writeCache(data: {
  stages: Stage[];
  videoLibrary: TeachingVideo[];
  chords: Record<string, ChordConfig>;
  chordGroups: ChordGroup[];
}) {
  try {
    localStorage.setItem(CACHE_KEYS.stages, JSON.stringify(data.stages));
    localStorage.setItem(CACHE_KEYS.videoLibrary, JSON.stringify(data.videoLibrary));
    localStorage.setItem(CACHE_KEYS.chords, JSON.stringify(data.chords));
    localStorage.setItem(CACHE_KEYS.chordGroups, JSON.stringify(data.chordGroups));
  } catch {
    /* 隐私模式/配额不足：缓存是便利功能，不能阻塞编辑 */
  }
}

export function useCurriculumStore(): CurriculumStore {
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [videoLibrary, setVideoLibrary] = useState<TeachingVideo[]>(() =>
    buildInitialVideoLibrary(INITIAL_STAGES),
  );
  const [chords, setChords] = useState<Record<string, ChordConfig>>(CHORD_LIBRARY);
  const [chordGroups, setChordGroups] = useState<ChordGroup[]>(INITIAL_CHORD_GROUPS);

  const [sync, setSync] = useState<CurriculumSyncState>({
    status: 'loading',
    message: '正在从后端读取课程大纲…',
    revision: null,
    updatedAt: null,
  });

  /** 已经完成首次水合（避免水合过程中把初始种子误当成编辑推上去） */
  const hydratedRef = useRef(false);
  /** 自动保存闸门：冲突（409）或未水合时不开 */
  const saveEnabledRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 上一次「已与后端一致」的那份数据（序列化后）。
   *
   * ⚠️ 不加这道闸门时：`reload()` 水合完 → 四个 slice 换了引用 → 防抖 effect 立刻发一次 PUT，
   * 于是**每打开/刷新一次后台，revision 就 +1（StrictMode 开发期 +2）**，
   * 内容一模一样也照推。实测有一次刷新的 revision 从 12 直接跑到 16。
   * 现在只有内容真的变了才推。
   */
  const lastSavedRef = useRef('');
  /** 最新的四个 slice（防抖回调里读 state 会拿到过期闭包） */
  const dataRef = useRef({ stages, videoLibrary, chords, chordGroups });
  dataRef.current = { stages, videoLibrary, chords, chordGroups };

  const push = useCallback(async (): Promise<void> => {
    const revision = revisionRef.current;
    setSync((s) => ({ ...s, status: 'saving', message: '正在保存到后端…' }));
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/curriculum${revision !== null ? `?baseRevision=${revision}` : ''}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataRef.current),
        },
      );
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        saveEnabledRef.current = false;
        setSync({
          status: 'error',
          message: body.message || '课程大纲已被他人修改，已停止自动保存以免覆盖。',
          revision,
          updatedAt: null,
        });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { revision: number; updatedAt: string };
      revisionRef.current = body.revision;
      writeCache(dataRef.current);
      lastSavedRef.current = JSON.stringify(dataRef.current);
      setSync({
        status: 'ready',
        message: `已同步到后端（revision ${body.revision}）`,
        revision: body.revision,
        updatedAt: body.updatedAt,
      });
    } catch (err) {
      /** 失败**不关闸门**：后端恢复后下次编辑会继续尝试；本地已由缓存兜住 */
      setSync({
        status: 'error',
        message: `后端不可用，改动已暂存在本机：${
          err instanceof Error ? err.message : String(err)
        }`,
        revision,
        updatedAt: null,
      });
    }
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    setSync((s) => ({ ...s, status: 'loading', message: '正在从后端重载…' }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/curriculum`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        revision: number;
        updatedAt: string;
        source: 'db' | 'seed';
        data: {
          stages: Stage[];
          videoLibrary: TeachingVideo[];
          chords: Record<string, ChordConfig>;
          chordGroups: ChordGroup[];
        };
      };
      const local = readCache();
      /** 一次性迁移判据：后端还是刚播种的状态 + 本机有编辑过的数据 → 以本机为准推上去 */
      const backendIsPristine = body.revision === 1;
      const hasLocalEdits = local && JSON.stringify(local.stages) !== JSON.stringify(body.data.stages);

      if (backendIsPristine && hasLocalEdits && local) {
        setStages(local.stages);
        setVideoLibrary(local.videoLibrary);
        setChords(local.chords);
        setChordGroups(local.chordGroups);
        dataRef.current = local;
        revisionRef.current = body.revision;
        hydratedRef.current = true;
        saveEnabledRef.current = true;
        setSync({
          status: 'saving',
          message: '检测到本机有未上传的课程调整，正在推送到后端…',
          revision: body.revision,
          updatedAt: null,
        });
        void push();
        return;
      }

      setStages(body.data.stages?.length ? body.data.stages : INITIAL_STAGES);
      setVideoLibrary(body.data.videoLibrary || []);
      setChords(
        body.data.chords && Object.keys(body.data.chords).length ? body.data.chords : CHORD_LIBRARY,
      );
      setChordGroups(body.data.chordGroups || []);
      dataRef.current = {
        stages: body.data.stages?.length ? body.data.stages : INITIAL_STAGES,
        videoLibrary: body.data.videoLibrary || [],
        chords: body.data.chords && Object.keys(body.data.chords).length ? body.data.chords : CHORD_LIBRARY,
        chordGroups: body.data.chordGroups || [],
      };
      revisionRef.current = body.revision;
      hydratedRef.current = true;
      saveEnabledRef.current = true;
      writeCache(dataRef.current);
      /** 水合即视为「与后端一致」 → 接下来的防抖 effect 不会因为「刚水合」而多发一次 PUT */
      lastSavedRef.current = JSON.stringify(dataRef.current);
      setSync({
        status: 'ready',
        message:
          body.source === 'seed'
            ? `后端首次初始化，已写入内置课程种子（revision ${body.revision}）`
            : `已同步到后端（revision ${body.revision}）`,
        revision: body.revision,
        updatedAt: body.updatedAt,
      });
    } catch (err) {
      const local = readCache();
      if (local) {
        setStages(local.stages);
        setVideoLibrary(local.videoLibrary);
        setChords(local.chords);
        setChordGroups(local.chordGroups);
        dataRef.current = local;
      }
      hydratedRef.current = true;
      /** 后端不可用时不自动保存（否则会一次次刷失败），但仍允许编辑并写本地缓存 */
      saveEnabledRef.current = false;
      setSync({
        status: 'error',
        message: `读不到后端（${
          err instanceof Error ? err.message : String(err)
        }），当前用的是本机缓存；编辑仍会保存在本机。`,
        revision: null,
        updatedAt: null,
      });
    }
  }, [push]);

  /** 挂载时拉一次 */
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 任何 slice 变化 → 防抖保存（水合前 & 冲突后不动；与上次同步内容相同则跳过） */
  useEffect(() => {
    if (!hydratedRef.current || !saveEnabledRef.current) return;
    writeCache({ stages, videoLibrary, chords, chordGroups });
    /** 内容没变（典型场景：刚水合完）→ 不必刷一个有副作用的 revision */
    if (JSON.stringify(dataRef.current) === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void push(), SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stages, videoLibrary, chords, chordGroups, push]);

  /**
   * ⚠️ 关页面前尽量把改动推上去：防抖窗口内直接关标签页会丢掉最后几秒的编辑。
   * `keepalive` 让 fetch 在页面卸载后仍能完成（内容不大，够用）。
   *
   * ⚠️ 同样要比一次内容：原来**无条件**推，于是「打开一次后台 → 关掉」也会 revision +1
   * （实测 revision 16 → 17 → 18 全靠这个）。只有真改了才抢救。
   */
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!saveEnabledRef.current || !revisionRef.current) return;
      if (JSON.stringify(dataRef.current) === lastSavedRef.current) return;
      try {
        void fetch(`${API_BASE_URL}/api/curriculum?baseRevision=${revisionRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataRef.current),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return {
    stages,
    setStages,
    videoLibrary,
    setVideoLibrary,
    chords,
    setChords,
    chordGroups,
    setChordGroups,
    sync,
    save: push,
    reload,
  };
}

export default useCurriculumStore;
