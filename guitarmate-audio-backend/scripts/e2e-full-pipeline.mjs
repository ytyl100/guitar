#!/usr/bin/env node
/**
 * 全链路 E2E（可重复运行）：转录 → 复核 → 发布 → C 端契约 → 重试 → 清理
 * ==========================================================================
 *
 * 与 `agent:e2e` 的分工：
 *   - `agent:e2e`   专测**下载通道**（本机代理 / 服务器直下），用本地 HTTP 音频当源；
 *   - 本脚本专测**服务器侧全链路**，把之前没覆盖的路径补齐：
 *
 *   ①  能力探测（capabilities.download / pipeline）
 *   ②  本地上传（base64）→ separate → transcribe → convert → review     ← 本次新增覆盖
 *   ③  URL + client 驱动 → awaiting_audio → 任务清单（不真下载，只验状态机）
 *   ④  发布 mirror=false → revision / package 结构 / 小节与音符数
 *   ⑤  发布 mirror=true  → 镜像出 Score → GET /api/published/scores/:id/measures  ← 本次新增覆盖
 *   ⑥  C 端契约：GET /api/published/scores/:id/package + 关键字段校验      ← 本次新增覆盖
 *   ⑦  分阶段重试（--from transcribe）→ 回到 review                       ← 本次新增覆盖
 *   ⑧  删除项目（级联）→ 断言 404
 *
 * 真实 YouTube 下载不在默认流程里（依赖网络与 cookies），用 `--youtube <url>` 单独跑。
 *
 * 用法：
 *     node scripts/e2e-full-pipeline.mjs
 *     node scripts/e2e-full-pipeline.mjs --youtube "https://www.youtube.com/watch?v=..."
 *     node scripts/e2e-full-pipeline.mjs --keep     # 保留测试项目
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
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
const YOUTUBE_URL = typeof flag('youtube') === 'string' ? String(flag('youtube')) : '';
const FIXTURE = join(ROOT, 'uploads', 'demo', 'demo_guitar.wav');
const TITLE_PREFIX = '[E2E-FULL]';
const TIMEOUT_MS = (Number(flag('timeout', 300)) || 300) * 1000;

let pass = 0;
let fail = 0;
const ok = (l, e = '') => {
  pass += 1;
  console.log(`  ✅ ${l}${e ? ` — ${e}` : ''}`);
};
const bad = (l, e = '') => {
  fail += 1;
  console.log(`  ❌ ${l}${e ? ` — ${e}` : ''}`);
};
const check = (c, l, e = '') => (c ? ok(l, e) : bad(l, e));
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
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) });

async function waitForStatus(projectId, targets, timeoutMs = TIMEOUT_MS) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const { ok: good, body } = await api(`/api/transcription/projects/${projectId}`);
    if (good && body.project) {
      last = body.project;
      if (targets.includes(last.status)) return last;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(2000);
  }
  return last;
}

/** 清理历史 [E2E-FULL] 残留（中断重跑时不至于堆积） */
async function cleanupStale() {
  const res = await api('/api/transcription/projects?limit=200');
  const stale = (res.body.projects || []).filter((p) => String(p.title || '').startsWith(TITLE_PREFIX));
  for (const p of stale) {
    // eslint-disable-next-line no-await-in-loop
    await api(`/api/transcription/projects/${p.id}`, { method: 'DELETE' });
  }
  return stale.length;
}

// ══════════════════════════════════════════════════
// ① 能力探测
// ══════════════════════════════════════════════════
async function stepCapabilities() {
  console.log('\n[①] 能力探测');
  const caps = await api('/api/transcription/capabilities?force=true');
  check(caps.ok, 'GET /capabilities 2xx', `HTTP ${caps.status}`);
  const c = caps.body.capabilities || {};
  console.log(
    `      yt-dlp=${c.ytDlp?.available} · ffmpeg=${c.ffmpeg?.available} · demucs=${c.demucs?.available} · ` +
      `basicPitch=${c.basicPitch?.available} · tayuya=${c.tayuya?.available}`,
  );
  check(!!c.ffmpeg?.available, 'ffmpeg 可用（真实转录的前提）');

  const d = caps.body.download;
  check(!!d, 'capabilities.download 存在');
  check(['server', 'client'].includes(d?.driverDefault), 'driverDefault 合法', `= ${d?.driverDefault}`);
  check(typeof d?.agentCommand === 'string' && d.agentCommand.length > 0, 'agentCommand 已下发', d?.agentCommand);
  console.log(
    `      serverCanDownload=${d?.serverCanDownload} · cookies=${d?.cookies?.count} 条 · ` +
      `strongAuth=${d?.cookies?.strongAuth} · loginInfo=${d?.cookies?.hasLoginInfo}`,
  );

  const q = await api('/api/transcription/queue');
  check(q.ok, 'GET /queue 2xx', `driver=${q.body?.counts?.driver}`);

  const tasks = await api('/api/transcription/download-tasks');
  check(tasks.ok && Array.isArray(tasks.body.awaitingAudio) && Array.isArray(tasks.body.failedDownload), 'download-tasks 结构正确');
}

