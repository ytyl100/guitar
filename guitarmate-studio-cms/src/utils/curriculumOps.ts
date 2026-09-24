/**
 * 课程体系纯函数操作集（curriculumOps）
 * =====================================
 *
 * Stage ➔ Course ➔ Chapter ➔ LessonStep 四级树的**全部增删改查**都在这里，
 * 组件只负责渲染与调用 —— 与 `standardTabLayout.ts` 一样的做法：
 * 逻辑可单测（`npm run verify:curriculum`），UI 改动不会碰到数据正确性。
 *
 * ### 为什么用「纯函数 + 返回新数组」而不是 class / immer
 *
 * - `stages` 是 React state（且要写 localStorage），不可变更新最省心；
 * - 每个函数都能写成「输入旧树 → 输出新树」，回归脚本里可以像断言算术一样断言树形。
 *
 * ### 定位方式
 *
 * 四级节点 id 全局唯一，所以统一用 `locateNode(stages, level, id)` 找到
 * 「它属于哪条 stage/course/chapter + 在兄弟数组里的下标」，四个层级共用一套更新逻辑。
 */

import type {
  Chapter,
  ChordDrillStage,
  Course,
  LessonStep,
  Stage,
  StageCode,
  TimeModule,
} from '../types';

export type CurriculumLevel = 'stage' | 'course' | 'chapter' | 'lesson';

export const CURRICULUM_LEVEL_LABEL: Record<CurriculumLevel, string> = {
  stage: '成长阶段 Stage',
  course: '专栏课程 Course',
  chapter: '章节 Chapter',
  lesson: '课时 Lesson',
};

export const CURRICULUM_LEVEL_ICON: Record<CurriculumLevel, string> = {
  stage: '🏁',
  course: '📘',
  chapter: '📑',
  lesson: '🎯',
};

/** 新增时子节点的默认命名 */
export const CHILD_TITLE_PREFIX: Record<CurriculumLevel, string> = {
  stage: '新成长阶段',
  course: '新专栏课程',
  chapter: '新章节',
  lesson: '新课时',
};

