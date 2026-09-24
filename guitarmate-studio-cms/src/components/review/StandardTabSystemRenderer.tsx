import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NoteOverlay, type NoteOverlayMarker } from '../studios/tablature/NoteOverlay';
import { confidenceColor } from './reviewTypes';
import {
  CMS_TAB_METRICS,
  FINGER_MARKS,
  buildStandardTabSystemLayout,
  type StandardTabMetrics,
  type StandardTabSystemLayout,
} from './standardTabLayout';

/**
 * 标准六线谱「谱行 / 编辑段落」渲染器（StandardTabSystemRenderer）
 * ==============================================================
 *
 * 一个**编辑段落 = 2-3 个小节并排**（与市面练习谱的「一行两三小节」一致）：
 *
 * ```
 *  ♪ = 84              12                        13                        14   ← 小节号（每个小节右上角）
 *     D               A                         Bm                             ← 推荐和弦（每小节一个）
 *  1 把位            1 把位                     5 把位                           ← **把位是第一顺位标注**
 *  T│──0──2──3──┬───0──2──3──┬───2──4──4───│
 *  A│───────────┼────────────┼─────────────│
 *  B│═══════════╪════════════╪═════════════│
 *     │   │   │   │   │   │   │   │   │   │
 *     ╞════════╡    ╞════════╡    ╞════════╡                                  ← 节奏线（符干 + 连接符）
 * ```
 *
 * 和弦 / 把位 / 品位数字 / 节奏线的**排版规则全部来自** `standardTabLayout.ts`
 * （纯函数），本组件只负责把坐标画成 SVG —— 因此与小程序端 `PracticeMeasure`
 * 长得一模一样（只有像素密度不同）。
 *
 * 与前身 `StandardTabRenderer`（单小节）的关系：本组件是**谱行级**的，
 * 内部把每个小节交给同一个引擎排完再横向平移，不做任何二次变形。
 */

/**
 * 谱行里最小可用的音符形状。
 *
 * 刻意做成**结构化最小集**（不依赖 `ReviewNote`）：复核工作台的 `ReviewNote`、
 * 小程序的 `PracticeNote`、`src/data/canonInD.ts` 的测试数据都能直接传进来，
 * 不需要任何适配层。缺失 `confidence` 时按 1.0（高置信度）处理。
 */
export interface StandardTabSystemNote {
  id: string;
  /** 1-6（1 = 最细的高音 E 弦） */
  string: number;
  /** 0-24；-1 = 闷弦（渲染为 x） */
  fret: number;
  /** 相对小节起点的秒数 */
  offsetSec: number;
  durationSec: number;
  /** 0 = 空弦，1-4 = 食指…小指（次要标注） */
  finger?: number;
  /** 该音生效的把位 */
  position?: number;
  technique?: string;
  chordName?: string;
  confidence?: number;
}

export interface StandardTabSystemMeasure {
  /** 显示小节号（1 起） */
  index: number;
  label?: string;
  /**
   * 该小节在**整曲时间轴**上的起点（秒）。
   * 播放头 / 谱内进度条靠它把小节内偏移换算成绝对时间；不给则不画行进指示。
   */
  startTime?: number;
  notes: StandardTabSystemNote[];
  /** 小节内和弦变化；`chord` 为空时优先用它 */
  chords?: Array<{ name: string; offsetSec: number }>;
  /** 推荐和弦（小节级，把位之后的第二顺位标注） */
  chord?: string;
  /** 本小节把位（第 P 把位） */
  position?: number;
  /** 本小节时长（秒）；缺省用 `measureDuration` */
  duration?: number;
}

