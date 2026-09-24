import { useEffect, useRef, useState } from 'react';
import type { MeasureTrackData } from '../practicePackage';
import { useAudioClock } from './useAudioClock';
import { useMetronomeClock } from './useMetronomeClock';
import type { PracticeClock } from './clockTypes';

export interface PracticeClockOptions {
  /** 当前小节的某个分轨数据（来自 PracticePackage.measures[].trackData[]） */
  trackData?: MeasureTrackData | null;
  /** true = Original 模式（优先播原声，未发布则回退练习声道） */
  useOriginal?: boolean;
  /** 小节时长（秒） */
  duration: number;
  /** 每小节拍数（拍号分子），用于拍线与节拍器 */
  beatsPerMeasure?: number;
  /** 兜底 BPM（trackData.metronome 缺失时使用） */
  bpm?: number;
  loop?: boolean;
  autoPlay?: boolean;
  rate?: number;
  onEnded?: () => void;
}

export interface PracticeClockResult extends PracticeClock {
  /** 音频是否加载失败并已回退到节拍器 */
  audioFailed: boolean;
  /** 回退原因（用于 UI 提示） */
  fallbackReason: string | null;
  /** 当前小节实际使用的音频地址（Original 模式可能回退） */
  resolvedAudioUrl: string | null;
}

/**
 * 静态空闲时钟 —— 给「非当前小节」的列表项使用。
 *
 * 为什么不给每一行都 `usePracticeClock`：
 * 那会为每个小节创建一个 `HTMLAudioElement`（几十个小节＝几十个音频请求 + 解码器）。
 * 列表里只有当前小节真的在播，其余只需一个恒定状态的占位时钟。
 * 对象是**不可变**的：`isPlaying=false`、`currentTime` 固定，
 * 配合 `React.memo` 可以让这些行在播放时完全不重渲染。
 */
export function createIdleClock(duration: number, beatsPerMeasure = 4): PracticeClock {
  return {
    currentTime: 0,
    duration: duration > 0 ? duration : 0,
    isPlaying: false,
    status: 'idle',
    error: null,
    source: 'silent',
    beatIndex: 0,
    loop: false,
    play: () => {},
    pause: () => {},
    toggle: () => {},
    seek: () => {},
    setRate: () => {},
  };
}

/**
 * 练习时钟选择器 —— 上层只需要这一个 Hook
 * ======================================
 *
 * 决策链（与后端 PracticePackage 的字段严格对应）：
 *
 * ```
 * trackData.audioUrl 存在？
 *   ├─ 是 → 用音频时钟（Original 模式优先 originalAudioUrl，为空回退 audioUrl）
 *   │         └─ 加载/播放失败 → 自动切到节拍器时钟（并回报 fallbackReason）
 *   └─ 否 → trackData.metronome.enabled 为真 → 用节拍器时钟（纯 tab 练习）
 *            └─ 都没有 → 静默时钟（仍能推进竖条与节点高亮）
 * ```
 *
 * 这样「有音频 / 没音频 / 音频坏掉」三种情况下，渲染层代码完全相同。
 */
export function usePracticeClock(options: PracticeClockOptions): PracticeClockResult {
  const {
    trackData,
    useOriginal = false,
    duration,
    beatsPerMeasure = 4,
    bpm = 80,
    loop = true,
    autoPlay = false,
    rate = 1,
    onEnded,
  } = options;

  // Original 模式优先原声切片；未发布原声时回退到练习声道（保证不静音）
  const audioUrl = useOriginal
    ? trackData?.originalAudioUrl || trackData?.audioUrl || null
    : trackData?.audioUrl || null;

  const [audioFailed, setAudioFailed] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // 切换小节 / 音源时重置失败状态
  useEffect(() => {
    setAudioFailed(false);
    setFallbackReason(null);
  }, [audioUrl, duration]);

  const wantAudio = !!audioUrl && !audioFailed;

  const audioClock = useAudioClock({
    audioUrl: wantAudio ? audioUrl : null,
    duration,
    beatsPerMeasure,
    loop,
    autoPlay,
    rate,
    onEnded: wantAudio ? onEnded : undefined,
    onError: (message) => {
      setAudioFailed(true);
      setFallbackReason(message);
    },
  });

  const metronomeConfig = trackData?.metronome;
  const metronomeClock = useMetronomeClock({
    bpm: metronomeConfig?.bpm || bpm,
    beatsPerMeasure: metronomeConfig?.beatsPerMeasure || beatsPerMeasure,
    duration,
    accentFirstBeat: metronomeConfig?.accentFirstBeat ?? true,
    loop,
    autoPlay: autoPlay && !wantAudio,
    rate,
    // 有音频时保持惰性（不创建 AudioContext、不出声）
    enabled: !wantAudio,
    onEnded: wantAudio ? undefined : onEnded,
  });

  // 音频在播放中挂掉 → 节拍器接力，练习不中断
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wantAudio) wasPlayingRef.current = audioClock.isPlaying;
  }, [audioClock.isPlaying, wantAudio]);
  useEffect(() => {
    if (!wantAudio && audioFailed && wasPlayingRef.current) {
      metronomeClock.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantAudio, audioFailed]);

  const clock: PracticeClock = wantAudio ? audioClock : metronomeClock;

  return {
    ...clock,
    audioFailed,
    fallbackReason,
    resolvedAudioUrl: wantAudio ? audioUrl : null,
  };
}
