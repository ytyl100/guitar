import React, { useState, useEffect, useMemo } from 'react';
import { TopHeader } from './components/TopHeader';
import { SidebarNav, StudioTab } from './components/SidebarNav';
import { MusicLibraryStudio } from './components/studios/MusicLibraryStudio';
import { AudioTabSyncStudio } from './components/studios/AudioTabSyncStudio';
import { TabImportStudio } from './components/studios/TabImportStudio';
import { TabLayoutPreviewStudio } from './components/studios/TabLayoutPreviewStudio';
import { ReviewPage } from './components/review/ReviewPage';
import { SongPreviewPanel } from './components/review/SongPreviewPanel';
import { CurriculumOutlineStudio } from './components/studios/CurriculumOutlineStudio';
import { VideoTimestampStudio } from './components/studios/VideoTimestampStudio';
import { ChordDrillStudio } from './components/studios/ChordDrillStudio';
import { LearningAnalyticsStudio } from './components/studios/LearningAnalyticsStudio';
import { ContractModal } from './components/ContractModal';
import {
  INITIAL_AUDIO_TAB_SYNC,
  INITIAL_STAGES,
  INITIAL_MUSIC_TRACKS,
  CHORD_LIBRARY,
  INITIAL_CHORD_GROUPS,
  buildInitialVideoLibrary,
} from './data/initialData';
import {
  AudioTabSyncConfig,
  ChordConfig,
  ChordGroup,
  LessonStep,
  Stage,
  TeachingVideo,
  MusicTrack,
  MusicStatus,
  MusicVersion,
} from './types';
import { ApiTranscriptionPublishResult } from './services/api';
import { audioEngine } from './utils/audioEngine';
import { usePersistentState } from './hooks/usePersistentState';
import { flattenLessons, replaceLesson } from './utils/curriculumOps';