export interface StandardTabSystemRendererProps {
  measures: StandardTabSystemMeasure[];
  bpm: number;
  timeSignature?: string;
  /** 调弦 MIDI 数组（索引 0 = 一弦） */
  tuning: number[];
  capo?: number;
  /** 缺省小节时长（秒）—— 每个小节也可以用 `duration` 单独指定 */
  measureDuration?: number;
  width?: number;
  minWidth?: number;
  height?: number;
  isDark?: boolean;
  /** 画 TAB 谱号 + 拍号（每条谱行的第一小节） */
  showClef?: boolean;
  /** 画速度标记 ♪ = N（全曲第一条谱行） */
  showTempo?: boolean;
  /** 收尾双粗线（全曲最后一条谱行） */
  isLastSystem?: boolean;
  /**
   * 弦线上的数字：默认 `'fret'`（**品位优先**，把位由左上角标记给出）。
   * `'finger'` 只在复核纠错时用来核对左手指法。
   */
  noteLabel?: 'finger' | 'fret';
  /**
   * 是否在品位数字旁画**手指上标**。默认 `false`：谱面上只保留
   * 「把位（第一顺位）+ 品位数字」，手指上标只在复核左手指法时打开。
   */
  showFinger?: boolean;
  selectedNoteId?: string | null;
  onSelectNote?: (id: string) => void;
  /** 是否显示置信度圆点叠加层（复核工作台用；排版预览可关掉） */
  showConfidence?: boolean;
  /** 是否显示置信度图例 */
  showLegend?: boolean;
  /** 是否显示底部统计脚注（复核页要，预览页不要） */
  showStats?: boolean;
  /**
   * 当前播放位置（**整曲时间轴**绝对秒）。
   *
   * 传了之后谱面上会多出三样「行进指示」（与小程序 `PracticeMeasure` 同款）：
   * 1. 弦线下方一整条**进度条**（已播放部分高亮）；
   * 2. 一根**播放头竖线**，横跨弦线；
   * 3. **当前正在响的音符**实心高亮 + **下一个待弹音符**描边提示。
   * 时间不在本谱行范围内时什么也不画（多行谱面只在活动那行显示）。
   */
  playheadTimeSec?: number | null;
  /**
   * 版式度量。默认 `CMS_TAB_METRICS`（1080 宽复核版式）；
   * 传 `MINI_TAB_METRICS` + `width=600` 就能得到与小程序 `PracticeMeasure`
   * **逐像素一致**的谱面（预览页就是这么做的）。
   */
  metrics?: StandardTabMetrics;
}

