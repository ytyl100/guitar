import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Volume2, Info, X } from 'lucide-react';
import {
  SHARP_ROOTS,
  FLAT_ROOTS,
  CHORD_TYPES,
  ChordType,
  ChordPosition,
  getChordPositions,
  STRING_OPEN_FREQS,
  FINGER_COLORS,
} from '../data/chordLibraryData';
import { ChordFretboard } from './ChordFretboard';
import { audioEngine } from '../utils/audioSynth';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ChordLibraryTabProps {
  onBack?: () => void;
}

export const ChordLibraryTab: React.FC<ChordLibraryTabProps> = ({ onBack }) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();

  // State for Root note & Flat notation mode
  const [isFlat, setIsFlat] = useState<boolean>(false);
  const rootsList = isFlat ? FLAT_ROOTS : SHARP_ROOTS;
  
  // Default to E sus4 matching e-sus4.jpg, or C 7sus4
  const [selectedRoot, setSelectedRoot] = useState<string>('E');
  const [selectedType, setSelectedType] = useState<ChordType>('sus4');
  const [currentPosIdx, setCurrentPosIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showFingerGuide, setShowFingerGuide] = useState<boolean>(false);

  // Scroll containers for roots and types
  const rootScrollRef = useRef<HTMLDivElement>(null);
  const typeScrollRef = useRef<HTMLDivElement>(null);

  // Get available positions for current chord
  const positions: ChordPosition[] = getChordPositions(selectedRoot, selectedType);
  const currentPosition: ChordPosition = positions[currentPosIdx] || positions[0];

  // Auto reset pos index if out of range
  useEffect(() => {
    if (currentPosIdx >= positions.length) {
      setCurrentPosIdx(0);
    }
  }, [positions.length, currentPosIdx]);

  // Handle Root selection
  const handleSelectRoot = (root: string) => {
    setSelectedRoot(root);
    setCurrentPosIdx(0);
  };

  // Handle Type selection
  const handleSelectType = (type: ChordType) => {
    setSelectedType(type);
    setCurrentPosIdx(0);
  };

  // Play full chord strum using Web Audio engine
  const playStrum = () => {
    if (!currentPosition) return;
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 500);

    const { frets } = currentPosition;
    // Strum from 6th string down to 1st string
    let delay = 0;
    for (let strIdx = 0; strIdx < 6; strIdx++) {
      const fret = frets[strIdx];
      if (fret >= 0) {
        const baseFreq = STRING_OPEN_FREQS[strIdx];
        const noteFreq = baseFreq * Math.pow(2, fret / 12);
        audioEngine.playString(noteFreq, 2.0, delay);
        delay += 35; // 35ms strum arpeggio
      }
    }
  };

  // Play a single string pluck
  const handlePlayString = (strIdx: number, fret: number) => {
    if (fret < 0) return; // Muted string
    const baseFreq = STRING_OPEN_FREQS[strIdx];
    const noteFreq = baseFreq * Math.pow(2, fret / 12);
    audioEngine.playString(noteFreq, 2.2, 0);
  };

  // Navigate positions
  const handlePrevPosition = () => {
    setCurrentPosIdx((prev) => (prev > 0 ? prev - 1 : positions.length - 1));
  };

  const handleNextPosition = () => {
    setCurrentPosIdx((prev) => (prev < positions.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className={`flex flex-col h-full select-none relative overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#12141a] text-zinc-100' : 'bg-slate-50 text-zinc-900'
      }`}
    >
      {/* 1. Top Header Bar (matches chord_lib.jpg & e-sus4.jpg) */}
      <header
        className={`flex items-center justify-between px-4 pt-2.5 pb-2 border-b shrink-0 z-20 ${
          isDark
            ? 'bg-[#12141a]/95 border-zinc-850'
            : 'bg-white/95 border-zinc-200 shadow-xs'
        }`}
      >
        <button
          onClick={onBack}
          className={`w-9 h-9 flex items-center justify-center active:scale-95 transition ${
            isDark ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-900'
          }`}
          title="返回"
        >
          <ChevronLeft size={24} className="stroke-[2.5]" />
        </button>

        <h1
          className={`text-base font-bold tracking-tight ${
            isDark ? 'text-white' : 'text-zinc-900'
          }`}
        >
          Chord library
        </h1>

        <button
          onClick={() => {
            setIsFlat(!isFlat);
            // Translate current root if possible
            if (!isFlat) {
              const idx = SHARP_ROOTS.indexOf(selectedRoot);
              if (idx !== -1) setSelectedRoot(FLAT_ROOTS[idx]);
            } else {
              const idx = FLAT_ROOTS.indexOf(selectedRoot);
              if (idx !== -1) setSelectedRoot(SHARP_ROOTS[idx]);
            }
          }}
          className={`w-9 h-9 flex items-center justify-center text-base font-serif italic transition rounded-xl ${
            isFlat
              ? 'text-emerald-500 bg-emerald-500/20 font-bold'
              : isDark
              ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
          title="切换 降记号 ♭ / 升记号 ♯"
        >
          ♭
        </button>
      </header>

      {/* 2. Level 1: Root Note Horizontal Scrollable Picker */}
      <div
        className={`border-b shrink-0 ${
          isDark
            ? 'border-zinc-850/80 bg-[#161820]/90'
            : 'border-zinc-200 bg-zinc-100/90'
        }`}
      >
        <div
          ref={rootScrollRef}
          className="flex items-center gap-6 px-6 py-2.5 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {rootsList.map((root) => {
            const isSelected = selectedRoot === root;
            return (
              <button
                key={root}
                onClick={() => handleSelectRoot(root)}
                className={`transition-all duration-150 shrink-0 px-1 py-0.5 ${
                  isSelected
                    ? isDark
                      ? 'text-2xl font-black text-white scale-110 drop-shadow-md'
                      : 'text-2xl font-black text-zinc-900 scale-110 drop-shadow-xs'
                    : isDark
                    ? 'text-lg font-bold text-zinc-500 hover:text-zinc-300'
                    : 'text-lg font-bold text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {root}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Level 2: Chord Type Horizontal Scrollable Picker */}
      <div
        className={`border-b shrink-0 ${
          isDark
            ? 'border-zinc-850/70 bg-[#13151c]/90'
            : 'border-zinc-200 bg-zinc-50/90'
        }`}
      >
        <div
          ref={typeScrollRef}
          className="flex items-center gap-5 px-6 py-2 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {CHORD_TYPES.map((type) => {
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => handleSelectType(type)}
                className={`transition-all duration-150 shrink-0 px-1 py-0.5 whitespace-nowrap ${
                  isSelected
                    ? isDark
                      ? 'text-sm font-black text-white scale-105'
                      : 'text-sm font-black text-zinc-900 scale-105'
                    : isDark
                    ? 'text-xs font-semibold text-zinc-500 hover:text-zinc-300'
                    : 'text-xs font-semibold text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Main Chord Fretboard Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-4 overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Chord Name Header Info */}
          <div className="text-center mb-1">
            <span
              className={`text-xs font-medium ${
                isDark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
            >
              {currentPosition?.title || `${selectedRoot}${selectedType} 和弦指法`}
            </span>
          </div>

          {/* Interactive Fretboard Diagram */}
          <ChordFretboard
            position={currentPosition}
            chordName={`${selectedRoot}${selectedType}`}
            onPlayString={handlePlayString}
            onSwipeLeft={handleNextPosition}
            onSwipeRight={handlePrevPosition}
          />
        </div>
      </div>

      {/* 5. Bottom Controls Bar: Audio Button, Position Pagination Dots, and Hand Icon */}
      <div className="w-full px-6 py-4 pb-20 flex items-center justify-between shrink-0 z-30">
        {/* Left: Speaker Button (Strum Chord Audio) */}
        <button
          onClick={playStrum}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg border active:scale-90 transition ${
            isDark
              ? 'bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 hover:text-white border-zinc-700/50'
              : 'bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 border-zinc-200'
          } ${isPlaying ? 'ring-2 ring-emerald-500 text-emerald-500' : ''}`}
          title="播放和弦扫弦发音"
        >
          <Volume2 size={22} className={isPlaying ? 'scale-110 transition-transform' : ''} />
        </button>

        {/* Center: Position Pagination Dots (matches reference • • •) */}
        <div className="flex items-center gap-2">
          {positions.map((_, idx) => {
            const isActive = currentPosIdx === idx;
            return (
              <button
                key={`pos-dot-${idx}`}
                onClick={() => setCurrentPosIdx(idx)}
                className={`transition-all rounded-full ${
                  isActive
                    ? isDark
                      ? 'w-3 h-3 bg-white shadow'
                      : 'w-3 h-3 bg-zinc-900 shadow'
                    : isDark
                    ? 'w-2.5 h-2.5 bg-zinc-600 hover:bg-zinc-400'
                    : 'w-2.5 h-2.5 bg-zinc-300 hover:bg-zinc-500'
                }`}
                title={`第 ${idx + 1} 把位`}
              />
            );
          })}
        </div>

        {/* Right: Colored Hand Silhouette Icon (matching reference screenshot) */}
        <button
          onClick={() => setShowFingerGuide(!showFingerGuide)}
          className="relative w-12 h-12 flex items-center justify-center group active:scale-95 transition"
          title="手指颜色对应指法图例"
        >
          {/* Custom Hand Vector Icon with 4 colored fingertips matching e-sus4.jpg */}
          <svg viewBox="0 0 48 48" className="w-10 h-10 drop-shadow-md">
            {/* White palm and wrist */}
            <path
              d="M12 36 L12 44 C12 45 14 46 24 46 C34 46 36 45 36 44 L36 36 C38 32 38 28 38 26 C38 24 36 23 34 26 L34 32 L34 16 C34 14 31 14 31 16 L31 29 L28 12 C28 10 25 10 25 12 L25 28 L22 10 C22 8 19 8 19 10 L19 28 L16 14 C16 12 13 12 13 14 L13 30 L11 26 C9 23 7 24 7 26 C7 30 10 34 12 36 Z"
              fill={isDark ? '#ffffff' : '#475569'}
            />
            {/* Colored finger tips: */}
            {/* 1. Index finger tip (Orange) */}
            <circle cx="14.5" cy="14" r="3.5" fill="#f59e0b" />
            {/* 2. Middle finger tip (Pink) */}
            <circle cx="20.5" cy="10" r="3.5" fill="#ec4899" />
            {/* 3. Ring finger tip (Sky Blue) */}
            <circle cx="26.5" cy="12" r="3.5" fill="#0ea5e9" />
            {/* 4. Pinky finger tip (Coral Orange) */}
            <circle cx="32.5" cy="16" r="3.5" fill="#f97316" />
          </svg>
        </button>
      </div>

      {/* 6. Interactive Finger Legend / Guide Popover */}
      {showFingerGuide && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-xs border rounded-3xl p-5 shadow-2xl relative ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <button
              onClick={() => setShowFingerGuide(false)}
              className={`absolute top-4 right-4 p-1 ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Info size={18} className="text-emerald-500" />
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                指法颜色对照表
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* 1. Index */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-[#f59e0b] flex items-center justify-center text-[10px] font-bold text-black">
                    1
                  </span>
                  <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    食指 (Index)
                  </span>
                </div>
                <span className="text-amber-500 font-semibold">橙色</span>
              </div>

              {/* 2. Middle */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-[#ec4899] flex items-center justify-center text-[10px] font-bold text-white">
                    2
                  </span>
                  <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    中指 (Middle)
                  </span>
                </div>
                <span className="text-pink-500 font-semibold">粉色</span>
              </div>

              {/* 3. Ring */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-[#0ea5e9] flex items-center justify-center text-[10px] font-bold text-white">
                    3
                  </span>
                  <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    无名指 (Ring)
                  </span>
                </div>
                <span className="text-sky-500 font-semibold">蓝色</span>
              </div>

              {/* 4. Pinky */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-[#f97316] flex items-center justify-center text-[10px] font-bold text-white">
                    4
                  </span>
                  <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    小指 (Pinky)
                  </span>
                </div>
                <span className="text-orange-500 font-semibold">珊瑚橙</span>
              </div>

              {/* Barre & Strings */}
              <div
                className={`pt-2 border-t flex items-center justify-around text-[11px] ${
                  isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-200 text-zinc-500'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>o</span>
                  <span>空弦</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-rose-500">x</span>
                  <span>不发音/闷弦</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-5 h-2 rounded-full bg-[#f59e0b] inline-block" />
                  <span>大横按</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowFingerGuide(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
