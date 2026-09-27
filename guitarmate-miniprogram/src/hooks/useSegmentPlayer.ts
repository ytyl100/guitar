import Taro from '@tarojs/taro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveUrl } from '../services/api';
import { trackDataOf, type Segment } from '../utils/practice';

/**
 * 小节播放时钟（小程序版）
 * =======================
 *
 * ## 为什么不用 Web 版那套「媒体片段 + 一个 Audio 元素」
 *
 * Web 版（`guitarmate-frontend/src/hooks/useAudioClock.ts`）靠 `#t=start,end` 媒体片段
 * 在小节窗口内循环。**小程序的 `InnerAudioContext` 不支持媒体片段**，
 * 但它也不需要 —— 服务端发布时已经把每个小节切成独立音频文件（`slice_*.mp3`），
 * 一个文件正好就是一个小节。于是「段内循环」= 依次播放本段的切片，到尾就回到第一片。
 *
 * ## 踩过的坑（Web 版血泪，这里同样成立）
 *
 * ⚠️ **必须复用同一个 InnerAudioContext，只改 `src`**。
 * 每次换小节 `new`/`destroy` 一个 context，在 iOS 上会导致只有第一次用户手势解锁过的
 * 那个实例能播放，后续 `play()` 静默失败 —— 表现就是「只有第一小节有声音」。
 * 这正是 Web 版踩过的坑，所以这里 `destroy()` 只出现在组件卸载时。
 *
 * ⚠️ `obeyMuteSwitch = false`：iOS 静音键下也要出声（练琴时手机常常是静音的），
 * 否则用户会以为播放坏了。
 *
 * ⚠️ 逻辑层**没有 `requestAnimationFrame`**（那是渲染层的），所以播放头用 100ms 定时器
 * 轮询 `currentTime`；`onTimeUpdate` 只有 ~250ms 一次，做播放头太顿。
 */

export interface UseSegmentPlayerOptions {
  /** 当前段落（1-3 个小节） */
  segment: Segment | null;
  trackIndex: number;
  /** true = 用原声轨（Original），false = 练习声道（Simplified） */
  useOriginal: boolean;
  /** 段内循环播放（用户点段落上的 ▶） */
  loop: boolean;
  /** 整段播完后回调（非循环时用于「顺序练习全部段落」推进到下一段） */
  onSegmentEnd?: () => void;
}

export interface SegmentPlayer {
  isPlaying: boolean;
  /** 当前播放到段内第几个小节（下标） */
  measureSlot: number;
  /** 该小节内已播放的秒数（画播放头用） */
  offsetSec: number;
  /** 正在播放的音频地址（排查用） */
  currentUrl: string;
  error: string | null;
  /** 从段内第 slot 个小节开始播 */
  play: (slot?: number) => void;
  pause: () => void;
  stop: () => void;
  toggle: (slot?: number) => void;
  /** 播放速率（0.75 / 1 / 1.25）—— 变速练习用 */
  rate: number;
  setRate: (r: number) => void;
}

