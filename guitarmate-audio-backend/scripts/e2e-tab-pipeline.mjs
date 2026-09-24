#!/usr/bin/env node
/**
 * 端到端链路验证：外部谱面 → 统一 JSON → 曲目工程 → 发布 → C 端契约
 * ==================================================================
 *
 * 前置：后端已启动（`node dist/main.js`）
 *
 * 用法：
 *   node scripts/e2e-tab-pipeline.mjs
 *   node scripts/e2e-tab-pipeline.mjs --sample chord-sheet-demo
 *
 * 验证内容：
 *   1. GET  /api/tab-import/formats              能力清单
 *   2. POST /api/tab-import/samples/:id/parse    解析 → TabProject + 发布就绪小节
 *   3. POST /api/tab-import/save                 落库（自动建 Score/Track + 写入谱面元数据）
 *   4. POST /api/measures/publish                无音频 → audioFallback=metronome 占位音频
 *   5. GET  /api/published/scores/:id/package    ★ C 端契约里能看到小节 + 元数据
 *   6. 抽查第 1 小节音频可访问性（HEAD）
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';
const sampleArgIdx = process.argv.indexOf('--sample');
const SAMPLE_ID = sampleArgIdx > -1 ? process.argv[sampleArgIdx + 1] : 'ascii-study';

const errors = [];
const log = (...a) => console.log(...a);
const ok = (m) => log(`  ✅ ${m}`);
const bad = (m) => {
  log(`  ❌ ${m}`);
  errors.push(m);
};

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

(async () => {
  log(`\n🎸 GuitarMate 导入链路验证 @ ${BASE}`);
  log('='.repeat(72));

  const health = await req('GET', '/api/health').catch(() => null);
  if (!health || !health.ok) {
    log(`❌ 后端未启动或不可访问（${BASE}）。请先运行：node dist/main.js`);
    process.exit(1);
  }
  log(`\n[0] 健康检查 → ${JSON.stringify(health.json)}`);

  // 1. 能力清单
  log('\n[1] GET /api/tab-import/formats');
  const formats = await req('GET', '/api/tab-import/formats');
  if (formats.ok) {
    for (const f of formats.json.formats) ok(`${f.label.padEnd(34)} 精度=${f.rhythmAccuracy}`);
  } else bad(`HTTP ${formats.status}`);

  // 2. 解析示例
  log(`\n[2] POST /api/tab-import/samples/${SAMPLE_ID}/parse`);
  const preview = await req('POST', `/api/tab-import/samples/${SAMPLE_ID}/parse`, {});
  if (!preview.ok) {
    bad(`HTTP ${preview.status} ${JSON.stringify(preview.json).slice(0, 400)}`);
    process.exit(1);
  }
  const p = preview.json;
  const d = p.diagnostics;
  ok(`格式=${p.format} 小节=${d.measureCount} 音符=${d.noteCount} 和弦=${d.chordCount} 横按=${d.barreCount}`);
  ok(`BPM=${d.bpm} 拍号=${d.timeSignature} 调弦=${d.tuning} 时长=${d.durationSec}s`);
  ok(`发布就绪小节=${p.measures.length}，第 1 小节音符=${p.measures[0]?.notes.length}`);
  ok(`版权判定=${p.copyright.tier} publishable=${p.copyright.publishable}`);
  ok(`谱面元数据将写入：key=${p.project.meta.key ?? '-'} capo=${p.project.capo} license=${p.project.source.rights}`);
  if (!p.measures.length) bad('解析结果没有任何可发布小节');
  if (!p.measures[0]?.notes.length) bad('第 1 小节没有音符');

  // 3. 保存（复用同一个 [E2E] 测试曲目，避免把开发库塞满）
  log('\n[3] POST /api/tab-import/save');
  const existing = await req('GET', '/api/scores');
  const testScore = Array.isArray(existing.json)
    ? existing.json.find((s) => (s.title || '').startsWith('[E2E]'))
    : null;
  if (testScore) ok(`复用已有测试曲目《${testScore.title}》(${testScore.id})`);

  const saved = await req('POST', '/api/tab-import/save', {
    scoreId: testScore?.id,
    newScore: {
      title: `[E2E] ${p.project.meta.title}`,
      artist: p.project.meta.artist || 'E2E',
      bpm: p.project.meta.bpm,
      timeSignature: p.project.meta.timeSignature,
    },
    project: p.project,
    fileName: `e2e-${SAMPLE_ID}.tabproject`,
  });
  if (!saved.ok) {
    bad(`HTTP ${saved.status} ${JSON.stringify(saved.json).slice(0, 400)}`);
    process.exit(1);
  }
  const s = saved.json;
  ok(`scoreId=${s.scoreId} trackId=${s.trackId}`);
  ok(`TabProject 落盘：${s.projectPath}`);
  ok(`写入谱面元数据：${JSON.stringify(s.appliedMetadata)}`);
  ok(`可发布小节=${s.publishPayloadTemplate.measures.length} fallback=${s.publishPayloadTemplate.audioFallback}`);
  if (!s.appliedMetadata?.tuning?.length) bad('调弦没有写入曲目元数据');
  if (!s.appliedMetadata?.license) bad('授权状态没有写入曲目元数据');

  // 4. 发布（无音频 → 节拍器占位）
  log('\n[4] POST /api/measures/publish （无音频 → 节拍器占位）');
  const cleared = await req('DELETE', `/api/measures/score/${s.scoreId}`);
  if (cleared.ok) ok(`先清空旧的已发布小节：deleted=${cleared.json.deleted}`);

  const publish = await req('POST', '/api/measures/publish', {
    ...s.publishPayloadTemplate,
    trackAudioPath: 'uploads/demo/__e2e_not_exist.wav',
    allowMissingAudio: true,
    audioFallback: 'metronome',
  });
  if (!publish.ok) {
    bad(`HTTP ${publish.status} ${JSON.stringify(publish.json).slice(0, 600)}`);
    process.exit(1);
  }
  const pr = publish.json;
  ok(`已发布 ${pr.measures.length} 个小节 · 声道=${pr.channel}`);
  ok(`节拍器占位小节=${pr.metronomeFallbackCount ?? 0} 降级小节=${pr.degradedAudioCount ?? 0}`);
  if ((pr.metronomeFallbackCount ?? 0) !== pr.measures.length) {
    bad(`期望全部小节都走节拍器占位，实际 ${pr.metronomeFallbackCount}`);
  }

  // 5. C 端契约
  log('\n[5] GET /api/published/scores/:id/package ★ C 端读的就是这个');
  const pkgRes = await req('GET', `/api/published/scores/${s.scoreId}/package`);
  if (!pkgRes.ok) {
    bad(`HTTP ${pkgRes.status}`);
  } else {
    const pkg = pkgRes.json;
    ok(`schemaVersion=${pkg.schemaVersion} 小节=${pkg.measures.length} 分轨=${pkg.tracks.length}`);
    ok(
      `score：key=${pkg.score.key ?? '-'} capo=${pkg.score.capo} tuning=${(pkg.score.tuning || []).join(' ')} difficulty=${pkg.score.difficulty}`,
    );
    ok(`provenance：source=${pkg.provenance.source} license=${pkg.provenance.license} review=${pkg.provenance.humanReviewLevel}`);

    const withNotes = pkg.measures.filter((m) => (m.trackData?.[0]?.notes || []).length > 0).length;
    ok(`${withNotes}/${pkg.measures.length} 个小节带音符节点`);

    const m0 = pkg.measures[0];
    const td0 = m0?.trackData?.[0];
    const n0 = td0?.notes?.[0];
    if (n0) {
      ok(
        `第 1 小节首音符：string=${n0.string} fret=${n0.fret} pitch=${n0.pitch} relativeTime=${n0.relativeTime}s x=${n0.x} y=${n0.y} technique=${n0.technique}`,
      );
    } else bad('契约里第 1 小节没有音符');
    ok(`第 1 小节 barres=${m0?.barres?.length ?? 0} chords=${m0?.chords?.length ?? 0}`);

    // 契约不变量：每个分轨必须有 audioUrl 或 metronome 之一，否则 C 端会「点了没声音」
    // （节拍器占位发布后有 audioUrl，此时 metronome.enabled=false 但仍会下发配置供降级）
    const trackOk = pkg.measures.every((m) =>
      m.trackData.every(
        (td) =>
          (typeof td.audioUrl === 'string' && td.audioUrl.length > 0) ||
          td.metronome?.enabled === true,
      ),
    );
    if (trackOk) ok('每个分轨都有 audioUrl 或 metronome（不会静音）');
    else bad('存在既无 audioUrl 也无 metronome 的分轨（C 端会静音）');

    const hasMetronomeConfig = pkg.measures.every((m) =>
      m.trackData.every((td) => td.metronome && typeof td.metronome.bpm === 'number'),
    );
    if (hasMetronomeConfig) {
      ok(`节拍器配置始终下发（第 1 小节：${JSON.stringify(td0?.metronome)}）→ 音频失效时可即时降级`);
    } else {
      bad('部分分轨没有下发 metronome 配置，音频失效时无法降级');
    }

    // 顺序不变量
    const sortedIndex = pkg.measures.every((m, i) => i === 0 || m.index >= pkg.measures[i - 1].index);
    if (sortedIndex) ok('measures 按 index 升序');
    else bad('measures 未按 index 升序');
    const sortedNotes = pkg.measures.every((m) =>
      (m.trackData?.[0]?.notes || []).every(
        (n, i, arr) => i === 0 || n.relativeTime >= arr[i - 1].relativeTime - 1e-6,
      ),
    );
    if (sortedNotes) ok('各小节 notes 按 relativeTime 升序');
    else bad('notes 未按 relativeTime 升序');

    // 6. 音频可达性
    const audioUrl = td0?.audioUrl;
    log(`\n[6] 抽查小节音频可访问性：${audioUrl}`);
    if (!audioUrl) {
      ok('该小节无音频，C 端走节拍器模式（符合预期）');
    } else {
      try {
        const head = await fetch(audioUrl, { method: 'HEAD' });
        if (head.ok) ok(`HTTP ${head.status} ${head.headers.get('content-type')} ${head.headers.get('content-length')} bytes`);
        else bad(`音频不可访问 HTTP ${head.status}`);
      } catch (err) {
        bad(`音频请求失败：${err.message}`);
      }
    }
  }

  log('\n' + '='.repeat(72));
  if (errors.length > 0) {
    log(`💥 链路验证存在 ${errors.length} 个失败项`);
    process.exit(1);
  }
  log('🎉 链路验证全部通过：外部谱面 → 统一 JSON → 入库（含元数据）→ 发布 → C 端契约可见');
  log('');
})();