let seq = 0;
/** 生成稳定且可读的 id（时间戳 + 自增 + 随机，避免同一毫秒内重复） */
export function newId(prefix: string): string {
  seq = (seq + 1) % 1000;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// ─────────────────────────────────────────────
// 阶段编码
// ─────────────────────────────────────────────

export const STAGE_CODES: StageCode[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];

/** 取下一个未被占用的阶段编码；用满了就顺延 L10、L11… */
export function nextStageCode(stages: Stage[]): StageCode {
  const used = new Set(stages.map((s) => s.stageCode));
  const free = STAGE_CODES.find((code) => !used.has(code));
  return (free ?? (`L${stages.length + 1}` as StageCode)) as StageCode;
}

// ─────────────────────────────────────────────
// 工厂函数（新增节点用，给出合理的默认值）
// ─────────────────────────────────────────────

/** 黄金 20 分钟默认切片（3 + 6 + 4 + 4 + 3） */
export const GOLDEN_TIME_ALLOCATION: LessonStep['timeAllocation'] = {
  tuningMin: 3,
  videoMin: 6,
  quizMin: 4,
  drillMin: 4,
  songMin: 3,
};
export const GOLDEN_TOTAL_MINUTES = 20;

export function createStage(stages: Stage[], name?: string, focus?: string): Stage {
  const code = nextStageCode(stages);
  return {
    id: newId('stage'),
    stageCode: code,
    name: name || `${code} 新成长阶段`,
    focus: focus || '待填写：本阶段的技术里程碑与达成标准',
    order: stages.length + 1,
    courses: [],
  };
}

export function createCourse(title?: string, coverColor = 'from-indigo-600 to-violet-700'): Course {
  return {
    id: newId('course'),
    title: title || '新专栏课程',
    subtitle: '待填写：课程卖点 / 适用人群',
    coverColor,
    targetLevel: '待填写：适用水平',
    chapters: [],
  };
}

export function createChapter(order: number, title?: string): Chapter {
  return {
    id: newId('chap'),
    title: title || `第 ${order} 章：新章节`,
    description: '待填写：本章要解决的具体问题',
    order,
    lessons: [],
  };
}

export function createLesson(order: number, type: LessonStep['type'] = 'video'): LessonStep {
  return {
    id: newId('lesson'),
    title: `第 ${String(order).padStart(2, '0')} 课：新课时`,
    type,
    prerequisite: { linearUnlocked: true, minAiScore: 80, minVideoWatchRate: 95 },
    timeAllocation: { ...GOLDEN_TIME_ALLOCATION },
    videoData: {
      videoId: '',
      title: '待关联教学视频',
      durationSec: 0,
      instructor: '',
      resolution: '1080P',
      transcodeStatus: 'PROCESSING',
      keyPoints: [],
    },
    videoIds: [],
    chordGroupIds: [],
    trainerData: {
      chordPairs: [],
      toleranceCents: 15,
      initialBpm: 40,
      targetBpm: 80,
      noiseGateDb: -45,
      stages: [],
    },
    songBinding: {
      songId: '',
      songName: '待绑定曲目',
      difficulty: '入门',
      tabSyncId: '',
    },
  };
}

// ─────────────────────────────────────────────
// 定位与遍历
// ─────────────────────────────────────────────

export interface NodeLocation {
  stageId: string;
  courseId?: string;
  chapterId?: string;
  /** 仅 lesson 级有效：在 chapter.lessons 里的下标 */
  lessonIndex?: number;
}

export function locateNode(stages: Stage[], level: CurriculumLevel, id: string): NodeLocation | null {
  for (const stage of stages) {
    if (level === 'stage' && stage.id === id) return { stageId: stage.id };
    for (const course of stage.courses) {
      if (level === 'course' && course.id === id) return { stageId: stage.id, courseId: course.id };
      for (const chapter of course.chapters) {
        if (level === 'chapter' && chapter.id === id) {
          return { stageId: stage.id, courseId: course.id, chapterId: chapter.id };
        }
        if (level === 'lesson') {
          const index = chapter.lessons.findIndex((lesson) => lesson.id === id);
          if (index >= 0) {
            return { stageId: stage.id, courseId: course.id, chapterId: chapter.id, lessonIndex: index };
          }
        }
      }
    }
  }
  return null;
}

/** 该节点的**兄弟数组**（用于插入 / 删除 / 移动） */
export function siblingsOf(
  stages: Stage[],
  level: CurriculumLevel,
  id: string,
): { list: unknown[]; index: number } | null {
  const loc = locateNode(stages, level, id);
  if (!loc) return null;

  const stage = stages.find((s) => s.id === loc.stageId);
  const course = stage?.courses.find((c) => c.id === loc.courseId);
  const chapter = course?.chapters.find((ch) => ch.id === loc.chapterId);

  switch (level) {
    case 'stage': {
      const index = stages.findIndex((s) => s.id === id);
      return index >= 0 ? { list: stages, index } : null;
    }
    case 'course': {
      const list = stage?.courses ?? [];
      const index = list.findIndex((c) => c.id === id);
      return index >= 0 ? { list, index } : null;
    }
    case 'chapter': {
      const list = course?.chapters ?? [];
      const index = list.findIndex((ch) => ch.id === id);
      return index >= 0 ? { list, index } : null;
    }
    default: {
      const list = chapter?.lessons ?? [];
      const index = list.findIndex((l) => l.id === id);
      return index >= 0 ? { list, index } : null;
    }
  }
}

/** 统计某节点下的子节点数量（删除前二次确认要显示「将删除 N 个…」） */
export function countDescendants(
  stages: Stage[],
  level: CurriculumLevel,
  id: string,
): { courses: number; chapters: number; lessons: number } {
  const loc = locateNode(stages, level, id);
  if (!loc) return { courses: 0, chapters: 0, lessons: 0 };

  const stage = stages.find((s) => s.id === loc.stageId);
  if (level === 'stage') {
    let courses = 0;
    let chapters = 0;
    let lessons = 0;
    for (const course of stage?.courses ?? []) {
      courses += 1;
      chapters += course.chapters.length;
      lessons += course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
    }
    return { courses, chapters, lessons };
  }

  const course = stage?.courses.find((c) => c.id === loc.courseId);
  if (level === 'course') {
    let chapters = 0;
    let lessons = 0;
    for (const chapter of course?.chapters ?? []) {
      chapters += 1;
      lessons += chapter.lessons.length;
    }
    return { courses: 0, chapters, lessons };
  }

  const chapter = course?.chapters.find((ch) => ch.id === loc.chapterId);
  if (level === 'chapter') return { courses: 0, chapters: 0, lessons: chapter?.lessons.length ?? 0 };
  return { courses: 0, chapters: 0, lessons: 0 };
}

/** 全树课时数（顶部统计用） */
export function countLessons(stages: Stage[]): number {
  return stages.reduce(
    (sum, stage) =>
      sum +
      stage.courses.reduce(
        (cs, course) => cs + course.chapters.reduce((chs, chapter) => chs + chapter.lessons.length, 0),
        0,
      ),
    0,
  );
}

/** 把整棵树拍平成课时列表（带祖先信息，用于「查找某课时」与批量校验） */
export interface FlatLesson {
  lesson: LessonStep;
  stageId: string;
  stageCode: string;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
}

export function flattenLessons(stages: Stage[]): FlatLesson[] {
  const out: FlatLesson[] = [];
  for (const stage of stages) {
    for (const course of stage.courses) {
      for (const chapter of course.chapters) {
        for (const lesson of chapter.lessons) {
          out.push({
            lesson,
            stageId: stage.id,
            stageCode: stage.stageCode,
            courseId: course.id,
            courseTitle: course.title,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
          });
        }
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// 更新
// ─────────────────────────────────────────────

/**
 * 改任意层级节点的字段（浅合并）。
 * 四个层级共用一套「stage → course → chapter → lesson」不可变重建，
 * 不会因为漏了某一层而丢数据。
 */
export function updateNode(
  stages: Stage[],
  level: CurriculumLevel,
  id: string,
  patch: Record<string, unknown>,
): Stage[] {
  const loc = locateNode(stages, level, id);
  if (!loc) return stages;

  if (level === 'stage') {
    return stages.map((s) => (s.id === loc.stageId ? ({ ...s, ...patch } as Stage) : s));
  }

  return stages.map((s) =>
    s.id !== loc.stageId
      ? s
      : {
          ...s,
          courses: s.courses.map((c) =>
            c.id !== loc.courseId
              ? c
              : {
                  ...c,
                  chapters: c.chapters.map((ch) =>
                    ch.id !== loc.chapterId
                      ? ch
                      : {
                          ...ch,
                          lessons:
                            loc.lessonIndex === undefined
                              ? ch.lessons
                              : ch.lessons.map((l, i) =>
                                  i === loc.lessonIndex ? ({ ...l, ...patch } as LessonStep) : l,
                                ),
                        },
                  ),
                },
          ),
        },
  );
}

/** 整份替换某个课时（`onChangeLesson` 的落库入口，保证写回正确的章节） */
export function replaceLesson(stages: Stage[], lesson: LessonStep): Stage[] {
  return updateNode(stages, 'lesson', lesson.id, lesson as unknown as Record<string, unknown>);
}

// ─────────────────────────────────────────────
// 新增
// ─────────────────────────────────────────────

/**
 * 新增节点。
 * - `level = 'stage'` 时忽略 `parentId`，直接追加到根；
 * - 其余层级 `parentId` = 父节点 id。
 */
export function addNode(
  stages: Stage[],
  level: CurriculumLevel,
  parentId: string | null,
  payload: Stage | Course | Chapter | LessonStep,
): Stage[] {
  if (level === 'stage') return [...stages, payload as Stage];
  if (!parentId) return stages;

  const parentLevel: CurriculumLevel =
    level === 'course' ? 'stage' : level === 'chapter' ? 'course' : 'chapter';
  const loc = locateNode(stages, parentLevel, parentId);
  if (!loc) return stages;

  if (level === 'course') {
    return stages.map((s) => (s.id !== loc.stageId ? s : { ...s, courses: [...s.courses, payload as Course] }));
  }

  return stages.map((s) =>
    s.id !== loc.stageId
      ? s
      : {
          ...s,
          courses: s.courses.map((c) => {
            if (c.id !== loc.courseId) return c;
            if (level === 'chapter') return { ...c, chapters: [...c.chapters, payload as Chapter] };
            return {
              ...c,
              chapters: c.chapters.map((ch) =>
                ch.id !== loc.chapterId ? ch : { ...ch, lessons: [...ch.lessons, payload as LessonStep] },
              ),
            };
          }),
        },
  );
}

// ─────────────────────────────────────────────
// 删除
// ─────────────────────────────────────────────

/** 删除节点（**级联删除**下级；调用方负责二次确认 + 显示影响范围） */
export function removeNode(stages: Stage[], level: CurriculumLevel, id: string): Stage[] {
  const loc = locateNode(stages, level, id);
  if (!loc) return stages;

  if (level === 'stage') return stages.filter((s) => s.id !== loc.stageId);

  return stages.map((s) =>
    s.id !== loc.stageId
      ? s
      : {
          ...s,
          courses: s.courses
            .filter((c) => !(level === 'course' && c.id === loc.courseId))
            .map((c) =>
              level === 'course'
                ? c
                : {
                    ...c,
                    chapters: c.chapters
                      .filter((ch) => !(level === 'chapter' && ch.id === loc.chapterId))
                      .map((ch) =>
                        level === 'chapter' || loc.lessonIndex === undefined
                          ? ch
                          : { ...ch, lessons: ch.lessons.filter((_, i) => i !== loc.lessonIndex) },
                      ),
                  },
            ),
        },
  );
}

// ─────────────────────────────────────────────
// 移动 / 复制
// ─────────────────────────────────────────────

/** 与同级相邻节点交换位置（delta = -1 上移 / +1 下移）；越界返回原引用 */
export function moveNode(stages: Stage[], level: CurriculumLevel, id: string, delta: -1 | 1): Stage[] {
  const found = siblingsOf(stages, level, id);
  if (!found) return stages;
  const { index } = found;
  const target = index + delta;
  const list = found.list as Array<{ id: string }>;
  if (target < 0 || target >= list.length) return stages;

  const nextList = [...list];
  [nextList[index], nextList[target]] = [nextList[target], nextList[index]];

  const loc = locateNode(stages, level, id);
  if (!loc) return stages;

  if (level === 'stage') return nextList as Stage[];
  return stages.map((s) => {
    if (s.id !== loc.stageId) return s;
    if (level === 'course') return { ...s, courses: nextList as Course[] };
    return {
      ...s,
      courses: s.courses.map((c) => {
        if (c.id !== loc.courseId) return c;
        if (level === 'chapter') return { ...c, chapters: nextList as Chapter[] };
        return {
          ...c,
          chapters: c.chapters.map((ch) =>
            ch.id !== loc.chapterId ? ch : { ...ch, lessons: nextList as LessonStep[] },
          ),
        };
      }),
    };
  });
}

/** 深拷贝并重新生成全部 id（复制阶段/课程/章节/课时） */
function cloneWithNewIds<T extends { id: string }>(node: T, level: CurriculumLevel): T {
  const copy: any = JSON.parse(JSON.stringify(node));
  copy.id = newId(level === 'stage' ? 'stage' : level === 'course' ? 'course' : level === 'chapter' ? 'chap' : 'lesson');

  if (copy.name) copy.name = `${copy.name}（副本）`;
  if (copy.title) copy.title = `${copy.title}（副本）`;

  if (Array.isArray(copy.courses)) {
    copy.courses = copy.courses.map((c: Course) => cloneWithNewIds(c, 'course'));
  }
  if (Array.isArray(copy.chapters)) {
    copy.chapters = copy.chapters.map((ch: Chapter) => cloneWithNewIds(ch, 'chapter'));
  }
  if (Array.isArray(copy.lessons)) {
    copy.lessons = copy.lessons.map((l: LessonStep) => cloneWithNewIds(l, 'lesson'));
  }
  return copy as T;
}

/** 复制节点（插入到原节点之后），返回新树与新节点 id */
export function duplicateNode(
  stages: Stage[],
  level: CurriculumLevel,
  id: string,
): { stages: Stage[]; newId: string | null } {
  const loc = locateNode(stages, level, id);
  if (!loc) return { stages, newId: null };

  let source: unknown = null;
  if (level === 'stage') source = stages.find((s) => s.id === id);
  if (level === 'course') source = stages.find((s) => s.id === loc.stageId)?.courses.find((c) => c.id === id);
  if (level === 'chapter') {
    source = stages
      .find((s) => s.id === loc.stageId)
      ?.courses.find((c) => c.id === loc.courseId)
      ?.chapters.find((ch) => ch.id === id);
  }
  if (level === 'lesson') {
    source = stages
      .find((s) => s.id === loc.stageId)
      ?.courses.find((c) => c.id === loc.courseId)
      ?.chapters.find((ch) => ch.id === loc.chapterId)
      ?.lessons.find((l) => l.id === id);
  }
  if (!source) return { stages, newId: null };

  const copy = cloneWithNewIds(source as { id: string }, level);
  const found = siblingsOf(stages, level, id);
  if (!found) return { stages, newId: null };
  const insertAt = found.index + 1;

  const nextList = [...(found.list as Array<{ id: string }>)];
  nextList.splice(insertAt, 0, copy as { id: string });

  if (level === 'stage') return { stages: nextList as Stage[], newId: copy.id };

  return {
    stages: stages.map((s) =>
      s.id !== loc.stageId
        ? s
        : {
            ...s,
            courses:
              level === 'course'
                ? (nextList as unknown as Course[])
                : s.courses.map((c) => {
                    if (c.id !== loc.courseId) return c;
                    if (level === 'chapter') return { ...c, chapters: nextList as unknown as Chapter[] };
                    return {
                      ...c,
                      chapters: c.chapters.map((ch) =>
                        ch.id !== loc.chapterId ? ch : { ...ch, lessons: nextList as unknown as LessonStep[] },
                      ),
                    };
                  }),
          },
    ),
    newId: copy.id,
  };
}

// ─────────────────────────────────────────────
// 时间切片（20 分钟）工具
// ─────────────────────────────────────────────

export const BUILTIN_TIME_KEYS = ['tuningMin', 'videoMin', 'quizMin', 'drillMin', 'songMin'] as const;
export type BuiltinTimeKey = (typeof BUILTIN_TIME_KEYS)[number];

/** 内置 5 个教学模块的元信息（名称/颜色/说明与教研口径一致） */
export const DEFAULT_TIME_MODULES: TimeModule[] = [
  {
    key: 'tuningMin',
    name: '琴头校音 (Tuning)',
    minutes: 3,
    defaultMin: 3,
    color: 'bg-emerald-500',
    textCol: 'text-emerald-400',
    desc: '440Hz高精度频闪校音，消除弦准偏差',
  },
  {
    key: 'videoMin',
    name: '视频精讲 (Master Video)',
    minutes: 6,
    defaultMin: 6,
    color: 'bg-sky-500',
    textCol: 'text-sky-400',
    desc: '名师4K手型特写与防哑音核心力矩讲解',
  },
  {
    key: 'quizMin',
    name: '和弦微测 (Chord Quiz)',
    minutes: 4,
    defaultMin: 4,
    color: 'bg-amber-500',
    textCol: 'text-amber-400',
    desc: '单和弦6根弦独立听音纯度与杂音检测',
  },
  {
    key: 'drillMin',
    name: '转换冲刺 (Pair Drill)',
    minutes: 4,
    defaultMin: 4,
    color: 'bg-indigo-500',
    textCol: 'text-indigo-400',
    desc: '双和弦BPM阶梯对拍换把肌肉记忆建立',
  },
  {
    key: 'songMin',
    name: '曲目对拍 (Song Alignment)',
    minutes: 3,
    defaultMin: 3,
    color: 'bg-purple-500',
    textCol: 'text-purple-400',
    desc: '带原声音轨六线谱全速对拍通关实战',
  },
];

/** 切片模板（一键套用） */
export const TIME_TEMPLATES: Array<{
  id: string;
  name: string;
  desc: string;
  allocation: LessonStep['timeAllocation'];
}> = [
  {
    id: 'golden',
    name: '黄金配比 3+6+4+4+3',
    desc: '标准新课：先校音、再看精讲、接着微测与冲刺、最后曲目对拍',
    allocation: { ...GOLDEN_TIME_ALLOCATION },
  },
  {
    id: 'drill-heavy',
    name: '转换强化 2+4+4+7+3',
    desc: '重点练换把：压缩精讲时长，把时间给 BPM 阶梯冲刺',
    allocation: { tuningMin: 2, videoMin: 4, quizMin: 4, drillMin: 7, songMin: 3 },
  },
  {
    id: 'song',
    name: '曲目冲刺 3+5+3+3+6',
    desc: '已掌握手型，直接带原声对拍完整曲目片段',
    allocation: { tuningMin: 3, videoMin: 5, quizMin: 3, drillMin: 3, songMin: 6 },
  },
  {
    id: 'review',
    name: '复习课 4+2+4+5+5',
    desc: '回炉旧内容：少讲多练，微测与冲刺加长',
    allocation: { tuningMin: 4, videoMin: 2, quizMin: 4, drillMin: 5, songMin: 5 },
  },
];

/** 5 个内置模块的分钟合计 */
export function totalAllocationMinutes(allocation: LessonStep['timeAllocation']): number {
  return BUILTIN_TIME_KEYS.reduce((sum, key) => sum + (Number(allocation?.[key]) || 0), 0);
}

export function isGoldenAllocation(
  allocation: LessonStep['timeAllocation'],
  target = GOLDEN_TOTAL_MINUTES,
): boolean {
  return totalAllocationMinutes(allocation) === target;
}

/** 最大余额法按权重分配整数分钟（保证合计恰好等于 total） */
function distributeMinutes(
  total: number,
  keys: readonly BuiltinTimeKey[],
  weights: number[],
): Record<BuiltinTimeKey, number> {
  const result = {} as Record<BuiltinTimeKey, number>;
  if (total <= 0) {
    for (const key of keys) result[key] = 0;
    return result;
  }
  const sumWeight = weights.reduce((a, b) => a + b, 0);
  if (sumWeight <= 0) {
    const base = Math.floor(total / keys.length);
    const remainder = total - base * keys.length;
    keys.forEach((key, i) => {
      result[key] = base + (i < remainder ? 1 : 0);
    });
    return result;
  }
  const raw = weights.map((w) => (w / sumWeight) * total);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const item of order) {
    if (remainder <= 0) break;
    floored[item.i] += 1;
    remainder -= 1;
  }
  keys.forEach((key, i) => {
    result[key] = floored[i];
  });
  return result;
}

/**
 * 把整个切片**按现有比例**配平到 `target` 分钟（一键配平）。
 * 全部为 0 时退化为平均分配。
 */
export function balanceAllocation(
  allocation: LessonStep['timeAllocation'],
  target = GOLDEN_TOTAL_MINUTES,
): LessonStep['timeAllocation'] {
  const weights = BUILTIN_TIME_KEYS.map((key) => Number(allocation?.[key]) || 0);
  return distributeMinutes(target, BUILTIN_TIME_KEYS, weights);
}

/**
 * 改某一个内置模块的分钟数，并把差额**按比例**分摊到其余模块 ——
 * 这样"总时长恒等于 20 分钟"这条教研铁律永远不会被破坏。
 */
export function setBuiltinMinutes(
  allocation: LessonStep['timeAllocation'],
  key: BuiltinTimeKey,
  value: number,
  target = GOLDEN_TOTAL_MINUTES,
): LessonStep['timeAllocation'] {
  const next = Math.max(0, Math.min(target, Math.round(Number(value) || 0)));
  const others = BUILTIN_TIME_KEYS.filter((k) => k !== key);
  const rest = Math.max(0, target - next);
  const weights = others.map((k) => Number(allocation?.[k]) || 0);
  const distributed = distributeMinutes(rest, others, weights);

  const result = { ...allocation } as LessonStep['timeAllocation'];
  result[key] = next;
  for (const other of others) result[other] = distributed[other];
  return result;
}

/**
 * 把 `timeAllocation` 转成界面用的模块列表：内置 5 项 + 教研自定义模块。
 * 自定义模块的分钟数只存在 `lesson.timeModules` 里，不参与 20 分钟校验。
 */
export function toTimeModules(lesson: LessonStep): TimeModule[] {
  const custom = (lesson.timeModules || []).filter((m) => m.custom);
  return [
    ...DEFAULT_TIME_MODULES.map((module) => ({
      ...module,
      minutes: Number(lesson.timeAllocation?.[module.key as BuiltinTimeKey]) || 0,
    })),
    ...custom,
  ];
}

/** 自定义模块的合计分钟（提示用，不计入黄金 20 分钟） */
export function customMinutes(lesson: LessonStep): number {
  return (lesson.timeModules || [])
    .filter((m) => m.custom)
    .reduce((sum, m) => sum + (Number(m.minutes) || 0), 0);
}

// ─────────────────────────────────────────────
// 校验器
// ─────────────────────────────────────────────

export interface CurriculumWarning {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  /** 相关节点 id（点击可定位） */
  nodeId?: string;
  /** 相关节点所在层级 */
  nodeLevel?: CurriculumLevel;
}

export interface CurriculumValidationContext {
  /** 视频库里存在哪些视频 id（判断课时挂的视频是否还有效） */
  videoIds?: string[];
  /** 和弦组 id 列表 */
  chordGroupIds?: string[];
  /** 和弦库 key 列表 */
  chordKeys?: string[];
}

/**
 * 全体系体检：返回分级警告列表。
 *
 * 只做**教研口径**的硬性/软性检查，不修改数据 —— 界面用不同颜色展示，
 * 「发布」按钮可以据此拦截（error 阻断，warn 提示）。
 */
export function validateCurriculum(
  stages: Stage[],
  context: CurriculumValidationContext = {},
): CurriculumWarning[] {
  const warnings: CurriculumWarning[] = [];

  if (stages.length === 0) {
    warnings.push({ level: 'error', code: 'no-stage', message: '课程体系为空：至少需要 1 个成长阶段' });
    return warnings;
  }

  // 阶段编码唯一
  const codeCount = new Map<string, number>();
  for (const stage of stages) codeCount.set(stage.stageCode, (codeCount.get(stage.stageCode) || 0) + 1);
  for (const [code, count] of codeCount) {
    if (count > 1) {
      warnings.push({
        level: 'error',
        code: 'duplicate-stage-code',
        message: `阶段编码 ${code} 重复出现 ${count} 次`,
      });
    }
  }

  for (const stage of stages) {
    if (!stage.name.trim()) {
      warnings.push({
        level: 'error',
        code: 'empty-stage-name',
        message: `${stage.stageCode} 阶段未填写名称`,
        nodeId: stage.id,
        nodeLevel: 'stage',
      });
    }
    if (stage.courses.length === 0) {
      warnings.push({
        level: 'warn',
        code: 'empty-stage',
        message: `${stage.stageCode}「${stage.name}」下还没有专栏课程`,
        nodeId: stage.id,
        nodeLevel: 'stage',
      });
    }

    for (const course of stage.courses) {
      if (course.chapters.length === 0) {
        warnings.push({
          level: 'warn',
          code: 'empty-course',
          message: `课程「${course.title}」下还没有章节`,
          nodeId: course.id,
          nodeLevel: 'course',
        });
      }

      for (const chapter of course.chapters) {
        if (chapter.lessons.length === 0) {
          warnings.push({
            level: 'warn',
            code: 'empty-chapter',
            message: `章节「${chapter.title}」下还没有课时`,
            nodeId: chapter.id,
            nodeLevel: 'chapter',
          });
        }

        for (const lesson of chapter.lessons) {
          const total = totalAllocationMinutes(lesson.timeAllocation);
          if (total !== GOLDEN_TOTAL_MINUTES) {
            warnings.push({
              level: 'error',
              code: 'time-not-20',
              message: `课时「${lesson.title}」切片合计 ${total} 分钟（需配平到 ${GOLDEN_TOTAL_MINUTES}）`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }

          const linkedVideos = (lesson.videoIds || []).filter(
            (id) => !context.videoIds || context.videoIds.includes(id),
          );
          const hasVideo = linkedVideos.length > 0 || !!lesson.videoData?.videoId;
          if (!hasVideo) {
            warnings.push({
              level: 'warn',
              code: 'no-video',
              message: `课时「${lesson.title}」还没有关联教学视频`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          } else if (context.videoIds && (lesson.videoIds || []).some((id) => !context.videoIds!.includes(id))) {
            warnings.push({
              level: 'warn',
              code: 'dangling-video',
              message: `课时「${lesson.title}」关联了已不存在的视频，请重新选择`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }

          const needsChordPractice = lesson.type === 'chord_quiz' || lesson.type === 'pair_drill';
          const hasChordResource =
            (lesson.chordGroupIds || []).length > 0 || (lesson.trainerData?.chordPairs || []).length > 0;
          if (needsChordPractice && !hasChordResource) {
            warnings.push({
              level: 'warn',
              code: 'no-chord-group',
              message: `课时「${lesson.title}」是和弦类课时，但还没关联和弦练习组`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }
          if (
            context.chordGroupIds &&
            (lesson.chordGroupIds || []).some((id) => !context.chordGroupIds!.includes(id))
          ) {
            warnings.push({
              level: 'warn',
              code: 'dangling-chord-group',
              message: `课时「${lesson.title}」关联了已不存在的和弦组`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }

          if (lesson.type === 'song_sync' && !lesson.songBinding?.songId) {
            warnings.push({
              level: 'warn',
              code: 'no-song',
              message: `课时「${lesson.title}」是对拍课时，但还没绑定曲目`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }

          if (lesson.prerequisite.linearUnlocked) {
            warnings.push({
              level: 'info',
              code: 'linear-locked',
              message: `课时「${lesson.title}」开启了严格线性解锁（学员必须按顺序通关）`,
              nodeId: lesson.id,
              nodeLevel: 'lesson',
            });
          }
        }
      }
    }
  }

  return warnings;
}

/** 把和弦组解析成「某一对和弦实际生效的阶段列表」（组默认 + 单对覆盖） */
export function resolveStagesForPair(
  group: { stages: ChordDrillStage[]; pairStages?: Record<string, ChordDrillStage[]> },
  fromChord: string,
  toChord: string,
): { stages: ChordDrillStage[]; overridden: boolean } {
  const override = group.pairStages?.[`${fromChord}|${toChord}`];
  if (override && override.length) {
    return { stages: [...override].sort((a, b) => a.order - b.order), overridden: true };
  }
  return { stages: [...group.stages].sort((a, b) => a.order - b.order), overridden: false };
}

/**
 * 新建一个练习阶段。
 * `previousTargetBpm` 传上一阶段的 `targetBpm` 时，新阶段会**承接**它作为起点（+10 BPM）。
 */
export function createDrillStage(
  fromChord: string,
  toChord: string,
  order: number,
  previousTargetBpm?: number,
): ChordDrillStage {
  const startBpm = previousTargetBpm ?? 40;
  return {
    id: newId('stage'),
    name: `阶段 ${order} · 新阶段`,
    fromChord,
    toChord,
    startBpm,
    targetBpm: startBpm + 10,
    stepBpm: 5,
    passBars: 4,
    toleranceCents: 15,
    order,
  };
}
