#!/usr/bin/env node
/**
 * E2E 测试：本机下载代理（方案 A）
 * =================================
 *
 * 不需要真的访问 YouTube —— 用**本地 HTTP 音频**当"视频源"，
 * 完整验证这条链路：
 *
 *   1. 建项目（downloadDriver=client）        → 断言状态 = awaiting_audio（服务器没有去下载）
 *   2. GET /download-tasks                    → 断言项目出现在 awaitingAudio 队列里
 *   3. 跑 `npm run agent -- --once`           → 本机 yt-dlp 取音频（generic 提取器）→ 转 mp3 → base64 回传
 *   4. 轮询项目                                → 断言状态推进到 review，且 TabProject 里有音符
 *   5. 清理                                    → 删除测试项目
 *
 * 为什么用本地音频：这条链路要验证的是「代理取音频 → 转码 → base64 回传 → 服务器续跑」，
 * 与"源站是谁"无关。真正的 YouTube 下载需要健康 cookies，属于环境问题，
 * 用 `npm run youtube:cookies -- --check` 单独验证。
 *
 * 用法：
 *     node scripts/e2e-client-download.mjs
 *     node scripts/e2e-client-download.mjs --server http://localhost:3000 --keep
 *     node scripts/e2e-client-download.mjs --rescue    # 顺带验证接管服务器失败任务（需要 1 个 failed 项目）
 */

import { spawn } from 'child_process';
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const flag = (name, def = false) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  return def;
};
const SERVER = String(flag('server', process.env.GM_SERVER || 'http://localhost:3000')).replace(/\/$/, '');
const KEEP = !!flag('keep');
/** `--driver client|server`：只跑其中一个场景（默认两个都跑） */
const ONLY_DRIVER = typeof flag('driver') === 'string' ? String(flag('driver')) : '';
/** 只在显式给了 --port 时才固定端口；否则用系统分配的空闲端口 */
const PREFERRED_PORT = argv.includes('--port') ? Number(flag('port', 0)) || 0 : 0;
const FIXTURE = join(ROOT, 'uploads', 'demo', 'demo_guitar.wav');
const TIMEOUT_MS = Number(flag('timeout', 360)) * 1000 || 360000;

let pass = 0;
let fail = 0;
const ok = (label, extra = '') => {
  pass += 1;
  console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`);
};
const bad = (label, extra = '') => {
  fail += 1;
  console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
};
const check = (cond, label, extra = '') => (cond ? ok(label, extra) : bad(label, extra));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { status: res.status, ok: res.ok, body };
}

/** 本地静态音频服务：相当于"视频源站"。端口用 0 → 由系统分配空闲端口，避免踩到别的本地服务。 */
function startFixtureServer() {
  const size = statSync(FIXTURE).size;
  const server = createServer((req, res) => {
    if ((req.url || '').startsWith('/audio')) {
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      });
      createReadStream(FIXTURE).pipe(res);
    } else if (req.url === '/page') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><a href="/audio.wav">fixture audio</a></body></html>`);
    } else {
      res.writeHead(404).end('nope');
    }
  });
  return new Promise((resolve) =>
    server.listen(PREFERRED_PORT || 0, '127.0.0.1', () => resolve({ server, port: server.address().port })),
  );
}

function runAgentOnce(projectId) {
  return new Promise((resolve) => {
    const args = ['scripts/download-agent.mjs', '--once', '--limit', '1', '--server', SERVER];
    // 只处理本次测试的项目：否则代理会先拿队列里更早的遗留任务
    if (projectId) args.push('--only', projectId);
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, FFMPEG_DIR: join(ROOT, 'node_modules', 'ffmpeg-static') },
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
      process.stderr.write(d);
    });
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** 上轮被中断时可能留下 [E2E] 残留项目（它们会抢占代理队列）→ 每次开跑先清干净 */
async function cleanupStaleProjects() {
  const res = await api('/api/transcription/projects?limit=200');
  const stale = (res.body.projects || []).filter(
    (p) => typeof p.title === 'string' && p.title.startsWith('[E2E]'),
  );
  for (const p of stale) {
    // eslint-disable-next-line no-await-in-loop
    await api(`/api/transcription/projects/${p.id}`, { method: 'DELETE' });
    console.log(`      清理残留：${p.title} [${p.id}] (${p.status})`);
  }
  return stale.length;
}

async function waitForStatus(projectId, targets, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const { ok: good, body } = await api(`/api/transcription/projects/${projectId}`);
    if (good && body.project) {
      last = body.project;
      if (targets.includes(last.status)) return last;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(3000);
  }
  return last;
}

