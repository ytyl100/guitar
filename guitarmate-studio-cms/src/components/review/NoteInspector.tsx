import React from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Guitar,
  Hand,
  Hash,
  MoveHorizontal,
  Music2,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {
  DURATION_PRESETS,
  FINGER_OPTIONS,
  LOW_CONFIDENCE_THRESHOLD,
  REVIEW_TECHNIQUES,
  confidenceColor,
  fingerLabel,
  midiToName,
  positionLabel,
  type ReviewNote,
} from './reviewTypes';

/**
 * 音符检查器（NoteInspector）
 * ==========================
 *
 * 选中一个音符后，在这里编辑四件事 —— 与需求一一对应：
 *
 * | 字段 | 控件 | 说明 |
 * |---|---|---|
 * | 弦号 | 下拉（1..调弦数） | 1 = 一弦（最细） |
 * | 品位 | 数字 + 步进按钮 | 0-24；越界由输入框硬限制 |
 * | 时值 | 预设下拉 + 秒数输入 | 直接写 `durationSec` |
 * | 技巧 | 下拉 | kebab-case，发布时后端映射为契约的 snake_case |
 *
 * ⚠️ 改弦号 / 品位后会**同步重算 `midi`**（`空弦 + fret + capo`）——
 * 由 `applyNoteEdit` 统一负责，避免 C 端音高与谱面不一致。
 */
export interface NoteInspectorProps {
  note: ReviewNote | null;
  /** 调弦 MIDI 数组（索引 0 = 一弦） */
  tuning: number[];
  capo: number;
  /** 当前音符所在小节的总音量（用于展示「小节内第几个音符」） */
  measureNoteCount?: number;
  measureIndexLabel?: string;
  /** 本小节把位（第 P 把位） */
  measurePosition?: number;
  /** 修改小节把位（把位是小节级属性，作用于手型整体位置） */
  onPatchMeasurePosition?: (position: number | undefined) => void;
  /** 按当前把位重算本小节全部音符的手指 */
  onRefingerMeasure?: () => void;
  darkMode?: boolean;
  onPatch: (patch: Partial<Pick<ReviewNote, 'string' | 'fret' | 'durationSec' | 'technique' | 'finger'>>) => void;
  /** 把该音符从谱面中移除（低频误检音符） */
  onDelete?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onClose?: () => void;
}

