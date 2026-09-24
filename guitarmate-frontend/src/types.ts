/**
 * Type definitions for GuitarMate (吉他伴奏与培训小程序)
 */

export type TabKey = 'songs' | 'learn' | 'tune' | 'tools' | 'profile';

export interface ChordDefinition {
  name: string;
  frets: (number | 'x')[]; // 6 strings from low E (string 6) to high E (string 1), 0=open, 'x'=muted
  fingers: (number | null)[]; // 1=index, 2=middle, 3=ring, 4=pinky, null=none
  baseFret?: number; // Starting fret if higher up neck
  barres?: { fromString: number; toString: number; fret: number }[];
  difficulty?: 'easy' | 'medium' | 'hard';
  notes?: string[];
}

export interface TabNote {
  string: number; // 1 to 6 (1 is high E, 6 is low E)
  fret: number | string; // fret number, e.g. 0, 2, 7, '2^', '12~'
  timePct: number; // percentage along the line (0 to 100)
  durationPct?: number; // duration width
  chord?: string; // chord symbol annotated above this beat, e.g. 'Bm'
  technique?: 'bend' | 'slide' | 'hammer' | 'pull' | 'vibrato';
  annotation?: string; // e.g. '(2)', '^', 'h', 'p', 'sl.'
  triplet?: boolean; // if part of triplet group |—3—|
}

export interface TabData {
  isSolo?: boolean; // True if this section is a solo lead segment
  measureCount?: number; // number of measures (default 2)
  notes: TabNote[];
}

export interface LyricLine {
  id: string;
  timeSec: number;
  section?: string; // e.g. 'INTRO 1', 'VERSE 1', 'CHORUS 1', 'SOLO'
  lyrics: string;
  isSolo?: boolean;
  chords: { chord: string; charIndex?: number; timeSec?: number }[];
  tabData?: TabData;
}

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  rating: number;
  ratingCount: string;
  tags: ('CRD' | 'TAB' | 'Book')[];
  isFavorite: boolean;
  capo: string;
  chords: string[];
  bpm: number;
  durationSec: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  audioUrl?: string; // Uploaded master/backing audio file URL (MP3/WAV/AAC)
  audioWaveform?: number[]; // Audio peak array for waveform rendering
  audioSourceType?: 'uploaded_audio' | 'web_synth'; // Audio playback engine
  lyrics: LyricLine[];
}

export interface AudioTabSyncConfig {
  audioId: string;
  audioFileName: string;
  audioDurationSec: number;
  waveformPeaks: number[];
  measureTimestamps: {
    measureIndex: number;
    startSec: number;
    endSec: number;
    chord?: string;
  }[];
  noteTimestamps?: {
    lineIndex: number;
    noteIndex: number;
    timeSec: number;
    fret: number | string;
    string: number;
  }[];
  playbackOffsetMs: number; // Latency compensation
}

export type LessonType = 'video' | 'trainer' | 'tuner' | 'practice';

export interface VideoKeyPoint {
  timeSec: number;
  label: string;
  chordHighlight?: string;
  tip?: string;
}

export interface ChordExerciseConfig {
  chords: string[];
  switchPairs?: [string, string][];
  startBpm: number;
  targetBpm: number;
  durationSec: number;
  passStreakCount?: number;
  accuracyToleranceCents?: number;
  instructionTips?: string[];
}

export interface LessonTimeAllocation {
  warmupMins: number;
  videoLectureMins: number;
  chordDrillMins: number;
  switchingMins: number;
  songJamMins: number;
  totalMins: number;
}

export interface PrerequisiteRule {
  requiredStepId?: string;
  minScore?: number;
  isUnlockedByDefault?: boolean;
}

export interface LessonStep {
  id: string;
  title: string;
  type: LessonType;
  typeLabel: 'VIDEO' | 'TRAINER' | 'TUNER' | 'PRACTICE';
  durationMin: number;
  completed: boolean;
  prerequisite?: PrerequisiteRule;
  timeAllocation?: LessonTimeAllocation;
  videoData?: {
    teacherName: string;
    teacherTitle: string;
    description: string;
    keyPoints: string[];
    videoPoster: string;
    videoUrl?: string;
    category?: 'posture' | 'rhythm' | 'chord' | 'theory' | 'song_breakdown';
    detailedKeyPoints?: VideoKeyPoint[];
  };
  trainerData?: {
    targetChords: string[];
    tempoBpm: number;
    description: string;
    exerciseConfig?: ChordExerciseConfig;
  };
  songBinding?: {
    songId: string;
    title: string;
    artist: string;
    sectionSnippet?: string;
    suggestedCapo?: string;
    tabMode?: 'CRD' | 'TAB';
  };
}

export interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  bannerImage?: string;
  songReference?: {
    title: string;
    artist: string;
  };
  learningGoal?: string;
  targetChords?: string[];
  steps: LessonStep[];
}

export interface CurriculumStage {
  id: string;
  levelNumber: number;
  name: string;
  targetDays: number;
  coreChords: string[];
  description: string;
  coursesCount: number;
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverImage: string;
  level: string;
  stageId?: string;
  totalSteps: number;
  completedSteps: number;
  recommendedDailyMins?: number;
  chapters: Chapter[];
}

export interface PaymentRecord {
  id: string;
  orderNumber: string;
  title: string;
  amount: number;
  date: string;
  status: 'SUCCESS' | 'PENDING' | 'REFUNDED';
  channel: '微信支付 (WeChat Pay)';
}

export interface UserProfile {
  name: string;
  avatar: string;
  memberStatus: 'VIP学员' | '免费学员';
  vipExpiryDate?: string;
  daysStreak: number;
  totalPracticeMins: number;
  masteredChordsCount: number;
  completedSongsCount: number;
  enrolledCourseId: string;
}

export interface GuitarStringDef {
  stringNumber: number; // 1 to 6
  noteName: string; // E, B, G, D, A, E
  octave: number;
  targetFreq: number; // Hz
}