/**
 * 场景 A：本机代理下载（方案 A 的核心）
 * 覆盖「建项目 → 服务器挂起 → 任务清单 → 代理回传 → 续跑 → 幂等」。
 * `url` 是本地 fixture 音频地址（不依赖 YouTube）。
 */
async function scenarioClient(url) {
  console.log('\n━━━ 场景 A：downloadDriver = client（本机代理） ━━━');
  let projectId = '';

  try {
    // ── A1. 建项目（downloadDriver=client）──
    console.log('[A1] 创建 URL 项目（downloadDriver=client）');
    const created = await api('/api/transcription/projects/from-url', {
      method: 'POST',
      body: JSON.stringify({
        url,
        title: '[E2E] 本机代理下载',
        license: 'user_uploaded',
        downloadDriver: 'client',
      }),
    });
    check(created.ok, '创建接口 2xx', `HTTP ${created.status}`);
    if (!created.ok) {
      console.error(JSON.stringify(created.body).slice(0, 800));
      throw new Error('创建项目失败');
    }
    projectId = created.body.project?.id || '';
    check(!!projectId, '返回 project.id');
    check(
      created.body.project?.status === 'awaiting_audio',
      '状态 = awaiting_audio（服务器没去下载）',
      `实际 ${created.body.project?.status}`,
    );
    check(
      created.body.project?.downloadDriver === 'client',
      'downloadDriver 落库 = client',
      `实际 ${created.body.project?.downloadDriver}`,
    );
    check(
      created.body.started?.stage === 'awaiting_audio',
      'started.stage = awaiting_audio',
      `实际 ${created.body.started?.stage}`,
    );
    console.log(`      hint: ${created.body.started?.hint || '(无)'}`);

    // ── A2. 代理任务清单 ──
    console.log('\n[A2] GET /api/transcription/download-tasks');
    const tasks = await api('/api/transcription/download-tasks');
    check(tasks.ok, '任务清单接口 2xx', `HTTP ${tasks.status}`);
    const waiting = tasks.body.awaitingAudio || [];
    const listed = waiting.find((t) => t.id === projectId);
    check(!!listed, '项目出现在 awaitingAudio 队列', `队列长度 ${waiting.length}`);
    check(listed?.url === url, '队列带回原始 URL');
    check(typeof tasks.body.failedDownload !== 'undefined', 'failedDownload 字段存在（供 --rescue）');

    // ── A3. 跑一次代理 ──
    console.log('\n[A3] 运行本机代理（npm run agent -- --once）');
    const agent = await runAgentOnce(projectId);
    check(agent.code === 0, 'agent 退出码 0', `实际 ${agent.code}`);
    check(/已回传|服务器已接收/.test(agent.out), 'agent 日志显示回传成功');

    // ── A4. 流水线续跑 ──
    console.log('\n[A4] 等待服务器续跑（separate → transcribe → convert → review）');
    const final = await waitForStatus(projectId, ['review', 'published', 'failed'], TIMEOUT_MS);
    assertPipelineOutput(final, 'A');

    // ── A5. 幂等性：再来一次不应覆盖已有音频 ──
    if (projectId) {
      console.log('\n[A5] 幂等性：重复回传应被拒绝（400）');
      const dupe = await api(`/api/transcription/projects/${projectId}/audio`, {
        method: 'POST',
        body: JSON.stringify({ base64: Buffer.from('x').toString('base64'), fileName: 'agent-audio.mp3' }),
      });
      check(dupe.status === 400, '已有音频时回传被拒', `HTTP ${dupe.status}`);
    }
  } finally {
    if (projectId && !KEEP) {
      const del = await api(`/api/transcription/projects/${projectId}`, { method: 'DELETE' });
      console.log(`[A6] 清理测试项目：HTTP ${del.status}`);
    } else if (projectId) {
      console.log(`[A6] 保留测试项目（--keep）：${projectId}`);
    }
  }
}

