import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabNote } from '../../../types';
import { getConfidenceColor } from './NoteOverlay';
import {
  TECHNIQUE_GLYPH,
  beatSecOf,
  findMeasureIndexAt,
  gridStepSec,
  isMutedFret,
  makeNoteId,
  nextLowConfidence,
  noteToMidi,
  numericFretOf,
  roundSec,
  snapSecToGrid,
  sortNotes,
  withMeasureIndex,
} from './tabEditorModel';

/**
 * 六线谱交互画布（TabEditorCanvas）
 * =================================
 *
 * 「音频与六线谱对齐」页面里新增的**节点级编辑器**渲染层。
 *
 * 视觉语言刻意沿用既有六线谱预览（`TabRenderer`）：TAB 谱号、6 根等距弦线
 * （第 6 弦更粗）、拍线、小节线、音符圆角方框 + 品位数字、小节号在左上角。
 * 在此基础上按规格文档加强：
 * - 点选 / Shift 加选 / Ctrl 减选 / 空白框选
 * - 拖拽移动（水平改时间、垂直改弦，自动吸附网格）
 * - 拖拽左右边缘改时值 / 起点（左边缘保持尾端不动）
 * - Alt + 拖拽 = 复制
 * - 双击空白 = 在该时间 / 该弦新建音符
 * - 右键 = 快捷菜单（删除 / 闷音 / 确认置信度 / 定位播放头）
 * - 网格线、起音点线、节奏符干与符尾（可分别开关）
 * - 播放头 + 播放时自动跟随滚动
 * - 键盘：Delete / Esc / ↑↓ 换弦 / ←→ 按网格移动 / Alt+↑↓ 改品 / 0-9 设品 /
 *   X 闷音 / Q 量化 / N 下一个低置信度 / Ctrl+D 复制到下一拍 / Ctrl+Z 撤销
 *
 * ⚠️ 交互约定（规格文档 §6.4）：拖拽过程中**不修改文档**，只更新 ghost 层；
 * `pointerup` 时才提交一次事务，保证撤销栈干净。
 *
 * ⚠️ 键盘焦点：监听挂在 window 上，但只有在「最近一次指针按下发生在画布内」时才生效
 * （`kbActive`）。这样既不会与页面已有的「空格 = 播放 / A-B 打点」全局快捷键打架，
 * 也不依赖外层 div 能否被 focus。
 */

export interface TabEditorCanvasProps {
  notes: TabNote[];
  measureTimestamps: number[];
  durationSec: number;
  bpm?: number;
  timeSignature?: string;
  grid: string;
  snapEnabled: boolean;
  isDark: boolean;
  zoom: number;
  playheadSec: number;
  isPlaying: boolean;
  selectedIds: string[];
  onsetTimes?: number[];
  showGrid?: boolean;
  showOnsets?: boolean;
  showRhythm?: boolean;
  /** 双击新建音符时使用的默认品位 */
  defaultFret?: number;
  onSelectionChange: (ids: string[]) => void;
  onCommitNotes: (next: TabNote[], label: string) => void;
  onSeek: (sec: number) => void;
  onPluck: (note: TabNote) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToast?: (msg: string) => void;
  /** 画布获得/失去键盘焦点（供外层做 Tab 切换模式等「仅在编辑器内生效」的快捷键） */
  onKeyboardFocusChange?: (active: boolean) => void;
  /** 视图开关快捷键（G 网格 / S 起音线 / R 节奏行） */
  onViewToggle?: (what: 'grid' | 'onsets' | 'rhythm') => void;
}

// ── 版面常量（与 TabRenderer 同风格：谱号左侧留白、弦线等距） ──────────────
const PAD_LEFT = 68;
const PAD_RIGHT = 36;
const STAFF_TOP = 64;
const LINE_GAP = 20;
const STAFF_BOTTOM = STAFF_TOP + LINE_GAP * 5; // 164
const CHORD_ROW_Y = 30;
const MEASURE_LABEL_Y = 15;
const RHYTHM_BASE = STAFF_BOTTOM + 26; // 190
const CANVAS_HEIGHT = 236;
const NOTE_W = 22;
const NOTE_H = 18;
const EDGE_HIT = 7;
const MIN_DURATION = 0.05;
const MOVE_THRESHOLD_PX = 3;
const PX_PER_SEC_BASE = 78;

const STRING_LABELS: Array<{ s: number; label: string }> = [
  { s: 1, label: 'e 1' },
  { s: 2, label: 'B 2' },
  { s: 3, label: 'G 3' },
  { s: 4, label: 'D 4' },
  { s: 5, label: 'A 5' },
  { s: 6, label: 'E 6' },
];

type DragKind = 'move' | 'resize-left' | 'resize-right';

interface DragOrigin {
  id: string;
  timestampSec: number;
  stringIndex: number;
  durationSec: number;
}

