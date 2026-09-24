import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NoteOverlay, type NoteOverlayMarker } from '../studios/tablature/NoteOverlay';
import { confidenceColor, type ReviewChord, type ReviewNote } from './reviewTypes';
import {
  CMS_TAB_METRICS,
  FINGER_MARKS,
  buildStandardTabLayout,
  type StandardTabLayout,
} from './standardTabLayout';

/**
 * 标准六线谱渲染器（StandardTabRenderer）
 * ======================================
 *
 * 输出与**市面上主流练习谱**一致的样式（参考 `6strings-1.jpg` / `6strings.jpg`）：
 *
 * ```
 *  ♪ = 90                                                            3   ← 小节号（右上角）
 *     C                        G                    ← 和弦名（弦线上方）
 *  2  1────1────2────4────┬────4────2────1────          ← 弦线上的数字 = 手指号（1食指·2中指·3无名指·4小指·○空弦）
 *  把位┌──────────────────┴───────────────────┐          ← 左上角：把位（阿拉伯数字）
 *  T│──2────2────1────3────┬────3────1────2────│        ← TAB 谱号 T = 2 弦
 *  A│──────────────────────┼───────────────────│
 *  B│══════════════════════╪═══════════════════│        ← 低音 E 弦线加粗
 *  └───────────────────────┴───────────────────┘
 *     │    │    │    │           │    │    │    │        ← 拍点刻度
 *     ╞═════════╡                ╞═════════╡           ← 节奏连接符（8/16 分）
 * ```
 *
 * ### 弦线上写手指号还是品位号？
 *
 * 默认 `noteLabel='finger'`（市面练习谱写法）：弦线上只写**手指号**，品位由
 * 左上角把位标记反推 `fret = position + finger − 1`，谱面大幅减负、两端一致。
 * 复核纠错时可传 `noteLabel='fret'` 切回「品位号 + 手指上标」的传统写法。
 * 无论哪种模式，`<title>` 里始终带**真实品位**，`NoteInspector` 也始终用品位编辑。
 *
 * ### 为什么不再用 VexFlow？
 *
 * 早期版本用「装了 vexflow 就渲染 VexFlow、没装就退化成圆圈+数字」的双实现，问题是：
 * 1. 两个渲染器**长得不一样**，CMS 与小程序也难以统一；
 * 2. VexFlow 开箱不含「和弦行 / 手指标注 / 扫弦箭头 / 中文把位标记」这些本平台必须的元素，
 *    仍要额外叠一层，反而更复杂；
 * 3. 参考谱面本身就是 **TAB-only** 排版（不需要五线谱的符头/符干），自研纯 SVG 完全够用且零依赖。
 *
 * 因此现在只有**一套**渲染器：`standardTabLayout.ts`（纯函数排版） + 本文件的 SVG 输出层。
 * 小程序端 `PracticeMeasure` 复用同一套排版规则（`MINI_TAB_METRICS`），两端像素级一致。
 *
 * 交互与质检能力完全保留：置信度叠加层（低置信度标红）、点击选中、自适应宽度。
 */

export interface StandardTabRendererProps {
  notes: ReviewNote[];
  /** 小节内和弦标记（谱面上方和弦名） */
  chords?: ReviewChord[];
  /** 小节时长（秒） */
  measureDuration: number;
  bpm: number;
  timeSignature?: string;
  /** 调弦 MIDI 数组（索引 0 = 一弦），长度决定弦线数量 */
  tuning: number[];
  capo?: number;
  /** 本小节把位（第 P 把位） */
  position?: number;
  /** 渲染上限宽度；实际宽度会自适应容器 */
  width?: number;
  /** 最小可读宽度：容器更窄时改为横向滚动，而不是压缩到不可读 */
  minWidth?: number;
  height?: number;
  isDark?: boolean;
  selectedNoteId?: string | null;
  onSelectNote?: (id: string) => void;
  /** 是否显示置信度图例 */
  showLegend?: boolean;
  /** 小节号（1 起） */
  measureIndex?: number;
  /** 画 TAB 谱号 + 拍号（每条谱线的第一小节） */
  showClef?: boolean;
  /** 画速度标记 ♪ = 90（全曲第一小节） */
  showTempo?: boolean;
  /** 收尾双粗线（全曲最后一小节） */
  isLastMeasure?: boolean;
  /**
   * 弦线数字：`'finger'`（默认）= 手指号；`'fret'` = 品位号 + 手指上标。
   * 复核纠错建议切到 `'fret'`，学员端（小程序）固定 `'finger'`。
   */
  noteLabel?: 'finger' | 'fret';
}

