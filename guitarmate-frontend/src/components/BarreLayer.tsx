import React from 'react';
import type { Barre } from '../practiceTypes';

interface BarreLayerProps {
  barres: Barre[];
  /** 当前播放时间（相对小节起始秒数），用于高亮正在进行的横按 */
  currentTimeSec?: number;
  color?: string;
}

/**
 * 横按层
 *
 * 以竖直粗线标记横按位置（x/y 为归一化坐标，fromString~toString 决定高度）。
 */
export const BarreLayer: React.FC<BarreLayerProps> = ({
  barres,
  currentTimeSec,
  color = 'rgba(255,68,68,0.6)',
}) => {
  if (!barres || barres.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
      {barres.map((b) => {
        const isActive =
          typeof currentTimeSec === 'number' &&
          currentTimeSec >= b.startTime &&
          currentTimeSec < b.startTime + Math.max(b.duration, 0.1);

        const topPercent = ((b.fromString - 1) / 5) * 100;
        const heightPercent = (Math.abs(b.toString - b.fromString) / 5) * 100;

        return (
          <div
            key={b.id}
            title={`横按 ${b.fret}品 · ${b.fromString}~${b.toString}弦`}
            style={{
              position: 'absolute',
              left: `${b.x * 100}%`,
              top: `${Math.max(topPercent, b.y * 100)}%`,
              width: '4px',
              height: `${Math.max(heightPercent, 8)}%`,
              background: isActive ? '#f87171' : color,
              borderRadius: '2px',
              transform: 'translate(-50%, -50%)',
              boxShadow: isActive ? '0 0 10px rgba(248,113,113,0.9)' : 'none',
              transition: 'background 0.1s linear',
            }}
          />
        );
      })}
    </div>
  );
};

export default BarreLayer;
