import React, { useState } from 'react';
import { TabKey, SongItem, Course } from './types';
import {
  INITIAL_SONGS,
  INITIAL_COURSES,
  INITIAL_USER_PROFILE,
  INITIAL_PAYMENT_RECORDS,
} from './data/mockData';
import { MusicTab } from './components/MusicTab';
import { CourseTab } from './components/CourseTab';
import { ToolsTab } from './components/ToolsTab';
import { ChordLibraryTab } from './components/ChordLibraryTab';
import { ProfileTab } from './components/ProfileTab';
import { MiniProgramNavBar } from './components/MiniProgramNavBar';
import { ArchitectureModal } from './components/ArchitectureModal';
import { useTheme } from './contexts/ThemeContext';
import { useLanguage } from './contexts/LanguageContext';
import {
  Music2,
  GraduationCap,
  BookOpen,
  Radio,
  User,
  Smartphone,
  Monitor,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';

export default function App() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabKey>('songs');
  const [songs, setSongs] = useState<SongItem[]>(INITIAL_SONGS);
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [userProfile, setUserProfile] = useState(INITIAL_USER_PROFILE);
  const [paymentRecords] = useState(INITIAL_PAYMENT_RECORDS);

  // Mobile frame simulator mode vs full responsive container
  const [isMobileFrame, setIsMobileFrame] = useState(true);

  // Quick practice chords passed between tabs
  const [practiceChords, setPracticeChords] = useState<string[] | null>(null);

  // Architecture modal state
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  // Trigger to reset Learn tab to Guitar courses list whenever Learn tab is clicked
  const [learnResetTrigger, setLearnResetTrigger] = useState(0);

  // Toggle favorite & pin to top
  const handleToggleFavorite = (songId: string) => {
    setSongs((prev) =>
      prev.map((s) => (s.id === songId ? { ...s, isFavorite: !s.isFavorite } : s))
    );
  };

  // Update lesson step completion
  const handleUpdateCourseProgress = (
    courseId: string,
    stepId: string,
    completed: boolean
  ) => {
    setCourses((prevCourses) =>
      prevCourses.map((c) => {
        if (c.id !== courseId) return c;
        const nextChapters = c.chapters.map((ch) => ({
          ...ch,
          steps: ch.steps.map((s) => (s.id === stepId ? { ...s, completed } : s)),
        }));
        const totalCompleted = nextChapters.reduce(
          (acc, ch) => acc + ch.steps.filter((s) => s.completed).length,
          0
        );
        return {
          ...c,
          completedSteps: totalCompleted,
          chapters: nextChapters,
        };
      })
    );

    // Update user stats
    setUserProfile((prev) => ({
      ...prev,
      totalPracticeMins: prev.totalPracticeMins + 15,
      masteredChordsCount: Math.min(24, prev.masteredChordsCount + 1),
    }));
  };

  // Switch to chord practice with custom song chords
  const handleSelectSongForPractice = (chordList: string[]) => {
    setPracticeChords(chordList);
    setActiveTab('learn');
  };

  // Main navigation handler for Learn: ALWAYS enters Guitar courses first!
  const handleOpenLearnTab = () => {
    setPracticeChords(null);
    setLearnResetTrigger((prev) => prev + 1);
    setActiveTab('learn');
  };

  // Dynamic tab titles from i18n
  const tabTitles: Record<TabKey, string> = {
    songs: t('title.songs'),
    learn: t('title.learn'),
    tune: t('title.tune'),
    tools: t('title.tools'),
    profile: t('title.profile'),
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-0 md:p-4 selection:bg-emerald-500 selection:text-black transition-colors duration-200 ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-200 text-zinc-900'
      }`}
    >
      {/* Desktop Top Floating Utility Bar */}
      <header
        className={`hidden md:flex items-center justify-between w-full max-w-md mb-2 px-2 text-xs ${
          isDark ? 'text-zinc-400' : 'text-zinc-600'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className={`font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            微信小程序模拟器 (Taro/React)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick theme & lang toggle in top header */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-full border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-amber-400 hover:bg-zinc-800'
                : 'bg-white border-zinc-300 text-indigo-500 hover:bg-zinc-100 shadow-xs'
            }`}
            title={isDark ? '切换白天主题' : '切换黑夜主题'}
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            onClick={toggleLanguage}
            className={`px-2 py-0.5 rounded-full border text-[11px] font-bold transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100 shadow-xs'
            }`}
            title="切换语言"
          >
            {language === 'zh' ? 'EN' : '中'}
          </button>
          <button
            onClick={() => setIsDocModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30 transition border border-emerald-500/40 font-bold"
          >
            <Sparkles size={13} />
            <span>架构方案</span>
          </button>
          <button
            onClick={() => setIsMobileFrame(!isMobileFrame)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                : 'bg-white border-zinc-300 hover:bg-zinc-100 text-zinc-700 shadow-xs'
            }`}
            title="切换真机外框 / 全屏自适应"
          >
            {isMobileFrame ? <Monitor size={13} /> : <Smartphone size={13} />}
            <span>{isMobileFrame ? '全屏' : '真机外壳'}</span>
          </button>
        </div>
      </header>

      {/* Main Mini-Program Shell */}
      <main
        className={`w-full flex flex-col overflow-hidden transition-all duration-300 ${
          isDark ? 'bg-[#101217]' : 'bg-slate-50'
        } ${
          isMobileFrame
            ? `max-w-md h-screen md:h-[844px] md:rounded-[42px] md:border-[10px] ${
                isDark ? 'md:border-zinc-850 md:shadow-[0_25px_60px_rgba(0,0,0,0.9)]' : 'md:border-zinc-300 md:shadow-2xl'
              } relative`
            : `w-full max-w-4xl h-screen md:h-[880px] md:rounded-3xl md:border ${
                isDark ? 'md:border-zinc-800 shadow-2xl' : 'md:border-zinc-300 shadow-2xl'
              } relative`
        }`}
      >
        {/* WeChat Mini-Program Top Status & Capsule Bar */}
        <MiniProgramNavBar
          title={tabTitles[activeTab]}
          isMobileFrame={isMobileFrame}
          onToggleMobileFrame={() => setIsMobileFrame(!isMobileFrame)}
          onOpenDoc={() => setIsDocModalOpen(true)}
        />

        {/* Tab Content Body */}
        <section className="flex-1 overflow-hidden relative" aria-label="小程序主要内容">
          {activeTab === 'songs' && (
            <MusicTab
              songs={songs}
              onToggleFavorite={handleToggleFavorite}
              onSelectSongForPractice={handleSelectSongForPractice}
            />
          )}

          {activeTab === 'learn' && (
            <CourseTab
              courses={courses}
              onUpdateProgress={handleUpdateCourseProgress}
              onOpenTuner={() => setActiveTab('tune')}
              onOpenArchitecturePlan={() => setIsDocModalOpen(true)}
              initialPracticeChords={practiceChords}
              onClearPracticeChords={() => setPracticeChords(null)}
              resetViewTrigger={learnResetTrigger}
            />
          )}

          {activeTab === 'tune' && <ToolsTab />}

          {activeTab === 'tools' && (
            <ChordLibraryTab onBack={() => setActiveTab('tune')} />
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              userProfile={userProfile}
              paymentRecords={paymentRecords}
              currentCourse={courses[0]}
              onResumeCourse={() => {
                setPracticeChords(null);
                setActiveTab('learn');
              }}
              onOpenDocModal={() => setIsDocModalOpen(true)}
            />
          )}
        </section>

        {/* Bottom Tab Bar (matching music_list.jpg and WeChat Mini-Program bottom bar) */}
        <nav
          className={`absolute bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t px-2 py-1.5 flex items-center justify-around select-none transition-colors duration-200 ${
            isDark
              ? 'bg-[#12141a]/95 border-zinc-800/80'
              : 'bg-white/95 border-zinc-200 shadow-lg'
          }`}
          aria-label="主导航栏"
        >
          {/* 1. Songs */}
          <button
            onClick={() => setActiveTab('songs')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeTab === 'songs'
                ? 'text-emerald-500 font-bold'
                : isDark
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <Music2 size={20} className={activeTab === 'songs' ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] mt-0.5 tracking-tight">{t('nav.songs')}</span>
          </button>

          {/* 2. Learn - ALWAYS goes to Guitar courses first */}
          <button
            onClick={handleOpenLearnTab}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeTab === 'learn'
                ? 'text-emerald-500 font-bold'
                : isDark
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <GraduationCap
              size={20}
              className={activeTab === 'learn' ? 'stroke-[2.5]' : ''}
            />
            <span className="text-[10px] mt-0.5 tracking-tight">{t('nav.learn')}</span>
          </button>

          {/* 3. Tune */}
          <button
            onClick={() => setActiveTab('tune')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeTab === 'tune'
                ? 'text-emerald-500 font-bold'
                : isDark
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <Radio size={20} className={activeTab === 'tune' ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] mt-0.5 tracking-tight">{t('nav.tune')}</span>
          </button>

          {/* 4. Tools */}
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeTab === 'tools'
                ? 'text-emerald-500 font-bold'
                : isDark
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <BookOpen size={20} className={activeTab === 'tools' ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] mt-0.5 tracking-tight">{t('nav.tools')}</span>
          </button>

          {/* 5. Profile */}
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              activeTab === 'profile'
                ? 'text-emerald-500 font-bold'
                : isDark
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <User size={20} className={activeTab === 'profile' ? 'stroke-[2.5]' : ''} />
            <span className="text-[10px] mt-0.5 tracking-tight">{t('nav.profile')}</span>
          </button>
        </nav>
      </main>

      {/* Architecture & Output Requirement Modal */}
      <ArchitectureModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
      />
    </div>
  );
}
