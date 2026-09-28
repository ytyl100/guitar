import React, { useMemo } from 'react';
import { TabNote } from '../../../types';
import {
  DURATION_PRESETS,
  TECHNIQUE_OPTIONS,
  beatSecOf,
  findMeasureIndexAt,
  isMutedFret,
  rhythmLabelOf,
  velocityDynamics,
} from './tabEditorModel';

/**
 * 属性面板（TabInspectorPanel）—— 规格文档 §9「属性面板（速率 / 时值 / 力度）」
 *
 * 只负责「把当前选中的音符渲染成可编辑控件 + 把修改回传给调用方」，
 * 不做任何历史/排序逻辑（那些统一由 `TabEditorPanel` 走撤销栈）。
 *
 * ⚠️ 多选时对「不一致的字段」显示「多值」而不是假装统一 —— 与既有
 * `ReviewPage` 的 NoteInspector 保持同一心智模型，避免误改。
 */

export interface TabInspectorPanelProps {
  selected: TabNote[];
  measureTimestamps: number[];
  bpm?: number;
  durationSec: number;
  isDark: boolean;
  onChange: (patch: Partial<TabNote>, label: string) => void;
  onDelete: () => void;
  onDuplicateNextBeat: () => void;
}

const cardCls = (isDark: boolean) =>
  `p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`;

const labelCls = 'text-[10px] uppercase tracking-wider text-slate-500 font-semibold';

const inputCls = (isDark: boolean) =>
  `w-full p-2 rounded-lg border text-xs font-mono ${
    isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800'
  }`;

/** 取多个音符的公共值；不一致返回 null（显示「多值」） */
const common = <T,>(list: TabNote[], pick: (n: TabNote) => T): T | null => {
  if (list.length === 0) return null;
  const first = pick(list[0]);
  return list.every((n) => pick(n) === first) ? first : null;
};

