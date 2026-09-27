/**
 * 课程大纲（后端唯一数据源）—— Web 版（guitarmate-frontend）侧的适配层
 * =====================================================================
 *
 * ## 背景
 *
 * 原来 Web 版的课程是**自己硬编码的一份假数据**（`data/mockData.ts` 的 `INITIAL_COURSES`：
 * 假课程、假进度 `completedSteps: 1/13`）。而 CMS「课程大纲」工作台里维护的是另外一棵真树，
 * 存在后端（`PUT/GET /api/curriculum`）。两边各说各话 —— 这就是「曲库」当初踩过的坑。
 *
 * 现在统一：这里把后端给 C 端准备的**投影**（`GET /api/curriculum/learn`）适配成
 * CourseTab 一直在用的 `Course` 形状，**CourseTab 本体不需要改数据模型**。
 *
 * ## 适配时被迫做的三处取舍（都是"后端没有这个字段"，不是漏做）
 *
 * | CourseTab 要的 | 后端有吗 | 怎么处理 |
 * |---|---|---|
 * | `coverImage`（课封图） | ✅ 有（`/api/curriculum/assets/cover` 上传得到） | 后端给绝对 URL，CourseTab 直接渲染；没有则回退 `coverColor` 渐变块 |
 * | `description` | ❌ CMS 的 Course 只有 subtitle | 用 `subtitle` 兜底 |
 * | `completedSteps` / `step.completed` | ❌ 没有账号体系、没有学员进度表 | 恒为 0 / false（**不编假进度**） |
 * | `videoData.videoPoster` / `videoUrl` | ❌ 后端还没有视频转码产物 | 留空字符串（容器本身是黑底，看起来仍是视频位） |
 *
 * 其余字段（title/subtitle/targetLevel→level/chapters→steps 等）都是**真数据**，
 * 包括黄金 20 分钟的 `timeAllocation`、课时类型、关联曲目、视频讲师与打点。
 */
import type { Chapter, Course, LessonStep, LessonType } from '../types';
import { API_BASE_URL, ApiError } from './api';

/* ------------------------------------------------------------------ *
 * 与后端 `CurriculumService.getLearnView()` 一一对应的类型
 * ------------------------------------------------------------------ */
export interface CurriculumLearnLesson {
  id: string;
  title: string;
  /** tuning | video | chord_quiz | pair_drill | song_sync */
  type: string;
  timeAllocation: {
    tuningMin?: number;
    videoMin?: number;
    quizMin?: number;
    drillMin?: number;
    songMin?: number;
  } | null;
  video: {
    title: string;
    instructor: string;
    durationSec: number;
    resolution: string;
    keyPoints: Array<{ timeSec: number; title: string }>;
  } | null;
  chordGroupIds: string[];
  song: { songName?: string; difficulty?: string; originalArtist?: string } | null;
}

export interface CurriculumLearnChapter {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: CurriculumLearnLesson[];
}

export interface CurriculumLearnCourse {
  id: string;
  title: string;
  subtitle: string;
  /** ⚠️ 这是 **Tailwind 渐变 token**（如 `from-amber-600 to-orange-700`），不是颜色值 */
  coverColor: string;
  /** 课程封面图（后端投影里已是**绝对 URL**）；CMS 没上传时缺省/为空 */
  coverImage?: string | null;
  targetLevel: string;
  chapters: CurriculumLearnChapter[];
}

export interface CurriculumLearnStage {
  id: string;
  stageCode: string;
  name: string;
  focus: string;
  order: number;
  courses: CurriculumLearnCourse[];
}

export interface CurriculumLearnDoc {
  revision: number;
  updatedAt: string;
  stages: CurriculumLearnStage[];
}

/* ------------------------------------------------------------------ *
 * 映射
 * ------------------------------------------------------------------ */

/**
 * CMS 的课时类型 → 前端 `LessonType`。
 *
 * CMS 的 5 个类型就是「黄金 20 分钟」五步闭环，而前端只有 4 种（video/trainer/tuner/practice）：
 * 两种"练"（和弦微测 / 转换冲刺）都归到 `trainer`，曲目跟弹归 `practice`。
 */
