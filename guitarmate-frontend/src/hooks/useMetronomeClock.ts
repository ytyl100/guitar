import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClockStatus, MetronomeClockOptions, PracticeClock } from './clockTypes';

/**
 * 节拍器时钟 —— 纯 tab 导入（没有音频）时的时间源
 * =============================================
 *
 * 为什么必须有它：
 * 从 ASCII tab / MusicXML / 和弦表导入的谱面**没有音频**。
 * 如果此时 `audioUrl` 为空就让按钮失效，教研老师就无法验证谱面；
 * 有了节拍器时钟，C 端可以「无声练习」：谱面正常渲染、节点按时高亮、竖条按时推进。
 *
 * 实现要点：
 * - 用 Web Audio 合成「嗒」声（底拍重音 1600Hz / 弱拍 1000Hz + 指数衰减），
 *   **不依赖任何音频资源**；
 * - 用「前瞻调度」避免 setTimeout 抖动：每 25ms 检查一次，把未来 120ms 内的拍子
 *   提前 `schedule` 到 AudioContext 时间轴上，音质与节奏都稳定；
 * - 时钟本身用 `AudioContext.currentTime` 推导（与调度同源，保证听到的和看到的完全一致）；
 * - 没有 Web Audio（旧机型/小程序真机）时退化为 rAF 静默时钟，`source='silent'`。
 */
