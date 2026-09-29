#!/usr/bin/env node
/**
 * 本机下载代理（方案 A 的核心）
 * ============================
 *
 * 为什么需要它：YouTube 对**非浏览器客户端**要求「受信任的登录会话 + 好声誉的出口 IP」。
 * 云端服务器两样都缺 —— 机房 IP 容易被判高风险，服务器上也没有你日常浏览器的会话。
 *
 * 所以把「下载」这一步留在**你自己这台机器**（有住宅 IP + 受信任的浏览器 cookie），
 * 服务器只负责分离/转录/发布等重活：
 *
 * ```
 *  本机：yt-dlp 取音频（用同一份 cookies.txt / JS 运行时参数）
 *     ↓ POST /api/transcription/projects/:id/audio（base64，mp3）
 *  服务器：落盘 → separate → transcribe → convert → 待人工复核
 * ```
 *
 * 用法
 * ----
 *     npm run agent                        # 常驻：每 10 秒轮询一次「等待回传音频」的项目
 *     npm run agent -- --once              # 只跑一轮（脚本/CI 用）
 *     npm run agent -- --rescue            # 连「服务器下载失败」的项目一起接管
 *     npm run agent -- --server http://1.2.3.4:3000
 *     npm run agent -- --keep-files        # 保留本机下载的 mp3（默认下完即删）
 *     npm run agent -- --only <projectId>  # 只处理指定的一个项目
 *
 * ⚠️ 需要：本机装了 yt-dlp（`yt-dlp --version`），且 `<后端>/cookies.txt` 是**完整登录态**
 *    （用 `npm run youtube:cookies -- --check` 自检）。
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const { buildYtDlpArgs, ytDlpEnv } = require('../dist/transcription/ytdlp-args.js');

// ── 参数解析（保持零依赖，手写即可）──
const argv = process.argv.slice(2);
const flag = (name, def = false) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  return def;
};
const SERVER = String(flag('server', process.env.GM_SERVER || 'http://localhost:3000')).replace(/\/$/, '');
const ONCE = !!flag('once');
const RESCUE = !!flag('rescue');
const KEEP = !!flag('keep-files');
const INTERVAL = Math.max(2, Number(flag('interval', 10)) || 10);
const LIMIT = Math.max(1, Number(flag('limit', 5)) || 5);
/** `--only <projectId>`：只处理指定项目（测试 / 手动补单时很有用） */
const ONLY = typeof flag('only') === 'string' ? String(flag('only')) : '';
const FFMPEG_DIR = process.env.FFMPEG_DIR || join(ROOT, 'node_modules', 'ffmpeg-static');

const log = (...args) => console.log(`[agent ${new Date().toLocaleTimeString()}]`, ...args);

