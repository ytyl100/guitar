// src/shared/types.ts
export interface Note {
  id: string;
  string: number;       // 1-6 (1=最细弦，6=最粗弦)
  fret: number;         // 0-24 品位
  pitch: number;        // MIDI 音高
  relativeTime: number; // 相对当前小节起始秒数 (audioTime - startTime)
  duration: number;     // 持续时间 (秒)
  confidence: number;   // 识别置信度 (0-1)
  x: number;            // 归一化横坐标 (0-1)
  y: number;            // 归一化纵坐标 (0-1)
}

export interface Barre {
  id?: string;
  instrument?: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface ChordMarker {
  id?: string;
  instrument?: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

/** 小节 × 乐器轨 (SQLite 中 notes 以 JSON 字符串持久化) */
export interface MeasureTrack {
  id: string;
  measureId: string;
  trackId: string;
  audioUrl: string;
  tabImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  notes: Note[];
}

/** 练习小节 (含所有关联数据) */
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

/** 曲目 */
export interface Score {
  id: string;
  title: string;
  artist?: string | null;
  bpm?: number | null;
  timeSignature: string;
  originalAudio: string;
  coverUrl?: string | null;
  status: 'draft' | 'published' | string;
  createdAt?: string;
  updatedAt?: string;
}

/** 乐器分轨 */
export interface Track {
  id: string;
  scoreId: string;
  instrument: string;
  audioUrl: string;
  jsonUrl?: string | null;
  createdAt?: string;
}

/** SoloTrace 导出的转录 JSON 结构 */
export interface SoloTraceNote {
  id?: string;
  string: number;
  fret: number;
  pitch: number;
  audioTime: number;
  scoreTime?: number;
  duration: number;
  confidence?: number;
  x?: number;
  y?: number;
}

export interface SoloTraceJson {
  version?: string;
  bpm: number;
  timeSignature?: string;
  notes: SoloTraceNote[];
  beatMap?: {
    bpm: number;
    beats: Array<{ time: number; measure: number; beatInMeasure: number }>;
  };
}
