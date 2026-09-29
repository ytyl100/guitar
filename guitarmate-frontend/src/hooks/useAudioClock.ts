import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseMediaFragment } from '../practicePackage';
import type { AudioClockOptions, ClockStatus, PracticeClock } from './clockTypes';

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
 * 4. 出错（404 / 占位地址 / 跨域 / 自动播放被拒）→ `status='error'` + `onError`，
 *    上层可回退到节拍器时钟，保证「永远不会点了没声音」。
 *
 * ⚠️⚠️ **音频实例只创建一次，切换小节只换 `src`（不销毁重建）**
 * 这是「永远只能响第一小节」的根因修复：
 * 早期实现每次 `fragment.baseUrl` 变化都 `new Audio()` 新建元素、销毁旧元素。
 * 桌面 Chrome 因为有「站点交互过就放行」的粘性激活策略，看不出问题；
 * 但 iOS Safari / 微信内核只对**用户手势那一次解锁过的那个元素**放行程序化播放，
 * 于是第二小节开始 `play()` 被 `NotAllowedError` 静默拒绝 → 只有第一小节有声音。
 * 复用同一元素即可彻底规避（顺带省掉解码器反复创建/销毁的开销，
 * 切换小节时的停顿也小得多）。
 *
 * Web 端用 `HTMLAudioElement`；真机小程序若存在 `wx.createInnerAudioContext`
 * 则自动走 InnerAudioContext（同样是**复用同一个 context**，只改 `ctx.src`）。
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
    () =>
      audioUrl
        ? parseMediaFragment(audioUrl)
        : { baseUrl: '', start: 0, end: null as number | null },
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
  const isPlayingRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);

  /** 最新值镜像：事件回调 / rAF 里必须读**当前**的片段与窗口，不能吃闭包里的旧值 */
  const fragmentRef = useRef(fragment);
  const windowRef = useRef(windowDuration);
  const loopStateRef = useRef(loopState);
  const rateRef = useRef(rateState);
  fragmentRef.current = fragment;
  windowRef.current = windowDuration;
  loopStateRef.current = loopState;
  rateRef.current = rateState;
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

  /** 统一失败处理：上报原因 → 上层可立即降级到节拍器 */
  const fail = useCallback(
    (message: string) => {
      setStatus('error');
      setError(message);
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopLoop();
      onErrorRef.current?.(message);
    },
    [stopLoop],
  );

  /** 逐帧同步当前时间 / 判定小节结束（依赖全部走 ref，因此本函数身份稳定） */
  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || !isPlayingRef.current) {
        rafRef.current = null;
        return;
      }
      const frag = fragmentRef.current;
      const win = windowRef.current;
      const elapsed = Math.max(0, Number(audio.currentTime || 0) - frag.start);
      const clamped = win > 0 ? Math.min(elapsed, win) : elapsed;
      setCurrentTime(clamped);

      // 播到片段/小节末尾
      if (win > 0 && elapsed >= win - 0.02) {
        if (loopStateRef.current) {
          try {
            audio.currentTime = frag.start;
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
          setCurrentTime(win);
          onEndedRef.current?.();
          rafRef.current = null;
          return;
        }
      }

      rafRef.current =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(tick)
          : (window.setTimeout(tick, 16) as unknown as number);
    };
    rafRef.current =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(tick)
        : (window.setTimeout(tick, 16) as unknown as number);
  }, [stopLoop]);

  /**
   * 懒创建媒体元素（**只创建一次**，之后一直复用）。
   * 事件监听在这里挂一次，回调里一律通过 ref 读取最新片段/窗口。
   */
  const ensureAudio = useCallback((): any => {
    if (audioRef.current) return audioRef.current;

    // ── 微信小程序真机：InnerAudioContext（它没有 currentTime，需要自己维护时间基准） ──
    const wxGlobal = (globalThis as any)?.wx;
    if (wxGlobal && typeof wxGlobal.createInnerAudioContext === 'function') {
      const ctx = wxGlobal.createInnerAudioContext();
      let wxPlaying = false;
      let wxStartedAt = 0; // Date.now() 基准
      let wxRelative = 0; // 暂停时保留的小节内相对秒数

      /** 把 InnerAudioContext 包装成与 HTMLAudioElement 相同的最小接口 */
      const wrapper = {
        __wx: true,
        __ctx: ctx,
        get currentTime() {
          const relative = wxPlaying ? wxRelative + (Date.now() - wxStartedAt) / 1000 : wxRelative;
          return fragmentRef.current.start + relative;
        },
        set currentTime(absolute: number) {
          wxRelative = Math.max(0, absolute - fragmentRef.current.start);
          wxStartedAt = Date.now();
          try {
            ctx.seek(Math.max(0, absolute));
          } catch {
            /* ignore */
          }
        },
        get playbackRate() {
          return ctx.playbackRate ?? rateRef.current;
        },
        set playbackRate(next: number) {
          try {
            ctx.playbackRate = next;
          } catch {
            /* 低版本基础库不支持，忽略 */
          }
        },
        play() {
          wxPlaying = true;
          wxStartedAt = Date.now();
          ctx.play();
          return Promise.resolve();
        },
        pause() {
          if (wxPlaying) wxRelative = wrapper.currentTime - fragmentRef.current.start;
          wxPlaying = false;
          try {
            ctx.pause();
          } catch {
            /* ignore */
          }
        },
      };

      ctx.onCanplay?.(() => setStatus('ready'));
      ctx.onPlay?.(() => {
        setStatus('ready');
        setIsPlaying(true);
        isPlayingRef.current = true;
        startLoop();
      });
      ctx.onError?.((e: any) => {
        const msg = `${e?.errMsg || '音频加载失败'}（${fragmentRef.current.baseUrl}）`;
        fail(msg);
      });
      // 循环 / 衔接交给 rAF 的窗口判定统一处理，这里只兜底 pause
      ctx.onEnded?.(() => {
        wrapper.pause();
      });

      audioRef.current = wrapper as any;
      return wrapper;
    }

    // ── 浏览器 / Web 模拟器 ──
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = false;

    audio.addEventListener('loadedmetadata', () => setStatus('ready'));
    audio.addEventListener('canplaythrough', () => setStatus('ready'));
    audio.addEventListener('error', () => {
      // code 1 = MEDIA_ERR_ABORTED：换源/暂停引起的正常中止，不该判定为「音频坏了」
      if (audio.error?.code === 1) return;
      fail(
        `音频加载失败（${fragmentRef.current.baseUrl}）—— 可能是地址不可达或已被清理。已自动切换节拍器模式。`,
      );
    });
    audio.addEventListener('ended', () => {
      const frag = fragmentRef.current;
      const win = windowRef.current;
      if (loopStateRef.current) {
        try {
          audio.currentTime = frag.start;
          void audio.play()?.catch(() => {
            /* ignore */
          });
        } catch {
          /* ignore */
        }
        return;
      }
      if (endedRef.current) return; // rAF 已经处理过本次结束
      endedRef.current = true;
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(win);
      onEndedRef.current?.();
    });

    audioRef.current = audio;
    return audio;
  }, [fail, startLoop]);

  /** 卸载时才销毁（URL 变化**不**销毁 —— 见文件头注释） */
  const destroyAudio = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    try {
      if (audio.__wx) {
        audio.__ctx?.stop?.();
        audio.__ctx?.destroy?.();
      } else {
        audio.pause?.();
        audio.removeAttribute?.('src');
        audio.src = '';
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(
    () => () => {
      stopLoop();
      destroyAudio();
    },
    [stopLoop, destroyAudio],
  );

  // ── 换源：复用同一个元素，只改 src（不重建） ─────────────
  useEffect(() => {
    if (!fragment.baseUrl) {
      stopLoop();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setStatus('idle');
      setCurrentTime(0);
      return;
    }

    const audio = ensureAudio();
    endedRef.current = false;
    stopLoop();
    setIsPlaying(false);
    isPlayingRef.current = false;
    setStatus('loading');
    setError(null);
    setCurrentTime(0);

    try {
      audio.playbackRate = rateRef.current;
      if (audio.__wx) {
        audio.__ctx.src = fragment.baseUrl;
        audio.__ctx.autoplay = false;
        audio.__ctx.loop = false;
      } else {
        audio.preload = 'auto';
        audio.src = fragment.baseUrl;
        audio.load?.();
      }
    } catch {
      /* ignore */
    }
  }, [fragment.baseUrl, ensureAudio, stopLoop]);

  // ── 自动播放 ─────────────────────────────────
  useEffect(() => {
    if (autoPlay && status === 'ready' && !isPlaying) {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        if (typeof audio.currentTime === 'number') audio.currentTime = fragmentRef.current.start;
      } catch {
        /* ignore */
      }
      void audio.play?.()?.catch(() => {
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
    const frag = fragmentRef.current;
    const win = windowRef.current;
    endedRef.current = false;
    try {
      // 已经播到末尾时再次 PLAY → 从头开始
      if (win > 0 && Number(audio.currentTime) >= frag.start + win - 0.05) {
        audio.currentTime = frag.start;
      }
    } catch {
      /* ignore */
    }
    const promise = audio.play?.();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((err: any) => {
        const name = String(err?.name || '');
        // 被紧随其后的 pause()/换源打断属于正常现象，不要误判成音频损坏
        if (name === 'AbortError') return;
        /**
         * ⚠️ 这条分支是「切到下一小节就没声音」的**可诊断化**关键：
         * iOS / 微信内核会在元素未被手势解锁时抛 NotAllowedError。
         * 明确上报原因（而不是静默无声），上层会立刻降级到节拍器并提示用户。
         */
        fail(
          `音频播放被拒绝（${name || '未知原因'}）：${err?.message || ''} —— 已切换节拍器模式`,
        );
      });
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
    startLoop();
  }, [fail, startLoop]);

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

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    const frag = fragmentRef.current;
    const win = windowRef.current;
    const target = Math.max(0, Math.min(win > 0 ? win : seconds, seconds));
    setCurrentTime(target);
    endedRef.current = false;
    if (audio) {
      try {
        audio.currentTime = frag.start + target;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const setRateFn = useCallback((next: number) => {
    setRateState(next);
    rateRef.current = next;
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
