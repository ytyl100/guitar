import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseMediaFragment } from '../practicePackage';
import type { AudioClockOptions, ClockStatus, PracticeClock } from './clockTypes';

/** 取性能时钟（小程序/浏览器均可） */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * 音频时钟 —— 用真实音频切片驱动播放竖条
 * ======================================
 *
 * 关键实现点：
 * 1. `timeupdate` 事件约 250ms 才触发一次，精度不足以驱动 60FPS 竖条 →
 *    用 `requestAnimationFrame` 逐帧读取 `audio.currentTime` 插值出连续时钟。
 * 2. 支持后端降级返回的 `url#t=start,end` 媒体片段：把播放窗口限制在小节区间内，
 *    否则会从头播整首歌（这正是「点了没反应 / 播错位置」的常见根因）。
 * 3. 小节播完：`loop=true` 时回到片段起点继续；否则暂停并回调 `onEnded`。
 * 4. 出错（404 / 占位地址 / 跨域）→ `status='error'` + `onError`，
 *    上层可回退到节拍器时钟，保证「永远不会点了没声音」。
 *
 * Web 端用 `HTMLAudioElement`；真机小程序若存在 `wx.createInnerAudioContext`
 * 则自动走 InnerAudioContext（Web 模拟器下走前者）。
 */
