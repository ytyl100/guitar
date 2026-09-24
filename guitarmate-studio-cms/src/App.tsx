import React, { useState, useEffect } from 'react';
import { TopHeader } from './components/TopHeader';
import { SidebarNav, StudioTab } from './components/SidebarNav';
import { MusicLibraryStudio } from './components/studios/MusicLibraryStudio';
import { AudioTabSyncStudio } from './components/studios/AudioTabSyncStudio';
import { TabImportStudio } from './components/studios/TabImportStudio';
import { ReviewPage } from './components/review/ReviewPage';
import { CurriculumOutlineStudio } from './components/studios/CurriculumOutlineStudio';
import { VideoTimestampStudio } from './components/studios/VideoTimestampStudio';
import { ChordDrillStudio } from './components/studios/ChordDrillStudio';
import { LearningAnalyticsStudio } from './components/studios/LearningAnalyticsStudio';
import { ContractModal } from './components/ContractModal';
import { INITIAL_AUDIO_TAB_SYNC, INITIAL_STAGES, INITIAL_MUSIC_TRACKS } from './data/initialData';
import { AudioTabSyncConfig, LessonStep, Stage, MusicTrack, MusicStatus } from './types';
import { audioEngine } from './utils/audioEngine';

export default function App() {
  // Theme & Layout state
  const [darkMode, setDarkMode] = useState<boolean>(true);
  // Default homepage is 'music-library' as requested by user
  const [activeTab, setActiveTab] = useState<StudioTab>('music-library');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Music Tracks Library state with local persistence
  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    try {
      const cached = localStorage.getItem('guitarmate_music_tracks');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_MUSIC_TRACKS;
  });

  // Track currently loaded into the Audio-Tab Alignment Studio
  const [activeTrack, setActiveTrack] = useState<MusicTrack>(() => {
    return tracks[0] || INITIAL_MUSIC_TRACKS[0];
  });

  // Core Data Contracts
  const [audioSyncConfig, setAudioSyncConfig] = useState<AudioTabSyncConfig>(
    () => activeTrack.tabConfig || INITIAL_AUDIO_TAB_SYNC
  );
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [selectedLesson, setSelectedLesson] = useState<LessonStep>(
    INITIAL_STAGES[0].courses[0].chapters[0].lessons[0]
  );

  // Modal & Notification states
  const [isContractModalOpen, setIsContractModalOpen] = useState<boolean>(false);
  /**
   * 六线谱导入工作台保存后，把 scoreId 交给「音频与六线谱对齐」工作台自动绑定，
   * 管理员就不用手工复制粘贴 Score ID 了。
   */
  const [pendingRemoteScoreId, setPendingRemoteScoreId] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [audioEngineReady, setAudioEngineReady] = useState<boolean>(false);
  const [saveBannerMessage, setSaveBannerMessage] = useState<string | null>(null);

  // Synchronize tracks persistence
  useEffect(() => {
    try {
      localStorage.setItem('guitarmate_music_tracks', JSON.stringify(tracks));
    } catch {}
  }, [tracks]);

  // Initialize Web Audio API readiness
  useEffect(() => {
    try {
      const ctx = audioEngine.getContext();
      if (ctx) {
        setAudioEngineReady(true);
      }
    } catch {
      setAudioEngineReady(false);
    }
  }, []);

  // Music library handlers
  const handleSelectTrackForEditing = (track: MusicTrack) => {
    setActiveTrack(track);
    setAudioSyncConfig(track.tabConfig);
    setActiveTab('audio-tab-sync');
    setSaveBannerMessage(`🎵 已载入曲目《${track.title}》 (${track.currentVersion}) 进入音频六线谱对齐工作台`);
    setTimeout(() => setSaveBannerMessage(null), 3000);
  };

  const handleAddNewTrack = (newTrack: MusicTrack) => {
    setTracks((prev) => [newTrack, ...prev]);
    setActiveTrack(newTrack);
    setAudioSyncConfig(newTrack.tabConfig);
    setActiveTab('audio-tab-sync');
    setSaveBannerMessage(`✨ 新曲目《${newTrack.title}》工程已创建，已直达音频与六线谱对齐界面！`);
    setTimeout(() => setSaveBannerMessage(null), 3500);
  };

  const handleUpdateTrack = (updated: MusicTrack) => {
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (activeTrack.id === updated.id) {
      setActiveTrack(updated);
      setAudioSyncConfig(updated.tabConfig);
    }
    setHasUnsavedChanges(true);
  };

  const handleDeleteTrack = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setSaveBannerMessage('🗑️ 曲目已从音乐库中移除');
    setTimeout(() => setSaveBannerMessage(null), 2500);
  };

  const handleToggleStatus = (trackId: string, status: MusicStatus) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              status,
              updatedAt: new Date().toISOString().split('T')[0],
            }
          : t
      )
    );
    if (activeTrack.id === trackId) {
      setActiveTrack((prev) => ({
        ...prev,
        status,
        updatedAt: new Date().toISOString().split('T')[0],
      }));
    }
    const statusText =
      status === 'published' ? '🚀 已发布至 C 端学员系统' : status === 'draft' ? '📝 已保存为草稿' : '📦 已归档';
    setSaveBannerMessage(`曲目状态已更新：${statusText}`);
    setTimeout(() => setSaveBannerMessage(null), 3000);
  };

  // Audio Tab Sync modifications
  const handleUpdateAudioConfig = (newConfig: AudioTabSyncConfig) => {
    setAudioSyncConfig(newConfig);
    if (activeTrack) {
      const updatedTrack: MusicTrack = {
        ...activeTrack,
        tabConfig: newConfig,
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setActiveTrack(updatedTrack);
      setTracks((prev) => prev.map((t) => (t.id === updatedTrack.id ? updatedTrack : t)));
    }
    setHasUnsavedChanges(true);
  };

  const handleUpdateLesson = (updatedLesson: LessonStep) => {
    setSelectedLesson(updatedLesson);
    // Also sync in stages tree
    const updatedStages = stages.map((stage) => ({
      ...stage,
      courses: stage.courses.map((course) => ({
        ...course,
        chapters: course.chapters.map((chap) => ({
          ...chap,
          lessons: chap.lessons.map((l) => (l.id === updatedLesson.id ? updatedLesson : l)),
        })),
      })),
    }));
    setStages(updatedStages);
    setHasUnsavedChanges(true);
  };

  const handleQuickSave = () => {
    setHasUnsavedChanges(false);
    setSaveBannerMessage('✅ 数据契约已保存，并成功同步至 C 端学员系统契约总线！');
    setTimeout(() => {
      setSaveBannerMessage(null), 3000;
    });
  };

  return (
    <div
      id="guitarmate-cms-root"
      className={`h-screen w-screen flex flex-col overflow-hidden transition-colors ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Save banner toast */}
      {saveBannerMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs shadow-2xl shadow-amber-500/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <span>{saveBannerMessage}</span>
        </div>
      )}

      {/* Top Global Status Header */}
      <TopHeader
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        audioSyncConfig={audioSyncConfig}
        selectedLesson={selectedLesson}
        activeTrack={activeTrack}
        onOpenContractModal={() => setIsContractModalOpen(true)}
        audioEngineReady={audioEngineReady}
        onQuickSave={handleQuickSave}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Workspace Body: Left Sidebar + Main Studio Stage */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Professional Navigation */}
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === 'data-contract') {
              setIsContractModalOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          darkMode={darkMode}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Studio Viewports */}
        <main
          id="main-studio-viewport"
          className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden ${
            darkMode ? 'bg-slate-950' : 'bg-slate-50'
          }`}
        >
          {/* 1. Music Library Studio (Default Homepage) */}
          {activeTab === 'music-library' && (
            <MusicLibraryStudio
              tracks={tracks}
              onSelectTrackForEditing={handleSelectTrackForEditing}
              onAddNewTrack={handleAddNewTrack}
              onUpdateTrack={handleUpdateTrack}
              onDeleteTrack={handleDeleteTrack}
              onToggleStatus={handleToggleStatus}
              darkMode={darkMode}
            />
          )}

          {/* 2. Audio-Tab Alignment Studio */}
          {activeTab === 'audio-tab-sync' && (
            <AudioTabSyncStudio
              config={audioSyncConfig}
              onChangeConfig={handleUpdateAudioConfig}
              darkMode={darkMode}
              currentTrack={activeTrack}
              onUpdateTrack={handleUpdateTrack}
              onReturnToLibrary={() => setActiveTab('music-library')}
              initialRemoteScoreId={pendingRemoteScoreId}
            />
          )}

          {/* 2b. Tab Import Studio（外部谱面 → 统一 TabProject → 曲目工程） */}
          {activeTab === 'tab-import' && (
            <TabImportStudio
              darkMode={darkMode}
              onOpenInAudioStudio={(scoreId) => {
                setPendingRemoteScoreId(scoreId);
                setActiveTab('audio-tab-sync');
                setSaveBannerMessage(
                  `📥 已把导入的曲目带入对齐工作台（scoreId=${scoreId}）—— 补上音频路径即可发布到小程序`,
                );
                setTimeout(() => setSaveBannerMessage(null), 5000);
              }}
            />
          )}

          {/* 2c. Transcription Review（音频 → 转录 → 逐音符复核 → PracticePackage） */}
          {activeTab === 'transcription-review' && (
            <ReviewPage
              darkMode={darkMode}
              onOpenInAudioStudio={(scoreId) => {
                setPendingRemoteScoreId(scoreId);
                setActiveTab('audio-tab-sync');
                setSaveBannerMessage(
                  `🎼 转录结果已镜像到发布链路（scoreId=${scoreId}）—— 可在此做毫秒级音频对齐`,
                );
                setTimeout(() => setSaveBannerMessage(null), 5000);
              }}
            />
          )}

          {/* 3. Curriculum Outline Studio */}
          {activeTab === 'curriculum' && (
            <CurriculumOutlineStudio
              stages={stages}
              onChangeStages={setStages}
              selectedLesson={selectedLesson}
              onSelectLesson={setSelectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
            />
          )}

          {/* 4. Video Keypoint CMS Studio */}
          {activeTab === 'video-cms' && (
            <VideoTimestampStudio
              lesson={selectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
            />
          )}

          {/* 5. Chord Drill & BPM Step Studio */}
          {activeTab === 'chord-drill' && (
            <ChordDrillStudio
              lesson={selectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
            />
          )}

          {/* 6. Learning Analytics Studio */}
          {activeTab === 'analytics' && (
            <LearningAnalyticsStudio darkMode={darkMode} />
          )}
        </main>
      </div>

      {/* Data Contract Inspection & Export Modal */}
      <ContractModal
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
        audioSyncConfig={audioSyncConfig}
        lessonStep={selectedLesson}
        stages={stages}
        tracks={tracks}
        darkMode={darkMode}
      />
    </div>
  );
}