export const NoteInspector: React.FC<NoteInspectorProps> = ({
  note,
  tuning,
  capo,
  measureNoteCount,
  measureIndexLabel,
  measurePosition,
  onPatchMeasurePosition,
  onRefingerMeasure,
  darkMode = true,
  onPatch,
  onDelete,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onClose,
}) => {
  const surface = darkMode
    ? 'bg-slate-900/70 border-slate-800 text-slate-200'
    : 'bg-white border-slate-200 text-slate-700';
  const field = darkMode
    ? 'bg-slate-950/70 border-slate-700 text-slate-100'
    : 'bg-slate-50 border-slate-300 text-slate-800';

  if (!note) {
    return (
      <div className={`rounded-2xl border p-4 ${surface}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Music2 size={15} className="text-amber-400" />
          音符检查器
        </div>
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          在左侧六线谱上点击任意音符即可编辑它的
          <span className="text-slate-300"> 弦号 / 品位 / 时值 / 技巧 / 手指</span>。
          <br />
          置信度低于 {(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% 的音符会标红，建议逐一确认后再发布。
        </p>
        <div className={`mt-3 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
          <div className="text-slate-400 font-semibold mb-1">关于手指标注</div>
          六线谱上的品位数只告诉你看第几品，<span className="text-amber-400">用哪根手指按</span>是另一回事：
          <div className="mt-1 font-mono">1 = 食指 · 2 = 中指 · 3 = 无名指 · 4 = 小指 · ○ = 空弦</div>
          音频转录与 ASCII tab 本身不带指法，由后端按「最低把位优先 + 同帧整体出手型」推定，可以在下方逐音符修正。
        </div>
      </div>
    );
  }

  const openPitch = Number(tuning[note.string - 1] ?? 0);
  const liveMidi = openPitch + note.fret + capo;
  const stringCount = Math.max(4, tuning.length || 6);
  const isLow = note.confidence < LOW_CONFIDENCE_THRESHOLD;
  const color = confidenceColor(note.confidence);

  return (
    <div className={`rounded-2xl border p-4 space-y-4 ${surface}`}>
      {/* 头部：音符标识 + 上一个/下一个 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Guitar size={15} className="text-amber-400" />
            {midiToName(liveMidi)}
            <span className="text-[11px] font-normal text-slate-500">
              MIDI {liveMidi}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {measureIndexLabel || `第 ${note.measureIndex + 1} 小节`}
            {typeof measureNoteCount === 'number' ? ` · 共 ${measureNoteCount} 个音符` : ''}
            {` · 第 ${note.startSec.toFixed(2)}s`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            title="上一个音符"
            className={`p-1.5 rounded-lg border ${field} disabled:opacity-30`}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            title="下一个音符"
            className={`p-1.5 rounded-lg border ${field} disabled:opacity-30`}
          >
            <ChevronRight size={13} />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} title="关闭" className={`p-1.5 rounded-lg border ${field}`}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 置信度 */}
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-slate-500">转录置信度</span>
          <span style={{ color }} className="font-mono font-semibold">
            {(note.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(2, note.confidence * 100)}%`, background: color }}
          />
        </div>
        {isLow && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-400">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>低置信度音符：模型可能把泛音 / 击弦误判成了独立音符，请以听感为准修正或删除。</span>
          </div>
        )}
      </div>

      {/* 弦号 */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
          <Guitar size={11} /> 弦号（1 = 最细的高音 E 弦）
        </span>
        <select
          value={note.string}
          onChange={(e) => onPatch({ string: Number(e.target.value) })}
          className={`w-full rounded-lg border px-2 py-1.5 text-xs ${field}`}
        >
          {Array.from({ length: stringCount }).map((_, i) => {
            const str = i + 1;
            const open = tuning[str - 1];
            return (
              <option key={str} value={str}>
                第 {str} 弦{open !== undefined ? `（空弦 ${midiToName(open)}）` : ''}
              </option>
            );
          })}
        </select>
      </label>

      {/* 品位 */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
          <Hash size={11} /> 品位（0-24）
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPatch({ fret: Math.max(0, note.fret - 1) })}
            className={`w-8 h-8 rounded-lg border text-sm ${field}`}
          >
            −
          </button>
          <input
            type="number"
            min={0}
            max={24}
            value={note.fret}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw) ? Math.min(24, Math.max(0, Math.round(raw))) : 0;
              onPatch({ fret: next });
            }}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-mono ${field}`}
          />
          <button
            type="button"
            onClick={() => onPatch({ fret: Math.min(24, note.fret + 1) })}
            className={`w-8 h-8 rounded-lg border text-sm ${field}`}
          >
            +
          </button>
        </div>
        <div className="mt-1 text-[10px] text-slate-500 font-mono">
          midi = 空弦({openPitch}) + fret({note.fret}) + capo({capo}) = <span className="text-emerald-400">{liveMidi}</span>
        </div>
      </label>

      {/* 时值 */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
          <Timer size={11} /> 时值 durationSec
        </span>
        <div className="flex items-center gap-1.5">
          <select
            value={DURATION_PRESETS.includes(Number(note.durationSec.toFixed(2))) ? note.durationSec.toFixed(2) : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return;
              onPatch({ durationSec: Number(e.target.value) });
            }}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${field}`}
          >
            <option value="custom">自定义…</option>
            {DURATION_PRESETS.map((d) => (
              <option key={d} value={d.toFixed(2)}>
                {d}s
              </option>
            ))}
          </select>
          <input
            type="number"
            step={0.01}
            min={0.02}
            max={8}
            value={note.durationSec}
            onChange={(e) => {
              const raw = Number(e.target.value);
              onPatch({ durationSec: Number.isFinite(raw) ? Math.min(8, Math.max(0.02, raw)) : 0.25 });
            }}
            className={`w-24 rounded-lg border px-2 py-1.5 text-center text-xs font-mono ${field}`}
          />
        </div>
      </label>

      {/* 技巧 */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
          <Music2 size={11} /> 演奏技巧
        </span>
        <select
          value={REVIEW_TECHNIQUES.some((t) => t.value === note.technique) ? note.technique : 'normal'}
          onChange={(e) => onPatch({ technique: e.target.value })}
          className={`w-full rounded-lg border px-2 py-1.5 text-xs ${field}`}
        >
          {REVIEW_TECHNIQUES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}（{t.value}）
            </option>
          ))}
        </select>
      </label>

      {/* 手指 */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
          <Hand size={11} /> 左手指法
        </span>
        <select
          value={typeof note.finger === 'number' ? String(note.finger) : 'unset'}
          onChange={(e) => {
            const raw = e.target.value;
            onPatch({ finger: raw === 'unset' ? undefined : Number(raw) });
          }}
          className={`w-full rounded-lg border px-2 py-1.5 text-xs ${field}`}
        >
          <option value="unset">未指定（谱面不画标记）</option>
          {FINGER_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[10px] text-slate-500">
          当前：<span className="text-amber-400">{fingerLabel(note.finger)}</span>
          {typeof note.finger === 'number' && note.finger > 0 && typeof measurePosition === 'number' && (
            <span className="ml-1">
              （第 {note.fret} 品 ÷ {positionLabel(measurePosition)} = 第 {note.finger} 指）
            </span>
          )}
        </div>
      </label>

      {/* 小节把位（小节级属性） */}
      <div className={`rounded-xl border p-2.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
          <MoveHorizontal size={11} /> 本节把位（食指所按品位）
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={24}
            value={measurePosition ?? ''}
            placeholder="未指定"
            onChange={(e) => {
              if (!onPatchMeasurePosition) return;
              const raw = e.target.value.trim();
              if (!raw) return onPatchMeasurePosition(undefined);
              const value = Number(raw);
              if (!Number.isFinite(value)) return;
              onPatchMeasurePosition(Math.min(24, Math.max(1, Math.round(value))));
            }}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-mono ${field}`}
          />
          <span
            className="text-amber-400 font-mono text-sm w-10 text-center"
            title="谱面左上角会把位画成这个阿拉伯数字（把位 2 = 食指按第 2 品）"
          >
            {typeof measurePosition === 'number' && measurePosition >= 1
              ? `${measurePosition} 把位`
              : '—'}
          </span>
          {onPatchMeasurePosition && (
            <button
              type="button"
              onClick={() => onPatchMeasurePosition(undefined)}
              title="清除本小节把位标记"
              className={`px-2 py-1.5 rounded-lg border text-[11px] ${field}`}
            >
              清除
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">
            食指按第 {typeof measurePosition === 'number' ? measurePosition : 'P'} 品，第 n 指负责第 P+n−1 品
          </span>
          {onRefingerMeasure && typeof measurePosition === 'number' && (
            <button
              type="button"
              onClick={onRefingerMeasure}
              className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20"
            >
              按此把位重算手指
            </button>
          )}
        </div>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20"
        >
          <Trash2 size={12} /> 删除该音符（误检）
        </button>
      )}
    </div>
  );
};

export default NoteInspector;
