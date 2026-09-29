import { PropsWithChildren } from 'react';
/** Tailwind（经 weapp-tailwindcss 适配）—— 必须早于 app.scss，方便用自有类覆盖 */
import './tailwind.css';
import './app.scss';

/**
 * 小程序根组件。
 *
 * 与 Web 版的差异（有意）：
 * - 没有 `document` / `localStorage`（小程序无 DOM）→ 主题、语言等持久化走 `Taro.setStorageSync`；
 * - 全局样式靠 `app.scss`，不引入 Tailwind（Tailwind 4 不能直接编译成 WXSS）。
 */
function App({ children }: PropsWithChildren<Record<string, never>>) {
  return children;
}

export default App;
