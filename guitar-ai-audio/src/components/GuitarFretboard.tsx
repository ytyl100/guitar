import React, { useState, useEffect } from 'react';
import { GuitarString, TabNote } from '../types/music';
import { getNoteForFret, STANDARD_OPEN_STRINGS } from '../utils/guitarTheory';
import { guitarAudio } from '../audio/guitarSynth';
import { useIsMobile } from '../utils/useIsMobile';
import { Volume2, Settings2, Sparkles, Sliders, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface GuitarFretboardProps {
  activeNotes: TabNote[];
  selectedNote: TabNote | null;
  capoFret?: number;
  onFretClick?: (string: GuitarString, fret: number) => void;
  tuning?: string[];
  isDockedWithVideo?: boolean;
  onCloseFretboard?: () => void;
}

export const GuitarFretboard: React.FC<GuitarFretboardProps> = ({
  activeNotes,
  selectedNote,
  capoFret = 3,
  onFretClick,
  tuning = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  isDockedWithVideo = false,
  onCloseFretboard,
}) => {
  const [displayMode, setDisplayMode] = useState<'pitch' | 'fret'>('pitch');
  const [woodTheme, setWoodTheme] = useState<'rosewood' | 'maple' | 'ebony'>('rosewood');
  const [showAllNoteNames, setShowAllNoteNames] = useState(false);
  const isMobile = useIsMobile(768);

  const totalFrets = 21; // Standard acoustic/electric range
  const mobileFretsCount = 7; // Focus on 7 frets in mobile viewport
  const [mobileStartFret, setMobileStartFret] = useState(1);

  // Desktop Docked Mode: Visible window is strictly 16 frets as requested
  const desktopDockedFretsCount = 16;
  const [dockedStartFret, setDockedStartFret] = useState(1);

  // Auto-shift mobile fret window if playing note is outside current 7-fret range
  useEffect(() => {
    if (!isMobile) return;
    if (activeNotes.length > 0) {
      const fretNote = activeNotes.find((n) => n.fret > 0);
      if (fretNote) {
        const f = fretNote.fret;
        if (f < mobileStartFret || f > mobileStartFret + mobileFretsCount - 1) {
          const newStart = Math.max(1, Math.min(totalFrets - mobileFretsCount + 1, f - 2));
          setMobileStartFret(newStart);
        }
      }
    }
  }, [activeNotes, isMobile, mobileStartFret, totalFrets]);

  // Auto-shift desktop docked 16-fret window if playing note exceeds 16 frets
  // e.g. If note > 16, slides left so frets become e.g. 5-21 or 6-21, keeping span strictly 16 frets
  useEffect(() => {
    if (isMobile || !isDockedWithVideo) return;
    if (activeNotes.length > 0) {
      const maxFret = Math.max(...activeNotes.map((n) => n.fret));
      if (maxFret > 0) {
        if (maxFret > dockedStartFret + desktopDockedFretsCount - 1) {
          // Slide right to reveal higher frets (e.g. 5 to 21)
          const maxAllowedStart = totalFrets - desktopDockedFretsCount + 1; // 21 - 16 + 1 = 6
          const targetStart = Math.min(maxAllowedStart, maxFret - desktopDockedFretsCount + 2);
          setDockedStartFret(Math.max(1, targetStart));
        } else if (maxFret < dockedStartFret) {
          // Slide left to reveal lower frets
          setDockedStartFret(Math.max(1, maxFret - 1));
        }
      }
    }
  }, [activeNotes, isMobile, isDockedWithVideo, dockedStartFret, totalFrets]);

  // Determine list of frets to display
  const visibleFrets = isMobile
    ? Array.from({ length: mobileFretsCount }, (_, i) => mobileStartFret + i)
    : isDockedWithVideo
    ? Array.from({ length: desktopDockedFretsCount }, (_, i) => dockedStartFret + i)
    : Array.from({ length: totalFrets }, (_, i) => i + 1);

  // Frets that have standard inlay position markers
  const singleDotFrets = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleDotFrets = [12];

  // Strings from high E (1) down to low E (6)
  const strings: GuitarString[] = [1, 2, 3, 4, 5, 6];

  const handleCellClick = (string: GuitarString, fret: number) => {
    const { midi } = getNoteForFret(string, fret);
    guitarAudio.playNote(midi, 1.2, 0.85);
    if (onFretClick) {
      onFretClick(string, fret);
    }
  };

  // Wood theme background gradients
  const woodStyles = {
    rosewood: 'bg-[#2b1810] border-[#1f110b]',
    maple: 'bg-[#dfc18b] border-[#c4a067]',
    ebony: 'bg-[#151515] border-[#0a0a0a]',
  };

  return (
    <div className="w-full bg-[#1b1c1e] text-white border-t border-gray-700/80 shadow-2xl flex flex-col font-sans select-none">
      
      {/* Fretboard Control Header (Hidden on mobile to maximize fretboard playing area as requested) */}
      {!isMobile && (
        <div className="px-3 sm:px-4 py-2 bg-[#121315] border-b border-gray-800 flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex items-center space-x-1.5 font-semibold text-gray-200">
              <span className="text-sm sm:text-base">🎸</span>
              <span className="text-xs sm:text-sm">Fretboard</span>
            </div>

            {isDockedWithVideo ? (
              /* Desktop Docked 16-fret position indicator */
              <div className="flex items-center space-x-1.5 bg-[#202226] px-2 py-0.5 rounded border border-gray-700 text-xs">
                <button
                  onClick={() => setDockedStartFret((prev) => Math.max(1, prev - 1))}
                  disabled={dockedStartFret <= 1}
                  className="p-0.5 text-gray-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="把位左移"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs text-amber-300 font-bold px-1">
                  把位 {dockedStartFret}–{dockedStartFret + desktopDockedFretsCount - 1} 品 (共16品)
                </span>
                <button
                  onClick={() => setDockedStartFret((prev) => Math.min(totalFrets - desktopDockedFretsCount + 1, prev + 1))}
                  disabled={dockedStartFret >= totalFrets - desktopDockedFretsCount + 1}
                  className="p-0.5 text-gray-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="把位右移"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              capoFret > 0 && (
                <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-[11px] font-medium">
                  <span>Capo:</span>
                  <strong className="text-white">Fret {capoFret}</strong>
                </div>
              )
            )}

            {/* Active sounding note indicator */}
            {activeNotes.length > 0 && (
              <div className="hidden sm:flex items-center space-x-1 text-emerald-400 font-mono text-[11px] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Playing: {activeNotes.map((n) => `${n.pitch} (Str ${n.string}, Fr ${n.fret})`).join(' • ')}</span>
              </div>
            )}
          </div>

          {/* Display Toggles */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Fret / Pitch view toggle */}
            <div className="flex items-center bg-[#202226] p-0.5 rounded border border-gray-700 text-[10px] sm:text-[11px]">
              <button
                onClick={() => setDisplayMode('pitch')}
                className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  displayMode === 'pitch' ? 'bg-emerald-700 text-white font-semibold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => setDisplayMode('fret')}
                className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  displayMode === 'fret' ? 'bg-emerald-700 text-white font-semibold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Frets
              </button>
            </div>

            {/* Wood Fretboard Style Picker (Desktop only) */}
            <div className="hidden md:flex items-center space-x-1 bg-[#202226] px-2 py-1 rounded border border-gray-700 text-[11px]">
              <span className="text-gray-400">Board:</span>
              <button
                onClick={() => setWoodTheme('rosewood')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${woodTheme === 'rosewood' ? 'bg-amber-900 text-white font-bold' : 'text-gray-400'}`}
              >
                Rosewood
              </button>
              <button
                onClick={() => setWoodTheme('ebony')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${woodTheme === 'ebony' ? 'bg-zinc-800 text-white font-bold' : 'text-gray-400'}`}
              >
                Ebony
              </button>
              <button
                onClick={() => setWoodTheme('maple')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${woodTheme === 'maple' ? 'bg-amber-600 text-black font-bold' : 'text-gray-400'}`}
              >
                Maple
              </button>
            </div>

            {/* Show all notes toggle */}
            <button
              onClick={() => setShowAllNoteNames(!showAllNoteNames)}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border text-[10px] sm:text-[11px] transition-colors cursor-pointer ${
                showAllNoteNames
                  ? 'bg-teal-900/60 border-teal-500 text-teal-200'
                  : 'bg-[#202226] border-gray-700 text-gray-400 hover:text-white'
              }`}
              title="Show note names across all frets"
            >
              {showAllNoteNames ? 'Hide' : 'Map All'}
            </button>

            {/* Close / Collapse Fretboard Button */}
            {onCloseFretboard && (
              <button
                onClick={onCloseFretboard}
                className="flex items-center space-x-1 px-2 py-1 rounded text-[11px] bg-[#202226] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700 cursor-pointer transition-colors shadow-2xs"
                title="收起吉他琴把指板，全屏展示乐谱"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
                <span className="hidden sm:inline">收起指板</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Fretboard Area: Desktop = 21 Frets (or 16 Frets if Docked with Video) / Mobile = 7 Focused Frets */}
      <div className={`w-full px-2 py-2 sm:py-3 ${isMobile ? '' : 'overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700'}`}>
        <div className={`mx-auto relative flex flex-col ${isMobile ? 'w-full' : isDockedWithVideo ? 'w-full' : 'min-w-[960px] max-w-[1400px]'}`}>
          
          {/* Fret numbers row top */}
          <div className="flex h-5 items-center mb-1 text-[11px] font-mono text-gray-400">
            {/* Open string / Nut space */}
            <div className={`${isMobile ? 'w-10' : 'w-14'} text-center font-bold text-gray-500 text-[10px]`}>
              Nut
            </div>
            
            {/* Visible Frets */}
            {visibleFrets.map((fretNum) => {
              const hasMarker = singleDotFrets.includes(fretNum) || doubleDotFrets.includes(fretNum);
              return (
                <div
                  key={fretNum}
                  className={`flex-1 text-center font-semibold text-[10px] sm:text-[11px] ${
                    hasMarker ? 'text-amber-300 font-bold' : 'text-gray-500'
                  }`}
                >
                  {fretNum}
                </div>
              );
            })}
          </div>

          {/* Fretboard Wooden Deck */}
          <div
            className={`relative rounded-lg shadow-inner border-2 ${woodStyles[woodTheme]} overflow-hidden`}
            style={{
              height: isMobile ? '128px' : '144px',
            }}
          >
            {/* Inlay Position Marker Dots (embedded directly in wood) */}
            <div className="absolute inset-0 pointer-events-none flex">
              <div className={isMobile ? 'w-10' : 'w-14'} /> {/* Nut offset */}
              {visibleFrets.map((fretNum) => {
                const isSingle = singleDotFrets.includes(fretNum);
                const isDouble = doubleDotFrets.includes(fretNum);

                return (
                  <div key={fretNum} className="flex-1 h-full flex flex-col items-center justify-center relative">
                    {isSingle && (
                      <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white/70 shadow-xs border border-gray-400/50 backdrop-blur-2xs"></div>
                    )}
                    {isDouble && (
                      <div className="flex flex-col space-y-6 sm:space-y-7">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white/70 shadow-xs border border-gray-400/50"></div>
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white/70 shadow-xs border border-gray-400/50"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical Metal Fret Wires */}
            <div className="absolute inset-0 pointer-events-none flex">
              {/* Bone Nut */}
              <div className={`${isMobile ? 'w-10' : 'w-14'} flex justify-end`}>
                <div className="w-2 h-full bg-linear-to-r from-stone-200 via-amber-100 to-stone-300 border-r border-amber-900/60 shadow-md"></div>
              </div>
              
              {/* Frets */}
              {visibleFrets.map((_, idx) => (
                <div key={idx} className="flex-1 h-full flex justify-end">
                  <div className="w-1 h-full bg-linear-to-r from-gray-400 via-stone-200 to-zinc-500 shadow-xs"></div>
                </div>
              ))}
            </div>

            {/* 6 Guitar Strings (from String 1 high E down to String 6 low E) */}
            <div className="absolute inset-0 flex flex-col justify-between py-1.5 sm:py-2 z-10">
              {strings.map((strNum) => {
                // String gauge thickness
                const stringGauges: Record<GuitarString, string> = {
                  1: 'h-[1.5px] bg-slate-200 shadow-sm', // High E
                  2: 'h-[1.8px] bg-slate-300 shadow-sm', // B
                  3: 'h-[2.2px] bg-amber-200 shadow-sm', // G
                  4: 'h-[2.8px] bg-linear-to-r from-amber-600 via-amber-400 to-amber-700 shadow-md', // D (wound)
                  5: 'h-[3.4px] bg-linear-to-r from-amber-700 via-amber-500 to-amber-800 shadow-md', // A (wound)
                  6: 'h-[4.0px] bg-linear-to-r from-amber-800 via-amber-600 to-amber-900 shadow-md', // Low E (thick wound)
                };

                const openInfo = STANDARD_OPEN_STRINGS[strNum];

                return (
                  <div key={strNum} className="relative flex items-center h-4 sm:h-4.5 group">
                    
                    {/* Metal String Line spanning full width */}
                    <div className={`absolute left-0 right-0 ${stringGauges[strNum]}`} />

                    {/* Open String / Nut Target (Fret 0) */}
                    <div
                      onClick={() => handleCellClick(strNum, 0)}
                      className={`${isMobile ? 'w-10' : 'w-14'} h-6 flex items-center justify-center z-10 cursor-pointer relative`}
                    >
                      {/* Check if active */}
                      {(() => {
                        const isActive = activeNotes.some((n) => n.string === strNum && n.fret === 0);
                        const isSelected = selectedNote?.string === strNum && selectedNote?.fret === 0;

                        if (isActive || isSelected) {
                          return (
                            <div className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold text-[9px] sm:text-[10px] shadow-lg ring-2 ring-emerald-300 animate-bounce">
                              {openInfo.note}
                            </div>
                          );
                        }

                        return (
                          <span className="text-[9px] sm:text-[10px] font-mono text-gray-300 bg-gray-900/80 px-1 py-0.2 rounded border border-gray-700 hover:border-emerald-400 hover:text-white transition-colors">
                            {openInfo.note}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Visible Frets Click spots & Note Markers */}
                    {visibleFrets.map((fret) => {
                      const { midi, pitch } = getNoteForFret(strNum, fret);
                      const isActive = activeNotes.some((n) => n.string === strNum && n.fret === fret);
                      const isSelected = selectedNote?.string === strNum && selectedNote?.fret === fret;

                      return (
                        <div
                          key={fret}
                          onClick={() => handleCellClick(strNum, fret)}
                          className="flex-1 h-6 flex items-center justify-center z-10 cursor-pointer relative hover:bg-white/10 transition-colors"
                          title={`String ${strNum} (${openInfo.note}) - Fret ${fret}: ${pitch}`}
                        >
                          {isActive ? (
                            <div className="w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-emerald-500 text-white font-extrabold text-[9px] sm:text-[10px] flex items-center justify-center shadow-lg ring-2 ring-emerald-300 ring-offset-1 ring-offset-black scale-110 animate-pulse">
                              {displayMode === 'pitch' ? pitch : fret}
                            </div>
                          ) : isSelected ? (
                            <div className="w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-amber-400 text-gray-950 font-extrabold text-[9px] sm:text-[10px] flex items-center justify-center shadow-md ring-2 ring-amber-200">
                              {displayMode === 'pitch' ? pitch : fret}
                            </div>
                          ) : showAllNoteNames ? (
                            <div className="text-[8px] sm:text-[9px] text-gray-300/80 font-mono bg-black/40 px-0.5 sm:px-1 rounded hover:text-white">
                              {pitch}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                  </div>
                );
              })}
            </div>

          </div>

          {/* String Labels along the left */}
          <div className="flex justify-between items-center text-[9px] sm:text-[10px] text-gray-400 mt-1 px-1">
            <span className="font-mono">String 1 (High E) ➔ String 6 (Low E)</span>
            <span className="text-gray-400 italic">
              {isMobile ? 'Touch fret to audition note' : 'Click any fret to audition note or apply to editor'}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};

