import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  GitFork,
  Info,
  Layers,
  Link2,
  ListChecks,
  Lock,
  Music4,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Tv,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { Chapter, ChordGroup, Course, LessonStep, Stage, TeachingVideo, TimeModule } from '../../types';
import {
  addNode,
  balanceAllocation,
  BuiltinTimeKey,
  CHILD_TITLE_PREFIX,
  countDescendants,
  countLessons,
  createChapter,
  createCourse,
  createLesson,
  createStage,
  CURRICULUM_LEVEL_LABEL,
  CurriculumLevel,
  customMinutes,
  duplicateNode,
  flattenLessons,
  isGoldenAllocation,
  locateNode,
  moveNode,
  removeNode,
  resolveStagesForPair,
  setBuiltinMinutes,
  siblingsOf,
  TIME_TEMPLATES,
  toTimeModules,
  totalAllocationMinutes,
  updateNode,
  validateCurriculum,
} from '../../utils/curriculumOps';

// ─────────────────────────────────────────────
// 常量与小工具
// ─────────────────────────────────────────────

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const LESSON_TYPE_OPTIONS: Array<{ value: LessonStep['type']; label: string }> = [
  { value: 'tuning', label: '琴头校音 (Tuning)' },
  { value: 'video', label: '视频精讲 (Video)' },
  { value: 'chord_quiz', label: '和弦微测 (Chord Quiz)' },
  { value: 'pair_drill', label: '转换冲刺 (Pair Drill)' },
  { value: 'song_sync', label: '曲目对拍 (Song Sync)' },
];

const LESSON_TYPE_LABEL: Record<LessonStep['type'], string> = {
  tuning: '校音',
  video: '精讲',
  chord_quiz: '微测',
  pair_drill: '冲刺',
  song_sync: '对拍',
};

interface AddForm {
  level: CurriculumLevel;
  parentId: string | null;
  parentLabel: string;
  name: string;
  lessonType: LessonStep['type'];
}

interface DeleteTarget {
  level: CurriculumLevel;
  id: string;
  title: string;
  step: 1 | 2;
}

interface EditTarget {
  level: CurriculumLevel;
  id: string;
}

const levelAccent: Record<CurriculumLevel, string> = {
  stage: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  course: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  chapter: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  lesson: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

// ─────────────────────────────────────────────
// 通用小组件
// ─────────────────────────────────────────────

/** 行内重命名输入框（Enter 提交 / Esc 取消 / 失焦提交） */
const InlineTitleInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  darkMode: boolean;
  className?: string;
}> = ({ value, onChange, onCommit, onCancel, darkMode, className }) => {
  const skipBlurRef = useRef(false);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          skipBlurRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        onCommit();
      }}
      className={cn(
        'w-full min-w-0 px-2 py-0.5 rounded-md border text-xs font-medium outline-none focus:ring-1 focus:ring-amber-500/60',
        darkMode ? 'bg-slate-950 border-amber-500/60 text-slate-100' : 'bg-white border-amber-500 text-slate-900',
        className,
      )}
    />
  );
};