export function useAudioClock(options: AudioClockOptions): PracticeClock {
  const {
    audioUrl,
    duration,
    beatsPerMeasure = 4,
    loop = true,
    autoPlay = false,
    rate = 1,
    onEnded,
    onError,
  } = options;

  const fragment = useMemo(
    () => (audioUrl ? parseMediaFragment(audioUrl) : { baseUrl: '', start: 0, end: null as number | null }),
    [audioUrl],
  );

  /** 播放窗口长度：优先取媒体片段长度，否则用小节时长 */
  const windowDuration = useMemo(() => {
    if (fragment.end !== null) {
      const len = fragment.end - fragment.start;
      if (Number.isFinite(len) && len > 0) return Math.min(len, duration > 0 ? duration : len);
    }
    return duration > 0 ? duration : 0;
  }, [fragment.end, fragment.start, duration]);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<ClockStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loopState, setLoopState] = useState(loop);
  const [rateState, setRateState] = useState(rate);

  const audioRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const isPlayingRef = useRef(false);

  onEndedRef.current = onEnded;
  onErrorRef.current = onError;

  useEffect(() => setLoopState(loop), [loop]);
  useEffect(() => setRateState(rate), [rate]);

  /** 停止 rAF 循环 */
  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** 逐帧同步当前时间 */
  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || !isPlayingRef.current) {
        rafRef.current = null;
        return;
      }
      const elapsed = Math.max(0, Number(audio.currentTime || 0) - fragment.start);
      const clamped = windowDuration > 0 ? Math.min(elapsed, windowDuration) : elapsed;
      setCurrentTime(clamped);

      // 播到片段/小节末尾
      if (windowDuration > 0 && elapsed >= windowDuration - 0.02) {
        if (loopStateRef.current) {
          try {
            audio.currentTime = fragment.start;
          } catch {
            /* ignore */
          }
        } else if (!endedRef.current) {
          endedRef.current = true;
          setIsPlaying(false);
          isPlayingRef.current = false;
          try {
            audio.pause();
          } catch {
            /* ignore */
          }
          setCurrentTime(windowDuration);
          onEndedRef.current?.();
          rafRef.current = null;
          return;
        }
      }

      if (typeof requestAnimationFrame === 'function') {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = window.setTimeout(tick, 16) as unknown as number;
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = window.setTimeout(tick, 16) as unknown as number;
    }
  }, [fragment.start, stopLoop, windowDuration]);

  /** loopState 用 ref 暴露给 rAF 回调，避免闭包过期 */
  const loopStateRef = useRef(loop);
  useEffect(() => {
    loopStateRef.current = loopState;
  }, [loopState]);

  // ── 创建音频实例 ─────────────────────────────
  useEffect(() => {
    if (!fragment.baseUrl) {
      audioRef.current = null;
      setStatus('idle');
      setCurrentTime(0);
      return;
    }

    setStatus('loading');
    setError(null);
    setCurrentTime(0);
    setIsPlaying(false);
    isPlayingRef.current = false;
    endedRef.current = false;

    // 微信小程序真机：优先 InnerAudioContext（它没有 currentTime，需要自己维护时间基准）
    const wxGlobal = (globalThis as any)?.wx;
    if (wxGlobal && typeof wxGlobal.createInnerAudioContext === 'function') {
      const ctx = wxGlobal.createInnerAudioContext();
      ctx.src = fragment.baseUrl;
      ctx.autoplay = false;
      ctx.loop = false;

      let wxPlaying = false;
      let wxStartedAt = 0; // Date.now() 基准
      let wxRelative = 0; // 暂停时保留的小节内相对秒数

      /** 把 InnerAudioContext 包装成与 HTMLAudioElement 相同的最小接口 */
      const wrapper = {
        __wx: true,
        get currentTime() {
          const relative = wxPlaying ? wxRelative + (Date.now() - wxStartedAt) / 1000 : wxRelative;
          return fragment.start + relative;
        },
        set currentTime(absolute: number) {
          wxRelative = Math.max(0, absolute - fragment.start);
          wxStartedAt = Date.now();
          try {
            ctx.seek(Math.max(0, absolute));
          } catch {
            /* ignore */
          }
        },
        playbackRate: rateState,
        play() {
          wxPlaying = true;
          wxStartedAt = Date.now();
          ctx.play();
          return Promise.resolve();
        },
        pause() {
          if (wxPlaying) wxRelative = wrapper.currentTime - fragment.start;
          wxPlaying = false;
          try {
            ctx.pause();
          } catch {
            /* ignore */
          }
        },
      };

      ctx.onCanplay?.(() => setStatus('ready'));
      ctx.onPlay?.(() => setStatus('ready'));
      ctx.onError?.((e: any) => {
        const msg = `${e?.errMsg || '音频加载失败'}（${fragment.baseUrl}）`;
        setStatus('error');
        setError(msg);
        setIsPlaying(false);
        isPlayingRef.current = false;
        stopLoop();
        onErrorRef.current?.(msg);
      });
      // 循环 / 衔接交给 rAF 的窗口判定统一处理，这里只兜底 pause
      ctx.onEnded?.(() => {
        wrapper.pause();
      });

      audioRef.current = wrapper as any;

      return () => {
        stopLoop();
        try {
          ctx.stop?.();
          ctx.destroy?.();
        } catch {
          /* ignore */
        }
        audioRef.current = null;
      };
    }

    // 浏览器 / Web 模拟器
    const audio = new Audio();
    audio.src = fragment.baseUrl;
    audio.preload = 'auto';
    audio.loop = false;
    audio.playbackRate = rateState;
    audioRef.current = audio;

    const handleReady = () => setStatus('ready');
    const handleError = () => {
      const msg = `音频加载失败（${fragment.baseUrl}）—— 可能是地址不可达或已被清理。已自动切换节拍器模式。`;
      setStatus('error');
      setError(msg);
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopLoop();
      onErrorRef.current?.(msg);
    };
    const handleEnded = () => {
      if (loopStateRef.current) {
        audio.currentTime = fragment.start;
        void audio.play().catch(handleError);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(windowDuration);
        onEndedRef.current?.();
      }
    };

    audio.addEventListener('loadedmetadata', handleReady);
    audio.addEventListener('canplaythrough', handleReady);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      stopLoop();
      audio.removeEventListener('loadedmetadata', handleReady);
      audio.removeEventListener('canplaythrough', handleReady);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
      try {
        audio.pause();
        audio.src = '';
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    };
    // fragment.baseUrl 变化才重建（start/end 变化不需要重建）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fragment.baseUrl]);

  // ── 自动播放 ─────────────────────────────────
  useEffect(() => {
    if (autoPlay && status === 'ready' && !isPlaying) {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        if (typeof audio.currentTime === 'number') audio.currentTime = fragment.start;
      } catch {
        /* ignore */
      }
      void audio.play?.().catch(() => {
        /* 自动播放被浏览器策略拦截时静默忽略，等待用户点 PLAY */
      });
      setIsPlaying(true);
      isPlayingRef.current = true;
      startLoop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, status]);

  // ── 控制接口 ─────────────────────────────────
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    endedRef.current = false;
    try {
      // 已经播到末尾时再次 PLAY → 从头开始
      if (windowDuration > 0 && Number(audio.currentTime) >= fragment.start + windowDuration - 0.05) {
        audio.currentTime = fragment.start;
      }
    } catch {
      /* ignore */
    }
    const promise = audio.play?.();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        /* 由 error 事件统一处理 */
      });
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
    startLoop();
  }, [fragment.start, startLoop, windowDuration]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    setIsPlaying(false);
    isPlayingRef.current = false;
    stopLoop();
    try {
      audio?.pause?.();
    } catch {
      /* ignore */
    }
  }, [stopLoop]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      const target = Math.max(0, Math.min(windowDuration > 0 ? windowDuration : seconds, seconds));
      setCurrentTime(target);
      endedRef.current = false;
      if (audio) {
        try {
          audio.currentTime = fragment.start + target;
        } catch {
          /* ignore */
        }
      }
    },
    [fragment.start, windowDuration],
  );

  const setRateFn = useCallback((next: number) => {
    setRateState(next);
    const audio = audioRef.current;
    try {
      if (audio) audio.playbackRate = next;
    } catch {
      /* ignore */
    }
  }, []);

  const beats = beatsPerMeasure > 0 ? beatsPerMeasure : 4;

  return {
    currentTime,
    duration: windowDuration,
    isPlaying,
    status,
    error,
    source: 'audio',
    beatIndex: Math.min(
      beats - 1,
      windowDuration > 0 ? Math.floor((currentTime / windowDuration) * beats) : 0,
    ),
    loop: loopState,
    play,
    pause,
    toggle,
    seek,
    setRate: setRateFn,
  };
}
