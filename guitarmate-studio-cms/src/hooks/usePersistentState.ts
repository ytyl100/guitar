import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 带 localStorage 持久化的 state（usePersistentState）
 * ==================================================
 *
 * ### 为什么需要它
 *
 * CMS 现在的持久化是「一个字段一套手写 useEffect」（只有 `tracks` 有），
 * 结果是：课程大纲 `stages`、和弦库 `chords` **刷新就丢** —— 管理员辛苦编的内容留不住。
 * 这个 hook 把「读 / 写 / 解析失败兜底 / 迁移」收敛成一处。
 *
 * ### 设计要点
 *
 * - **懒初始化**：只有首次渲染读一次 localStorage，之后纯粹是内存状态（不会每帧读盘）；
 * - **解析失败必须回退**：损坏的 JSON 不能让整个页面白屏 —— 回退到 `initial` 并清理脏数据；
 * - **`version` 前缀**：结构变更时改版本号即可让旧数据自动失效（避免半新半旧的数据把界面搞崩）。
 *
 * ```ts
 * const [stages, setStages] = usePersistentState<Stage[]>('curriculum_stages', INITIAL_STAGES, {
 *   storageKey: 'guitarmate_curriculum_stages',
 *   sanitize: (value) => (Array.isArray(value) ? (value as Stage[]) : null),
 * });
 * ```
 */

export interface UsePersistentStateOptions<T> {
  /** 覆盖完整的 localStorage key（默认 `guitarmate_<key>`） */
  storageKey?: string;
  /** 结构版本：改变它会忽略旧数据（做破坏性结构升级时用） */
  version?: number;
  /** 校验/清洗读到的数据；返回 null 表示不可用，回退到 initial */
  sanitize?: (value: unknown) => T | null;
  /** 关闭持久化（调试用） */
  disabled?: boolean;
}

export function usePersistentState<T>(
  key: string,
  initial: T,
  options: UsePersistentStateOptions<T> = {},
): [T, React.Dispatch<React.SetStateAction<T>>, { reset: () => void; storageKey: string }] {
  const storageKey = options.storageKey || `guitarmate_${key}`;
  const versionSuffix = options.version ? `_v${options.version}` : '';
  const fullKey = `${storageKey}${versionSuffix}`;
  const sanitizeRef = useRef(options.sanitize);
  sanitizeRef.current = options.sanitize;

  const [value, setValue] = useState<T>(() => {
    if (options.disabled) return initial;
    try {
      const raw = localStorage.getItem(fullKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeRef.current ? sanitizeRef.current(parsed) : (parsed as T);
      if (sanitized === null) {
        localStorage.removeItem(fullKey);
        return initial;
      }
      return sanitized;
    } catch {
      try {
        localStorage.removeItem(fullKey);
      } catch {
        /* 隐私模式下 removeItem 也可能抛错，忽略 */
      }
      return initial;
    }
    // 首次渲染只读一次：key 变化时由下面的 effect 负责重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // ① key 变化 → 重新载入
  const lastKeyRef = useRef(fullKey);
  useEffect(() => {
    if (lastKeyRef.current === fullKey) return;
    lastKeyRef.current = fullKey;
    try {
      const raw = localStorage.getItem(fullKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const sanitized = parsed ? (sanitizeRef.current ? sanitizeRef.current(parsed) : (parsed as T)) : null;
      setValue(sanitized ?? initial);
    } catch {
      setValue(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // ② 写入（配额不足 / 隐私模式时静默降级：持久化是便利功能，不能阻塞编辑）
  useEffect(() => {
    if (options.disabled) return;
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [fullKey, value, options.disabled]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(fullKey);
    } catch {
      /* ignore */
    }
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  return [value, setValue, { reset, storageKey: fullKey }];
}

export default usePersistentState;
