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
 * ⚠️ 现有 App 用的是 lucide-react 图标；小程序没有图标库依赖，
 * 这里用 emoji 保持"零资源文件"（后续可换成 `iconPath` 图片做像素级对齐）。
 */
export interface BottomNavItem {
  key: 'songs' | 'learn' | 'tune' | 'tools' | 'profile';
  icon: string;
  /** 文案 key（`utils/settings.ts` 的文案表）——不要写死中文，见那边的覆盖范围说明 */
  labelKey: I18nKey;
  /** 已实现的页面路径；未实现则只提示 */
  url?: string;
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'songs', icon: '🎵', labelKey: 'nav.songs', url: '/pages/index/index' },
  { key: 'learn', icon: '📚', labelKey: 'nav.learn', url: '/pages/learn/index' },
  { key: 'tune', icon: '🎸', labelKey: 'nav.tune', url: '/pages/tune/index' },
  { key: 'tools', icon: '🧰', labelKey: 'nav.tools', url: '/pages/tools/index' },
  { key: 'profile', icon: '👤', labelKey: 'nav.profile', url: '/pages/profile/index' },
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
              className="gm-nav-item"
              onClick={() => go(item)}
            >
              <Text className={`text-[36rpx] leading-none ${on ? '' : 'opacity-45'}`}>{item.icon}</Text>
              <Text
                className={`gm-nav-label mt-[6rpx] text-[20rpx] leading-none ${
                  on ? 'font-bold text-emerald-400' : 'text-zinc-500'
                }`}
              >
                {t(item.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
