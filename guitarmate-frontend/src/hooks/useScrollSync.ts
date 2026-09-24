import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPracticeAudioContext, type PracticeAudioContext } from '../utils/practiceAudio';

export interface ScrollSyncNote {
  id: string;
  /** 相对小节起始秒数 */
  relativeTime: number;
  duration: number;
  /** 归一化横坐标 0-1 */
  x: number;
  /** 归一化纵坐标 0-1 */
  y: number;
}

/** 音频加载状态 */
export type PracticeAudioStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseScrollSyncOptions {
  audioUrl: string;
  notes: ScrollSyncNote[];
  /** 播放竖条的固定位置占视口宽度的比例，默认 1/3 */
  viewportWidth: number;
  /** 谱面内容总宽度 (px)，通常为 measure.trackData[0].imageWidth */
  imageWidth: number;
  playheadRatio?: number;
  autoPlay?: boolean;
  /** 是否循环播放当前小节，默认 true */
  loop?: boolean;
  /**
   * 小节时长（秒）。
   * 仅当 audioUrl 带 `#t=start,end` 片段（后端切片降级返回）时用于限制播放区间,
   * 不传时按 `end - start` 自动推算。
   */
  measureDurationSec?: number;  /** 当前小节音频播放结束时回调（用于自动衔接到下一个小节） */
  onEnded?: () => void;}

