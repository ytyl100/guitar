/**
 * Taro 编译配置
 *
 * 刻意**不使用** `defineConfig` / `merge`：手写一个纯对象让 Taro CLI 自己合并，
 * 少一层类型与运行时依赖，行为更可预期（本项目是从 Web 版迁移过来的，
 * 不需要 Taro 模板那套 env 覆盖逻辑）。
 */
const config = {
  projectName: 'guitarmate-miniprogram',
  date: '2026-9-26',
  /** 设计稿宽度：小程序用 750（Taro 默认，1px = 1rpx 的基准） */
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  /**
   * ⚠️ 必须按平台分开输出目录：
   * 否则 `taro build --type h5` 会**覆盖掉 weapp 的 dist/**，
   * 之后用开发者工具打开就会看到一份网页产物（报一堆 WXML 语法错），极易误判。
   */
  outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
  plugins: [],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  /** webpack5：Taro 4 的默认且最稳的编译链（vite 链对小程序的支持仍在演进） */
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false },
  },
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[name].[chunkhash:8].js',
    },
    /** 只用于本地验证（真机验收走 weapp） */
    router: {
      mode: 'hash',
    },
  },
  h5: {},
};

module.exports = config;