export const TabInspectorPanel: React.FC<TabInspectorPanelProps> = ({
  selected,
  measureTimestamps,
  bpm,
  durationSec,
  isDark,
  onChange,
  onDelete,
  onDuplicateNextBeat,
}) => {
  const beatSec = beatSecOf(bpm);
  const empty = selected.length === 0;

  const strings = common(selected, (n) => n.stringIndex);
  const frets = common(selected, (n) => String(n.fret));
  const durations = common(selected, (n) => n.durationSec);
  const velocities = common(selected, (n) => n.velocity ?? 90);
  const techniques = common(selected, (n) => n.technique ?? 'normal');

  /** 「小节.拍.细分」显示（规格文档 §9「起始」行） */
  const positionLabel = useMemo(() => {
    if (empty) return '—';
    const n = selected[0];
    const idx = findMeasureIndexAt(n.timestampSec, measureTimestamps);
    const measureStart = idx >= 0 ? measureTimestamps[idx] : 0;
    const offset = Math.max(0, n.timestampSec - measureStart);
    const beat = Math.floor(offset / beatSec) + 1;
    const tick = Math.round(((offset % beatSec) / beatSec) * 480);
    const suffix = selected.length > 1 ? ` (+${selected.length - 1})` : '';
    return `M${Math.max(1, idx + 1)}.${beat}.${String(tick).padStart(3, '0')}${suffix}`;
  }, [selected, measureTimestamps, beatSec, empty]);

  if (empty) {
    return (
      <div
        className={`rounded-2xl border p-4 text-xs ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <div className="font-bold uppercase tracking-wider text-amber-500 mb-2">属性面板</div>
        <p className="leading-relaxed">
          未选中音符。在谱面上<b>单击</b>选中、<b>Shift</b> 加选、<b>框选</b>多选，或<b>双击空白</b>新建音符。
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
          <li>0-9 · 设置品格</li>
          <li>X · 设为闷音</li>
          <li>↑/↓ · 换弦（Alt+↑/↓ · 品格 ±1）</li>
          <li>←/→ · 按网格移动（Shift · 移动一拍）</li>
          <li>, / . · ±10ms 微调（突破网格）</li>
          <li>Alt+拖拽 · 复制音符</li>
          <li>Q · 量化到网格</li>
          <li>N · 跳到下一个低置信度音符</li>
          <li>Ctrl+Z / Ctrl+Shift+Z · 撤销 / 重做</li>
        </ul>
      </div>
    );
  }

  const currentDuration = durations ?? selected[0].durationSec;
  const currentVelocity = velocities ?? 90;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 text-xs ${
        isDark ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold uppercase tracking-wider text-amber-500">
          属性面板 · 选中 {selected.length} 个
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onDuplicateNextBeat}
            className={`px-2 py-1 rounded-lg border text-[11px] ${
              isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
            }`}
            title="复制选中的音符到下一拍（Ctrl+D）"
          >
            ⧉ 复制到下一拍
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 text-[11px]"
            title="删除选中的音符（Delete）"
          >
            删除
          </button>
        </div>
      </div>

      <div className={cardCls(isDark)}>
        <div className={labelCls}>弦位 / 品格</div>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <label className="space-y-1">
            <span className="text-[10px] text-slate-500">弦（1 高音 E … 6 低音 E）</span>
            <select
              value={strings ?? ''}
              onChange={(e) =>
                onChange({ stringIndex: parseInt(e.target.value, 10) }, '修改弦位')
              }
              className={inputCls(isDark)}
            >
              {strings === null && <option value="">多值</option>}
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  第 {s} 弦
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-500">品位（0 = 空弦）</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={24}
                value={frets !== null && /^-?\d+$/.test(frets) ? frets : ''}
                placeholder={frets === null ? '多值' : ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isFinite(v)) return;
                  onChange({ fret: Math.max(0, Math.min(24, v)), technique: 'normal' }, '修改品格');
                }}
                className={inputCls(isDark)}
              />
              <button
                onClick={() => onChange({ fret: 'X', technique: 'palm-mute' }, '设为闷音')}
                className={`px-2 py-2 rounded-lg border text-[11px] shrink-0 ${
                  isMutedFret(selected[0].fret)
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                    : isDark
                      ? 'border-slate-700 hover:bg-slate-800'
                      : 'border-slate-300 hover:bg-slate-100'
                }`}
                title="设为闷音（X）"
              >
                ×
              </button>
            </div>
          </label>
        </div>
      </div>

      <div className={cardCls(isDark)}>
        <div className={labelCls}>起始位置</div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-amber-400 text-sm font-bold">{positionLabel}</span>
          <input
            type="number"
            step={0.01}
            min={0}
            max={durationSec}
            value={Number(selected[0].timestampSec.toFixed(3))}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange(
                { timestampSec: Math.max(0, Math.min(durationSec, Number(v.toFixed(3)))) },
                '修改起始时间',
              );
            }}
            className={`${inputCls(isDark)} w-24`}
          />
          <span className="text-[10px] text-slate-500 font-mono">秒（多选时只改第一个）</span>
        </div>
      </div>

      <div className={cardCls(isDark)}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>时值 / 速率 (Duration)</span>
          <span className="text-[10px] font-mono text-slate-400">
            {rhythmLabelOf(currentDuration, bpm)} · {currentDuration.toFixed(3)}s · 约{' '}
            {(currentDuration / beatSec).toFixed(2)} 拍
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {DURATION_PRESETS.map((p) => {
            const target = p.ratio * beatSec;
            const active = durations !== null && Math.abs(durations - target) < 0.01;
            return (
              <button
                key={p.label}
                onClick={() => onChange({ durationSec: Number(target.toFixed(3)) }, `时值设为 ${p.label}`)}
                className={`px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : isDark
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title={`${p.label} = ${p.ratio} 拍 = ${target.toFixed(3)}s`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-slate-500 shrink-0">自定义（秒）</span>
          <input
            type="number"
            step={0.01}
            min={0.02}
            max={20}
            value={Number(currentDuration.toFixed(3))}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange({ durationSec: Math.max(0.02, Number(v.toFixed(3))) }, '修改时值');
            }}
            className={`${inputCls(isDark)} w-24`}
          />
        </div>
      </div>

      <div className={cardCls(isDark)}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>力度 (Velocity)</span>
          <span className="font-mono text-[11px] text-cyan-400">
            {velocities === null ? '多值' : `${currentVelocity} / 127 · ${velocityDynamics(currentVelocity)}`}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={127}
          value={currentVelocity}
          onChange={(e) => onChange({ velocity: parseInt(e.target.value, 10) }, '修改力度')}
          className="w-full accent-cyan-400 mt-2"
        />
        <div className="flex gap-1.5 mt-1.5">
          {[
            { label: 'pp', v: 24 },
            { label: 'p', v: 44 },
            { label: 'mp', v: 66 },
            { label: 'mf', v: 88 },
            { label: 'f', v: 108 },
            { label: 'ff', v: 124 },
          ].map((d) => (
            <button
              key={d.label}
              onClick={() => onChange({ velocity: d.v }, `力度设为 ${d.label}`)}
              className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                velocities === d.v
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : isDark
                    ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cardCls(isDark)}>
        <div className={labelCls}>技法 (Technique)</div>
        <select
          value={techniques ?? ''}
          onChange={(e) =>
            onChange({ technique: e.target.value as TabNote['technique'] }, '修改技法')
          }
          className={`${inputCls(isDark)} mt-1.5`}
        >
          {techniques === null && <option value="">多值</option>}
          {TECHNIQUE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className={cardCls(isDark)}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>转录置信度</span>
          <span className="font-mono text-[11px]">
            {selected[0].confidence === undefined
              ? '未标注（视为 100%）'
              : `${((selected[0].confidence ?? 1) * 100).toFixed(0)}%`}
          </span>
        </div>
        {selected.some((n) => (n.confidence ?? 1) < 0.8) && (
          <button
            onClick={() => onChange({ confidence: 1 }, '标记为已确认')}
            className="mt-2 w-full py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-bold"
          >
            ✓ 标记为已确认（置信度 100%）
          </button>
        )}
      </div>
    </div>
  );
};

export default TabInspectorPanel;
