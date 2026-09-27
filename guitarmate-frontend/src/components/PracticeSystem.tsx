import React, { useMemo } from 'react';
import type {
  PracticeMeasure as PracticeMeasureData,
  PracticeNote,
} from '../practicePackage';
import { fingerLabel, positionLabel } from '../practicePackage';
import {
  MINI_TAB_METRICS,
  buildStandardTabSystemLayout,
  type StandardTabSystemLayout,
} from '../utils/standardTabLayout';

/**
 * 练习段落渲染器（谱行 = 1~3 个小节并排）
 * =====================================
 *
 * 与 `PracticeMeasure`（单小节）的关系：
 * - 单小节版是**最简形态**（1 个小节的谱行），
 * - 本组件是**谱行级**版本，复用同一个排版引擎 `buildStandardTabSystemLayout()`，
 *   把小节横向拼到同一行（弦线横贯整行、谱号/速度只画一次、小节线画在槽位之间）。
 *
 * 因此「每段 1 / 2 / 3 个小节」切换出来的谱面与 CMS 复核工作台、
 * 以及小程序单小节视图**保持同一套样式**，不会出现两种排版语言。
 *
 * 组件只负责「把排版引擎算好的坐标画成 SVG + 画播放行进指示」，
 * 不做任何乐理/时间换算。
 */

const SVG_WIDTH = 600;
const SVG_HEIGHT = 142;

export interface PracticeSystemProps {
  /** 本段落的小节（1-3 个，顺序与全曲一致） */
  measures: PracticeMeasureData[];
  /**
   * 段落内的播放位置（秒，相对**本段落第一小节**的起点）。
   * 传 `null` / `undefined` 表示本段不在播放 → 不画进度条与播放头。
   */
  playheadTimeSec?: number | null;
  isDark?: boolean;
  /** 全曲最后一段 → 画收尾双粗线 */
  isLastSystem?: boolean;
  /** 全曲第一段 → 画速度标记 ♪ = N */
  showTempo?: boolean;
  /**
   * 本段落在列表中的序号。
   * ⚠️ 回调一律带回这个序号，父组件才能用**身份稳定**的 `useCallback` ——
   * 否则每次渲染都传新函数，`React.memo` 形同虚设（长谱面会掉帧）。
   */
  segmentIndex?: number;
  /** 点击音符（segmentIndex = 段落序号，measureIndex = 段落内下标） */
  onNoteClick?: (segmentIndex: number, measureIndex: number, note: PracticeNote) => void;
  /** 点击谱面跳转（offsetSec = 小节内相对秒数） */
  onSeek?: (segmentIndex: number, measureIndex: number, offsetSec: number) => void;
  className?: string;
}

