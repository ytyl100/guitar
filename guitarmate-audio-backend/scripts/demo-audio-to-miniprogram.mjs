/**
 * 端到端演示：真实吉他音频 → 六线谱 → 小程序端可练
 * ================================================
 *
 * 一条命令跑完整条链路（每一步都在后端真实发生，没有绕过）：
 *
 * ```
 *  ① 上传真实录音（WAV/MP3/FLAC，base64）
 *  ② separate  队列阶段（未装 Demucs 时用源音频当 guitar 分轨）
 *  ③ transcribe 内置 YIN 真实转录：基频 → 音符，起音包络 → BPM，色度+模板 → 和弦
 *  ④ convert    真实 MIDI → midi_to_tab.py → TabProject（弦/品 + 小节切分）
 *                ↓ 左手指法/把位推定 + 音频和弦时间线映射到小节
 *  ⑤ publish    按小节切音频切片 → OSS/本地 → PracticePackage（schemaVersion 1.0）
 *  ⑥ mirror     回写旧链路（Score/Track/Measure）并置为 published → 小程序端可见
 * ```
 *
 * 同时用 `uploads/demo/solo_am_f_c_g.reference.json`（生成样品时的**真值标注**）
 * 定量核对转录质量：音高准确率、和弦准确率。
 *
 * 用法：
 *
 * ```bash
 * npm run demo:solo          # ① 先生成样品（只需一次）
 * node dist/main.js          # ② 启动后端
 * npm run demo:pipeline      # ③ 跑完整条链路
 * ```
 *
 * 想用自己的录音：`npm run demo:pipeline -- --wav D:\path\to\your.mp3`
 */

import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = process.env.API_BASE ?? 'http://localhost:3000';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback;
};