interface DragState {
  kind: DragKind;
  startClientX: number;
  startClientY: number;
  deltaSec: number;
  deltaString: number;
  moved: boolean;
  /** Alt 拖拽 = 复制（原音符保留，松手时在 ghost 位置生成副本） */
  duplicate: boolean;
  additive: boolean;
  toggle: boolean;
  clickedId: string;
  origins: DragOrigin[];
}

interface MarqueeState {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
  moved: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  noteId: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 编辑器「认领」的按键（不区分大小写地走 Ctrl/Cmd 的另列在下面）。
 *
 * ⚠️ 为什么需要这份清单：页面上「音频与六线谱对齐」已经有一个挂在 **window** 上的
 * 全局快捷键（空格 = 播放、a/b = 设置 A-B 循环）。如果不做处理，在编辑器里按 Ctrl+A
 * 会**同时**触发「设置 A 点循环起点」（因为那一处只判断了 `e.key === 'a'`，没看修饰键）。
 * 因此这里在**捕获阶段**拦截这些按键并 `stopPropagation()`，
 * 只影响「焦点在编辑器内」这一段状态；空格 / 单独 a / 单独 b 不在清单里，全局行为完全保留。
 */
const OWNED_KEYS = new Set([
  'Delete', 'Backspace', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ',', '.',
  'q', 'Q', 'x', 'X', 'n', 'N', 'g', 'G', 's', 'S', 'r', 'R',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

/** 带 Ctrl/Cmd 才算认领的按键 */
const OWNED_KEYS_WITH_MOD = new Set(['z', 'Z', 'y', 'Y', 'd', 'D', 'a', 'A']);

export const TabEditorCanvas: React.FC<TabEditorCanvasProps> = ({
  notes,
  measureTimestamps,
  durationSec,
  bpm,
  timeSignature = '4/4',
  grid,
  snapEnabled,
  isDark,
  zoom,
  playheadSec,
  isPlaying,
  selectedIds,
  onsetTimes = [],
  showGrid = true,
  showOnsets = true,
  showRhythm = true,
  defaultFret = 0,
  onSelectionChange,
  onCommitNotes,
  onSeek,
  onPluck,
  onUndo,
  onRedo,
  onToast,
  onKeyboardFocusChange,
  onViewToggle,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [kbActive, setKbActive] = useState(false);

  const safeDuration = durationSec > 0 ? durationSec : 1;
  const canvasWidth = Math.max(1240, Math.round(safeDuration * PX_PER_SEC_BASE * zoom));
  const innerWidth = canvasWidth - PAD_LEFT - PAD_RIGHT;
  const beatSec = beatSecOf(bpm);
  const stepSec = gridStepSec(grid, bpm);
  const [beatsPerBar] = timeSignature.split('/').map((v) => parseInt(v, 10));

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ── 坐标映射（唯一口径：x = padLeft + t/duration × innerWidth） ──────────
  const timeToX = useCallback(
    (t: number) => PAD_LEFT + (clamp(t, 0, safeDuration) / safeDuration) * innerWidth,
    [innerWidth, safeDuration],
  );
  const xToTime = useCallback(
    (x: number) => clamp(((x - PAD_LEFT) / innerWidth) * safeDuration, 0, safeDuration),
    [innerWidth, safeDuration],
  );
  const stringToY = useCallback((s: number) => STAFF_TOP + (clamp(s, 1, 6) - 1) * LINE_GAP, []);
  const yToString = useCallback(
    (y: number) => clamp(Math.round((y - STAFF_TOP) / LINE_GAP) + 1, 1, 6),
    [],
  );

  const localPoint = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── 播放头自动跟随（超出视口 70% 时滚动） ────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, timeToX(playheadSec) - el.clientWidth * 0.7);
  }, [isPlaying, playheadSec, timeToX]);

  // ── 键盘焦点：只在最近一次指针落在画布内时启用 ───────────────────────────
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = wrapRef.current;
      setKbActive(!!el && e.target instanceof Node && el.contains(e.target));
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  useEffect(() => {
    onKeyboardFocusChange?.(kbActive);
  }, [kbActive, onKeyboardFocusChange]);

  /** 对选中音符做一次变换并提交（统一入口，保证排序 / 小节归属 / 历史一致） */
  const applyToSelected = useCallback(
    (fn: (n: TabNote) => TabNote, label: string) => {
      if (selectedIds.length === 0) return false;
      const set = new Set(selectedIds);
      const next = notes.map((n) => (set.has(n.id) ? fn(n) : n));
      onCommitNotes(withMeasureIndex(sortNotes(next), measureTimestamps), label);
      return true;
    },
    [notes, selectedIds, measureTimestamps, onCommitNotes],
  );

  const setFretOnSelected = useCallback(
    (fret: number | 'X', label?: string) => {
      const applied = applyToSelected(
        (n) => ({
          ...n,
          fret,
          technique: fret === 'X' ? 'palm-mute' : n.technique === 'palm-mute' ? 'normal' : n.technique,
          pitch: fret === 'X' ? 0 : noteToMidi(n.stringIndex, fret),
        }),
        label ?? (fret === 'X' ? '设为闷音' : `设置品位 ${fret}`),
      );
      if (applied && fret !== 'X') {
        const first = notes.find((n) => selectedSet.has(n.id));
        if (first) onPluck({ ...first, fret });
      }
    },
    [applyToSelected, notes, selectedSet, onPluck],
  );

  const shiftStringOnSelected = useCallback(
    (delta: number) =>
      applyToSelected((n) => {
        const stringIndex = clamp(n.stringIndex + delta, 1, 6);
        return {
          ...n,
          stringIndex,
          pitch: isMutedFret(n.fret) ? 0 : noteToMidi(stringIndex, n.fret),
        };
      }, delta > 0 ? '下移一根弦' : '上移一根弦'),
    [applyToSelected],
  );

  const nudgeSelected = useCallback(
    (deltaSec: number) =>
      applyToSelected(
        (n) => ({ ...n, timestampSec: roundSec(clamp(n.timestampSec + deltaSec, 0, safeDuration)) }),
        deltaSec >= 0 ? '向右移动' : '向左移动',
      ),
    [applyToSelected, safeDuration],
  );

  const quantizeSelected = useCallback(
    () =>
      applyToSelected(
        (n) => ({ ...n, timestampSec: roundSec(snapSecToGrid(n.timestampSec, grid, bpm, true)) }),
        '量化到网格',
      ),
    [applyToSelected, grid, bpm],
  );

  const deleteSelected = useCallback(() => {
    const set = new Set(selectedIds);
    if (set.size === 0) return;
    onCommitNotes(
      notes.filter((n) => !set.has(n.id)),
      `删除 ${set.size} 个音符`,
    );
    onSelectionChange([]);
    onToast?.(`已删除 ${set.size} 个音符`);
  }, [selectedIds, notes, onCommitNotes, onSelectionChange, onToast]);

  const duplicateToNextBeat = useCallback(() => {
    const ids = new Set(selectedIds);
    if (ids.size === 0) return;
    const copies = notes
      .filter((n) => ids.has(n.id))
      .map((n) => ({
        ...n,
        id: makeNoteId('cp'),
        timestampSec: roundSec(clamp(n.timestampSec + beatSec, 0, safeDuration)),
      }));
    onCommitNotes(
      withMeasureIndex(sortNotes([...notes, ...copies]), measureTimestamps),
      '复制到下一拍',
    );
    onSelectionChange(copies.map((c) => c.id));
  }, [selectedIds, notes, safeDuration, beatSec, measureTimestamps, onCommitNotes, onSelectionChange]);

  const jumpLowConfidence = useCallback(
    (dir: 1 | -1) => {
      const found = nextLowConfidence(notes, playheadSec, dir, 0.8);
      if (!found) {
        onToast?.('没有待复核的低置信度音符了');
        return;
      }
      onSelectionChange([found.id]);
      onSeek(found.timestampSec);
      onPluck(found);
      onToast?.(
        `⚠ 待复核：${found.stringIndex} 弦 ${String(found.fret)} 品 @ ${found.timestampSec.toFixed(2)}s（置信度 ${(
          (found.confidence ?? 1) * 100
        ).toFixed(0)}%）`,
      );
    },
    [notes, playheadSec, onSelectionChange, onSeek, onPluck, onToast],
  );

  // ── 键盘监听 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!kbActive) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const mod = e.ctrlKey || e.metaKey;

      // 只处理「编辑器认领」的按键；其余放行（空格 / a / b 仍是页面全局快捷键）
      const owned = mod ? OWNED_KEYS_WITH_MOD.has(e.key) : OWNED_KEYS.has(e.key);
      if (!owned) return;
      // 捕获阶段：先于页面挂在 window 上的全局快捷键执行，并阻止其响应同一个按键
      e.stopPropagation();

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        onRedo?.();
        return;
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateToNextBeat();
        return;
      }
      if (mod && (e.key === 'a' || e.key === 'A')) {
        // 全选当前小节（规格文档 §11「Ctrl+A 全选当前小节」）
        e.preventDefault();
        const idx = measureTimestamps.filter((t) => t <= playheadSec + 1e-6).length - 1;
        const inMeasure = notes
          .filter((n) => findMeasureIndexAt(n.timestampSec, measureTimestamps) === Math.max(0, idx))
          .map((n) => n.id);
        onSelectionChange(inMeasure);
        onToast?.(`已选中第 ${Math.max(1, idx + 1)} 小节的 ${inMeasure.length} 个音符`);
        return;
      }
      if (mod) return; // 其余组合键交给浏览器

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          deleteSelected();
          return;
        case 'Escape':
          onSelectionChange([]);
          return;
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const dir = e.key === 'ArrowUp' ? -1 : 1;
          if (e.altKey) {
            const first = notes.find((n) => selectedSet.has(n.id));
            setFretOnSelected(clamp(numericFretOf(first?.fret ?? 0) + dir, 0, 24));
          } else {
            shiftStringOnSelected(dir);
          }
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          nudgeSelected(dir * (e.shiftKey ? beatSec : stepSec));
          return;
        }
        case ',':
          e.preventDefault();
          nudgeSelected(-0.01);
          return;
        case '.':
          e.preventDefault();
          nudgeSelected(0.01);
          return;
        case 'q':
        case 'Q':
          e.preventDefault();
          quantizeSelected();
          return;
        case 'x':
        case 'X':
          e.preventDefault();
          setFretOnSelected('X');
          return;
        case 'n':
        case 'N':
          e.preventDefault();
          jumpLowConfidence(e.shiftKey ? -1 : 1);
          return;
        case 'g':
        case 'G':
          e.preventDefault();
          onViewToggle?.('grid');
          return;
        case 's':
        case 'S':
          e.preventDefault();
          onViewToggle?.('onsets');
          return;
        case 'r':
        case 'R':
          e.preventDefault();
          onViewToggle?.('rhythm');
          return;
        default:
          break;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setFretOnSelected(parseInt(e.key, 10));
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    kbActive,
    notes,
    selectedSet,
    beatSec,
    stepSec,
    playheadSec,
    measureTimestamps,
    onUndo,
    onRedo,
    deleteSelected,
    duplicateToNextBeat,
    nudgeSelected,
    quantizeSelected,
    setFretOnSelected,
    shiftStringOnSelected,
    jumpLowConfidence,
    onSelectionChange,
    onViewToggle,
    onToast,
  ]);

  // ── 交互：拖拽 / 框选 ────────────────────────────────────────────────────
  const beginNoteDrag = (e: React.PointerEvent, note: TabNote) => {
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    const { x } = localPoint(e.clientX, e.clientY);
    const noteX = timeToX(note.timestampSec);
    let kind: DragKind = 'move';
    if (x <= noteX - NOTE_W / 2 + EDGE_HIT) kind = 'resize-left';
    else if (x >= noteX + NOTE_W / 2 - EDGE_HIT) kind = 'resize-right';

    const alreadySelected = selectedSet.has(note.id);
    const additive = e.shiftKey;
    const toggle = e.ctrlKey || e.metaKey;

    const groupIds = alreadySelected
      ? selectedIds
      : additive || toggle
        ? [...selectedIds, note.id]
        : [note.id];

    const origins: DragOrigin[] = groupIds
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is TabNote => !!n)
      .map((n) => ({
        id: n.id,
        timestampSec: n.timestampSec,
        stringIndex: n.stringIndex,
        durationSec: n.durationSec,
      }));

    const state: DragState = {
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      deltaSec: 0,
      deltaString: 0,
      moved: false,
      duplicate: e.altKey,
      additive,
      toggle,
      clickedId: note.id,
      origins,
    };
    dragRef.current = state;
    setDrag({ ...state });
  };

  const beginBackground = (e: React.PointerEvent) => {
    setMenu(null);
    const { x, y } = localPoint(e.clientX, e.clientY);
    const state: MarqueeState = { x0: x, y0: y, x1: x, y1: y, additive: e.shiftKey, moved: false };
    marqueeRef.current = state;
    setMarquee({ ...state });
  };

  /** 把一个音符按拖拽量算出结果 */
  const computeDragged = useCallback(
    (o: DragOrigin, d: DragState, asCopy: boolean): TabNote => {
      const source = notes.find((n) => n.id === o.id);
      const base: TabNote =
        source ??
        ({
          id: o.id,
          measureIndex: 0,
          stringIndex: o.stringIndex,
          fret: defaultFret,
          timestampSec: o.timestampSec,
          durationSec: o.durationSec,
        } as TabNote);

      if (d.kind === 'move') {
        const stringIndex = clamp(o.stringIndex + d.deltaString, 1, 6);
        return {
          ...base,
          id: asCopy ? makeNoteId('cp') : base.id,
          timestampSec: roundSec(clamp(o.timestampSec + d.deltaSec, 0, safeDuration)),
          stringIndex,
          pitch: isMutedFret(base.fret) ? 0 : noteToMidi(stringIndex, base.fret),
        };
      }
      if (d.kind === 'resize-right') {
        const rawDuration = o.durationSec + d.deltaSec;
        const snapped = snapEnabled ? Math.round(rawDuration / stepSec) * stepSec : rawDuration;
        const bounded = clamp(snapped, MIN_DURATION, Math.max(MIN_DURATION, safeDuration - o.timestampSec));
        return { ...base, id: asCopy ? makeNoteId('cp') : base.id, durationSec: roundSec(bounded) };
      }
      // resize-left：保持尾端不动
      const end = o.timestampSec + o.durationSec;
      const newStart = clamp(o.timestampSec + d.deltaSec, 0, Math.max(0, end - MIN_DURATION));
      return {
        ...base,
        id: asCopy ? makeNoteId('cp') : base.id,
        timestampSec: roundSec(newStart),
        durationSec: roundSec(Math.max(MIN_DURATION, end - newStart)),
      };
    },
    [notes, safeDuration, snapEnabled, stepSec, defaultFret],
  );

  const finalizeDrag = useCallback(
    (d: DragState) => {
      // 未移动 = 点选（含 Shift 加选 / Ctrl 减选），并试听该音符
      if (!d.moved) {
        let nextSelection: string[];
        if (d.additive) {
          nextSelection = selectedSet.has(d.clickedId) ? selectedIds : [...selectedIds, d.clickedId];
        } else if (d.toggle) {
          nextSelection = selectedSet.has(d.clickedId)
            ? selectedIds.filter((id) => id !== d.clickedId)
            : [...selectedIds, d.clickedId];
        } else {
          nextSelection = [d.clickedId];
        }
        onSelectionChange(nextSelection);
        const note = notes.find((n) => n.id === d.clickedId);
        if (note) {
          onSeek(note.timestampSec);
          onPluck(note);
        }
        return;
      }

      const label = d.duplicate ? '复制音符' : d.kind === 'move' ? '移动音符' : '修改时值';
      if (d.duplicate) {
        const copies = d.origins.map((o) => computeDragged(o, d, true));
        onCommitNotes(withMeasureIndex(sortNotes([...notes, ...copies]), measureTimestamps), label);
        onSelectionChange(copies.map((c) => c.id));
        return;
      }
      const byOrigin = new Map(d.origins.map((o) => [o.id, o]));
      const next = notes.map((n) => {
        const o = byOrigin.get(n.id);
        return o ? computeDragged(o, d, false) : n;
      });
      onCommitNotes(withMeasureIndex(sortNotes(next), measureTimestamps), label);
    },
    [selectedSet, selectedIds, notes, onSelectionChange, onSeek, onPluck, computeDragged, measureTimestamps, onCommitNotes],
  );

  const finalizeMarquee = useCallback(
    (m: MarqueeState) => {
      if (!m.moved) {
        if (!m.additive) onSelectionChange([]);
        onSeek(roundSec(xToTime(m.x1)));
        return;
      }
      const x0 = Math.min(m.x0, m.x1);
      const x1 = Math.max(m.x0, m.x1);
      const y0 = Math.min(m.y0, m.y1);
      const y1 = Math.max(m.y0, m.y1);
      const hits = notes
        .filter((n) => {
          const nx = timeToX(n.timestampSec);
          const ny = stringToY(n.stringIndex);
          return nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1;
        })
        .map((n) => n.id);
      onSelectionChange(m.additive ? [...new Set([...selectedIds, ...hits])] : hits);
    },
    [notes, selectedIds, timeToX, stringToY, xToTime, onSelectionChange, onSeek],
  );

  const active = !!drag || !!marquee;

  useEffect(() => {
    if (!active) return;

    const handleMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const dx = e.clientX - d.startClientX;
        const dy = e.clientY - d.startClientY;
        const rawDeltaSec = (dx / innerWidth) * safeDuration;
        d.deltaSec = snapEnabled ? Math.round(rawDeltaSec / stepSec) * stepSec : rawDeltaSec;
        d.deltaString = Math.round(dy / LINE_GAP);
        if (!d.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) d.moved = true;
        setDrag({ ...d });
        return;
      }
      const m = marqueeRef.current;
      if (m) {
        const p = localPoint(e.clientX, e.clientY);
        m.x1 = p.x;
        m.y1 = p.y;
        if (!m.moved && Math.hypot(m.x1 - m.x0, m.y1 - m.y0) > MOVE_THRESHOLD_PX) m.moved = true;
        setMarquee({ ...m });
      }
    };

    const handleUp = () => {
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setDrag(null);
        finalizeDrag(d);
        return;
      }
      const m = marqueeRef.current;
      if (m) {
        marqueeRef.current = null;
        setMarquee(null);
        finalizeMarquee(m);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [active, snapEnabled, stepSec, innerWidth, safeDuration, localPoint, finalizeDrag, finalizeMarquee]);

  const handleDoubleClickBackground = (e: React.MouseEvent) => {
    const { x, y } = localPoint(e.clientX, e.clientY);
    const at = roundSec(snapEnabled ? snapSecToGrid(xToTime(x), grid, bpm, true) : xToTime(x));
    const stringIndex = yToString(y);
    const idx = measureTimestamps.filter((t) => t <= at + 1e-6).length - 1;
    const newNote: TabNote = {
      id: makeNoteId('n'),
      measureIndex: Math.max(0, idx),
      stringIndex,
      fret: defaultFret,
      timestampSec: at,
      durationSec: roundSec(Math.max(stepSec, MIN_DURATION)),
      technique: 'normal',
      velocity: 90,
      confidence: 1,
      pitch: noteToMidi(stringIndex, defaultFret),
    };
    onCommitNotes(withMeasureIndex(sortNotes([...notes, newNote]), measureTimestamps), '新增音符');
    onSelectionChange([newNote.id]);
    onSeek(at);
    onPluck(newNote);
    onToast?.(`已在 ${at.toFixed(2)}s 第 ${stringIndex} 弦新建音符（${defaultFret} 品）`);
  };

  const patchNote = (id: string, patch: Partial<TabNote>, label: string) => {
    const next = notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    onCommitNotes(withMeasureIndex(sortNotes(next), measureTimestamps), label);
  };

  // ── 渲染数据 ────────────────────────────────────────────────────────────
  const ghostNotes = useMemo(() => {
    if (!drag || !drag.moved) return [];
    return drag.origins.map((o) => computeDragged(o, drag, true));
  }, [drag, computeDragged]);

  const dragOriginIds = useMemo(() => new Set(drag?.origins.map((o) => o.id) ?? []), [drag]);

  const measures = useMemo(
    () =>
      measureTimestamps.map((t, i) => {
        const end = i + 1 < measureTimestamps.length ? measureTimestamps[i + 1] : safeDuration;
        return { index: i, start: t, end, duration: Math.max(0.05, end - t) };
      }),
    [measureTimestamps, safeDuration],
  );

  /** 同刻音符共用一根符干（避免和弦簇画出多条重叠竖线） */
  const rhythmStems = useMemo(() => {
    if (!showRhythm) return [];
    const map = new Map<string, { x: number; topY: number; duration: number }>();
    notes.forEach((n) => {
      const key = n.timestampSec.toFixed(3);
      const x = timeToX(n.timestampSec);
      const topY = stringToY(n.stringIndex) + NOTE_H / 2;
      const existing = map.get(key);
      if (existing) {
        existing.topY = Math.min(existing.topY, topY);
        existing.duration = Math.max(existing.duration, n.durationSec);
      } else {
        map.set(key, { x, topY, duration: n.durationSec });
      }
    });
    return [...map.values()];
  }, [notes, showRhythm, timeToX, stringToY]);

  const flagCount = (duration: number): number => {
    const beats = duration / beatSec;
    if (beats >= 0.99) return 0;
    if (beats >= 0.49) return 1;
    if (beats >= 0.24) return 2;
    return 3;
  };

  const lineColor = isDark ? '#3f3f46' : '#cbd5e1';
  const strongLineColor = isDark ? '#52525b' : '#94a3b8';
  const beatLineColor = isDark ? '#27272a' : '#e2e8f0';
  const gridColor = isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.12)';
  const onsetColor = isDark ? 'rgba(56,189,248,0.55)' : 'rgba(2,132,199,0.55)';
  const textMuted = isDark ? '#71717a' : '#94a3b8';
  const playheadX = timeToX(playheadSec);
  /**
   * 网格线数量上限：长音频 + 细网格会画出上千条线，
   * 叠加在 60 FPS 重渲染上会明显掉帧 → 超限时自动不画（并在 UI 上说明原因）。
   */
  const GRID_LINE_LIMIT = 400;
  const gridLineCountRaw = Math.floor(safeDuration / Math.max(1e-6, stepSec)) + 1;
  const gridLineCount = Math.min(GRID_LINE_LIMIT, gridLineCountRaw);
  const gridSuppressed = gridLineCountRaw > GRID_LINE_LIMIT;

  return (
    <div className={`relative rounded-xl ${kbActive ? 'ring-1 ring-sky-500/40' : ''}`} ref={wrapRef}>
      <div
        ref={scrollRef}
        className={`rounded-xl border overflow-x-auto custom-scrollbar ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-300'
        }`}
      >
        <svg
          ref={svgRef}
          width={canvasWidth}
          height={CANVAS_HEIGHT}
          viewBox={`0 0 ${canvasWidth} ${CANVAS_HEIGHT}`}
          className="block select-none"
          style={{ touchAction: 'none' }}
        >
          {/* 底层：空白区交互（框选 / 单击定位 / 双击新建） */}
          <rect
            x={0}
            y={0}
            width={canvasWidth}
            height={CANVAS_HEIGHT}
            fill={isDark ? 'rgba(2,6,23,0.35)' : '#fbfdff'}
            onPointerDown={beginBackground}
            onDoubleClick={handleDoubleClickBackground}
          />

          {/* 网格线 */}
          {showGrid && stepSec > 0 && !gridSuppressed && (
            <g pointerEvents="none">
              {Array.from({ length: gridLineCount }).map((_, i) => {
                const x = timeToX(i * stepSec);
                return (
                  <line
                    key={`grid-${i}`}
                    x1={x}
                    y1={CHORD_ROW_Y}
                    x2={x}
                    y2={RHYTHM_BASE + 6}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}

          {/* 起音检测线（规格文档 §8.3） */}
          {showOnsets && onsetTimes.length > 0 && (
            <g pointerEvents="none">
              {onsetTimes.map((t, i) => {
                const x = timeToX(t);
                return (
                  <g key={`onset-${i}`}>
                    <line
                      x1={x}
                      y1={CHORD_ROW_Y - 6}
                      x2={x}
                      y2={RHYTHM_BASE + 6}
                      stroke={onsetColor}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <circle cx={x} cy={CHORD_ROW_Y - 9} r={2} fill={onsetColor} />
                  </g>
                );
              })}
            </g>
          )}

          {/* 谱号 + 弦名 */}
          <g pointerEvents="none">
            <text x={12} y={STAFF_TOP + 16} fill={textMuted} fontSize="15" fontFamily="monospace" fontWeight="800">
              TAB
            </text>
            {STRING_LABELS.map(({ s, label }) => (
              <text
                key={`lbl-${s}`}
                x={44}
                y={stringToY(s) + 4}
                fill={textMuted}
                fontSize="10"
                fontFamily="monospace"
                fontWeight="700"
              >
                {label}
              </text>
            ))}
          </g>

          {/* 6 根弦线（第 6 弦更粗，与 TabRenderer 一致） */}
          <g pointerEvents="none">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <line
                key={`str-${s}`}
                x1={PAD_LEFT}
                y1={stringToY(s)}
                x2={canvasWidth - PAD_RIGHT}
                y2={stringToY(s)}
                stroke={lineColor}
                strokeWidth={s === 6 ? 1.8 : s === 1 ? 1 : 1.2}
              />
            ))}
          </g>

          {/* 拍线 + 小节线 + 小节号 */}
          <g pointerEvents="none">
            {measures.map((m) => (
              <g key={`m-${m.index}`}>
                <line
                  x1={timeToX(m.start)}
                  y1={STAFF_TOP - 12}
                  x2={timeToX(m.start)}
                  y2={STAFF_BOTTOM + 12}
                  stroke={strongLineColor}
                  strokeWidth={m.index === 0 ? 2.4 : 1.8}
                />
                <text
                  x={timeToX(m.start) + 6}
                  y={MEASURE_LABEL_Y}
                  fill={textMuted}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  M{m.index + 1}
                </text>
                {beatsPerBar > 1 &&
                  Array.from({ length: beatsPerBar - 1 }).map((_, b) => {
                    const bt = m.start + (m.duration * (b + 1)) / beatsPerBar;
                    const x = timeToX(bt);
                    return (
                      <line
                        key={`b-${m.index}-${b}`}
                        x1={x}
                        y1={STAFF_TOP - 4}
                        x2={x}
                        y2={STAFF_BOTTOM + 4}
                        stroke={beatLineColor}
                        strokeWidth={1}
                      />
                    );
                  })}
              </g>
            ))}
            <line
              x1={canvasWidth - PAD_RIGHT}
              y1={STAFF_TOP - 12}
              x2={canvasWidth - PAD_RIGHT}
              y2={STAFF_BOTTOM + 12}
              stroke={strongLineColor}
              strokeWidth={2.4}
            />
          </g>

          {/* 节奏行：符干 + 符尾 */}
          {showRhythm && (
            <g pointerEvents="none">
              {rhythmStems.map((stem, i) => {
                const flags = flagCount(stem.duration);
                return (
                  <g key={`stem-${i}`}>
                    <line
                      x1={stem.x}
                      y1={stem.topY}
                      x2={stem.x}
                      y2={RHYTHM_BASE}
                      stroke={isDark ? '#a1a1aa' : '#64748b'}
                      strokeWidth={1.4}
                      opacity={0.85}
                    />
                    {Array.from({ length: flags }).map((_, f) => (
                      <line
                        key={`flag-${i}-${f}`}
                        x1={stem.x}
                        y1={RHYTHM_BASE - f * 4}
                        x2={stem.x + 7}
                        y2={RHYTHM_BASE - f * 4 + 5}
                        stroke={isDark ? '#a1a1aa' : '#64748b'}
                        strokeWidth={1.4}
                        opacity={0.85}
                      />
                    ))}
                  </g>
                );
              })}
            </g>
          )}

          {/* 音符本体 */}
          {notes.map((note) => {
            const x = timeToX(note.timestampSec);
            const y = stringToY(note.stringIndex);
            const muted = isMutedFret(note.fret);
            const selected = selectedSet.has(note.id);
            const dimmed = !!drag && drag.moved && dragOriginIds.has(note.id) && !drag.duplicate;
            const confidence = note.confidence ?? 1;
            const lowConf = confidence < 0.8;
            const stroke = selected
              ? '#4a9eff'
              : lowConf
                ? getConfidenceColor(confidence)
                : isDark
                  ? '#52525b'
                  : '#94a3b8';
            const label = muted ? '×' : String(note.fret);
            const glyph = TECHNIQUE_GLYPH[note.technique ?? 'normal'] ?? '';

            return (
              <g
                key={note.id}
                onPointerDown={(e) => beginNoteDrag(e, note)}
                onPointerEnter={() => setHoverId(note.id)}
                onPointerLeave={() => setHoverId((h) => (h === note.id ? null : h))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selectedSet.has(note.id)) onSelectionChange([note.id]);
                  setMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
                }}
                style={{ cursor: 'move' }}
                opacity={dimmed ? 0.3 : 1}
              >
                <rect
                  x={x - NOTE_W / 2 - 4}
                  y={y - NOTE_H / 2 - 4}
                  width={NOTE_W + 8}
                  height={NOTE_H + 8}
                  fill="transparent"
                />
                <rect
                  x={x - NOTE_W / 2}
                  y={y - NOTE_H / 2}
                  width={NOTE_W}
                  height={NOTE_H}
                  rx={4}
                  fill={isDark ? '#18181b' : '#ffffff'}
                  stroke={stroke}
                  strokeWidth={selected ? 2.5 : lowConf ? 2 : 1.2}
                />
                {selected && (
                  <>
                    <rect x={x - NOTE_W / 2 - 3} y={y - 4} width={3} height={8} rx={1.5} fill="#4a9eff" />
                    <rect x={x + NOTE_W / 2} y={y - 4} width={3} height={8} rx={1.5} fill="#4a9eff" />
                  </>
                )}
                <text
                  x={x}
                  y={y + 4}
                  fill={muted ? '#f87171' : isDark ? '#fafafa' : '#0f172a'}
                  fontSize={label.length > 2 ? '9' : '12'}
                  fontFamily="monospace"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {label}
                </text>
                {glyph && (
                  <text
                    x={x + NOTE_W / 2 + 3}
                    y={y + 4}
                    fill="#22d3ee"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="700"
                  >
                    {glyph}
                  </text>
                )}
                {lowConf && (
                  <circle cx={x - NOTE_W / 2} cy={y - NOTE_H / 2} r={3} fill={getConfidenceColor(confidence)} />
                )}
                {hoverId === note.id && (
                  <text
                    x={x}
                    y={y - NOTE_H / 2 - 5}
                    fill={textMuted}
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {note.timestampSec.toFixed(2)}s
                  </text>
                )}
              </g>
            );
          })}

          {/* 拖拽 ghost（不写文档，仅预览） */}
          {ghostNotes.map((g) => {
            const x = timeToX(g.timestampSec);
            const y = stringToY(g.stringIndex);
            const label = isMutedFret(g.fret) ? '×' : String(g.fret);
            return (
              <g key={`ghost-${g.id}`} pointerEvents="none" opacity={0.9}>
                <rect
                  x={x - NOTE_W / 2}
                  y={y - NOTE_H / 2}
                  width={NOTE_W}
                  height={NOTE_H}
                  rx={4}
                  fill={isDark ? 'rgba(74,158,255,0.18)' : 'rgba(74,158,255,0.15)'}
                  stroke="#4a9eff"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <text
                  x={x}
                  y={y + 4}
                  fill="#4a9eff"
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 框选矩形 */}
          {marquee && marquee.moved && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(74,158,255,0.12)"
              stroke="#4a9eff"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}

          {/* 播放头 */}
          <g pointerEvents="none">
            <line
              x1={playheadX}
              y1={CHORD_ROW_Y - 10}
              x2={playheadX}
              y2={RHYTHM_BASE + 10}
              stroke="#fbbf24"
              strokeWidth={2}
              style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.8))' }}
            />
            <circle cx={playheadX} cy={CHORD_ROW_Y - 12} r={4} fill="#fbbf24" />
          </g>
        </svg>
      </div>

      {/* 右键快捷菜单 */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className={`fixed z-50 min-w-[176px] rounded-xl border shadow-2xl py-1 text-xs ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
            }`}
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {[
              {
                label: '删除音符',
                run: () => {
                  const ids = selectedSet.has(menu.noteId) ? selectedIds : [menu.noteId];
                  const idSet = new Set(ids);
                  onCommitNotes(
                    notes.filter((n) => !idSet.has(n.id)),
                    `删除 ${ids.length} 个音符`,
                  );
                  onSelectionChange([]);
                },
              },
              {
                label: '设为闷音 (×)',
                run: () => patchNote(menu.noteId, { fret: 'X', technique: 'palm-mute' }, '设为闷音'),
              },
              {
                label: '恢复为空弦 (0)',
                run: () => patchNote(menu.noteId, { fret: 0, technique: 'normal' }, '设为空弦'),
              },
              {
                label: '标记为已确认 (100%)',
                run: () => patchNote(menu.noteId, { confidence: 1 }, '标记为已确认'),
              },
              {
                label: '把播放头定位到此音符',
                run: () => {
                  const note = notes.find((n) => n.id === menu.noteId);
                  if (note) onSeek(note.timestampSec);
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.run();
                  setMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 transition-colors ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 未聚焦提示：把「键盘已接管」这件事显式告诉用户 */}
      {!kbActive && (
        <div
          className={`pointer-events-none absolute bottom-1.5 right-2 text-[10px] font-mono ${
            isDark ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          点一下谱面即可启用键盘编辑（0-9 品格 / ←→ 移动 / Q 量化 / N 待复核）
        </div>
      )}

      {/* 网格线过多时自动不画（性能保护） */}
      {gridSuppressed && showGrid && (
        <div
          className={`pointer-events-none absolute bottom-1.5 left-2 text-[10px] font-mono ${
            isDark ? 'text-amber-500/80' : 'text-amber-600'
          }`}
        >
          网格线过多（{gridLineCountRaw} 条）已自动隐藏 · 放大或改用更粗的网格可恢复显示
        </div>
      )}
    </div>
  );
};

export default TabEditorCanvas;