export interface UseScrollSyncResult {
  activeNoteId: string | null;
  isPlaying: boolean;
  scrollX: number;
  /** 当前播放秒数（相对小节起始，节流更新，用于时间显示） */
  currentTime: number;
  /** 当前播放进度 0-100 */
  progressPercent: number;
  /** 音频加载状态 */
  status: PracticeAudioStatus;
  error: string | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setRate: (rate: number) => void;
  seek: (relativeTimeSec: number) => void;
  /** 重新加载音频并从头播放（错误后重试） */
  retry: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * 解析 `#t=start,end` 媒体片段语法。
 *
 * 后端在小节音频切片失败时会降级返回 `原始音频路径#t=<start>,<end>`,
 * 此时需要在前端自行把播放区间限制在小节窗口内。
 */
const parseMediaFragment = (
  url: string,
): { baseUrl: string; start: number; end: number | null } => {
  const hashIdx = url.indexOf('#t=');
  if (hashIdx === -1) return { baseUrl: url, start: 0, end: null };

  const baseUrl = url.slice(0, hashIdx);
  const spec = url.slice(hashIdx + 3);
  const [startRaw, endRaw] = spec.split(',').map((v) => parseFloat(v));
  return {
    baseUrl,
    start: Number.isFinite(startRaw) ? startRaw : 0,
    end: Number.isFinite(endRaw) ? (endRaw as number) : null,
  };
};

/**
 * 六线谱播放进度同步 Hook
 *
 * 关键设计（对应文档六、6.3）：
 * - 音频由 InnerAudioContext (小程序) / HTMLAudioElement (Web) 播放
 * - onTimeUpdate 每 ~250ms 才触发一次，精度不足 →
 *   使用 requestAnimationFrame 逐帧插值出连续的播放时钟 (60fps)
 * - 每帧计算 activeNoteId 与 scrollX，让当前音符停在视口 1/3 处（固定播放竖条位置）
 * - activeNoteId 用 useRef 保存，仅在变化时才 setState，避免逐帧重渲染
 * - onHide / visibilitychange 时暂停动画循环，避免后台空转
 * - 音频加载失败时暴露 status/error，play() 会自动重载重试，按钮不会“点了没反应”
 */
export function useScrollSync({
  audioUrl,
  notes,
  viewportWidth,
  imageWidth,
  playheadRatio = 1 / 3,
  autoPlay = false,
  loop: loopEnabled = true,
  measureDurationSec,
  onEnded,
}: UseScrollSyncOptions): UseScrollSyncResult {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<PracticeAudioStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<PracticeAudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  /** 由 onTimeUpdate 校准的基准时间（相对小节起始） */
  const baseTimeRef = useRef(0);
  /** 上一次插值时的 performance.now() */
  const frameTimeRef = useRef(0);
  const playingRef = useRef(false);
  const activeNoteRef = useRef<string | null>(null);
  const lastStateTimeRef = useRef(0);
  const layoutRef = useRef({ viewportWidth, imageWidth, playheadRatio });
  /** 非 null 表示当前 audioUrl 带 `#t=` 片段，需要手动限制播放区间 */
  const windowRef = useRef<{ start: number; end: number } | null>(null);
  /** 窗口相对时长（秒） */
  const windowDurationRef = useRef<number | null>(null);
  const statusRef = useRef<PracticeAudioStatus>('idle');
  /** 记录 src 是否已完成一次 seek 到窗口起点 */
  const windowSeekedRef = useRef(false);
  /** 播放结束回调（用 ref 保存，避免因回调变化重建音频上下文） */
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  layoutRef.current = { viewportWidth, imageWidth, playheadRatio };
  statusRef.current = status;

  /** 按 relativeTime 升序排列（用于连续插值） */
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.relativeTime - b.relativeTime),
    [notes],
  );
  const sortedNotesRef = useRef(sortedNotes);
  sortedNotesRef.current = sortedNotes;

  /**
   * 把播放时间连续插值为谱面横坐标 (0-1)。
   * 在相邻音符之间做线性插值，避免逐音符跳变造成的滚动顿挫。
   */
  const interpolateX = useCallback((t: number): number => {
    const list = sortedNotesRef.current;
    if (list.length === 0) return 0;
    if (list.length === 1) return list[0].x;

    if (t <= list[0].relativeTime) return list[0].x;
    const last = list[list.length - 1];
    if (t >= last.relativeTime) return last.x;

    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (t >= a.relativeTime && t < b.relativeTime) {
        const span = b.relativeTime - a.relativeTime;
        if (span <= 0) return b.x;
        const ratio = (t - a.relativeTime) / span;
        return a.x + (b.x - a.x) * ratio;
      }
    }
    return last.x;
  }, []);

  /** 动画循环 */
  const loop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(0, (now - frameTimeRef.current) / 1000);
    frameTimeRef.current = now;

    if (playingRef.current) {
      // 逐帧推进插值时钟（播放速率参与计算，保持变速后依旧同步）
      baseTimeRef.current += dt * (audio.playbackRate || 1);
    }

    // 窗口模式（#t=start,end 降级音频）：手动在小节区间内回绕
    const win = windowRef.current;
    if (win && playingRef.current) {
      const span = windowDurationRef.current ?? win.end - win.start;
      if (span > 0 && baseTimeRef.current >= span) {
        baseTimeRef.current = 0;
        audio.seek(win.start);
      }
    }

    const t = Math.max(0, baseTimeRef.current);
    const { viewportWidth: vw, imageWidth: iw, playheadRatio: pr } = layoutRef.current;

    // 1) 计算当前应高亮的音符（用插值时钟判断，精度高于 onTimeUpdate）
    const list = sortedNotesRef.current;
    let current: ScrollSyncNote | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (t >= n.relativeTime) {
        // 允许微小超出 duration 的容差，避免长音之间出现空档
        if (t <= n.relativeTime + Math.max(n.duration, 0.15)) {
          current = n;
        }
        break;
      }
    }

    if ((current?.id ?? null) !== activeNoteRef.current) {
      activeNoteRef.current = current?.id ?? null;
      setActiveNoteId(current?.id ?? null);
    }

    // 2) 计算横向滚动量：让当前播放位置对准视口 1/3 处
    const contentWidth = Math.max(iw, vw);
    const playheadX = interpolateX(t) * contentWidth;
    const maxScroll = Math.max(0, contentWidth - vw);
    const targetScroll = clamp(playheadX - vw * pr, 0, maxScroll);
    setScrollX(targetScroll);

    // 3) 时间/进度状态节流更新（~10fps），避免逐帧重渲染
    if (now - lastStateTimeRef.current > 100) {
      lastStateTimeRef.current = now;
      setCurrentTime(t);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [interpolateX]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    frameTimeRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── 初始化音频上下文并绑定事件 ─────────────────────────
  useEffect(() => {
    if (!audioUrl) {
      setStatus('idle');
      setError(null);
      return;
    }

    const { baseUrl, start, end } = parseMediaFragment(audioUrl);
    windowRef.current = end !== null ? { start, end } : null;
    windowDurationRef.current =
      end !== null ? end - start : measureDurationSec ?? null;
    windowSeekedRef.current = false;

    setError(null);
    setStatus('loading');

    const audio = createPracticeAudioContext();
    audioRef.current = audio;
    audio.src = baseUrl;
    audio.loop = windowRef.current ? false : loopEnabled;
    audio.playbackRate = 1;

    audio.onPlay(() => {
      playingRef.current = true;
      baseTimeRef.current = windowRef.current
        ? Math.max(0, (audio.currentTime || windowRef.current.start) - windowRef.current.start)
        : audio.currentTime || 0;
      frameTimeRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      setIsPlaying(true);
      startLoop();
    });

    audio.onPause(() => {
      playingRef.current = false;
      setIsPlaying(false);
      stopLoop();
    });

    audio.onEnded(() => {
      playingRef.current = false;
      setIsPlaying(false);
      stopLoop();
      // 自动衔接下一个小节
      onEndedRef.current?.();
    });

    // 每 ~250ms 用真实音频时间校准插值时钟，消除累积漂移
    audio.onTimeUpdate((absTime) => {
      baseTimeRef.current = windowRef.current
        ? Math.max(0, absTime - windowRef.current.start)
        : absTime;
      frameTimeRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
    });

    // 元数据就绪：把播放位置对齐到小节起点（降级音频时尤为重要）
    audio.onLoadedMetadata(() => {
      if (windowRef.current && !windowSeekedRef.current) {
        windowSeekedRef.current = true;
        audio.seek(windowRef.current.start);
        baseTimeRef.current = 0;
      }
    });

    audio.onCanPlay(() => setStatus('ready'));

    audio.onError(() => {
      setError('音频加载失败');
      setStatus('error');
      playingRef.current = false;
      setIsPlaying(false);
      stopLoop();
    });

    // 命中浏览器缓存时 canplay 可能早于监听器注册，这里补一次判断
    if (audio.readyState >= 2) setStatus('ready');

    if (autoPlay) audio.play();

    return () => {
      stopLoop();
      playingRef.current = false;
      audio.destroy();
      audioRef.current = null;
      activeNoteRef.current = null;
      setActiveNoteId(null);
      setScrollX(0);
      setCurrentTime(0);
      setIsPlaying(false);
    };
  }, [audioUrl, autoPlay, startLoop, stopLoop, measureDurationSec]);

  // ── 循环开关动态生效，避免重建音频上下文 ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // 窗口模式必须在 loop() 中手动回绕，因此关闭元素级 loop
    audio.loop = windowRef.current ? false : loopEnabled;
  }, [loopEnabled]);

  // ── 小程序 onHide / 页面不可见时暂停动画循环 ────────────
  useEffect(() => {
    const handleHide = () => {
      playingRef.current = false;
      stopLoop();
      setIsPlaying(false);
      try {
        audioRef.current?.pause();
      } catch {
        /* ignore */
      }
    };

    const taro = (globalThis as any).Taro;
    if (taro?.onHide) taro.onHide(handleHide);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handleHide();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (taro?.offHide) {
        try {
          taro.offHide(handleHide);
        } catch {
          /* ignore */
        }
      }
    };
  }, [stopLoop]);

  // ── 对外控制方法 ────────────────────────────────────────

  /** 强制重新加载音频（错误后重试） */
  const reload = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setStatus('loading');
    playingRef.current = false;
    stopLoop();
    baseTimeRef.current = 0;
    setCurrentTime(0);
    setScrollX(0);
    windowSeekedRef.current = false;
    audio.reload();
    if (windowRef.current) {
      audio.seek(windowRef.current.start);
    }
  }, [stopLoop]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 上一次加载失败时，先重新加载再播放，避免出现“点击无反应”
    if (statusRef.current === 'error') reload();
    audio.play();
  }, [reload]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) audioRef.current?.pause();
    else play();
  }, [play]);

  /** 错误后重试：重新加载并立即播放 */
  const retry = useCallback(() => {
    reload();
    audioRef.current?.play();
  }, [reload]);

  const setRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = clamp(rate, 0.25, 2);
  }, []);

  /** seek 传入「相对小节起点」的秒数，窗口模式下自动加上偏移 */
  const seek = useCallback((relativeTimeSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rel = Math.max(0, relativeTimeSec);
    const abs = rel + (windowRef.current?.start ?? 0);
    baseTimeRef.current = rel;
    frameTimeRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    setCurrentTime(rel);
    audio.seek(abs);
  }, []);

  const progressPercent = useMemo(() => {
    const list = sortedNotesRef.current;
    const noteSpan =
      list.length > 0
        ? Math.max(list[list.length - 1].relativeTime + (list[list.length - 1].duration || 0), 0.001)
        : 0;
    const total = windowDurationRef.current ?? noteSpan;
    if (total <= 0) return 0;
    return clamp((currentTime / total) * 100, 0, 100);
  }, [currentTime]);

  return {
    activeNoteId,
    isPlaying,
    scrollX,
    currentTime,
    progressPercent,
    status,
    error,
    play,
    pause,
    toggle,
    setRate,
    seek,
    retry,
  };
}

export default useScrollSync;
