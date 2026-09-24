import React from 'react';
import { CHORD_DATABASE } from '../data/mockData';
import { audioEngine } from '../utils/audioSynth';
import { Volume2, ZoomIn } from 'lucide-react';

interface ChordDiagramProps {
  chordName: string;
  size?: 'sm' | 'md' | 'lg';
  showPlayButton?: boolean;
  onEnlarge?: () => void;
  isActive?: boolean;
  hideHint?: boolean;
}

export const ChordDiagram: React.FC<ChordDiagramProps> = ({
  chordName,
  size = 'md',
  showPlayButton = false,
  onEnlarge,
  isActive = false,
  hideHint = false,
}) => {
  const chord = CHORD_DATABASE[chordName] || {
    name: chordName,
    frets: ['x', 'x', 0, 2, 3, 2],
    fingers: [null, null, null, 1, 3, 2],
    difficulty: 'easy',
  };

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    audioEngine.playChord(chordName);
  };

  // Dimensions based on size
  const config = {
    sm: { width: 120, height: 140, dotR: 6, fontSize: 10 },
    md: { width: 160, height: 180, dotR: 8, fontSize: 12 },
    lg: { width: 240, height: 270, dotR: 12, fontSize: 15 },
  }[size];

  const stringCount = 6;
  const fretCount = 5;
  const paddingX = size === 'lg' ? 36 : 24;
  const paddingTop = size === 'lg' ? 44 : 32;
  const paddingBottom = size === 'lg' ? 36 : 24;

  const innerW = config.width - paddingX * 2;
  const innerH = config.height - paddingTop - paddingBottom;
  const stringSpacing = innerW / (stringCount - 1);
  const fretSpacing = innerH / fretCount;

  return (
    <div
      className={`relative flex flex-col items-center bg-zinc-900/90 rounded-2xl border transition-all ${
        isActive
          ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/50'
          : 'border-zinc-800/80 hover:border-zinc-700'
      } ${size === 'lg' ? 'p-6' : size === 'sm' ? 'p-2' : 'p-4'}`}
    >
      {/* Chord Header */}
      <div className="flex items-center justify-between w-full mb-1">
        <span
          className={`font-extrabold tracking-tight text-white ${
            size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg'
          }`}
        >
          {chordName}
        </span>
        <div className="flex items-center gap-1.5">
          {onEnlarge && (
            <button
              onClick={onEnlarge}
              title="放大和弦图"
              className="p-1 rounded-md bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
            >
              <ZoomIn size={size === 'lg' ? 18 : 14} />
            </button>
          )}
          {showPlayButton && (
            <button
              onClick={handlePlay}
              title="试听和弦发声"
              className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black transition"
            >
              <Volume2 size={size === 'lg' ? 18 : 14} />
            </button>
          )}
        </div>
      </div>

      {/* SVG Fretboard */}
      <svg
        width={config.width}
        height={config.height}
        className="overflow-visible cursor-pointer"
        onClick={handlePlay}
      >
        {/* Nut (thick top border if baseFret is 1 or undefined) */}
        <line
          x1={paddingX}
          y1={paddingTop}
          x2={config.width - paddingX}
          y2={paddingTop}
          stroke="#e4e4e7"
          strokeWidth={size === 'lg' ? 4 : 3}
          strokeLinecap="round"
        />

        {/* Fret Horizontal Lines */}
        {Array.from({ length: fretCount }).map((_, idx) => {
          const y = paddingTop + (idx + 1) * fretSpacing;
          return (
            <line
              key={`fret-${idx}`}
              x1={paddingX}
              y1={y}
              x2={config.width - paddingX}
              y2={y}
              stroke="#52525b"
              strokeWidth={1}
            />
          );
        })}

        {/* Vertical Strings (6 to 1, left to right: E A D G B e) */}
        {Array.from({ length: stringCount }).map((_, idx) => {
          const x = paddingX + idx * stringSpacing;
          return (
            <line
              key={`string-${idx}`}
              x1={x}
              y1={paddingTop}
              x2={x}
              y2={paddingTop + innerH}
              stroke="#71717a"
              strokeWidth={idx === 0 || idx === 1 ? 1.8 : 1.2}
            />
          );
        })}

        {/* Fret Markers / Position dots on strings */}
        {chord.frets.map((fretVal, stringIdx) => {
          const x = paddingX + stringIdx * stringSpacing;

          // Open or muted markers above the nut
          if (fretVal === 'x') {
            return (
              <text
                key={`mute-${stringIdx}`}
                x={x}
                y={paddingTop - (size === 'lg' ? 12 : 8)}
                fill="#a1a1aa"
                fontSize={config.fontSize}
                fontWeight="700"
                textAnchor="middle"
              >
                ✕
              </text>
            );
          }
          if (fretVal === 0) {
            return (
              <circle
                key={`open-${stringIdx}`}
                cx={x}
                cy={paddingTop - (size === 'lg' ? 12 : 8)}
                r={size === 'lg' ? 4.5 : 3.5}
                fill="none"
                stroke="#d4d4d8"
                strokeWidth={1.5}
              />
            );
          }

          // Fretted note dot
          if (typeof fretVal === 'number' && fretVal > 0) {
            const y = paddingTop + (fretVal - 0.5) * fretSpacing;
            return (
              <g key={`pressed-${stringIdx}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={config.dotR}
                  fill="#ffffff"
                  className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                />
              </g>
            );
          }
          return null;
        })}

        {/* Finger Numbers below fretboard */}
        {chord.fingers.map((finger, stringIdx) => {
          if (!finger) return null;
          const x = paddingX + stringIdx * stringSpacing;
          const y = paddingTop + innerH + (size === 'lg' ? 20 : 15);
          return (
            <text
              key={`finger-${stringIdx}`}
              x={x}
              y={y}
              fill="#cbd5e1"
              fontSize={config.fontSize}
              fontWeight="600"
              textAnchor="middle"
            >
              {finger}
            </text>
          );
        })}
      </svg>

      {/* Touch prompt hint */}
      {!hideHint && (
        <span className="text-[10px] text-zinc-500 mt-1">点击拨奏和弦</span>
      )}
    </div>
  );
};
