import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TabNote } from '../../../types';
import {
  TabNoteColumn,
  BeamGroup,
  groupNotesIntoColumns,
  computeRhythmBeams,
  snapTimestampToGrid,
} from './tabRhythmUtils';
import { MoveHorizontal, Sparkles, Volume2, Trash2 } from 'lucide-react';

interface StandardTabStaffProps {
  notes: TabNote[];
  measureTimestamps: number[];
  audioDurationSec: number;
  bpm?: number;
  currentTimeSec: number;
  visualTimeSec: number;
  selectedMeasureIndex: number | null;
  selectedNoteId: string | null;
  zoomLevel: number;
  darkMode: boolean;
  isPlaying: boolean;
  onSelectMeasure: (measureIndex: number) => void;
  onSelectNote: (note: TabNote) => void;
  onSeekTime: (timeSec: number) => void;
  onUpdateNotes: (updatedNotes: TabNote[]) => void;
  onDeleteNote: (noteId: string) => void;
  onPlayNoteSound: (stringIndex: number, fret: number | string) => void;
  snapMode: 'free' | '1/4' | '1/8' | '1/16';
  onShowToast: (msg: string) => void;
}

interface DragState {
  isDragging: boolean;
  columnId: string;
  noteIds: string[];
  measureIndex: number;
  measureStartSec: number;
  measureEndSec: number;
  initialMouseX: number;
  initialTimestampSec: number;
  currentTimestampSec: number;
  deltaSec: number;
}

