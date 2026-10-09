import React, { useRef, useEffect } from 'react';
import { ScoreData, Measure, TabNote, GuitarString, ViewMode, MeasureChord } from '../types/music';
import { getStaffDiatonicStep, COMMON_CHORDS } from '../utils/guitarTheory';
import { useIsMobile } from '../utils/useIsMobile';

interface ScoreViewerProps {
  score: ScoreData;
  playbackMeasure: number; // 1-based measure index
  playbackBeat: number;    // 0 to 4 within measure
  isPlaying: boolean;
  viewMode: ViewMode;
  zoomLevel: number;       // e.g. 1.0 = 100%
  isEditMode: boolean;
  selectedNote: TabNote | null;
  selectedChord: { measureId: string; chord: MeasureChord } | null;
  activeSoundingNotes?: TabNote[];
  isLooping?: boolean;
  loopRange?: { startMeasure: number; endMeasure: number };
  onSelectNote: (note: TabNote, clientPos: { x: number; y: number }) => void;
  onSelectChord: (measureId: string, chord: MeasureChord, clientPos: { x: number; y: number }) => void;
  onAddNoteAt: (measureId: string, string: GuitarString, beat: number) => void;
}

export const ScoreViewer: React.FC<ScoreViewerProps> = ({
  score,
  playbackMeasure,
  playbackBeat,
  isPlaying,
  viewMode,
  zoomLevel,
  isEditMode,
  selectedNote,
  selectedChord,
  activeSoundingNotes = [],
  isLooping = false,
  loopRange = { startMeasure: 1, endMeasure: 4 },
  onSelectNote,
  onSelectChord,
  onAddNoteAt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMeasureRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile(768);
  const lastScrolledMeasureRef = useRef<number>(-1);

  // When switching viewMode, immediately reset scroll so Measure 1 is at the start
  useEffect(() => {
    lastScrolledMeasureRef.current = -1;
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }
  }, [viewMode]);

  // Auto-scroll when playing, rewinding to start, or jumping between measures
  useEffect(() => {
    if (!containerRef.current || !activeMeasureRef.current) return;

    // Rewind to start: immediately scroll back to top-left (0, 0)
    if (playbackMeasure === 1 && playbackBeat === 0) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      lastScrolledMeasureRef.current = 1;
      return;
    }

    // Only trigger smooth scroll when playbackMeasure changes or on view switch,
    // avoiding calling scrollTo 60 times a second on every sub-beat frame!
    if (lastScrolledMeasureRef.current !== playbackMeasure) {
      lastScrolledMeasureRef.current = playbackMeasure;
      const container = containerRef.current;
      const target = activeMeasureRef.current;

      if (isMobile || viewMode === 'continuous') {
        // At Measure 1, strictly stay at left: 0 so Measure 1 starts at the beginning
        if (playbackMeasure <= 1) {
          container.scrollTo({ left: 0, behavior: 'smooth' });
          return;
        }

        // Mobile / Continuous: Horizontal single line scroll
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeLeft = targetRect.left - containerRect.left + container.scrollLeft;

        const targetOffset = isMobile
          ? relativeLeft - Math.max(12, (container.clientWidth - target.clientWidth) / 2)
          : relativeLeft - 180;

        container.scrollTo({ left: Math.max(0, targetOffset), behavior: 'smooth' });
      } else {
        // Desktop 'page' and 'vertical' modes:
        // Automatically scroll vertically into clear view so the active line is never occluded by the bottom Fretboard!
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (viewMode === 'page') {
          // Measures 1 to 6 are in System 1 (top line). Measures 7 to 12 are in System 2 (second line).
          if (playbackMeasure <= 6) {
            // System 1 on desktop: keep at top
            if (container.scrollTop > 20) {
              container.scrollTo({ top: 0, behavior: 'smooth' });
            }
          } else {
            // System 2 on desktop: scroll down so System 2 is completely visible above the bottom fretboard
            const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
            const targetTop = Math.max(0, relativeTop - 36);
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          }
        } else if (viewMode === 'vertical') {
          const targetRect = target.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
          const offsetTop = relativeTop - 120;
          container.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' });
        }
      }
    }
  }, [playbackMeasure, playbackBeat === 0, viewMode, isMobile]);

  // Layout partition:
  // On mobile: strictly single continuous horizontal row of measures as requested
  // On desktop: respects user viewMode ('page' | 'continuous' | 'vertical')
  let systems: Measure[][] = [];

  if (isMobile || viewMode === 'continuous') {
    systems = [score.measures];
  } else if (viewMode === 'vertical') {
    const perSystem = 4;
    for (let i = 0; i < score.measures.length; i += perSystem) {
      systems.push(score.measures.slice(i, i + perSystem));
    }
  } else {
    // 'page' mode: 6 measures per system
    const perSystem = 6;
    for (let i = 0; i < score.measures.length; i += perSystem) {
      systems.push(score.measures.slice(i, i + perSystem));
    }
  }

  // Draw chord diagram thumbnail
  const renderChordDiagram = (chordName: string, baseFret = 1) => {
    const chord = COMMON_CHORDS[chordName];
    if (!chord) return null;

    const width = 36;
    const height = 44;
    return (
      <svg width={width} height={height} className="overflow-visible inline-block">
        <text x="18" y="9" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1f2937">
          {chord.name}
        </text>
        <text x="-4" y="21" fontSize="7" fill="#6b7280">
          fr.{chord.baseFret}
        </text>
        {/* Nut / fretboard grid */}
        <rect x="2" y="14" width="32" height="2" fill="#374151" />
        <rect x="2" y="16" width="32" height="24" fill="none" stroke="#9ca3af" strokeWidth="0.8" />
        {/* Frets */}
        <line x1="2" y1="22" x2="34" y2="22" stroke="#d1d5db" strokeWidth="0.6" />
        <line x1="2" y1="28" x2="34" y2="28" stroke="#d1d5db" strokeWidth="0.6" />
        <line x1="2" y1="34" x2="34" y2="34" stroke="#d1d5db" strokeWidth="0.6" />
        {/* Strings */}
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <line key={s} x1={2 + s * 6.4} y1="16" x2={2 + s * 6.4} y2="40" stroke="#9ca3af" strokeWidth="0.6" />
        ))}
        {/* Barre or finger dots */}
        {chord.frets.map((fret, sIdx) => {
          if (fret === 'x') {
            return (
              <text key={sIdx} x={2 + sIdx * 6.4} y="13" textAnchor="middle" fontSize="7" fill="#9ca3af">
                ×
              </text>
            );
          }
          if (typeof fret === 'number' && fret > 0) {
            const relFret = fret - chord.baseFret + 1;
            const y = 16 + (relFret - 0.5) * 6;
            return (
              <circle key={sIdx} cx={2 + sIdx * 6.4} cy={y} r="2.2" fill="#111827" />
            );
          }
          return null;
        })}
      </svg>
    );
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-[#eef1f3] overflow-hidden select-none font-serif">
      
      {/* 1. Score Header Info - OUTSIDE of the score card as requested */}
      <div className="w-full shrink-0 bg-white/95 backdrop-blur-md border-b border-gray-200/90 px-3 sm:px-6 py-2.5 sm:py-3 z-20 shadow-xs">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          
          {/* Left: Score Title and Key Meta */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              ♫
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-black font-sans text-gray-900 tracking-tight leading-tight flex items-center gap-2">
                <span>{score.title}</span>
                {score.subtitle && (
                  <span className="hidden md:inline-block text-xs font-normal text-gray-500 font-sans border-l border-gray-300 pl-2">
                    {score.subtitle}
                  </span>
                )}
              </h1>
              <div className="flex items-center space-x-2 text-[11px] sm:text-xs text-gray-500 font-sans mt-0.5">
                <span className="font-semibold text-gray-800 flex items-center gap-0.5">
                  <span className="text-xs">♩</span> = {score.tempo} BPM
                </span>
                <span>•</span>
                <span>{score.tuningName} (fr. {score.capo})</span>
                <span>•</span>
                <span className="font-mono font-bold text-emerald-800">{score.keySignature}</span>
              </div>
            </div>
          </div>

          {/* Right: Badges & Transcribed by */}
          <div className="flex items-center space-x-2 text-xs font-sans ml-auto">
            {/* Time signature & Key */}
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold font-mono text-[11px]">
              {score.timeSignature}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-bold font-mono text-[11px]">
              {score.keySignature} {score.flatsCount ? `(${score.flatsCount}♭)` : ''}
            </span>

            {/* Transcribed by */}
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-gray-500 font-sans pl-2 border-l border-gray-200">
              <span>Transcribed by</span>
              <div className="flex items-center space-x-1 font-bold text-gray-900">
                <svg width="14" height="14" viewBox="0 0 36 36" fill="none" className="inline-block">
                  <path d="M18 3.5C27 3.5 32 8.5 32 17.5C32 26 21.5 32.5 18 34.5C14.5 32.5 4 26 4 17.5C4 8.5 9 3.5 18 3.5Z" fill="#12785f"/>
                  <line x1="12" y1="13" x2="12" y2="21" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="18" y1="10" x2="18" y2="24" stroke="#fef08a" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="24" y1="14" x2="24" y2="20" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
                <span>guitar<span className="text-emerald-600">mate</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Body: Houses the Music Score Card */}
      <div
        ref={isMobile ? undefined : containerRef}
        className={`w-full flex-1 ${
          isMobile 
            ? 'p-2 sm:p-3 overflow-hidden flex flex-col' 
            : `overflow-auto p-2 sm:p-4 md:p-6 flex flex-col ${
                viewMode === 'continuous' ? 'items-start overflow-x-auto overflow-y-hidden' : 'md:items-center items-start'
              }`
        }`}
        style={{
          transform: isMobile ? 'none' : `scale(${zoomLevel})`,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        {/* MUSIC SCORE CARD - Moving score staves are wrapped inside this card */}
        <div
          className={`bg-white rounded-2xl shadow-md border-2 border-gray-300/90 text-gray-900 transition-all ${
            isMobile
              ? 'w-full h-full flex flex-col overflow-hidden relative'
              : viewMode === 'page'
              ? 'w-full max-w-[1280px] p-6 sm:p-8 mb-20 pb-36'
              : viewMode === 'continuous'
              ? 'min-w-[1600px] w-max p-6 sm:p-8'
              : 'w-full max-w-[1280px] p-6 sm:p-8 mb-20 pb-36'
          }`}
        >
          {/* On mobile: scrollable container is strictly INSIDE the card with visible left and right card borders */}
          <div 
            ref={isMobile ? containerRef : undefined}
            className={isMobile ? 'w-full h-full overflow-x-auto overflow-y-hidden p-3 scrollbar-none' : 'w-full'}
          >
            {/* SYSTEMS / STAVES */}
            <div className="space-y-8 sm:space-y-12">
            {systems.map((systemMeasures, sysIdx) => {
              const isFirstSystem = sysIdx === 0;

              return (
                <div key={sysIdx} className="w-full relative flex flex-col">
                  
                  {/* SYSTEM WRAPPER */}
                  <div className={`${isMobile ? 'w-max' : 'w-full'} flex md:border-l-2 md:border-gray-900 pl-0 md:pl-1 relative`}>
                  
                  {/* Left Instrument / Clef / Key / Time Signature block (Desktop ONLY, hidden on mobile) */}
                  <div className="hidden md:flex w-24 shrink-0 flex-col justify-start relative pr-2">
                    {/* Instrument label */}
                    <div className="absolute -top-3 left-0 text-xs font-sans font-bold text-gray-700">
                      Guitar
                    </div>

                    {/* Standard Notation Clef & Signatures (Upper) */}
                    <div className="h-28 relative flex items-center pt-6">
                      {/* Treble Clef Symbol */}
                      <span className="text-4xl text-gray-900 select-none font-serif leading-none -mt-4">
                        𝄞
                      </span>

                      {/* 3 Flats Key Signature for Eb/Cm (Bb, Eb, Ab) */}
                      <div className="flex space-x-0.5 items-center text-sm font-bold text-gray-900 ml-1 select-none">
                        <span className="-translate-y-1">♭</span>
                        <span className="translate-y-0.5">♭</span>
                        <span className="-translate-y-2">♭</span>
                      </div>

                      {/* Time Signature 4/4 */}
                      <div className="flex flex-col text-xs font-bold text-gray-900 ml-1.5 leading-none">
                        <span>4</span>
                        <span className="mt-0.5">4</span>
                      </div>
                    </div>

                    {/* TAB Badge (Lower) */}
                    <div className="h-24 relative flex items-center pt-2">
                      <div className="flex flex-col text-[11px] font-sans font-black tracking-widest text-gray-900 leading-tight border-r border-gray-400 pr-1.5">
                        <span>T</span>
                        <span>A</span>
                        <span>B</span>
                      </div>
                    </div>
                  </div>

                  {/* Measures Grid in System */}
                  <div className={`${isMobile ? 'w-max' : 'flex-1 w-full'} flex relative`}>
                    
                    {/* Background Staff Lines (Upper 5 lines for Standard Notation) */}
                    <div className="absolute left-0 right-0 top-6 h-16 pointer-events-none flex flex-col justify-between">
                      {[0, 1, 2, 3, 4].map((line) => (
                        <div key={line} className="w-full h-px bg-gray-400/90" />
                      ))}
                    </div>

                    {/* Background Staff Lines (Lower 6 lines for Guitar TAB) */}
                    <div className="absolute left-0 right-0 top-32 h-20 pointer-events-none flex flex-col justify-between">
                      {[1, 2, 3, 4, 5, 6].map((line) => (
                        <div key={line} className="w-full h-px bg-gray-400/90" />
                      ))}
                    </div>

                    {/* Render each measure */}
                    {systemMeasures.map((measure, mIdx) => {
                      const isMeasureActive = playbackMeasure === measure.number;
                      const hasChord = !!measure.chord;

                      return (
                        <div
                          key={measure.id}
                          ref={isMeasureActive ? activeMeasureRef : null}
                          className={`relative flex-1 border-r border-gray-600/90 h-56 transition-colors group ${
                            isMobile
                              ? 'w-[84vw] max-w-[340px] min-w-[270px] shrink-0'
                              : 'min-w-[170px]'
                          } ${
                            isMeasureActive ? 'bg-cyan-50/30' : 'hover:bg-gray-50/40'
                          }`}
                        >
                          {/* Measure Number & Loop Indicator */}
                          <div className="absolute top-0 left-1 flex items-center space-x-1">
                            <span className="text-[10px] font-sans font-bold text-gray-400">
                              {measure.number}
                            </span>
                            {isLooping && measure.number >= loopRange.startMeasure && measure.number <= loopRange.endMeasure && (
                              <span className="px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[8px] font-bold font-mono border border-emerald-300">
                                {measure.number === loopRange.startMeasure ? 'LOOP A' : measure.number === loopRange.endMeasure ? 'LOOP B' : 'LOOP'}
                              </span>
                            )}
                          </div>

                          {/* Chord Symbol and Diagram above Measure */}
                          {hasChord && (
                            <div 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                onSelectChord(measure.id, measure.chord!, { x: rect.left, y: rect.top });
                              }}
                              className="absolute -top-1 left-2 flex items-center space-x-1.5 cursor-pointer hover:bg-sky-50 px-1 py-0.5 rounded transition-colors z-20 group/chord"
                              title="Click to edit chord"
                            >
                              <span className="font-sans font-bold text-xs sm:text-sm text-gray-900 group-hover/chord:text-sky-700">
                                {measure.chord!.name}
                              </span>
                              {measure.chord!.diagramFret && (
                                <div className="scale-75 -my-2 origin-left">
                                  {renderChordDiagram(measure.chord!.name, measure.chord!.diagramFret)}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Dynamic Active Playback Indicator Line (Ultra-visible on mobile & desktop, perfectly synchronized) */}
                          {isMeasureActive && (
                            <div
                              className="absolute top-1 bottom-3 z-40 pointer-events-none flex flex-col items-center -translate-x-1/2 will-change-transform"
                              style={{
                                left: `${Math.min(94, Math.max(6, 8 + (Math.min(4, Math.max(0, playbackBeat)) / 4.0) * 84))}%`,
                              }}
                            >
                              {/* Top glowing cursor pinhead with ring */}
                              <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 ring-2 ring-white shadow-md -mt-1 flex items-center justify-center shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-700"></div>
                              </div>
                              {/* Bright vertical cursor beam traversing both staves */}
                              <div className="w-1.5 sm:w-1 h-full bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,1)] rounded-full"></div>
                              {/* Bottom glowing cursor pinhead */}
                              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-white shadow-sm -mb-1 shrink-0"></div>
                            </div>
                          )}

                          {/* UPPER: Standard 5-line notation notes */}
                          <div className="absolute left-0 right-0 top-6 h-16 pointer-events-none">
                            {measure.notes.map((note) => {
                              // Position horizontally within measure based on beat (0 to 4)
                              const xPercent = 8 + (note.beat / 4.0) * 84;
                              // Calculate staff vertical line offset based on diatonic step
                              const step = getStaffDiatonicStep(note.midi);
                              // Treble staff middle line is B4 (step 6). 5 lines are E4 (step 2) to F5 (step 10)
                              // Step height is roughly 4px
                              const yPos = 32 - (step - 6) * 4;
                              const isSounding = activeSoundingNotes.some((n) => n.id === note.id);

                              return (
                                <div
                                  key={`staff-${note.id}`}
                                  className="absolute flex items-center justify-center -translate-x-1/2 -translate-y-1/2 z-10"
                                  style={{
                                    left: `${xPercent}%`,
                                    top: `${Math.max(6, Math.min(58, yPos))}px`,
                                  }}
                                >
                                  {/* Standard notehead (black oval, or glowing cyan aura when actively sounding) */}
                                  {isSounding ? (
                                    <div className="w-3 h-2.5 bg-cyan-400 rounded-full rotate-[-20deg] shadow-[0_0_12px_rgba(6,182,212,1)] ring-2 ring-cyan-200 transition-all scale-125" />
                                  ) : (
                                    <div className="w-2.5 h-2 bg-gray-900 rounded-full rotate-[-20deg]" />
                                  )}
                                  {/* Upward/downward note stem */}
                                  <div className={`w-px h-6 absolute left-2 -top-5 transition-colors ${isSounding ? 'bg-cyan-500' : 'bg-gray-900'}`} />
                                </div>
                              );
                            })}
                          </div>

                          {/* LOWER: 6-line Guitar TAB notes */}
                          <div className="absolute left-0 right-0 top-32 h-20">
                            {measure.notes.map((note) => {
                              const xPercent = 8 + (note.beat / 4.0) * 84;
                              // 6 strings evenly divided across 80px (16px per string)
                              // String 1 (High E) is at top, String 6 (Low E) at bottom
                              const yPos = (note.string - 1) * 16;
                              const isSelected = selectedNote?.id === note.id;
                              const isSounding = activeSoundingNotes.some((n) => n.id === note.id);

                              return (
                                <div
                                  key={`tab-${note.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    onSelectNote(note, { x: rect.left, y: rect.top });
                                  }}
                                  className={`absolute flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform z-20 ${
                                    isSelected
                                      ? 'scale-125 z-30'
                                      : isSounding
                                      ? 'scale-115 z-30'
                                      : 'hover:scale-115'
                                  }`}
                                  style={{
                                    left: `${xPercent}%`,
                                    top: `${yPos}px`,
                                  }}
                                  title={`String ${note.string} - Fret ${note.fret} (${note.pitch})`}
                                >
                                  {/* Selection box matching transcription2.png & transcription4.png */}
                                  {isSelected ? (
                                    <div className="px-1.5 py-0.5 rounded bg-sky-500 text-white font-sans font-black text-xs shadow-md ring-2 ring-sky-300 ring-offset-1">
                                      {note.isTied ? `(${note.fret})` : note.fret}
                                    </div>
                                  ) : isSounding ? (
                                    <div className="bg-cyan-500 text-white font-sans font-black text-xs px-1.5 py-0.5 rounded-md shadow-[0_0_10px_rgba(6,182,212,0.9)] ring-2 ring-cyan-200 transition-all">
                                      {note.isTied ? `(${note.fret})` : note.fret}
                                    </div>
                                  ) : (
                                    <div className="bg-white px-1 text-xs font-sans font-bold text-gray-900 border border-transparent hover:border-sky-400 hover:text-sky-700 rounded transition-colors">
                                      {note.isTied ? `(${note.fret})` : note.fret}
                                    </div>
                                  )}

                                  {/* Upward cyan connector line to staff when selected (Matching transcription2.png) */}
                                  {isSelected && (
                                    <div className="absolute -top-32 w-0.5 h-32 bg-sky-400 pointer-events-none opacity-80" />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Click-to-add note catcher in edit mode */}
                          {isEditMode && (
                            <div
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const beat = Math.round((clickX / rect.width) * 4 * 2) / 2; // snap to 8th beats
                                onAddNoteAt(measure.id, 2, Math.min(3.5, Math.max(0, beat)));
                              }}
                              className="absolute inset-0 cursor-crosshair opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto"
                              title="Click to insert note on beat"
                            >
                              <div className="text-[10px] text-gray-400 font-sans bg-white/80 px-2 py-0.5 rounded shadow-xs">
                                + Add Note
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}

                  </div>

                </div>

              </div>
            );
          })}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