/** 节点行内操作按钮组（hover 才显示，避免树太吵） */
const NodeActions: React.FC<{
  darkMode: boolean;
  canAddChild?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAddChild?: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}> = ({ darkMode, canAddChild, canMoveUp, canMoveDown, onAddChild, onRename, onDuplicate, onMove, onDelete }) => {
  const base = cn(
    'p-1 rounded-md border transition-colors',
    darkMode
      ? 'border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800'
      : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100',
  );
  const disabled = 'opacity-25 cursor-not-allowed pointer-events-none';
  return (
    <div
      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      {canAddChild && onAddChild && (
        <button type="button" title="新增下级" className={base} onClick={onAddChild}>
          <Plus className="w-3 h-3" />
        </button>
      )}
      <button type="button" title="重命名" className={base} onClick={onRename}>
        <Pencil className="w-3 h-3" />
      </button>
      <button type="button" title="复制（含下级）" className={base} onClick={onDuplicate}>
        <Copy className="w-3 h-3" />
      </button>
      <button
        type="button"
        title="上移"
        className={cn(base, !canMoveUp && disabled)}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="w-3 h-3" />
      </button>
      <button
        type="button"
        title="下移"
        className={cn(base, !canMoveDown && disabled)}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="w-3 h-3" />
      </button>
      <button
        type="button"
        title="删除（级联）"
        className={cn(
          base,
          'hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/40',
        )}
        onClick={onDelete}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};

/** 弹窗外壳 */
const Dialog: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  darkMode: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}> = ({ title, subtitle, icon, darkMode, onClose, children, footer, maxWidth = 'max-w-lg' }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
    onClick={onClose}
  >
    <div
      className={cn(
        'w-full rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95',
        maxWidth,
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          'px-5 py-3.5 border-b flex items-start justify-between gap-3',
          darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50',
        )}
      >
        <div className="flex items-start gap-2.5">
          {icon && <div className="mt-0.5 text-amber-400">{icon}</div>}
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'p-1 rounded-lg transition-colors',
            darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200',
          )}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div
          className={cn(
            'px-5 py-3 border-t flex items-center justify-end gap-2',
            darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────

export interface CurriculumOutlineStudioProps {
  stages: Stage[];
  onChangeStages: (next: Stage[]) => void;
  selectedLesson: LessonStep;
  onSelectLesson: (lesson: LessonStep) => void;
  onChangeLesson: (lesson: LessonStep) => void;
  darkMode: boolean;
  /** 视频库（用于「课时 ↔ 教学视频」多对多关联与悬空引用校验） */
  videoLibrary?: TeachingVideo[];
  /** 和弦练习组（用于「课时 ↔ 和弦组」关联与悬空引用校验） */
  chordGroups?: ChordGroup[];
  /** 跳到「教学视频库」页去做视频增删改 */
  onGoToVideoStudio?: () => void;
  /** 跳到「和弦微测与 BPM 阶梯」页去配置练习阶段 */
  onGoToChordStudio?: () => void;
}

export const CurriculumOutlineStudio: React.FC<CurriculumOutlineStudioProps> = ({
  stages,
  onChangeStages,
  selectedLesson,
  onSelectLesson,
  onChangeLesson,
  darkMode,
  videoLibrary = [],
  chordGroups = [],
  onGoToVideoStudio,
  onGoToChordStudio,
}) => {
  // ── 展开状态 ───────────────────────────────
  const [expanded, setExpanded] = useState<{ stages: string[]; courses: string[]; chapters: string[] }>(() => ({
    stages: stages[0] ? [stages[0].id] : [],
    courses: stages[0]?.courses[0] ? [stages[0].courses[0].id] : [],
    chapters: stages[0]?.courses[0]?.chapters[0] ? [stages[0].courses[0].chapters[0].id] : [],
  }));

  const toggle = (group: 'stages' | 'courses' | 'chapters', id: string) =>
    setExpanded((prev) => ({
      ...prev,
      [group]: prev[group].includes(id) ? prev[group].filter((x) => x !== id) : [...prev[group], id],
    }));

  const collapseAll = () => setExpanded({ stages: [], courses: [], chapters: [] });
  const expandAll = () =>
    setExpanded({
      stages: stages.map((s) => s.id),
      courses: stages.flatMap((s) => s.courses.map((c) => c.id)),
      chapters: stages.flatMap((s) => s.courses.flatMap((c) => c.chapters.map((ch) => ch.id))),
    });

  /** 选中课时（可能来自顶部头部选择器）→ 自动展开祖先，保证树里能看到它 */
  useEffect(() => {
    const loc = locateNode(stages, 'lesson', selectedLesson.id);
    if (!loc) return;
    setExpanded((prev) => {
      const nextStages = prev.stages.includes(loc.stageId) ? prev.stages : [...prev.stages, loc.stageId];
      const nextCourses =
        loc.courseId && !prev.courses.includes(loc.courseId) ? [...prev.courses, loc.courseId] : prev.courses;
      const nextChapters =
        loc.chapterId && !prev.chapters.includes(loc.chapterId)
          ? [...prev.chapters, loc.chapterId]
          : prev.chapters;
      if (nextStages === prev.stages && nextCourses === prev.courses && nextChapters === prev.chapters) {
        return prev;
      }
      return { stages: nextStages, courses: nextCourses, chapters: nextChapters };
    });
  }, [selectedLesson.id, stages]);

  // ── 弹窗状态 ───────────────────────────────
  const [addForm, setAddForm] = useState<AddForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newCustomModule, setNewCustomModule] = useState<{ name: string; minutes: number } | null>(null);

  // ── 查找辅助 ───────────────────────────────
  const findCourse = (id: string | null): Course | undefined =>
    id ? stages.flatMap((s) => s.courses).find((c) => c.id === id) : undefined;
  const findChapter = (id: string | null): Chapter | undefined =>
    id ? stages.flatMap((s) => s.courses.flatMap((c) => c.chapters)).find((ch) => ch.id === id) : undefined;

  // ── 增删改查操作 ───────────────────────────
  const patchNode = (level: CurriculumLevel, id: string, patch: Record<string, unknown>) =>
    onChangeStages(updateNode(stages, level, id, patch));

  const startRename = (level: CurriculumLevel, id: string, current: string) => {
    setEditing({ level, id });
    setEditingValue(current);
  };

  const commitRename = () => {
    if (!editing) return;
    const value = editingValue.trim();
    if (value) {
      patchNode(editing.level, editing.id, editing.level === 'stage' ? { name: value } : { title: value });
    }
    setEditing(null);
  };

  const openAdd = (level: CurriculumLevel, parentId: string | null, parentLabel: string) =>
    setAddForm({ level, parentId, parentLabel, name: '', lessonType: 'video' });

  const confirmAdd = () => {
    if (!addForm) return;
    const { level, parentId } = addForm;
    const name = addForm.name.trim();

    if (level === 'stage') {
      const created = createStage(stages, name || undefined);
      onChangeStages(addNode(stages, 'stage', null, created));
      setExpanded((prev) => ({ ...prev, stages: [...prev.stages, created.id] }));
    } else if (level === 'course') {
      const created = createCourse(name || undefined);
      onChangeStages(addNode(stages, 'course', parentId, created));
      setExpanded((prev) => ({ ...prev, courses: [...prev.courses, created.id] }));
    } else if (level === 'chapter') {
      const order = (findCourse(parentId)?.chapters.length ?? 0) + 1;
      const created = createChapter(order, name || undefined);
      onChangeStages(addNode(stages, 'chapter', parentId, created));
      setExpanded((prev) => ({ ...prev, chapters: [...prev.chapters, created.id] }));
    } else {
      const order = (findChapter(parentId)?.lessons.length ?? 0) + 1;
      const created = { ...createLesson(order, addForm.lessonType) };
      if (name) created.title = name;
      onChangeStages(addNode(stages, 'lesson', parentId, created));
      onSelectLesson(created);
    }
    setAddForm(null);
  };

  const handleDuplicate = (level: CurriculumLevel, id: string) => {
    const result = duplicateNode(stages, level, id);
    if (!result.newId) return;
    onChangeStages(result.stages);
    if (level === 'lesson') {
      const found = flattenLessons(result.stages).find((f) => f.lesson.id === result.newId);
      if (found) onSelectLesson(found.lesson);
    } else if (level === 'stage') {
      setExpanded((prev) => ({ ...prev, stages: [...prev.stages, result.newId as string] }));
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const next = removeNode(stages, deleteTarget.level, deleteTarget.id);
    onChangeStages(next);
    setDeleteTarget(null);
    const stillThere = flattenLessons(next).some((f) => f.lesson.id === selectedLesson.id);
    if (!stillThere) {
      const first = flattenLessons(next)[0];
      if (first) onSelectLesson(first.lesson);
    }
  };

  const moveBounds = (level: CurriculumLevel, id: string) => {
    const found = siblingsOf(stages, level, id);
    if (!found) return { up: false, down: false };
    return { up: found.index > 0, down: found.index < found.list.length - 1 };
  };

  const focusNode = (id: string, level: CurriculumLevel) => {
    for (const stage of stages) {
      if (level === 'stage' && stage.id === id) {
        setExpanded((prev) => ({ ...prev, stages: [...new Set([...prev.stages, stage.id])] }));
        return;
      }
      for (const course of stage.courses) {
        if (level === 'course' && course.id === id) {
          setExpanded((prev) => ({
            stages: [...new Set([...prev.stages, stage.id])],
            courses: [...new Set([...prev.courses, course.id])],
            chapters: prev.chapters,
          }));
          return;
        }
        for (const chapter of course.chapters) {
          if (level === 'chapter' && chapter.id === id) {
            setExpanded((prev) => ({
              stages: [...new Set([...prev.stages, stage.id])],
              courses: [...new Set([...prev.courses, course.id])],
              chapters: [...new Set([...prev.chapters, chapter.id])],
            }));
            return;
          }
          if (level === 'lesson' && chapter.lessons.some((l) => l.id === id)) {
            setExpanded((prev) => ({
              stages: [...new Set([...prev.stages, stage.id])],
              courses: [...new Set([...prev.courses, course.id])],
              chapters: [...new Set([...prev.chapters, chapter.id])],
            }));
            const lesson = chapter.lessons.find((l) => l.id === id);
            if (lesson) onSelectLesson(lesson);
            return;
          }
        }
      }
    }
  };

  // ── 20 分钟切片 ────────────────────────────
  const modules = toTimeModules(selectedLesson);
  const customModules = modules.filter((m) => m.custom);
  const totalMinutes = totalAllocationMinutes(selectedLesson.timeAllocation);
  const golden = isGoldenAllocation(selectedLesson.timeAllocation);
  const extraCustomMinutes = customMinutes(selectedLesson);
  const barTotal = Math.max(totalMinutes + extraCustomMinutes, 1);

  const applyBuiltinMinutes = (key: string, value: number) =>
    onChangeLesson({
      ...selectedLesson,
      timeAllocation: setBuiltinMinutes(selectedLesson.timeAllocation, key as BuiltinTimeKey, value),
    });

  const writeCustomModules = (list: TimeModule[]) =>
    onChangeLesson({ ...selectedLesson, timeModules: list.filter((m) => m.custom) });

  const addCustomModule = () => {
    if (!newCustomModule || !newCustomModule.name.trim()) return;
    const minutes = Math.max(0, Math.round(Number(newCustomModule.minutes) || 0));
    writeCustomModules([
      ...customModules,
      {
        key: `custom-${Date.now().toString(36)}`,
        name: newCustomModule.name.trim(),
        minutes,
        defaultMin: minutes,
        color: 'bg-rose-500',
        textCol: 'text-rose-400',
        desc: '教研自定义模块（不参与黄金 20 分钟配平校验）',
        custom: true,
      },
    ]);
    setNewCustomModule(null);
  };

  // ── 课时资源关联 ───────────────────────────
  const linkedVideoIds = selectedLesson.videoIds || [];
  const linkedGroupIds = selectedLesson.chordGroupIds || [];

  const toggleVideo = (videoId: string) =>
    onChangeLesson({
      ...selectedLesson,
      videoIds: linkedVideoIds.includes(videoId)
        ? linkedVideoIds.filter((id) => id !== videoId)
        : [...linkedVideoIds, videoId],
    });

  const toggleChordGroup = (groupId: string) =>
    onChangeLesson({
      ...selectedLesson,
      chordGroupIds: linkedGroupIds.includes(groupId)
        ? linkedGroupIds.filter((id) => id !== groupId)
        : [...linkedGroupIds, groupId],
    });

  const legacyVideoId = selectedLesson.videoData?.videoId || '';
  const danglingVideoIds = linkedVideoIds.filter((id) => !videoLibrary.some((v) => v.id === id));
  const danglingGroupIds = linkedGroupIds.filter((id) => !chordGroups.some((g) => g.id === id));

  const firstLinkedGroup = chordGroups.find((g) => linkedGroupIds.includes(g.id));
  const pairPreview =
    firstLinkedGroup && firstLinkedGroup.chordKeys.length >= 2
      ? {
          group: firstLinkedGroup,
          from: firstLinkedGroup.chordKeys[0],
          to: firstLinkedGroup.chordKeys[1],
          ...resolveStagesForPair(firstLinkedGroup, firstLinkedGroup.chordKeys[0], firstLinkedGroup.chordKeys[1]),
        }
      : null;

  // ── 全体系校验 ─────────────────────────────
  const warnings = useMemo(
    () =>
      validateCurriculum(stages, {
        videoIds: videoLibrary.map((v) => v.id),
        chordGroupIds: chordGroups.map((g) => g.id),
      }),
    [stages, videoLibrary, chordGroups],
  );
  const errorCount = warnings.filter((w) => w.level === 'error').length;
  const warnCount = warnings.filter((w) => w.level === 'warn').length;
  const infoCount = warnings.filter((w) => w.level === 'info').length;
  const lessonWarnings = warnings.filter((w) => w.nodeId === selectedLesson.id);

  const stats = useMemo(() => {
    const courseCount = stages.reduce((n, s) => n + s.courses.length, 0);
    const chapterCount = stages.reduce((n, s) => n + s.courses.reduce((m, c) => m + c.chapters.length, 0), 0);
    return { stages: stages.length, courses: courseCount, chapters: chapterCount, lessons: countLessons(stages) };
  }, [stages]);

  // ── 删除影响范围文案 ───────────────────────
  const describeImpact = (target: DeleteTarget) => {
    const counts = countDescendants(stages, target.level, target.id);
    if (target.level === 'lesson') return { lines: ['1 个课时（含其时间切片、资源关联与练习阶段）'], total: 1 };
    const lines: string[] = [`1 个 ${CURRICULUM_LEVEL_LABEL[target.level]}「${target.title}」`];
    if (counts.courses) lines.push(`${counts.courses} 个专栏课程`);
    if (counts.chapters) lines.push(`${counts.chapters} 个章节`);
    if (counts.lessons) lines.push(`${counts.lessons} 个课时`);
    return { lines, total: 1 + counts.courses + counts.chapters + counts.lessons };
  };

  // ─────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────

  const cardClass = cn(
    'rounded-2xl border transition-all',
    darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
  );
  const fieldClass = cn(
    'px-2.5 py-1.5 rounded-lg border text-xs outline-none focus:ring-1 focus:ring-amber-500/60',
    darkMode ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800',
  );
  const subtleBtn = cn(
    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1',
    darkMode
      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  );
  const primaryBtn =
    'px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1.5 transition-colors';

  return (
    <div id="curriculum-outline-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* 顶部横幅 */}
      <div
        className={cn(
          'px-6 py-3 border-b flex items-center justify-between shrink-0 gap-4',
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <GitFork className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <span>课程体系大纲与 20 分钟时间切片编排器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                5 级教研拓扑树
              </span>
            </h2>
            <p className="text-xs text-slate-400 truncate">
              Stage ➔ Course ➔ Chapter ➔ Lesson ➔ 交互模块编排 · 全部层级支持增删改查 / 拖序 / 复制
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {[
            { label: '阶段', value: stats.stages },
            { label: '课程', value: stats.courses },
            { label: '章节', value: stats.chapters },
            { label: '课时', value: stats.lessons },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1',
                darkMode ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200',
              )}
            >
              <span className="text-slate-500">{item.label}</span>
              <span className="font-bold">{item.value}</span>
            </div>
          ))}

          <div
            className={cn(
              'px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono font-medium',
              golden
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300',
            )}
          >
            {golden ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>当前课时切片 = 20 分钟</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>当前课时 = {totalMinutes} 分钟（需配平）</span>
              </>
            )}
          </div>

          <button
            id="btn-add-stage"
            onClick={() => openAdd('stage', null, '课程体系根节点')}
            className={primaryBtn}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增成长阶段</span>
          </button>
        </div>
      </div>

      {/* 主体：左树 + 右编排 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左：教研拓扑树 */}
        <div
          className={cn(
            'w-[460px] border-r flex flex-col min-h-0 shrink-0',
            darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200',
          )}
        >
          <div
            className={cn(
              'px-4 py-3 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-md',
              darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50/90',
            )}
          >
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              教研体系层级树
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={expandAll} className={subtleBtn}>
                展开全部
              </button>
              <button type="button" onClick={collapseAll} className={subtleBtn}>
                收起
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {stages.length === 0 && (
              <div
                className={cn(
                  'rounded-2xl border border-dashed p-6 text-center text-xs text-slate-400',
                  darkMode ? 'border-slate-700' : 'border-slate-300',
                )}
              >
                课程体系为空 —— 点击右上角「新增成长阶段」开始搭建
              </div>
            )}

            {stages.map((stage) => {
              const isStageOpen = expanded.stages.includes(stage.id);
              const stageBounds = moveBounds('stage', stage.id);
              const renamingStage = editing?.level === 'stage' && editing.id === stage.id;
              return (
                <div
                  key={stage.id}
                  className={cn(
                    'rounded-2xl border transition-all',
                    darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs',
                  )}
                >
                  {/* Stage 行 */}
                  <div
                    className="group p-3 flex items-center justify-between gap-2 cursor-pointer rounded-2xl hover:bg-slate-800/20"
                    onClick={() => !renamingStage && toggle('stages', stage.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isStageOpen ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md font-mono font-bold text-xs border shrink-0',
                          levelAccent.stage,
                        )}
                      >
                        {stage.stageCode}
                      </span>
                      {renamingStage ? (
                        <InlineTitleInput
                          value={editingValue}
                          onChange={setEditingValue}
                          onCommit={commitRename}
                          onCancel={() => setEditing(null)}
                          darkMode={darkMode}
                        />
                      ) : (
                        <>
                          <span className="text-xs font-bold truncate">{stage.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {stage.courses.length} 课程
                          </span>
                        </>
                      )}
                    </div>
                    <NodeActions
                      darkMode={darkMode}
                      canAddChild
                      onAddChild={() => openAdd('course', stage.id, `${stage.stageCode} ${stage.name}`)}
                      canMoveUp={stageBounds.up}
                      canMoveDown={stageBounds.down}
                      onRename={() => startRename('stage', stage.id, stage.name)}
                      onDuplicate={() => handleDuplicate('stage', stage.id)}
                      onMove={(delta) => onChangeStages(moveNode(stages, 'stage', stage.id, delta))}
                      onDelete={() => setDeleteTarget({ level: 'stage', id: stage.id, title: stage.name, step: 1 })}
                    />
                  </div>

                  {isStageOpen && (
                    <div className={cn('px-3 pb-3 pt-1 space-y-2 border-t', darkMode ? 'border-slate-800/60' : 'border-slate-200')}>
                      {!renamingStage && (
                        <button
                          type="button"
                          onClick={() => openAdd('course', stage.id, `${stage.stageCode} ${stage.name}`)}
                          className="w-full px-2 py-1.5 rounded-lg border border-dashed text-[11px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> 新增专栏课程
                        </button>
                      )}

                      {stage.courses.map((course) => {
                        const isCourseOpen = expanded.courses.includes(course.id);
                        const courseBounds = moveBounds('course', course.id);
                        const renamingCourse = editing?.level === 'course' && editing.id === course.id;
                        return (
                          <div
                            key={course.id}
                            className={cn(
                              'rounded-xl border pl-3 pr-2 py-2',
                              darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                            )}
                          >
                            <div
                              className="group flex items-center justify-between gap-2 cursor-pointer"
                              onClick={() => !renamingCourse && toggle('courses', course.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {isCourseOpen ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                {renamingCourse ? (
                                  <InlineTitleInput
                                    value={editingValue}
                                    onChange={setEditingValue}
                                    onCommit={commitRename}
                                    onCancel={() => setEditing(null)}
                                    darkMode={darkMode}
                                  />
                                ) : (
                                  <>
                                    <span className="text-xs font-semibold truncate">{course.title}</span>
                                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                      {course.chapters.length} 章
                                    </span>
                                  </>
                                )}
                              </div>
                              <NodeActions
                                darkMode={darkMode}
                                canAddChild
                                onAddChild={() => openAdd('chapter', course.id, course.title)}
                                canMoveUp={courseBounds.up}
                                canMoveDown={courseBounds.down}
                                onRename={() => startRename('course', course.id, course.title)}
                                onDuplicate={() => handleDuplicate('course', course.id)}
                                onMove={(delta) => onChangeStages(moveNode(stages, 'course', course.id, delta))}
                                onDelete={() =>
                                  setDeleteTarget({ level: 'course', id: course.id, title: course.title, step: 1 })
                                }
                              />
                            </div>

                            {isCourseOpen && (
                              <div className={cn('mt-2 space-y-1.5 pl-3 border-l', darkMode ? 'border-slate-700/60' : 'border-slate-300')}>
                                {course.chapters.map((chap) => {
                                  const isChapOpen = expanded.chapters.includes(chap.id);
                                  const chapBounds = moveBounds('chapter', chap.id);
                                  const renamingChapter = editing?.level === 'chapter' && editing.id === chap.id;
                                  return (
                                    <div key={chap.id} className="space-y-1">
                                      <div
                                        className="group flex items-center justify-between gap-2 py-1 cursor-pointer"
                                        onClick={() => !renamingChapter && toggle('chapters', chap.id)}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          {isChapOpen ? (
                                            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                                          )}
                                          {renamingChapter ? (
                                            <InlineTitleInput
                                              value={editingValue}
                                              onChange={setEditingValue}
                                              onCommit={commitRename}
                                              onCancel={() => setEditing(null)}
                                              darkMode={darkMode}
                                            />
                                          ) : (
                                            <>
                                              <span className="text-xs text-slate-400 truncate">{chap.title}</span>
                                              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                                {chap.lessons.length} 课
                                              </span>
                                            </>
                                          )}
                                        </div>
                                        <NodeActions
                                          darkMode={darkMode}
                                          canAddChild
                                          onAddChild={() => openAdd('lesson', chap.id, chap.title)}
                                          canMoveUp={chapBounds.up}
                                          canMoveDown={chapBounds.down}
                                          onRename={() => startRename('chapter', chap.id, chap.title)}
                                          onDuplicate={() => handleDuplicate('chapter', chap.id)}
                                          onMove={(delta) => onChangeStages(moveNode(stages, 'chapter', chap.id, delta))}
                                          onDelete={() =>
                                            setDeleteTarget({ level: 'chapter', id: chap.id, title: chap.title, step: 1 })
                                          }
                                        />
                                      </div>

                                      {isChapOpen && (
                                        <div className="space-y-1 pl-2">
                                          {chap.lessons.map((lesson) => {
                                            const isSelected = selectedLesson.id === lesson.id;
                                            const lessonBounds = moveBounds('lesson', lesson.id);
                                            const renamingLesson =
                                              editing?.level === 'lesson' && editing.id === lesson.id;
                                            return (
                                              <div
                                                key={lesson.id}
                                                onClick={() => !renamingLesson && onSelectLesson(lesson)}
                                                className={cn(
                                                  'group px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center gap-2 border transition-all',
                                                  isSelected
                                                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                                                    : darkMode
                                                    ? 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100',
                                                )}
                                              >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                  {renamingLesson ? (
                                                    <InlineTitleInput
                                                      value={editingValue}
                                                      onChange={setEditingValue}
                                                      onCommit={commitRename}
                                                      onCancel={() => setEditing(null)}
                                                      darkMode={darkMode}
                                                    />
                                                  ) : (
                                                    <>
                                                      <span className="truncate">{lesson.title}</span>
                                                      <span
                                                        className={cn(
                                                          'text-[10px] font-mono px-1 rounded shrink-0',
                                                          isSelected ? 'bg-black/20' : 'bg-black/20',
                                                        )}
                                                      >
                                                        {LESSON_TYPE_LABEL[lesson.type]}
                                                      </span>
                                                    </>
                                                  )}
                                                </div>
                                                <NodeActions
                                                  darkMode={darkMode}
                                                  canMoveUp={lessonBounds.up}
                                                  canMoveDown={lessonBounds.down}
                                                  onRename={() => startRename('lesson', lesson.id, lesson.title)}
                                                  onDuplicate={() => handleDuplicate('lesson', lesson.id)}
                                                  onMove={(delta) => onChangeStages(moveNode(stages, 'lesson', lesson.id, delta))}
                                                  onDelete={() =>
                                                    setDeleteTarget({
                                                      level: 'lesson',
                                                      id: lesson.id,
                                                      title: lesson.title,
                                                      step: 1,
                                                    })
                                                  }
                                                />
                                              </div>
                                            );
                                          })}
                                          <button
                                            type="button"
                                            onClick={() => openAdd('lesson', chap.id, chap.title)}
                                            className="w-full px-2 py-1 rounded-lg border border-dashed text-[10px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors flex items-center justify-center gap-1"
                                          >
                                            <Plus className="w-3 h-3" /> 新增课时
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                <button
                                  type="button"
                                  onClick={() => openAdd('chapter', course.id, course.title)}
                                  className="w-full px-2 py-1 rounded-lg border border-dashed text-[10px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> 新增章节
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：编排面板 */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* 卡片 1：20 分钟切片 */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-start justify-between mb-4 gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>课时黄金 20 分钟时间切片（全量增删改）</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  正在编辑：<span className="text-amber-400 font-medium">{selectedLesson.title}</span> ·
                  改任一项会把差额按比例分摊到其余模块，合计恒为 20 分钟
                </p>
              </div>
              <div className="text-right font-mono shrink-0">
                <span className={cn('text-2xl font-black', golden ? 'text-emerald-400' : 'text-rose-400')}>
                  {totalMinutes}
                </span>
                <span className="text-xs text-slate-400 ml-1">/ 20 分钟</span>
                {extraCustomMinutes > 0 && (
                  <div className="text-[10px] text-rose-400">+ {extraCustomMinutes}m 自定义（不校验）</div>
                )}
              </div>
            </div>

            {/* 连续切片条 */}
            <div className="h-6 rounded-xl overflow-hidden flex border border-slate-700/60 p-0.5 bg-slate-950 mb-4">
              {modules.map((mod) => {
                const widthPercent = (mod.minutes / barTotal) * 100;
                if (mod.minutes <= 0) return null;
                return (
                  <div
                    key={mod.key}
                    className={cn(mod.color, 'h-full flex items-center justify-center text-[11px] font-bold text-slate-950 overflow-hidden px-1')}
                    style={{ width: `${Math.max(4, widthPercent)}%` }}
                    title={`${mod.name}: ${mod.minutes} 分钟 (${widthPercent.toFixed(1)}%)`}
                  >
                    {widthPercent > 10 && `${mod.minutes}m`}
                  </div>
                );
              })}
            </div>

            {/* 模板 + 配平 */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                一键套用模板：
              </span>
              {TIME_TEMPLATES.map((tpl, index) => (
                <button
                  key={tpl.id}
                  type="button"
                  id={index === 0 ? 'btn-reset-golden-ratio' : undefined}
                  title={tpl.desc}
                  onClick={() => onChangeLesson({ ...selectedLesson, timeAllocation: { ...tpl.allocation } })}
                  className={subtleBtn}
                >
                  {tpl.name}
                </button>
              ))}
              <button
                id="btn-balance-20"
                type="button"
                onClick={() =>
                  onChangeLesson({
                    ...selectedLesson,
                    timeAllocation: balanceAllocation(selectedLesson.timeAllocation),
                  })
                }
                className={subtleBtn}
              >
                一键配平到 20m
              </button>
            </div>

            {/* 5 个内置模块卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {modules
                .filter((m) => !m.custom)
                .map((mod) => (
                  <div
                    key={mod.key}
                    className={cn(
                      'p-3.5 rounded-xl border flex flex-col justify-between',
                      darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-bold', mod.textCol)}>{mod.name.split(' ')[0]}</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={mod.minutes}
                          onChange={(e) => applyBuiltinMinutes(mod.key, parseInt(e.target.value, 10) || 0)}
                          className={cn(fieldClass, 'w-14 text-center font-mono font-bold py-0.5')}
                        />
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 h-8">{mod.desc}</div>
                    </div>

                    <div className="mt-3">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={mod.minutes}
                        onChange={(e) => applyBuiltinMinutes(mod.key, parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-0.5">
                        <span>0m</span>
                        <button
                          type="button"
                          onClick={() => applyBuiltinMinutes(mod.key, mod.defaultMin)}
                          className="hover:text-amber-400"
                        >
                          标配 {mod.defaultMin}m
                        </button>
                        <span>20m</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* 自定义模块 */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5 text-rose-400">
                  <ListChecks className="w-3.5 h-3.5" />
                  教研自定义模块（增删改 · 独立于黄金 20 分钟）
                </span>
                {newCustomModule === null && (
                  <button
                    type="button"
                    onClick={() => setNewCustomModule({ name: '', minutes: 3 })}
                    className={subtleBtn}
                  >
                    <Plus className="w-3 h-3" /> 新增自定义模块
                  </button>
                )}
              </div>

              {newCustomModule && (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    autoFocus
                    placeholder="模块名称，如「节奏跟拍」"
                    value={newCustomModule.name}
                    onChange={(e) => setNewCustomModule({ ...newCustomModule, name: e.target.value })}
                    className={cn(fieldClass, 'flex-1')}
                  />
                  <input
                    type="number"
                    min={0}
                    value={newCustomModule.minutes}
                    onChange={(e) =>
                      setNewCustomModule({ ...newCustomModule, minutes: parseInt(e.target.value, 10) || 0 })
                    }
                    className={cn(fieldClass, 'w-20 text-center font-mono')}
                  />
                  <button type="button" onClick={addCustomModule} className={primaryBtn}>
                    添加
                  </button>
                  <button type="button" onClick={() => setNewCustomModule(null)} className={subtleBtn}>
                    取消
                  </button>
                </div>
              )}

              {customModules.length === 0 && !newCustomModule && (
                <p className="text-[11px] text-slate-500">暂无自定义模块。</p>
              )}

              <div className="space-y-2">
                {customModules.map((mod) => (
                  <div
                    key={mod.key}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-xl border',
                      darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                    )}
                  >
                    <span className={cn('w-2.5 h-2.5 rounded-full', mod.color)} />
                    <input
                      value={mod.name}
                      onChange={(e) =>
                        writeCustomModules(
                          customModules.map((m) => (m.key === mod.key ? { ...m, name: e.target.value } : m)),
                        )
                      }
                      className={cn(fieldClass, 'flex-1')}
                    />
                    <input
                      type="number"
                      min={0}
                      value={mod.minutes}
                      onChange={(e) =>
                        writeCustomModules(
                          customModules.map((m) =>
                            m.key === mod.key ? { ...m, minutes: parseInt(e.target.value, 10) || 0 } : m,
                          ),
                        )
                      }
                      className={cn(fieldClass, 'w-20 text-center font-mono')}
                    />
                    <span className="text-[10px] text-slate-500">分钟</span>
                    <button
                      type="button"
                      onClick={() => writeCustomModules(customModules.filter((m) => m.key !== mod.key))}
                      className={cn(subtleBtn, 'hover:text-rose-400 hover:border-rose-500/40')}
                    >
                      <Trash2 className="w-3 h-3" /> 删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 卡片 2：课时资源关联 */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-sky-400" />
                  <span>课时资源关联（教学视频 / 和弦练习组 多对多）</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  一个课时可以挂多个教学视频与多个和弦练习组，C 端按顺序解锁播放
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedLesson.type}
                  onChange={(e) =>
                    onChangeLesson({ ...selectedLesson, type: e.target.value as LessonStep['type'] })
                  }
                  className={fieldClass}
                >
                  {LESSON_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {onGoToVideoStudio && (
                  <button type="button" onClick={onGoToVideoStudio} className={subtleBtn}>
                    <Tv className="w-3 h-3" /> 视频库
                  </button>
                )}
                {onGoToChordStudio && (
                  <button type="button" onClick={onGoToChordStudio} className={subtleBtn}>
                    <Music4 className="w-3 h-3" /> 和弦阶梯
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 教学视频 */}
              <div
                className={cn(
                  'p-3.5 rounded-xl border',
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5" /> 关联教学视频（{linkedVideoIds.length}）
                  </span>
                  {legacyVideoId && (
                    <span className="text-[10px] font-mono text-slate-500">旧字段 videoData: {legacyVideoId}</span>
                  )}
                </div>

                {videoLibrary.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    视频库为空 —— 到「教学视频库」页面先创建教学视频，这里就能勾选关联。
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                    {videoLibrary.map((video) => {
                      const checked = linkedVideoIds.includes(video.id);
                      return (
                        <label
                          key={video.id}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs border transition-colors',
                            checked
                              ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                              : darkMode
                              ? 'border-transparent hover:bg-slate-800/60 text-slate-300'
                              : 'border-transparent hover:bg-slate-100 text-slate-600',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleVideo(video.id)}
                            className="accent-sky-500"
                          />
                          <span className="truncate flex-1">{video.title}</span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {video.durationSec}s · {video.status}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {danglingVideoIds.length > 0 && (
                  <p className="mt-2 text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    有 {danglingVideoIds.length} 个关联视频已不存在，请重新勾选
                  </p>
                )}
              </div>

              {/* 和弦练习组 */}
              <div
                className={cn(
                  'p-3.5 rounded-xl border',
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                )}
              >
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-2">
                  <Music4 className="w-3.5 h-3.5" /> 关联和弦练习组（{linkedGroupIds.length}）
                </span>

                {chordGroups.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    和弦组为空 —— 到「和弦微测与 BPM 阶梯配置器」创建和弦练习组。
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                    {chordGroups.map((group) => {
                      const checked = linkedGroupIds.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs border transition-colors',
                            checked
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                              : darkMode
                              ? 'border-transparent hover:bg-slate-800/60 text-slate-300'
                              : 'border-transparent hover:bg-slate-100 text-slate-600',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChordGroup(group.id)}
                            className="accent-amber-500"
                          />
                          <span className="truncate flex-1">{group.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {group.chordKeys.join('-')} · {group.stages.length} 阶段
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {pairPreview && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-amber-400" />
                      BPM 阶梯预览：{pairPreview.from} → {pairPreview.to}
                      {pairPreview.overridden && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                          单对覆盖
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pairPreview.stages.map((s) => (
                        <span
                          key={s.id}
                          className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700"
                        >
                          {s.order}. {s.startBpm}→{s.targetBpm} BPM · {s.passBars} 小节
                        </span>
                      ))}
                      {pairPreview.stages.length === 0 && (
                        <span className="text-[10px] text-slate-500">该和弦组还没有配置练习阶段</span>
                      )}
                    </div>
                  </div>
                )}

                {danglingGroupIds.length > 0 && (
                  <p className="mt-2 text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    有 {danglingGroupIds.length} 个关联和弦组已不存在，请重新勾选
                  </p>
                )}
              </div>
            </div>

            {lessonWarnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {lessonWarnings.map((w, i) => (
                  <div
                    key={`${w.code}-${i}`}
                    className={cn(
                      'text-[11px] px-2 py-1.5 rounded-lg border flex items-center gap-1.5',
                      w.level === 'error'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        : w.level === 'warn'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-slate-700 bg-slate-800/50 text-slate-400',
                    )}
                  >
                    {w.level === 'info' ? <Info className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 卡片 3：依赖解锁规则引擎 */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>模块前后依赖解锁规则引擎</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  卡点引擎：防止学员跳过校音或和弦微测直接对拍，保障教研教学闭环
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                <Zap className="w-3.5 h-3.5" />
                <span>实时校验策略生效中</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 规则 1 */}
              <div
                className={cn(
                  'p-4 rounded-xl border flex flex-col justify-between',
                  selectedLesson.prerequisite.linearUnlocked
                    ? darkMode
                      ? 'bg-indigo-950/20 border-indigo-500/40'
                      : 'bg-indigo-50/50 border-indigo-200'
                    : darkMode
                    ? 'bg-slate-950/40 border-slate-800'
                    : 'bg-slate-100 border-slate-200',
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-400">严格线性顺序推进</span>
                    <button
                      id="btn-toggle-linear-progression"
                      type="button"
                      onClick={() =>
                        onChangeLesson({
                          ...selectedLesson,
                          prerequisite: {
                            ...selectedLesson.prerequisite,
                            linearUnlocked: !selectedLesson.prerequisite.linearUnlocked,
                          },
                        })
                      }
                      className={cn(
                        'p-1.5 rounded-lg border transition-colors',
                        selectedLesson.prerequisite.linearUnlocked
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400',
                      )}
                    >
                      {selectedLesson.prerequisite.linearUnlocked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    开启后，学员必须依次通过：校音 ➔ 视频 ➔ 微测 ➔ 冲刺，方可解锁最终的曲目六线谱对拍模块。
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-mono text-indigo-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {selectedLesson.prerequisite.linearUnlocked ? '已开启强制线性门禁' : '自由浏览模式'}
                  </span>
                </div>
              </div>

              {/* 规则 2 */}
              <div
                className={cn(
                  'p-4 rounded-xl border flex flex-col justify-between',
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-400">AI 听音评分卡点</span>
                    <span className="text-sm font-black font-mono text-amber-400">
                      {selectedLesson.prerequisite.minAiScore} 分
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    和弦微测与转换冲刺中，音频 DSP 实时采音评分低于此阈值不允许通关。
                  </p>
                </div>
                <div>
                  <input
                    type="range"
                    min="60"
                    max="100"
                    step="5"
                    value={selectedLesson.prerequisite.minAiScore}
                    onChange={(e) =>
                      onChangeLesson({
                        ...selectedLesson,
                        prerequisite: {
                          ...selectedLesson.prerequisite,
                          minAiScore: parseInt(e.target.value, 10),
                        },
                      })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>60分 (宽容)</span>
                    <span>80分 (标准)</span>
                    <span>100分 (严苛)</span>
                  </div>
                </div>
              </div>

              {/* 规则 3 */}
              <div
                className={cn(
                  'p-4 rounded-xl border flex flex-col justify-between',
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-sky-400">视频完播率防刷</span>
                    <span className="text-sm font-black font-mono text-sky-400">
                      ≥ {selectedLesson.prerequisite.minVideoWatchRate}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    心跳包探测播放器有效停留时长，禁止快进跳跃与倍速空放。
                  </p>
                </div>
                <div>
                  <input
                    type="range"
                    min="80"
                    max="100"
                    step="1"
                    value={selectedLesson.prerequisite.minVideoWatchRate}
                    onChange={(e) =>
                      onChangeLesson({
                        ...selectedLesson,
                        prerequisite: {
                          ...selectedLesson.prerequisite,
                          minVideoWatchRate: parseInt(e.target.value, 10),
                        },
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>80%</span>
                    <span>95% (推荐)</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 卡片 4：全体系体检 */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-rose-400" />
                  <span>全体系体检报告（课程大纲 ↔ 视频库 ↔ 和弦组 一致性）</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  发布前先清掉 error：切片不等于 20 分钟、编码重复、关联了已删除的视频/和弦组
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  error {errorCount}
                </span>
                <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  warn {warnCount}
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-500/15 text-slate-300 border border-slate-500/30">
                  info {infoCount}
                </span>
              </div>
            </div>

            {warnings.length === 0 ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> 全体系无告警，可以发布。
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5">
                {warnings.map((w, i) => (
                  <button
                    key={`${w.code}-${w.nodeId ?? 'global'}-${i}`}
                    type="button"
                    disabled={!w.nodeId || !w.nodeLevel}
                    onClick={() => w.nodeId && w.nodeLevel && focusNode(w.nodeId, w.nodeLevel)}
                    className={cn(
                      'w-full text-left text-[11px] px-2.5 py-2 rounded-lg border flex items-center gap-2 transition-colors',
                      w.level === 'error'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        : w.level === 'warn'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : darkMode
                        ? 'border-slate-700 bg-slate-800/50 text-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-500',
                      w.nodeId ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
                    )}
                  >
                    {w.level === 'info' ? <Info className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
                    <span className="truncate flex-1">{w.message}</span>
                    {w.nodeLevel && (
                      <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0', levelAccent[w.nodeLevel])}>
                        {CURRICULUM_LEVEL_LABEL[w.nodeLevel]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 弹窗：新增节点 ───────────────────── */}
      {addForm && (
        <Dialog
          title={`新增${CHILD_TITLE_PREFIX[addForm.level]}`}
          subtitle={`归属：${addForm.parentLabel}`}
          icon={<Plus className="w-4 h-4" />}
          darkMode={darkMode}
          onClose={() => setAddForm(null)}
          footer={
            <>
              <button type="button" onClick={() => setAddForm(null)} className={subtleBtn}>
                取消
              </button>
              <button type="button" onClick={confirmAdd} className={primaryBtn}>
                <Plus className="w-3.5 h-3.5" /> 创建
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                {addForm.level === 'stage' ? '阶段名称' : addForm.level === 'lesson' ? '课时标题' : '标题'}
              </label>
              <input
                autoFocus
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
                placeholder={`留空则使用默认：「${CHILD_TITLE_PREFIX[addForm.level]}」`}
                className={cn(fieldClass, 'w-full')}
              />
            </div>

            {addForm.level === 'lesson' && (
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">课时类型</label>
                <select
                  value={addForm.lessonType}
                  onChange={(e) =>
                    setAddForm({ ...addForm, lessonType: e.target.value as LessonStep['type'] })
                  }
                  className={cn(fieldClass, 'w-full')}
                >
                  {LESSON_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  新课时默认套用黄金 20 分钟切片（3+6+4+4+3），可创建后在右侧调整。
                </p>
              </div>
            )}

            {addForm.level === 'stage' && (
              <p className="text-[11px] text-slate-500">
                阶段编码会自动取下一个未占用编码（L1 ~ L9）。
              </p>
            )}
          </div>
        </Dialog>
      )}

      {/* ── 弹窗：删除（级联 + 二次确认）────── */}
      {deleteTarget && (
        <Dialog
          title={deleteTarget.step === 1 ? '删除确认（第 1 步 / 共 2 步）' : '最后确认（第 2 步 / 共 2 步）'}
          subtitle={`目标：${CURRICULUM_LEVEL_LABEL[deleteTarget.level]}「${deleteTarget.title}」`}
          icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
          darkMode={darkMode}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleteTarget(null)} className={subtleBtn}>
                取消
              </button>
              {deleteTarget.step === 1 ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ ...deleteTarget, step: 2 })}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  我了解影响范围，继续
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 确认永久删除
                </button>
              )}
            </>
          }
        >
          {(() => {
            const impact = describeImpact(deleteTarget);
            return (
              <div className="space-y-3">
                <div
                  className={cn(
                    'p-3.5 rounded-xl border',
                    darkMode ? 'bg-rose-950/20 border-rose-500/40' : 'bg-rose-50 border-rose-200',
                  )}
                >
                  <p className="text-xs font-bold text-rose-300 mb-2">
                    级联删除范围：共 {impact.total} 个节点
                  </p>
                  <ul className="space-y-1">
                    {impact.lines.map((line) => (
                      <li key={line} className="text-[11px] text-rose-200/90 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-rose-400" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                {deleteTarget.step === 1 ? (
                  <p className="text-[11px] text-slate-400">
                    下一步还会再确认一次。删除后无法撤销（可在浏览器本地缓存被覆盖前用「复制」保留副本）。
                  </p>
                ) : (
                  <p className="text-[11px] text-rose-300 font-medium">
                    这是最后一次确认 —— 点击「确认永久删除」后数据立即从课程体系中移除。
                  </p>
                )}
              </div>
            );
          })()}
        </Dialog>
      )}
    </div>
  );
};