export const StandardTabStaff: React.FC<StandardTabStaffProps> = ({
  notes,
  measureTimestamps,
  audioDurationSec,
  bpm = 80,
  currentTimeSec,
  visualTimeSec,
  selectedMeasureIndex,
  selectedNoteId,
  zoomLevel,
  darkMode,
  isPlaying,
  onSelectMeasure,
  onSelectNote,
  onSeekTime,
  onUpdateNotes,
  onDeleteNote,
  onPlayNoteSound,
  snapMode,
  onShowToast,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Drag state for dragging notes/columns along the measure timeline
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Group notes into columns (multi-note chord stacks on the exact same vertical line)
  const columns: TabNoteColumn[] = React.useMemo(() => {
    // If currently dragging, update the column/notes' timestamps in the view
    let effectiveNotes = notes;
    if (dragState && dragState.isDragging) {
      effectiveNotes = notes.map((n) => {
        if (dragState.noteIds.includes(n.id)) {
          return {
            ...n,
            timestampSec: dragState.currentTimestampSec,
            measureIndex: dragState.measureIndex,
          };
        }
        return n;
      });
    }
    return groupNotesIntoColumns(effectiveNotes, bpm);
  }, [notes, bpm, dragState]);

  // Compute rhythmic horizontal beam groups (for 8th & 16th notes)
  const rhythmBeams: BeamGroup[] = React.useMemo(() => {
    return computeRhythmBeams(columns, audioDurationSec);
  }, [columns, audioDurationSec]);

  // Handle Drag Start
  const handleNodeDragStart = (
    e: React.MouseEvent,
    col: TabNoteColumn,
    singleNoteOnly: boolean = false,
    specificNoteId?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const mIdx = col.measureIndex;
    const mStart = measureTimestamps[mIdx] ?? 0;
    const mEnd = measureTimestamps[mIdx + 1] ?? audioDurationSec;

    const targetNoteIds = singleNoteOnly && specificNoteId
      ? [specificNoteId]
      : col.notes.map((n) => n.id);

    setDragState({
      isDragging: true,
      columnId: col.id,
      noteIds: targetNoteIds,
      measureIndex: mIdx,
      measureStartSec: mStart,
      measureEndSec: mEnd,
      initialMouseX: e.clientX,
      initialTimestampSec: col.timestampSec,
      currentTimestampSec: col.timestampSec,
      deltaSec: 0,
    });

    onSelectMeasure(mIdx);
    if (col.notes[0]) {
      onSelectNote(col.notes[0]);
    }
  };

  // Global mousemove & mouseup listeners for dragging
  useEffect(() => {
    if (!dragState || !dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const trackWidth = rect.width;
      if (trackWidth <= 0) return;

      const deltaX = e.clientX - dragState.initialMouseX;
      // Convert pixels to seconds
      const secPerPixel = audioDurationSec / trackWidth;
      const rawDeltaSec = deltaX * secPerPixel;
      const unconstrainedTime = dragState.initialTimestampSec + rawDeltaSec;

      // Snap within measure bounds
      const snappedTime = snapTimestampToGrid(
        unconstrainedTime,
        dragState.measureStartSec,
        dragState.measureEndSec,
        snapMode,
        bpm
      );

      setDragState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentTimestampSec: snappedTime,
          deltaSec: snappedTime - prev.initialTimestampSec,
        };
      });

      // Synchronously update the parent notes state so NoteSampleInspector updates in real-time!
      const updatedNotes = notes.map((n) => {
        if (dragState.noteIds.includes(n.id)) {
          return {
            ...n,
            timestampSec: snappedTime,
            measureIndex: dragState.measureIndex,
          };
        }
        return n;
      });
      onUpdateNotes(updatedNotes);
    };

    const handleMouseUp = () => {
      if (dragState.isDragging) {
        onShowToast(
          `已更新节点时间戳至 ${dragState.currentTimestampSec.toFixed(2)}s (第 ${
            dragState.measureIndex + 1
          } 小节)`
        );
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    audioDurationSec,
    notes,
    snapMode,
    bpm,
    onUpdateNotes,
    onShowToast,
  ]);

  // Total track width calculated by duration and zoom
  const trackWidthPx = Math.max(1280, audioDurationSec * 105 * zoomLevel);

  // Top offsets for the 6 guitar strings (in px)
  // Staff total height for strings: 120px (6 strings -> 0, 24, 48, 72, 96, 120)
  const STRING_SPACING = 24;
  const STAFF_TOP = 40; // space for chords / barre on top
  const STRING_Y_OFFSETS = [0, 1, 2, 3, 4, 5].map((i) => STAFF_TOP + i * STRING_SPACING);
  const STEM_BOTTOM_Y = STAFF_TOP + 5 * STRING_SPACING + 38; // 198px - line for rhythm beams

  // Progress percentage for playhead
  const visualProgressPercent = (visualTimeSec / (audioDurationSec || 1)) * 100;

  return (
    <div className="relative flex flex-col select-none">
      {/* Scrollable Staff Area */}
      <div
        ref={scrollContainerRef}
        className={`relative rounded-xl border p-3 overflow-x-auto custom-scrollbar min-h-[290px] ${
          darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/70 border-slate-300'
        }`}
      >
        {/* Left Sticky Header: Standard TAB Glyph & String Labels */}
        <div
          className={`sticky left-0 z-30 flex flex-col justify-start w-12 shrink-0 py-2 border-r select-none ${
            darkMode ? 'bg-slate-950/95 border-slate-800 text-slate-300' : 'bg-slate-50/95 border-slate-300 text-slate-700'
          }`}
          style={{ height: `${STEM_BOTTOM_Y + 36}px` }}
        >
          {/* TAB Glyph Stack */}
          <div className="flex flex-col items-center justify-center font-serif font-black text-amber-500 tracking-wider text-sm leading-tight mb-2">
            <span>T</span>
            <span>A</span>
            <span>B</span>
          </div>

          {/* String Tuning Names (1=e, 2=B, 3=G, 4=D, 5=A, 6=E) */}
          <div className="flex-1 flex flex-col justify-between py-1 font-mono text-[10px] font-bold text-slate-400 pl-2">
            <span>1 e</span>
            <span>2 B</span>
            <span>3 G</span>
            <span>4 D</span>
            <span>5 A</span>
            <span>6 E</span>
          </div>

          <div className="text-[9px] text-center text-slate-500 font-mono mt-1">节奏</div>
        </div>

        {/* Tablature Main Track Canvas */}
        <div
          ref={trackRef}
          className="absolute top-3 left-16 right-4"
          style={{ width: `${trackWidthPx}px`, height: `${STEM_BOTTOM_Y + 40}px` }}
          onClick={(e) => {
            if (!trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickedTime = Math.max(0, Math.min(audioDurationSec, (clickX / rect.width) * audioDurationSec));
            onSeekTime(clickedTime);
          }}
        >
          {/* 1. The 6 Standard Parallel Guitar Strings */}
          {[0, 1, 2, 3, 4, 5].map((sIndex) => {
            const y = STRING_Y_OFFSETS[sIndex];
            const isBass = sIndex >= 4; // 5th, 6th wound strings slightly thicker
            return (
              <div
                key={`string-${sIndex}`}
                className={`absolute left-0 right-0 pointer-events-none transition-colors ${
                  isBass
                    ? darkMode
                      ? 'h-[1.5px] bg-slate-600'
                      : 'h-[1.5px] bg-slate-400'
                    : darkMode
                    ? 'h-[1px] bg-slate-700/80'
                    : 'h-[1px] bg-slate-300'
                }`}
                style={{ top: `${y}px` }}
              />
            );
          })}

          {/* 2. Rhythm Baseline (Horizontal Guide for stems and beams) */}
          <div
            className={`absolute left-0 right-0 h-[1px] border-b border-dashed ${
              darkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
            style={{ top: `${STEM_BOTTOM_Y}px` }}
          />

          {/* 3. Measures: Vertical Bar Lines and Measure Header Blocks */}
          {measureTimestamps.map((mStart, mIdx) => {
            const mEnd = measureTimestamps[mIdx + 1] ?? audioDurationSec;
            const leftPercent = (mStart / audioDurationSec) * 100;
            const widthPercent = ((mEnd - mStart) / audioDurationSec) * 100;
            const isSelected = selectedMeasureIndex === mIdx;

            return (
              <div
                key={`measure-block-${mIdx}`}
                className={`absolute top-0 bottom-0 border-l transition-all group/measure ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 shadow-xs'
                    : darkMode
                    ? 'border-slate-700/80 hover:bg-slate-800/20'
                    : 'border-slate-300 hover:bg-slate-100/60'
                }`}
                style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeasure(mIdx);
                  onSeekTime(mStart);
                }}
              >
                {/* Measure Header Badge with Number & Time */}
                <div className="flex items-center gap-1.5 p-1">
                  <div
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
                        : darkMode
                        ? 'bg-slate-800/90 text-slate-300 border-slate-700 hover:text-amber-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:text-amber-600 shadow-xs'
                    }`}
                  >
                    M{mIdx + 1} ({mStart.toFixed(1)}s)
                  </div>

                  {mIdx === 0 && (
                    <div
                      className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold"
                      title="拍号 4/4 拍"
                    >
                      4/4
                    </div>
                  )}
                </div>

                {/* Sub-beat guidelines inside measure (e.g. 4 beats per measure) */}
                <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                  <div className="w-[1px] h-full border-r border-dotted border-slate-400 ml-[25%]" />
                  <div className="w-[1px] h-full border-r border-dotted border-slate-400 ml-[25%]" />
                  <div className="w-[1px] h-full border-r border-dotted border-slate-400 ml-[25%]" />
                </div>
              </div>
            );
          })}

          {/* 4. Horizontal Rhythm Connecting Beams (横梁连线 for 8th and 16th notes) */}
          {rhythmBeams.map((beam) => (
            <div
              key={beam.id}
              className={`absolute pointer-events-none ${
                beam.beamType === '1/16'
                  ? 'h-[3.5px] bg-amber-400'
                  : 'h-[4px] bg-amber-500'
              }`}
              style={{
                left: `${beam.startXPercent}%`,
                width: `${beam.endXPercent - beam.startXPercent}%`,
                top: `${STEM_BOTTOM_Y + beam.yOffset}px`,
                boxShadow: darkMode ? '0 0 6px rgba(245, 158, 11, 0.4)' : 'none',
              }}
            />
          ))}

          {/* 5. Standard Tab Note Columns (Multi-note chord stack aligned vertically on exact straight line) */}
          {columns.map((col) => {
            const leftPercent = (col.timestampSec / audioDurationSec) * 100;
            const isColumnActive = Math.abs(visualTimeSec - col.timestampSec) < 0.2;
            const isColumnSelected = col.notes.some((n) => n.id === selectedNoteId);
            const isDraggingThis = dragState?.columnId === col.id;

            // Top string Y and bottom string Y for stem line
            const topStringY = STRING_Y_OFFSETS[col.minString - 1] ?? STAFF_TOP;
            const bottomStringY = STRING_Y_OFFSETS[col.maxString - 1] ?? (STAFF_TOP + 120);

            return (
              <div
                key={col.id}
                className="absolute z-20"
                style={{
                  left: `${leftPercent}%`,
                  top: 0,
                  bottom: 0,
                  width: '24px',
                  transform: 'translateX(-50%)',
                }}
              >
                {/* Top of column: Chord Name and Barre Marker */}
                {(col.chordName || col.barreMarker) && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30">
                    {col.chordName && (
                      <span className="px-1.5 py-0.2 rounded font-mono font-extrabold text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs whitespace-nowrap">
                        {col.chordName}
                      </span>
                    )}
                    {col.barreMarker && (
                      <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-tighter mt-0.5">
                        {col.barreMarker}
                      </span>
                    )}
                  </div>
                )}

                {/* Vertical Stem Line (串联和弦多音符并在下方延伸至符尾横梁) */}
                <div
                  onMouseDown={(e) => handleNodeDragStart(e, col)}
                  className={`absolute left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing group/stem transition-colors ${
                    isDraggingThis
                      ? 'w-[3px] bg-amber-400'
                      : isColumnSelected
                      ? 'w-[2.5px] bg-indigo-400'
                      : isColumnActive
                      ? 'w-[2.5px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                      : darkMode
                      ? 'w-[1.5px] bg-slate-500/80 hover:bg-amber-400 hover:w-[2.5px]'
                      : 'w-[1.5px] bg-slate-400 hover:bg-amber-500 hover:w-[2.5px]'
                  }`}
                  style={{
                    top: `${topStringY}px`,
                    height: `${STEM_BOTTOM_Y - topStringY}px`,
                  }}
                  title="按住垂直符干可水平拖拽整体调整小节内拍位"
                />

                {/* Drag handle grip on the stem for quick visual affordance */}
                <div
                  onMouseDown={(e) => handleNodeDragStart(e, col)}
                  className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-800/80 border border-amber-500/40 opacity-0 hover:opacity-100 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 transition-opacity"
                  style={{ top: `${(topStringY + bottomStringY) / 2}px` }}
                  title="拖动调整和弦位置"
                >
                  <MoveHorizontal className="w-2.5 h-2.5 text-amber-400" />
                </div>

                {/* Bottom Rhythm Flag / Stem Foot */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  style={{ top: `${STEM_BOTTOM_Y - 2}px` }}
                >
                  {col.rhythmType === '1/4' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                  {col.rhythmType === '1/8' && (
                    <div className="text-[9px] font-mono font-bold text-amber-400">♫</div>
                  )}
                  {col.rhythmType === '1/16' && (
                    <div className="text-[9px] font-mono font-bold text-amber-400">♬</div>
                  )}
                  {col.rhythmType === '1/2' && (
                    <div className="w-2.5 h-1.5 rounded-full border-2 border-amber-400 bg-slate-900" />
                  )}
                  <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                    {col.rhythmType}
                  </span>
                </div>

                {/* Individual Fret Numbers on their respective guitar strings */}
                {col.notes.map((note) => {
                  const stringY = STRING_Y_OFFSETS[note.stringIndex - 1] ?? STAFF_TOP;
                  const isNoteSelected = selectedNoteId === note.id;

                  return (
                    <div
                      key={note.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNote(note);
                        onPlayNoteSound(note.stringIndex, note.fret);
                      }}
                      onMouseDown={(e) => {
                        // If Alt or Shift is held, drag only this note; otherwise drag entire chord column
                        const singleOnly = e.shiftKey || e.altKey;
                        handleNodeDragStart(e, col, singleOnly, note.id);
                      }}
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 cursor-grab active:cursor-grabbing group/note"
                      style={{ top: `${stringY}px` }}
                      title={`${note.stringIndex}弦 ${note.fret}品 · 时间: ${note.timestampSec.toFixed(
                        2
                      )}s (按住拖拽移动位置)`}
                    >
                      {/* Standard Fret Box (covers string line cleanly) */}
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-mono text-xs font-bold transition-all duration-100 ${
                          isColumnActive
                            ? 'bg-amber-400 text-slate-950 scale-110 ring-4 ring-amber-400/40 shadow-lg'
                            : isNoteSelected
                            ? 'bg-indigo-600 text-white scale-110 ring-2 ring-white shadow-md'
                            : darkMode
                            ? 'bg-slate-900 text-amber-300 border border-slate-700 hover:border-amber-400 hover:scale-105'
                            : 'bg-white text-slate-900 border border-slate-300 hover:border-amber-500 hover:scale-105 shadow-xs'
                        }`}
                      >
                        {note.fret}
                      </div>

                      {/* Technique notation badge: H, P, /, ~, ◇, PM */}
                      {note.technique && note.technique !== 'normal' && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-cyan-400 bg-slate-900/90 px-1 rounded">
                          {note.technique === 'hammer-on'
                            ? 'H'
                            : note.technique === 'pull-off'
                            ? 'P'
                            : note.technique === 'slide'
                            ? '/'
                            : note.technique === 'vibrato'
                            ? '~'
                            : note.technique === 'harmonic'
                            ? '◇'
                            : note.technique === 'palm-mute'
                            ? 'PM'
                            : note.technique}
                        </div>
                      )}

                      {/* Quick Delete Note Icon Button on Hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNote(note.id);
                        }}
                        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white items-center justify-center hidden group-hover/note:flex shadow-xs text-[10px] z-40 hover:bg-rose-600"
                        title="删除此音符"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 6. Real-time 60 FPS Playhead Cursor Line */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 z-40 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.9)] flex flex-col items-center"
            style={{
              left: `${visualProgressPercent}%`,
              transition: isPlaying ? 'none' : 'left 0.08s ease-out',
            }}
          >
            <div className="w-3 h-3 -mt-1 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
          </div>

          {/* 7. Drag Guide & Tooltip (While Dragging Nodes in Measure) */}
          {dragState && dragState.isDragging && (
            <div
              className="absolute top-0 bottom-0 z-50 pointer-events-none flex flex-col items-center"
              style={{
                left: `${(dragState.currentTimestampSec / audioDurationSec) * 100}%`,
              }}
            >
              {/* Floating Tooltip Indicator */}
              <div className="absolute -top-9 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-mono font-bold shadow-xl border border-indigo-400 flex items-center gap-1.5 whitespace-nowrap">
                <MoveHorizontal className="w-3 h-3 text-amber-300" />
                <span>t = {dragState.currentTimestampSec.toFixed(2)}s</span>
                <span className="text-indigo-200">
                  (M{dragState.measureIndex + 1} +
                  {(
                    dragState.currentTimestampSec - dragState.measureStartSec
                  ).toFixed(2)}
                  s)
                </span>
              </div>
              {/* Vertical Drag Alignment Line */}
              <div className="w-[2px] h-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
