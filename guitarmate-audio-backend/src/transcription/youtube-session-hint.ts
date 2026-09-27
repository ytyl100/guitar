/**
 * 登录态实测结论 → 给用户看的下一步（单一来源）
 * ============================================
 * 后端错误文案、`GET /api/transcription/youtube-session`、`npm run youtube:check`
 * 三处共用这份文案，避免「同一个问题三个说法」。
 */

import type { YoutubeSessionState } from './youtube-session';

export function buildSessionHint(state: YoutubeSessionState): string {
  switch (state) {
    case 'signed-in':
      return '✅ 登录态有效。若仍下载失败，问题在出口 IP 或缺少 PO token，而不是 cookies。';
    case 'signed-out':
      return (
        '❌ 登录态已失效（YouTube 判定为未登录）→ 必须重新导出 cookies，换 IP 无效：\n' +
        '   1) 完全退出你日常登录 YouTube 的浏览器；\n' +
        '   2) npm run youtube:cookies      # 自动导出；会拒绝弱导出，不会覆盖好文件\n' +
        '   3) npm run youtube:verify       # 文件体检 + 联网实测（看到「登录态有效」即可）\n' +
        '   4) 回 CMS 点「从失败阶段重试」（cookies 每次下载实时读取，无需重启后端）'
      );
    case 'no-cookies':
      return '⚠️ 未找到 cookies 文件 → 先执行 npm run youtube:cookies（并确认浏览器里已登录 youtube.com）。';
    case 'unreachable':
      return '⚠️ 网络层没通（连不上 youtube.com）→ 先解决网络/代理，这一步**不能**用来判断 cookies 好坏。';
    default:
      return '⚠️ 无法判定（页面里没有登录标记）→ 可能是被要求人机校验；可先用 npm run agent 走本机代理。';
  }
}
