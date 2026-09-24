import React, { useMemo } from 'react';
import { TabData, TabNote } from '../types';
import { getTabNoteFrequency, TAB_STRING_NAMES } from '../utils/tabGenerator';
import { audioEngine } from '../utils/audioSynth';

interface GuitarTabStaffProps {
  tabData: TabData;
  isActive: boolean;
  isPlaying: boolean;
  progressPercent: number; // 0 to 100
  onChordClick?: (chord: string) => void;
  activeChordName?: string;
  isSoloSection?: boolean;
  isDark?: boolean;
  onSeek?: (progressPercent: number) => void;
}

export const GuitarTabStaff: React.FC<GuitarTabStaffProps> = ({
  tabData,
  isActive,
  isPlaying,
  progressPercent,
  onChordClick,
  activeChordName,
  isSoloSection = false,
  isDark = true,
  onSeek,
}) => {
  const { notes, measureCount = 2 } = tabData;

  // Layout parameters for SVG Tab Staff
  const svgWidth = 600;
  const svgHeight = 142;
  const tabLeftX = 42;
  const tabRightX = 585;
  const usableWidth = tabRightX - tabLeftX;

  // 6 strings: string 1 (top) to string 6 (bottom)
  // stringY[1] is top (string 1), stringY[6] is bottom (string 6)
  const staffTopY = 32;
  const lineSpacing = 13;
  const stringY: Record<number, number> = {
    1: staffTopY,
    2: staffTopY + lineSpacing * 1,
    3: staffTopY + lineSpacing * 2,
    4: staffTopY + lineSpacing * 3,
    5: staffTopY + lineSpacing * 4,
    6: staffTopY + lineSpacing * 5,
  };

  // Convert timePct (0 to 100) to pixel X coordinate
  const getNoteX = (pct: number) => tabLeftX + (pct / 100) * usableWidth;

  // Current playhead X coordinate
  const playheadX = tabLeftX + (Math.max(0, Math.min(100, progressPercent)) / 100) * usableWidth;

  // Group chords annotated above the staff
  const chordAnnotations = useMemo(() => {
    const chordsList: { chord: string; timePct: number; x: number }[] = [];
    notes.forEach((n) => {
      if (n.chord && !chordsList.some((c) => Math.abs(c.timePct - n.timePct) < 8)) {
        chordsList.push({
          chord: n.chord,
          timePct: n.timePct,
          x: getNoteX(n.timePct),
        });
      }
    });
    return chordsList;
  }, [notes]);

  // Handle single note click
  const handleNoteClick = (e: React.MouseEvent, note: TabNote) => {
    e.stopPropagation();
    const freq = getTabNoteFrequency(note.string, note.fret);
    audioEngine.playString(freq, 1.8, 0);
  };

  // Handle click on staff or internal progress bar to seek
  const handleStaffClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scale = svgWidth / rect.width;
    const svgClickX = clickX * scale;
    if (svgClickX >= tabLeftX && svgClickX <= tabRightX) {
      const pct = ((svgClickX - tabLeftX) / usableWidth) * 100;
      onSeek(Math.max(0, Math.min(100, pct)));
    }
  };

  return (
    <div className="relative w-full overflow-hidden py-1 px-0.5 select-none">
      {/* SVG 6-Line Tablature Canvas */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible block cursor-pointer"
        preserveAspectRatio="xMidYMid meet"
        onClick={handleStaffClick}
      >
        <defs>
          {/* Glowing Playhead Filter */}
          <filter id="tabGlowEmerald" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="tabGlowAmber" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Gradients for internal 6-line staff sweep */}
          <linearGradient id="tabStaffSweepEmerald" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="tabStaffSweepAmber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Active Staff Background Progress Sweep (From tabLeftX to playheadX across strings) */}
        {isActive && playheadX > tabLeftX && (
          <rect
            x={tabLeftX}
            y={staffTopY - 4}
            width={Math.min(usableWidth, Math.max(0, playheadX - tabLeftX))}
            height={stringY[6] - staffTopY + 8}
            rx="4"
            fill={isSoloSection ? 'url(#tabStaffSweepAmber)' : 'url(#tabStaffSweepEmerald)'}
          />
        )}

        {/* Measure Numbers & Internal Dividers (取消掉六线谱的边框，只保留内部小节线) */}
        {Array.from({ length: measureCount + 1 }).map((_, mIdx) => {
          const barX = tabLeftX + (mIdx / measureCount) * usableWidth;
          return (
            <g key={`bar-${mIdx}`}>
              {/* Measure Number above internal divider */}
              {mIdx < measureCount && (
                <text
                  x={barX + 6}
                  y={staffTopY - 14}
                  fill={isDark ? '#71717a' : '#94a3b8'}
                  fontSize="9"
                  fontFamily="system-ui, monospace"
                  fontWeight="600"
                >
                  {mIdx + 1}
                </text>
              )}
              {/* Internal measure division lines only - no boundary borders on mIdx === 0 or mIdx === measureCount */}
              {mIdx > 0 && mIdx < measureCount && (
                <line
                  x1={barX}
                  y1={staffTopY}
                  x2={barX}
                  y2={stringY[6]}
                  stroke={isDark ? '#3f3f46' : '#cbd5e1'}
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}

        {/* The 6 Staff String Lines */}
        {[1, 2, 3, 4, 5, 6].map((strNum) => {
          const y = stringY[strNum];
          const isVibrating =
            isActive &&
            isPlaying &&
            notes.some(
              (n) =>
                n.string === strNum &&
                Math.abs(getNoteX(n.timePct) - playheadX) < 18
            );

          return (
            <line
              key={`string-${strNum}`}
              x1={tabLeftX}
              y1={y}
              x2={tabRightX}
              y2={y}
              stroke={
                isVibrating
                  ? isSoloSection
                    ? '#f59e0b'
                    : '#34d399'
                  : isDark
                  ? '#3f3f46'
                  : '#cbd5e1'
              }
              strokeWidth={strNum === 6 ? 1.4 : strNum === 1 ? 0.9 : 1.1}
              strokeOpacity={0.85}
              className={isVibrating ? 'transition-all duration-100' : ''}
            />
          );
        })}

        {/* Left Side: Standard TAB Block Header */}
        <g className="select-none">
          <text
            x="14"
            y={staffTopY + 14}
            fill={isDark ? '#a1a1aa' : '#64748b'}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="800"
            letterSpacing="0"
          >
            T
          </text>
          <text
            x="14"
            y={staffTopY + 33}
            fill={isDark ? '#a1a1aa' : '#64748b'}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="800"
            letterSpacing="0"
          >
            A
          </text>
          <text
            x="14"
            y={staffTopY + 52}
            fill={isDark ? '#a1a1aa' : '#64748b'}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="800"
            letterSpacing="0"
          >
            B
          </text>
          {/* Subtle string names next to strings */}
          {[1, 2, 3, 4, 5, 6].map((strNum) => (
            <text
              key={`str-name-${strNum}`}
              x="30"
              y={stringY[strNum] + 3}
              fill={isDark ? '#71717a' : '#94a3b8'}
              fontSize="7.5"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {TAB_STRING_NAMES[strNum]}
            </text>
          ))}
        </g>

        {/* Chord Annotations Above Staff (和弦在谱子上方标注) */}
        {chordAnnotations.map((c, cIdx) => {
          const isCurrentChord =
            isActive &&
            isPlaying &&
            (activeChordName === c.chord || Math.abs(c.x - playheadX) < 26);

          return (
            <g
              key={`chord-annot-${cIdx}`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onChordClick) onChordClick(c.chord);
              }}
            >
              {/* Subtle pill background behind chord label */}
              <rect
                x={c.x - 14}
                y={staffTopY - 24}
                width="28"
                height="15"
                rx="4"
                fill={isCurrentChord ? '#10b981' : isDark ? '#27272a' : '#f1f5f9'}
                stroke={isCurrentChord ? '#34d399' : isDark ? '#3f3f46' : '#cbd5e1'}
                strokeWidth="1"
                className="transition-colors duration-150"
              />
              <text
                x={c.x}
                y={staffTopY - 13}
                fill={isCurrentChord ? '#000000' : '#10b981'}
                fontSize="9.5"
                fontFamily="system-ui, monospace"
                fontWeight="800"
                textAnchor="middle"
              >
                {c.chord}
              </text>
            </g>
          );
        })}

        {/* Tab Notes & Fret Numbers on the 6 String Lines */}
        {notes.map((note, nIdx) => {
          const nx = getNoteX(note.timePct);
          const ny = stringY[note.string];
          if (!ny) return null;

          const distanceToPlayhead = Math.abs(nx - playheadX);
          const isNoteCurrentlyHit = isActive && isPlaying && distanceToPlayhead < 12;
          const isNotePast = isActive && isPlaying && nx < playheadX - 12;

          const fretStr = String(note.fret);
          const isWide = fretStr.length > 2;
          const bgWidth = isWide ? 22 : 14;

          return (
            <g
              key={`note-${nIdx}`}
              className="cursor-pointer group"
              onClick={(e) => handleNoteClick(e, note)}
            >
              {/* Note hit animation glow */}
              {isNoteCurrentlyHit && (
                <circle
                  cx={nx}
                  cy={ny}
                  r="12"
                  fill={isSoloSection ? '#f59e0b' : '#34d399'}
                  fillOpacity="0.35"
                  className="animate-ping"
                />
              )}

              {/* Masking Background so the string line doesn't strike through the number */}
              <rect
                x={nx - bgWidth / 2}
                y={ny - 6}
                width={bgWidth}
                height="12"
                rx="2"
                fill={
                  isNoteCurrentlyHit
                    ? isSoloSection
                      ? '#f59e0b'
                      : '#10b981'
                    : isDark
                    ? '#18181b'
                    : '#ffffff'
                }
                stroke={
                  isNoteCurrentlyHit
                    ? '#ffffff'
                    : isNotePast
                    ? isSoloSection
                      ? '#d97706'
                      : '#059669'
                    : isDark
                    ? '#3f3f46'
                    : '#94a3b8'
                }
                strokeWidth={isNoteCurrentlyHit ? 1.5 : 0.8}
                className="transition-colors duration-100 group-hover:stroke-emerald-400"
              />

              {/* Fret Number Text */}
              <text
                x={nx}
                y={ny + 3.5}
                fill={
                  isNoteCurrentlyHit
                    ? '#000000'
                    : isNotePast
                    ? isDark
                      ? '#e4e4e7'
                      : '#334155'
                    : isDark
                    ? '#fafafa'
                    : '#0f172a'
                }
                fontSize={isWide ? '8' : '9'}
                fontFamily="system-ui, monospace"
                fontWeight="700"
                textAnchor="middle"
                className="group-hover:fill-emerald-400"
              >
                {fretStr}
              </text>

              {/* Triplet bracket or technique annotation underneath */}
              {note.triplet && (
                <g>
                  {/* Stem line below */}
                  <line
                    x1={nx}
                    y1={stringY[6] + 2}
                    x2={nx}
                    y2={stringY[6] + 16}
                    stroke={isDark ? '#a1a1aa' : '#64748b'}
                    strokeWidth="1"
                  />
                  {/* Triplet 3 mark */}
                  <text
                    x={nx}
                    y={stringY[6] + 26}
                    fill={isDark ? '#a1a1aa' : '#64748b'}
                    fontSize="8"
                    fontFamily="sans-serif"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    3
                  </text>
                </g>
              )}

              {/* Bend/Technique curve if specified */}
              {note.technique === 'bend' && (
                <path
                  d={`M ${nx + 6} ${ny - 3} Q ${nx + 10} ${ny - 12} ${nx + 14} ${ny - 12}`}
                  fill="none"
                  stroke={isSoloSection ? '#fbbf24' : '#34d399'}
                  strokeWidth="1.2"
                />
              )}
            </g>
          );
        })}

        {/* Dedicated 6-Line Tab Staff Internal Progress Bar (保留里面六线谱移动的进度栏，移除外部进度条) */}
        <g>
          {/* Base Track along the entire staff width */}
          <line
            x1={tabLeftX}
            y1="132"
            x2={tabRightX}
            y2="132"
            stroke={isDark ? '#27272a' : '#e2e8f0'}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Active Moving Progress Bar */}
          {isActive && playheadX > tabLeftX && (
            <line
              x1={tabLeftX}
              y1="132"
              x2={playheadX}
              y2="132"
              stroke={isSoloSection ? '#f59e0b' : '#34d399'}
              strokeWidth="3"
              strokeLinecap="round"
              filter={isSoloSection ? 'url(#tabGlowAmber)' : 'url(#tabGlowEmerald)'}
            />
          )}
          {/* Progress Indicator Node at current playhead */}
          {isActive && (
            <circle
              cx={playheadX}
              cy="132"
              r={isPlaying ? 4.5 : 3.5}
              fill={isSoloSection ? '#fbbf24' : '#6ee7b7'}
              stroke={isDark ? '#09090b' : '#ffffff'}
              strokeWidth="1.5"
            />
          )}
        </g>

        {/* Dynamic Sweeping Playhead Cursor (Line) */}
        {isActive && isPlaying && (
          <g>
            {/* Playhead vertical laser line extending through all 6 strings down to the progress bar */}
            <line
              x1={playheadX}
              y1={staffTopY - 8}
              x2={playheadX}
              y2="132"
              stroke={isSoloSection ? '#f59e0b' : '#34d399'}
              strokeWidth="2"
              strokeLinecap="round"
              filter={isSoloSection ? 'url(#tabGlowAmber)' : 'url(#tabGlowEmerald)'}
            />
            {/* Playhead top diamond beacon */}
            <polygon
              points={`${playheadX},${staffTopY - 6} ${playheadX - 4.5},${staffTopY - 13} ${playheadX + 4.5},${staffTopY - 13}`}
              fill={isSoloSection ? '#fbbf24' : '#6ee7b7'}
            />
          </g>
        )}
      </svg>
    </div>
  );
};
