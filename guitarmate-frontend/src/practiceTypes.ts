/**
 * 六线谱小节练习相关类型定义
 * 与 guitarmate-audio-backend 的 /api/published/scores/:id/measures 响应结构对齐
 */

/** 单个音符节点 (归一化坐标 0-1，便于叠加到谱面图片/矢量谱上) */
export interface Note {
  id: string;
  /** 1-6 (1 = 最细高音 E 弦) */
  string: number;
  /** 品位 0-24 */
  fret: number;
  /** MIDI 音高 */
  pitch: number;
  /** 相对当前小节起始秒数 */
  relativeTime: number;
  /** 持续时间 (秒) */
  duration: number;
  /** 转录置信度 0-1 */
  confidence: number;
  /** 归一化横坐标 0-1 */
  x: number;
  /** 归一化纵坐标 0-1 */
  y: number;
}

/** 横按标记 */
export interface Barre {
  id: string;
  instrument?: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

/** 和弦标记 */
export interface ChordMarker {
  id: string;
  instrument?: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

/** 小节 × 乐器轨 */
export interface MeasureTrack {
  id: string;
  measureId: string;
  trackId: string;
  /** 练习声道切片音频 —— Simplified 模式播放 */
  audioUrl: string;
  /** 练习声道标识 (guitar | guitar_lead | guitar_rhythm | bass | piano | other) */
  channel?: string;
  /**
   * 原声（含鼓 / 贝斯 / 电琴等全轨混音）同区间音频 —— Original 模式播放。
   * 为空时前端回退到 `audioUrl`。
   */
  originalAudioUrl?: string | null;
  tabImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  notes: Note[];
}

/** 练习小节 */
export interface Measure {
  id: string;
  scoreId: string;
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  trackData: MeasureTrack[];
  barres: Barre[];
  chords: ChordMarker[];
}

/** 已发布曲目 (小程序曲库条目) */
export interface PublishedScore {
  id: string;
  title: string;
  artist?: string | null;
  coverUrl?: string | null;
  bpm?: number | null;
  timeSignature?: string;
  /** 原声（全轨混音）地址 */
  originalAudio?: string;
  _count?: { measures?: number; tracks?: number };
}
