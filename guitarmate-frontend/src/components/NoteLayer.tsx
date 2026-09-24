import React from 'react';
import type { Note } from '../practiceTypes';

interface NoteLayerProps {
  notes: Note[];
  activeNoteId: string | null;
  /** 高亮颜色 (跟随主题/独奏段落) */
  highlightColor?: string;
  /** 是否显示全部节点轮廓（便于跟谱） */
  showAllNodes?: boolean;
  onNoteClick?: (note: Note) => void;
}

/**
 * 节点高亮层
 *
 * 绝对定位覆盖在六线谱底图之上，当前播放音符以高亮圆点标记，
 * 其余音符可选展示淡色轮廓，点击节点可 Seek 到该音符（双向联动）。
 */
export const NoteLayer: React.FC<NoteLayerProps> = ({
  notes,
  activeNoteId,
  highlightColor = '#ff4444',
  showAllNodes = true,
  onNoteClick,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
      {notes.map((n) => {
        const isActive = activeNoteId === n.id;
        if (!isActive && !showAllNodes) return null;

        return (
          <div
            key={n.id}
            onClick={
              onNoteClick
                ? (e) => {
                    e.stopPropagation();
                    onNoteClick(n);
                  }
                : undefined
            }
            title={`${n.string}弦 ${n.fret}品 · ${n.relativeTime.toFixed(2)}s`}
            style={{
              position: 'absolute',
              left: `${n.x * 100}%`,
              top: `${n.y * 100}%`,
              width: isActive ? '16px' : '10px',
              height: isActive ? '16px' : '10px',
              borderRadius: '50%',
              background: isActive ? highlightColor : 'rgba(52,211,153,0.28)',
              border: isActive ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.35)',
              boxShadow: isActive
                ? `0 0 14px ${highlightColor}, 0 0 4px ${highlightColor}`
                : 'none',
              transform: 'translate(-50%, -50%)',
              transition: 'all 0.08s linear',
              cursor: onNoteClick ? 'pointer' : 'default',
              pointerEvents: onNoteClick ? 'auto' : 'none',
            }}
          />
        );
      })}
    </div>
  );
};

export default NoteLayer;
