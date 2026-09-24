import React from 'react';

/**
 * 归一化坐标的节点标记 (x / y 均为 0-1)
 */
export interface NoteOverlayMarker {
  id: string;
  /** 归一化横坐标 (0-1) */
  x: number;
  /** 归一化纵坐标 (0-1) */
  y: number;
  /** 转录置信度 (0-1) */
  confidence: number;
  fret?: number | string;
  stringIndex?: number;
}

interface NoteOverlayProps {
  markers: NoteOverlayMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 是否显示低置信度图例 */
  showLegend?: boolean;
  /** 只显示置信度低于该阈值的节点 (undefined = 全部显示) */
  onlyBelowConfidence?: number;
  className?: string;
}

export const CONFIDENCE_COLORS = {
  high: '#52c41a', // >= 0.8
  medium: '#faad14', // >= 0.6
  low: '#ff4d4f', // < 0.6
} as const;

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return CONFIDENCE_COLORS.high;
  if (confidence >= 0.6) return CONFIDENCE_COLORS.medium;
  return CONFIDENCE_COLORS.low;
};

/**
 * 节点标注叠加层
 *
 * 绝对定位覆盖在六线谱 (TabRenderer / StandardTabStaff) 之上，
 * 按 confidence 着色：>=0.8 绿色 / >=0.6 黄色 / <0.6 红色。
 * 默认 pointer-events: none，仅节点自身可点击，不干扰下层谱面的交互。
 */
export const NoteOverlay: React.FC<NoteOverlayProps> = ({
  markers,
  selectedId,
  onSelect,
  showLegend = false,
  onlyBelowConfidence,
  className = '',
}) => {
  const visible =
    typeof onlyBelowConfidence === 'number'
      ? markers.filter((m) => m.confidence < onlyBelowConfidence)
      : markers;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-20 ${className}`}
      aria-hidden={!onSelect}
    >
      {visible.map((m) => {
        const color = getConfidenceColor(m.confidence);
        const isSelected = selectedId === m.id;
        const size = isSelected ? 16 : 10;

        return (
          <div
            key={m.id}
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation();
                    onSelect(m.id);
                  }
                : undefined
            }
            title={`${m.stringIndex ?? '?'}弦 ${m.fret ?? '?'}品 · 置信度 ${(m.confidence * 100).toFixed(0)}%`}
            style={{
              position: 'absolute',
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              border: isSelected ? '2px solid #fff' : '1px solid rgba(0,0,0,0.35)',
              transform: 'translate(-50%, -50%)',
              cursor: onSelect ? 'pointer' : 'default',
              pointerEvents: onSelect ? 'auto' : 'none',
              transition: 'all 0.15s',
              boxShadow: isSelected ? `0 0 10px ${color}` : 'none',
              opacity: isSelected ? 1 : 0.9,
            }}
          />
        );
      })}

      {showLegend && (
        <div
          className="absolute bottom-1 right-1 flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900/85 border border-slate-700 text-[10px] font-mono pointer-events-none"
          style={{ pointerEvents: 'none' }}
        >
          <span className="flex items-center gap-1 text-slate-300">
            <i
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: CONFIDENCE_COLORS.high }}
            />
            ≥0.8
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <i
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: CONFIDENCE_COLORS.medium }}
            />
            ≥0.6
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <i
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: CONFIDENCE_COLORS.low }}
            />
            &lt;0.6 待复核
          </span>
        </div>
      )}
    </div>
  );
};

export default NoteOverlay;
