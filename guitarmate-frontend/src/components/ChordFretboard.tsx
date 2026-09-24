import React, { useRef } from 'react';
import { ChordPosition, FINGER_COLORS } from '../data/chordLibraryData';

interface ChordFretboardProps {
  position: ChordPosition;
  chordName: string;
  onPlayString?: (stringIdx: number, fret: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export const ChordFretboard: React.FC<ChordFretboardProps> = ({
  position,
  chordName,
  onPlayString,
  onSwipeLeft,
  onSwipeRight,
}) => {
  const { frets, fingers, barres, baseFret } = position;
  const touchStartX = useRef<number | null>(null);

  // Layout measurements (SVG ViewBox 0 0 260 330)
  const svgWidth = 260;
  const svgHeight = 330;

  const topMarkerY = 30; // 'o' and 'x' row
  const boardTopY = 52;  // top of fretboard / nut
  const boardBottomY = 310;
  const boardLeftX = 64;
  const boardRightX = 224;

  const stringWidth = (boardRightX - boardLeftX) / 5; // 32px between strings
  const stringPositions = [0, 1, 2, 3, 4, 5].map((i) => boardLeftX + i * stringWidth);

  const numFrets = 4;
  const fretHeight = (boardBottomY - boardTopY) / numFrets; // 64.5px per fret space
  const fretLineY = [0, 1, 2, 3, 4].map((f) => boardTopY + f * fretHeight);

  // Touch gesture handling for smooth swiping between positions
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    if (diffX > 40 && onSwipeRight) {
      onSwipeRight();
    } else if (diffX < -40 && onSwipeLeft) {
      onSwipeLeft();
    }
    touchStartX.current = null;
  };

  // Convert fret number to pixel Y center in fret slot
  const getFretCenterY = (fret: number) => {
    const slotIdx = fret - baseFret; // 0, 1, 2, 3
    if (slotIdx < 0 || slotIdx >= numFrets) return null;
    return boardTopY + slotIdx * fretHeight + fretHeight / 2;
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none py-2"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-[260px] h-[330px] drop-shadow-2xl overflow-visible"
      >
        {/* Fretboard Wooden / Slate Body Background */}
        <rect
          x={boardLeftX - 12}
          y={boardTopY}
          width={boardRightX - boardLeftX + 24}
          height={boardBottomY - boardTopY}
          rx="12"
          fill="#232730"
          stroke="#323742"
          strokeWidth="1.5"
        />

        {/* Fret Numbers on the left margin (aligned with each fret space) */}
        {[0, 1, 2, 3].map((slotIdx) => {
          const fretNum = baseFret + slotIdx;
          const y = boardTopY + slotIdx * fretHeight + fretHeight / 2 + 5;
          return (
            <text
              key={`fret-num-${slotIdx}`}
              x={boardLeftX - 26}
              y={y}
              fill="#94a3b8"
              fontSize="14"
              fontWeight="600"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
            >
              {fretNum}
            </text>
          );
        })}

        {/* Fret Wire Lines */}
        {fretLineY.map((y, idx) => {
          // If baseFret === 1, top line is the nut (handled separately)
          if (idx === 0 && baseFret === 1) return null;
          return (
            <line
              key={`fret-line-${idx}`}
              x1={boardLeftX - 8}
              y1={y}
              x2={boardRightX + 8}
              y2={y}
              stroke={idx === 0 ? '#64748b' : '#3d4452'}
              strokeWidth={idx === 0 ? 2.5 : 2}
            />
          );
        })}

        {/* Thick White Bone Nut (when baseFret === 1, open position) */}
        {baseFret === 1 && (
          <rect
            x={boardLeftX - 8}
            y={boardTopY - 4}
            width={boardRightX - boardLeftX + 16}
            height="8"
            rx="4"
            fill="#f8fafc"
            className="drop-shadow-sm"
          />
        )}

        {/* Vertical Strings (Strings 6 down to 1) */}
        {stringPositions.map((x, strIdx) => {
          // strIdx 0 is string 6 (Low E), strIdx 5 is string 1 (High E)
          const isMuted = frets[strIdx] === -1;
          const strokeWidth = 3.2 - strIdx * 0.4; // 3.2px (6th) down to 1.2px (1st)
          
          return (
            <g key={`string-${strIdx}`}>
              {/* String line */}
              <line
                x1={x}
                y1={boardTopY}
                x2={x}
                y2={boardBottomY}
                stroke={isMuted ? '#ef4444' : '#94a3b8'}
                strokeWidth={strokeWidth}
                strokeOpacity={isMuted ? 0.75 : 0.85}
              />

              {/* Clickable transparent hit area for plucking single string */}
              <rect
                x={x - 14}
                y={boardTopY}
                width={28}
                height={boardBottomY - boardTopY}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onPlayString && onPlayString(strIdx, frets[strIdx])}
              />
            </g>
          );
        })}

        {/* Open (o) / Muted (x) Markers Above Fretboard */}
        {frets.map((fret, strIdx) => {
          const x = stringPositions[strIdx];
          if (fret === -1) {
            // Muted 'x'
            return (
              <text
                key={`top-marker-${strIdx}`}
                x={x}
                y={topMarkerY}
                fill="#cbd5e1"
                fontSize="15"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
                textAnchor="middle"
              >
                x
              </text>
            );
          } else if (fret === 0) {
            // Open 'o'
            return (
              <text
                key={`top-marker-${strIdx}`}
                x={x}
                y={topMarkerY}
                fill="#f8fafc"
                fontSize="16"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                textAnchor="middle"
              >
                o
              </text>
            );
          }
          return null;
        })}

        {/* Barres (大横按长胶囊) */}
        {barres &&
          barres.map((barre, bIdx) => {
            const centerY = getFretCenterY(barre.fret);
            if (centerY === null) return null;

            // fromString (e.g. 5) -> strIdx = 6 - 5 = 1
            // toString (e.g. 1) -> strIdx = 6 - 1 = 5
            const fromIdx = 6 - barre.fromString;
            const toIdx = 6 - barre.toString;
            const startX = stringPositions[fromIdx] - 10;
            const endX = stringPositions[toIdx] + 10;
            const width = endX - startX;
            const color = FINGER_COLORS[barre.finger]?.bg || '#f59e0b';

            return (
              <g key={`barre-${bIdx}`}>
                <rect
                  x={startX}
                  y={centerY - 10}
                  width={width}
                  height="20"
                  rx="10"
                  fill={color}
                  className="drop-shadow-md"
                />
              </g>
            );
          })}

        {/* Fretted Dots (圆点指位) */}
        {frets.map((fret, strIdx) => {
          if (fret <= 0) return null;

          const centerY = getFretCenterY(fret);
          if (centerY === null) return null;

          const cx = stringPositions[strIdx];
          const finger = fingers[strIdx] || 1;
          const fingerConfig = FINGER_COLORS[finger] || FINGER_COLORS[1];

          // Check if this dot is covered under an identical barre
          const isCoveredByBarre = barres?.some(
            (b) =>
              b.fret === fret &&
              b.finger === finger &&
              strIdx >= 6 - b.fromString &&
              strIdx <= 6 - b.toString
          );

          if (isCoveredByBarre) return null;

          return (
            <g
              key={`dot-${strIdx}`}
              className="cursor-pointer transition-transform hover:scale-110"
              onClick={() => onPlayString && onPlayString(strIdx, fret)}
            >
              {/* Outer soft glow */}
              <circle
                cx={cx}
                cy={centerY}
                r="14"
                fill={fingerConfig.bg}
                fillOpacity="0.3"
              />
              {/* Main vibrant dot */}
              <circle
                cx={cx}
                cy={centerY}
                r="11.5"
                fill={fingerConfig.bg}
                stroke="#18181b"
                strokeWidth="1.5"
                className="drop-shadow-md"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
