import React, { useState, useMemo } from 'react';
import {
  Music,
  Plus,
  Search,
  Filter,
  SlidersHorizontal,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  Tag,
  Clock,
  CheckCircle2,
  FileEdit,
  Archive,
  Eye,
  GitBranch,
  Volume2,
  ChevronRight,
  Layers,
  Sparkles,
  Smartphone,
  Play,
  RotateCcw,
  Check,
  X,
  MoreVertical,
} from 'lucide-react';
import { MusicTrack, MusicStatus, AudioTabSyncConfig } from '../../types';
import { audioEngine } from '../../utils/audioEngine';

interface MusicLibraryStudioProps {
  tracks: MusicTrack[];
  onSelectTrackForEditing: (track: MusicTrack) => void;
  onAddNewTrack: (newTrack: MusicTrack) => void;
  onUpdateTrack: (updatedTrack: MusicTrack) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleStatus?: (trackId: string, status: MusicStatus) => void;
  darkMode: boolean;
}

export const MusicLibraryStudio: React.FC<MusicLibraryStudioProps> = ({
  tracks,
  onSelectTrackForEditing,
  onAddNewTrack,
  onUpdateTrack,
  onDeleteTrack,
  onToggleStatus,
  darkMode,
}) => {
  // Filters & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showCendPreview, setShowCendPreview] = useState<boolean>(false);

  // Modal / Drawer states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMetadataTrack, setEditingMetadataTrack] = useState<MusicTrack | null>(null);
  const [versionHistoryTrack, setVersionHistoryTrack] = useState<MusicTrack | null>(null);

  // New Track form state
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newGenre, setNewGenre] = useState<MusicTrack['genre']>('流行弹唱');
  const [newDifficulty, setNewDifficulty] = useState<MusicTrack['difficulty']>('入门');
  const [newKey, setNewKey] = useState('C大调');
  const [newBpm, setNewBpm] = useState<number>(80);
  const [newStatus, setNewStatus] = useState<MusicStatus>('draft');

  // Filter logic
  const filteredTracks = useMemo(() => {
    return tracks.filter((t) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchArtist = t.artist.toLowerCase().includes(q);
        const matchKey = t.keySignature.toLowerCase().includes(q);
        const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchArtist && !matchKey && !matchTags) return false;
      }
      // Genre
      if (selectedGenre !== 'all' && t.genre !== selectedGenre) return false;
      // Status
      if (selectedStatus !== 'all' && t.status !== selectedStatus) return false;
      // Difficulty
      if (selectedDifficulty !== 'all' && t.difficulty !== selectedDifficulty) return false;

      return true;
    });
  }, [tracks, searchQuery, selectedGenre, selectedStatus, selectedDifficulty]);

  // Counts
  const counts = useMemo(() => {
    return {
      total: tracks.length,
      published: tracks.filter((t) => t.status === 'published').length,
      draft: tracks.filter((t) => t.status === 'draft').length,
      archive: tracks.filter((t) => t.status === 'archive').length,
    };
  }, [tracks]);

  // Handle adding new track
  const handleCreateTrack = () => {
    if (!newTitle.trim()) return;

    // Create empty 128 waveform & empty measures at newBpm
    const duration = 20.0;
    const measureDuration = (60 / newBpm) * 4;
    const measureTimestamps: number[] = [];
    for (let t = 0; t < duration; t += measureDuration) {
      measureTimestamps.push(Number(t.toFixed(2)));
    }

    const defaultWaveform = Array.from({ length: 128 }, (_, i) => {
      const beat = (i % 16) / 16;
      return Number((0.2 + 0.6 * Math.exp(-beat * 2.5)).toFixed(3));
    });

    const newTabConfig: AudioTabSyncConfig = {
      audioId: `audio-${Date.now()}`,
      audioTitle: newTitle.trim(),
      audioDurationSec: duration,
      waveformPeaks: defaultWaveform,
      bpm: newBpm,
      timeSignature: [4, 4],
      playbackOffsetMs: 0,
      measureTimestamps,
      noteTimestamps: [
        {
          id: `n-${Date.now()}-1`,
          measureIndex: 0,
          stringIndex: 5,
          fret: 3,
          timestampSec: 0.0,
          durationSec: 0.5,
          technique: 'normal',
          chordName: newKey.startsWith('C') ? 'C' : 'G',
        },
      ],
    };

    const newTrack: MusicTrack = {
      id: `track-${Date.now()}`,
      title: newTitle.trim(),
      artist: newArtist.trim() || '教研组编配',
      genre: newGenre,
      difficulty: newDifficulty,
      keySignature: newKey,
      status: newStatus,
      currentVersion: 'v1.0',
      cEndPlayCount: 0,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      tags: ['新曲目', newGenre, newKey],
      tabConfig: newTabConfig,
      versions: [
        {
          versionNumber: 'v1.0',
          note: '初始创建：待在对齐工作台中精细打点',
          updatedAt: new Date().toLocaleString(),
          status: newStatus,
          config: newTabConfig,
        },
      ],
    };

    onAddNewTrack(newTrack);
    setIsAddModalOpen(false);
    // Reset form
    setNewTitle('');
    setNewArtist('');
    // Promptly open this new track in the Audio Tab Sync Studio
    onSelectTrackForEditing(newTrack);
  };

  const handleStatusQuickChange = (track: MusicTrack, status: MusicStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleStatus) {
      onToggleStatus(track.id, status);
    } else {
      onUpdateTrack({
        ...track,
        status,
        updatedAt: new Date().toISOString().split('T')[0],
      });
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: MusicStatus) => {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>已发布 (C端学员可见)</span>
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <FileEdit className="w-3 h-3" />
            <span>草稿 (打点中)</span>
          </span>
        );
      case 'archive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <Archive className="w-3 h-3" />
            <span>已存档 (历史归档)</span>
          </span>
        );
    }
  };

  return (
    <div id="music-library-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner with Stats & Primary Actions */}
      <div
        className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold tracking-tight">音乐库与六线谱资产工程</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Music Project CMS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              管理全量曲目工程、多版本演进、状态流转（草稿/存档/已发布）与六线谱挂谱编辑
            </p>
          </div>
        </div>

        {/* Action Controls: C-end Preview switch & Add Track CTA */}
        <div className="flex items-center gap-3">
          {/* C-end Student Preview Toggle */}
          <button
            onClick={() => setShowCendPreview(!showCendPreview)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
              showCendPreview
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{showCendPreview ? '退出C端学员视图' : '预览 C 端学员曲库'}</span>
          </button>

          {/* + Add New Track Button (Required by User Prompt: 首页的音乐列表添加一个增加按钮，点击按钮进入当前的‘音频与六线谱对齐’界面) */}
          <button
            id="btn-add-music-track"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新增曲目：导入音频并生成六线谱</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar & Statistics Counter */}
      <div
        className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        {/* Left: Search input & Category Tabs */}
        <div className="flex items-center gap-3 flex-1 min-w-[300px]">
          {/* Search Box */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索歌名、原唱、调式或标签..."
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border outline-hidden transition-all ${
                darkMode
                  ? 'bg-slate-800/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-amber-400'
                  : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-amber-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Genre Filters */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-medium">
            {[
              { key: 'all', label: '全部类型' },
              { key: '流行弹唱', label: '流行弹唱' },
              { key: '民谣吉他', label: '民谣吉他' },
              { key: '指弹独奏', label: '指弹独奏' },
              { key: '摇滚前奏', label: '摇滚前奏' },
              { key: '综合练习曲', label: '综合练习曲' },
            ].map((g) => (
              <button
                key={g.key}
                onClick={() => setSelectedGenre(g.key)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedGenre === g.key
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Status Filters & View switch */}
        <div className="flex items-center gap-3 text-xs">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/60 border border-slate-700 font-mono">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedStatus === 'all'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部 ({counts.total})
            </button>
            <button
              onClick={() => setSelectedStatus('published')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                selectedStatus === 'published'
                  ? 'bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'text-emerald-400/80 hover:text-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>已发布 ({counts.published})</span>
            </button>
            <button
              onClick={() => setSelectedStatus('draft')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                selectedStatus === 'draft'
                  ? 'bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40'
                  : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <FileEdit className="w-3 h-3" />
              <span>草稿 ({counts.draft})</span>
            </button>
            <button
              onClick={() => setSelectedStatus('archive')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                selectedStatus === 'archive'
                  ? 'bg-slate-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Archive className="w-3 h-3" />
              <span>已存档 ({counts.archive})</span>
            </button>
          </div>

          {/* Difficulty Dropdown */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <option value="all">难度全部</option>
            <option value="入门">入门 (Beginner)</option>
            <option value="进阶">进阶 (Intermediate)</option>
            <option value="挑战">挑战 (Advanced)</option>
          </select>

          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-slate-700 p-0.5 bg-slate-800/60">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 rounded-lg ${
                viewMode === 'grid' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              卡片
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded-lg ${
                viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              表格
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-0">
        {/* Banner if in C-end Learner Preview Mode */}
        {showCendPreview && (
          <div className="mb-6 p-4 rounded-2xl border border-indigo-500/40 bg-indigo-950/30 text-indigo-200 flex items-center justify-between backdrop-blur-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-300">
                  C端学员端·在线曲库视图模拟 (已自动过滤未发布草稿与已存档曲目)
                </h4>
                <p className="text-[11px] text-slate-400">
                  当前仅呈现状态为 <code className="text-emerald-400 font-mono">published</code> 的音乐列表，学员可自由点播并进入六线谱跟弹训练
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              C端在线可用曲目: {tracks.filter((t) => t.status === 'published').length} 首
            </span>
          </div>
        )}

        {/* Empty state */}
        {filteredTracks.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 rounded-full bg-slate-800/80 text-slate-500">
              <Music className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-300">未找到符合筛选条件的曲目</h3>
              <p className="text-xs text-slate-500 mt-1">请尝试调整搜索关键词或重置类型/状态筛选器</p>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedGenre('all');
                setSelectedStatus('all');
                setSelectedDifficulty('all');
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              重置筛选条件
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredTracks
              .filter((t) => (showCendPreview ? t.status === 'published' : true))
              .map((track) => {
                return (
                  <div
                    key={track.id}
                    className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden group ${
                      darkMode
                        ? 'bg-slate-900/80 border-slate-800 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/5'
                        : 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md'
                    }`}
                  >
                    {/* Card Header: Title, Artist, Status Badge */}
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3
                            onClick={() => onSelectTrackForEditing(track)}
                            className="text-sm font-bold text-slate-100 hover:text-amber-400 cursor-pointer truncate transition-colors"
                            title={track.title}
                          >
                            {track.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5 truncate flex items-center gap-1.5">
                            <span>原唱/伴奏: {track.artist}</span>
                            <span className="text-slate-600">·</span>
                            <span className="font-mono text-amber-400/90">{track.keySignature}</span>
                          </p>
                        </div>

                        {/* Status dropdown quick toggle */}
                        <div className="shrink-0">{renderStatusBadge(track.status)}</div>
                      </div>

                      {/* Mini Waveform Visualization & BPM pill */}
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="flex items-end gap-0.5 h-6 flex-1 overflow-hidden opacity-80">
                          {track.tabConfig.waveformPeaks.slice(0, 32).map((peak, pIdx) => (
                            <div
                              key={pIdx}
                              className="flex-1 rounded-xs bg-amber-400/70"
                              style={{ height: `${Math.max(15, peak * 100)}%` }}
                            />
                          ))}
                        </div>

                        <div className="text-[10px] font-mono shrink-0 text-slate-400 flex flex-col items-end">
                          <span className="text-slate-300 font-bold">{track.tabConfig.bpm || 80} BPM</span>
                          <span>{track.tabConfig.audioDurationSec.toFixed(1)}s</span>
                        </div>
                      </div>

                      {/* Tags & Difficulty */}
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                            {track.genre}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border font-medium ${
                              track.difficulty === '入门'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : track.difficulty === '进阶'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {track.difficulty}
                          </span>
                        </div>

                        {/* Version badge */}
                        <button
                          onClick={() => setVersionHistoryTrack(track)}
                          className="font-mono text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-1 hover:underline"
                        >
                          <GitBranch className="w-3 h-3" />
                          <span>{track.currentVersion} ({track.versions.length}版)</span>
                        </button>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div
                      className={`px-5 py-3 border-t flex items-center justify-between text-xs ${
                        darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      {/* Left: Quick Status Switcher */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleStatusQuickChange(track, 'draft', e)}
                          title="设为草稿"
                          className={`p-1 rounded hover:bg-slate-800 ${
                            track.status === 'draft' ? 'text-amber-400 font-bold' : 'text-slate-500'
                          }`}
                        >
                          草稿
                        </button>
                        <span className="text-slate-700">/</span>
                        <button
                          onClick={(e) => handleStatusQuickChange(track, 'published', e)}
                          title="发布给C端学员"
                          className={`p-1 rounded hover:bg-slate-800 ${
                            track.status === 'published' ? 'text-emerald-400 font-bold' : 'text-slate-500'
                          }`}
                        >
                          发布
                        </button>
                        <span className="text-slate-700">/</span>
                        <button
                          onClick={(e) => handleStatusQuickChange(track, 'archive', e)}
                          title="历史存档"
                          className={`p-1 rounded hover:bg-slate-800 ${
                            track.status === 'archive' ? 'text-slate-300 font-bold' : 'text-slate-500'
                          }`}
                        >
                          存档
                        </button>
                      </div>

                      {/* Right: Enter Tab Alignment & Delete */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingMetadataTrack(track)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                          title="编辑曲目属性"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeleteTrack(track.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          title="删除曲目"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Primary Button: Click to edit tab in Audio-Tab Studio */}
                        <button
                          onClick={() => onSelectTrackForEditing(track)}
                          className="px-3 py-1.5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                        >
                          <span>编辑六线谱</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          /* Table View */
          <div
            className={`rounded-2xl border overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono bg-slate-950/40">
                  <th className="py-3 px-4">曲目名称 / 原唱</th>
                  <th className="py-3 px-4">分类类型</th>
                  <th className="py-3 px-4">调式 / 速度</th>
                  <th className="py-3 px-4">难度</th>
                  <th className="py-3 px-4">版本管理</th>
                  <th className="py-3 px-4">当前状态</th>
                  <th className="py-3 px-4">更新时间</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTracks
                  .filter((t) => (showCendPreview ? t.status === 'published' : true))
                  .map((track) => (
                    <tr
                      key={track.id}
                      className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                      onClick={() => onSelectTrackForEditing(track)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                          {track.title}
                        </div>
                        <div className="text-[11px] text-slate-400">{track.artist}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                          {track.genre}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        <span>{track.keySignature}</span>
                        <span className="text-slate-500 mx-1">·</span>
                        <span className="text-amber-400">{track.tabConfig.bpm} BPM</span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                            track.difficulty === '入门'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : track.difficulty === '进阶'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {track.difficulty}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setVersionHistoryTrack(track)}
                          className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-400/50 flex items-center gap-1 text-[11px]"
                        >
                          <GitBranch className="w-3 h-3" />
                          <span>{track.currentVersion}</span>
                        </button>
                      </td>

                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {renderStatusBadge(track.status)}
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {track.updatedAt}
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onSelectTrackForEditing(track)}
                            className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-colors text-xs flex items-center gap-1"
                          >
                            <span>编辑挂谱</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => onDeleteTrack(track.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Add New Track (进入音频与六线谱对齐) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-lg rounded-3xl border flex flex-col shadow-2xl p-6 space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">创建新音乐曲目并初始化六线谱</h3>
                  <p className="text-xs text-slate-400">设定基本信息后立即提取进入对齐打点工作台</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  曲目名称 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：《夜空中最亮的星》扫弦对齐..."
                  className={`w-full p-2.5 rounded-xl border ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">原唱 / 艺术家</label>
                  <input
                    type="text"
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                    placeholder="例如：逃跑计划"
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">分类类型</label>
                  <select
                    value={newGenre}
                    onChange={(e) => setNewGenre(e.target.value as MusicTrack['genre'])}
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="流行弹唱">流行弹唱</option>
                    <option value="民谣吉他">民谣吉他</option>
                    <option value="指弹独奏">指弹独奏</option>
                    <option value="摇滚前奏">摇滚前奏</option>
                    <option value="综合练习曲">综合练习曲</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">调式</label>
                  <select
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="C大调">C大调</option>
                    <option value="G大调">G大调</option>
                    <option value="D大调">D大调</option>
                    <option value="A小调">A小调</option>
                    <option value="E小调">E小调</option>
                    <option value="F大调">F大调</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">预设速度 (BPM)</label>
                  <input
                    type="number"
                    value={newBpm}
                    onChange={(e) => setNewBpm(parseInt(e.target.value, 10) || 80)}
                    className={`w-full p-2.5 rounded-xl border font-mono ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">难度等级</label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value as MusicTrack['difficulty'])}
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="入门">入门</option>
                    <option value="进阶">进阶</option>
                    <option value="挑战">挑战</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">初始发布状态</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === 'draft'}
                      onChange={() => setNewStatus('draft')}
                      className="accent-amber-500"
                    />
                    <span>草稿 (draft - 推荐先打点)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === 'published'}
                      onChange={() => setNewStatus('published')}
                      className="accent-emerald-500"
                    />
                    <span>直接发布 (published)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleCreateTrack}
                disabled={!newTitle.trim()}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>创建并立即进入对齐界面</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Metadata */}
      {editingMetadataTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-lg rounded-3xl border flex flex-col shadow-2xl p-6 space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">编辑曲目基本属性</h3>
                  <p className="text-xs text-slate-400">修改标题、难度或标签</p>
                </div>
              </div>
              <button
                onClick={() => setEditingMetadataTrack(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">曲目标题</label>
                <input
                  type="text"
                  value={editingMetadataTrack.title}
                  onChange={(e) =>
                    setEditingMetadataTrack({ ...editingMetadataTrack, title: e.target.value })
                  }
                  className={`w-full p-2.5 rounded-xl border ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">原唱/伴奏</label>
                  <input
                    type="text"
                    value={editingMetadataTrack.artist}
                    onChange={(e) =>
                      setEditingMetadataTrack({ ...editingMetadataTrack, artist: e.target.value })
                    }
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">流派类型</label>
                  <select
                    value={editingMetadataTrack.genre}
                    onChange={(e) =>
                      setEditingMetadataTrack({
                        ...editingMetadataTrack,
                        genre: e.target.value as MusicTrack['genre'],
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="流行弹唱">流行弹唱</option>
                    <option value="民谣吉他">民谣吉他</option>
                    <option value="指弹独奏">指弹独奏</option>
                    <option value="摇滚前奏">摇滚前奏</option>
                    <option value="综合练习曲">综合练习曲</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">状态</label>
                  <select
                    value={editingMetadataTrack.status}
                    onChange={(e) =>
                      setEditingMetadataTrack({
                        ...editingMetadataTrack,
                        status: e.target.value as MusicStatus,
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="draft">草稿 (draft)</option>
                    <option value="published">已发布 (published)</option>
                    <option value="archive">已存档 (archive)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">难度</label>
                  <select
                    value={editingMetadataTrack.difficulty}
                    onChange={(e) =>
                      setEditingMetadataTrack({
                        ...editingMetadataTrack,
                        difficulty: e.target.value as MusicTrack['difficulty'],
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="入门">入门</option>
                    <option value="进阶">进阶</option>
                    <option value="挑战">挑战</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingMetadataTrack(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onUpdateTrack(editingMetadataTrack);
                  setEditingMetadataTrack(null);
                }}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>保存属性修改</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Version History & Switcher */}
      {versionHistoryTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
          <div
            className={`w-full max-w-xl rounded-3xl border flex flex-col shadow-2xl p-6 space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    版本演进历史: {versionHistoryTrack.title}
                  </h3>
                  <p className="text-xs text-slate-400">
                    当前版本: <span className="font-mono text-amber-400 font-bold">{versionHistoryTrack.currentVersion}</span> ·
                    共 {versionHistoryTrack.versions.length} 个历史发行/草稿版本
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVersionHistoryTrack(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Versions List */}
            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {versionHistoryTrack.versions.map((ver, idx) => {
                const isCurrent = ver.versionNumber === versionHistoryTrack.currentVersion;
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCurrent
                        ? 'bg-amber-950/20 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                          {ver.versionNumber}
                        </span>
                        <span className="text-xs font-mono text-slate-400">{ver.updatedAt}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            当前生效中
                          </span>
                        )}
                      </div>

                      {renderStatusBadge(ver.status)}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3">{ver.note}</p>

                    <div className="flex items-center justify-end gap-2 text-xs">
                      {!isCurrent && (
                        <button
                          onClick={() => {
                            const updated = {
                              ...versionHistoryTrack,
                              currentVersion: ver.versionNumber,
                              tabConfig: ver.config,
                              status: ver.status,
                            };
                            onUpdateTrack(updated);
                            setVersionHistoryTrack(updated);
                          }}
                          className="px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300"
                        >
                          切换回该版本
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setVersionHistoryTrack(null);
                          onSelectTrackForEditing({
                            ...versionHistoryTrack,
                            currentVersion: ver.versionNumber,
                            tabConfig: ver.config,
                          });
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1"
                      >
                        <span>编辑此版本挂谱</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setVersionHistoryTrack(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
