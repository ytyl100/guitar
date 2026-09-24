import React, { useState } from 'react';
import {
  GitFork,
  Clock,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Sliders,
  Plus,
  BookOpen,
  Lock,
  Unlock,
  Tv,
  Check,
  Zap,
} from 'lucide-react';
import { Stage, LessonStep } from '../../types';

interface CurriculumOutlineStudioProps {
  stages: Stage[];
  onChangeStages: (newStages: Stage[]) => void;
  selectedLesson: LessonStep;
  onSelectLesson: (lesson: LessonStep) => void;
  onChangeLesson: (updatedLesson: LessonStep) => void;
  darkMode: boolean;
}

export const CurriculumOutlineStudio: React.FC<CurriculumOutlineStudioProps> = ({
  stages,
  onChangeStages,
  selectedLesson,
  onSelectLesson,
  onChangeLesson,
  darkMode,
}) => {
  // Tree expansion state
  const [expandedStageIds, setExpandedStageIds] = useState<string[]>(['stage-l1']);
  const [expandedCourseIds, setExpandedCourseIds] = useState<string[]>(['course-c101']);
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[]>(['chap-101-1']);

  // Calculate 20-minute slice sum
  const timeAlloc = selectedLesson.timeAllocation;
  const totalMinutes =
    timeAlloc.tuningMin +
    timeAlloc.videoMin +
    timeAlloc.quizMin +
    timeAlloc.drillMin +
    timeAlloc.songMin;
  const isGolden20Min = totalMinutes === 20;

  const toggleExpand = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    if (list.includes(id)) {
      setList(list.filter((item) => item !== id));
    } else {
      setList([...list, id]);
    }
  };

  // Reset to default golden 20-min standard (3 + 6 + 4 + 4 + 3)
  const handleResetGoldenSlice = () => {
    onChangeLesson({
      ...selectedLesson,
      timeAllocation: {
        tuningMin: 3,
        videoMin: 6,
        quizMin: 4,
        drillMin: 4,
        songMin: 3,
      },
    });
  };

  // 5 standard interactive modules for each lesson
  const interactiveModules = [
    { key: 'tuningMin', name: '琴头校音 (Tuning)', defaultMin: 3, color: 'bg-emerald-500', textCol: 'text-emerald-400', desc: '440Hz高精度频闪校音，消除弦准偏差' },
    { key: 'videoMin', name: '视频精讲 (Master Video)', defaultMin: 6, color: 'bg-sky-500', textCol: 'text-sky-400', desc: '名师4K手型特写与防哑音核心力矩讲解' },
    { key: 'quizMin', name: '和弦微测 (Chord Quiz)', defaultMin: 4, color: 'bg-amber-500', textCol: 'text-amber-400', desc: '单和弦6根弦独立听音纯度与杂音检测' },
    { key: 'drillMin', name: '转换冲刺 (Pair Drill)', defaultMin: 4, color: 'bg-indigo-500', textCol: 'text-indigo-400', desc: '双和弦BPM阶梯对拍换把肌肉记忆建立' },
    { key: 'songMin', name: '曲目对拍 (Song Alignment)', defaultMin: 3, color: 'bg-purple-500', textCol: 'text-purple-400', desc: '带原声音轨六线谱全速对拍通关实战' },
  ];

  return (
    <div id="curriculum-outline-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner */}
      <div
        className={`px-6 py-3 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>课程体系大纲与 20 分钟时间切片编排器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                5 级教研拓扑树
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Stage 成长阶段 ➔ Course 专栏课程 ➔ Chapter 章节 ➔ Lesson Step 课时 ➔ 交互模块编排
            </p>
          </div>
        </div>

        {/* Golden 20-minute status badge */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono font-medium ${
              isGolden20Min
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}
          >
            {isGolden20Min ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>黄金切片校验: 严格符合 20 分钟 (1200s)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>当前分配总计: {totalMinutes} 分钟 (需配平至 20m)</span>
              </>
            )}
          </div>

          <button
            id="btn-reset-golden-ratio"
            onClick={handleResetGoldenSlice}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>恢复黄金 3+6+4+4+3 配比</span>
          </button>
        </div>
      </div>

      {/* Main Content: Left Topology Tree (40%), Right Slices & Rule Engine (60%) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: 5-Level Topology Tree */}
        <div
          className={`w-[420px] border-r flex flex-col min-h-0 overflow-y-auto custom-scrollbar shrink-0 ${
            darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="p-4 border-b border-inherit flex items-center justify-between sticky top-0 backdrop-blur-md z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              教研体系层级树 (Curriculum Topology)
            </span>
            <span className="text-[11px] text-slate-500">点击选中课时进行切片编排</span>
          </div>

          <div className="p-3 space-y-2">
            {stages.map((stage) => {
              const isStageOpen = expandedStageIds.includes(stage.id);
              return (
                <div
                  key={stage.id}
                  className={`rounded-2xl border transition-all ${
                    darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {/* Stage Level */}
                  <div
                    onClick={() => toggleExpand(expandedStageIds, setExpandedStageIds, stage.id)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/20 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        {stage.stageCode}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{stage.name}</span>
                    </div>
                    {isStageOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {/* Courses inside Stage */}
                  {isStageOpen && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-inherit/60">
                      {stage.courses.map((course) => {
                        const isCourseOpen = expandedCourseIds.includes(course.id);
                        return (
                          <div
                            key={course.id}
                            className={`rounded-xl border pl-3 pr-2 py-2 ${
                              darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div
                              onClick={() => toggleExpand(expandedCourseIds, setExpandedCourseIds, course.id)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs font-semibold text-slate-300">{course.title}</span>
                              </div>
                              {isCourseOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            </div>

                            {/* Chapters inside Course */}
                            {isCourseOpen && (
                              <div className="mt-2 space-y-1.5 pl-3 border-l border-slate-700/60">
                                {course.chapters.map((chap) => {
                                  const isChapOpen = expandedChapterIds.includes(chap.id);
                                  return (
                                    <div key={chap.id} className="space-y-1">
                                      <div
                                        onClick={() => toggleExpand(expandedChapterIds, setExpandedChapterIds, chap.id)}
                                        className="flex items-center justify-between py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                                      >
                                        <span className="truncate">{chap.title}</span>
                                        {isChapOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                                      </div>

                                      {/* Lessons inside Chapter */}
                                      {isChapOpen && (
                                        <div className="space-y-1 pl-2">
                                          {chap.lessons.map((lesson) => {
                                            const isSelected = selectedLesson.id === lesson.id;
                                            return (
                                              <div
                                                key={lesson.id}
                                                onClick={() => onSelectLesson(lesson)}
                                                className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between border transition-all ${
                                                  isSelected
                                                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                                                    : darkMode
                                                    ? 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}
                                              >
                                                <span className="truncate">{lesson.title}</span>
                                                <span className="text-[10px] font-mono px-1 rounded bg-black/20">
                                                  20m
                                                </span>
                                              </div>
                                            );
                                          })}
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
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: 20-min Slices Visualizer & Unlock Rules Engine */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Card 1: Visual 20-Minute Golden Time-Slice Allocator */}
          <div
            className={`rounded-2xl border p-5 transition-all ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>课时黄金 20 分钟时间切片可视化分配器</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  国际吉他教学法标准：单课时严格限时 20 分钟（1200 秒），平衡注意力与指力耐受极限
                </p>
              </div>

              <div className="text-right font-mono">
                <span className={`text-2xl font-black ${isGolden20Min ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalMinutes}
                </span>
                <span className="text-xs text-slate-400 ml-1">/ 20 分钟</span>
              </div>
            </div>

            {/* Horizontal Continuous Slice Breakdown Bar */}
            <div className="h-6 rounded-xl overflow-hidden flex border border-slate-700/60 p-0.5 bg-slate-950 mb-4">
              {interactiveModules.map((mod) => {
                const min = timeAlloc[mod.key as keyof typeof timeAlloc];
                const widthPercent = (min / (totalMinutes || 1)) * 100;
                return (
                  <div
                    key={mod.key}
                    className={`${mod.color} h-full transition-all duration-300 flex items-center justify-center text-[11px] font-bold text-slate-950 overflow-hidden px-1`}
                    style={{ width: `${Math.max(4, widthPercent)}%` }}
                    title={`${mod.name}: ${min} 分钟 (${widthPercent.toFixed(1)}%)`}
                  >
                    {widthPercent > 10 && `${min}m`}
                  </div>
                );
              })}
            </div>

            {/* 5 Slice Cards with Interactive Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {interactiveModules.map((mod) => {
                const currentVal = timeAlloc[mod.key as keyof typeof timeAlloc];
                return (
                  <div
                    key={mod.key}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                      darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${mod.textCol}`}>{mod.name.split(' ')[0]}</span>
                        <span className="text-sm font-black font-mono">{currentVal}m</span>
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 h-8">
                        {mod.desc}
                      </div>
                    </div>

                    <div className="mt-3">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={currentVal}
                        onChange={(e) => {
                          const newVal = parseInt(e.target.value, 10);
                          onChangeLesson({
                            ...selectedLesson,
                            timeAllocation: {
                              ...selectedLesson.timeAllocation,
                              [mod.key]: newVal,
                            },
                          });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                        <span>1m</span>
                        <span>标配:{mod.defaultMin}m</span>
                        <span>10m</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Module Prerequisite Unlock Rules Engine */}
          <div
            className={`rounded-2xl border p-5 transition-all ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>模块前后依赖解锁规则引擎 (Prerequisite Rule Engine)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  卡点引擎：防止学员投机取巧跳过校音或和弦微测直接对拍，保障教研教学闭环
                </p>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Zap className="w-3.5 h-3.5" />
                <span>实时校验策略生效中</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Rule 1: Strict Linear Progression */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  selectedLesson.prerequisite.linearUnlocked
                    ? darkMode
                      ? 'bg-indigo-950/20 border-indigo-500/40'
                      : 'bg-indigo-50/50 border-indigo-200'
                    : darkMode
                    ? 'bg-slate-950/40 border-slate-800'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-400">严格线性顺序推进</span>
                    <button
                      id="btn-toggle-linear-progression"
                      onClick={() =>
                        onChangeLesson({
                          ...selectedLesson,
                          prerequisite: {
                            ...selectedLesson.prerequisite,
                            linearUnlocked: !selectedLesson.prerequisite.linearUnlocked,
                          },
                        })
                      }
                      className={`p-1.5 rounded-lg border transition-colors ${
                        selectedLesson.prerequisite.linearUnlocked
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
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
                  <span>{selectedLesson.prerequisite.linearUnlocked ? '已开启强制线性门禁' : '自由浏览模式'}</span>
                </div>
              </div>

              {/* Rule 2: AI Pitch & Rhythm Score Threshold */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
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

              {/* Rule 3: Video Watch Rate Anti-Brushing */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
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
        </div>
      </div>
    </div>
  );
};
