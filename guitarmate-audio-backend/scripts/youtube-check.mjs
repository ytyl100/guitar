#!/usr/bin/env node
/**
 * YouTube 可用性体检（一键回答「现在到底能不能下」）
 * ==================================================
 *
 * 为什么需要它：CMS 里下载失败时，用户看到的只有一句后端分类文案，
 * 而**决定性信息**（例如 cookies 被浏览器轮换、PO token 缺失、IP 被拦）
 * 往往在 yt-dlp 的 stdout/stderr 里，且 stream 还不固定。
 *
 * 本脚本用**与后端完全相同的参数组装**（`dist/transcription/ytdlp-args.js`）跑一次
 * 元数据探测，并分别打印两个流 + 给出结论。
 *
 * 用法：
 *     node scripts/youtube-check.mjs
 *     node scripts/youtube-check.mjs --url "https://www.youtube.com/watch?v=xxxx"
 *     node scripts/youtube-check.mjs --cookies cookies.good-backup.txt
 *     node scripts/youtube-check.mjs --json      # 只输出结论行（供脚本消费）
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const { buildYtDlpArgs, ytDlpEnv, resolveYtDlpCookies } = require('../dist/transcription/ytdlp-args.js');
const { probeYoutubeSession } = require('../dist/transcription/youtube-session.js');
const { buildSessionHint } = require('../dist/transcription/youtube-session-hint.js');

const argv = process.argv.slice(2);
const flag = (name, def = false) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  return def;
};
/** 默认用「公共领域 / YouTube Audio Library」的视频，避免版权与地区差异 */
const URL = String(flag('url', 'https://www.youtube.com/watch?v=Jx8ls-Y-Keg'));
/** `--cookies <path>` 覆盖（默认走后端同一套解析：YTDLP_COOKIES → 自动 cookies.txt） */
const COOKIE_OVERRIDE = typeof flag('cookies') === 'string' ? String(flag('cookies')) : '';
const JSON_ONLY = !!flag('json');

function tail(text, n = 10) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-n)
    .join('\n');
}

function runYtDlp() {
  const cookieSource = COOKIE_OVERRIDE
    ? { mode: 'file', value: COOKIE_OVERRIDE }
    : resolveYtDlpCookies();
  const args = buildYtDlpArgs({
    url: URL,
    outTemplate: join(ROOT, 'uploads', 'probe', 'probe.%(ext)s'),
    ffmpegDir: existsSync(join(ROOT, 'node_modules', 'ffmpeg-static'))
      ? join(ROOT, 'node_modules', 'ffmpeg-static')
      : null,
    audioFormat: 'mp3',
    printJson: false,
  });
  // 只用元数据，避免真下载
  args.push('--skip-download', '--print', '%(title)s|%(duration)s|%(uploader)s');

  return new Promise((resolve) => {
    const child = spawn('yt-dlp', args, { cwd: ROOT, env: ytDlpEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr, spawnError: e.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** 把两个流合起来判定（决定性的警告在哪个流都可能出现） */
function verdict(stdout, stderr) {
  const all = `${stdout}\n${stderr}`;
  if (/no longer valid|rotated in the browser/i.test(all)) return 'cookies-rotated';
  if (/sign in to confirm|not a bot/i.test(all)) return 'bot-check';
  if (/failed to decrypt with dpapi|app-bound/i.test(all)) return 'browser-cookies';
  if (/unsupported url|no video formats/i.test(all)) return 'unsupported';
  return 'unknown';
}

const SUGGESTION = {
  'cookies-rotated': buildSessionHint('signed-out'),
  'bot-check': [
    'YouTube 要求登录 / 人机校验 —— 若上面「登录态实测」为 ❌，先修 cookies；',
    '若为 ✅ 则问题在出口 IP / PO token：',
    '  1) 换出口 IP（关代理直连 / 换节点）后重试；',
    '  2) 装 PO token 插件：pip install bgutil-ytdlp-pot-provider；',
    '  3) 或先用本机下载代理：npm run agent（住宅 IP + 真实会话）。',
  ].join('\n'),
  'browser-cookies': '浏览器的 cookie 无法解密（App-Bound）→ 用 npm run youtube:cookies 导出到文件。',
  unsupported: '该链接不是可解析的媒体页（检查是否复制了完整 watch?v=… 链接）。',
  unknown: '未能从 yt-dlp 输出中判定原因，请看上面两个流的完整尾部。',
};

const main = async () => {
  const cookies = COOKIE_OVERRIDE ? { mode: 'file', value: COOKIE_OVERRIDE } : resolveYtDlpCookies();

  /**
   * 先实测登录态。
   *
   * 顺序很重要：yt-dlp 那句「cookies are no longer valid」是**间歇性**的，
   * 直接看 yt-dlp 结论会把「cookies 作废」误判成「IP 被风控」。
   * 而 YouTube 自己的 `LOGGED_IN` 是确定的事实。
   */
  const session = await probeYoutubeSession();
  const res = await runYtDlp();
  const v = res.code === 0 ? 'ok' : verdict(res.stdout, res.stderr);
  const meta = (res.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';

  if (JSON_ONLY) {
    console.log(JSON.stringify({ ok: res.code === 0, verdict: v, session, url: URL, cookies, meta }));
    return process.exit(res.code === 0 ? 0 : 4);
  }

  console.log('=== YouTube 可用性体检 ===');
  console.log(`URL      : ${URL}`);
  console.log(`cookies  : ${cookies ? `${cookies.mode} → ${cookies.value}` : '(未配置)'}`);
  console.log('');
  console.log('--- 登录态实测（以这个为准）---');
  console.log(`状态     : ${session.state}   出口：${session.route}   cookie 条数：${session.cookieCount}   耗时：${session.elapsedMs}ms`);
  console.log(`说明     : ${session.detail}`);
  console.log(buildSessionHint(session.state));
  console.log('');
  console.log(`--- yt-dlp 下载探针（exit ${res.code}）---`);
  console.log('--- stdout 尾部 ---');
  console.log(tail(res.stdout, 6) || '(空)');
  console.log('--- stderr 尾部 ---');
  console.log(tail(res.stderr, 12) || '(空)');
  console.log('');
  if (res.code === 0) {
    console.log(`✅ 下载可用 —— 元数据：${meta}`);
  } else {
    console.log(`❌ 下载失败，yt-dlp 文案判定：${v}`);
    console.log(SUGGESTION[v] || SUGGESTION.unknown);
  }
  process.exit(res.code === 0 ? 0 : 4);
};

main();
