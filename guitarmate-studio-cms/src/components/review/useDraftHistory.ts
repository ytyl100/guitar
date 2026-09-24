import { useCallback, useMemo, useState } from 'react';

/**
 * 草稿历史（useDraftHistory）—— 撤销 / 重做的唯一真相
 * =================================================
 *
 * 六线谱校正要「回滚到之前的修改点」（需求 2.3），分两层：
 *
 * | 层级 | 机制 | 能回到 |
 * |---|---|---|
 * | **即时** | 本 hook 的 undo / redo（内存栈） | 上一步 / 下一步编辑 |
 * | **里程碑** | `RevisionPanel` 的命名快照（localStorage） | 某次「存点」 |
 * | **发布** | `GET /projects/:id/revisions` + `GET /package?revision=N` | 任意一次已发布版本 |
 *
 * 为什么用「不可变快照栈」而不是 patch/diff？
 * 复核的编辑粒度是「整份 TabProject 覆写」（后端 `PATCH` 也是整份覆写），
 * 一份 20 小节的 TabProject 序列化后不过几十 KB，快照栈最省心且零 bug。
 */

export interface DraftHistory<T> {
  present: T | null;
  canUndo: boolean;
  canRedo: boolean;
  /** 可回退的步数 */
  undoCount: number;
  redoCount: number;
  /** 记录一次新状态（用户编辑） */
  commit: (next: T) => void;
  undo: () => void;
  redo: () => void;
  /** 清空历史并设为新基线（加载 / 回滚快照 / 保存成功后） */
  reset: (value: T | null) => void;
  /** 只替换当前值、不记录历史（例如仅元信息同步） */
  replacePresent: (value: T | null) => void;
  /** 是否存在未保存的改动（相对最近一次 reset） */
  dirty: boolean;
  /** 标记「当前状态已保存」——把基线推进到现在，dirty 归零、历史保留 */
  markClean: () => void;
}

interface HistoryState<T> {
  past: T[];
  present: T | null;
  future: T[];
  baseline: T | null;
}

const MAX_HISTORY = 60;

export function useDraftHistory<T>(limit = MAX_HISTORY): DraftHistory<T> {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: null,
    future: [],
    baseline: null,
  });

  const commit = useCallback(
    (next: T) => {
      setState((s) => {
        if (s.present === next) return s;
        const past = s.present === null ? s.past : [...s.past, s.present].slice(-limit);
        return { ...s, past, present: next, future: [] };
      });
    },
    [limit],
  );

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      return {
        ...s,
        past: s.past.slice(0, -1),
        present: previous,
        future: s.present === null ? s.future : [s.present, ...s.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return {
        ...s,
        past: s.present === null ? s.past : [...s.past, s.present].slice(-limit),
        present: next,
        future: rest,
      };
    });
  }, [limit]);

  const reset = useCallback((value: T | null) => {
    setState({ past: [], present: value, future: [], baseline: value });
  }, []);

  const replacePresent = useCallback((value: T | null) => {
    setState((s) => ({ ...s, present: value }));
  }, []);

  const markClean = useCallback(() => {
    setState((s) => ({ ...s, baseline: s.present }));
  }, []);

  const dirty = useMemo(() => state.baseline !== state.present, [state.baseline, state.present]);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoCount: state.past.length,
    redoCount: state.future.length,
    commit,
    undo,
    redo,
    reset,
    replacePresent,
    dirty,
    markClean,
  };
}

export default useDraftHistory;
