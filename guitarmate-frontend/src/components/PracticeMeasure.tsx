import React, { useMemo } from 'react';
import type { MeasureTrackData, PracticeMeasure as PracticeMeasureData, PracticeNote } from '../practicePackage';
import { fingerLabel, positionLabel } from '../practicePackage';
import type { PracticeClock } from '../hooks/clockTypes';
import { MINI_TAB_METRICS, buildStandardTabLayout } from '../utils/standardTabLayout';

export interface PracticeMeasureProps {
  /** 小节数据（PracticePackage.measures[]） */
  measure: PracticeMeasureData;
  /** 指定要练的分轨（多轨曲目）；不传则用第一条 */
  trackId?: string;
  /**
   * 时间源 —— 由 `usePracticeClock()` 提供。
   * 有音频时是音频时钟，无音频时是节拍器时钟，本组件**不关心**是哪种，
   * 只用它提供的 `currentTime` / `duration` / `beatIndex`。
   */
  clock: PracticeClock;
  isDark?: boolean;
  /** 谱面切片图模式下的视口高度（px） */
  height?: number;
  /** 固定播放竖条位置（占视口宽度比例），默认 1/3 = 33.33% */
  playheadRatio?: number;
  onNoteClick?: (note: PracticeNote) => void;
  onChordClick?: (chordName: string) => void;
  /** 点击谱面跳转（0-100） */
  onSeek?: (progressPercent: number) => void;
  /**
   * 裸卡片模式：不自带边框/背景/内边距与顶部信息栏，
   * 供外部（如小节列表）把它嵌进自己的卡片里，避免卡片套卡片。
   */
  bare?: boolean;
  /**
   * 外部指定进度（0-100）。
   * 用于「非当前小节」的静态渲染：已播完的显示 100%，未开始的显示 0%，
   * 而无需真的跑一个时钟。
   */
  progressOverride?: number;
  /** 弦数（默认 6；贝斯曲目传 4 可得到 4 线谱） */
  stringCount?: number;
  className?: string;
}

// ─────────────────────────────────────────────────────────────
// 矢量渲染版式：与 CMS 复核工作台共用同一套排版规则
// （`src/utils/standardTabLayout.ts` ↔ CMS 的 standardTabLayout.ts）
// ─────────────────────────────────────────────────────────────
const SVG_WIDTH = 600;
const SVG_HEIGHT = 142;
/** 谱内进度条 y（与弦线区域分离，不互相遮挡） */
const PROGRESS_Y = 132;

const STRING_LABELS: Record<number, string> = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' };

/**
 * 小节练习渲染器（PracticePackage 消费层）
 * ======================================
 *
 * 只做三件事：**拉到的数据 → 渲染 → 跟随时间源高亮**。
 * 不做时间换算、不做乐谱布局计算、不做和弦推断（都由后端/CMS 完成并进入 JSON）。
 *
 * ### 两种渲染模式
 *
 * 1. **图片模式**：`trackData.tabImageUrl` 非空 → 渲染图片，节点/横按/和弦按
 *    `x`/`y` 归一化坐标绝对定位叠加，播放竖条固定 33.33%；
 * 2. **矢量模式**（默认）：调用 `buildStandardTabLayout()` 输出**标准六线谱**——
 *    TAB 谱号、拍号、速度标记、小节号、和弦名、节奏连接符、扫弦箭头、
 *    手指标注（1食指·2中指·3无名指·4小指·○空弦）、把位罗马数字、加粗低音弦线。
 *    与 CMS 复核工作台**同一套排版规则**（仅像素密度不同），因此「后台看到什么、
 *    学员就练到什么」。
 */