export const StandardTabRenderer: React.FC<StandardTabRendererProps> = ({
  notes,
  chords = [],
  measureDuration,
  bpm,
  timeSignature = '4/4',
  tuning,
  capo = 0,
  position,
  width = 1080,
  minWidth = 560,
  height = 168,
  isDark = true,
  selectedNoteId,
  onSelectNote,
  showLegend = true,
  measureIndex,
  showClef = true,
  showTempo = false,
  isLastMeasure = false,
  noteLabel = 'finger',
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);

  /**
   * 自适应宽度：谱面按容器实际宽度排版。
   * 监听的是外层 `w-full` 的包装元素（宽度由父容器决定，与子元素无关），
   * 因此不会产生 ResizeObserver 反馈循环。
   */
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

  const stringCount = Math.max(4, Math.min(7, tuning?.length || 6));

  const layout: StandardTabLayout = useMemo(
    () =>
      buildStandardTabLayout({
        notes: notes.map((n) => ({
          id: n.id,
          string: n.string,
          fret: n.fret,
          offsetSec: n.offsetSec,
          durationSec: n.durationSec,
          finger: n.finger,
          /** 音符级手位：与 measure.position 不同 = 小节内换把 */
          position: n.position,
          technique: n.technique,
          chordName: n.chordName,
        })),
        chords: chords.map((c) => ({ name: c.name, offsetSec: c.offsetSec })),
        measureDuration,
        bpm,
        timeSignature,
        tuning,
        position,
        width: effectiveWidth,
        height,
        measureIndex,
        showClef,
        showTempo,
        isLastMeasure,
        noteLabel,
        metrics: CMS_TAB_METRICS,
      }),
    [
      notes,
      chords,
      measureDuration,
      bpm,
      timeSignature,
      tuning,
      position,
      effectiveWidth,
      height,
      measureIndex,
      showClef,
      showTempo,
      isLastMeasure,
      noteLabel,
    ],
  );

  /** 置信度叠加层：圆点放在音符框左上角，避免盖住品味数与手指上标 */
  const markers: NoteOverlayMarker[] = useMemo(
    () =>
      layout.notes.map((laid) => {
        const source = notes.find((n) => n.id === laid.id);
        return {
          id: laid.id,
          x: (laid.x - laid.maskWidth / 2 - 2) / effectiveWidth,
          y: (laid.y - laid.maskHeight / 2 - 1) / height,
          confidence: source?.confidence ?? 1,
          fret: String(laid.fret),
          stringIndex: laid.string,
        };
      }),
    [layout, notes, effectiveWidth, height],
  );

  const lowCount = notes.filter((n) => (n.confidence ?? 1) < 0.6).length;

  const surfaceBg = isDark ? '#020617' : '#ffffff';
  const lineColor = isDark ? '#64748b' : '#94a3b8';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const dimColor = isDark ? '#94a3b8' : '#64748b';
  const accent = '#f59e0b';

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
                  fill={dimColor}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {t.text}
                </text>
              );
            }
            if (t.role === 'position' || t.role === 'positionLabel' || t.role === 'positionShift') {
              return (
                <text
                  key={`t-${i}`}
                  x={t.x}
                  y={t.y}
                  fontSize={t.size}
                  fontWeight={t.role === 'position' ? 700 : 400}
                  fill={accent}
                  opacity={t.role === 'positionShift' ? 0.85 : 1}
                  fontFamily={t.role === 'position' ? "Georgia, 'Times New Roman', serif" : 'inherit'}
                >
                  {t.text}
                </text>
              );
            }
            // chord
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

          {/* ③ 挖空弦线（品味数落在弦线上，需要把线断开） */}
          {layout.lineGaps.map((gap, i) => (
            <rect
              key={`gap-${i}`}
              x={gap.x1}
              y={gap.y - (CMS_TAB_METRICS.fontSize + 3) / 2}
              width={Math.max(0, gap.x2 - gap.x1)}
              height={CMS_TAB_METRICS.fontSize + 3}
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

          {/* ⑦ 品味数 + 手指上标 + 技巧标记 */}
          {layout.notes.map((laid) => {
            const source = notes.find((n) => n.id === laid.id);
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
                  y={laid.y + CMS_TAB_METRICS.fontSize * 0.36}
                  fontSize={CMS_TAB_METRICS.fontSize}
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
                    fontSize={CMS_TAB_METRICS.fingerFontSize}
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
                    fontSize={CMS_TAB_METRICS.fingerFontSize}
                    fill={dimColor}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {laid.techniqueText}
                  </text>
                )}
              </g>
            );
          })}

          {/* ⑧ 小节线（末小节：一细一粗） */}
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
        </svg>

        {/* 置信度叠加层（低置信度标红，可点击） */}
        <NoteOverlay
          markers={markers}
          selectedId={selectedNoteId}
          onSelect={onSelectNote}
          showLegend={showLegend}
        />
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-slate-500 flex-wrap">
        <span>
          {notes.length} 音符
          {chords.length > 0 ? ` · ${chords.length} 和弦` : ''}
          {layout.beams.length > 0 ? ` · ${layout.beams.length} 连接符` : ''}
          {layout.strums.length > 0 ? ` · ${layout.strums.length} 扫弦` : ''}
        </span>
        <span>·</span>
        <span>低置信度 {lowCount}</span>
        <span>·</span>
        <span className="text-amber-500">
          {noteLabel === 'finger'
            ? '弦线数字=手指 1食指·2中指·3无名指·4小指·○空弦（品位由把位反推）'
            : '弦线数字=品位，上标=手指 1食指·2中指·3无名指·4小指·○空弦'}
        </span>
        {typeof position === 'number' && position >= 1 && (
          <>
            <span>·</span>
            <span className="text-amber-500">第 {position} 把位</span>
          </>
        )}
        {capo > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-500">变调夹 {capo} 品</span>
          </>
        )}
      </div>
    </div>
  );
};

export default StandardTabRenderer;
