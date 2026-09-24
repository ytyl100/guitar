export interface TabNote {
  id: string;
  measureIndex: number;
  stringIndex: number; // 1 = 1st string (High E), 6 = 6th string (Low E)
  fret: number | string; // 0, 1, 2, 3... or 'X', 'h', 'p'
  timestampSec: number;
  durationSec: number;
  rhythmType?: '1/4' | '1/8' | '1/16' | '1/32' | '1/2' | '1/1';
  technique?: 'normal' | 'hammer-on' | 'pull-off' | 'slide' | 'vibrato' | 'bend' | 'palm-mute' | 'harmonic';
  velocity?: number; // 0 - 127
  chordName?: string;
  barreMarker?: string; // e.g. "B I" for barre on fret 1
  /** 转录置信度 0-1 (SoloTrace 导入时写入，<0.6 需人工复核) */
  confidence?: number;
  /** MIDI 音高 (SoloTrace 导入时写入) */
  pitch?: number;
}

/** 横按标注 (与后端 Barre 模型对齐，坐标为归一化 0-1) */
export interface BarreMarker {
  id: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number; // 相对小节或全曲起始的秒数
  duration: number;
  x: number; // 归一化 X (0-1)
  y: number; // 归一化 Y (0-1)
  instrument?: string;
}

/** 和弦标记 (与后端 ChordMarker 模型对齐) */
export interface ChordMarker {
  id: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number; // 归一化 X (0-1)
  y: number; // 归一化 Y (0-1)
  instrument?: string;
}

export interface AudioTabSyncConfig {
  audioId: string;
  audioTitle?: string;
  audioDurationSec: number;
  waveformPeaks: number[]; // 128 acoustic waveform peaks normalized (0.0 to 1.0)
  measureTimestamps: number[]; // e.g. [0.00, 2.40, 4.80, 7.20, ...]
  noteTimestamps: TabNote[];
  playbackOffsetMs: number; // Bluetooth headset latency adjustment: ±200ms
  bpm?: number;
  timeSignature?: [number, number]; // [4, 4]
  loopRegion?: {
    startSec: number;
    endSec: number;
    enabled: boolean;
  };
  // ── 后端 (guitarmate-audio-backend) 发布绑定信息 ──────────────
  /** 后端 Score ID，用于 POST /api/measures/publish */
  remoteScoreId?: string;
  /** 后端 Track ID，用于 POST /api/measures/publish */
  remoteTrackId?: string;
  /** 分轨原始音频的本地绝对路径或 URL（后端 ffmpeg 切片使用） */
  remoteAudioPath?: string;
  /**
   * 练习声道 —— C 端 Simplified 模式播放该声道。
   * guitar(默认) / guitar_lead / guitar_rhythm / bass / piano / other
   */
  remoteChannel?: string;
  /**
   * 原声（含鼓 / 贝斯 / 电琴等全轨混音）路径或 URL —— C 端 Original 模式播放。
   * 留空时后端自动回退到 Score.originalAudio。
   */
  remoteOriginalAudioPath?: string;
  /** 转录来源文件名 (SoloTrace / Basic Pitch 导出的 JSON) */
  transcriptionFileName?: string;
  /** 转录音符的低置信度数量 (<0.6)，需人工优先复核 */
  lowConfidenceCount?: number;
}

export interface VideoKeyPoint {
  id: string;
  timestampSec: number;
  title: string;
  description: string;
  category: 'hand_posture' | 'rhythm_tip' | 'chord_switch' | 'anti_buzz' | 'tone';
  linkedChordName?: string;
  thumbnailTimeSec?: number;
}

export interface ChordConfig {
  id: string;
  name: string; // e.g., "C", "Am", "F", "G", "Dm7", "Em"
  rootNote: string;
  bassString: number; // 4, 5, 6
  // String 6 (Low E) to String 1 (High E):
  // value: number for fret, 'x' for mute, 'o' for open
  frets: (number | 'x' | 'o')[];
  // finger for each string (1=Index, 2=Middle, 3=Ring, 4=Pinky, null)
  fingers: (number | null)[];
  barreFret?: number;
  pitfalls: string[]; // 避坑指南
  tips: string; // 防哑音要点
  audioFrequencies?: number[];
}

export interface ChordPairConfig {
  id: string;
  fromChord: string;
  toChord: string;
  startBpm: number;
  targetBpm: number;
  stepBpm: number; // e.g., +5 BPM
  passBars: number; // e.g., 4 or 8 bars consecutive
  toleranceCents: number; // e.g. 15 cents
}

export interface LessonStep {
  id: string;
  title: string;
  type: 'tuning' | 'video' | 'chord_quiz' | 'pair_drill' | 'song_sync';
  prerequisite: {
    linearUnlocked: boolean; // 严格线性顺序
    minAiScore: number; // AI 听音评分卡点 (60 ~ 100)
    minVideoWatchRate: number; // 视频完播率防刷 (80% ~ 100%)
  };
  timeAllocation: {
    tuningMin: number; // e.g. 3m
    videoMin: number; // e.g. 6m
    quizMin: number; // e.g. 4m
    drillMin: number; // e.g. 4m
    songMin: number; // e.g. 3m
  };
  videoData: {
    videoId: string;
    title: string;
    durationSec: number;
    instructor: string;
    resolution: '1080P' | '4K' | '720P';
    transcodeStatus: 'READY' | 'PROCESSING' | 'FAILED';
    keyPoints: VideoKeyPoint[];
  };
  trainerData: {
    chordPairs: ChordPairConfig[];
    toleranceCents: number; // ±15 cents
    initialBpm: number;
    targetBpm: number;
    noiseGateDb: number;
  };
  songBinding: {
    songId: string;
    songName: string;
    difficulty: '入门' | '进阶' | '挑战';
    tabSyncId: string;
    originalArtist?: string;
  };
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LessonStep[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  coverColor: string;
  targetLevel: string;
  chapters: Chapter[];
}

export interface Stage {
  id: string;
  stageCode: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  name: string;
  focus: string;
  courses: Course[];
}

export interface MusicVersion {
  versionNumber: string; // e.g. 'v1.0', 'v1.1'
  note: string; // e.g. '基础四分音符分解版'
  updatedAt: string;
  status: 'draft' | 'published' | 'archive';
  config: AudioTabSyncConfig;
}

export type MusicStatus = 'draft' | 'published' | 'archive';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: '民谣吉他' | '流行弹唱' | '指弹独奏' | '摇滚前奏' | '综合练习曲';
  difficulty: '入门' | '进阶' | '挑战';
  keySignature: string; // 'C大调', 'G大调', etc.
  status: MusicStatus;
  currentVersion: string;
  versions: MusicVersion[];
  tabConfig: AudioTabSyncConfig;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  cEndPlayCount?: number; // C端学员学习播放人次
}

export interface HardChordMetric {
  chordName: string;
  passRate: number; // percentage
  sampleCount: number;
  avgRetryTimes: number;
  avgStuckDays: number;
  topFailureReason: string;
  acousticIssueSpectrum: {
    buzzingRate: number;
    muteStringRate: number;
    slowTransitionRate: number;
    wrongPitchRate: number;
  };
}

export interface LessonDropoffFunnelStep {
  stepKey: keyof LessonStep['timeAllocation'];
  label: string;
  durationMin: number;
  completionRate: number; // percentage
  dropoffRate: number; // percentage
  avgUserScore: number;
}