export function useMetronomeClock(options: MetronomeClockOptions): PracticeClock {
  const {
    bpm,
    beatsPerMeasure,
    duration,
    accentFirstBeat = true,
    loop = true,
    autoPlay = false,
    rate = 1,
    enabled = true,
    muted = false,
    onEnded,
  } = options;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<ClockStatus>(enabled ? 'ready' : 'idle');
  const [loopState, setLoopState] = useState(loop);
  const [rateState, setRateState] = useState(rate);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextBeatRef = useRef(0); // 下一个待调度的拍序号（小节内从 0 开始，可跨小节累加）
  const startedAtRef = useRef(0); // AudioContext.currentTime 基准
  const pausedAtRef = useRef(0); // 暂停时保留的小节内相对秒数
  const isPlayingRef = useRef(false);
  const loopStateRef = useRef(loop);
  const onEndedRef = useRef(onEnded);

  onEndedRef.current = onEnded;

  useEffect(() => setLoopState(loop), [loop]);
  useEffect(() => {
    loopStateRef.current = loopState;
  }, [loopState]);
  useEffect(() => setRateState(rate), [rate]);
  useEffect(() => {
    setStatus(enabled ? 'ready' : 'idle');
  }, [enabled]);

  const beats = beatsPerMeasure > 0 ? beatsPerMeasure : 4;
  const safeBpm = bpm > 0 ? bpm : 80;
  /** 每拍秒数（受变速影响） */
  const beatSec = useMemo(() => (60 / safeBpm) / (rateState > 0 ? rateState : 1), [safeBpm, rateState]);
  const windowDuration = duration > 0 ? duration : beats * beatSec;

  /** 懒创建 AudioContext（必须在用户手势里首次调用，否则浏览器策略会挂起） */
  const ensureContext = useCallback((): AudioContext | null => {
    if (muted) return null;
    if (ctxRef.current) return ctxRef.current;
    const Ctor =
      (globalThis as any).AudioContext ||
      (globalThis as any).webkitAudioContext ||
      (globalThis as any).wx?.createWebAudioContext;
    if (!Ctor) return null;
    try {
      const ctx: AudioContext = typeof Ctor === 'function' ? new Ctor() : Ctor;
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      return ctx;
    } catch {
      return null;
    }
  }, [muted]);

  /** 合成一声「嗒」 */
  const scheduleClick = useCallback((atCtxTime: number, accent: boolean) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1000;
    const peak = accent ? 0.5 : 0.26;
    gain.gain.setValueAtTime(0.0001, atCtxTime);
    gain.gain.exponentialRampToValueAtTime(peak, atCtxTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, atCtxTime + 0.05);
    osc.connect(gain);
    gain.connect(master);
    osc.start(atCtxTime);
    osc.stop(atCtxTime + 0.06);
  }, []);

  const stopTimers = useCallback(() => {
    if (rafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
      else clearTimeout(rafRef.current);
      rafRef.current = null;
    }
    if (schedulerRef.current !== null) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  /** 当前小节内相对秒数 */
  const readClock = useCallback((): number => {
    const ctx = ctxRef.current;
    if (!ctx) {
      // 无 Web Audio：用 Date.now 基准的静默时钟
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      return pausedAtRef.current + elapsed;
    }
    return pausedAtRef.current + (ctx.currentTime - startedAtRef.current);
  }, []);

  const startTimers = useCallback(() => {
    stopTimers();

    const ctx = ctxRef.current;
    if (ctx) {
      // 从当前时间点对齐到「下一个整拍」，避免暂停后点拍错位
      const nowRel = readClock();
      nextBeatRef.current = Math.ceil(nowRel / beatSec - 1e-6);
      if (nextBeatRef.current < 0) nextBeatRef.current = 0;

      // 前瞻调度：每 25ms 把未来 120ms 内的拍子排进 AudioContext 时间轴
      schedulerRef.current = window.setInterval(() => {
        if (!isPlayingRef.current || !ctxRef.current) return;
        const lookahead = 0.12;
        const nowCtx = ctxRef.current.currentTime;
        for (let guard = 0; guard < 64; guard++) {
          const rel = nextBeatRef.current * beatSec;
          if (rel >= windowDuration) {
            if (!loopStateRef.current) break;
            // 循环：把拍序号折算回小节内
            nextBeatRef.current = 0;
            startedAtRef.current = nowCtx - 0;
            pausedAtRef.current = 0;
            continue;
          }
          const atCtx =
            startedAtRef.current + rel - pausedAtRef.current;
          if (atCtx > nowCtx + lookahead) break;
          const beatInBar = ((nextBeatRef.current % beats) + beats) % beats;
          scheduleClick(
            Math.max(nowCtx, atCtx),
            accentFirstBeat ? beatInBar === 0 : false,
          );
          nextBeatRef.current += 1;
        }
      }, 25);
    }

    const tick = () => {
      if (!isPlayingRef.current) {
        rafRef.current = null;
        return;
      }
      const rel = readClock();

      if (rel >= windowDuration) {
        if (loopStateRef.current) {
          // 重新开始一轮
          pausedAtRef.current = 0;
          startedAtRef.current = ctxRef.current ? ctxRef.current.currentTime : Date.now();
          nextBeatRef.current = 0;
          setCurrentTime(0);
        } else {
          setCurrentTime(windowDuration);
          setIsPlaying(false);
          isPlayingRef.current = false;
          stopTimers();
          onEndedRef.current?.();
          return;
        }
      } else {
        setCurrentTime(rel);
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
  }, [
    accentFirstBeat,
    beatSec,
    beats,
    loopState,
    readClock,
    scheduleClick,
    stopTimers,
    windowDuration,
  ]);

  // ── 控制接口 ─────────────────────────────────
  const play = useCallback(() => {
    if (!enabled) return;
    const ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    const base = ctx ? ctx.currentTime : Date.now();
    startedAtRef.current = base;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setStatus('ready');
    startTimers();
  }, [enabled, ensureContext, startTimers]);

  const pause = useCallback(() => {
    pausedAtRef.current = readClock();
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopTimers();
    // 停掉已经排进时间轴但还没响的拍子
    try {
      masterRef.current?.gain.setValueAtTime(0.0001, ctxRef.current?.currentTime ?? 0);
      masterRef.current?.gain.setValueAtTime(0.6, (ctxRef.current?.currentTime ?? 0) + 0.05);
    } catch {
      /* ignore */
    }
  }, [readClock, stopTimers]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.max(0, Math.min(windowDuration, seconds));
      pausedAtRef.current = target;
      if (ctxRef.current) startedAtRef.current = ctxRef.current.currentTime;
      else startedAtRef.current = Date.now();
      nextBeatRef.current = Math.ceil(target / beatSec - 1e-6);
      setCurrentTime(target);
      if (isPlayingRef.current) startTimers();
    },
    [beatSec, startTimers, windowDuration],
  );

  const setRateFn = useCallback(
    (next: number) => {
      // 变速时保留当前播放位置
      const rel = readClock();
      setRateState(next);
      pausedAtRef.current = rel;
      if (ctxRef.current) startedAtRef.current = ctxRef.current.currentTime;
      else startedAtRef.current = Date.now();
    },
    [readClock],
  );

  // ── 自动播放 ─────────────────────────────────
  useEffect(() => {
    if (autoPlay && enabled && !isPlayingRef.current) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, enabled]);

  // ── 卸载清理 ─────────────────────────────────
  useEffect(
    () => () => {
      isPlayingRef.current = false;
      stopTimers();
      try {
        ctxRef.current?.close();
      } catch {
        /* ignore */
      }
      ctxRef.current = null;
      masterRef.current = null;
    },
    [stopTimers],
  );

  return {
    currentTime,
    duration: windowDuration,
    isPlaying,
    status: !enabled ? 'idle' : status,
    error: null,
    source: ctxRef.current ? 'metronome' : muted || !enabled ? 'silent' : 'metronome',
    beatIndex: Math.min(beats - 1, beatSec > 0 ? Math.floor(currentTime / beatSec) : 0),
    loop: loopState,
    play,
    pause,
    toggle,
    seek,
    setRate: setRateFn,
  };
}
