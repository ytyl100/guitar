/**
 * 把 CMS 的课程种子导出成后端的内置种子 JSON
 * ==========================================
 *
 * 背景：课程大纲原本只存在于 **CMS 的 localStorage**（`guitarmate_curriculum_stages` 等 4 个 key），
 * 种子数据在 `src/data/initialData.ts` 里。现在改成「后端唯一数据源」后，
 * 后端需要一个**内置种子**：首次访问 `GET /api/curriculum` 时自动落库，
 * 这样 CMS 打开就看到熟悉的数据（不会一片空白）、小程序也有内容可读。
 *
 * 为什么用脚本导出而不是把 `initialData.ts` 复制到后端：
 * 复制一份 = 两处定义，改一处忘另一处就漂移。脚本保证**种子只有一个来源**（CMS 的 initialData）。
 * 数据一旦落库，后续由 CMS 通过 API 修改，这个 JSON 只在「库被清空」时再被用到。
 *
 * 用法（在 `guitarmate-studio-cms` 目录下）：
 *   npx tsx scripts/export-curriculum-seed.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CHORD_LIBRARY,
  INITIAL_CHORD_GROUPS,
  INITIAL_STAGES,
  buildInitialVideoLibrary,
} from '../src/data/initialData';

/** 与后端 `CurriculumData` 一一对应（CMS 的 4 个 state slice） */
const doc = {
  stages: INITIAL_STAGES,
  videoLibrary: buildInitialVideoLibrary(INITIAL_STAGES),
  chords: CHORD_LIBRARY,
  chordGroups: INITIAL_CHORD_GROUPS,
};

const out = join(process.cwd(), '..', 'guitarmate-audio-backend', 'prisma', 'curriculum.seed.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

const countLessons = doc.stages.reduce(
  (sum, stage) =>
    sum +
    stage.courses.reduce(
      (s2, course) =>
        s2 + course.chapters.reduce((s3, chapter) => s3 + chapter.lessons.length, 0),
      0,
    ),
  0,
);

console.log(`✅ 课程种子已导出 → ${out}`);
console.log(
  `   阶段 ${doc.stages.length} · 课程 ${doc.stages.reduce((n, s) => n + s.courses.length, 0)} · ` +
    `课时 ${countLessons} · 视频 ${doc.videoLibrary.length} · 和弦 ${Object.keys(doc.chords).length} · ` +
    `和弦组 ${doc.chordGroups.length}`,
);
