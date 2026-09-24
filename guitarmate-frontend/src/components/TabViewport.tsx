import React, { useMemo } from 'react';
import type { Measure, Note } from '../practiceTypes';
import { NoteLayer } from './NoteLayer';
import { BarreLayer } from './BarreLayer';
import { ChordLabel } from './ChordLabel';
import { TAB_STRING_NAMES } from '../utils/tabGenerator';


interface TabViewportProps {
  measure: Measure;
  /** trackData 下标（多分轨时选择当前练习轨） */
  trackIndex?: number;
  activeNoteId: string | null;
  /** 当前播放时间（相对小节起始秒数） */
  currentTimeSec: number;
  /** 当前播放进度 0-100（驱动谱内进度条与游标） */
  progressPercent?: number;
  isDark?: boolean;
  isPlaying?: boolean;
  /** 视口高度 (px)——仅当使用后端谱面切片图 (tabImageUrl) 时生效 */
  height?: number;
  /** 横向滚动量 (px)——仅谱面切片图模式使用 */
  scrollX?: number;
  /** 固定播放竖条位置比例——仅谱面切片图模式使用 */
  playheadRatio?: number;
  onNoteClick?: (note: Note) => void;
  onChordClick?: (chordName: string) => void;
  /** 点击谱面任意位置跳转（传入 0-100 的百分比） */
  onSeek?: (progressPercent: number) => void;
}

// ─────────────────────────────────────────────────────────────
// 版式常量：与下方歌词区 GuitarTabStaff 完全一致，保证视觉统一
// ─────────────────────────────────────────────────────────────
const SVG_WIDTH = 600;
const SVG_HEIGHT = 142;
const TAB_LEFT_X = 42;
const TAB_RIGHT_X = 585;
const USABLE_WIDTH = TAB_RIGHT_X - TAB_LEFT_X;
const STAFF_TOP_Y = 32;
const LINE_SPACING = 13;
const PROGRESS_Y = 132;

const STRING_Y: Record<number, number> = {
  1: STAFF_TOP_Y,
  2: STAFF_TOP_Y + LINE_SPACING,
  3: STAFF_TOP_Y + LINE_SPACING * 2,
  4: STAFF_TOP_Y + LINE_SPACING * 3,
  5: STAFF_TOP_Y + LINE_SPACING * 4,
  6: STAFF_TOP_Y + LINE_SPACING * 5,
};

const toX = (pct: number) => TAB_LEFT_X + (Math.max(0, Math.min(100, pct)) / 100) * USABLE_WIDTH;

/**
 * 六线谱练习视口
 *
 * 两种渲染模式：
 * 1. **矢量紧凑模式（默认）**：与歌词区 `GuitarTabStaff` 同款版式
 *    (600×142 视图框、弦距 13px)，整个小节完整可见，
 *    谱内自带进度条与游标，节点/横按/和弦标注直接绘制在谱面上。
 * 2. **谱面切片图模式**：后端发布了 `tabImageUrl` 时，渲染图片并叠加
 *    DOM 图层 + 固定播放竖条（视口 1/3 处）+ 横向滚动。
 */