const wavPath = argValue('wav', join(ROOT, 'uploads', 'demo', 'solo_am_f_c_g.wav'));
const referencePath = argValue('reference', join(ROOT, 'uploads', 'demo', 'solo_am_f_c_g.reference.json'));
const keep = argv.includes('--keep');
/** 不置为 published（默认置为 published，否则小程序端列表里看不到） */
const noPromote = argv.includes('--no-promote');

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${name}${detail ? `  \u001b[90m${detail}\u001b[0m` : ''}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}  ${detail}`);
  }
};

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────
console.log('\n\u001b[1m🎸 真实音频 → 六线谱 → 小程序端 端到端演示\u001b[0m');
console.log(`  API ：${API}`);
console.log(`  音频：${wavPath}\n`);

if (!existsSync(wavPath)) {
  console.error('找不到样品音频。先运行：npm run demo:solo（或 --wav 指定自己的录音）');
  process.exit(1);
}
const reference = existsSync(referencePath) ? JSON.parse(readFileSync(referencePath, 'utf-8')) : null;

// ── ⓪ 健康检查 ───────────────────────────────
console.log('\u001b[1m[0] 后端与能力探测\u001b[0m');
const health = await api('/api/health');
check('后端可访问', health?.status === 'ok', `uptime=${Math.round(health?.uptime ?? 0)}s`);
const caps = await api('/api/transcription/capabilities');
const stages = caps?.capabilities ?? caps?.stages ?? caps;
console.log(
  `     \u001b[90mBasic Pitch=${caps?.basicPitch?.available ?? caps?.capabilities?.basicPitch?.available ?? '?'} · ` +
    `ffmpeg=${caps?.ffmpeg?.available ?? '?'} · 队列=${caps?.queue?.driver ?? caps?.driver ?? '?'}\u001b[0m`,
);
check('解码器（ffmpeg）可用 —— 内置转录的前提', !!(caps?.ffmpeg?.available ?? caps?.capabilities?.ffmpeg?.available));

// ── ① 上传真实音频 ─────────────────────────────
console.log('\n\u001b[1m[1] 上传真实录音\u001b[0m');
const audio = readFileSync(wavPath);
const base64 = audio.toString('base64');
const fileName = basename(wavPath);
const created = await api('/api/transcription/projects/upload', {
  method: 'POST',
  body: JSON.stringify({
    title: reference?.title ?? fileName.replace(/\.[^.]+$/, ''),
    artist: reference?.artist ?? '本地录音',
    fileName,
    base64,
    // 不给 BPM，让内置分析自己估 —— 展示「真的在听音频」
    timeSignature: reference?.timeSignature ?? '4/4',
    license: reference?.license ?? 'public_domain',
  }),
});
const projectId = created?.project?.id ?? created?.id;
check('项目已创建', !!projectId, `${projectId} · ${(audio.length / 1024 / 1024).toFixed(2)}MB`);
check('音频已落盘（可通过 HTTP 访问）', !!created?.project?.audioUrl || !!created?.audioUrl, created?.project?.audioUrl ?? created?.audioUrl ?? '');
const projectUrl = created?.project?.audioUrl ?? created?.audioUrl ?? '';

// ── ② 启动流水线 ───────────────────────────────
console.log('\n\u001b[1m[2] 启动流水线（separate → transcribe → convert）\u001b[0m');
await api(`/api/transcription/projects/${projectId}/start`, { method: 'POST', body: JSON.stringify({}) });

const startedAt = Date.now();
let detail = null;
for (;;) {
  detail = await api(`/api/transcription/projects/${projectId}`);
  const p = detail?.project ?? detail;
  const status = p?.status;
  const stagesText = (p?.jobs ?? detail?.jobs ?? [])
    .map((j) => `${j.stage}:${j.status}`)
    .join(' ');
  process.stdout.write(
    `\r     [${((Date.now() - startedAt) / 1000).toFixed(1)}s] status=${status} progress=${p?.progress ?? '?'}% ${stagesText}`.padEnd(120),
  );
  if (status === 'review' || status === 'published' || status === 'failed') break;
  if (Date.now() - startedAt > 120000) break;
  await sleep(600);
}
console.log('');
const project = detail?.project ?? detail;
check('流水线未失败', project?.status !== 'failed', project?.stageNote ?? '');
check('已进入待复核状态', project?.status === 'review' || project?.status === 'published', `status=${project?.status}`);

// ── ③ 转录质量（对真值）───────────────────────
const tab = project?.tabProject;
const track = tab?.tracks?.[0];
const measures = track?.measures ?? [];
const notes = measures.flatMap((m) => m.notes ?? []);
const mark = (detail?.project ?? detail)?.tracks?.[0] ?? null;
const meta = mark ?? null;

console.log('\n\u001b[1m[3] 转录产物\u001b[0m');
check('生成了 TabProject', !!tab && measures.length > 0, `${measures.length} 小节 / ${notes.length} 音符`);
check('用的是内置真实转录引擎（不是模拟器）', meta?.engine === 'node-yin' && meta?.simulated === false, `engine=${meta?.engine} simulated=${meta?.simulated}`);const detectedBpm = meta?.analysis?.bpm ?? project?.bpm;
if (reference) {
  const err = Math.abs(detectedBpm - reference.bpm) / reference.bpm;
  check(`BPM 自动估计（真值 ${reference.bpm}）`, detectedBpm > 0 && err <= 0.06, `估计 ${detectedBpm}（误差 ${(err * 100).toFixed(1)}%）`);
}
check(
  '每个音符都带左手指法 0-4',
  notes.length > 0 && notes.every((n) => typeof n.finger === 'number' && n.finger >= 0 && n.finger <= 4),
  `${notes.filter((n) => typeof n.finger === 'number').length}/${notes.length}`,
);
const withPosition = measures.filter((m) => typeof m.position === 'number' && m.position >= 1).length;
check('每个小节都标了把位', withPosition === measures.length && withPosition > 0, `${withPosition}/${measures.length}`);
check(
  '不变式 finger = 品位 − 手位 + 1（空弦除外）',
  (() => {
    const violations = [];
    for (const m of measures) {
      for (const n of m.notes ?? []) {
        if (n.fret === 0) continue;
        const position = Number.isFinite(Number(n.position)) ? Number(n.position) : Number(m.position);
        if (!Number.isFinite(position) || position < 1) {
          violations.push(`m${m.index + 1} 无手位`);
          continue;
        }
        if (n.finger !== n.fret - position + 1) {
          violations.push(`m${m.index + 1} fret=${n.fret} finger=${n.finger} pos=${position}`);
        }
      }
    }
    globalThis.__fingerViolations = violations;
    return violations.length === 0;
  })(),
  `${notes.filter((n) => n.fret === 0 || typeof n.position === 'number').length}/${notes.length} 个音符合格`,
);
check(
  '音符级手位已下发（换把处能反推出品位）',
  notes.every((n) => typeof n.position === 'number' && n.position >= 1),
  `手位 ${[...new Set(notes.map((n) => n.position))].sort((a, b) => a - b).join('/')}`,
);
const chordNames = [...new Set(measures.flatMap((m) => (m.chords ?? []).map((c) => c.name)))];
check('识别出和弦（写进谱面上方）', chordNames.length > 0, chordNames.join(' / ') || '(无)');

if (reference) {
  /**
   * 音高准确率：按**音高 + 时间窗**匹配（而不是「时间最近的未用音符」）——
   * 后者会被量化带来的几十毫秒偏移与偶发多余音符带偏，
   * 而这里要回答的是「音频里的音有没有被正确地听出来」。
   * 时间窗取量化网格的半格（1/16 音符 ≈ 78ms）再留点余量。
   */
  const openStrings = [64, 59, 55, 50, 45, 40];
  const windowSec = 0.2;
  const used = new Set();
  let matched = 0;
  for (const truth of reference.notes) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    notes.forEach((n, i) => {
      if (used.has(i)) return;
      const absoluteSec = (measures.find((m) => (m.notes ?? []).includes(n))?.startTime ?? 0) + n.offsetSec;
      const delta = Math.abs(absoluteSec - truth.startSec);
      if (delta > windowSec) return;
      const pitch = openStrings[n.string - 1] + n.fret + (tab?.meta?.capo ?? 0);
      if (pitch !== truth.midi) return;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matched += 1;
    }
  }
  const accuracy = matched / reference.notes.length;
  check('音高准确率 ≥ 85%（真值逐音比对）', accuracy >= 0.85, `${(accuracy * 100).toFixed(1)}%（${matched}/${reference.notes.length}）`);
  const extras = notes.length - used.size;
  check(
    '没有大量多余音符（假阳性 ≤ 15%）',
    extras <= reference.notes.length * 0.15,
    `多余 ${extras} 个（转录 ${notes.length} · 真值 ${reference.notes.length}）`,
  );
  check(
    '转录出来的音高与真值音域一致',
    notes.every((n) => n.fret >= 0 && n.fret <= 19),
    `品位范围 ${Math.min(...notes.map((n) => n.fret))}-${Math.max(...notes.map((n) => n.fret))}`,
  );
}

// ── ④ 发布（切音频 + 生成 PracticePackage）───
console.log('\n\u001b[1m[4] 发布：按小节切音频 + 生成 PracticePackage\u001b[0m');
/**
 * 复用上一次演示留下的同名曲目（而不是新建）。
 * 否则每跑一次演示，小程序端曲库就多一条同名曲目。
 */
const existingScores = await api('/api/published/scores');
const demoTitle = reference?.title ?? '';
const reuse =
  (existingScores ?? []).find((s) => demoTitle && s.title === demoTitle) ??
  (existingScores ?? []).find((s) => String(s.title).includes('[E2E]'));
if (reuse) console.log(`     \u001b[90m复用已有曲目：${reuse.title}（${reuse.id}）\u001b[0m`);
const publish = await api(`/api/transcription/projects/${projectId}/publish`, {
  method: 'POST',
  body: JSON.stringify({
    publishedBy: 'demo',
    channel: 'guitar',
    audioFallback: 'source',
    allowMissingAudio: true,
    // 回写旧链路，让小程序端（读 /api/published/scores）能看到这条曲子
    mirrorToScorePipeline: true,
    ...(reuse ? { mirrorScoreId: reuse.id } : {}),
  }),
});
check('发布成功', !!publish?.success, `revision=${publish?.revision} · ${publish?.stats?.measureCount} 小节 / ${publish?.stats?.noteCount} 音符`);
check(
  '音频按小节切片',
  (publish?.stats?.slicedAudioCount ?? 0) > 0,
  `切片 ${publish?.stats?.slicedAudioCount} 段 · 降级 ${publish?.stats?.degradedAudioCount} 段 · 节拍器占位 ${publish?.stats?.metronomeFallbackCount} 段`,
);
const scoreId = publish?.mirrored?.scoreId ?? publish?.scoreId;
check('已镜像到旧链路（Score/Track/Measure）', !!scoreId, scoreId ?? '(无)');

const pkg = await api(`/api/published/scores/${scoreId}/package`);
const pkgMeasures = pkg?.measures ?? [];
const pkgNotes = pkgMeasures.flatMap((m) => (m.trackData ?? []).flatMap((t) => t.notes ?? []));
console.log('\n\u001b[1m[5] C 端契约（小程序端读的就是这个）\u001b[0m');
check('schemaVersion = 1.0', pkg?.schemaVersion === '1.0', pkg?.schemaVersion);
check('小节按 index 升序', pkgMeasures.every((m, i) => i === 0 || m.index > pkgMeasures[i - 1].index), `${pkgMeasures.length} 小节`);
check('每个小节都有音频或节拍器兜底', pkgMeasures.every((m) => (m.trackData ?? []).some((t) => t.audioUrl) || m.metronome?.enabled));
check(
  '契约下发左手指法',
  pkgNotes.length > 0 && pkgNotes.every((n) => typeof n.finger === 'number'),
  `${pkgNotes.filter((n) => typeof n.finger === 'number').length}/${pkgNotes.length}`,
);
check('契约下发小节把位', pkgMeasures.every((m) => typeof m.position === 'number' && m.position >= 1), pkgMeasures.map((m) => m.position).join(','));
const pkgChords = pkgMeasures.flatMap((m) => (m.chords ?? []).map((c) => c.chordName));
check('契约下发和弦名', pkgChords.length > 0, [...new Set(pkgChords)].join(' / '));
check(
  '和弦坐标在 0-1（谱面上方定位用）',
  pkgMeasures.every((m) => (m.chords ?? []).every((c) => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1)),
);
check(
  '音符归一化坐标合法（y = (弦-1)/5）',
  pkgNotes.every((n) => n.x >= 0 && n.x <= 1 && Math.abs(n.y - (n.string - 1) / 5) < 1e-6),
);
const audioFirst = pkgMeasures[0]?.trackData?.[0]?.audioUrl;
if (audioFirst) {
  const head = await fetch(audioFirst, { method: 'HEAD' });
  check('小节音频可访问', head.ok, audioFirst.split('/').pop());
}

// ── ⑥ 小程序端可见性 ───────────────────────────
console.log('\n\u001b[1m[6] 小程序端可见性\u001b[0m');
if (!noPromote) {
  const score = await api(`/api/scores/${scoreId}`);
  if ((score?.status ?? 'draft') !== 'published') {
    await api(`/api/scores/${scoreId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
  }
  const published = await api('/api/published/scores');
  const hit = (published ?? []).find((s) => s.id === scoreId);
  check('已出现在 /api/published/scores（小程序端曲库）', !!hit, hit ? `${hit.title} · ${hit.measureCount ?? '?'} 小节` : '未出现');

  const frontend = argValue('frontend', 'http://127.0.0.1:5199');
  console.log(`\n\u001b[1m🎼 打开小程序端\u001b[0m`);
  console.log(`   1. 启动模拟器：cd guitarmate-frontend && npx vite --port 5199`);
  console.log(`   2. 打开 ${frontend} → 任选一首歌进入详情页`);
  console.log(`   3. 「云端六线谱小节练习」里把曲目切到《${hit?.title ?? '演示曲目'}》`);
  console.log(`      → 谱面：TAB 谱号 / 拍号 / ♪=BPM / 小节号（右上）/ 把位「N 把位」（左上）`);
  console.log(`      → 弦线数字 = 手指数（1食指·2中指·3无名指·4小指·○空弦），和弦名在弦线上方`);
  console.log(`      → 点 PLAY 跟着真实录音切片练习（每小节一段音频）`);
}

if (!keep) {
  console.log('\n\u001b[1m[7] 清理\u001b[0m');
  await api(`/api/transcription/projects/${projectId}`, { method: 'DELETE' });
  check('演示项目已删除（--keep 可保留）', true, projectId);
} else {
  console.log(`\n\u001b[1m[7] 保留演示数据\u001b[0m\n  projectId=${projectId}\n  scoreId=${scoreId}\n  音频=${projectUrl}`);
}

console.log(`\n\u001b[1m汇总\u001b[0m：${passed}/${passed + failed} 通过`);
if (failed > 0) {
  console.log(`\n\u001b[31m${failed} 项失败\u001b[0m\n`);
  process.exit(1);
}
console.log('\u001b[32m真实音频 → 六线谱 → 小程序端 全链路通过 ✅\u001b[0m\n');
