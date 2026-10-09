import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Video, 
  Sliders, 
  Music, 
  CheckCircle2, 
  Circle, 
  Play, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  ArrowLeft, 
  Award, 
  Lock, 
  Sparkles, 
  GraduationCap, 
  UserCheck, 
  Check, 
  X, 
  Volume2, 
  RotateCcw, 
  HelpCircle,
  BarChart2,
  Calendar,
  Layers,
  Search
} from 'lucide-react';
import { CourseCurriculum, CourseChapter, ChapterContentItem, TeachingVideo, VideoCuePoint, ChordDrillCombination, CourseReturnContext } from '../types/curriculum';
import { UserProfile } from '../types/auth';
import { backendService } from '../utils/backendService';
import { ScoreData } from '../types/music';
import { INITIAL_LIBRARY_ITEMS } from '../data/libraryData';
import { MACAROON_5_SCORE } from '../data/macaroon5Demo';
import { resolveScoreForItem } from '../utils/scoreResolver';
import { InteractiveChordDrillModal } from './InteractiveChordDrillModal';

interface StudentCourseViewProps {
  currentUser: UserProfile;
  courses: CourseCurriculum[];
  videos: TeachingVideo[];
  drills: ChordDrillCombination[];
  onSelectSong: (score: ScoreData, courseContext?: CourseReturnContext) => void;
  onGoHome?: () => void;
  onOpenLibrary?: () => void;
  initialCourseId?: string | null;
  initialChapterId?: string | null;
}