async function api(path, options = {}) {
  const res = await fetch(`${SERVER}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body;
}

/**
 * yt-dlp 子进程环境：直接用后端共享的 `ytDlpEnv()`，它与服务端**逐字一致**
 * （关键是把 localhost / 127.0.0.1 加进 `NO_PROXY`，避免系统代理把本机请求转成 502）。
 */
function agentEnv() {
  return ytDlpEnv();
}

/** 跑 yt-dlp：取音频并转成 mp3（体积小，base64 回传不会超限） */
function runYtDlp(url, outDir) {
  return new Promise((resolve) => {
    const args = buildYtDlpArgs({
      url,
      outTemplate: join(outDir, 'agent.%(ext)s'),
      ffmpegDir: existsSync(FFMPEG_DIR) ? FFMPEG_DIR : null,
      audioFormat: 'mp3',
      printJson: true,
    });
    const child = spawn('yt-dlp', args, { cwd: outDir, env: agentEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('close', (code) => {
      const produced = readdirSync(outDir).filter((f) => f.startsWith('agent.'));
      if (code === 0 && produced.length) {
        const file = join(outDir, produced[0]);
        let title = null;
        for (const line of stdout.split(/\r?\n/).reverse()) {
          if (!line.trim().startsWith('{')) continue;
          try {
            title = JSON.parse(line).title || null;
            break;
          } catch {
            continue;
          }
        }
        resolve({ ok: true, file, title });
      } else {
        resolve({
          ok: false,
          error: (stderr.split(/\r?\n/).filter((l) => l.trim()).slice(-2).join(' ／ ') || `yt-dlp 退出码 ${code}`),
        });
      }
    });
  });
}

async function handleTask(task, kind) {
  const label = `${task.title || '(无标题)'} [${task.id}]`;
  log(kind === 'rescue' ? `接管服务器下载失败的任务：${label}` : `取音频：${label}`);
  log(`   URL ${task.url}`);

  const workDir = mkdtempSync(join(tmpdir(), 'gm-agent-'));
  try {
    const dl = await runYtDlp(task.url, workDir);
    if (!dl.ok) {
      log(`   ❌ yt-dlp 失败：${dl.error}`);
      if (/sign in to confirm|not a bot|confirm you.re not a bot/i.test(dl.error)) {
        log('   → cookies 不健康或过期。先跑：npm run youtube:cookies -- --check');
      } else if (/502|bad gateway|proxy/i.test(dl.error)) {
        log('   → 疑似系统代理把请求转坏了。若目标就是本机/内网地址，检查代理的绕过规则。');
      } else if (/video unavailable/i.test(dl.error)) {
        log('   → 多为缺少 JS 运行时/远程组件；确认本机有 node，或浏览器里能否播放该视频。');
      } else if (/connection refused|ECONNREFUSED|10061|actively refused/i.test(dl.error)) {
        log('   → 目标地址拒绝连接：本机音频源已关闭 / 端口不通。');
      } else if (/unable to download webpage|timed out|connection/i.test(dl.error)) {
        log('   → 网络不可达：国内直连 YouTube 需代理，确认代理已开启。');
      }
      return false;
    }

    const sizeMb = statSync(dl.file).size / 1024 / 1024;
    log(`   ✅ 已下载 ${sizeMb.toFixed(2)}MB → 回传服务器…`);
    const base64 = readFileSync(dl.file).toString('base64');
    const res = await api(`/api/transcription/projects/${task.id}/audio`, {
      method: 'POST',
      body: JSON.stringify({
        base64,
        fileName: 'agent-audio.mp3',
        title: dl.title || undefined,
      }),
    });
    log(`   🚀 服务器已接收（${res.stored?.sizeBytes ? (res.stored.sizeBytes / 1024 / 1024).toFixed(2) + 'MB' : '?'}）→ 开始分离/转录`);
    if (!KEEP) rmSync(dl.file, { force: true });
    return true;
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

async function tick() {
  let tasks;
  try {
    tasks = await api('/api/transcription/download-tasks');
  } catch (err) {
    log(`⚠️ 无法连接服务器 ${SERVER}：${err.message}`);
    return { done: 0, failed: 0, pending: 0 };
  }

  const queue = [
    ...(tasks.awaitingAudio || []).map((t) => ({ task: t, kind: 'awaiting' })),
    ...(RESCUE ? (tasks.failedDownload || []).map((t) => ({ task: t, kind: 'rescue' })) : []),
  ].filter(({ task }) => !ONLY || task.id === ONLY);
  if (!queue.length) return { done: 0, failed: 0, pending: 0 };

  log(`发现 ${queue.length} 个待办（等待回传 ${(tasks.awaitingAudio || []).length}，服务器下载失败 ${(tasks.failedDownload || []).length}）`);
  let done = 0;
  let failed = 0;
  for (const { task, kind } of queue.slice(0, LIMIT)) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await handleTask(task, kind);
    if (ok) done += 1;
    else failed += 1;
  }
  return { done, failed, pending: Math.max(0, queue.length - LIMIT) };
}

async function main() {
  log(`服务器 ${SERVER}｜yt-dlp=${existsSync(FFMPEG_DIR) ? 'ffmpeg-static 就绪' : '⚠️ 未找到 ffmpeg-static'}`);
  log(`模式：${ONCE ? '单轮' : `常驻（每 ${INTERVAL}s）`}${RESCUE ? ' + rescue（接管服务器失败任务）' : ''}`);

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const stat = await tick();
    if (stat.done || stat.failed) log(`本轮：成功 ${stat.done}，失败 ${stat.failed}`);
    if (ONCE) process.exit(stat.failed > 0 ? 2 : 0);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  }
}

main().catch((err) => {
  console.error('[agent] 致命错误：', err);
  process.exit(1);
});
