/**
 * 课程大纲操作集回归测试
 * ======================
 *
 * `curriculumOps.ts` 是纯函数，所以「新增节点会不会误改别的分支」「删除会不会漏删」
 * 「配平后是不是恰好 20 分钟」这类问题都能像算术一样断言，不必靠手点界面。
 *
 * 运行：`npm run verify:curriculum`
 */

import { INITIAL_CHORD_GROUPS, INITIAL_STAGES } from '../src/data/initialData';
import type { Chapter, ChordDrillStage, Course, LessonStep, Stage } from '../src/types';
import {
  addNode,
  balanceAllocation,
  countDescendants,
  countLessons,
  createChapter,
  createCourse,
  createDrillStage,
  createLesson,
  createStage,
  customMinutes,
  locateNode,
  moveNode,
  nextStageCode,
  STAGE_CODES,
  removeNode,
  resolveStagesForPair,
  setBuiltinMinutes,
  siblingsOf,
  toTimeModules,
  totalAllocationMinutes,
  updateNode,
  validateCurriculum,
  duplicateNode,
  GOLDEN_TIME_ALLOCATION,
} from '../src/utils/curriculumOps';
import { moveById, nextSequentialId, removeById, upsertById } from '../src/utils/libraryOps';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}${detail ? `  \u001b[90m${detail}\u001b[0m` : ''}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}  ${detail}`);
  }
}

/** 深拷贝快照，用于验证「纯函数没有原地改写入参」 */
const snapshot = (value: unknown) => JSON.stringify(value);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

console.log('\n\u001b[1m📚 课程大纲操作集回归\u001b[0m\n');

// ── 1. 种子数据健全性 ───────────────────────
console.log('\u001b[1m[1] 种子数据\u001b[0m');
const base: Stage[] = clone(INITIAL_STAGES);
check('INITIAL_STAGES 非空', base.length > 0, `${base.length} 个阶段`);
check(
  '每个阶段都有合法的 stageCode',
  base.every((s) => /^L\d+$/.test(s.stageCode)),
  base.map((s) => s.stageCode).join(','),
);
check('全树课时数 > 0', countLessons(base) > 0, `${countLessons(base)} 个课时`);
check(
  '每个课时的切片合计都等于 20',
  base.every((s) =>
    s.courses.every((c) => c.chapters.every((ch) => ch.lessons.every((l) => totalAllocationMinutes(l.timeAllocation) === 20))),
  ),
);

const targetStageId = base[0].id;
const targetCourseId = base[0].courses[0].id;
const targetChapterId = base[0].courses[0].chapters[0].id;
const targetLessonId = base[0].courses[0].chapters[0].lessons[0].id;

// ── 2. 定位 ─────────────────────────────────
console.log('\n\u001b[1m[2] 节点定位\u001b[0m');
check('locateNode(stage) 命中', locateNode(base, 'stage', targetStageId)?.stageId === targetStageId);
check(
  'locateNode(lesson) 带回完整祖先 + 下标',
  (() => {
    const loc = locateNode(base, 'lesson', targetLessonId);
    return (
      !!loc &&
      loc.stageId === targetStageId &&
      loc.courseId === targetCourseId &&
      loc.chapterId === targetChapterId &&
      loc.lessonIndex === 0
    );
  })(),
);
check('locateNode(不存在的 id) = null', locateNode(base, 'lesson', 'nope') === null);
check(
  'siblingsOf(lesson) 指向所在章节的课时数组',
  (() => {
    const found = siblingsOf(base, 'lesson', targetLessonId);
    const expected = base[0].courses[0].chapters[0].lessons.length;
    return !!found && found.list.length === expected && found.index === 0;
  })(),
);

// ── 3. 新增（四个层级）─────────────────────
console.log('\n\u001b[1m[3] 新增节点\u001b[0m');
const before3 = snapshot(base);

const withStage = addNode(base, 'stage', null, createStage(base));
check('新增 Stage 追加到根', withStage.length === base.length + 1, `${base.length} → ${withStage.length}`);
check('新阶段编码自动取下一个可用码', withStage[withStage.length - 1].stageCode === 'L4', withStage[withStage.length - 1].stageCode);
check(
  'nextStageCode 取最小空闲编码（跳过已占用）',
  nextStageCode([
    { ...base[0], stageCode: 'L1' },
    { ...base[0], id: 'x2', stageCode: 'L3' },
  ]) === 'L2',
  nextStageCode([
    { ...base[0], stageCode: 'L1' },
    { ...base[0], id: 'x2', stageCode: 'L3' },
  ]),
);
check(
  'nextStageCode 用尽 L1~L9 时兜底递增',
  String(nextStageCode(STAGE_CODES.map((code, i) => ({ ...base[0], id: `s${i}`, stageCode: code })))) === 'L10',
  nextStageCode(STAGE_CODES.map((code, i) => ({ ...base[0], id: `s${i}`, stageCode: code }))),
);

const withCourse = addNode(withStage, 'course', targetStageId, createCourse('测试课程'));
check(
  '新增 Course 落进目标 Stage',
  withCourse.find((s) => s.id === targetStageId)!.courses.length ===
    withStage.find((s) => s.id === targetStageId)!.courses.length + 1,
);
check(
  '新增 Course 不污染其它 Stage',
  snapshot(withCourse.filter((s) => s.id !== targetStageId)) ===
    snapshot(withStage.filter((s) => s.id !== targetStageId)),
);

const newChapter = createChapter(99, '第99章：测试章节');
const withChapter = addNode(withCourse, 'chapter', targetCourseId, newChapter);
check(
  '新增 Chapter 落进目标 Course',
  withChapter
    .find((s) => s.id === targetStageId)!
    .courses.find((c) => c.id === targetCourseId)!
    .chapters.some((ch) => ch.id === newChapter.id),
);

const newLesson = createLesson(1, 'chord_quiz');
const withLesson = addNode(withChapter, 'lesson', newChapter.id, newLesson);
check(
  '新增 Lesson 落进目标 Chapter',
  withLesson
    .find((s) => s.id === targetStageId)!
    .courses.find((c) => c.id === targetCourseId)!
    .chapters.find((ch) => ch.id === newChapter.id)!
    .lessons.some((l) => l.id === newLesson.id),
);
check(
  '新建课时默认就是黄金 20 分钟切片',
  totalAllocationMinutes(newLesson.timeAllocation) === 20,
  `${totalAllocationMinutes(newLesson.timeAllocation)}`,
);

// ── 4. 更新（四个层级 + 不误伤） ────────────
console.log('\n\u001b[1m[4] 更新节点\u001b[0m');
const renamedStage = updateNode(base, 'stage', targetStageId, { name: '改名后的阶段' });
check('改 Stage 名称生效', renamedStage[0].name === '改名后的阶段');
check(
  '改 Stage 不影响其 courses 内容',
  snapshot(renamedStage[0].courses) === snapshot(base[0].courses),
);

const renamedLesson = updateNode(base, 'lesson', targetLessonId, { title: '改名后的课时' });
check(
  '改 Lesson 标题生效且其余字段不变',
  (() => {
    const lesson = renamedLesson[0].courses[0].chapters[0].lessons[0];
    const original = base[0].courses[0].chapters[0].lessons[0];
    return (
      lesson.title === '改名后的课时' &&
      lesson.type === original.type &&
      snapshot(lesson.timeAllocation) === snapshot(original.timeAllocation)
    );
  })(),
);
check(
  '改 Lesson 不影响同章节的其它课时',
  snapshot(renamedLesson[0].courses[0].chapters[0].lessons.slice(1)) ===
    snapshot(base[0].courses[0].chapters[0].lessons.slice(1)),
);
check(
  'updateNode 对未知 id 是 no-op（返回原引用）',
  updateNode(base, 'lesson', 'missing-id', { title: 'x' }) === base,
);

// ── 5. 删除（级联 + 影响范围）──────────────
console.log('\n\u001b[1m[5] 删除节点\u001b[0m');
check(
  'countDescendants(stage) 统计出全部下级',
  (() => {
    const c = countDescendants(base, 'stage', targetStageId);
    const stage = base[0];
    const lessons = stage.courses.reduce(
      (sum, course) => sum + course.chapters.reduce((s2, ch) => s2 + ch.lessons.length, 0),
      0,
    );
    return c.courses === stage.courses.length && c.lessons === lessons;
  })(),
);
check(
  'countDescendants(lesson) 全为 0（叶子）',
  (() => {
    const c = countDescendants(base, 'lesson', targetLessonId);
    return c.courses === 0 && c.chapters === 0 && c.lessons === 0;
  })(),
);

const removedLesson = removeNode(base, 'lesson', targetLessonId);
check(
  '删 Lesson 后章节内少 1 个课时、其它不变',
  removedLesson[0].courses[0].chapters[0].lessons.length ===
    base[0].courses[0].chapters[0].lessons.length - 1 &&
    removedLesson.length === base.length,
);
check(
  '删 Stage 级联移除整棵子树',
  removeNode(base, 'stage', targetStageId).length === base.length - 1,
);
const removedCourse = removeNode(base, 'course', targetCourseId);
check(
  '删 Course 只影响目标 Stage',
  removedCourse[0].courses.length === base[0].courses.length - 1 &&
    snapshot(removedCourse.slice(1)) === snapshot(base.slice(1)),
);

// ── 6. 排序 / 复制 ─────────────────────────
console.log('\n\u001b[1m[6] 排序与复制\u001b[0m');
const twoLessons: Stage[] = clone(base);
twoLessons[0].courses[0].chapters[0].lessons.push({
  ...createLesson(2, 'video'),
  id: 'lesson-second',
  title: '第二个课时',
});
const moved = moveNode(twoLessons, 'lesson', 'lesson-second', -1);
check(
  'moveNode(-1) 与上一个课时交换位置（上移一位）',
  (() => {
    const lessons = moved[0].courses[0].chapters[0].lessons;
    const index = lessons.findIndex((l) => l.id === 'lesson-second');
    return index === twoLessons[0].courses[0].chapters[0].lessons.length - 2 && lessons[index + 1].id !== 'lesson-second';
  })(),
  moved[0].courses[0].chapters[0].lessons.map((l) => l.id).join(','),
);
check(
  'moveNode 越界时 no-op（返回原引用）',
  moveNode(twoLessons, 'lesson', twoLessons[0].courses[0].chapters[0].lessons[0].id, -1) === twoLessons,
);

const dup = duplicateNode(base, 'lesson', targetLessonId);
check('duplicateNode 生成新 id', !!dup.newId && dup.newId !== targetLessonId);
check(
  'duplicateNode 插在原节点之后且内容一致（标题带「副本」）',
  (() => {
    const lessons = dup.stages[0].courses[0].chapters[0].lessons;
    const original = lessons.find((l) => l.id === targetLessonId)!;
    const copy = lessons.find((l) => l.id === dup.newId)!;
    return (
      lessons[1].id === dup.newId &&
      copy.title === `${original.title}（副本）` &&
      totalAllocationMinutes(copy.timeAllocation) === 20
    );
  })(),
);

const dupStage = duplicateNode(base, 'stage', targetStageId);
check(
  '复制 Stage 时下级 id 全部重建（不会出现重复 id）',
  (() => {
    if (!dupStage.newId) return false;
    const allIds: string[] = [];
    const collect = (stages: Stage[]) => {
      for (const s of stages) {
        allIds.push(s.id);
        for (const c of s.courses) {
          allIds.push(c.id);
          for (const ch of c.chapters) {
            allIds.push(ch.id);
            for (const l of ch.lessons) allIds.push(l.id);
          }
        }
      }
    };
    collect(dupStage.stages);
    return allIds.length === new Set(allIds).size;
  })(),
);

// ── 7. 时间切片（20 分钟铁律）──────────────
console.log('\n\u001b[1m[7] 时间切片配平\u001b[0m');
check('黄金切片合计 20', totalAllocationMinutes(GOLDEN_TIME_ALLOCATION) === 20);
check(
  'balanceAllocation 把乱掉的分配配平到 20',
  (() => {
    const bad = { tuningMin: 1, videoMin: 1, quizMin: 1, drillMin: 1, songMin: 1 };
    const fixed = balanceAllocation(bad);
    return totalAllocationMinutes(fixed) === 20;
  })(),
);
check(
  'balanceAllocation 保持各项的相对比例',
  (() => {
    const fixed = balanceAllocation({ tuningMin: 2, videoMin: 8, quizMin: 0, drillMin: 0, songMin: 0 });
    return fixed.videoMin === 16 && fixed.tuningMin === 4;
  })(),
  JSON.stringify(balanceAllocation({ tuningMin: 2, videoMin: 8, quizMin: 0, drillMin: 0, songMin: 0 })),
);
check(
  'setBuiltinMinutes 改一项后**合计仍为 20**（差额按比例挪给其它项）',
  (() => {
    const next = setBuiltinMinutes({ ...GOLDEN_TIME_ALLOCATION }, 'videoMin', 10);
    return next.videoMin === 10 && totalAllocationMinutes(next) === 20;
  })(),
  JSON.stringify(setBuiltinMinutes({ ...GOLDEN_TIME_ALLOCATION }, 'videoMin', 10)),
);
check(
  'setBuiltinMinutes 上限被夹到 20（其余归零）',
  (() => {
    const next = setBuiltinMinutes({ ...GOLDEN_TIME_ALLOCATION }, 'drillMin', 99);
    return (
      next.drillMin === 20 &&
      next.tuningMin === 0 &&
      next.videoMin === 0 &&
      next.quizMin === 0 &&
      next.songMin === 0
    );
  })(),
);
check(
  '全部为 0 时 balanceAllocation 平均分配（20 / 5 = 4）',
  (() => {
    const fixed = balanceAllocation({ tuningMin: 0, videoMin: 0, quizMin: 0, drillMin: 0, songMin: 0 });
    return fixed.tuningMin === 4 && fixed.videoMin === 4 && fixed.songMin === 4;
  })(),
);
check(
  'toTimeModules 给出 5 个内置模块 + 自定义模块',
  (() => {
    const lesson = { ...createLesson(1), timeModules: [{ key: 'custom-rhythm', name: '节奏跟拍', minutes: 3, defaultMin: 3, color: 'bg-rose-500', textCol: 'text-rose-400', desc: '', custom: true }] } as LessonStep;
    const modules = toTimeModules(lesson);
    return modules.length === 6 && modules[5].key === 'custom-rhythm' && customMinutes(lesson) === 3;
  })(),
);

// ── 8. 校验器 ───────────────────────────────
console.log('\n\u001b[1m[8] 全体系校验器\u001b[0m');
const broken: Stage[] = clone(base);
broken[0].courses[0].chapters[0].lessons[0].timeAllocation = {
  tuningMin: 5,
  videoMin: 5,
  quizMin: 5,
  drillMin: 5,
  songMin: 5,
};
broken[0].courses[0].chapters[0].lessons[0].videoIds = ['vid-not-exist'];
/** 故意造一个与 L1 重复编码的阶段 */
broken.push({ ...createStage(broken), id: 'stage-dup-code', stageCode: broken[0].stageCode });
const warnings = validateCurriculum(broken, {
  videoIds: ['vid-gt-001'],
  chordGroupIds: INITIAL_CHORD_GROUPS.map((g) => g.id),
});
const codes = warnings.map((w) => w.code);
check('检出「切片不等于 20」', codes.includes('time-not-20'), codes.join(','));
check('检出「关联了不存在的视频」', codes.includes('dangling-video'));
check('检出「阶段编码重复」', codes.includes('duplicate-stage-code'));
check(
  '校验结果按级别分类（error / warn / info 三类都有）',
  ['error', 'warn', 'info'].every((level) => warnings.some((w) => w.level === level)),
  ['error', 'warn', 'info']
    .map((level) => `${level}:${warnings.filter((w) => w.level === level).length}`)
    .join(' '),
);
check(
  '空体系直接返回 no-stage 错误',
  validateCurriculum([]).some((w) => w.code === 'no-stage'),
);

// ── 9. 和弦组阶段解析 ───────────────────────
console.log('\n\u001b[1m[9] 和弦组阶段解析\u001b[0m');
const barreGroup = INITIAL_CHORD_GROUPS.find((g) => g.id === 'group-barre')!;
check(
  '未覆盖的和弦对使用组内默认阶段',
  resolveStagesForPair(barreGroup, 'F', 'Bm').stages.length === 3 &&
    resolveStagesForPair(barreGroup, 'F', 'Bm').overridden === false,
);
check(
  'pairStages 覆盖生效（Bm→F 走单独配置）',
  resolveStagesForPair(barreGroup, 'Bm', 'F').overridden === true &&
    resolveStagesForPair(barreGroup, 'Bm', 'F').stages.length === 2,
);
check(
  '阶段按 order 升序返回',
  (() => {
    const { stages } = resolveStagesForPair(barreGroup, 'F', 'Bm');
    return stages.every((s, i) => i === 0 || s.order >= stages[i - 1].order);
  })(),
);
check(
  'createDrillStage 默认承接上一阶段的 targetBpm 作为新起点（+10 BPM）',
  (() => {
    const next = createDrillStage('C', 'G', 2, 60);
    return next.startBpm === 60 && next.targetBpm === 70;
  })(),
);

// ── 10. 通用列表操作 ────────────────────────
console.log('\n\u001b[1m[10] 通用列表操作（视频库 / 和弦库）\u001b[0m');
const list = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
];
check('upsertById 新增追加', upsertById(list, { id: 'c', title: 'C' }).length === 3);
check(
  'upsertById 已存在则原地替换（顺序不变）',
  (() => {
    const next = upsertById(list, { id: 'a', title: 'A2' });
    return next.length === 2 && next[0].title === 'A2';
  })(),
);
check('removeById 只删目标', removeById(list, 'a').map((x) => x.id).join(',') === 'b');
check('moveById 交换相邻项', moveById(list, 'b', -1)[0].id === 'b');
check('moveById 越界 no-op', moveById(list, 'a', -1) === list);
check('nextSequentialId 跳过已占用编号', nextSequentialId('video', ['video-1', 'video-2', 'video-4']) === 'video-3');

// ── 11. 纯函数不变式（不得改写入参）─────────
console.log('\n\u001b[1m[11] 纯函数不变式\u001b[0m');
check('第 3~6 节的连续操作没有污染原始树', snapshot(base) === before3);
check(
  '有效操作返回新引用（不会让 React 漏更新）',
  updateNode(base, 'stage', targetStageId, { name: 'x' }) !== base &&
    removeNode(base, 'lesson', targetLessonId) !== base &&
    addNode(base, 'stage', null, createStage(base)) !== base,
);
check(
  '无效操作返回原引用（避免无意义的重渲染）',
  moveNode(base, 'lesson', targetLessonId, -1) === base &&
    updateNode(base, 'lesson', 'missing', {}) === base &&
    removeNode(base, 'lesson', 'missing') === base,
);

// ── 汇总 ────────────────────────────────────
console.log(`\n\u001b[1m汇总\u001b[0m：${passed}/${passed + failed} 通过`);
if (failed > 0) {
  console.log(`\n\u001b[31m${failed} 项失败\u001b[0m\n`);
  process.exit(1);
}
console.log('\n\u001b[32m课程大纲操作集全部符合预期 ✅\u001b[0m\n');