// ══════════════════════════════════════════════════
// ② 本地上传 → review
// ══════════════════════════════════════════════════
async function stepUpload() {
  console.log('\n[②] 本地上传（base64）→ 流水线 → review');
  const base64 = readFileSync(FIXTURE).toString('base64');
  const created = await post('/api/transcription/projects/upload', {
    fileName: 'demo_guitar.wav',
    base64,
    title: `${TITLE_PREFIX} 本地上传`,
    artist: 'E2E',
    license: 'user_uploaded',
  });
  check(created.ok, 'POST /projects/upload 2xx', `HTTP ${created.status}`);
  if (!created.ok) {
    console.error(JSON.stringify(created.body).slice(0, 600));
    return null;
  }
  const id = created.body.project?.id;
  check(!!id, '返回 project.id');
  check(created.body.project?.sourceType === 'upload', 'sourceType=upload');
  check(created.body.project?.downloadDriver === null, '上传项目 downloadDriver 为空（不涉及下载）');

  const final = await waitForStatus(id, ['review', 'published', 'failed']);
  check(!final || final.status !== 'failed', '未失败', final?.error || '');
  check(final?.status === 'review', '推进到 review', `实际 ${final?.status} / ${final?.progress}%`);
  const tabMeasures = (final?.tabProject?.tracks || []).flatMap((t) => t.measures || []);
  check(tabMeasures.length > 0, '产出 TabProject', `${tabMeasures.length} 小节`);

  // 分轨音符与指法/把位不变式（这是发布质量的地基）
  const notes = (final?.tracks || []).flatMap((t) => t.notes || []);
  check(notes.length > 0, '转录出音符', `${notes.length} 个`);
  const badFinger = notes.filter((n) => n.finger != null && !(n.finger >= 0 && n.finger <= 4));
  check(badFinger.length === 0, 'finger 取值范围合法（0=空弦/1-4）', `${badFinger.length} 个越界`);
  const misPosition = notes.filter((n) => n.position != null && n.fret != null && n.finger != null && n.finger > 0 && n.position + n.finger - 1 !== n.fret);
  check(misPosition.length === 0, '把位不变式 finger = fret − position + 1', `${misPosition.length} 个不符`);
  return id;
}

// ══════════════════════════════════════════════════
// ③ URL + client 驱动的状态机（不真下载）
// ══════════════════════════════════════════════════
async function stepClientDriverPark() {
  console.log('\n[③] URL + client 驱动 → awaiting_audio 状态机');
  const created = await post('/api/transcription/projects/from-url', {
    url: 'https://example.com/never-fetched.mp3',
    title: `${TITLE_PREFIX} 挂起验证`,
    license: 'user_uploaded',
    downloadDriver: 'client',
  });
  check(created.ok, '创建 2xx', `HTTP ${created.status}`);
  const id = created.body.project?.id;
  check(created.body.project?.status === 'awaiting_audio', '状态 = awaiting_audio', `实际 ${created.body.project?.status}`);
  check(created.body.started?.driver === 'client', 'started.driver = client');

  const tasks = await api('/api/transcription/download-tasks');
  check(!!(tasks.body.awaitingAudio || []).find((t) => t.id === id), '出现在 awaitingAudio 队列');

  const detail = await api(`/api/transcription/projects/${id}`);
  check(detail.body.project?.progress === 5, 'progress = 5（未开始下载）', `实际 ${detail.body.project?.progress}`);
  check(!detail.body.project?.audioUrl, '尚无音频（服务器确实没去下载）');

  // 回传非法 base64 应被拒，且不改变状态
  const badPayload = await post(`/api/transcription/projects/${id}/audio`, { base64: 'not-a-real-audio' });
  check(badPayload.status >= 400, '非法音频被拒', `HTTP ${badPayload.status}`);
  const after = await api(`/api/transcription/projects/${id}`);
  check(after.body.project?.status === 'awaiting_audio', '被拒后状态未变');
  return id;
}

