import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Eraser,
  Grid3x3,
  Music2,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AudioTabSyncConfig, TabNote } from '../../../types';
import { useTabEditorHistory } from '../../../hooks/useTabEditorHistory';
import { TabEditorCanvas } from './TabEditorCanvas';
import { TabInspectorPanel } from './TabInspectorPanel';
import { StrumPatternPanel } from './StrumPatternPanel';
import {
  DEFAULT_STRUM_CONFIG,
  GRID_OPTIONS,
  STRUM_CELL_LABEL,
  StrumCell,
  StrumConfig,
  beatSecOf,
  computeEditorStats,
  detectOnsets,
  findMeasureIndexAt,
  gridStepSec,
  isMutedFret,
  measureRangeAt,
  materializeStrums,
  nextLowConfidence,
  noteToMidi,
  reverseEngineerStrums,
  roundSec,
  snapSecToGrid,
  sortNotes,
  withMeasureIndex,
} from './tabEditorModel';

/**
 * 六线谱编辑器（TabEditorPanel）
 * ==============================
 *
 * 把 `TabEditorCanvas`（渲染 + 手势）、`TabInspectorPanel`（属性）、
 * `StrumPatternPanel`（扫弦模式）与「对齐诊断 / 批量操作」工具条组装成一个
 * 可直接嵌入「音频与六线谱对齐」页面的**新增区块**。
 *
 * 设计原则（对应用户要求「不改动现有框架结构跟现有功能」）：
 * - 只读取 `config`，任何修改都通过既有 `onChangeConfig` 回写 —— 不新增持久化通道；
 * - 撤销/重做只覆盖本编辑器负责的三个切片（见 `useTabEditorHistory`），
 *   不会把页面别处的改动（BPM / 音频路径 / 发布绑定）一起回滚；
 * - 不删除、不替换页面上任何既有区块（波形、六线谱预览、对齐表格、各个弹窗全部保留）。
 */

export interface TabEditorPanelProps {
  config: AudioTabSyncConfig;
  onChangeConfig: (next: AudioTabSyncConfig) => void;
  isDark: boolean;
  playheadSec: number;
  isPlaying: boolean;
  /**
   * 可选的**细粒度**能量峰值（只用于起音点检测）。
   * 不传时退回 `config.waveformPeaks`（128 点）—— 长音频下那个粒度很粗，
   * 所以从「① 音频导入与六线谱校正」带过来的项目会额外算一份 1024 点的。
   */
  onsetPeaks?: number[];
  onSeek: (sec: number) => void;
  onPluck: (note: TabNote) => void;
  onToast?: (msg: string) => void;
}

type EditorMode = 'solo' | 'strum';

const normalizeStrum = (
  raw: AudioTabSyncConfig['strumConfig'] | undefined,
): StrumConfig => {
  if (!raw) return DEFAULT_STRUM_CONFIG;
  return {
    chordName: typeof raw.chordName === 'string' ? raw.chordName : DEFAULT_STRUM_CONFIG.chordName,
    chordShape:
      Array.isArray(raw.chordShape) && raw.chordShape.length > 0
        ? (raw.chordShape as number[])
        : DEFAULT_STRUM_CONFIG.chordShape,
    strings:
      Array.isArray(raw.strings) && raw.strings.length > 0
        ? (raw.strings as number[])
        : DEFAULT_STRUM_CONFIG.strings,
    grid: typeof raw.grid === 'string' ? raw.grid : DEFAULT_STRUM_CONFIG.grid,
    pattern:
      Array.isArray(raw.pattern) && raw.pattern.length > 0
        ? (raw.pattern as StrumCell[])
        : DEFAULT_STRUM_CONFIG.pattern,
    velocity: typeof raw.velocity === 'number' ? raw.velocity : DEFAULT_STRUM_CONFIG.velocity,
    stagger: !!raw.stagger,
  };
};

const cardCls = (isDark: boolean) =>
  `rounded-2xl border p-4 transition-all ${
    isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
  }`;

const toolBtn = (isDark: boolean, active = false) =>
  `px-2.5 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
    active
      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
      : isDark
        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
  }`;

