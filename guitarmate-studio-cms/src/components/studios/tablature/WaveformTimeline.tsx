import React, { useCallback, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

/**
 * 波形时间轴（WaveformTimeline）
 * ==============================
 *
 * 从「音频与六线谱对齐」工作台里**抽出来的可复用组件**：128 点能量波形 +
 * 关键点标记（小节线，可拖拽微调）+ A-B 循环区间 + 60 FPS 播放头 + 点击定位。
 *
 * 为什么抽出来？
 * - 「音频与六线谱对齐」与「六线谱校正工作台」都需要「看波形、点位置、看播放头」这三件事，
 *   复制一份就会像 `standardTabLayout.ts` 那样出现**两份必须同步的规则**；
 * - 这里只关心**画**与**点击**，不关心时间从哪来（真实音频 or 播放器时钟），
 *   所以音频源可以是 `<audio>`、Web Audio 或纯计时器。
 *
 * ⚠️ 坐标映射沿用原实现对 zoom 的口径：`time = ratio × durationSec`
 * （`zoom` 只放大画面、不改变点击映射）。要改的话请**同时**改
 * `AudioTabSyncStudio` 的调用方预期，避免出现「点了 A 点跳去 B 点」。
 */

export interface WaveformMarker {
  /** 绝对秒 */
  time: number;
  /** 标记文字（如 `M1` / `第 3 小节`） */
  label: string;
  /** 高亮（通常是当前所在的小节） */
  active?: boolean;
  /** 是否允许拖拽微调 */
  draggable?: boolean;
  /** 悬浮提示 */
  title?: string;
}

export interface WaveformLoopRegion {
  enabled: boolean;
  startSec: number;
  endSec: number;
}

export interface WaveformTimelineProps {
  /** 0-1 的能量峰值数组（长度任意，常见 128） */
  peaks: number[];
  /** 总时长（秒）—— 横坐标唯一依据 */
  durationSec: number;
  /** 当前播放位置（秒） */
  currentTimeSec: number;
  isPlaying?: boolean;
  isDark?: boolean;
  /** 标题（默认「声学波形与对齐主时钟」） */
  title?: string;
  /** 副标题（音轨名 / 技术信息） */
  subtitle?: string;
  /** 标记点（小节线 / 关键帧） */
  markers?: WaveformMarker[];
  /** 拖拽结束或过程中回报新时间（秒） */
  onMarkerDrag?: (index: number, timeSec: number) => void;
  /** 拖拽结束回调（用于提示「已保存」） */
  onMarkerDragEnd?: () => void;
  loopRegion?: WaveformLoopRegion;
  /** 点击 / 拖拽定位 */
  onSeek?: (timeSec: number) => void;
  /** 是否显示缩放控件 */
  allowZoom?: boolean;
  /** 波形区域高度 class */
  heightClass?: string;
  /** 头部右侧自定义内容 */
  headerRight?: React.ReactNode;
  /** 波形下方自定义内容（播放控制条等） */
  children?: React.ReactNode;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
  peaks,
  durationSec,
  currentTimeSec,
  isPlaying = false,
  isDark = true,
  title = '声学波形与对齐主时钟',
  subtitle,
  markers = [],
  onMarkerDrag,
  onMarkerDragEnd,
  loopRegion,
  onSeek,
  allowZoom = true,
  heightClass = 'h-28',
  headerRight,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const safeDuration = durationSec > 0 ? durationSec : 1;
  const progressPercent = Math.max(0, Math.min(100, (currentTimeSec / safeDuration) * 100));

  /** 视口内相对位置 → 秒 */
  const ratioToSec = useCallback(
    (clientX: number): number | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Number((ratio * safeDuration).toFixed(3));
    },
    [safeDuration],
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIndex !== null) return;
    const sec = ratioToSec(e.clientX);
    if (sec !== null) onSeek?.(sec);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIndex === null) return;
    const sec = ratioToSec(e.clientX);
    if (sec !== null) onMarkerDrag?.(draggingIndex, sec);
  };

  const handleMouseUp = () => {
    if (draggingIndex !== null) {
      setDraggingIndex(null);
      onMarkerDragEnd?.();
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 relative ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* ── 头部：标题 + 统计 + 缩放 ── */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold tracking-wide uppercase text-amber-500">{title}</span>
          {subtitle && <span className="text-[11px] text-slate-400 truncate">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          {markers.length > 0 && (
            <>
              <span>标记 {markers.length}</span>
              <span>·</span>
            </>
          )}
          <span>{safeDuration.toFixed(2)}s</span>
          {allowZoom && (
            <>
              <span>·</span>
              <span>缩放</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                className="p-1 hover:text-slate-200"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center">{zoom.toFixed(1)}x</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                className="p-1 hover:text-slate-200"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {headerRight}
        </div>
      </div>

      {/* ── 波形 ── */}
      <div
        ref={containerRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative ${heightClass} rounded-xl overflow-hidden border cursor-crosshair ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div
          className="absolute inset-0 flex items-center justify-between px-2 gap-[2px]"
          style={{ transform: `scaleX(${zoom})`, transformOrigin: 'left center' }}
        >
          {peaks.map((peak, idx) => {
            const barTime = (idx / Math.max(1, peaks.length)) * safeDuration;
            const isPassed = barTime <= currentTimeSec;
            const isInsideLoop =
              !!loopRegion?.enabled && barTime >= loopRegion.startSec && barTime <= loopRegion.endSec;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-center h-full">
                <div
                  className={`w-full rounded-full transition-all duration-75 ${
                    isInsideLoop
                      ? 'bg-purple-400 shadow-sm shadow-purple-500/50'
                      : isPassed
                        ? 'bg-amber-400 shadow-sm shadow-amber-500/40'
                        : isDark
                          ? 'bg-slate-700/80'
                          : 'bg-slate-300'
                  }`}
                  style={{ height: `${Math.max(8, peak * 88)}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* 关键点标记（小节线等，可拖拽） */}
        {markers.map((marker, idx) => {
          const leftPercent = (marker.time / safeDuration) * 100 * zoom;
          if (leftPercent > 100 * zoom) return null;
          const canDrag = marker.draggable !== false && !!onMarkerDrag;
          return (
            <div
              key={`marker-${idx}-${marker.label}`}
              className="absolute top-0 bottom-0 z-10 flex flex-col items-center"
              style={{ left: `${leftPercent}%` }}
            >
              <div
                onMouseDown={
                  canDrag
                    ? (e) => {
                        e.stopPropagation();
                        setDraggingIndex(idx);
                      }
                    : undefined
                }
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold select-none border transition-colors ${
                  canDrag ? 'cursor-ew-resize' : ''
                } ${
                  marker.active
                    ? 'bg-indigo-500 text-white border-indigo-400'
                    : isDark
                      ? 'bg-slate-800/90 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600 hover:text-white'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-600 hover:text-white'
                }`}
                title={marker.title || `${marker.label} · ${marker.time.toFixed(2)}s`}
              >
                {marker.label}
              </div>
              <div
                onMouseDown={
                  canDrag
                    ? (e) => {
                        e.stopPropagation();
                        setDraggingIndex(idx);
                      }
                    : undefined
                }
                className={`w-[2px] flex-1 transition-all ${
                  canDrag ? 'cursor-ew-resize' : ''
                } ${
                  marker.active
                    ? 'bg-indigo-400 shadow-lg shadow-indigo-500'
                    : 'bg-indigo-500/50 hover:bg-indigo-400'
                }`}
              />
            </div>
          );
        })}

        {/* A-B 循环区间 */}
        {loopRegion?.enabled && (
          <div
            className="absolute top-0 bottom-0 bg-purple-500/15 border-x-2 border-purple-400 pointer-events-none z-10"
            style={{
              left: `${(loopRegion.startSec / safeDuration) * 100 * zoom}%`,
              width: `${((loopRegion.endSec - loopRegion.startSec) / safeDuration) * 100 * zoom}%`,
            }}
          >
            <div className="absolute top-1 left-1.5 px-1 py-0.5 rounded bg-purple-600 text-white text-[9px] font-mono font-bold">
              A-B 循环区间
            </div>
          </div>
        )}

        {/* 60 FPS 播放头 */}
        <div
          className="absolute top-0 bottom-0 w-[2.5px] bg-amber-400 z-20 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.9)] flex flex-col items-center"
          style={{
            left: `${progressPercent * zoom}%`,
            transition: isPlaying ? 'none' : 'left 0.1s ease-out',
          }}
        >
          <div className="w-3.5 h-3.5 -mt-1 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
        </div>
      </div>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

export default WaveformTimeline;
