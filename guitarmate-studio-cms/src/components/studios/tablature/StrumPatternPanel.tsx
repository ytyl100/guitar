import React, { useMemo, useRef, useState } from 'react';
import {
  CHORD_SHAPES,
  STRUM_CELL_LABEL,
  STRUM_CYCLE,
  STRUM_PRESETS,
  StrumCell,
  StrumConfig,
} from './tabEditorModel';

/**
 * 扫弦模式面板（StrumPatternPanel）—— 规格文档 §7.2「扫弦模式（Strum）」
 *
 * 「和弦轨 + 扫弦轨 → 六线谱投影」这个关键抽象在这里落地：
 * - **和弦轨** = 6 根弦的按法（可直接点常用和弦一键填入，也可逐弦改品）
 * - **扫弦轨** = 每格 `· / ↓ / ↑ / ×`，点击循环切换、Shift+拖拽连续刷格
 * - **六线谱** = 由前两者**合成**（点「套用为音符」写进 `noteTimestamps`，与既有发布链路兼容）
 *
 * ⚠️ 本项目没有独立的 `strums` 表（发布载荷只有 measures[].notes），
 * 所以这里刻意做成「生成器」：只影响编辑期的中间表示 + 最终生成的 `TabNote`，
 * 不引入新的持久化结构（详见 `tabEditorModel.ts#StrumConfig` 的注释）。
 */

export interface StrumPatternPanelProps {
  value: StrumConfig;
  onChange: (next: StrumConfig, label: string) => void;
  isDark: boolean;
  /** 每小节拍数（用于算格子数：4/4 → 4 拍） */
  beatsPerMeasure?: number;
  measureCount: number;
  onApply: (fromIndex: number, toIndex: number, mode: 'replace' | 'merge') => void;
  onReverse: (fromIndex: number, toIndex: number) => void;
}

const GRID_RATIO: Record<string, number> = {
  '1/4': 1,
  '1/8': 0.5,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
};

const CELL_STYLE: Record<StrumCell, string> = {
  '·': 'bg-slate-700/30 text-slate-500',
  '↓': 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60',
  '↑': 'bg-sky-500/25 text-sky-300 border-sky-500/60',
  '×': 'bg-rose-500/25 text-rose-300 border-rose-500/60',
};

const CYCLE_FROM = (current: StrumCell): StrumCell => {
  const idx = STRUM_CYCLE.indexOf(current);
  return STRUM_CYCLE[(idx + 1) % STRUM_CYCLE.length];
};

const cardCls = (isDark: boolean) =>
  `p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`;

const labelCls = 'text-[10px] uppercase tracking-wider text-slate-500 font-semibold';

