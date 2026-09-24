import React, { useState, useEffect, useRef } from 'react';
import { SongItem } from '../types';
import { CHORD_DATABASE } from '../data/mockData';
import { ChordDiagram } from './ChordDiagram';
import { MeasurePracticePanel } from './MeasurePracticePanel';
import { audioEngine } from '../utils/audioSynth';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Search,
  Heart,
  ChevronLeft,
  Share2,
  MoreHorizontal,
  Play,
  Pause,
  RotateCcw,
  Volume2,
} from 'lucide-react';

interface MusicTabProps {
  songs: SongItem[];
  onToggleFavorite: (songId: string) => void;
  onSelectSongForPractice?: (chordList: string[]) => void;
}

export const MusicTab: React.FC<MusicTabProps> = ({
  songs,
  onToggleFavorite,
  onSelectSongForPractice,
}) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();

  const [selectedSong, setSelectedSong] = useState<SongItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChordPopoverKey, setActiveChordPopoverKey] = useState<string | null>(null);
  const [isSimplified, setIsSimplified] = useState(true);

  // Playback & lyric synchronization state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaySec, setCurrentPlaySec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); // 0.75x to 1.25x
  /** 递增后通知「云端六线谱小节练习」回到第 1 小节并滚回列表顶部 */
  const [practiceResetToken, setPracticeResetToken] = useState(0);

  const timerRef = useRef<number | null>(null);
  /** 详情页滚动容器（原先用于歌词区自动滚动，现仅保留以备后续需要） */
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  // Filter songs based on search
  const filteredSongs = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const favoriteSongs = filteredSongs.filter((s) => s.isFavorite);
  const regularSongs = filteredSongs.filter((s) => !s.isFavorite);

  // 播放时钟：仅推进歌曲时间轴
  // （音效统一由「云端六线谱小节练习」的小节音频播放，这里不再合成六线谱音符，
  //   否则会出现「没有标注的地方也有声音」的重复叠音）
  useEffect(() => {
    if (isPlaying && selectedSong) {
      const intervalMs = 60;
      timerRef.current = window.setInterval(() => {
        setCurrentPlaySec((prev) => {
          const next = prev + (intervalMs / 1000) * playbackSpeed;
          if (next >= selectedSong.durationSec) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, selectedSong, playbackSpeed]);

  // 切换曲目时停止播放并回到开头
  useEffect(() => {
    setIsPlaying(false);
    setCurrentPlaySec(0);
  }, [selectedSong]);

  // -------------------------------------------------------------
  // DETAIL VIEW
  // -------------------------------------------------------------
  if (selectedSong) {
    return (
      <div
        className={`flex flex-col h-full select-none relative overflow-hidden transition-colors duration-200 ${
          isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
        }`}
      >
        {/* Top Header Bar */}
        <div
          className={`sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-md border-b transition-colors ${
            isDark
              ? 'bg-[#101217]/95 border-zinc-800/80 text-white'
              : 'bg-white/95 border-zinc-200 text-zinc-900 shadow-xs'
          }`}
        >
          <button
            onClick={() => {
              // (5) Click other buttons stops music
              setIsPlaying(false);
              setSelectedSong(null);
            }}
            className={`flex items-center gap-1 p-1 rounded-full transition ${
              isDark
                ? 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
            title="返回歌曲列表"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-4 text-zinc-400">
            <button
              onClick={() => {
                // (5) Click other buttons stops music
                setIsPlaying(false);
              }}
              className={`transition p-1 ${
                isDark ? 'hover:text-white' : 'hover:text-zinc-900'
              }`}
              title="分享"
            >
              <Share2 size={20} />
            </button>
            <button
              onClick={() => {
                // (5) Click other buttons stops music
                setIsPlaying(false);
                onToggleFavorite(selectedSong.id);
              }}
              className={`transition p-1 ${
                selectedSong.isFavorite
                  ? 'text-red-500 fill-red-500'
                  : isDark
                  ? 'text-zinc-300 hover:text-white'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title={selectedSong.isFavorite ? '取消收藏' : '收藏'}
            >
              <Heart
                size={20}
                className={selectedSong.isFavorite ? 'fill-red-500' : ''}
              />
            </button>
            <button
              onClick={() => {
                // (5) Click other buttons stops music
                setIsPlaying(false);
              }}
              className={`transition p-1 ${
                isDark ? 'hover:text-white' : 'hover:text-zinc-900'
              }`}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Song Body with ample padding so bottom lyrics aren't covered */}
        <div
          ref={detailScrollRef}
          onClick={() => activeChordPopoverKey && setActiveChordPopoverKey(null)}
          className="flex-1 overflow-y-auto px-4 pt-2 pb-60 scroll-smooth"
        >
          {/* Hero Banner with artist image */}
          <div
            className={`relative rounded-2xl overflow-hidden mb-5 border shadow-lg ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
            }`}
          >
            <div className="h-40 w-full relative">
              <img
                src={selectedSong.coverUrl}
                alt={selectedSong.title}
                className="w-full h-full object-cover brightness-75"
              />
              <div
                className={`absolute inset-0 bg-gradient-to-t ${
                  isDark
                    ? 'from-[#101217] via-transparent to-black/30'
                    : 'from-slate-50 via-transparent to-black/20'
                }`}
              />
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">
                    {selectedSong.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-0.5 text-zinc-200 text-xs">
                    <span className="font-semibold">{selectedSong.artist}</span>
                    <span>•</span>
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      ★ {selectedSong.rating} ({selectedSong.ratingCount})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Version & Capo Section */}
          <div
            className={`rounded-2xl p-3.5 border mb-4 relative z-30 transition-colors ${
              isDark
                ? 'bg-zinc-900/80 border-zinc-800/80'
                : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`flex p-1 rounded-xl border ${
                  isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                }`}
              >
                <button
                  onClick={() => {
                    // (5) Click other buttons stops music
                    setIsPlaying(false);
                    setIsSimplified(true);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                    isSimplified
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Simplified
                </button>
                <button
                  onClick={() => {
                    // (5) Click other buttons stops music
                    setIsPlaying(false);
                    setIsSimplified(false);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                    !isSimplified
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Original
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-lg border ${
                    isDark
                      ? 'text-zinc-400 bg-zinc-800/70 border-zinc-700/60'
                      : 'text-zinc-600 bg-zinc-100 border-zinc-200'
                  }`}
                >
                  {selectedSong.capo}
                </span>
              </div>
            </div>

            {/* Chord Chips Bar - Show compact chord diagram picture right next to clicked chip without clipping */}
            <div className="flex items-center gap-2 flex-wrap pt-0.5 relative">
              <span
                className={`text-xs mr-1 shrink-0 ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                和弦库:
              </span>
              {selectedSong.chords.map((chord, idx) => {
                const popoverKey = `bar-${chord}`;
                const isPopoverOpen = activeChordPopoverKey === popoverKey;
                const isNearRight = idx >= selectedSong.chords.length - 2;

                return (
                  <div key={chord} className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // (5) Stop music when selecting a chord
                        setIsPlaying(false);
                        audioEngine.playChord(chord);
                        setActiveChordPopoverKey(isPopoverOpen ? null : popoverKey);
                      }}
                      className={`px-3 py-1 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1 ${
                        isPopoverOpen
                          ? 'bg-zinc-700 text-emerald-400 border border-emerald-500/50'
                          : isDark
                          ? 'bg-zinc-800/90 text-zinc-200 hover:bg-zinc-750'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                      }`}
                      title={`点击在旁边查看 ${chord} 和弦图片`}
                    >
                      <span>{chord}</span>
                      <Volume2 size={11} className="opacity-60" />
                    </button>

                    {/* Compact Chord Picture Popover right below the clicked chip - fully visible, unclipped */}
                    {isPopoverOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute top-full mt-2.5 ${
                          isNearRight ? 'right-0' : 'left-0'
                        } z-50 ${
                          isDark
                            ? 'bg-zinc-950/98 border-emerald-500/70 text-white'
                            : 'bg-white border-emerald-500/70 text-zinc-900'
                        } border rounded-2xl p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 min-w-[130px]`}
                      >
                        <div className="flex items-center justify-between px-1 mb-1">
                          <span className="text-xs font-mono font-bold text-emerald-500">
                            {chord}
                          </span>
                          <button
                            onClick={() => setActiveChordPopoverKey(null)}
                            className="text-zinc-400 hover:text-zinc-600 p-0.5 text-xs ml-3"
                            title="关闭"
                          >
                            ✕
                          </button>
                        </div>
                        <ChordDiagram
                          chordName={chord}
                          size="sm"
                          showPlayButton={false}
                          hideHint
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cloud Tablature Measure Loop Practice (来自 guitarmate-audio-backend 已发布小节数据)
              一个小节一个栏目，播放 / 暂停 / 变速统一由底部 PLAY 按钮控制 */}
          <MeasurePracticePanel
            songTitle={selectedSong.title}
            isDark={isDark}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            resetToken={practiceResetToken}
            // 顶部 Simplified / Original 开关 → 切换练习声源
            useOriginal={!isSimplified}
          />
        </div>

        {/* ------------------------------------------------------------- */}
        {/* (1) OPERATION PANEL FIXED DIRECTLY ABOVE BOTTOM MENU (56px)   */}
        {/* ------------------------------------------------------------- */}
        <div
          className={`absolute bottom-[56px] left-0 right-0 z-30 backdrop-blur-xl border-t px-4 py-2.5 transition-colors ${
            isDark
              ? 'bg-[#12141a]/98 border-zinc-800 text-white shadow-[0_-8px_25px_rgba(0,0,0,0.6)]'
              : 'bg-white/98 border-zinc-200 text-zinc-900 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]'
          }`}
        >
          {/* Speed & Time display - 移除了外部重复的进度条，六线谱内的进度条成为唯一进度指引 */}
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span
              className={`font-mono ${
                isDark ? 'text-zinc-300' : 'text-zinc-700 font-medium'
              }`}
            >
              {Math.floor(currentPlaySec / 60)}:
              {String(Math.floor(currentPlaySec % 60)).padStart(2, '0')} /{' '}
              {Math.floor(selectedSong.durationSec / 60)}:
              {String(Math.floor(selectedSong.durationSec % 60)).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={isDark ? 'text-zinc-500 text-[10px]' : 'text-zinc-400 text-[10px]'}>
                速度:
              </span>
              {[0.75, 1.0, 1.25].map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    // (5) Click other buttons stops music
                    setIsPlaying(false);
                    setPlaybackSpeed(speed);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                    playbackSpeed === speed
                      ? 'bg-emerald-500 text-black font-bold'
                      : isDark
                      ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Main Controls Row with the Prominent Circular PLAY Button */}
          <div className="flex items-center justify-between">
            {/* Left: Reset progress to the very first measure */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // 重置：停止播放、歌曲时间轴归零，并让六线谱练习回到最顶部的第 1 小节
                  setIsPlaying(false);
                  setCurrentPlaySec(0);
                  setPracticeResetToken((t) => t + 1);
                }}
                title="重置进度（回到第 1 小节）"
                className={`p-1.5 rounded-full transition ${
                  isDark
                    ? 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
                    : 'bg-zinc-100 text-zinc-700 hover:text-black hover:bg-zinc-200 border border-zinc-200'
                }`}
              >
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Center: MANDATED PROMINENT CIRCULAR "PLAY" BUTTON */}
            <div className="relative">
              {/* Outer pulsing animated ring when playing */}
              {isPlaying && (
                <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
              )}
              <button
                onClick={() => {
                  // 仅切换播放状态：音效统一由「云端六线谱小节练习」的小节音频播放，
                  // 不再额外合成和弦音，避免与云端音频重复叠音
                  setIsPlaying(!isPlaying);
                }}
                className={`relative flex items-center justify-center w-14 h-14 rounded-full font-extrabold text-black shadow-[0_4px_25px_rgba(16,185,129,0.5)] transition-all transform active:scale-95 ${
                  isPlaying
                    ? 'bg-emerald-400 ring-4 ring-emerald-500/30'
                    : 'bg-emerald-500 hover:bg-emerald-400 ring-4 ring-emerald-500/20'
                }`}
                title={isPlaying ? 'PAUSE' : 'PLAY'}
              >
                {isPlaying ? (
                  <Pause size={24} className="fill-black" />
                ) : (
                  <Play size={24} className="fill-black ml-1" />
                )}
              </button>
            </div>

            {/*
              Right: 原本的「拨响」按钮已按需求移除。
              和弦试听仍可在上方和弦库卡片中，点单个和弦完成。
              这里保留等宽占位，使中央 PLAY 圆钮保持水平居中。
            */}
            <div className="w-[30px] h-[30px]" aria-hidden="true" />
          </div>
        </div>

        {/* Attached Chord Image Popover Modal */}
        {activeChordPopoverKey && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={() => setActiveChordPopoverKey(null)}
          >
            <div
              className="bg-zinc-950 border border-emerald-500/60 rounded-3xl p-4 shadow-2xl max-w-[280px] w-full animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-base font-mono font-bold text-emerald-400">
                  {activeChordPopoverKey} 和弦按法
                </span>
                <button
                  onClick={() => setActiveChordPopoverKey(null)}
                  className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
              <ChordDiagram chordName={activeChordPopoverKey} size="md" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // LIST VIEW (music_list.jpg)
  // -------------------------------------------------------------
  return (
    <div
      className={`flex flex-col h-full overflow-y-auto px-4 pb-28 pt-3 select-none transition-colors duration-200 ${
        isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
      }`}
    >
      {/* Top Title */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1
            className={`text-3xl font-extrabold tracking-tight ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {t('songs.title')}
          </h1>
          <p
            className={`text-xs mt-0.5 ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {t('songs.subtitle')}
          </p>
        </div>
        <div
          className={`px-2.5 py-1 rounded-full text-[11px] font-mono ${
            isDark
              ? 'bg-zinc-850 text-zinc-300 border border-zinc-800'
              : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
          }`}
        >
          {songs.length} {t('songs.countSuffix')}
        </div>
      </div>

      {/* Search Bar matching screenshot */}
      <div className="relative mb-6">
        <div
          className={`absolute inset-y-0 left-3.5 flex items-center pointer-events-none ${
            isDark ? 'text-zinc-400' : 'text-zinc-400'
          }`}
        >
          <Search size={18} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('songs.searchPlaceholder')}
          className={`w-full pl-10 pr-4 py-3 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-colors ${
            isDark
              ? 'bg-zinc-900 text-white placeholder-zinc-500 border border-zinc-800'
              : 'bg-white text-zinc-900 placeholder-zinc-400 border border-zinc-200'
          }`}
        />
      </div>

      {/* Section 1: "Your songs" (Pinned Favorite Songs as requested) */}
      {favoriteSongs.length > 0 && (
        <div className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h2
              className={`text-lg font-bold flex items-center gap-1.5 ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              <span>{t('songs.yourSongs')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 dark:text-red-400 font-mono">
                {t('songs.pinnedFav')} {favoriteSongs.length}
              </span>
            </h2>
            <button
              className={`text-xs ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              See all
            </button>
          </div>

          <div className="space-y-2.5">
            {favoriteSongs.map((song) => (
              <SongListItem
                key={song.id}
                song={song}
                isDark={isDark}
                onSelect={() => setSelectedSong(song)}
                onToggleFav={() => onToggleFavorite(song.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 2: "Top songs" */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2
            className={`text-lg font-bold ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {t('songs.topSongs')}
          </h2>
          <span
            className={`text-xs ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {t('songs.popularRec')}
          </span>
        </div>

        <div className="space-y-2.5">
          {(favoriteSongs.length === 0 ? filteredSongs : regularSongs).map(
            (song) => (
              <SongListItem
                key={song.id}
                song={song}
                isDark={isDark}
                onSelect={() => setSelectedSong(song)}
                onToggleFav={() => onToggleFavorite(song.id)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

interface SongListItemProps {
  song: SongItem;
  isDark: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}

const SongListItem: React.FC<SongListItemProps> = ({
  song,
  isDark,
  onSelect,
  onToggleFav,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition active:scale-[0.99] ${
        isDark
          ? 'bg-zinc-900/60 hover:bg-zinc-850 border-zinc-800/70 hover:border-zinc-700'
          : 'bg-white hover:bg-zinc-50 border-zinc-200 hover:border-zinc-300 shadow-xs'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={song.coverUrl}
          alt={song.title}
          className={`w-14 h-14 rounded-xl object-cover shrink-0 border ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`text-base font-bold truncate ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {song.title}
            </h3>
            {song.tags.map((tag) => (
              <span
                key={tag}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${
                  isDark
                    ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
          <p
            className={`text-xs truncate mt-0.5 ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {song.artist}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-emerald-500 font-mono">
              {song.chords.join(' · ')}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className={`p-2 rounded-full transition shrink-0 ${
          isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
        } ${
          song.isFavorite
            ? 'text-red-500 fill-red-500'
            : isDark
            ? 'text-zinc-500 hover:text-zinc-300'
            : 'text-zinc-400 hover:text-zinc-600'
        }`}
        title={song.isFavorite ? '取消收藏' : '收藏并置顶'}
      >
        <Heart size={20} className={song.isFavorite ? 'fill-red-500' : ''} />
      </button>
    </div>
  );
};
