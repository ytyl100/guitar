import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';

/**
 * 当前可用宽度（CSS px）
 * ==================
 *
 * ## 为什么必须动态取，不能写死
 *
 * 谱面/指板这类**几何图形**的尺寸必须用行内 `style` 的 `px`（不能走类名，
 * 否则会被 Taro 按 rpx 换算，和内部坐标系打架 —— 见 `ChordFretboard.tsx` 顶部注释）。
 * 但行内 px **不会**随屏幕宽度变化，所以宽度写死 336px 的后果是：
 *
 * - 在 375pt 手机上：勉强塞得下，稍微换个机型（360/414）就直接溢出或留一条大缝；
 * - 在 H5 预览（窗口可能 1500px 宽）里：图形只占屏幕一角，比例完全失衡，
 *   看着像"样式坏了"—— 而这其实只是没跟视口同步。
 *
 * 所以这里统一取一次窗口宽度，各处几何**由它算出来**：两端（H5 / 微信）看到的
 * 比例就都对了，H5 预览也因此可以当作可信的验收入口。
 *
 * ## 平台差异
 *
 * - 微信：`getWindowInfo()`（Taro 4 推荐，`getSystemInfoSync` 已废弃）；
 * - H5：同样支持，并且**拖动浏览器窗口**时要跟着变 —— 所以额外订阅 `onWindowResize`。
 */
export function useWindowWidth(fallback = 375): number {
  const read = (): number => {
    try {
      const info =
        typeof Taro.getWindowInfo === 'function' ? Taro.getWindowInfo() : Taro.getSystemInfoSync();
      const w = Number(info?.windowWidth) || 0;
      return w > 0 ? w : fallback;
    } catch {
      return fallback;
    }
  };

  const [width, setWidth] = useState(read);

  useEffect(() => {
    if (typeof Taro.onWindowResize !== 'function') return;
    const handler = () => setWidth(read());
    Taro.onWindowResize(handler);
    return () => {
      /** H5 才有 offWindowResize；微信端拿不到就算了（页面级监听会被回收） */
      Taro.offWindowResize?.(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return width;
}

/**
 * 页面栅格常量（**CSS px**，与行内 style 同一套单位）
 *
 * ```
 * 窗口宽 ─┬─ 页面左右留白 16×2   ← ⚠️ `pageClass()` 里就是这个值（实测 16.0085px）
 *         ├─ 卡片左右留白 12×2
 *         └─ 调弦弦名槽 26（谱面/指板左侧写 E4…E2 的那一列）
 * ```
 *
 * ⚠️ 这里只当**测不到时的兵底值**：真正的尺寸应当用 `createSelectorQuery` 实测容器，
 * 因为 `pageClass()` 的留白、H5 的页面外层宽度都可能变（实测就吃过亏：
 * 按 12 推算比实际宽 19px，ScrollView 被 flex 压窄后右侧无端多出一条空隙）。
 */
export const PAGE_PAD = 16;
export const CARD_PAD = 12;
/** 谱面/指板左侧的弦名槽宽度 */
export const GUTTER = 26;

/** 从窗口宽度算出一条"内容线"能画多宽（谱面与指板共用，保证两者左右对齐） */
export function contentWidth(winW: number): number {
  return Math.max(200, winW - PAGE_PAD * 2 - CARD_PAD * 2 - GUTTER);
}
