import type { Course, CourseChapter, CourseItem } from '../services/api';

/**
 * 课程大纲查找工具
 * ================
 *
 * 课程大纲是「课程 → 章节 → 内容项」三层树，而**所有入口都只有一个扁平的内容项 id**
 * （列表页点进去只带 `?itemId=`，因为把整包 JSON 塞进 query 会超长）。
 * 于是"按 id 反查课程/章节/内容项"这件事在多个页面都要做 —— 抽这里一份，
 * 避免课时视频页、和弦微测页各抄一遍然后慢慢漂移。
 */

export interface CourseItemHit {
  course: Course;
  chapter: CourseChapter;
  /** 内容项在所属章节 items 里的下标（用于显示"第 N 项"） */
  index: number;
  item: CourseItem;
}

/** 在整棵课纲里按内容项 id 反查「课程 / 章节 / 内容项」；找不到返回 null */
export function findCourseItem(courses: Course[], itemId: string): CourseItemHit | null {
  const wanted = (itemId || '').trim();
  if (!wanted) return null;
  for (const course of courses) {
    for (const chapter of course.chapters || []) {
      const index = (chapter.items || []).findIndex((i) => i.id === wanted);
      if (index !== -1) return { course, chapter, index, item: chapter.items[index] };
    }
  }
  return null;
}

/**
 * 找一个"配套曲谱"内容项：**先在本章找，本章没有就退到整门课的第一条**。
 *
 * 视频页的「看完了，开练」用它 —— 大多数课件是"一章一个视频 + 一个乐谱"，
 * 但也有整门课只在某一章挂谱子的情况，退到整门课比直接不给入口合理。
 */
export function findScoreItem(
  chapter: CourseChapter,
  course: Course,
): CourseItem | undefined {
  const local = (chapter.items || []).find((i) => i.type === 'transcription_score');
  if (local) return local;
  for (const ch of course.chapters || []) {
    const hit = (ch.items || []).find((i) => i.type === 'transcription_score');
    if (hit) return hit;
  }
  return undefined;
}

/** 某门课里按类型统计内容项数量 */
export function countItemsByType(course: Course, type: CourseItem['type']): number {
  return (course.chapters || []).reduce(
    (n, ch) => n + (ch.items || []).filter((i) => i.type === type).length,
    0,
  );
}