export const StrumPatternPanel: React.FC<StrumPatternPanelProps> = ({
  value,
  onChange,
  isDark,
  beatsPerMeasure = 4,
  measureCount,
  onApply,
  onReverse,
}) => {
  const [fromIndex, setFromIndex] = useState(1);
  const [toIndex, setToIndex] = useState(Math.min(4, Math.max(1, measureCount)));
  const [paintValue, setPaintValue] = useState<StrumCell>('↓');
  const [painting, setPainting] = useState(false);
  const paintRef = useRef(false);

  const cells = useMemo(() => {
    const ratio = GRID_RATIO[value.grid] ?? 0.5;
    return Math.max(1, Math.round(beatsPerMeasure / ratio));
  }, [value.grid, beatsPerMeasure]);

  /** 把 pattern 补齐/截断到当前格子数（切网格时用） */
  const normalizePattern = (pattern: StrumCell[], size: number): StrumCell[] =>
    Array.from({ length: size }, (_, i) => (pattern[i] ?? '·') as StrumCell);

  const setCell = (index: number, cell: StrumCell) => {
    const next = normalizePattern(value.pattern, cells);
    if (next[index] === cell) return;
    next[index] = cell;
    onChange({ ...value, pattern: next }, `扫弦格 ${index + 1} → ${STRUM_CELL_LABEL[cell]}`);
  };

  const stopPainting = () => {
    paintRef.current = false;
    setPainting(false);
  };

  // 松手结束刷格（挂 window 避免指针移出格子后卡在「持续刷」状态）
  React.useEffect(() => {
    const up = () => {
      paintRef.current = false;
      setPainting(false);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const pattern = normalizePattern(value.pattern, cells);

  const inputCls = `w-full p-2 rounded-lg border text-xs font-mono ${
    isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800'
  }`;

  const safeFrom = Math.max(1, Math.min(fromIndex, Math.max(1, measureCount)));
  const safeTo = Math.max(safeFrom, Math.min(toIndex, Math.max(1, measureCount)));

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 text-xs ${
        isDark ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold uppercase tracking-wider text-purple-400">扫弦模式（Strum）</span>
        <span className="text-[10px] text-slate-500 font-mono">
          和弦轨 + 扫弦轨 → 合成六线谱（写回 noteTimestamps）
        </span>
      </div>

      {/* ── 和弦轨 ── */}
      <div className={cardCls(isDark)}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>① 和弦轨（按法）</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500">名称</span>
            <input
              value={value.chordName}
              onChange={(e) => onChange({ ...value, chordName: e.target.value }, '修改和弦名')}
              className={`${inputCls} w-20 py-1`}
              placeholder="C"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {CHORD_SHAPES.map((c) => (
            <button
              key={c.name}
              onClick={() =>
                onChange(
                  { ...value, chordName: c.name, chordShape: [...c.shape] },
                  `套用和弦 ${c.name}`,
                )
              }
              className={`px-2 py-0.5 rounded border font-mono text-[11px] ${
                value.chordName === c.name
                  ? 'bg-purple-500 text-white border-purple-400 font-bold'
                  : isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 6 根弦的品格：index 0 = 第 6 弦 */}
        <div className="grid grid-cols-6 gap-1.5 mt-2">
          {[6, 5, 4, 3, 2, 1].map((stringIndex) => {
            const idx = 6 - stringIndex;
            const fret = value.chordShape[idx] ?? -1;
            return (
              <label key={stringIndex} className="space-y-0.5">
                <span className="text-[9px] text-slate-500 block text-center">{stringIndex} 弦</span>
                <input
                  type="number"
                  min={-1}
                  max={15}
                  value={fret}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const shape = [...value.chordShape];
                    while (shape.length < 6) shape.push(-1);
                    shape[idx] = Number.isFinite(v) ? Math.max(-1, Math.min(15, v)) : -1;
                    onChange({ ...value, chordShape: shape }, '修改和弦按法');
                  }}
                  className={`${inputCls} text-center py-1`}
                  title="-1 = 该弦不弹"
                />
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-slate-500 shrink-0">实际扫到的弦</span>
          <div className="flex gap-1">
            {[6, 5, 4, 3, 2, 1].map((s) => {
              const on = value.strings.includes(s);
              return (
                <button
                  key={s}
                  onClick={() =>
                    onChange(
                      {
                        ...value,
                        strings: on
                          ? value.strings.filter((x) => x !== s)
                          : [...value.strings, s].sort((a, b) => b - a),
                      },
                      on ? `扫弦不包含 ${s} 弦` : `扫弦包含 ${s} 弦`,
                    )
                  }
                  className={`w-6 h-6 rounded border text-[10px] font-mono ${
                    on
                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60'
                      : isDark
                        ? 'border-slate-700 text-slate-500'
                        : 'border-slate-300 text-slate-400'
                  }`}
                  title={`第 ${s} 弦`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 扫弦轨 ── */}
      <div className={cardCls(isDark)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={labelCls}>② 扫弦轨（节奏型）</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500">网格</span>
            {['1/8', '1/16'].map((g) => (
              <button
                key={g}
                onClick={() =>
                  onChange({ ...value, grid: g, pattern: normalizePattern(value.pattern, cells) }, `扫弦网格 ${g}`)
                }
                className={`px-2 py-0.5 rounded border font-mono text-[10px] ${
                  value.grid === g
                    ? 'bg-purple-500 text-white border-purple-400 font-bold'
                    : isDark
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* 刷子 */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] text-slate-500">画笔</span>
          {STRUM_CYCLE.map((c) => (
            <button
              key={c}
              onClick={() => setPaintValue(c)}
              className={`w-7 h-7 rounded border font-mono text-xs ${
                paintValue === c ? CELL_STYLE[c] : isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'
              }`}
              title={`画笔 = ${STRUM_CELL_LABEL[c]}`}
            >
              {c}
            </button>
          ))}
          <span className="text-[10px] text-slate-500 ml-1">
            点击格子循环切换 · <b>Shift + 拖拽</b> 用画笔连续刷格
          </span>
        </div>

        {/* 格子 */}
        <div className="grid grid-cols-8 gap-1 mt-2">
          {pattern.map((cell, i) => {
            const beatStart = Math.abs((i * (GRID_RATIO[value.grid] ?? 0.5)) % 1) < 1e-6;
            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  if (e.shiftKey) {
                    e.preventDefault();
                    paintRef.current = true;
                    setPainting(true);
                    setCell(i, paintValue);
                  } else {
                    setCell(i, CYCLE_FROM(cell));
                  }
                }}
                onPointerEnter={() => {
                  if (paintRef.current) setCell(i, paintValue);
                }}
                className={`h-9 rounded border font-mono text-sm transition-colors ${CELL_STYLE[cell]} ${
                  beatStart ? 'border-l-2 border-l-purple-400/60' : ''
                }`}
                title={`第 ${i + 1} 格 · ${STRUM_CELL_LABEL[cell]}`}
              >
                {cell}
              </button>
            );
          })}
        </div>
        {painting && <div className="text-[10px] text-purple-300 mt-1">正在刷格子…松开鼠标结束</div>}

        {/* 预设 */}
        <div className="flex flex-wrap gap-1 mt-2">
          {STRUM_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() =>
                onChange(
                  {
                    ...value,
                    grid: p.grid,
                    pattern: normalizePattern(p.pattern, Math.max(1, Math.round(beatsPerMeasure / (GRID_RATIO[p.grid] ?? 0.5)))),
                  },
                  `套用预设「${p.name}」`,
                )
              }
              className={`px-2 py-0.5 rounded border text-[10px] ${
                isDark
                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── 套用 / 反解 ── */}
      <div className={cardCls(isDark)}>
        <div className={labelCls}>③ 套用到小节</div>
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          <span className="text-[10px] text-slate-500">从</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, measureCount)}
            value={safeFrom}
            onChange={(e) => setFromIndex(parseInt(e.target.value, 10) || 1)}
            className={`${inputCls} w-16 py-1`}
          />
          <span className="text-[10px] text-slate-500">到</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, measureCount)}
            value={safeTo}
            onChange={(e) => setToIndex(parseInt(e.target.value, 10) || 1)}
            className={`${inputCls} w-16 py-1`}
          />
          <span className="text-[10px] text-slate-500">小节（共 {measureCount}）</span>
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            <input
              type="checkbox"
              checked={value.stagger}
              onChange={(e) => onChange({ ...value, stagger: e.target.checked }, '切换扫弦错位')}
              className="accent-purple-500"
            />
            12ms 错位（模拟真实扫弦琶音）
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            onClick={() => onApply(safeFrom - 1, safeTo - 1, 'merge')}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
            title="保留该范围内已有的其它音符，仅追加本次扫弦生成的音符"
          >
            ＋ 追加为该范围音符
          </button>
          <button
            onClick={() => onApply(safeFrom - 1, safeTo - 1, 'replace')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
            title="先清空该范围内的音符，再写入本次扫弦生成的音符"
          >
            ⟳ 覆盖该范围音符
          </button>
          <button
            onClick={() => onReverse(safeFrom - 1, safeTo - 1)}
            className={`px-3 py-1.5 rounded-lg border text-[11px] ${
              isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
            }`}
            title="读取该范围已有音符，反推和弦按法与 ↓/↑/× 节奏型（用于导入转录结果的校正）"
          >
            ↺ 从音符反解节奏型
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrumPatternPanel;
