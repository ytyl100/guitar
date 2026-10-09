export type CourseStatus = 'published' | 'draft' | 'archived';

export interface CourseVersionHistory {
  version: string;
  date: string;
  author: string;
  note: string;
}

export type ChapterItemType = 'video' | 'chord_drill' | 'transcription_score';

export interface VideoCuePoint {
  id: string;
  timeSeconds: number;
  timeFormatted: string; // e.g. "01:25"
  label: string;
  description?: string;
}

export interface TeachingVideo {
  id: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  durationFormatted: string;
  associatedCourseId?: string;
  associatedCourseTitle?: string;
  cuePoints: VideoCuePoint[];
  status?: 'published' | 'draft';
  videoSourceType?: 'link' | 'upload';
}

export interface ChordDrillCombination {
  id: string;
  title: string;
  chords: string[]; // e.g. ["C", "G", "Am", "F"]
  bpmStart: number;
  bpmTarget: number;
  steps: number[]; // e.g. [60, 80, 100, 120]
  description?: string;
  createdAt: string;
  status?: 'published' | 'draft';
}

export interface ChapterContentItem {
  id: string;
  title: string;
  type: ChapterItemType;
  description: string;
  orderIndex: number;
  
  // Details depending on type
  videoId?: string;
  videoUrl?: string;
  cuePoints?: VideoCuePoint[];
  
  chordDrillId?: string;
  chords?: string[];
  bpmTarget?: number;
  
  scoreId?: string;
  scoreTitle?: string;
  scoreArtist?: string;
  scoreCoverUrl?: string;
  scoreTempo?: number;
}

export type ChapterItem = ChapterContentItem;

export interface CourseChapter {
  id: string;
  title: string;
  category: string;
  description: string;
  totalDuration: string;
  orderIndex: number;
  items: ChapterContentItem[];
}

export interface CourseCurriculum {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverImage: string;
  level: string;
  totalLessons: number;
  totalHours: string;
  category: string;
  
  // Ownership & Permissions
  teacherId: string;
  teacherName: string;
  institutionId: string;
  institutionName: string;
  isSystemBasic?: boolean;
  isFree?: boolean;
  
  status: CourseStatus;
  version: string;
  versionHistory: CourseVersionHistory[];
  
  orderIndex: number;
  chapters: CourseChapter[];
}

export const CHORD_ROOT_NOTES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
] as const;

export const CHORD_QUALITIES = [
  'major', 'minor', '5', '7', 'maj7', 'm7', 'sus4', 'add9', 'sus2', '7sus4', '7#9', '9'
] as const;

export interface CourseReturnContext {
  courseId: string;
  courseTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  itemId?: string;
  itemTitle?: string;
  fromRole?: string;
  isCMS?: boolean;
}