export const TabViewport: React.FC<TabViewportProps> = ({
  measure,
  trackIndex = 0,
  activeNoteId,
  currentTimeSec,
  progressPercent,
  isDark = true,
  isPlaying = false,
  height = 190,
  scrollX = 0,
  playheadRatio = 1 / 3,
  onNoteClick,
  onChordClick,
  onSeek,
}) => {
  const track = measure.trackData?.[trackIndex] || measure.trackData?.[0];
  const notes = track?.notes || [];

  /** 进度百分比：优先使用外部传入值，否则按小节时长换算 */
  const pct = useMemo(() => {
    if (typeof progressPercent === 'number') {
      return Math.max(0, Math.min(100, progressPercent));
    }
    if (measure.duration > 0) {
      return Math.max(0, Math.min(100, (currentTimeSec / measure.duration) * 100));
    }
    return 0;
  }, [progressPercent, currentTimeSec, measure.duration]);

  const playheadX = toX(pct);

  /** 和弦标注（按 x 归一化位置，去除过近的重复标注） */
  const chordAnnotations = useMemo(() => {
    const list: Array<{ id: string; chord: string; x: number; startTime: number }> = [];
    (measure.chords || []).forEach((c) => {
      const x = toX(c.x * 100);
      if (!list.some((i) => Math.abs(i.x - x) < 26)) {
        list.push({ id: c.id, chord: c.chordName, x, startTime: c.startTime });
      }
    });
    return list;
  }, [measure.chords]);

  const currentChord = useMemo(() => {
    const hit = (measure.chords || []).find(
      (c) => currentTimeSec >= c.startTime && currentTimeSec < c.startTime + Math.max(c.duration, 0.2),
    );
    return hit?.chordName;
  }, [measure.chords, currentTimeSec]);

  /** 小节内拍线位置（按拍号切分） */
  const beatsPerBar = useMemo(() => {
    const n = parseInt((measure.timeSignature || '4/4').split('/')[0], 10);
    return Number.isFinite(n) && n > 1 ? n : 4;
  }, [measure.timeSignature]);

  const stringLineColor = isDark ? '#3f3f46' : '#cbd5e1';
  const staffBottomY = STRING_Y[6];

  // ─────────────────────────────────────────────────────────
  // 模式 1：谱面切片图 + 横向滚动 + 固定播放竖条
  // ─────────────────────────────────────────────────────────
  if (track?.tabImageUrl) {
    const contentWidth = Math.max(track.imageWidth || 1200, 600);
    const contentHeight = Math.max(track.imageHeight || height, 140);

    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl border ${
          isDark ? 'bg-[#0b0d11] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
        style={{ height }}
      >
        <div
          style={{
            transform: `translateX(${-scrollX}px)`,
            transition: isPlaying ? 'none' : 'transform 0.1s linear',
            position: 'relative',
            width: `${contentWidth}px`,
            height: `${contentHeight}px`,
          }}
        >
          <img
            src={track.tabImageUrl}
            alt={measure.label}
            draggable={false}
            style={{ width: `${contentWidth}px`, height: 'auto', display: 'block', userSelect: 'none' }}
          />

          <BarreLayer barres={measure.barres} currentTimeSec={currentTimeSec} />
          <NoteLayer notes={notes} activeNoteId={activeNoteId} onNoteClick={onNoteClick} showAllNodes />
          <ChordLabel
            chords={measure.chords}
            currentTimeSec={currentTimeSec}
            isDark={isDark}
            onChordClick={onChordClick}
          />
        </div>

        {/* 固定播放竖条 (33.33% 位置) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] pointer-events-none"
          style={{
            left: `${playheadRatio * 100}%`,
            background: '#ff4444',
            zIndex: 30,
            boxShadow: '0 0 10px rgba(255,68,68,0.9)',
          }}
        >
          <div
            className="absolute -top-0.5 -translate-x-1/2 w-3 h-3 rounded-full"
            style={{ left: '50%', background: '#ff4444' }}
          />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // 模式 2：矢量紧凑六线谱（与 GuitarTabStaff 同款版式）
  // ─────────────────────────────────────────────────────────
  const handleStaffClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgClickX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    if (svgClickX < TAB_LEFT_X || svgClickX > TAB_RIGHT_X) return;
    onSeek(Math.max(0, Math.min(100, ((svgClickX - TAB_LEFT_X) / USABLE_WIDTH) * 100)));
  };

  return (
    <div className="relative w-full overflow-hidden select-none py-0.5">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className={`w-full h-auto block ${onSeek ? 'cursor-pointer' : ''}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleStaffClick}
      >
        <defs>
          <filter id="tabViewportGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="tabViewportSweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        {/* 已播放区域底色横扫 */}
        {playheadX > TAB_LEFT_X && (
          <rect
            x={TAB_LEFT_X}
            y={STAFF_TOP_Y - 4}
            width={Math.min(USABLE_WIDTH, playheadX - TAB_LEFT_X)}
            height={staffBottomY - STAFF_TOP_Y + 8}
            rx="4"
            fill="url(#tabViewportSweep)"
          />
        )}

        {/* 小节内拍线 */}
        {Array.from({ length: beatsPerBar - 1 }).map((_, i) => {
          const barX = TAB_LEFT_X + ((i + 1) / beatsPerBar) * USABLE_WIDTH;
          return (
            <line
              key={`beat-${i}`}
              x1={barX}
              y1={STAFF_TOP_Y}
              x2={barX}
              y2={staffBottomY}
              stroke={isDark ? '#3f3f46' : '#cbd5e1'}
              strokeWidth={1}
            />
          );
        })}

        {/* 六根弦线 */}
        {[1, 2, 3, 4, 5, 6].map((strNum) => {
          const y = STRING_Y[strNum];
          const isVibrating =
            isPlaying &&
            notes.some(
              (n) => n.string === strNum && Math.abs(toX(n.x * 100) - playheadX) < 18,
            );
          return (
            <line
              key={`string-${strNum}`}
              x1={TAB_LEFT_X}
              y1={y}
              x2={TAB_RIGHT_X}
              y2={y}
              stroke={isVibrating ? '#34d399' : stringLineColor}
              strokeWidth={strNum === 6 ? 1.4 : strNum === 1 ? 0.9 : 1.1}
              strokeOpacity={0.85}
            />
          );
        })}

        {/* 左侧 TAB 谱号与弦名 */}
        <g className="select-none">
          {['T', 'A', 'B'].map((ch, i) => (
            <text
              key={ch}
              x="14"
              y={STAFF_TOP_Y + 14 + i * 19}
              fill={isDark ? '#a1a1aa' : '#64748b'}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="800"
            >
              {ch}
            </text>
          ))}
          {[1, 2, 3, 4, 5, 6].map((strNum) => (
            <text
              key={`str-name-${strNum}`}
              x="30"
              y={STRING_Y[strNum] + 3}
              fill={isDark ? '#71717a' : '#94a3b8'}
              fontSize="7.5"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {TAB_STRING_NAMES[strNum]}
            </text>
          ))}
        </g>

        {/* 横按标记 */}
        {(measure.barres || []).map((b) => {
          const x = toX(b.x * 100);
          const yTop = STRING_Y[Math.min(b.fromString, b.toString)] ?? STAFF_TOP_Y;
          const yBottom = STRING_Y[Math.max(b.fromString, b.toString)] ?? staffBottomY;
          const isActive =
            currentTimeSec >= b.startTime &&
            currentTimeSec < b.startTime + Math.max(b.duration, 0.1);
          return (
            <g key={b.id}>
              <line
                x1={x}
                y1={yTop}
                x2={x}
                y2={yBottom}
                stroke={isActive ? '#f87171' : 'rgba(239,68,68,0.7)'}
                strokeWidth={5}
                strokeLinecap="round"
              />
              <text
                x={x + 7}
                y={yTop - 3}
                fill="#f87171"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="700"
              >
                {b.fret}
              </text>
            </g>
          );
        })}

        {/* 和弦标注（谱面上方） */}
        {chordAnnotations.map((c, idx) => {
          const isCurrent = currentChord === c.chord;
          return (
            <g
              key={`chord-${c.id}-${idx}`}
              className={onChordClick ? 'cursor-pointer' : ''}
              onClick={
                onChordClick
                  ? (e) => {
                      e.stopPropagation();
                      onChordClick(c.chord);
                    }
                  : undefined
              }
            >
              <rect
                x={c.x - 14}
                y={STAFF_TOP_Y - 24}
                width="28"
                height="15"
                rx="4"
                fill={isCurrent ? '#10b981' : isDark ? '#27272a' : '#f1f5f9'}
                stroke={isCurrent ? '#34d399' : isDark ? '#3f3f46' : '#cbd5e1'}
                strokeWidth="1"
              />
              <text
                x={c.x}
                y={STAFF_TOP_Y - 13}
                fill={isCurrent ? '#000000' : '#10b981'}
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

        {/* 音符（品位数字） */}
        {notes.map((n) => {
          const nx = toX(n.x * 100);
          const ny = STRING_Y[n.string];
          if (!ny) return null;

          const isHit = isPlaying && Math.abs(nx - playheadX) < 12;
          const isActiveNote = activeNoteId === n.id;
          const isPast = nx < playheadX - 12;
          const fretStr = String(n.fret);
          const isWide = fretStr.length > 2;
          const bgWidth = isWide ? 22 : 14;
          const highlight = isHit || isActiveNote;

          return (
            <g
              key={n.id}
              className={onNoteClick ? 'cursor-pointer group' : 'group'}
              onClick={
                onNoteClick
                  ? (e) => {
                      e.stopPropagation();
                      onNoteClick(n);
                    }
                  : undefined
              }
            >
              {/* 命中光环 */}
              {isHit && (
                <circle cx={nx} cy={ny} r="12" fill="#34d399" fillOpacity="0.35" className="animate-ping" />
              )}

              {/* 遮挡底衬，避免弦线穿过数字 */}
              <rect
                x={nx - bgWidth / 2}
                y={ny - 6}
                width={bgWidth}
                height="12"
                rx="2"
                fill={highlight ? '#10b981' : isDark ? '#18181b' : '#ffffff'}
                stroke={
                  highlight ? '#ffffff' : isPast ? '#059669' : isDark ? '#3f3f46' : '#94a3b8'
                }
                strokeWidth={highlight ? 1.5 : 0.8}
              />

              {/* 品位数字 */}
              <text
                x={nx}
                y={ny + 3.5}
                fill={highlight ? '#000000' : isDark ? '#fafafa' : '#0f172a'}
                fontSize={isWide ? '8' : '9'}
                fontFamily="system-ui, monospace"
                fontWeight="700"
                textAnchor="middle"
              >
                {fretStr}
              </text>
            </g>
          );
        })}

        {/* 谱内进度条 */}
        <g>
          <line
            x1={TAB_LEFT_X}
            y1={PROGRESS_Y}
            x2={TAB_RIGHT_X}
            y2={PROGRESS_Y}
            stroke={isDark ? '#27272a' : '#e2e8f0'}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {playheadX > TAB_LEFT_X && (
            <line
              x1={TAB_LEFT_X}
              y1={PROGRESS_Y}
              x2={playheadX}
              y2={PROGRESS_Y}
              stroke="#34d399"
              strokeWidth="3"
              strokeLinecap="round"
              filter="url(#tabViewportGlow)"
            />
          )}
          <circle
            cx={playheadX}
            cy={PROGRESS_Y}
            r={isPlaying ? 4.5 : 3.5}
            fill="#6ee7b7"
            stroke={isDark ? '#09090b' : '#ffffff'}
            strokeWidth="1.5"
          />
        </g>

        {/* 谱内游标竖线 */}
        <g>
          <line
            x1={playheadX}
            y1={STAFF_TOP_Y - 8}
            x2={playheadX}
            y2={PROGRESS_Y}
            stroke="#34d399"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#tabViewportGlow)"
          />
          <polygon
            points={`${playheadX},${STAFF_TOP_Y - 6} ${playheadX - 4.5},${STAFF_TOP_Y - 13} ${playheadX + 4.5},${STAFF_TOP_Y - 13}`}
            fill="#6ee7b7"
          />
        </g>
      </svg>
    </div>
  );
};

export default TabViewport;
