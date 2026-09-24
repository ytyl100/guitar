import React, { useEffect, useMemo, useRef } from 'react';

export interface TabRendererNote {
  id: string;
  /** 1-6 (1=最细高音弦，绘制在最上方) */
  string: number;
  fret: number | string;
  /** 相对小节起始的秒数 */
  relativeTime: number;
  duration: number;
}

export interface TabRendererProps {
  notes: TabRendererNote[];
  /** 小节时长 (秒)，用于把 relativeTime 映射到横向像素 */
  measureDuration: number;
  bpm: number;
  timeSignature?: string;
  /** 和弦标记 (绘制在谱面上方) */
  chordMarkers?: Array<{ id: string; chordName: string; startTime: number }>;
  /** 横按标记 (绘制为竖直粗线) */
  barres?: Array<{ id: string; fret: number; fromString: number; toString: number; startTime: number; duration: number }>;
  width?: number;
  height?: number;
  isDark?: boolean;
  /** 渲染完成后回调每个音符的归一化坐标 (x/width, y/height) */
  onNoteRendered?: (noteId: string, x: number, y: number) => void;
}

/**
 * 六线谱渲染器 (轻量 SVG 实现，无外部依赖)
 *
 * 输入带相对时间的音符列表，输出标准吉他六线谱 SVG，
 * 并通过 onNoteRendered 回传每个音符的归一化坐标 (0-1)，
 * 供 NoteOverlay 叠加置信度标注层使用。
 */
export const TabRenderer: React.FC<TabRendererProps> = ({
  notes,
  measureDuration,
  bpm,
  timeSignature = '4/4',
  chordMarkers = [],
  barres = [],
  width = 1200,
  height = 220,
  isDark = true,
  onNoteRendered,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(() => {
    const padLeft = 54;
    const padRight = 24;
    const staffTopY = 62;
    const lineSpacing = 22;
    const usableWidth = width - padLeft - padRight;

    const stringY: Record<number, number> = {
      1: staffTopY,
      2: staffTopY + lineSpacing,
      3: staffTopY + lineSpacing * 2,
      4: staffTopY + lineSpacing * 3,
      5: staffTopY + lineSpacing * 4,
      6: staffTopY + lineSpacing * 5,
    };

    const timeToX = (t: number) => {
      if (!measureDuration || measureDuration <= 0) return padLeft;
      const ratio = Math.max(0, Math.min(1, t / measureDuration));
      return padLeft + ratio * usableWidth;
    };

    return { padLeft, padRight, staffTopY, lineSpacing, usableWidth, stringY, timeToX };
  }, [width, measureDuration]);

  // 渲染完成后回传归一化坐标
  useEffect(() => {
    if (!onNoteRendered) return;
    notes.forEach((n) => {
      const x = layout.timeToX(n.relativeTime) / width;
      const y = (layout.stringY[n.string] ?? layout.staffTopY) / height;
      onNoteRendered(n.id, x, y);
    });
  }, [notes, layout, width, height, onNoteRendered]);

  const stringLineColor = isDark ? '#3f3f46' : '#cbd5e1';
  const staffBottom = layout.stringY[6];
  const [beatsPerBar] = timeSignature.split('/').map((v) => parseInt(v, 10));

  const chordColor = '#f59e0b';

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto block select-none"
      >
        {/* 谱号 TAB */}
        <text
          x="16"
          y={layout.staffTopY + 22}
          fill={isDark ? '#71717a' : '#94a3b8'}
          fontSize="16"
          fontFamily="monospace"
          fontWeight="800"
        >
          TAB
        </text>

        {/* 6 根弦线 */}
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <line
            key={`s-${s}`}
            x1={layout.padLeft}
            y1={layout.stringY[s]}
            x2={width - layout.padRight}
            y2={layout.stringY[s]}
            stroke={stringLineColor}
            strokeWidth={s === 6 ? 1.6 : s === 1 ? 1 : 1.2}
          />
        ))}

        {/* 小节内拍线 */}
        {beatsPerBar > 1 &&
          Array.from({ length: beatsPerBar - 1 }).map((_, i) => {
            const beatTime = (measureDuration / beatsPerBar) * (i + 1);
            const x = layout.timeToX(beatTime);
            return (
              <line
                key={`beat-${i}`}
                x1={x}
                y1={layout.staffTopY}
                x2={x}
                y2={staffBottom}
                stroke={isDark ? '#27272a' : '#e2e8f0'}
                strokeWidth={1}
              />
            );
          })}

        {/* 起始 / 结束小节线 */}
        <line
          x1={layout.padLeft}
          y1={layout.staffTopY}
          x2={layout.padLeft}
          y2={staffBottom}
          stroke={isDark ? '#52525b' : '#94a3b8'}
          strokeWidth={2}
        />
        <line
          x1={width - layout.padRight}
          y1={layout.staffTopY}
          x2={width - layout.padRight}
          y2={staffBottom}
          stroke={isDark ? '#52525b' : '#94a3b8'}
          strokeWidth={2}
        />

        {/* 横按标记 (竖直粗线) */}
        {barres.map((b) => {
          const x = layout.timeToX(b.startTime);
          const yTop = layout.stringY[Math.min(b.fromString, b.toString)] ?? layout.staffTopY;
          const yBottom = layout.stringY[Math.max(b.fromString, b.toString)] ?? staffBottom;
          const lineWidth = Math.max(
            12,
            (layout.timeToX(b.startTime + b.duration) - x) || 0,
          );
          return (
            <g key={b.id}>
              <line
                x1={x}
                y1={yTop}
                x2={x}
                y2={yBottom}
                stroke="rgba(239,68,68,0.85)"
                strokeWidth={5}
                strokeLinecap="round"
              />
              <text
                x={x + 8}
                y={yTop - 4}
                fill="#f87171"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="700"
              >
                {b.fret}
              </text>
              {lineWidth > 0 && <rect x={x} y={yTop} width={lineWidth} height={1} fill="#ef4444" opacity={0.5} />}
            </g>
          );
        })}

        {/* 和弦标记 */}
        {chordMarkers.map((c) => {
          const x = layout.timeToX(c.startTime);
          return (
            <g key={c.id}>
              <rect
                x={x - 15}
                y={layout.staffTopY - 40}
                width="30"
                height="17"
                rx="4"
                fill={isDark ? '#27272a' : '#f1f5f9'}
                stroke={chordColor}
                strokeWidth="1"
              />
              <text
                x={x}
                y={layout.staffTopY - 28}
                fill={chordColor}
                fontSize="11"
                fontFamily="monospace"
                fontWeight="800"
                textAnchor="middle"
              >
                {c.chordName}
              </text>
            </g>
          );
        })}

        {/* 音符 (品位数字) */}
        {notes.map((n) => {
          const x = layout.timeToX(n.relativeTime);
          const y = layout.stringY[n.string];
          if (!y) return null;
          const fretStr = String(n.fret);
          const boxW = fretStr.length > 2 ? 26 : 17;

          return (
            <g key={n.id}>
              <rect
                x={x - boxW / 2}
                y={y - 8}
                width={boxW}
                height="16"
                rx="3"
                fill={isDark ? '#18181b' : '#ffffff'}
                stroke={isDark ? '#52525b' : '#94a3b8'}
                strokeWidth="1"
              />
              <text
                x={x}
                y={y + 4}
                fill={isDark ? '#fafafa' : '#0f172a'}
                fontSize={fretStr.length > 2 ? '10' : '12'}
                fontFamily="monospace"
                fontWeight="700"
                textAnchor="middle"
              >
                {fretStr}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default TabRenderer;