export function useSegmentPlayer(options: UseSegmentPlayerOptions): SegmentPlayer {
  const { segment, trackIndex, useOriginal, loop } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [measureSlot, setMeasureSlot] = useState(0);
  const [offsetSec, setOffsetSec] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * 播放速率。同时存 state（给 UI 显示当前档位）与 ref（给事件回调用）——
   * 事件回调只挂一次，读 state 会拿到过期闭包。
   */
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    const ctx = ctxRef.current;
    if (ctx) {
      try {
        ctx.playbackRate = r;
      } catch {
        /* 平台不支持则忽略（不改速率，但不应崩） */
      }
    }
  }, []);

  const ctxRef = useRef<Taro.InnerAudioContext | null>(null);
  const slotRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 最新值镜像：事件回调只挂一次，避免闭包读到过期 props */
  const segmentRef = useRef(segment);
  const loopRef = useRef(loop);
  const useOriginalRef = useRef(useOriginal);
  const trackIndexRef = useRef(trackIndex);
  const onSegmentEndRef = useRef(options.onSegmentEnd);
  segmentRef.current = segment;
  loopRef.current = loop;
  useOriginalRef.current = useOriginal;
  trackIndexRef.current = trackIndex;
  onSegmentEndRef.current = options.onSegmentEnd;

  /** 取某小节的切片地址（原声轨可能与练习声道是同一个文件） */
  const urlOf = useCallback((slot: number): string => {
    const seg = segmentRef.current;
    const measure = seg?.measures[slot];
    if (!measure) return '';
    const td = trackDataOf(measure, trackIndexRef.current);
    const raw = useOriginalRef.current
      ? td?.originalAudioUrl || td?.audioUrl
      : td?.audioUrl || td?.originalAudioUrl;
    return resolveUrl(raw);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickRef.current = setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setOffsetSec(Number(ctx.currentTime) || 0);
    }, 100);
  }, [stopTick]);

  /** 播放段内第 slot 小节 */
  const playSlot = useCallback(
    (slot: number) => {
      const ctx = ctxRef.current;
      const url = urlOf(slot);
      if (!ctx || !url) {
        setError(url ? '播放器未就绪' : '该小节没有音频地址（服务端未切片？）');
        return;
      }
      slotRef.current = slot;
      setMeasureSlot(slot);
      setOffsetSec(0);
      setError(null);
      setCurrentUrl(url);
      ctx.stop();
      ctx.src = url;
      /** ⚠️ 换源后速率会被重置，必须重新设（否则变速只对第一小节生效） */
      try {
        ctx.playbackRate = rateRef.current;
      } catch {
        /* 忽略 */
      }
      /**
       * ⚠️ `play()` 的失败必须要接住：
       * - **小程序**：`InnerAudioContext` 是原生播放器，**不受浏览器自动播放策略限制**，
       *   所以「从详情页点 ▶ 进来自动开播」能正常工作；
       * - **H5（本地验证用）**：浏览器要求 `play()` 必须由用户手势触发，
       *   否则抛 `The play() request was interrupted by a call to pause()`。
       *   这是**平台差异，不是逻辑 bug** —— 但不接住会变成未档获异常。
       */
      try {
        const ret = ctx.play() as unknown;
        if (ret && typeof (ret as Promise<void>).catch === 'function') {
          (ret as Promise<void>).catch(() => {
            /* 忽略：自动播放被平台策略拒绝，用户点 ▶ 即可 */
          });
        }
      } catch {
        /* 忽略：同上 */
      }
      setIsPlaying(true);
      startTick();
    },
    [urlOf, startTick],
  );

  const pause = useCallback(() => {
    ctxRef.current?.pause();
    setIsPlaying(false);
    stopTick();
  }, [stopTick]);

  /**
   * 停止。⚠️ 同时把「段内第几小节」也拨回第 1 小节 ——
   * 底部 ↺ 重置的语义是「回到第 1 小节」（对齐 Web 版 resetToken），
   * 只停音频不归位的话，进度条会停在中间某个小节上。
   */
  const stop = useCallback(() => {
    ctxRef.current?.stop();
    setIsPlaying(false);
    stopTick();
    setOffsetSec(0);
    slotRef.current = 0;
    setMeasureSlot(0);
  }, [stopTick]);

  const play = useCallback(
    (slot?: number) => {
      const seg = segmentRef.current;
      if (!seg) return;
      playSlot(slot ?? Math.min(slotRef.current, seg.measures.length - 1));
    },
    [playSlot],
  );

  const toggle = useCallback(
    (slot?: number) => {
      if (isPlaying) pause();
      else play(slot);
    },
    [isPlaying, pause, play],
  );

  /** 创建 context 并挂事件（只做一次） */
  useEffect(() => {
    const ctx = Taro.createInnerAudioContext();
    try {
      /** 仅小程序端有该属性；H5 端赋值会打一条「不支持 API」警告，无功能影响 */
      ctx.obeyMuteSwitch = false;
    } catch {
      /* 忽略：平台不支持 */
    }
    ctxRef.current = ctx;

    ctx.onEnded(() => {
      const seg = segmentRef.current;
      if (!seg) return;
      const next = slotRef.current + 1;
      if (next < seg.measures.length) {
        // 段内还有下一个小节
        playSlot(next);
        return;
      }
      if (loopRef.current) {
        // 段内循环：回到本段第一小节
        playSlot(0);
        return;
      }
      // 非循环：一段播完就停（由页面决定是否推进到下一段）
      setIsPlaying(false);
      stopTick();
      setOffsetSec(0);
      onSegmentEndRef.current?.();
    });

    ctx.onError((err) => {
      /**
       * ⚠️ 这里**不要静默吞掉**：Web 版就是被 `catch {}` 掩盖了
       * `NotAllowedError`，导致「只有第一小节有声音」查了很久。
       * 小程序最常见的两种：域名未加入白名单（真机）、音频 404 / CORS。
       */
      setError(
        `音频播放失败（code=${(err as { errCode?: number })?.errCode ?? '?'}）：` +
          `${(err as { errMsg?: string })?.errMsg ?? ''}。` +
          `真机需 HTTPS 域名白名单；开发者工具请确认「不校验合法域名」已勾选。`,
      );
      setIsPlaying(false);
      stopTick();
    });

    return () => {
      stopTick();
      ctx.destroy();
      ctxRef.current = null;
    };
  }, [playSlot, stopTick]);

  /** 换段/换声道 → 复位到段首并停播（避免继续播放上一段的音频） */
  useEffect(() => {
    stop();
    slotRef.current = 0;
    setMeasureSlot(0);
  }, [segment?.from, useOriginal, stop]);

  return { isPlaying, measureSlot, offsetSec, currentUrl, error, play, pause, stop, toggle, rate, setRate };
}
