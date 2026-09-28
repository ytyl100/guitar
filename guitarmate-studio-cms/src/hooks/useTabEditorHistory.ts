import { useCallback, useRef, useState } from 'react';
import { AudioTabSyncConfig, TabNote } from '../types';

/**
 * 六线谱编辑器的撤销 / 重做栈（规格文档 §10）
 * ==========================================
 *
 * 设计要点：
 * 1. **只记录可编辑切片**（`noteTimestamps` / `measureTimestamps` / `strumConfig`），
 *    不记录整份 config。这样即使用户在页面别处（波形、发布表单）改了 BPM / 路径，
 *    撤销也不会把它一起回滚 —— 这是最容易造成「撤销把别的改动吃掉」的坑。
 * 2. 写入时使用 `configRef.current` 合并，保证拿到的是**最新**配置而不是闭包里的旧快照。
 * 3. 栈上限 200（规格文档 §14「撤销栈内存」）。
 * 4. 连续同类型微操作（按住方向键 / 拖拽微调）由调用方通过 `mergeKey` 决定是否合并，
 *    在 500ms 窗口内合并为一条历史记录。
 */

export interface TabEditPatch {
  noteTimestamps?: TabNote[];
  measureTimestamps?: number[];
  strumConfig?: AudioTabSyncConfig['strumConfig'];
}

interface HistoryEntry {
  label: string;
  /** 执行前的状态（撤销时恢复） */
  before: TabEditPatch;
  /** 执行后的状态（重做时恢复） */
  after: TabEditPatch;
  /** 合并键：相同且在窗口内 → 覆盖上一条（避免「按住方向键 20 次 = 20 条历史」） */
  mergeKey?: string;
  at: number;
}

const MAX_HISTORY = 200;
const MERGE_WINDOW_MS = 500;

export interface TabEditorHistoryApi {
  /** 提交一次编辑（会写入撤销栈） */
  applyEdits: (label: string, patch: TabEditPatch, mergeKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** 清空历史（切换曲目等场景） */
  reset: () => void;
  /** 历史深度（仅用于显示） */
  depth: number;
}

const snapshot = (config: AudioTabSyncConfig): TabEditPatch => ({
  noteTimestamps: config.noteTimestamps,
  measureTimestamps: config.measureTimestamps,
  strumConfig: config.strumConfig,
});

export const useTabEditorHistory = (
  config: AudioTabSyncConfig,
  onChangeConfig: (next: AudioTabSyncConfig) => void,
): TabEditorHistoryApi => {
  // config 每次渲染都可能是新对象 → 用 ref 拿最新值，避免闭包过期
  const configRef = useRef(config);
  configRef.current = config;

  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const [, forceRender] = useState(0);
  const bump = useCallback(() => forceRender((v) => v + 1), []);

  const applyEdits = useCallback(
    (label: string, patch: TabEditPatch, mergeKey?: string) => {
      const current = configRef.current;
      const before = snapshot(current);
      const after: TabEditPatch = {
        noteTimestamps: patch.noteTimestamps ?? before.noteTimestamps,
        measureTimestamps: patch.measureTimestamps ?? before.measureTimestamps,
        strumConfig: patch.strumConfig !== undefined ? patch.strumConfig : before.strumConfig,
      };

      const now = Date.now();
      const top = undoRef.current[undoRef.current.length - 1];
      const canMerge =
        !!mergeKey &&
        !!top &&
        top.mergeKey === mergeKey &&
        now - top.at <= MERGE_WINDOW_MS;

      if (canMerge) {
        // 只更新 after，before 保持最初那一条 → 「按住方向键」变成一步撤销
        top.after = after;
        top.at = now;
        top.label = label;
      } else {
        undoRef.current.push({ label, before, after, mergeKey, at: now });
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
      }
      redoRef.current = [];

      onChangeConfig({ ...current, ...after });
      bump();
    },
    [onChangeConfig, bump],
  );

  const undo = useCallback(() => {
    const entry = undoRef.current.pop();
    if (!entry) return;
    redoRef.current.push(entry);
    onChangeConfig({ ...configRef.current, ...entry.before });
    bump();
  }, [onChangeConfig, bump]);

  const redo = useCallback(() => {
    const entry = redoRef.current.pop();
    if (!entry) return;
    undoRef.current.push(entry);
    onChangeConfig({ ...configRef.current, ...entry.after });
    bump();
  }, [onChangeConfig, bump]);

  const reset = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    bump();
  }, [bump]);

  const top = undoRef.current[undoRef.current.length - 1];
  const redoTop = redoRef.current[redoRef.current.length - 1];

  return {
    applyEdits,
    undo,
    redo,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    undoLabel: top?.label ?? null,
    redoLabel: redoTop?.label ?? null,
    reset,
    depth: undoRef.current.length,
  };
};

export default useTabEditorHistory;
