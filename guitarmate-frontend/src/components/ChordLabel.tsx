import React from 'react';
import type { ChordMarker } from '../practiceTypes';

interface ChordLabelProps {
  chords: ChordMarker[];
  /** 当前时间（相对小节起始秒数），用于高亮当前和弦 */
  currentTimeSec?: number;
  isDark?: boolean;
  onChordClick?: (chordName: string) => void;
}

/**
 * 和弦标记层
 *
 * 在六线谱上方以文字形式标注和弦名称，命中当前时间的和弦高亮显示。
 */
export const ChordLabel: React.FC<ChordLabelProps> = ({
  chords,
  currentTimeSec,
  isDark = true,
  onChordClick,
}) => {
  if (!chords || chords.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
      {chords.map((c) => {
        const isActive =
          typeof currentTimeSec === 'number' &&
          currentTimeSec >= c.startTime &&
          currentTimeSec < c.startTime + Math.max(c.duration, 0.2);

        return (
          <div
            key={c.id}
            onClick={
              onChordClick
                ? (e) => {
                    e.stopPropagation();
                    onChordClick(c.chordName);
                  }
                : undefined
            }
            style={{
              position: 'absolute',
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              transform: 'translate(-50%, -100%)',
              fontSize: '13px',
              fontWeight: 800,
              fontFamily: 'ui-monospace, monospace',
              color: isActive ? '#052e16' : '#10b981',
              background: isActive ? '#34d399' : isDark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.92)',
              border: `1px solid ${isActive ? '#6ee7b7' : 'rgba(16,185,129,0.45)'}`,
              borderRadius: '5px',
              padding: '1px 6px',
              whiteSpace: 'nowrap',
              cursor: onChordClick ? 'pointer' : 'default',
              pointerEvents: onChordClick ? 'auto' : 'none',
              transition: 'all 0.1s linear',
              boxShadow: isActive ? '0 0 12px rgba(52,211,153,0.7)' : 'none',
            }}
          >
            {c.chordName}
          </div>
        );
      })}
    </div>
  );
};

export default ChordLabel;