export const StudentCourseView: React.FC<StudentCourseViewProps> = ({
  currentUser,
  courses,
  videos,
  drills,
  onSelectSong,
  initialCourseId = null,
  initialChapterId = null,
}) => {
  // Course source filter: 'system' (系统官方基础课程) vs 'teacher' (老师发布的专修课程)
  const isRegisteredGuest = currentUser.role === 'trial_guest';
  const [courseSourceTab, setCourseSourceTab] = useState<'system' | 'teacher'>('system');

  // Search keyword inside courses
  const [searchKeyword, setSearchKeyword] = useState('');

  // Active Selected Course for Viewing Chapter List
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() => initialCourseId || null);

  // Expanded chapters state
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {
      'chap_101': true,
      'chap_102': true,
    };
    if (initialChapterId) {
      init[initialChapterId] = true;
    }
    return init;
  });

  // Sync if initialCourseId or initialChapterId changes (e.g. returning from score)
  useEffect(() => {
    if (initialCourseId) {
      setSelectedCourseId(initialCourseId);
    }
    if (initialChapterId) {
      setExpandedChapterIds((prev) => ({
        ...prev,
        [initialChapterId]: true,
      }));
    }
  }, [initialCourseId, initialChapterId]);

  // User task progress (persisted in backendService localStorage)
  const [taskProgress, setTaskProgress] = useState<Record<string, boolean>>(() => 
    backendService.getUserTaskProgress(currentUser.id)
  );

  // Modals for interactive tasks
  const [activeVideoModal, setActiveVideoModal] = useState<{
    item: ChapterContentItem;
    video: TeachingVideo | null;
  } | null>(null);

  const [activeChordDrillModal, setActiveChordDrillModal] = useState<{
    item: ChapterContentItem;
    drill: ChordDrillCombination | null;
  } | null>(null);

  // Sync task progress on changes
  const handleMarkTaskCompleted = (itemId: string, completed: boolean = true) => {
    const updated = backendService.setUserTaskCompleted(currentUser.id, itemId, completed);
    setTaskProgress({ ...updated });
  };

  // Filter courses based on source tab
  const filteredCourses = courses.filter((c) => {
    if (c.status !== 'published') return false;

    // Filter by tab
    if (courseSourceTab === 'system') {
      if (!c.isSystemBasic) return false;
    } else {
      if (c.isSystemBasic) return false;
    }

    // Filter by search keyword
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(kw);
      const matchDesc = c.description.toLowerCase().includes(kw);
      const matchTeacher = c.teacherName.toLowerCase().includes(kw);
      const matchChapter = c.chapters.some((ch) => ch.title.toLowerCase().includes(kw));
      if (!matchTitle && !matchDesc && !matchTeacher && !matchChapter) return false;
    }

    return true;
  });

  // Current selected active course
  const activeCourse = courses.find((c) => c.id === selectedCourseId) || null;

  // Toggle chapter expansion
  const toggleChapterExpand = (chapterId: string) => {
    setExpandedChapterIds((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId],
    }));
  };

  // Expand / collapse all chapters
  const handleToggleAllChapters = (expand: boolean) => {
    if (!activeCourse) return;
    const newState: Record<string, boolean> = {};
    activeCourse.chapters.forEach((ch) => {
      newState[ch.id] = expand;
    });
    setExpandedChapterIds(newState);
  };

  // Calculate course completion stats
  const activeCourseStats = activeCourse ? backendService.getCourseCompletionStats(currentUser.id, activeCourse) : null;

  return (
    <div className="space-y-6">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & COURSE TYPE SWITCHER (白天模式 UI) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                🎓 学员课纲与进度中心
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {currentUser.role === 'student' ? '正式学员身份' : '试用注册用户'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mt-1">
              吉他体系课纲与 20 分钟切片学习
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 max-w-2xl mt-1 leading-relaxed">
              严格按照科学指弹生理工学打造，包含 13 个系统进阶章节。视频打点精研、双轨乐谱跟练、和弦微测达标全流程联动打卡。
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索章节名、和弦或技巧..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Course Source Switcher Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex items-center space-x-2 bg-gray-100/80 p-1 rounded-xl">
            {/* System Foundation Courses */}
            <button
              type="button"
              onClick={() => {
                setCourseSourceTab('system');
                setSelectedCourseId(null);
              }}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                courseSourceTab === 'system'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>系统官方基础免费课程 (全员开放)</span>
            </button>

            {/* Teacher Assigned Courses */}
            <button
              type="button"
              onClick={() => {
                if (isRegisteredGuest) return;
                setCourseSourceTab('teacher');
                setSelectedCourseId(null);
              }}
              disabled={isRegisteredGuest}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                courseSourceTab === 'teacher'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : isRegisteredGuest
                  ? 'text-gray-400 opacity-60 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title={isRegisteredGuest ? '注册用户需绑定认证教师后方可解锁老师发布的专修课程' : '查看负责导师李老师发布的进阶专修大纲'}
            >
              {isRegisteredGuest ? (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>李老师认证专修课程</span>
              {isRegisteredGuest && (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-normal">
                  绑定后解锁
                </span>
              )}
            </button>
          </div>

          {/* Role Status Note */}
          {isRegisteredGuest ? (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>您当前为<strong>注册试用用户</strong>，已默认开启 13 章《初学民谣指弹速成》完整基础课纲。</span>
            </div>
          ) : (
            <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>已认证学员：已挂靠<strong>李老师</strong>，享有全部专修课纲与系统基础大纲完整研读权限。</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. COURSE DETAIL (13 CHAPTERS PROGRESSION) OR COURSE LIST VIEW */}
      {/* ========================================================================= */}
      {activeCourse ? (
        /* VIEW B: CHAPTER PROGRESSION VIEW (13 CHAPTERS, inspired by guitar-lessons 1-4) */
        <div className="space-y-6">
          
          {/* Back to courses bar */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedCourseId(null)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-gray-500" />
              <span>返回课程列表</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleToggleAllChapters(true)}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer underline"
              >
                展开全部章节
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={() => handleToggleAllChapters(false)}
                className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer underline"
              >
                折叠全部
              </button>
            </div>
          </div>

          {/* Course Banner Card (Daytime White / Light Mode) */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row">
            {/* Left Cover Image */}
            <div className="md:w-80 h-48 md:h-auto relative overflow-hidden bg-gray-100 shrink-0">
              <img
                src={activeCourse.coverImage}
                alt={activeCourse.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/70 via-transparent to-transparent flex flex-col justify-end p-4 text-white">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/90 backdrop-blur-xs px-2 py-0.5 rounded self-start">
                  {activeCourse.isSystemBasic ? '系统官方精品课' : '导师专修课'}
                </span>
                <span className="text-sm font-bold mt-1 text-white truncate">{activeCourse.level}</span>
              </div>
            </div>

            {/* Right Information & Overall Progress */}
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                  <span>{activeCourse.teacherName}</span>
                  <span>·</span>
                  <span>{activeCourse.institutionName}</span>
                  <span>·</span>
                  <span className="font-mono text-gray-400">版本 {activeCourse.version}</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                  {activeCourse.title}
                </h1>
                <p className="text-xs text-emerald-800 font-medium font-mono mt-0.5">
                  {activeCourse.subtitle}
                </p>

                <p className="text-xs text-gray-600 leading-relaxed mt-2.5 max-w-3xl">
                  {activeCourse.description}
                </p>
              </div>

              {/* Progress Bar & KPI Stats */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs font-bold text-gray-800 mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <Award className="w-4 h-4 text-emerald-600" />
                    <span>总体学习完成度:</span>
                    <span className="text-emerald-700 font-extrabold">{activeCourseStats?.percentage}%</span>
                  </div>
                  <span className="text-gray-500 font-normal">
                    已掌握 <strong>{activeCourseStats?.completedItems}</strong> / {activeCourseStats?.totalItems} 个切片任务
                  </span>
                </div>

                {/* Progress bar line */}
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${activeCourseStats?.percentage || 0}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-3 pt-2">
                  <span className="flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-gray-400" />
                    <span>共包含 <strong>{activeCourse.chapters.length}</strong> 个进阶章节</span>
                  </span>
                  <span>·</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>总课时约 <strong>{activeCourse.totalHours}</strong></span>
                  </span>
                  <span>·</span>
                  <span className="flex items-center space-x-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>任务打卡实时本地持久保存</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 13 Chapters Accordion List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-emerald-700" />
                <span>章节大纲与练习切片 ({activeCourse.chapters.length} 章节)</span>
              </h3>
              <span className="text-xs text-gray-500">点击任意章节卡片展开切片任务</span>
            </div>

            <div className="space-y-3">
              {activeCourse.chapters.map((chapter, index) => {
                const isExpanded = !!expandedChapterIds[chapter.id];
                const chapterCompletedItems = chapter.items.filter((item) => !!taskProgress[item.id]).length;
                const chapterTotalItems = chapter.items.length;
                const isChapterAllDone = chapterTotalItems > 0 && chapterCompletedItems === chapterTotalItems;

                return (
                  <div
                    key={chapter.id}
                    className={`bg-white rounded-xl border transition-all overflow-hidden ${
                      isChapterAllDone
                        ? 'border-emerald-300 shadow-2xs'
                        : isExpanded
                        ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Chapter Header Bar */}
                    <div
                      onClick={() => toggleChapterExpand(chapter.id)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                        isChapterAllDone
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                          : isExpanded
                          ? 'bg-emerald-50/20'
                          : 'bg-white hover:bg-gray-50/80'
                      }`}
                    >
                      <div className="flex items-start sm:items-center space-x-3 min-w-0">
                        {/* Chapter Index Badge */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isChapterAllDone
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {isChapterAllDone ? <Check className="w-4 h-4" /> : String(index + 1).padStart(2, '0')}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="text-sm font-bold text-gray-900">
                              {chapter.title}
                            </h4>
                            <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              {chapter.category}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              时长 {chapter.totalDuration}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {chapter.description}
                          </p>
                        </div>
                      </div>

                      {/* Right Chapter Progress & Caret */}
                      <div className="flex items-center space-x-3 shrink-0 self-end sm:self-auto">
                        {/* Chapter Progress Pill */}
                        {isChapterAllDone ? (
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>已通关 ({chapterCompletedItems}/{chapterTotalItems})</span>
                          </span>
                        ) : chapterCompletedItems > 0 ? (
                          <span className="text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                            进行中 ({chapterCompletedItems}/{chapterTotalItems})
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                            待开始 (0/{chapterTotalItems})
                          </span>
                        )}

                        <div className="text-gray-400 hover:text-gray-700">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Chapter Expanded Items (20m Slices) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-2.5 bg-gray-50/50">
                        {chapter.items.length === 0 ? (
                          <div className="text-xs text-gray-400 py-3 text-center italic">
                            该章节暂无编排切片内容
                          </div>
                        ) : (
                          chapter.items.map((item, itemIdx) => {
                            const isItemDone = !!taskProgress[item.id];

                            return (
                              <div
                                key={item.id}
                                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                                  isItemDone
                                    ? 'bg-white border-emerald-200 shadow-2xs'
                                    : 'bg-white border-gray-200 hover:border-emerald-300 shadow-2xs'
                                }`}
                              >
                                {/* Left Item Type Icon & Info */}
                                <div className="flex items-start sm:items-center space-x-3 min-w-0">
                                  {/* Icon by type */}
                                  {item.type === 'video' && (
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                      isItemDone ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-50 text-rose-600 border border-rose-100'
                                    }`}>
                                      <Video className="w-4 h-4" />
                                    </div>
                                  )}
                                  {item.type === 'chord_drill' && (
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                      isItemDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-600 border border-amber-100'
                                    }`}>
                                      <Sliders className="w-4 h-4" />
                                    </div>
                                  )}
                                  {item.type === 'transcription_score' && (
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                      isItemDone ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-50 text-teal-600 border border-teal-100'
                                    }`}>
                                      <Music className="w-4 h-4" />
                                    </div>
                                  )}

                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-xs font-bold text-gray-900">
                                        {item.title}
                                      </span>

                                      {/* Type label pill */}
                                      {item.type === 'video' && (
                                        <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-semibold">
                                          教学视频 {item.cuePoints ? `· ${item.cuePoints.length} 打点` : ''}
                                        </span>
                                      )}
                                      {item.type === 'chord_drill' && (
                                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">
                                          和弦微测 {item.bpmTarget ? `· 目标 ${item.bpmTarget} BPM` : ''}
                                        </span>
                                      )}
                                      {item.type === 'transcription_score' && (
                                        <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-semibold">
                                          实战双行谱跟练
                                        </span>
                                      )}

                                      {/* Done badge */}
                                      {isItemDone && (
                                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold flex items-center space-x-0.5">
                                          <Check className="w-3 h-3" />
                                          <span>已完成</span>
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xl">
                                      {item.description}
                                      {item.chords && ` · 和弦走向: ${item.chords.join(' → ')}`}
                                      {item.scoreTitle && ` · 乐谱: ${item.scoreTitle}`}
                                    </p>
                                  </div>
                                </div>

                                {/* Right Interactive Action Buttons */}
                                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                                  {/* Launch interactive modal by type */}
                                  {item.type === 'video' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const v = videos.find((vi) => vi.id === item.videoId) || null;
                                        setActiveVideoModal({ item, video: v });
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                        isItemDone
                                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                          : 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                                      }`}
                                    >
                                      <Play className="w-3 h-3" />
                                      <span>{isItemDone ? '温习视频' : '播放打点视频'}</span>
                                    </button>
                                  )}

                                  {item.type === 'transcription_score' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const targetScore = resolveScoreForItem(item);
                                        onSelectSong(targetScore, {
                                          courseId: activeCourse.id,
                                          courseTitle: activeCourse.title,
                                          chapterId: chapter.id,
                                          chapterTitle: chapter.title,
                                          itemId: item.id,
                                          itemTitle: item.title,
                                          fromRole: currentUser.role,
                                          isCMS: false,
                                        });
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                        isItemDone
                                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                          : 'bg-[#188065] hover:bg-[#136a53] text-white shadow-2xs'
                                      }`}
                                      title="进入指定高精度五线谱与吉他六线谱工作台实战跟练"
                                    >
                                      <Music className="w-3 h-3" />
                                      <span>{isItemDone ? '再练此谱' : '进入实战乐谱'}</span>
                                    </button>
                                  )}

                                  {item.type === 'chord_drill' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const d = drills.find((dr) => dr.id === item.chordDrillId) || null;
                                        setActiveChordDrillModal({ item, drill: d });
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                        isItemDone
                                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                          : 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                                      }`}
                                    >
                                      <Sliders className="w-3 h-3" />
                                      <span>{isItemDone ? '重测走向' : '开始和弦微测'}</span>
                                    </button>
                                  )}

                                  {/* Quick toggle checkmark */}
                                  <button
                                    type="button"
                                    onClick={() => handleMarkTaskCompleted(item.id, !isItemDone)}
                                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                      isItemDone
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                        : 'bg-white border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300'
                                    }`}
                                    title={isItemDone ? '标记为未完成' : '手动打卡完成此项切片'}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      ) : (
        /* VIEW A: COURSE CARDS LIST (DESKTOP UI, inspired by guitar-courses.png) */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <span>
                {courseSourceTab === 'system' ? '系统官方基础课程' : '李老师专修大纲'} ({filteredCourses.length} 门课程)
              </span>
            </h3>
            <span className="text-xs text-gray-500">点击课程卡片进入 13 章节深入研读</span>
          </div>

          {filteredCourses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 space-y-3">
              <BookOpen className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-sm font-semibold">没有找到匹配的课程</p>
              <p className="text-xs text-gray-400">请尝试清除搜索关键词或切换上方的课程分类</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredCourses.map((course) => {
                const stats = backendService.getCourseCompletionStats(currentUser.id, course);

                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className="bg-white rounded-2xl border border-gray-200 hover:border-emerald-400 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 cursor-pointer group shadow-2xs"
                  >
                    <div className="space-y-3">
                      {/* Top Cover Banner */}
                      <div className="h-44 rounded-xl overflow-hidden relative bg-gray-100">
                        <img
                          src={course.coverImage}
                          alt={course.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/20 to-transparent flex flex-col justify-between p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold bg-white/95 text-gray-900 backdrop-blur-xs px-2.5 py-0.5 rounded-full shadow-xs">
                              {course.level}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs ${
                              course.isSystemBasic ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                            }`}>
                              {course.isSystemBasic ? '系统精品' : '导师专修'}
                            </span>
                          </div>

                          <div className="text-white">
                            <span className="text-xs font-mono text-emerald-300 font-semibold">{course.category}</span>
                            <h4 className="text-base font-black truncate">{course.title}</h4>
                          </div>
                        </div>
                      </div>

                      {/* Info & Teacher */}
                      <div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                          <span className="font-semibold text-gray-700">{course.teacherName}</span>
                          <span>·</span>
                          <span>{course.institutionName}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                          {course.description}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Progress & Enter Button */}
                    <div className="pt-3 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <span>完成进度: {stats.percentage}%</span>
                        <span className="text-gray-400 font-normal">
                          {stats.completedItems} / {stats.totalItems} 任务切片
                        </span>
                      </div>

                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-2 rounded-full transition-all"
                          style={{ width: `${stats.percentage}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-gray-400">
                          {course.chapters.length} 章节 · 约 {course.totalHours}
                        </span>

                        <span className="text-xs font-bold text-emerald-700 group-hover:text-emerald-800 flex items-center space-x-1">
                          <span>进入章节大纲</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TASK 1: INTERACTIVE VIDEO MODAL (带打点注释的视频，参考 guitar-lessions-video.jpg) */}
      {/* ========================================================================= */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Video className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <h3 className="text-sm font-bold text-gray-900 truncate">
                    {activeVideoModal.item.title}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    双重视角关键打点精讲 · 浏览完毕后自动计入个人学习完成度
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Body & Cue Points (Side by Side) */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-0">
              
              {/* Left 2 cols: Video Player */}
              <div className="lg:col-span-2 bg-black flex flex-col justify-center relative min-h-[260px] sm:min-h-[380px]">
                <video
                  src={activeVideoModal.item.videoUrl || activeVideoModal.video?.videoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4'}
                  controls
                  autoPlay
                  onEnded={() => {
                    handleMarkTaskCompleted(activeVideoModal.item.id, true);
                  }}
                  className="w-full h-full object-contain max-h-[460px]"
                />
              </div>

              {/* Right 1 col: Cue Points Sidebar (打点注释列表) */}
              <div className="p-4 bg-gray-50/80 border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-200">
                    <span className="text-xs font-bold text-gray-900 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-rose-600" />
                      <span>微课关键打点列表</span>
                    </span>
                    <span className="text-[10px] text-gray-400">点击打点秒数跳转</span>
                  </div>

                  {/* Cue Points items */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {(activeVideoModal.item.cuePoints || activeVideoModal.video?.cuePoints || []).map((cue) => (
                      <div
                        key={cue.id}
                        className="p-2.5 bg-white border border-gray-200 hover:border-rose-400 rounded-lg text-xs space-y-1 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-800 group-hover:text-rose-700">
                            {cue.label}
                          </span>
                          <span className="font-mono text-[10px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded">
                            {cue.timeFormatted}
                          </span>
                        </div>
                        {cue.description && (
                          <p className="text-[11px] text-gray-500 leading-snug">{cue.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mark Done Button */}
                <div className="pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      handleMarkTaskCompleted(activeVideoModal.item.id, true);
                      setActiveVideoModal(null);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>✓ 标记已研读完毕 (记录打卡)</span>
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TASK 3: INTERACTIVE CHORD DRILL & RECOGNITION (参考 practice_chor.jpg) */}
      {/* ========================================================================= */}
      {activeChordDrillModal && (
        <InteractiveChordDrillModal
          item={activeChordDrillModal.item}
          drill={activeChordDrillModal.drill}
          onClose={() => setActiveChordDrillModal(null)}
          onComplete={() => {
            handleMarkTaskCompleted(activeChordDrillModal.item.id, true);
            setActiveChordDrillModal(null);
          }}
        />
      )}

    </div>
  );
};
