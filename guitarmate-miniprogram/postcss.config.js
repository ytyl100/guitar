/**
 * PostCSS 配置：小程序复用 Tailwind 的关键
 * ========================================
 *
 * 小程序（WXSS）不认 Tailwind 的类名，`weapp-tailwindcss` 负责把工具类**转成小程序能识别的形式**
 * （选择器合法化、`rpx` 换算、避免 `*`/`:root` 等不被支持的选择器）。
 *
 * ⚠️ 顺序不能反：先让 Tailwind 生成工具类，再由 weapp-tailwindcss 改写。
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    /**
     * ⚠️ `rem2rpx: true` 必须开，否则**尺寸与字体全部对不上**：
     * Tailwind 4 的尺寸都发成 CSS 变量且值是 `rem`（`--spacing: 0.25rem`、`--text-lg: 1.125rem`）。
     * - Taro 的 **H5**：Taro 会按 750 设计宽动态设置 root font-size → rem 正常缩放（所以 Web 版看起来是对的）；
     * - **小程序**：没有这套动态 root font-size，rem 按 WebView 默认 16px 解析
     *   → 内边距/间距/字号全部偏小、与 Web 版明显不一致（实测就是这个症状）。
     * `rem2rpx` 会把 rem 换成 rpx（1rem = 32rpx，对应 750 设计宽），两端才对得上。
     */
    'weapp-tailwindcss/postcss': {
      rem2rpx: true,
    },
  },
};
