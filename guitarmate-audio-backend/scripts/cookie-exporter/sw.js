/**
 * GuitarMate Cookie Exporter —— 在浏览器内部运行，用 chrome.cookies API 读 cookie。
 *
 * 关键点：cookie 由**浏览器自己解密后**通过 chrome.cookies 交给我们，
 * 因此可以绕开 Chromium 的 App-Bound 加密（yt-dlp --cookies-from-browser 做不到）。
 * 只保留 youtube.com / google.com 的 cookie，POST 到本机 127.0.0.1 的接收器。
 */
const ENDPOINT = 'http://127.0.0.1:5199/save';
const AUTH_NAMES = [
  'SID', 'HSID', 'SSID', 'SAPISID', 'APISID',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', 'LOGIN_INFO',
];
const SOURCES = ['https://www.youtube.com/', 'https://accounts.google.com/', 'https://www.google.com/'];

function toNetscape(cookies) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# 由 GuitarMate Cookie Exporter（浏览器内）导出',
    '# ⚠️ 内含账号凭证，请勿提交到仓库或外发',
    '',
  ];
  for (const c of cookies) {
    const domain = c.domain || '';
    const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expires = Math.max(0, Math.floor(c.expirationDate || 0));
    const prefix = c.httpOnly ? '#HttpOnly_' : '';
    lines.push(`${prefix}${domain}\t${flag}\t${c.path || '/'}\t${secure}\t${expires}\t${c.name}\t${c.value}`);
  }
  return lines.join('\n') + '\n';
}

async function exportCookies() {
  const merged = new Map();
  for (const url of SOURCES) {
    try {
      for (const c of await chrome.cookies.getAll({ url })) {
        merged.set(`${c.domain}|${c.path}|${c.name}`, c);
      }
    } catch (err) {
      console.warn('getAll failed', url, err);
    }
  }
  const cookies = [...merged.values()];
  const hits = AUTH_NAMES.filter((n) => cookies.some((c) => c.name === n));
  const summary = { count: cookies.length, hits };

  if (!cookies.length) return summary;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: toNetscape(cookies),
    });
    summary.posted = res.ok;
  } catch (err) {
    console.warn('post failed', err);
    summary.posted = false;
  }
  console.log('[GuitarMate] cookie export', JSON.stringify(summary));
  return summary;
}

// 启动即执行一次（用 --load-extension 启动时会立即触发）
exportCookies();
chrome.runtime.onStartup.addListener(exportCookies);
chrome.runtime.onInstalled.addListener(exportCookies);
chrome.cookies.onChanged.addListener(() => {
  // 登录后 cookie 变化即重导，避免时序问题
  exportCookies();
});
