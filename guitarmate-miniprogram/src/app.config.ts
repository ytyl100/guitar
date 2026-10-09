export default defineAppConfig({
  /**
   * 六个页面：曲库列表 / 曲目详情 / 课程（Learn）/ 调音器（Tune）/ 和弦库（Tools）/ 我的。
   * 底部导航的 5 个 tab 现在全部都有真实页面。
   */
  pages: [
    'pages/index/index',
    'pages/song/index',
    'pages/learn/index',
    'pages/tune/index',
    'pages/tools/index',
    'pages/profile/index',
    /** AI 跟弹评测（新功能，Web 版没有对应页面） */
    'pages/ai-eval/index',
    /** 课程编写与教务管理规划方案（Web 版那个「架构方案」弹窗的正文） */
    'pages/architecture/index',
    /** 课时视频播放（含打点跳转） */
    'pages/video/index',
    /** 和弦微测（对齐 Web 版 InteractiveChordDrillModal，见 practice_chor 的版式） */
    'pages/chord-drill/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#0b1220',
    navigationBarTitleText: 'GuitarMate',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0b1220',
  },
});