export const TabEditorPanel: React.FC<TabEditorPanelProps> = ({
  config,
  onChangeConfig,
  isDark,
  playheadSec,
  isPlaying,
  onsetPeaks,
  onSeek,
  onPluck,
  onToast,
}) => {
  const history = useTabEditorHistory(config, onChangeConfig);
  const [mode, setMode] = useState<EditorMode>('solo');
  const [grid, setGrid] = useState<string>('1/16');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showOnsets, setShowOnsets] = useState(true);
  const [showRhythm, setShowRhythm] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onsetSensitivity, setOnsetSensitivity] = useState(0.6);
  const [defaultFret, setDefaultFret] = useState(0);
  const [kbFocus, setKbFocus] = useState(false);

  /** 画布键盘焦点变化（用于只在编辑器内生效的快捷键，如 Tab 切模式） */
  const handleKbFocusChange = useCallback((active: boolean) => setKbFocus(active), []);

  /** 视图开关快捷键（G 网格 / S 起音线 / R 节奏行） */
  const handleViewToggle = useCallback((what: 'grid' | 'onsets' | 'rhythm') => {
    if (what === 'grid') setShowGrid((v) => !v);
    else if (what === 'onsets') setShowOnsets((v) => !v);
    else setShowRhythm((v) => !v);
  }, []);

  /** Tab = 切换 SOLO / 扫弦模式（规格文档 §11）；仅当焦点在编辑器内时生效 */
  useEffect(() => {
    if (!kbFocus) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      setMode((m) => (m === 'solo' ? 'strum' : 'solo'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kbFocus]);

  const bpm = config.bpm || 80;
  const timeSignature = config.timeSignature || [4, 4];
  const timeSignatureLabel = `${timeSignature[0]}/${timeSignature[1]}`;
  /** 每小节拍数（4/4 → 4，6/8 → 3） */
  const beatsPerMeasure = Math.max(1, timeSignature[0] * (4 / timeSignature[1]));
  const beatSec = beatSecOf(bpm);
  const stepSec = gridStepSec(grid, bpm);
  const durationSec = config.audioDurationSec || 0;

  const notes = useMemo(() => sortNotes(config.noteTimestamps), [config.noteTimestamps]);
  const selectedNotes = useMemo(
    () => notes.filter((n) => selectedIds.includes(n.id)),
    [notes, selectedIds],
  );

  // ── 起音点检测（优先用细粒度峰值；由能量波形插值估计，不是真值） ────────
  const detectionPeaks = useMemo(
    () => (onsetPeaks && onsetPeaks.length > 0 ? onsetPeaks : config.waveformPeaks || []),
    [onsetPeaks, config.waveformPeaks],
  );
  const onsets = useMemo(
    () =>
      detectOnsets(detectionPeaks, durationSec, {
        sensitivity: onsetSensitivity,
        minGapSec: Math.max(0.08, beatSec * 0.25),
      }),
    [detectionPeaks, durationSec, onsetSensitivity, beatSec],
  );
  /** 起音点的时间分辨率（供诊断文案如实告知精度） */
  const onsetResolutionSec = detectionPeaks.length > 0 && durationSec > 0 ? durationSec / detectionPeaks.length : 0;

  const stats = useMemo(
    () => computeEditorStats(notes, config.measureTimestamps, onsets, grid, bpm),
    [notes, config.measureTimestamps, onsets, grid, bpm],
  );

  const strum = useMemo(() => normalizeStrum(config.strumConfig), [config.strumConfig]);

  // ── 提交封装（全部走撤销栈） ─────────────────────────────────────────────
  const commitNotes = useCallback(
    (next: TabNote[], label: string) => {
      history.applyEdits(label, {
        noteTimestamps: withMeasureIndex(sortNotes(next), config.measureTimestamps),
      });
      // 选中项可能已被删除 → 清理失效 id
      const alive = new Set(next.map((n) => n.id));
      setSelectedIds((prev) => prev.filter((id) => alive.has(id)));
    },
    [history, config.measureTimestamps],
  );

  const commitMeasures = useCallback(
    (next: number[], label: string) => {
      const sorted = [...next].sort((a, b) => a - b);
      history.applyEdits(label, { measureTimestamps: sorted });
    },
    [history],
  );

  const commitStrum = useCallback(
    (next: StrumConfig, label: string, mergeKey?: string) => {
      history.applyEdits(label, { strumConfig: next }, mergeKey);
    },
    [history],
  );

  /** 属性面板改一批音符（统一重算 pitch） */
  const handleInspectorChange = useCallback(
    (patch: Partial<TabNote>, label: string) => {
      if (selectedIds.length === 0) return;
      const set = new Set(selectedIds);
      const next = notes.map((n) => {
        if (!set.has(n.id)) return n;
        const merged: TabNote = { ...n, ...patch };
        merged.pitch = isMutedFret(merged.fret) ? 0 : noteToMidi(merged.stringIndex, merged.fret);
        return merged;
      });
      commitNotes(next, label);
    },
    [selectedIds, notes, commitNotes],
  );

  // ── 对齐工具（规格文档 §8.3） ───────────────────────────────────────────
  const snapToOnset = useCallback(
    (scope: 'selected' | 'all') => {
      if (onsets.length === 0) {
        onToast?.('还没有可用的起音点：请先「音频直传」上传音频（或用示范伴奏）');
        return;
      }
      const set = new Set(selectedIds);
      let moved = 0;
      const next = notes.map((n) => {
        if (scope === 'selected' && !set.has(n.id)) return n;
        let best = onsets[0];
        let bestDelta = Math.abs(n.timestampSec - best);
        for (const t of onsets) {
          const d = Math.abs(n.timestampSec - t);
          if (d < bestDelta) {
            best = t;
            bestDelta = d;
          }
        }
        if (bestDelta > 1e-4) moved++;
        return { ...n, timestampSec: roundSec(best) };
      });
      commitNotes(next, scope === 'selected' ? '吸附选中到起音点' : '全部吸附到起音点');
      onToast?.(`已把 ${moved} 个音符吸附到最近起音点`);
    },
    [onsets, selectedIds, notes, commitNotes, onToast],
  );

  const quantize = useCallback(
    (scope: 'selected' | 'all') => {
      const set = new Set(selectedIds);
      const next = notes.map((n) => {
        if (scope === 'selected' && !set.has(n.id)) return n;
        return { ...n, timestampSec: roundSec(snapSecToGrid(n.timestampSec, grid, bpm, true)) };
      });
      commitNotes(next, scope === 'selected' ? '量化选中到网格' : '全部量化到网格');
      onToast?.(`已按 ${grid} 网格量化${scope === 'selected' ? '选中音符' : '全部音符'}`);
    },
    [selectedIds, notes, grid, bpm, commitNotes, onToast],
  );

  const batchShift = useCallback(
    (deltaSec: number) => {
      if (selectedIds.length === 0) {
        onToast?.('请先选中要整体平移的音符（框选或 Shift 点选）');
        return;
      }
      const set = new Set(selectedIds);
      const next = notes.map((n) =>
        set.has(n.id)
          ? { ...n, timestampSec: roundSec(Math.max(0, Math.min(durationSec, n.timestampSec + deltaSec))) }
          : n,
      );
      commitNotes(next, `整体平移 ${deltaSec > 0 ? '+' : ''}${Math.round(deltaSec * 1000)}ms`);
    },
    [selectedIds, notes, durationSec, commitNotes, onToast],
  );

  const markAllConfirmed = useCallback(() => {
    const pending = notes.filter((n) => (n.confidence ?? 1) < 0.8);
    if (pending.length === 0) {
      onToast?.('没有待复核的低置信度音符');
      return;
    }
    const set = new Set(pending.map((n) => n.id));
    commitNotes(
      notes.map((n) => (set.has(n.id) ? { ...n, confidence: 1 } : n)),
      `确认全部低置信度音符（${pending.length}）`,
    );
    onToast?.(`已把 ${pending.length} 个低置信度音符标记为已确认`);
  }, [notes, commitNotes, onToast]);

  const jumpLowConfidence = useCallback(
    (dir: 1 | -1) => {
      const found = nextLowConfidence(notes, playheadSec, dir, 0.8);
      if (!found) {
        onToast?.('没有待复核的低置信度音符了');
        return;
      }
      setSelectedIds([found.id]);
      onSeek(found.timestampSec);
      onPluck(found);
      onToast?.(`⚠ 待复核：${found.stringIndex} 弦 ${String(found.fret)} 品 @ ${found.timestampSec.toFixed(2)}s`);
    },
    [notes, playheadSec, onSeek, onPluck, onToast],
  );

  /** 按 BPM / 拍号重新生成小节线（与既有 `handleAudioUpload` 同一口径） */
  const regenerateMeasures = useCallback(() => {
    if (durationSec <= 0) {
      onToast?.('还没有音频时长：请先「音频直传」或用「示范原声伴奏」');
      return;
    }
    const barSec = beatSec * beatsPerMeasure;
    const count = Math.max(1, Math.ceil(durationSec / barSec));
    const next = Array.from({ length: count }, (_, i) => roundSec(i * barSec));
    commitMeasures(next, '按 BPM 重新生成小节线');
    onToast?.(`已按 ${bpm} BPM / ${timeSignatureLabel} 生成 ${count} 个小节（每小节 ${barSec.toFixed(2)}s）`);
  }, [durationSec, beatSec, beatsPerMeasure, bpm, timeSignatureLabel, commitMeasures, onToast]);

  // ── 扫弦：套用 / 反解 ───────────────────────────────────────────────────
  const applyStrum = useCallback(
    (fromIndex: number, toIndex: number, applyMode: 'replace' | 'merge') => {
      const measures = config.measureTimestamps;
      if (measures.length === 0) {
        onToast?.('还没有小节线，请先「按 BPM 重新生成小节线」');
        return;
      }
      const lo = Math.max(0, Math.min(fromIndex, measures.length - 1));
      const hi = Math.max(lo, Math.min(toIndex, measures.length - 1));

      const generated: TabNote[] = [];
      for (let i = lo; i <= hi; i++) {
        const { start, end } = measureRangeAt(i, measures, durationSec);
        generated.push(
          ...materializeStrums({
            strum,
            measureIndex: i,
            measureStart: start,
            measureEnd: end,
            bpm,
            idPrefix: `st${i}`,
          }),
        );
      }
      if (generated.length === 0) {
        onToast?.('当前节奏型没有任何发音（全部是 · 空拍）');
        return;
      }

      const base =
        applyMode === 'replace'
          ? notes.filter((n) => {
              const idx = findMeasureIndexAt(n.timestampSec, measures);
              return idx < lo || idx > hi;
            })
          : notes;

      // 一次事务同时写入「生成的音符」与「节奏型设置」：撤销一步即可整体回退，
      // 且下次打开该曲目时扫弦面板会还原成刚用过的和弦/节奏型。
      history.applyEdits(applyMode === 'replace' ? '扫弦覆盖小节' : '扫弦追加小节', {
        noteTimestamps: withMeasureIndex(sortNotes([...base, ...generated]), measures),
        strumConfig: strum,
      });
      setSelectedIds([]);
      onToast?.(
        `已${applyMode === 'replace' ? '覆盖' : '追加'}第 ${lo + 1}~${hi + 1} 小节：生成 ${generated.length} 个音符`,
      );
    },
    [config.measureTimestamps, durationSec, strum, bpm, notes, history, onToast],
  );

  const reverseStrum = useCallback(
    (fromIndex: number, toIndex: number) => {
      const measures = config.measureTimestamps;
      if (measures.length === 0) {
        onToast?.('还没有小节线');
        return;
      }
      const lo = Math.max(0, Math.min(fromIndex, measures.length - 1));
      const hi = Math.max(lo, Math.min(toIndex, measures.length - 1));
      const { start, end } = measureRangeAt(lo, measures, durationSec);
      const result = reverseEngineerStrums(notes, start, end, strum, bpm);
      if (result.matchedCells === 0) {
        onToast?.(`第 ${lo + 1} 小节里没有可识别的扫弦（需要同一时刻 ≥2 个音符）`);
        return;
      }
      commitStrum(result.strum, '从音符反解扫弦节奏型');
      onToast?.(`已从第 ${lo + 1} 小节反解出 ${result.matchedCells} 拍扫弦节奏型`);
    },
    [config.measureTimestamps, durationSec, notes, strum, bpm, commitStrum, onToast],
  );

  // ── 对齐诊断：偏差最大的音符 ────────────────────────────────────────────
  const worstOffsets = useMemo(() => {
    if (onsets.length === 0) return [];
    return notes
      .map((n) => {
        let best = onsets[0];
        let bestDelta = Math.abs(n.timestampSec - best);
        for (const t of onsets) {
          const d = Math.abs(n.timestampSec - t);
          if (d < bestDelta) {
            best = t;
            bestDelta = d;
          }
        }
        return { note: n, deltaMs: Math.round((n.timestampSec - best) * 1000) };
      })
      .filter((x) => Math.abs(x.deltaMs) > 60)
      .sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs))
      .slice(0, 8);
  }, [notes, onsets]);

  const statChip = (label: string, value: string, tone = 'slate') => {
    const toneCls: Record<string, string> = {
      slate: isDark ? 'text-slate-300' : 'text-slate-700',
      amber: 'text-amber-400',
      rose: 'text-rose-400',
      emerald: 'text-emerald-400',
    };
    return (
      <div
        className={`px-2 py-1 rounded-lg border text-[10px] font-mono ${
          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-slate-500">{label} </span>
        <span className={`font-bold ${toneCls[tone]}`}>{value}</span>
      </div>
    );
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all flex flex-col gap-3 ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* ── 头部 ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold tracking-wide uppercase text-amber-500">
            六线谱编辑器 · 节点级校正
          </span>
          <span className="text-[11px] text-slate-400">
            拖拽移动 / 边缘改时值 / 双击新建 / Alt 复制 / 右键菜单
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode('solo')}
            className={toolBtn(isDark, mode === 'solo')}
            title="SOLO 模式：逐音精修（旋律 / 双音）"
          >
            SOLO 编辑
          </button>
          <button
            onClick={() => setMode('strum')}
            className={toolBtn(isDark, mode === 'strum')}
            title="扫弦模式：和弦轨 + 扫弦轨 → 合成六线谱"
          >
            扫弦模式
          </button>
        </div>
      </div>

      {/* ── 工具条 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">网格</span>
        <select
          value={grid}
          onChange={(e) => setGrid(e.target.value)}
          className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono ${
            isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
          }`}
        >
          {GRID_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSnapEnabled((v) => !v)}
          className={toolBtn(isDark, snapEnabled)}
          title="拖拽 / 方向键是否吸附到网格"
        >
          吸附 {snapEnabled ? 'ON' : 'OFF'}
        </button>

        <span className="w-px h-5 bg-slate-700/50 mx-0.5" />

        <button onClick={() => setShowGrid((v) => !v)} className={toolBtn(isDark, showGrid)} title="显示/隐藏网格线">
          <Grid3x3 className="w-3.5 h-3.5" />
          网格
        </button>
        <button onClick={() => setShowOnsets((v) => !v)} className={toolBtn(isDark, showOnsets)} title="显示/隐藏起音点检测线">
          <Sparkles className="w-3.5 h-3.5" />
          起音线 ({onsets.length})
        </button>
        <button onClick={() => setShowRhythm((v) => !v)} className={toolBtn(isDark, showRhythm)} title="显示/隐藏节奏符干与符尾">
          节奏行
        </button>

        <span className="w-px h-5 bg-slate-700/50 mx-0.5" />

        <button onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))} className={toolBtn(isDark)}>
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] font-mono text-slate-400 w-9 text-center">{zoom.toFixed(2)}x</span>
        <button onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))} className={toolBtn(isDark)}>
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <span className="w-px h-5 bg-slate-700/50 mx-0.5" />

        <button
          onClick={history.undo}
          disabled={!history.canUndo}
          className={`${toolBtn(isDark)} disabled:opacity-40`}
          title={history.undoLabel ? `撤销：${history.undoLabel}` : '没有可撤销的操作'}
        >
          <Undo2 className="w-3.5 h-3.5" />
          撤销{history.canUndo ? ` (${history.depth})` : ''}
        </button>
        <button
          onClick={history.redo}
          disabled={!history.canRedo}
          className={`${toolBtn(isDark)} disabled:opacity-40`}
          title={history.redoLabel ? `重做：${history.redoLabel}` : '没有可重做的操作'}
        >
          <Redo2 className="w-3.5 h-3.5" />
          重做
        </button>
      </div>

      {/* ── 对齐与批量工具条 ── */}
      <div
        className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${
          isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">对齐</span>
        <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
          起音灵敏度
          <input
            type="range"
            min={0.2}
            max={1.5}
            step={0.05}
            value={onsetSensitivity}
            onChange={(e) => setOnsetSensitivity(parseFloat(e.target.value))}
            className="w-20 accent-sky-400"
            title="阈值 = max(0.12, 均值 + 灵敏度 × 标准差)。越大越严格，检测出的起音点越少。"
          />
          <span className="font-mono text-sky-400 w-8 text-right">{onsetSensitivity.toFixed(2)}</span>
        </label>

        <button onClick={() => quantize('selected')} className={toolBtn(isDark)} title="把选中音符量化到当前网格（Q）">
          <Scissors className="w-3.5 h-3.5" />
          量化选中
        </button>
        <button onClick={() => quantize('all')} className={toolBtn(isDark)} title="把全部音符量化到当前网格">
          量化全部
        </button>
        <button onClick={() => snapToOnset('selected')} className={toolBtn(isDark)} title="把选中音符吸附到最近的起音点">
          选中→起音点
        </button>
        <button onClick={() => snapToOnset('all')} className={toolBtn(isDark)} title="把全部音符吸附到最近的起音点（修正系统性偏移）">
          <BadgeCheck className="w-3.5 h-3.5" />
          全部→起音点
        </button>

        <span className="w-px h-5 bg-slate-700/50 mx-0.5" />

        <button onClick={() => batchShift(-stepSec)} className={toolBtn(isDark)} title="选中音符整体左移一个网格步长">
          <ArrowLeftRight className="w-3.5 h-3.5" />← 网格
        </button>
        <button onClick={() => batchShift(stepSec)} className={toolBtn(isDark)} title="选中音符整体右移一个网格步长">
          网格 →
        </button>
        <button onClick={() => batchShift(-0.01)} className={toolBtn(isDark)} title="选中音符整体左移 10ms（突破网格）">
          −10ms
        </button>
        <button onClick={() => batchShift(0.01)} className={toolBtn(isDark)} title="选中音符整体右移 10ms（突破网格）">
          +10ms
        </button>

        <span className="w-px h-5 bg-slate-700/50 mx-0.5" />

        <button onClick={() => jumpLowConfidence(-1)} className={toolBtn(isDark)} title="上一个低置信度音符">
          ⚠ 上一个
        </button>
        <button onClick={() => jumpLowConfidence(1)} className={toolBtn(isDark)} title="下一个低置信度音符（N）">
          ⚠ 下一个 ({stats.lowConfidenceCount})
        </button>
        <button onClick={markAllConfirmed} className={toolBtn(isDark)} title="把所有低置信度音符一次性标记为已确认">
          <BadgeCheck className="w-3.5 h-3.5" />
          全部确认
        </button>
        <button onClick={regenerateMeasures} className={toolBtn(isDark)} title="按 BPM / 拍号重新生成小节线（等同音频上传时的自动生成）">
          <Eraser className="w-3.5 h-3.5" />
          重排小节线
        </button>

        <label className="flex items-center gap-1.5 text-[10px] text-slate-500 ml-auto">
          新建音符默认品位
          <input
            type="number"
            min={0}
            max={24}
            value={defaultFret}
            onChange={(e) => setDefaultFret(Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0)))}
            className={`w-14 px-1.5 py-1 rounded border font-mono text-[11px] ${
              isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300'
            }`}
          />
        </label>
      </div>

      {/* ── 主区域：谱面 + 右侧面板 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 space-y-3 min-w-0">
          <TabEditorCanvas
            notes={notes}
            measureTimestamps={config.measureTimestamps}
            durationSec={durationSec}
            bpm={bpm}
            timeSignature={timeSignatureLabel}
            grid={grid}
            snapEnabled={snapEnabled}
            isDark={isDark}
            zoom={zoom}
            playheadSec={playheadSec}
            isPlaying={isPlaying}
            selectedIds={selectedIds}
            onsetTimes={showOnsets ? onsets : []}
            showGrid={showGrid}
            showOnsets={showOnsets}
            showRhythm={showRhythm}
            defaultFret={defaultFret}
            onSelectionChange={setSelectedIds}
            onCommitNotes={commitNotes}
            onSeek={onSeek}
            onPluck={onPluck}
            onUndo={history.undo}
            onRedo={history.redo}
            onToast={onToast}
            onKeyboardFocusChange={handleKbFocusChange}
            onViewToggle={handleViewToggle}
          />

          {/* 对齐诊断 */}
          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                对齐诊断（相对最近起音点的偏差）
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {statChip('音符', String(stats.noteCount))}
                {statChip('小节', String(stats.measureCount))}
                {statChip('低置信度', String(stats.lowConfidenceCount), stats.lowConfidenceCount > 0 ? 'amber' : 'emerald')}
                {statChip('离网格 >25ms', String(stats.offGridCount), stats.offGridCount > 0 ? 'amber' : 'emerald')}
                {statChip(
                  '偏差均值',
                  stats.meanAbsOffsetMs === null ? '—' : `${stats.meanAbsOffsetMs}ms`,
                  'slate',
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              起音点由能量波形**插值估计**得出（不是真值），仅用于提示「音符是否大致落在发音点上」
              {onsetResolutionSec > 0
                ? ` · 当前粒度：${detectionPeaks.length} 点 均分 ${durationSec.toFixed(1)}s ≈ ±${(onsetResolutionSec / 2).toFixed(2)}s`
                : ' · 尚未载入波形'}
              。偏差为「音符时间 − 最近起音点时间」，正数表示音符偏晚。
            </p>

            {worstOffsets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {worstOffsets.map(({ note, deltaMs }) => (
                  <button
                    key={note.id}
                    onClick={() => {
                      setSelectedIds([note.id]);
                      onSeek(note.timestampSec);
                      onPluck(note);
                    }}
                    className={`px-2 py-1 rounded-lg border font-mono text-[10px] flex items-center gap-1.5 ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                    title="点击定位到该音符"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    {note.stringIndex}弦{String(note.fret)}品
                    <span className={Math.abs(deltaMs) > 120 ? 'text-rose-400 font-bold' : 'text-amber-400'}>
                      {deltaMs > 0 ? '+' : ''}
                      {deltaMs}ms
                    </span>
                    <span className="text-slate-500">@{note.timestampSec.toFixed(2)}s</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[10px] text-emerald-400">
                {onsets.length === 0
                  ? '尚未检测到起音点（上方「音频直传」或「示范原声伴奏」后可启用）'
                  : '✅ 所有音符与最近起音点的偏差都在 60ms 以内'}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：属性面板 / 扫弦面板 */}
        <div className="space-y-3 min-w-0">
          {mode === 'strum' ? (
            <StrumPatternPanel
              value={strum}
              onChange={(next, label) => commitStrum(next, label, 'strum-edit')}
              isDark={isDark}
              beatsPerMeasure={beatsPerMeasure}
              measureCount={config.measureTimestamps.length}
              onApply={applyStrum}
              onReverse={reverseStrum}
            />
          ) : null}

          <TabInspectorPanel
            selected={selectedNotes}
            measureTimestamps={config.measureTimestamps}
            bpm={bpm}
            durationSec={durationSec}
            isDark={isDark}
            onChange={handleInspectorChange}
            onDelete={() => commitNotes(notes.filter((n) => !selectedIds.includes(n.id)), '删除选中音符')}
            onDuplicateNextBeat={() => {
              const set = new Set(selectedIds);
              if (set.size === 0) return;
              const copies = notes
                .filter((n) => set.has(n.id))
                .map((n) => ({ ...n, id: `${n.id}_cp_${Math.random().toString(36).slice(2, 6)}`, timestampSec: roundSec(n.timestampSec + beatSec) }));
              commitNotes([...notes, ...copies], '复制到下一拍');
              setSelectedIds(copies.map((c) => c.id));
            }}
          />

          {/* 当前节奏型速览（扫弦模式下也随时可见） */}
          {mode === 'strum' && (
            <div
              className={`p-3 rounded-xl border text-[10px] font-mono ${
                isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="text-slate-500 mb-1">节奏型速览（{strum.grid}）</div>
              <div className="flex flex-wrap gap-1">
                {strum.pattern.map((c, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.5 rounded border ${
                      c === '·' ? 'opacity-50' : ''
                    } ${
                      c === '↓'
                        ? 'text-emerald-300 border-emerald-500/40'
                        : c === '↑'
                          ? 'text-sky-300 border-sky-500/40'
                          : c === '×'
                            ? 'text-rose-300 border-rose-500/40'
                            : 'text-slate-500 border-slate-600/40'
                    }`}
                    title={STRUM_CELL_LABEL[c]}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-1">
                和弦 {strum.chordName || '—'} · 扫 {strum.strings.length} 弦 · 力度 {strum.velocity}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TabEditorPanel;