const LESSON_TYPE_MAP: Record<string, { type: LessonType; label: LessonStep['typeLabel'] }> = {
  tuning: { type: 'tuner', label: 'TUNER' },
  video: { type: 'video', label: 'VIDEO' },
  chord_quiz: { type: 'trainer', label: 'TRAINER' },
  pair_drill: { type: 'trainer', label: 'TRAINER' },
  song_sync: { type: 'practice', label: 'PRACTICE' },
};

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toLesson(l: CurriculumLearnLesson): LessonStep {
  const t = l.timeAllocation || {};
  const durationMin =
    (t.tuningMin || 0) +
    (t.videoMin || 0) +
    (t.quizMin || 0) +
    (t.drillMin || 0) +
    (t.songMin || 0);
  const mapped = LESSON_TYPE_MAP[l.type] || { type: 'practice' as LessonType, label: 'PRACTICE' as const };

  return {
    id: l.id,
    title: l.title,
    type: mapped.type,
    typeLabel: mapped.label,
    /** CMS 没配时间配比时就是 0（不编一个"20 min"出来） */
    durationMin,
    /** 没有学员进度数据 → 恒为未完成（CourseTab 的进度条会显示 0%） */
    completed: false,
    timeAllocation: t as LessonStep['timeAllocation'],
    videoData: l.video
      ? {
          teacherName: l.video.instructor,
          teacherTitle: l.video.resolution,
          description: l.video.title,
          /** 打点：把时间戳并进文案（前端的 keyPoints 是 string[]） */
          keyPoints: l.video.keyPoints.map((k) =>
            k.timeSec > 0 ? `${fmtSec(k.timeSec)} ${k.title}` : k.title,
          ),
          /** 后端还没有转码产物 → 没有海报/播放地址 */
          videoPoster: '',
        }
      : undefined,
    songBinding: l.song?.songName
      ? { songId: '', title: l.song.songName, artist: l.song.originalArtist || '' }
      : undefined,
  };
}

function toChapter(ch: CurriculumLearnChapter, index: number): Chapter {
  return {
    id: ch.id,
    /** CMS 的章节标题里常自带「第1章：」，这里仍然给一个规范序号（CourseTab 只用它显示"第 N 章"） */
    chapterNumber: ch.order || index + 1,
    title: ch.title.replace(/^第\s*\d+\s*章[：:]\s*/, ''),
    learningGoal: ch.description || undefined,
    steps: (ch.lessons || []).map(toLesson),
  };
}

function toCourse(projection: CurriculumLearnCourse, stageId?: string): Course {
  const chapters = (projection.chapters || []).map(toChapter);
  return {
    id: projection.id,
    title: projection.title,
    subtitle: projection.subtitle || '',
    /** 后端 Course 没有独立 description → 用 subtitle 兜底（比编一句假的好） */
    description: projection.subtitle || '',
    /** 有课封图就用图（后端给的是绝对 URL）；没有则空串，CourseTab 回退渲染 `coverColor` 渐变块 */
    coverImage: projection.coverImage || '',
    coverColor: projection.coverColor || '',
    level: projection.targetLevel || '未标注',
    stageId,
    totalSteps: chapters.reduce((n, ch) => n + ch.steps.length, 0),
    completedSteps: 0,
    chapters,
  };
}

/** 后端投影 → CourseTab 的 `Course[]`（阶段信息作为 stageId 带走，列表里按阶段分组可选） */
export function toFrontendCourses(stages: CurriculumLearnStage[]): Course[] {
  return (stages || []).flatMap((stage) =>
    (stage.courses || []).map((c) => toCourse(c, stage.id)),
  );
}

/** 拉取课程大纲投影并按阶段顺序拍平成 `Course[]` */
export async function fetchCurriculumCourses(): Promise<{
  courses: Course[];
  stages: CurriculumLearnStage[];
  revision: number;
}> {
  const res = await fetch(`${API_BASE_URL}/api/curriculum/learn`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new ApiError(`读取课程大纲失败 (${res.status} ${res.statusText})`, res.status);
  }
  const doc = (await res.json()) as CurriculumLearnDoc;
  const stages = (doc.stages || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  return { courses: toFrontendCourses(stages), stages, revision: doc.revision };
}