/** 断言项目跑到了 review，并且真的产出了谱面（A / B 两个场景共用） */
function assertPipelineOutput(final, label) {
  if (!final) {
    bad(`${label} 拿到最终状态`, '轮询超时且无响应');
    return;
  }
  check(final.status !== 'failed', `${label} 未失败`, final.error ? `error=${final.error}` : '');
  check(
    ['review', 'published'].includes(final.status),
    `${label} 推进到待复核`,
    `实际 ${final.status}（${final.statusLabel || ''} progress=${final.progress}%）`,
  );
  check(!!final.audioUrl, `${label} 音频已落盘`, final.audioUrl || '');
  const notes = (final.tracks || []).flatMap((t) => t.notes || []);
  // TabProject 的层级是 tracks[].measures[].notes[]（与 CMS `ApiTabProject` 一致）
  const tabMeasures = (final.tabProject?.tracks || []).flatMap((t) => t.measures || []);
  const tabNotes = tabMeasures.flatMap((m) => m.notes || []);
  check(notes.length > 0, `${label} 转录出音符`, `${notes.length} 个音符`);
  check(
    tabMeasures.length > 0,
    `${label} 产出 TabProject 小节`,
    `${tabMeasures.length} 小节 / ${tabNotes.length} 入谱音符`,
  );
  for (const t of final.tracks || []) {
    console.log(
      `      ${t.instrument}: ${t.status} 音符 ${t.noteCount} 引擎 ${t.engine || '?'} 平均置信 ${(t.confidenceAvg || 0).toFixed(2)}`,
    );
  }
}

/** 场景 B：服务器直下（老路径回归）—— 确认引入本机代理后没把原有下载能力改坏 */
async function scenarioServer(url) {
  console.log('\n━━━ 场景 B：downloadDriver = server（服务器直下） ━━━');
  let projectId = '';
  try {
    console.log('[B1] 创建 URL 项目（downloadDriver=server）');
    const created = await api('/api/transcription/projects/from-url', {
      method: 'POST',
      body: JSON.stringify({
        url,
        title: '[E2E] 服务器下载',
        license: 'user_uploaded',
        downloadDriver: 'server',
      }),
    });
    check(created.ok, '创建接口 2xx', `HTTP ${created.status}`);
    if (!created.ok) {
      console.error(JSON.stringify(created.body).slice(0, 800));
      return;
    }
    projectId = created.body.project?.id || '';
    check(!!projectId, '返回 project.id');
    check(
      created.body.project?.downloadDriver === 'server',
      'downloadDriver 落库 = server',
      `实际 ${created.body.project?.downloadDriver}`,
    );
    check(
      created.body.project?.status !== 'awaiting_audio',
      '未挂起（服务器自己去下载）',
      `实际 ${created.body.project?.status}`,
    );

    console.log('\n[B2] 等待服务器下完 + 跑完流水线');
    const final = await waitForStatus(projectId, ['review', 'published', 'failed'], TIMEOUT_MS);
    assertPipelineOutput(final, 'B');
  } finally {
    if (projectId && !KEEP) {
      const del = await api(`/api/transcription/projects/${projectId}`, { method: 'DELETE' });
      console.log(`[B3] 清理测试项目：HTTP ${del.status}`);
    } else if (projectId) {
      console.log(`[B3] 保留测试项目（--keep）：${projectId}`);
    }
  }
}

async function main() {
  console.log(`\n=== E2E：双下载通道（方案 A） ===\n服务器 ${SERVER}\n`);

  if (!existsSync(FIXTURE)) {
    console.error(`缺少测试音频：${FIXTURE}\n先跑：node scripts/generate-demo-audio.mjs`);
    process.exit(1);
  }

  console.log('[0] 服务器能力探测');
  const caps = await api('/api/transcription/capabilities');
  if (!caps.ok) {
    bad('后端可达', `${SERVER} → HTTP ${caps.status}`);
    process.exit(1);
  }
  ok('后端可达', `${SERVER}`);
  const strategy = caps.body.download;
  check(!!strategy, 'capabilities.download 存在');
  if (strategy) {
    console.log(
      `      driverDefault=${strategy.driverDefault}  serverCanDownload=${strategy.serverCanDownload}  ` +
        `agentCommand=${strategy.agentCommand}`,
    );
    check(typeof strategy.agentCommand === 'string' && strategy.agentCommand.length > 0, 'agentCommand 已下发');
  }

  const fixture = await startFixtureServer();
  const url = `http://127.0.0.1:${fixture.port}/audio.wav`;
  console.log(`\n[1] 本地音频源已启动：${url}`);
  const cleaned = await cleanupStaleProjects();
  console.log(`    清理上轮残留 ${cleaned} 个`);

  try {
    if (ONLY_DRIVER !== 'server') await scenarioClient(url);
    if (ONLY_DRIVER !== 'client') await scenarioServer(url);
  } finally {
    fixture.server.close();
  }

  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n测试中断：', err);
  process.exit(1);
});