export const PracticeMeasure: React.FC<PracticeMeasureProps> = ({
  measure,
  trackId,
  clock,
  isDark = true,
  height,
  playheadRatio = 1 / 3,
  onNoteClick,
  onChordClick,
  onSeek,
  bare = false,
  progressOverride,
  stringCount = 6,
  className = '',
}) => {
  const track: MeasureTrackData | undefined = useMemo(() => {
    if (trackId) {
      return measure.trackData.find((t) => t.trackId === trackId) || measure.trackData[0];
    }
    return measure.trackData[0];
  }, [measure.trackData, trackId]);

  const notes = track?.notes || [];
  const duration = clock.duration > 0 ? clock.duration : measure.duration || 1;
  const currentTime = clock.currentTime;

  /** 当前正在响的音符：一个 onset 可能有多根弦（和弦/扫弦），全部高亮 */
  const activeNotes = useMemo(
    () =>
      notes.filter(
        (n) =>
          currentTime >= n.relativeTime && currentTime < n.relativeTime + Math.max(n.duration, 0.08),
      ),
    [notes, currentTime],
  );
  const activeNoteIds = useMemo(() => new Set(activeNotes.map((n) => n.id)), [activeNotes]);

  /** 下一个待弹的音符（给学员「准备」提示） */
  const nextNote = useMemo(
    () => notes.find((n) => n.relativeTime > currentTime + 0.001) || null,
    [notes, currentTime],
  );

  const progressPercent =
    typeof progressOverride === 'number'
      ? Math.max(0, Math.min(100, progressOverride))
      : Math.max(0, Math.min(100, (currentTime / duration) * 100));

  const activeChord = useMemo(
    () =>
      measure.chords.find(
        (c) => currentTime >= c.startTime && currentTime < c.startTime + Math.max(c.duration, 0.2),
      ) || null,
    [measure.chords, currentTime],
  );

  const useImageMode = !!track?.tabImageUrl;
  const imageWidth = track?.imageWidth || 1200;

  // 图片模式：让谱面滚动到播放位置正好落在固定竖条处
  const scrollOffsetPx = useImageMode
    ? Math.max(0, (progressPercent / 100) * imageWidth - playheadRatio * imageWidth)
    : 0;

  /**
   * 标准六线谱排版（纯函数）。
   * 与 CMS 用同一套规则 → 后台复核时看到的谱面与学员端一致。
   */
  const layout = useMemo(
    () =>
      buildStandardTabLayout({
        notes: notes.map((n) => ({
          id: n.id,
          string: n.string,
          fret: n.fret,
          offsetSec: n.relativeTime,
          durationSec: n.duration,
          finger: n.finger,
          /** 音符级手位：与 measure.position 不同 = 小节内换把 */
          position: n.position,
          technique: n.technique,
        })),
        chords: measure.chords.map((c) => ({ name: c.chordName, offsetSec: c.startTime })),
        measureDuration: Math.max(0.05, measure.duration || duration),
        bpm: measure.bpm,
        timeSignature: measure.timeSignature,
        tuning: new Array(stringCount).fill(0),
        position: measure.position,
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        measureIndex: measure.index,
        showClef: true,
        showTempo: measure.index === 1,
        isLastMeasure: false,
        metrics: MINI_TAB_METRICS,
      }),
    [notes, measure, duration, stringCount],
  );

  const xOfTime = layout.timeToX;

  if (!track) {
    return (
      <div
        className={`p-3 rounded-xl border text-xs ${
          isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
        } ${className}`}
      >
        该小节没有分轨数据
      </div>
    );
  }

  const lineColor = isDark ? '#475569' : '#94a3b8';
  const dimColor = isDark ? '#94a3b8' : '#64748b';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const surfaceBg = isDark ? '#0b1220' : '#ffffff';
  const accent = '#f59e0b';

  return (
    <div
      className={
        bare
          ? className
          : `rounded-2xl border p-4 ${
              isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            } ${className}`
      }
    >
      {/* ── 头部：小节信息 + 时间源状态（裸模式隐藏，由外层卡片提供） ── */}
      {!bare && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {measure.label || `第 ${measure.index} 小节`}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-500/30 text-slate-400">
              {measure.bpm}BPM · {measure.timeSignature}
            </span>
            {typeof measure.position === 'number' && measure.position >= 1 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400"
                title={positionLabel(measure.position)}
              >
                {measure.position} 把位
              </span>
            )}
            {measure.section && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                {measure.section}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                clock.source === 'audio'
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                  : clock.source === 'metronome'
                    ? 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                    : 'border-slate-500/30 bg-slate-500/15 text-slate-400'
              }`}
              title={
                clock.source === 'audio'
                  ? '播放小节音频切片'
                  : clock.source === 'metronome'
                    ? '无音频，使用节拍器时钟练习'
                    : '静默时钟'
              }
            >
              {clock.source === 'audio' ? '🎧 音频' : clock.source === 'metronome' ? '🥁 节拍器' : '🔇 静默'}
            </span>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
            </span>
          </div>
        </div>
      )}

      {/* ── 谱面 ── */}
      {useImageMode ? (
        <div
          className="relative overflow-hidden rounded-xl bg-black/20"
          style={{ height }}
          onClick={(e) => {
            if (!onSeek) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            onSeek(Math.max(0, Math.min(100, pct)));
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translateX(-${scrollOffsetPx}px)`,
              transition: clock.isPlaying ? 'none' : 'transform 120ms linear',
            }}
          >
            <img
              src={track.tabImageUrl}
              alt={`第 ${measure.index} 小节六线谱`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* 横按高亮 */}
          {measure.barres.map((b) => (
            <div
              key={b.id}
              className="absolute rounded"
              style={{
                left: `${b.x * 100}%`,
                top: `${((b.fromString - 1) / 5) * 100}%`,
                width: '1.5%',
                height: `${((b.toString - b.fromString + 1) / 5) * 100 * 0.9}%`,
                background: 'rgba(16,185,129,0.18)',
                border: '1px solid rgba(16,185,129,0.5)',
              }}
              title={`横按 ${b.fret} 品 · ${b.fromString}-${b.toString} 弦`}
            />
          ))}

          {/* 和弦名 */}
          {measure.chords.map((c) => (
            <div
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onChordClick?.(c.chordName);
              }}
              className={`absolute -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                activeChord?.id === c.id
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-900/70 text-amber-300 border border-amber-500/40'
              }`}
              style={{ left: `${c.x * 100}%`, top: `${Math.max(0.04, c.y) * 100}%` }}
            >
              {c.chordName}
            </div>
          ))}

          {/* 节点 */}
          {notes.map((n) => {
            const isActive = activeNoteIds.has(n.id);
            return (
              <div
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onNoteClick?.(n);
                }}
                className={`absolute rounded-full cursor-pointer transition ${
                  isActive
                    ? 'bg-rose-500 ring-2 ring-white/70'
                    : 'bg-sky-400/70 hover:bg-sky-300'
                }`}
                style={{
                  left: `${n.x * 100}%`,
                  top: `${n.y * 100}%`,
                  width: 12,
                  height: 12,
                  transform: 'translate(-50%, -50%)',
                }}
                title={`${n.string} 弦 ${n.fret} 品 · ${fingerLabel(n.finger)} · ${n.relativeTime.toFixed(2)}s`}
              />
            );
          })}

          {/* 固定播放竖条（33.33%） */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-rose-500 pointer-events-none"
            style={{ left: `${playheadRatio * 100}%` }}
          />
        </div>
      ) : (
        // 矢量谱面按 viewBox 比例自适应高度：`height` 只对图片模式有意义，
        // 套用到矢量模式会在上下留出大片空白，让六线谱显得比实际小。
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full block"
          style={{ aspectRatio: `${SVG_WIDTH} / ${SVG_HEIGHT}`, height: 'auto' }}
          onClick={(e) => {
            if (!onSeek) return;
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            onSeek(Math.max(0, Math.min(100, pct)));
          }}
        >
          {/* ① 弦线（第 6 弦加粗） */}
          {layout.lines.map((line, i) => (
            <line
              key={`line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={line.width}
            />
          ))}

          {/* ② TAB 谱号 / 拍号 / 速度 / 小节号 / 把位 / 和弦名 */}
          {layout.texts.map((t, i) => {
            const common = {
              x: t.x,
              y: t.y,
              fontSize: t.size,
              fontFamily: 'Georgia, serif',
            };
            switch (t.role) {
              case 'clef':
                return (
                  <text key={`t-${i}`} {...common} fontWeight={700} fill={textColor}>
                    {t.text}
                  </text>
                );
              case 'timeTop':
              case 'timeBottom':
                return (
                  <text key={`t-${i}`} {...common} fontWeight={700} fill={textColor} textAnchor="middle">
                    {t.text}
                  </text>
                );
              case 'tempo':
              case 'measureNumber':
              case 'positionLabel':
                return (
                  <text
                    key={`t-${i}`}
                    {...common}
                    fontSize={t.size}
                    fill={t.role === 'positionLabel' ? accent : dimColor}
                    fontFamily="monospace"
                  >
                    {t.text}
                  </text>
                );
              case 'position':
              case 'positionShift':
                return (
                  <text
                    key={`t-${i}`}
                    {...common}
                    fontWeight={t.role === 'position' ? 700 : 400}
                    fill={accent}
                    opacity={t.role === 'positionShift' ? 0.85 : 1}
                  >
                    {t.text}
                  </text>
                );
              default:
                return (
                  <text
                    key={`t-${i}`}
                    {...common}
                    fontWeight={700}
                    fill={isDark ? '#fbbf24' : '#b45309'}
                  >
                    {t.text}
                  </text>
                );
            }
          })}

          {/* ③ 挖空弦线（品味数落在弦线上，弦线在此处断开） */}
          {layout.lineGaps.map((gap, i) => (
            <rect
              key={`gap-${i}`}
              x={gap.x1}
              y={gap.y - (MINI_TAB_METRICS.fontSize + 3) / 2}
              width={Math.max(0, gap.x2 - gap.x1)}
              height={MINI_TAB_METRICS.fontSize + 3}
              fill={surfaceBg}
              opacity={0.92}
            />
          ))}

          {/* ④ 拍点刻度 */}
          {layout.beatTicks.map((tick, i) => (
            <line
              key={`tick-${i}`}
              x1={tick.x}
              y1={tick.y1}
              x2={tick.x}
              y2={tick.y2}
              stroke={isDark ? '#334155' : '#cbd5e1'}
              strokeWidth={1}
            />
          ))}

          {/* ⑤ 节奏连接符（8/16 分音符） */}
          {layout.beams.map((beam, i) => (
            <line
              key={`beam-${i}`}
              x1={beam.x1}
              y1={beam.y}
              x2={beam.x2}
              y2={beam.y}
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}

          {/* ⑥ 扫弦箭头（同一时刻 ≥3 根弦） */}
          {layout.strums.map((strum) => {
            const midY = (strum.yTop + strum.yBottom) / 2;
            const headY = strum.direction === 'down' ? strum.yBottom : strum.yTop;
            const tailY = strum.direction === 'down' ? strum.yTop : strum.yBottom;
            const sign = Math.sign(headY - tailY || 1);
            return (
              <g key={strum.id} stroke={accent} strokeWidth={1.3} fill="none" strokeLinecap="round">
                <line x1={strum.x} y1={tailY} x2={strum.x} y2={headY - 4 * sign} />
                <path d={`M ${strum.x - 3} ${headY - 4 * sign} L ${strum.x} ${headY} L ${strum.x + 3} ${headY - 4 * sign}`} />
                <line x1={strum.x - 2.5} y1={midY - 3} x2={strum.x + 2.5} y2={midY - 3} opacity={0.6} />
              </g>
            );
          })}

          {/* ⑦ 横按（半透明色块，帮助学员定位手型） */}
          {measure.barres.map((b) => {
            const x1 = xOfTime(b.startTime);
            const x2 = xOfTime(b.startTime + b.duration);
            const yTop = layout.stringYs[Math.min(layout.stringCount, b.toString) - 1] - 3;
            const yBottom = layout.stringYs[Math.min(layout.stringCount, b.fromString) - 1] + 3;
            return (
              <rect
                key={b.id}
                x={x1}
                y={yTop}
                width={Math.max(4, x2 - x1)}
                height={Math.max(6, yBottom - yTop)}
                rx={3}
                fill="#10b981"
                opacity={0.18}
                stroke="#10b981"
                strokeWidth={1}
              />
            );
          })}

          {/* ⑧ 弦线上的主数字（默认 = 手指号，0 为 ○）+ 手指上标 + 技巧标记 + 高亮 */}
          {layout.notes.map((laid) => {
            const source = notes.find((n) => n.id === laid.id);
            const isActive = activeNoteIds.has(laid.id);
            const isNext = nextNote?.id === laid.id;
            /** 主数字就是手指号时用琥珀色（1-4）/ 灰色（○），与品位号区分 */
            const digitColor =
              laid.finger !== undefined && laid.fingerText === undefined && laid.text !== 'x'
                ? laid.finger === 0
                  ? dimColor
                  : accent
                : textColor;
            return (
              <g
                key={laid.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (source) onNoteClick?.(source);
                }}
                style={{ cursor: onNoteClick ? 'pointer' : 'default' }}
              >
                <title>
                  {`第 ${laid.string} 弦 ${laid.fret} 品 · ${fingerLabel(source?.finger)}`}
                  {(() => {
                    // 手位优先取**音符自己**的（小节内可能换把），没有才回退到小节把位
                    const position = laid.position ?? measure.position;
                    return typeof position === 'number' ? ` · ${positionLabel(position)}` : '';
                  })()}
                </title>
                {isActive && (
                  <circle
                    cx={laid.x}
                    cy={laid.y}
                    r={Math.max(laid.maskWidth, laid.maskHeight) / 2 + 3}
                    fill="#f43f5e"
                    opacity={0.8}
                  />
                )}
                {isNext && !isActive && (
                  <circle
                    cx={laid.x}
                    cy={laid.y}
                    r={Math.max(laid.maskWidth, laid.maskHeight) / 2 + 2}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.4}
                  />
                )}
                <text
                  x={laid.x}
                  y={laid.y + MINI_TAB_METRICS.fontSize * 0.36}
                  fontSize={MINI_TAB_METRICS.fontSize}
                  fontWeight={600}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fill={isActive ? '#ffffff' : digitColor}
                >
                  {laid.text}
                </text>
                {laid.fingerText && (
                  <text
                    x={laid.fingerX}
                    y={laid.fingerY}
                    fontSize={MINI_TAB_METRICS.fingerFontSize}
                    fontWeight={700}
                    textAnchor="middle"
                    fontFamily="monospace"
                    fill={laid.fingerText === '○' ? dimColor : accent}
                  >
                    {laid.fingerText}
                  </text>
                )}
                {laid.techniqueText && (
                  <text
                    x={laid.techniqueX}
                    y={laid.techniqueY}
                    fontSize={MINI_TAB_METRICS.fingerFontSize}
                    fill={dimColor}
                    fontFamily="monospace"
                  >
                    {laid.techniqueText}
                  </text>
                )}
              </g>
            );
          })}

          {/* ⑨ 和弦点击热区（谱面文字由排版引擎绘制，这里只加交互 + 当前高亮） */}
          {measure.chords.map((c) => {
            const x = xOfTime(c.startTime);
            const isActive = activeChord?.id === c.id;
            return (
              <g
                key={`chord-hit-${c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChordClick?.(c.chordName);
                }}
                style={{ cursor: onChordClick ? 'pointer' : 'default' }}
              >
                <title>{c.chordName}</title>
                {isActive && (
                  <rect
                    x={x - 2}
                    y={MINI_TAB_METRICS.chordRowY - MINI_TAB_METRICS.fontSize - 2}
                    width={c.chordName.length * MINI_TAB_METRICS.fontSize * 0.62 + 6}
                    height={MINI_TAB_METRICS.fontSize + 6}
                    rx={3}
                    fill={accent}
                    opacity={0.22}
                  />
                )}
                <rect
                  x={x - 2}
                  y={MINI_TAB_METRICS.chordRowY - MINI_TAB_METRICS.fontSize - 2}
                  width={c.chordName.length * MINI_TAB_METRICS.fontSize * 0.62 + 6}
                  height={MINI_TAB_METRICS.fontSize + 6}
                  fill="transparent"
                />
              </g>
            );
          })}

          {/* ⑩ 小节线（末小节：一细一粗） */}
          {layout.barlines.map((bar, i) => (
            <line
              key={`bar-${i}`}
              x1={bar.x1}
              y1={bar.y1}
              x2={bar.x2}
              y2={bar.y2}
              stroke={lineColor}
              strokeWidth={bar.width}
            />
          ))}

          {/* 谱内进度条 */}
          <line
            x1={layout.metrics.staffLeftX}
            y1={PROGRESS_Y}
            x2={SVG_WIDTH - layout.metrics.noteAreaRight}
            y2={PROGRESS_Y}
            stroke={isDark ? '#1e293b' : '#e2e8f0'}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <line
            x1={layout.metrics.staffLeftX}
            y1={PROGRESS_Y}
            x2={
              layout.metrics.staffLeftX +
              (progressPercent / 100) * (SVG_WIDTH - layout.metrics.noteAreaRight - layout.metrics.staffLeftX)
            }
            y2={PROGRESS_Y}
            stroke="#10b981"
            strokeWidth={4}
            strokeLinecap="round"
          />

          {/* 播放游标 */}
          <line
            x1={
              layout.metrics.staffLeftX +
              (progressPercent / 100) * (SVG_WIDTH - layout.metrics.noteAreaRight - layout.metrics.staffLeftX)
            }
            y1={layout.staffTop - 10}
            x2={
              layout.metrics.staffLeftX +
              (progressPercent / 100) * (SVG_WIDTH - layout.metrics.noteAreaRight - layout.metrics.staffLeftX)
            }
            y2={layout.staffBottom + 10}
            stroke="#f43f5e"
            strokeWidth={1.6}
            opacity={0.9}
          />
        </svg>
      )}
    </div>
  );
};

export default PracticeMeasure;