/** 取课程体系里的第一个课时（用于「当前焦点课时」的初始化 / 兜底） */
function firstLessonOf(stages: Stage[]): LessonStep {
  for (const stage of stages) {
    for (const course of stage.courses) {
      for (const chapter of course.chapters) {
        if (chapter.lessons.length > 0) return chapter.lessons[0];
      }
    }
  }
  return INITIAL_STAGES[0].courses[0].chapters[0].lessons[0];
}

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
  /**
   * 课程体系大纲（Stage ➔ Course ➔ Chapter ➔ Lesson）。
   * 用 localStorage 持久化 —— 之前刷新页面管理员编的大纲会全部丢失。
   */
  const [stages, setStages] = usePersistentState<Stage[]>('curriculum_stages', INITIAL_STAGES, {
    storageKey: 'guitarmate_curriculum_stages',
    sanitize: (value) => (Array.isArray(value) && value.length > 0 ? (value as Stage[]) : null),
  });

  /** 教学视频库（可被多个课时复用；课时通过 `videoIds` 多对多关联） */
  const [videoLibrary, setVideoLibrary] = usePersistentState<TeachingVideo[]>(
    'video_library',
    buildInitialVideoLibrary(INITIAL_STAGES),
    {
      storageKey: 'guitarmate_video_library',
      sanitize: (value) => (Array.isArray(value) ? (value as TeachingVideo[]) : null),
    },
  );

  /** 和弦库（可在「和弦微测与 BPM 阶梯」页增删改） */
  const [chords, setChords] = usePersistentState<Record<string, ChordConfig>>('chord_library', CHORD_LIBRARY, {
    storageKey: 'guitarmate_chord_library',
    sanitize: (value) =>
      value && typeof value === 'object' && Object.keys(value as object).length > 0
        ? (value as Record<string, ChordConfig>)
        : null,
  });

  /** 和弦练习组（一组和弦 + 一组 BPM 阶梯阶段，课时通过 `chordGroupIds` 关联） */
  const [chordGroups, setChordGroups] = usePersistentState<ChordGroup[]>(
    'chord_groups',
    INITIAL_CHORD_GROUPS,
    {
      storageKey: 'guitarmate_chord_groups',
      sanitize: (value) => (Array.isArray(value) ? (value as ChordGroup[]) : null),
    },
  );

  /** 当前焦点课时：课程大纲 / 视频库 / 和弦阶梯三个工作台共享它 */
  const [selectedLesson, setSelectedLesson] = useState<LessonStep>(() => firstLessonOf(stages));

  // Modal & Notification states
  const [isContractModalOpen, setIsContractModalOpen] = useState<boolean>(false);
  /**
   * 六线谱导入工作台保存后，把 scoreId 交给「音频与六线谱对齐」工作台自动绑定，
   * 管理员就不用手工复制粘贴 Score ID 了。
   */
  const [pendingRemoteScoreId, setPendingRemoteScoreId] = useState<string>('');
  /**
   * 「校正工作台 ↔ 预览页」双向跳转的项目 id。
   * 流程：音乐库「编辑六线谱」/ 预览页「返回编辑」/ 契约页回跳都通过它定位到同一个项目。
   */
  const [pendingTranscriptionProjectId, setPendingTranscriptionProjectId] = useState<string>('');
  /** 正在预览的转录项目 id（预览页是 **per-song** 的，不进侧边栏） */
  const [previewProjectId, setPreviewProjectId] = useState<string>('');
  /** 「生成数据契约」跳转时要把哪个转录项目带进契约核准页 */
  const [pendingImportProjectId, setPendingImportProjectId] = useState<string>('');
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
  /**
   * 「编辑六线谱」/「新增曲目」统一进入 **① 音频导入与六线谱校正工作台**：
   * - 有 `sourceProjectId`（自动转录发布过来的曲目）→ 直接打开该转录项目继续校正；
   * - 没有（人工建的曲目）→ 进入导入首屏，引导「上传音频 / 音频 URL」新建转录项目。
   */
  const handleSelectTrackForEditing = (track: MusicTrack) => {
    setActiveTrack(track);
    setAudioSyncConfig(track.tabConfig || INITIAL_AUDIO_TAB_SYNC);
    setHasUnsavedChanges(true);
    setPendingTranscriptionProjectId(track.sourceProjectId || '');
    setActiveTab('transcription-review');
    setSaveBannerMessage(
      track.sourceProjectId
        ? `🎼 已载入转录项目《${track.title}》进入六线谱校正工作台`
        : `🆕 《${track.title}》还没有转录项目 —— 请在上传区导入音频或粘贴音频 URL 开始`,
    );
    setTimeout(() => setSaveBannerMessage(null), 4000);
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

  /**
   * 课时改动统一入口：
   * 1. 更新「焦点课时」（供顶部/其它工作台立即反映）；
   * 2. 用 `replaceLesson` 写回课程体系树的**正确章节**（不会漏掉某一层）。
   */
  const handleUpdateLesson = (updatedLesson: LessonStep) => {
    setSelectedLesson(updatedLesson);
    setStages((prev) => replaceLesson(prev, updatedLesson));
    setHasUnsavedChanges(true);
  };

  /**
   * 删除教学视频时，把该视频从**所有课时**的 `videoIds` / 主视频旧字段里摘掉。
   * 不做这一步的话，课程体系里会留下一堆指向已删视频的悬空引用。
   */
  const handleDetachVideoFromLessons = (videoId: string) => {
    setStages((prev) =>
      prev.map((stage) => ({
        ...stage,
        courses: stage.courses.map((course) => ({
          ...course,
          chapters: course.chapters.map((chapter) => ({
            ...chapter,
            lessons: chapter.lessons.map((lessonItem) => ({
              ...lessonItem,
              videoIds: (lessonItem.videoIds || []).filter((id) => id !== videoId),
              videoData:
                lessonItem.videoData?.videoId === videoId
                  ? { ...lessonItem.videoData, videoId: '' }
                  : lessonItem.videoData,
            })),
          })),
        })),
      })),
    );
    setSelectedLesson((prev) => ({
      ...prev,
      videoIds: (prev.videoIds || []).filter((id) => id !== videoId),
      videoData:
        prev.videoData?.videoId === videoId ? { ...prev.videoData, videoId: '' } : prev.videoData,
    }));
  };

  /** 课程体系里所有课时的「已关联视频 id」——删除视频前的引用影响面提示 */
  const lessonVideoOwners = useMemo(
    () =>
      flattenLessons(stages).map((flat) => ({
        name: `${flat.stageCode} · ${flat.lesson.title}`,
        ids: flat.lesson.videoIds || [],
      })),
    [stages],
  );

  /** 课程体系里所有课时的「已关联和弦组 id」——删除和弦组前的引用影响面提示 */
  const lessonGroupOwners = useMemo(
    () =>
      flattenLessons(stages).map((flat) => ({
        name: `${flat.stageCode} · ${flat.lesson.title}`,
        ids: flat.lesson.chordGroupIds || [],
      })),
    [stages],
  );

  /**
   * 删除和弦练习组时，把该组从**所有课时**的 `chordGroupIds` 里摘掉。
   */
  const handleDetachChordGroupFromLessons = (groupId: string) => {
    setStages((prev) =>
      prev.map((stage) => ({
        ...stage,
        courses: stage.courses.map((course) => ({
          ...course,
          chapters: course.chapters.map((chapter) => ({
            ...chapter,
            lessons: chapter.lessons.map((lessonItem) => ({
              ...lessonItem,
              chordGroupIds: (lessonItem.chordGroupIds || []).filter((id) => id !== groupId),
            })),
          })),
        })),
      })),
    );
    setSelectedLesson((prev) => ({
      ...prev,
      chordGroupIds: (prev.chordGroupIds || []).filter((id) => id !== groupId),
    }));
  };

  /**
   * 预览页发布成功 → **回写音乐库**（需求 4：发布后的音频要出现在音乐库工程列表）。
   *
   * 音乐库目前是「本地工程列表（localStorage）」，所以这里做 **upsert**：
   * - 已存在同 `backendScoreId` 的条目 → 更新状态/时间；
   * - 否则新建一条 `published` 工程，并记下 `sourceProjectId`，
   *   这样列表里的「编辑六线谱」能直接回到这个转录项目继续改。
   */
  const handleSongPublished = (result: ApiTranscriptionPublishResult, title: string) => {
    const scoreId = result.mirrored?.scoreId;
    if (!scoreId) {
      setSaveBannerMessage(
        '⚠️ PracticePackage 已发布，但没有镜像到 Score 链路 → 音乐库不会出现条目。请用预览页的「发布到小程序」（已开启镜像）。',
      );
      setTimeout(() => setSaveBannerMessage(null), 8000);
      return;
    }
    const now = new Date().toISOString();
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.backendScoreId === scoreId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          title: title || next[idx].title,
          status: 'published' as MusicStatus,
          backendScoreId: scoreId,
          sourceProjectId: previewProjectId || next[idx].sourceProjectId,
          updatedAt: now,
        };
        return next;
      }
      const template = prev[0] || INITIAL_MUSIC_TRACKS[0];
      const created: MusicTrack = {
        ...template,
        id: `track-${Date.now()}`,
        title: title || '未命名曲目',
        status: 'published' as MusicStatus,
        currentVersion: `r${result.revision}`,
        versions: [] as MusicVersion[],
        tags: Array.from(new Set([...(template.tags || []), '自动转录'])),
        createdAt: now,
        updatedAt: now,
        cEndPlayCount: 0,
        backendScoreId: scoreId,
        sourceProjectId: previewProjectId || undefined,
      };
      return [created, ...prev];
    });
    setSaveBannerMessage(`🚀 《${title || '未命名曲目'}》已发布到小程序，并写入音乐库工程列表`);
    setTimeout(() => setSaveBannerMessage(null), 6000);
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
              initialProjectId={pendingImportProjectId}
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

          {/* 2c. Tab Layout Preview（把位优先 / 一行 2-3 小节的谱行排版预览） */}
          {activeTab === 'tab-layout-preview' && <TabLayoutPreviewStudio darkMode={darkMode} />}

          {/* 2c. 曲目预览（per-song：按小程序渲染 + 音频对齐播放，不进侧边栏） */}
          {activeTab === 'song-preview' && (
            <SongPreviewPanel
              projectId={previewProjectId}
              darkMode={darkMode}
              onBackToEdit={(projectId) => {
                setPendingTranscriptionProjectId(projectId);
                setActiveTab('transcription-review');
              }}
              onOpenContract={(projectId) => {
                setPendingImportProjectId(projectId);
                setActiveTab('tab-import');
                setSaveBannerMessage('🔗 已把该曲目的六线谱带入「数据契约核准」—— 校对统一 JSON 后即可发布到小程序');
                setTimeout(() => setSaveBannerMessage(null), 6000);
              }}
              onPublished={(result, title) => handleSongPublished(result, title)}
            />
          )}

          {/* 2d. Transcription Review（音频 → 转录 → 逐音符复核 → PracticePackage） */}
          {activeTab === 'transcription-review' && (
            <ReviewPage
              darkMode={darkMode}
              initialProjectId={pendingTranscriptionProjectId}
              onPreviewProject={(projectId) => {
                setPreviewProjectId(projectId);
                setActiveTab('song-preview');
              }}
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

          {/* 3. Curriculum Outline Studio（课程大纲增删改查 + 20 分钟切片 + 资源关联） */}
          {activeTab === 'curriculum' && (
            <CurriculumOutlineStudio
              stages={stages}
              onChangeStages={setStages}
              selectedLesson={selectedLesson}
              onSelectLesson={setSelectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
              videoLibrary={videoLibrary}
              chordGroups={chordGroups}
              onGoToVideoStudio={() => setActiveTab('video-cms')}
              onGoToChordStudio={() => setActiveTab('chord-drill')}
            />
          )}

          {/* 4. Video Keypoint CMS Studio（视频库 CRUD + 课时多对多关联 + 打点） */}
          {activeTab === 'video-cms' && (
            <VideoTimestampStudio
              lesson={selectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
              videoLibrary={videoLibrary}
              onChangeVideoLibrary={setVideoLibrary}
              onDetachVideoFromLessons={handleDetachVideoFromLessons}
              lessonOwners={lessonVideoOwners}
              chordLibrary={chords}
              onGoToCurriculum={() => setActiveTab('curriculum')}
            />
          )}

          {/* 5. Chord Drill & BPM Step Studio（和弦库 / 练习组 / 阶梯阶段 CRUD） */}
          {activeTab === 'chord-drill' && (
            <ChordDrillStudio
              lesson={selectedLesson}
              onChangeLesson={handleUpdateLesson}
              darkMode={darkMode}
              chords={chords}
              onChangeChords={setChords}
              chordGroups={chordGroups}
              onChangeChordGroups={setChordGroups}
              onDetachChordGroupFromLessons={handleDetachChordGroupFromLessons}
              lessonOwners={lessonGroupOwners}
              onGoToCurriculum={() => setActiveTab('curriculum')}
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
