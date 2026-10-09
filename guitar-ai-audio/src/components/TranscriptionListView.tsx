import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Heart, 
  RotateCw, 
  ChevronDown, 
  Plus, 
  Sparkles, 
  Music, 
  SlidersHorizontal, 
  ArrowUpDown, 
  Play, 
  Check, 
  Globe, 
  Moon, 
  Sun, 
  MoreHorizontal,
  FolderOpen,
  Cloud,
  FileText,
  Home,
  Mic
} from 'lucide-react';
import { ScoreData } from '../types/music';
import { TranscriptionItem } from '../data/libraryData';
import { GuitarMateLogo } from './GuitarMateLogo';
import { NotificationBell } from './NotificationBell';

interface TranscriptionListViewProps {
  libraryItems: TranscriptionItem[];
  onSelectSong: (score: ScoreData) => void;
  onNewTranscription: () => void;
  onToggleFavorite: (id: string) => void;
  onGoHome: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenCourse?: (courseId?: string) => void;
}

export const TranscriptionListView: React.FC<TranscriptionListViewProps> = ({
  libraryItems,
  onSelectSong,
  onNewTranscription,
  onToggleFavorite,
  onGoHome,
  theme = 'light',
  onToggleTheme,
  onOpenAccountSettings,
  onOpenCourse,
}) => {
  // Tabs: 'user' (用户自己生成的transcription) vs 'system' (系统生成的参考练习用)
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Filters matching filter.png
  const [instrumentFilter, setInstrumentFilter] = useState<string>('All Instruments');
  const [isInstrumentMenuOpen, setIsInstrumentMenuOpen] = useState(false);

  // Type Filter (Unlocked vs Trial with checkboxes, matching filter.png)
  const [filterUnlocked, setFilterUnlocked] = useState(true);
  const [filterTrial, setFilterTrial] = useState(true);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);

  // Sort
  const [sortOption, setSortOption] = useState<'recently' | 'title' | 'tempo'>('recently');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return libraryItems
      .filter((item) => {
        // Tab category
        if (item.category !== activeTab) return false;

        // Instrument filter
        if (instrumentFilter !== 'All Instruments' && item.instrument !== instrumentFilter) {
          return false;
        }

        // Type filter (Unlocked / Trial)
        if (!filterUnlocked && item.type === 'unlocked') return false;
        if (!filterTrial && item.type === 'trial') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchSubtitle = item.subtitle.toLowerCase().includes(q);
          const matchArtist = item.artist.toLowerCase().includes(q);
          const matchKey = item.keySignature.toLowerCase().includes(q);
          if (!matchTitle && !matchSubtitle && !matchArtist && !matchKey) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'recently') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortOption === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortOption === 'tempo') {
          return b.tempo - a.tempo;
        }
        return 0;
      });
  }, [libraryItems, activeTab, instrumentFilter, filterUnlocked, filterTrial, searchQuery, sortOption]);

  const userItemsCount = libraryItems.filter((i) => i.category === 'user').length;
  const systemItemsCount = libraryItems.filter((i) => i.category === 'system').length;

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-gray-900 flex flex-col font-sans select-none">
      
      {/* Top App Header (matching my-transcription.png) */}
      <header className="h-14 bg-white border-b border-gray-200/90 px-3 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Button to go back to Home (Audio Ingestion) */}
          <button
            onClick={onGoHome}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:text-emerald-800 bg-gray-100 hover:bg-emerald-50 border border-gray-200 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
            title="返回首页音频录入页面"
          >
            <Home className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">返回首页</span>
            <span className="sm:hidden">首页</span>
          </button>

          <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>

          <div 
            onClick={onGoHome}
            className="flex items-center space-x-2 cursor-pointer group"
            title="点击返回首页音频录入页面"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></div>
            <span className="font-extrabold text-gray-900 group-hover:text-emerald-800 tracking-tight text-sm sm:text-base transition-colors">
              吉他伴奏音乐库
            </span>
            <span className="text-gray-400 text-xs hidden sm:inline">| GuitarMate Library</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Audio Ingest shortcut */}
          <button
            onClick={onGoHome}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            title="前往音频录入页面（上传文件、录音、粘贴链接）"
          >
            <Mic className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">录入音频</span>
            <span className="sm:hidden">录入</span>
          </button>

          {/* New Transcription Action Button */}
          <button
            onClick={onNewTranscription}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#12785f] hover:bg-[#0f644f] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="快速转谱向导"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建转谱</span>
          </button>

          {/* Icon pills matching my-transcription.png */}
          <div className="hidden sm:flex items-center space-x-1 text-gray-500">
            {onToggleTheme && (
              <button 
                onClick={onToggleTheme} 
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" 
                title={theme === 'light' ? '切换为夜间深色模式' : '切换为日间明亮模式'}
              >
                {theme === 'light' ? <Moon className="w-4 h-4 text-gray-600" /> : <Sun className="w-4 h-4 text-amber-500" />}
              </button>
            )}
            {onOpenAccountSettings && (
              <button 
                onClick={onOpenAccountSettings} 
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-emerald-700 transition-colors cursor-pointer" 
                title="Account Settings (账户设置)"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
            <button className="flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-gray-100 text-xs transition-colors" title="Language">
              <span className="font-semibold text-[11px]">文/A 中</span>
            </button>

            {/* Bell Notification */}
            <NotificationBell
              onOpenScore={(sid) => {
                const found = libraryItems.find((s) => s.id === sid);
                if (found) {
                  onSelectSong(found.score);
                }
              }}
              onOpenCourse={onOpenCourse}
            />
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
        
        {/* Page Title & Stats */}
        <div className="flex items-start justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              曲谱曲库
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              支持一键切换自转谱与官方精选练习曲谱，点击任意曲目即可直接进入单曲编辑与伴奏练习
            </p>
          </div>

          {/* Count suffix badge (matching my-transcription.png) */}
          <div className="flex items-center space-x-1 bg-white px-3 py-1.5 rounded-full border border-gray-200 text-xs font-mono text-gray-600 shadow-xs shrink-0">
            <span>{filteredItems.length} 首曲目</span>
            <button 
              onClick={() => {
                setSearchQuery('');
                setInstrumentFilter('All Instruments');
                setFilterUnlocked(true);
                setFilterTrial(true);
              }}
              className="text-gray-400 hover:text-gray-600 ml-1 p-0.5" 
              title="Reset filters"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2 Main List Category Switchers (as requested by user) */}
        <div className="flex items-center space-x-2 bg-gray-200/80 p-1 rounded-2xl mb-4 max-w-md">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'system'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>系统精选练习曲</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
              {systemItemsCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('user')}
            className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'user'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-emerald-600" />
            <span>我的转谱</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
              {userItemsCount}
            </span>
          </button>
        </div>

        {/* Search Bar (matching my-transcription.png) */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索吉他曲目、歌手、调性、和弦..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-xs transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              清除
            </button>
          )}
        </div>

        {/* Filter Pills Bar (matching filter.png) */}
        <div className="flex flex-wrap items-center gap-2 mb-5 text-xs select-none">
          
          {/* Filter 1: All Instruments */}
          <div className="relative">
            <button
              onClick={() => {
                setIsInstrumentMenuOpen(!isInstrumentMenuOpen);
                setIsTypeMenuOpen(false);
                setIsSortMenuOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-2xs cursor-pointer"
            >
              <span>{instrumentFilter}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isInstrumentMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-40 animate-in fade-in zoom-in-95">
                {['All Instruments', 'Acoustic Guitar', 'Electric Guitar', 'Classical Guitar', 'Bass'].map((inst) => (
                  <button
                    key={inst}
                    onClick={() => {
                      setInstrumentFilter(inst);
                      setIsInstrumentMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      instrumentFilter === inst
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{inst}</span>
                    {instrumentFilter === inst && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter 2: All Types (Dropdown with checkboxes matching filter.png) */}
          <div className="relative">
            <button
              onClick={() => {
                setIsTypeMenuOpen(!isTypeMenuOpen);
                setIsInstrumentMenuOpen(false);
                setIsSortMenuOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-2xs cursor-pointer"
            >
              <span>All Types</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Checkbox Popover matching filter.png screenshot */}
            {isTypeMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-40 animate-in fade-in zoom-in-95 text-xs">
                <div className="space-y-2.5">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterUnlocked}
                      onChange={(e) => setFilterUnlocked(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold text-gray-900 leading-tight">Unlocked</div>
                      <div className="text-[10px] text-gray-400">Plus / Pro</div>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer pt-1 border-t border-gray-100">
                    <input
                      type="checkbox"
                      checked={filterTrial}
                      onChange={(e) => setFilterTrial(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold text-gray-900 leading-tight">Trial</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Filter 3: Recently Viewed / Sort */}
          <div className="relative">
            <button
              onClick={() => {
                setIsSortMenuOpen(!isSortMenuOpen);
                setIsInstrumentMenuOpen(false);
                setIsTypeMenuOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowUpDown className="w-3 h-3 text-gray-400" />
              <span>
                {sortOption === 'recently'
                  ? 'Recently Viewed'
                  : sortOption === 'title'
                  ? 'Title A–Z'
                  : 'Tempo (BPM)'}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isSortMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-40 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-40 animate-in fade-in zoom-in-95">
                {[
                  { id: 'recently', label: 'Recently Viewed' },
                  { id: 'title', label: 'Title A–Z' },
                  { id: 'tempo', label: 'Tempo (Fast to Slow)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSortOption(s.id as any);
                      setIsSortMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      sortOption === s.id
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{s.label}</span>
                    {sortOption === s.id && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Item count text pill matching filter.png */}
          <div className="flex items-center space-x-1.5 text-gray-500 font-medium ml-auto text-xs">
            <Music className="w-3.5 h-3.5 text-gray-400" />
            <span>{filteredItems.length} transcription{filteredItems.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Section Heading */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="font-bold text-gray-800 text-sm">
            {activeTab === 'system' ? '系统精选伴奏曲目 (Top Songs)' : '我的自转谱曲目 (My Tracks)'}
          </span>
          <span className="text-gray-400 text-xs">
            {activeTab === 'system' ? '官方专业审核与高精度调教' : '支持重新编辑与微调音符'}
          </span>
        </div>

        {/* Song Cards List (matching my-transcription.png & my-collection.png) */}
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-xs">
            <Music className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <div className="font-bold text-gray-700 mb-1">未找到符合条件的转谱曲目</div>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mb-4">
              尝试清除过滤条件或通过新建转谱功能上传音频进行转谱生成
            </p>
            <button
              onClick={onNewTranscription}
              className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-emerald-800 cursor-pointer"
            >
              + 立即转谱一首新曲目
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectSong(item.score)}
                className="group bg-white hover:bg-emerald-50/40 rounded-2xl border border-gray-200/90 hover:border-emerald-300/80 p-3 sm:p-4 flex items-center justify-between transition-all shadow-xs hover:shadow-md cursor-pointer relative"
              >
                {/* Left: Thumbnail & Info */}
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  
                  {/* Thumbnail (matching my-transcription.png guitar thumbnail) */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100 shadow-2xs relative group-hover:scale-105 transition-transform">
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-white/90 text-emerald-800 flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm transition-opacity">
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Song title, badges, artist */}
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <h3 className="font-extrabold text-gray-900 text-sm sm:text-base group-hover:text-emerald-900 transition-colors truncate">
                        {item.title}
                      </h3>

                      {/* Badges matching my-transcription.png (TAB, 云端) */}
                      {item.badges.map((b) => (
                        <span
                          key={b}
                          className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold bg-gray-100 group-hover:bg-emerald-100 text-gray-600 group-hover:text-emerald-800 border border-gray-200/60"
                        >
                          {b}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                      <span>{item.artist}</span>
                      <span className="text-gray-300">•</span>
                      <span className="font-mono text-gray-600 font-medium">♩ = {item.tempo}</span>
                      <span className="text-gray-300 hidden sm:inline">•</span>
                      <span className="font-mono text-emerald-800 font-bold hidden sm:inline">{item.keySignature}</span>
                      {item.capo > 0 && (
                        <span className="text-gray-500 hidden sm:inline">(Capo {item.capo})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Favorite Heart button & Entry CTA */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(item.id);
                    }}
                    className={`p-2 rounded-full transition-colors cursor-pointer ${
                      item.isFavorite
                        ? 'text-rose-500 hover:text-rose-600'
                        : 'text-gray-300 hover:text-gray-500'
                    }`}
                    title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`w-5 h-5 ${item.isFavorite ? 'fill-current' : ''}`} />
                  </button>

                  <div className="hidden md:flex items-center space-x-1 text-xs font-bold text-emerald-700 group-hover:text-emerald-800 bg-emerald-50 group-hover:bg-emerald-100/80 px-3 py-1.5 rounded-xl transition-colors">
                    <span>进入编辑</span>
                    <span>➔</span>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </main>

    </div>
  );
};