export const StandardTabSystemRenderer: React.FC<StandardTabSystemRendererProps> = ({
  measures,
  bpm,
  timeSignature = '4/4',
  tuning,
  capo = 0,
  measureDuration,
  width = 1080,
  minWidth = 560,
  height = 168,
  isDark = true,
  showClef = true,
  showTempo = false,
  isLastSystem = false,
  noteLabel = 'fret',
  showFinger = false,
  selectedNoteId,
  onSelectNote,
  showConfidence = true,
  showLegend = false,
  showStats = true,
  playheadTimeSec = null,
  metrics = CMS_TAB_METRICS,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);

  /** 自适应宽度（监听外层 w-full 容器，不会与子元素产生反馈循环） */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = (value: number) => {
      const next = Math.floor(value);
      if (next > 0) setMeasuredWidth((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };
    apply(el.clientWidth);
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect?.width || 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effectiveWidth = Math.max(minWidth, Math.min(width, measuredWidth || width));

  const layout: StandardTabSystemLayout = useMemo(
    () =>
      buildStandardTabSystemLayout({
        measures: measures.map((m) => ({
          index: m.index,
          label: m.label,
          notes: m.notes.map((n) => ({
            id: n.id,
            string: n.string,
            fret: n.fret,
            offsetSec: n.offsetSec,
            durationSec: n.durationSec,
            finger: n.finger,
            position: n.position,
            technique: n.technique,
            chordName: n.chordName,
          })),
          chords: (m.chords || []).map((c) => ({ name: c.name, offsetSec: c.offsetSec })),
          chord: m.chord,
          position: m.position,
          duration: m.duration,
        })),
        bpm,
        timeSignature,
        tuning,
        measureDuration,
        width: effectiveWidth,
        height,
        showClef,
        showTempo,
        isLastSystem,
        noteLabel,
        showFinger,
        metrics,
      }),
    [
      measures,
      bpm,
      timeSignature,
      tuning,
      measureDuration,
      effectiveWidth,
      height,
      showClef,
      showTempo,
      isLastSystem,
      noteLabel,
      showFinger,
      metrics,
    ],
  );

  /** 全部音符（跨小节），供置信度叠加层与 title 使用 */
  const allNotes = useMemo(() => measures.flatMap((m) => m.notes), [measures]);

  /**
   * 播放头几何：定位到「哪一小节 + 小节内第几秒」，再用排版引擎的 `timeToX`
   * 换算出 x —— 与谱面像素级一致，不做任何比例估算。
   */
  const playhead = useMemo(() => {
    if (typeof playheadTimeSec !== 'number' || !Number.isFinite(playheadTimeSec)) return null;
    for (let slot = 0; slot < measures.length; slot += 1) {
      const measure = measures[slot];
      const rect = layout.measures[slot];
      if (!rect) continue;
      const start = typeof measure.startTime === 'number' ? measure.startTime : null;
      if (start === null) continue;
      const duration = measure.duration ?? measureDuration ?? rect.duration;
      if (!(duration > 0)) continue;
      if (playheadTimeSec < start - 1e-6 || playheadTimeSec > start + duration + 1e-6) continue;

      const offsetSec = Math.max(0, Math.min(duration, playheadTimeSec - start));
      return {
        slot,
        offsetSec,
        duration,
        x: rect.timeToX(offsetSec),
        contentLeft: rect.contentLeft,
        contentRight: rect.contentRight,
        ratio: offsetSec / duration,
      };
    }
    return null;
  }, [layout, measureDuration, measures, playheadTimeSec]);

  /** 当前正在响的音符 + 下一个待弹音符（与小程序 PracticeMeasure 判定一致） */
  const { activeNoteIds, nextNoteId } = useMemo(() => {
    const active = new Set<string>();
    let next: string | null = null;
    if (!playhead) return { activeNoteIds: active, nextNoteId: next };
    const notes = measures[playhead.slot]?.notes || [];
    for (const note of notes) {
      const end = note.offsetSec + Math.max(note.durationSec, 0.08);
      if (note.offsetSec <= playhead.offsetSec + 1e-6 && end > playhead.offsetSec) active.add(note.id);
    }
    next = notes.find((n) => n.offsetSec > playhead.offsetSec + 0.001)?.id ?? null;
    return { activeNoteIds: active, nextNoteId: next };
  }, [measures, playhead]);

  const markers: NoteOverlayMarker[] = useMemo(
    () =>
      layout.notes.map((laid) => {
        const source = allNotes.find((n) => n.id === laid.id);
        return {
          id: laid.id,
          x: (laid.x - laid.maskWidth / 2 - 2) / effectiveWidth,
          y: (laid.y - laid.maskHeight / 2 - 1) / height,
          confidence: source?.confidence ?? 1,
          fret: String(laid.fret),
          stringIndex: laid.string,
        };
      }),
    [layout, allNotes, effectiveWidth, height],
  );

  const surfaceBg = isDark ? '#020617' : '#ffffff';
  const lineColor = isDark ? '#64748b' : '#94a3b8';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const dimColor = isDark ? '#94a3b8' : '#64748b';
  const accent = '#f59e0b';

  const noteCount = layout.notes.length;
  const lowCount = allNotes.filter((n) => (n.confidence ?? 1) < 0.6).length;

  return (
    <div className="w-full overflow-x-auto" ref={wrapRef}>
      <div
        className="relative rounded-xl border overflow-hidden"
        style={{
          width: effectiveWidth,
          height,
          borderColor: isDark ? 'rgba(51,65,85,0.9)' : 'rgba(203,213,225,1)',
          background: isDark ? 'rgba(2,6,23,0.55)' : 'rgba(248,250,252,1)',
        }}
      >
        <svg width={effectiveWidth} height={height} className="block">
          {/* ① 弦线（横贯整条谱行，第 6 弦更粗） */}
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

          {/* ② 谱号 / 拍号 / 速度 / 把位 / 推荐和弦 / 小节号 */}
          {layout.texts.map((t, i) => {
            if (t.role === 'clef') {
              return (
                <text
                  key={`t-${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={t.size}
                  fontWeight={700}
                  fill={textColor}
                  fontFamily="Georgia, 'Times New Roman', serif"
                >
                  {t.text}
                </text>
              );
            }
            if (t.role === 'timeTop' || t.role === 'timeBottom') {
              return (
                <text
                  key={`t-${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={t.size}
                  fontWeight={700}
                  fill={textColor}
                  textAnchor="middle"
                  fontFamily="Georgia, 'Times New Roman', serif"
                >
                  {t.text}
                </text>
              );
            }
            if (t.role === 'tempo' || t.role === 'measureNumber') {
              return (
                <text
                  key={`t-${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={t.size}
                  fill={t.role === 'measureNumber' ? dimColor : textColor}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  opacity={t.role === 'measureNumber' ? 0.75 : 1}
                >
                  {t.text}
                </text>
              );
            }
            if (t.role === 'position' || t.role === 'positionLabel' || t.role === 'positionShift') {
              // 把位 = 第一顺位标注 → 用主题色 + 加粗，视觉上先于品位数被看到
              return (
                <text
                  key={`t-${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={t.size}
                  fontWeight={t.role === 'position' ? 700 : 500}
                  fill={accent}
                  opacity={t.role === 'positionShift' ? 0.85 : 1}
                  fontFamily={t.role === 'position' ? "Georgia, 'Times New Roman', serif" : 'inherit'}
                >
                  {t.text}
                </text>
              );
            }
            // chord（含推荐和弦）
            return (
              <text
                key={`t-${i}`}
                x={t.x}
                y={t.y}
                fontSize={t.size}
                fontWeight={700}
                fill={isDark ? '#fbbf24' : '#b45309'}
                fontFamily="Georgia, 'Times New Roman', serif"
              >
                {t.text}
              </text>
            );
          })}

          {/* ③ 挖空弦线（品位数落在弦线上，需要把线断开） */}
          {layout.lineGaps.map((gap, i) => (
            <rect
              key={`gap-${i}`}
              x={gap.x1}
              y={gap.y - (layout.metrics.fontSize + 3) / 2}
              width={Math.max(0, gap.x2 - gap.x1)}
              height={layout.metrics.fontSize + 3}
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

          {/* ⑤ 节奏线：符干 + 符尾 + 连接符 */}
          {layout.stems.map((stem, i) => (
            <g key={`stem-${i}`} stroke={lineColor} strokeWidth={1.2} strokeLinecap="round">
              <line x1={stem.x} y1={stem.y1} x2={stem.x} y2={stem.y2} />
              {/* 同拍内落单的短音符 → 画符尾（不参与连接符） */}
              {stem.levels >= 1 && !stem.beamId && (
                <line x1={stem.x} y1={stem.y2} x2={stem.x + 4} y2={stem.y2 + 6} />
              )}
            </g>
          ))}
          {layout.beams.map((beam, i) => (
            <line
              key={`beam-${i}`}
              x1={beam.x1}
              y1={beam.y}
              x2={beam.x2}
              y2={beam.y}
              stroke={lineColor}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}

          {/* ⑥ 扫弦箭头（同一时刻 ≥3 根弦） */}
          {layout.strums.map((strum) => {
            const midY = (strum.yTop + strum.yBottom) / 2;
            const headY = strum.direction === 'down' ? strum.yBottom : strum.yTop;
            const tailY = strum.direction === 'down' ? strum.yTop : strum.yBottom;
            return (
              <g key={strum.id} stroke={accent} strokeWidth={1.4} fill="none" strokeLinecap="round">
                <line x1={strum.x} y1={tailY} x2={strum.x} y2={headY - 4 * Math.sign(headY - tailY || 1)} />
                <path
                  d={`M ${strum.x - 3} ${headY - 4 * Math.sign(headY - tailY || 1)} L ${strum.x} ${headY} L ${strum.x + 3} ${headY - 4 * Math.sign(headY - tailY || 1)}`}
                />
                <line x1={strum.x - 2.5} y1={midY - 3} x2={strum.x + 2.5} y2={midY - 3} opacity={0.6} />
              </g>
            );
          })}

          {/* ⑥b 播放行进：当前音符实心高亮 + 下一个待弹音符描边（在品位数**下层**，不遮数字） */}
          {layout.notes.map((laid) => {
            const isActive = activeNoteIds.has(laid.id);
            const isNext = !isActive && laid.id === nextNoteId;
            if (!isActive && !isNext) return null;
            const r = Math.max(laid.maskWidth, laid.maskHeight) / 2 + 2;
            return isActive ? (
              <circle key={`ph-a-${laid.id}`} cx={laid.x} cy={laid.y} r={r} fill="#f43f5e" opacity={0.92} />
            ) : (
              <circle
                key={`ph-n-${laid.id}`}
                cx={laid.x}
                cy={laid.y}
                r={r}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.5}
                opacity={0.9}
              />
            );
          })}

          {/* ⑦ 品位数（默认）+ 手指上标 + 技巧标记 */}
          {layout.notes.map((laid) => {            const source = allNotes.find((n) => n.id === laid.id);
            const isSelected = selectedNoteId === laid.id;
            const color = source ? confidenceColor(source.confidence ?? 1) : textColor;
            return (
              <g
                key={laid.id}
                onClick={onSelectNote ? () => onSelectNote(laid.id) : undefined}
                style={{ cursor: onSelectNote ? 'pointer' : 'default' }}
              >
                <title>
                  {`第 ${laid.string} 弦 ${laid.fret} 品`}
                  {laid.position !== undefined ? ` · ${laid.position} 把位` : ''}
                  {laid.finger !== undefined ? ` · 手指 ${FINGER_MARKS[laid.finger] || laid.finger}` : ''}
                  {source ? ` · 置信度 ${((source.confidence ?? 1) * 100).toFixed(0)}%` : ''}
                </title>
                {isSelected && (
                  <rect
                    x={laid.x - laid.maskWidth / 2 - 2}
                    y={laid.y - laid.maskHeight / 2 - 2}
                    width={laid.maskWidth + 4}
                    height={laid.maskHeight + 4}
                    rx={4}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.6}
                  />
                )}
                <text
                  x={laid.x}
                  y={laid.y + layout.metrics.fontSize * 0.36}
                  fontSize={layout.metrics.fontSize}
                  fontWeight={600}
                  textAnchor="middle"
                  fill={color}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {laid.text}
                </text>
                {laid.fingerText && (
                  <text
                    x={laid.fingerX}
                    y={laid.fingerY}
                    fontSize={layout.metrics.fingerFontSize}
                    fontWeight={700}
                    textAnchor="middle"
                    fill={laid.fingerText === '○' ? dimColor : accent}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {laid.fingerText}
                  </text>
                )}
                {laid.techniqueText && (
                  <text
                    x={laid.techniqueX}
                    y={laid.techniqueY}
                    fontSize={layout.metrics.fingerFontSize}
                    fill={dimColor}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {laid.techniqueText}
                  </text>
                )}
              </g>
            );
          })}

          {/* ⑧ 小节线（谱行末尾：一细一粗） */}
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

          {/* ⑨ 播放行进条：谱内进度条 + 播放头竖线（与小程序 PracticeMeasure 同款） */}
          {playhead && (
            <g pointerEvents="none">
              <line
                x1={playhead.contentLeft}
                y1={layout.progressY}
                x2={playhead.contentRight}
                y2={layout.progressY}
                stroke={isDark ? '#1e293b' : '#e2e8f0'}
                strokeWidth={4}
                strokeLinecap="round"
              />
              <line
                x1={playhead.contentLeft}
                y1={layout.progressY}
                x2={Math.max(playhead.contentLeft + 0.5, playhead.x)}
                y2={layout.progressY}
                stroke="#10b981"
                strokeWidth={4}
                strokeLinecap="round"
              />
              {/* 播放头：横跨弦线的红竖线（与进度条交点有圆点，方便定位） */}
              <line
                x1={playhead.x}
                y1={layout.staffTop - 8}
                x2={playhead.x}
                y2={layout.staffBottom + 12}
                stroke="#f43f5e"
                strokeWidth={1.6}
                opacity={0.9}
              />
              <circle cx={playhead.x} cy={layout.progressY} r={3.5} fill="#10b981" />
            </g>
          )}
        </svg>

        {showConfidence && (
          <NoteOverlay
            markers={markers}
            selectedId={selectedNoteId}
            onSelect={onSelectNote}
            showLegend={showLegend}
          />
        )}
      </div>

      {showStats && (
        <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-slate-500 flex-wrap">
        <span>
          {layout.measures.length} 小节 · {noteCount} 音符
          {layout.beams.length > 0 ? ` · ${layout.beams.length} 连接符` : ''}
          {layout.stems.length > 0 ? ` · ${layout.stems.length} 符干` : ''}
        </span>
        <span>·</span>
        <span>低置信度 {lowCount}</span>
        {layout.measures.some((m) => typeof m.position === 'number') && (
          <>
            <span>·</span>
            <span className="text-amber-500">
              把位 {layout.measures.filter((m) => typeof m.position === 'number').map((m) => `${m.position}`).join('/')}
            </span>
          </>
        )}
        {layout.measures.some((m) => !!m.chord) && (
          <>
            <span>·</span>
            <span className="text-amber-500">
              推荐和弦 {layout.measures.filter((m) => !!m.chord).map((m) => m.chord).join(' / ')}
            </span>
          </>
        )}
        <span>·</span>
        <span className="text-slate-400">
          {noteLabel === 'fret'
            ? `弦线数字 = 品位（把位优先标注在每小节左上角${showFinger ? '，上标 = 手指号' : '；手指上标已关闭'}）`
            : '弦线数字 = 手指号（复核左手指法模式）'}
        </span>
        {playhead && typeof playheadTimeSec === 'number' && (
          <>
            <span>·</span>
            <span className="text-emerald-400">
              播放头 {playheadTimeSec.toFixed(2)}s · 第 {measures[playhead.slot]?.index} 小节
            </span>
          </>
        )}
        {capo > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-500">变调夹 {capo} 品</span>
          </>
        )}
        </div>
      )}
    </div>
  );
};

export default StandardTabSystemRenderer;
