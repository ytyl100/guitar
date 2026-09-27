import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useT, type I18nKey } from '../utils/settings';

/**
 * 底部主导航（对齐现有 App 的样式）
 * =================================
 *
 * ⚠️ **为什么不用微信原生 tabBar**：
 * 原生 tabBar 要在 `app.config.ts` 里声明式配置，而且**只能指向"一级 tab 页面"**。
 * 现在小程序只有 3 个页面（曲库 → 曲目详情 → 练习页），其中详情/练习是**二级页**，
 * 不适合做 tab；要配原生 tabBar 就得把 Learn / Tune / Tools / Profile 四个页面都建出来
 * （属于"完整移植整个 App"的范围，不在本轮）。
 *
 * 所以这里**照搬现有 App 的做法：手写一个底部导航组件**，视觉与它一致，
 * 未实现的四个入口点了给一句明确提示（而不是静默无反应）。
 *
 * ⚠️ 现有 App 用的是 lucide-react 线性图标（`Music2` / `GraduationCap` / `Radio` / `BookOpen` / `User`）。
 * 小程序不引入图标库，也**不能在 WXSS 里写本地图片路径**，所以图标走「SVG 的 base64 data URI 当 background-image」：
 * path 数据逐字取自 `lucide-react@0.546.0`（与 Web 端同一套几何），尺寸 20px / 未激活 zinc-500、
 * 激活 emerald-500（stroke 加粗到 2.5，对应 Web 的 `stroke-[2.5]`）。
 *
 * 生成/更新图标：`node scripts/gen-nav-icons.mjs`（会重写 app.scss 里标记之间的那段）。
 */
export interface BottomNavItem {
  key: 'songs' | 'learn' | 'tune' | 'tools' | 'profile';
  /** 图标键（对应 app.scss 的 `.gm-nav-icon--<icon>`；与 lucide 图标名一致） */
  icon: 'songs' | 'learn' | 'tune' | 'tools' | 'profile';
  /** 文案 key（`utils/settings.ts` 的文案表）——不要写死中文，见那边的覆盖范围说明 */
  labelKey: I18nKey;
  /** 已实现的页面路径；未实现则只提示 */
  url?: string;
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'songs', icon: 'songs', labelKey: 'nav.songs', url: '/pages/index/index' },
  { key: 'learn', icon: 'learn', labelKey: 'nav.learn', url: '/pages/learn/index' },
  { key: 'tune', icon: 'tune', labelKey: 'nav.tune', url: '/pages/tune/index' },
  { key: 'tools', icon: 'tools', labelKey: 'nav.tools', url: '/pages/tools/index' },
  { key: 'profile', icon: 'profile', labelKey: 'nav.profile', url: '/pages/profile/index' },
];

export default function BottomNav({ active = 'songs' }: { active?: BottomNavItem['key'] }) {
  const t = useT();

  const go = (item: BottomNavItem) => {
    if (item.key === active) return;
    if (!item.url) {
      /** 明确告知未实现，而不是点了没反应（用户会以为是坏的） */
      Taro.showToast({ title: `${t(item.labelKey)} 尚未移植`, icon: 'none' });
      return;
    }
    /**
     * ⚠️ 从**二级页**（曲目详情）点「曲库」要 `navigateBack` 而不是 `reLaunch`：
     * `reLaunch` 会关掉整个页面栈重建列表页 → 列表的滚动位置、搜索词、刚加载的曲库全丢。
     * 返回上一层是用户的直觉（和左上角返回键一致）。
     */
    if (item.key === 'songs' && Taro.getCurrentPages().length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.reLaunch({ url: item.url });
  };

  return (
    /**
     * ⚠️ 高度必须来自 CSS 变量 `--gm-nav-h`（定义在 `app.scss`）：
     * 详情页的固定控制条 `.gm-bar` 用同一个变量把自己抬到导航之上，
     * 两边写死数字迟早会漂移（一改字体就重叠或留缝）。
     */
    <View className="gm-nav">
      <View className="flex items-center justify-around" style="height:100%">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const on = item.key === active;
          return (
            <View
              key={item.key}
              className={`gm-nav-item ${on ? 'gm-nav-item--on' : ''}`}
              onClick={() => go(item)}
            >
              {/**
               * 图标尺寸/颜色与 Web 端一致：
               * Web = `<Music2 size={20} />` + 父级 `text-emerald-500|zinc-500`（激活时 `stroke-[2.5]`）。
               * 这里靠 app.scss 里预置的好两份 data URI（未激活/激活）实现，不在 WXML 里换图。
               */}
              <View className={`gm-nav-icon gm-nav-icon--${item.icon}`} />
              {/**
               * ⚠️⚠️ 字号/行高/字间距**一律写在 app.scss 的 `.gm-nav-label` 里**，
               * 不要在这里用 `text-[20rpx] mt-[4rpx]` 这类 Tailwind 任意值类名：
               * 小程序端走 weapp-tailwindcss 后，WXSS 里的选择器是 `.text-_b20rpx_B`，
               * 而这里传给 WXML 的 class 还是 `text-[20rpx]` → 匹配不上 → 字号回落到默认 16px
               * （实测就是「菜单字号偏大」的原因）。`font-bold`/`tracking-tight` 这类普通类名不受影响，
               * 但为了不再踩，导航这一块统一走 app.scss（与 Web 的 `text-[10px] mt-0.5 tracking-tight` 对齐）。
               */}
              <Text className={`gm-nav-label${on ? ' gm-nav-label--on' : ''}`}>{t(item.labelKey)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