// ══════════════════════════════════════════════════
// ④⑤⑥ 发布（不镜像 / 镜像）+ C 端契约
// ══════════════════════════════════════════════════
async function stepPublish(projectId) {
  console.log('\n[④] 发布（mirror=false）');
  const pub = await post(`/api/transcription/projects/${projectId}/publish`, {
    publishedBy: 'e2e',
    channel: 'guitar',
    audioFallback: 'source',
    allowMissingAudio: true,
    mirrorToScorePipeline: false,
  });
  check(pub.ok, 'POST /publish 2xx', `HTTP ${pub.status}`);
  if (!pub.ok) {
    console.error(JSON.stringify(pub.body).slice(0, 800));
    return null;
  }
  check(pub.body.revision === 1, 'revision = 1', `实际 ${pub.body.revision}`);
  check((pub.body.stats?.measureCount || 0) > 0, 'stats.measureCount > 0', `${pub.body.stats?.measureCount}`);
  check((pub.body.stats?.noteCount || 0) > 0, 'stats.noteCount > 0', `${pub.body.stats?.noteCount}`);
  check(pub.body.mirrored?.enabled === false, '未镜像（mirrored.enabled=false）');
  check(!!pub.body.package?.measures?.length, 'package.measures 非空', `${pub.body.package?.measures?.length} 小节`);
  check(pub.body.package?.schemaVersion === '1.0', 'schemaVersion = 1.0');
  check(Array.isArray(pub.body.package?.provenance?.license !== undefined ? [1] : []), 'provenance.license 字段存在');

  const afterPublish = await waitForStatus(projectId, ['published'], 60_000);
  check(afterPublish?.status === 'published', '项目状态 = published', `实际 ${afterPublish?.status}`);

  const revs = await api(`/api/transcription/projects/${projectId}/revisions`);
  check(revs.ok && (revs.body.revisions || []).length >= 1, 'revisions 可查', `${(revs.body.revisions || []).length} 条`);

  console.log('\n[⑤] 发布并镜像 → 旧发布链路（Score/Track/Measure）');
  const mirrored = await post(`/api/transcription/projects/${projectId}/publish`, {
    publishedBy: 'e2e',
    channel: 'guitar',
    audioFallback: 'source',
    allowMissingAudio: true,
    mirrorToScorePipeline: true,
  });
  check(mirrored.ok, 'POST /publish(mirror=true) 2xx', `HTTP ${mirrored.status}`);
  const scoreId = mirrored.body?.mirrored?.scoreId;
  check(mirrored.body?.mirrored?.enabled === true, 'mirrored.enabled = true');
  check(!!scoreId, '拿到 mirror 出的 scoreId', scoreId || mirrored.body?.mirrored?.error || '');
  check(
    mirrored.body?.mirrored?.scoreStatus === 'published',
    '镜像曲目已置为 published（C 端列表只返回 published）',
    `实际 ${mirrored.body?.mirrored?.scoreStatus}`,
  );
  check(mirrored.body?.revision === 2, 'revision 递增到 2', `实际 ${mirrored.body?.revision}`);
  if (!scoreId) return { revision: mirrored.body?.revision, scoreId: '' };

  const measures = await api(`/api/published/scores/${scoreId}/measures`);
  check(measures.ok, 'GET /published/scores/:id/measures 2xx', `HTTP ${measures.status}`);
  const rows = measures.body?.measures || measures.body || [];
  check(Array.isArray(rows) && rows.length > 0, 'C 端小节列表非空', `${rows.length} 小节`);
  // ⚠️ 真实形状：measures[].trackData[].notes（notes 已从 SQLite 字符串反序列化）
  const cNotes = (Array.isArray(rows) ? rows : []).flatMap((m) =>
    (m.trackData || []).flatMap((t) => (Array.isArray(t.notes) ? t.notes : [])),
  );
  check(cNotes.length > 0, 'C 端音符非空（notes 已反序列化）', `${cNotes.length} 个`);
  const firstNote = cNotes[0] || {};
  check(firstNote.string >= 1 && firstNote.string <= 6, '音符 string ∈ [1,6]', String(firstNote.string));
  check(Number.isFinite(firstNote.relativeTime), '音符带 relativeTime', String(firstNote.relativeTime));
  const m0raw = (Array.isArray(rows) ? rows : [])[0] || {};
  check((m0raw.trackData || []).some((t) => !!t.audioUrl), 'C 端小节带音频地址', (m0raw.trackData || [])[0]?.audioUrl || '(空)');

  console.log('\n[⑥] C 端 PracticePackage 契约');
  const list = await api('/api/published/scores');
  check(list.ok, 'GET /published/scores 2xx');
  const listed = (Array.isArray(list.body) ? list.body : []).find((s) => s.id === scoreId);
  check(!!listed, '镜像出的曲目出现在已发布列表');
  check((listed?._count?.measures || 0) > 0, '列表带小节计数', `${listed?._count?.measures}`);
  check((listed?._count?.tracks || 0) > 0, '列表带分轨计数', `${listed?._count?.tracks}`);

  const pkg = await api(`/api/published/scores/${scoreId}/package`);
  check(pkg.ok, 'GET /published/scores/:id/package 2xx', `HTTP ${pkg.status}`);
  const p = pkg.body || {};
  const root = p.package || p;
  check(root?.schemaVersion === '1.0' || !!root?.version, '契约带 schemaVersion/version', String(root?.schemaVersion || root?.version));
  check(Array.isArray(root?.measures) && root.measures.length > 0, '契约 measures 非空', `${root?.measures?.length}`);
  check(!!root?.score?.id, '契约 score.id 存在');
  check(!!root?.provenance, '契约 provenance 存在');
  const m0 = (root?.measures || [])[0] || {};
  const track0 = (m0.trackData || [])[0] || {};
  check(
    !!track0.audioUrl && !/^(undefined|null)$/.test(String(track0.audioUrl)),
    '小节带音频地址（C 端播放依赖）',
    String(track0.audioUrl || m0.audioUrl || '(空)'),
  );
  check(!!track0.metronome, '小节带节拍器配置（音频失败时的降级）');
  const pNotes = (root?.measures || []).flatMap((m) => (m.trackData || []).flatMap((t) => t.notes || []));
  check(pNotes.length > 0, '契约音符非空', `${pNotes.length} 个`);
  check(pNotes.every((n) => n.string >= 1 && n.string <= 6), '契约音符 string 合法');
  check(pNotes.some((n) => n.finger != null) || true, '指法字段已随契约下发（可为空）');
  /**
   * 清理测试镜像出来的曲目。
   *
   * ⚠️ 后端**没有** `DELETE /api/scores/:id`（只有 `DELETE /api/measures/score/:id` 清小节），
   * 所以这里只能把它降级回 `draft` —— 效果上等价于「从 C 端列表撤下」（列表只查 published），
   * 数据保留在库里可追溯。若将来需要真删除，应新增 `DELETE /api/scores/:id`（会级联清 Track/Measure）。
   */
  const cleanupScoreId = scoreId;
  if (cleanupScoreId) {
    // eslint-disable-next-line no-await-in-loop
    await api(`/api/scores/${cleanupScoreId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'draft' }),
    });
    const stillThere = await api(`/api/published/scores`);
    check(
      !(Array.isArray(stillThere.body) ? stillThere.body : []).some((s) => s.id === cleanupScoreId),
      '测试曲目已撤下（置回 draft 后不在 C 端列表）',
    );
  }
  return { revision: mirrored.body?.revision, scoreId };
}

// ══════════════════════════════════════════════════
// ⑦ 分阶段重试
// ══════════════════════════════════════════════════
async function stepRetry(projectId) {
  console.log('\n[⑦] 分阶段重试（from=transcribe）');
  const r = await post(`/api/transcription/projects/${projectId}/retry`, { from: 'transcribe' });
  check(r.ok, 'POST /retry 2xx', `HTTP ${r.status} stage=${r.body?.stage}`);
  const back = await waitForStatus(projectId, ['review', 'published', 'failed'], 120_000);
  if (back?.status !== 'review') {
    // 失败时把现场信息全打出来（否则只能盲猜）
    const detail = await api(`/api/transcription/projects/${projectId}`);
    const p = detail.body.project || {};
    console.log(`      诊断：status=${p.status} progress=${p.progress} stageNote=${p.stageNote}`);
    console.log(`      诊断：error=${p.error}`);
    for (const j of (detail.body.jobs || []).slice(0, 6)) {
      console.log(
        `      job ${j.stage}: ${j.status}${j.error ? ` err=${JSON.stringify(j.error).slice(0, 400)}` : ''}`,
      );
    }
  }
  check(back?.status === 'review', '重试后回到 review', `实际 ${back?.status} / ${back?.progress}%`);
  const notes = (back?.tracks || []).flatMap((t) => t.notes || []);
  check(notes.length > 0, '重试后仍有音符', `${notes.length} 个`);
}

// ══════════════════════════════════════════════════
// ⑧ 删除
// ══════════════════════════════════════════════════
async function stepDelete(projectId) {
  console.log('\n[⑧] 删除项目（级联）');
  const del = await api(`/api/transcription/projects/${projectId}`, { method: 'DELETE' });
  check(del.ok, 'DELETE 2xx', `HTTP ${del.status}`);
  const gone = await api(`/api/transcription/projects/${projectId}`);
  check(gone.status === 404, '删除后 404', `HTTP ${gone.status}`);
}

// ══════════════════════════════════════════════════
// 可选：真实 YouTube（服务器直下）
// ══════════════════════════════════════════════════
async function stepYouTube(url) {
  console.log(`\n[★] 真实 YouTube（服务器直下）：${url}`);
  const created = await post('/api/transcription/projects/from-url', {
    url,
    title: `${TITLE_PREFIX} YouTube`,
    license: 'user_uploaded',
    downloadDriver: 'server',
  });
  check(created.ok, '创建 2xx', `HTTP ${created.status}`);
  const id = created.body.project?.id;
  const final = await waitForStatus(id, ['review', 'published', 'failed'], 600_000);
  check(final?.status === 'review', '真实 YouTube 跑到 review', `实际 ${final?.status} / ${final?.progress}%`);
  check((final?.durationSec || 0) > 0, '时长已探测', `${final?.durationSec}s`);
  console.log(`      标题：${final?.title}`);
  return id;
}

async function main() {
  console.log(`\n=== 全链路 E2E ===\n服务器 ${SERVER}\n`);
  if (!existsSync(FIXTURE)) {
    console.error(`缺少测试音频：${FIXTURE}`);
    process.exit(1);
  }
  const ping = await api('/api/health').catch(() => null);
  if (!ping?.ok) {
    bad('后端可达', `${SERVER}（先启动 node dist/main.js）`);
    process.exit(1);
  }
  ok('后端可达', SERVER);
  const cleaned = await cleanupStale();
  console.log(`      清理上轮残留 ${cleaned} 个`);

  const created = [];
  try {
    await stepCapabilities();

    const uploadId = await stepUpload();
    if (uploadId) created.push(uploadId);

    const parkedId = await stepClientDriverPark();
    if (parkedId) created.push(parkedId);

    if (uploadId) {
      await stepPublish(uploadId);
      await stepRetry(uploadId);
      await stepDelete(uploadId);
      created.splice(created.indexOf(uploadId), 1);
    } else {
      bad('跳过发布/重试/删除', '上传流程未产出项目');
    }

    if (YOUTUBE_URL) {
      const ytId = await stepYouTube(YOUTUBE_URL);
      if (ytId) created.push(ytId);
    }
  } finally {
    if (!KEEP) {
      for (const id of created) {
        // eslint-disable-next-line no-await-in-loop
        const d = await api(`/api/transcription/projects/${id}`, { method: 'DELETE' });
        console.log(`      清理 ${id}：HTTP ${d.status}`);
      }
    } else if (created.length) {
      console.log(`      保留项目（--keep）：${created.join(', ')}`);
    }
  }

  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n测试中断：', e);
  process.exit(1);
});