const PracticeSystemInner: React.FC<PracticeSystemProps> = ({
  measures,
  playheadTimeSec = null,
  isDark = true,
  isLastSystem = false,
  showTempo = false,
  segmentIndex = 0,
  onNoteClick,
  onSeek,
  className = '',
}) => {
  /** 段落内每个小节的起点（相对段落起点，秒） */
  const offsets = useMemo(() => {
    let acc = 0;
    return measures.map((m) => {
      const start = acc;
      acc += Math.max(0, m.duration || 0);
      return start;
    });
  }, [measures]);

  /**
   * 音符索引：`<slot>:<noteId>` → { 所在小节下标, 原始音符 }。
   *
   * ⚠️ 必须加 slot 前缀：后端 `Measure.index` 没有唯一约束，
   * 重复发布会产生**同 index 的重复小节**（历史数据里真实存在），
   * 两小节的音符 id 会完全相同 → 直接用 id 当 React key 会重复、查找也会串行。
   */
  const noteIndex = useMemo(() => {
    const map = new Map<string, { slot: number; note: PracticeNote }>();
    measures.forEach((m, slot) => {
      (m.trackData?.[0]?.notes || []).forEach((n) => map.set(`${slot}:${n.id}`, { slot, note: n }));
    });
    return map;
  }, [measures]);

  const layout: StandardTabSystemLayout = useMemo(
    () =>
      buildStandardTabSystemLayout({
        measures: measures.map((m, slot) => {
          const track = m.trackData?.[0];
          return {
            index: m.index,
            label: m.label,
            notes: (track?.notes || []).map((n) => ({
              id: `${slot}:${n.id}`,
              string: n.string,
              fret: n.fret,
              offsetSec: n.relativeTime,
              durationSec: n.duration,
              finger: n.finger,
              position: n.position,
              technique: n.technique,
            })),
            chords: (m.chords || []).map((c) => ({ name: c.chordName, offsetSec: c.startTime })),
            // 推荐和弦（小节级）：与 CMS 一致，取本小节第一个和弦标注
            chord: (m.chords || [])[0]?.chordName,
            position: m.position,
            duration: m.duration,
          };
        }),
        bpm: measures[0]?.bpm || 80,
        timeSignature: measures[0]?.timeSignature || '4/4',
        // 调弦音高对谱面绘制无影响（只影响音高推断，已由后端完成）→ 与 PracticeMeasure 同做法
        tuning: new Array(6).fill(0),
        measureDuration: measures[0]?.duration,
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        showClef: true,
        showTempo,
        isLastSystem,
        // 弦线数字 = 品位（把位优先标注在每小节左上角）
        noteLabel: 'fret',
        showFinger: false,
        metrics: MINI_TAB_METRICS,
      }),
    [measures, showTempo, isLastSystem],
  );

  /** 播放头：定位到「哪一小节 + 小节内偏移」，x 由排版引擎的 timeToX 给出 */
  const playhead = useMemo(() => {
    if (typeof playheadTimeSec !== 'number' || !Number.isFinite(playheadTimeSec)) return null;
    for (let slot = 0; slot < measures.length; slot += 1) {
      const rect = layout.measures[slot];
      if (!rect) continue;
      const start = offsets[slot];
      const duration = measures[slot]?.duration || rect.duration;
      if (!(duration > 0)) continue;
      if (playheadTimeSec < start - 1e-6 || playheadTimeSec > start + duration + 1e-6) continue;
      const offsetSec = Math.max(0, Math.min(duration, playheadTimeSec - start));
      return {
        slot,
        offsetSec,
        x: rect.timeToX(offsetSec),
        contentLeft: rect.contentLeft,
        contentRight: rect.contentRight,
      };
    }
    return null;
  }, [layout, measures, offsets, playheadTimeSec]);

  /** 当前正在响的音符 + 下一个待弹音符（与 PracticeMeasure 判定一致） */
  const { activeNoteIds, nextNoteId } = useMemo(() => {
    const active = new Set<string>();
    let next: string | null = null;
    if (!playhead) return { activeNoteIds: active, nextNoteId: next };
    const notes = measures[playhead.slot]?.trackData?.[0]?.notes || [];
    for (const note of notes) {
      const end = note.relativeTime + Math.max(note.duration, 0.08);
      if (note.relativeTime <= playhead.offsetSec + 1e-6 && end > playhead.offsetSec) {
        active.add(`${playhead.slot}:${note.id}`);
      }
    }
    const nextNote = notes.find((n) => n.relativeTime > playhead.offsetSec + 0.001);
    next = nextNote ? `${playhead.slot}:${nextNote.id}` : null;
    return { activeNoteIds: active, nextNoteId: next };
  }, [measures, playhead]);

  const lineColor = isDark ? '#475569' : '#94a3b8';
  const dimColor = isDark ? '#94a3b8' : '#64748b';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const surfaceBg = isDark ? '#0b1220' : '#ffffff';
  const accent = '#f59e0b';

  /** 点击谱面 → 换算成「哪一小节 + 小节内相对秒数」 */
  const handleSurfaceClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    // 阻止冒泡：否则外层段落卡片的 onClick 会把当前小节重置为段落首小节，
    // 把刚算好的跳转位置覆盖掉
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    for (let slot = 0; slot < layout.measures.length; slot += 1) {
      const m = layout.measures[slot];
      if (x < m.contentLeft - 1 || x > m.contentRight + 1) continue;
      const duration = measures[slot]?.duration || m.duration;
      const span = Math.max(1, m.contentRight - m.contentLeft);
      const offsetSec = Math.max(0, Math.min(duration, ((x - m.contentLeft) / span) * duration));
      onSeek(segmentIndex, slot, offsetSec);
      return;
    }
  };

  return (
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full block ${className}`}
      style={{ aspectRatio: `${SVG_WIDTH} / ${SVG_HEIGHT}`, height: 'auto' }}
      onClick={handleSurfaceClick}
    >
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

      {/* ② TAB 谱号 / 拍号 / 速度 / 小节号 / 把位 / 和弦名 */}
      {layout.texts.map((t, i) => {
        const common = { x: t.x, y: t.y, fontSize: t.size, fontFamily: 'Georgia, serif' };
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
                fill={t.role === 'positionLabel' ? accent : dimColor}
                fontFamily="monospace"
                opacity={t.role === 'measureNumber' ? 0.75 : 1}
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
              <text key={`t-${i}`} {...common} fontWeight={700} fill={isDark ? '#fbbf24' : '#b45309'}>
                {t.text}
              </text>
            );
        }
      })}

      {/* ③ 挖空弦线（品位数字落在弦线上，弦线在此处断开） */}
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

      {/* ⑤ 节奏线：符干 + 符尾 + 连接符 */}
      {layout.stems.map((stem, i) => (
        <g key={`stem-${i}`} stroke={lineColor} strokeWidth={1.1} strokeLinecap="round">
          <line x1={stem.x} y1={stem.y1} x2={stem.x} y2={stem.y2} />
          {stem.levels >= 1 && !stem.beamId && (
            <line x1={stem.x} y1={stem.y2} x2={stem.x + 3.5} y2={stem.y2 + 5} />
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
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}

      {/* ⑥ 扫弦箭头（同一时刻 ≥3 根弦） */}
      {layout.strums.map((strum, i) => {
        const midY = (strum.yTop + strum.yBottom) / 2;
        const headY = strum.direction === 'down' ? strum.yBottom : strum.yTop;
        const tailY = strum.direction === 'down' ? strum.yTop : strum.yBottom;
        const sign = Math.sign(headY - tailY || 1);
        return (
          <g
            key={`strum-${i}-${strum.id}`}
            stroke={accent}
            strokeWidth={1.3}
            fill="none"
            strokeLinecap="round"
          >
            <line x1={strum.x} y1={tailY} x2={strum.x} y2={headY - 4 * sign} />
            <path d={`M ${strum.x - 3} ${headY - 4 * sign} L ${strum.x} ${headY} L ${strum.x + 3} ${headY - 4 * sign}`} />
            <line x1={strum.x - 2.5} y1={midY - 3} x2={strum.x + 2.5} y2={midY - 3} opacity={0.6} />
          </g>
        );
      })}

      {/* ⑦ 横按高亮（用本小节自己的 timeToX，与谱面像素级一致） */}
      {measures.map((m, slot) => {
        const rect = layout.measures[slot];
        if (!rect) return null;
        return m.barres.map((b) => {
          const x1 = rect.timeToX(b.startTime);
          const x2 = rect.timeToX(b.startTime + b.duration);
          const yTop = layout.stringYs[Math.min(layout.stringCount, b.toString) - 1] - 3;
          const yBottom = layout.stringYs[Math.min(layout.stringCount, b.fromString) - 1] + 3;
          return (
            <rect
              key={`barre-${b.id}`}
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
        });
      })}

      {/* ⑧ 播放行进：当前音符实心高亮 + 下一个待弹音符描边（在数字下层） */}
      {layout.notes.map((laid) => {
        const isActive = activeNoteIds.has(laid.id);
        const isNext = !isActive && laid.id === nextNoteId;
        if (!isActive && !isNext) return null;
        const r = Math.max(laid.maskWidth, laid.maskHeight) / 2 + 2;
        return isActive ? (
          <circle key={`ph-a-${laid.id}`} cx={laid.x} cy={laid.y} r={r} fill="#f43f5e" opacity={0.8} />
        ) : (
          <circle
            key={`ph-n-${laid.id}`}
            cx={laid.x}
            cy={laid.y}
            r={r}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.4}
          />
        );
      })}

      {/* ⑨ 品位数字 + 手指上标 + 技巧标记 */}
      {layout.notes.map((laid) => {
        const hit = noteIndex.get(laid.id);
        const slot = hit?.slot ?? 0;
        const measure = measures[slot];
        const source = hit?.note;
        const isActive = activeNoteIds.has(laid.id);
        const position = laid.position ?? measure?.position;
        return (
          <g
            key={laid.id}
            onClick={(e) => {
              e.stopPropagation();
              if (source) onNoteClick?.(segmentIndex, slot, source);
            }}
            style={{ cursor: onNoteClick ? 'pointer' : 'default' }}
          >
            <title>
              {`第 ${laid.string} 弦 ${laid.fret} 品 · ${fingerLabel(source?.finger)}`}
              {typeof position === 'number' ? ` · ${positionLabel(position)}` : ''}
            </title>
            <text
              x={laid.x}
              y={laid.y + MINI_TAB_METRICS.fontSize * 0.36}
              fontSize={MINI_TAB_METRICS.fontSize}
              fontWeight={600}
              textAnchor="middle"
              fontFamily="monospace"
              fill={isActive ? '#ffffff' : textColor}
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

      {/* ⑩ 小节线（末段最后一小节 → 一细一粗收尾） */}
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

      {/* ⑪ 谱内进度条 + 播放头（时间不在本段时什么都不画） */}
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
          <line
            x1={playhead.x}
            y1={layout.staffTop - 10}
            x2={playhead.x}
            y2={layout.staffBottom + 10}
            stroke="#f43f5e"
            strokeWidth={1.6}
            opacity={0.9}
          />
          <circle cx={playhead.x} cy={layout.progressY} r={3} fill="#10b981" />
        </g>
      )}
    </svg>
  );
};

/**
 * ⚠️ `React.memo` 是「长谱面」的显示优化关键：
 * 播放时父组件每帧都会带着新的 `playheadTimeSec` 重渲染，
 * 若不做记忆化，几十个段落的全部 SVG（每段上百个节点）都会跟着重算 → 明显掉帧。
 * 只有活动段落的 `playheadTimeSec` 会变，其余段落 props 不变 → 完全跳过重渲染。
 */
export const PracticeSystem = React.memo(PracticeSystemInner);

export default PracticeSystem;
