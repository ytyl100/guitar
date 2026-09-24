/**
 * 练习时钟（PracticeClock）—— 小程序端唯一的「时间源」抽象
 * =========================================================
 *
 * 为什么需要它：
 * - 有音频时：用音频播放时钟驱动播放竖条与节点高亮
 * - 没音频时（纯 tab 导入）：用节拍器时钟驱动，**渲染逻辑完全不变**
 *
 * 两种实现返回同一个接口，上层（`PracticeMeasure` / 面板 / 进度条）
 * 不需要知道当前用的是哪种时间源。
 */

export type ClockStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 时间源类型：audio = 真实音频切片；metronome = 合成节拍器；silent = 无音频且无 Web Audio */
export type ClockSource = 'audio' | 'metronome' | 'silent';

export interface PracticeClock {
  /** 相对当前小节起始的播放秒数 */
  currentTime: number;
  /** 小节时长（受 `#t=` 媒体片段限制时取片段长度） */
  duration: number;
  isPlaying: boolean;
  status: ClockStatus;
  error: string | null;
  source: ClockSource;
  /** 当前小节内第几拍（0 起），驱动拍线/节拍器高亮 */
  beatIndex: number;
  loop: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 跳转到小节内某个秒数 */
  seek: (seconds: number) => void;
  /** 变速（0.5 - 1.5） */
  setRate: (rate: number) => void;
}

export interface AudioClockOptions {
  /** 音频地址；支持后端降级返回的 `url#t=start,end` 片段语法 */
  audioUrl: string | null;
  /** 小节时长（秒）——来自 PracticePackage */
  duration: number;
  /** 每小节拍数（用于拍线与节拍指示，默认 4） */
  beatsPerMeasure?: number;
  loop?: boolean;
  autoPlay?: boolean;
  rate?: number;
  /** 播到小节末尾且不循环时回调（面板据此衔接到下一小节） */
  onEnded?: () => void;
  /** 加载/播放失败回调（上层据此回退到节拍器） */
  onError?: (message: string) => void;
}

export interface MetronomeClockOptions {
  bpm: number;
  beatsPerMeasure: number;
  duration: number;
  accentFirstBeat?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  rate?: number;
  /** false 时完全惰性（不创建 AudioContext、不出声），用于「有音频」时让位 */
  enabled?: boolean;
  /** 静音练习：只走时钟不出声 */
  muted?: boolean;
  onEnded?: () => void;
}
