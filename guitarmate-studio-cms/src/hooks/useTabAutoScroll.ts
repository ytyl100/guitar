import { useCallback, useEffect, useRef } from 'react';

/**
 * 谱面自动滚动（useTabAutoScroll）
 * ================================
 *
 * 「音频播到哪、谱面滚到哪」——把**当前活动的小节卡片**滚到容器中间。
 *
 * 与「按比例滚动」的区别：CDN 切片音频的小节时长可能不相等（末小节被截断、
 * 历史数据窗口不准），按 `progressRatio × scrollWidth` 滚会在长曲里明显跑偏；
 * 按**小节归属**滚动永远与谱面一致。
 *
 * 用法（卡片列表里每个 item 注册自己的 DOM 节点）：
 * ```tsx
 * const { containerRef, registerItem } = useTabAutoScroll(activeMeasureIndex, isPlaying);
 * <div ref={containerRef} className="overflow-y-auto">
 *   {measures.map((m, i) => <section key={m.id} ref={(el) => registerItem(i, el)}>…</section>)}
 * </div>
 * ```
 */
export function useTabAutoScroll(activeIndex: number, enabled = true, options: { smooth?: boolean } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Map<number, HTMLElement>>(new Map());
  const smooth = options.smooth !== false;

  const registerItem = useCallback((index: number, el: HTMLElement | null) => {
    if (el) itemsRef.current.set(index, el);
    else itemsRef.current.delete(index);
  }, []);

  useEffect(() => {
    if (!enabled || activeIndex < 0) return;
    const container = containerRef.current;
    const item = itemsRef.current.get(activeIndex);
    if (!container || !item) return;

    const cRect = container.getBoundingClientRect();
    const iRect = item.getBoundingClientRect();
    /** 让 item 的垂直中心对齐容器中心 */
    const delta = iRect.top - cRect.top - (container.clientHeight - iRect.height) / 2;

    // 已经基本居中就不动，避免播放中每小节都触发一次动画
    if (Math.abs(delta) < 8) return;
    container.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
  }, [activeIndex, enabled, smooth]);

  return { containerRef, registerItem };
}

export default useTabAutoScroll;
