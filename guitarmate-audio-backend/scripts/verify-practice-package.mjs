#!/usr/bin/env node
/**
 * PracticePackage 契约校验器（运行时验证）
 * =======================================
 *
 * 作用：直接打后端接口，检查返回的 JSON **是否满足小程序端的数据契约**，
 * 避免「字段悄悄改名 / 坐标缺失 / 顺序错乱」这类问题在真机才暴露。
 *
 * 用法：
 *   node scripts/verify-practice-package.mjs                # 自动挑第一个有已发布小节的曲目
 *   node scripts/verify-practice-package.mjs --score=<id>   # 指定曲目
 *
 * 校验清单（对应小程序端 practicePackage.ts 的 validatePracticePackage）：
 *   1. schemaVersion 在版本白名单内
 *   2. 顶层必需字段：score / tracks / measures / assets / provenance
 *   3. score.id / title / bpm / timeSignature 合法
 *   4. measures 按 index 升序；每小节 duration > 0、trackData 非空
 *   5. 每个 trackData：有 audioUrl 或 metronome.enabled 至少其一（否则会「点了没声音」）
 *   6. 音符：按 relativeTime 升序、string 1-7、fret >= -1、x/y 在 0-1、confidence 0-1
 *   7. assets.audioFormat ∈ {mp3,wav,m4a}
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';
const scoreArg = process.argv.find((a) => a.startsWith('--score='));
const SCORE_ID = scoreArg ? scoreArg.split('=')[1] : '';

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const ok = (m) => console.log(`  ✅ ${m}`);

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
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
  console.log(`\n🧪 PracticePackage 契约校验 @ ${BASE}`);
  console.log('='.repeat(72));

  // ── 选曲目 ──
  let scoreId = SCORE_ID;
  if (!scoreId) {
    const list = await get('/api/published/scores');
    if (!list.ok) {
      console.log(`❌ 无法获取曲目列表（HTTP ${list.status}）—— 后端是否已启动？`);
      process.exit(1);
    }
    const withMeasures = (list.json || []).filter((s) => (s._count?.measures ?? 0) > 0);
    const target = withMeasures[0] || (list.json || [])[0];
    if (!target) {
      console.log('❌ 库里没有已发布曲目，请先在 CMS 发布一首曲目的小节。');
      process.exit(1);
    }
    scoreId = target.id;
    console.log(`\n[0] 自动选择曲目：《${target.title}》(${scoreId})、已发布小节 ${target._count?.measures ?? 0} 个`);
  } else {
    console.log(`\n[0] 指定曲目：${scoreId}`);
  }

  // ── 拉取 package ──
  const res = await get(`/api/published/scores/${scoreId}/package`);
  if (!res.ok) {
    console.log(`\n❌ GET /api/published/scores/${scoreId}/package → HTTP ${res.status}`);
    if (res.status === 404) {
      console.log('   该路由不存在：请确认后端已重新构建（nest build）并重启。');
    }
    console.log(JSON.stringify(res.json)?.slice(0, 400));
    process.exit(1);
  }

  const pkg = res.json;
  console.log('\n[1] 顶层结构');
  ok(`schemaVersion = ${pkg.schemaVersion}`);
  if (!['1.0'].includes(pkg.schemaVersion)) fail(`schemaVersion 不在白名单：${pkg.schemaVersion}`);
  for (const key of ['score', 'tracks', 'measures', 'assets', 'provenance']) {
    if (pkg[key] === undefined || pkg[key] === null) fail(`缺少必需字段 ${key}`);
  }
  ok(`字段齐全：score / tracks(${pkg.tracks?.length ?? 0}) / measures(${pkg.measures?.length ?? 0}) / assets / provenance`);
  ok(`publishedAt = ${pkg.publishedAt} · publishedBy = ${pkg.publishedBy}`);

  console.log('\n[2] score 元数据');
  ok(
    `《${pkg.score?.title}》 — ${pkg.score?.artist || '未知作者'} · ${pkg.score?.bpm}BPM · ${pkg.score?.timeSignature} · 调弦 ${(pkg.score?.tuning || []).join(' ')} · 难度 ${pkg.score?.difficulty}`,
  );
  if (!pkg.score?.id) fail('score.id 缺失');
  if (!(Number(pkg.score?.bpm) > 0)) warn('score.bpm 非法');

  console.log('\n[3] assets（数据与资源分离）');
  ok(`cdnBase=${pkg.assets?.cdnBase || '(空)'} audioFormat=${pkg.assets?.audioFormat} originalAudioUrl=${pkg.assets?.originalAudioUrl ? '已提供' : '未提供'}`);
  if (!['mp3', 'wav', 'm4a'].includes(pkg.assets?.audioFormat)) {
    fail(`assets.audioFormat 非法：${pkg.assets?.audioFormat}`);
  }
  if (/^data:/.test(JSON.stringify(pkg).slice(0, 2000))) {
    warn('响应中出现 data: 内联资源，契约要求只放 URL');
  }

  console.log('\n[4] measures 顺序与完整性');
  const measures = pkg.measures || [];
  const sortedByIndex = measures.every((m, i) => i === 0 || m.index >= measures[i - 1].index);
  if (!sortedByIndex) fail('measures 未按 index 升序');
  else ok(`measures 按 index 升序（${measures.length} 个小节）`);

  let noteTotal = 0;
  let barreTotal = 0;
  let chordTotal = 0;
  let metronomeMeasures = 0;
  let audioMeasures = 0;

  measures.forEach((m, i) => {
    if (!(Number(m.duration) > 0)) fail(`measures[${i}].duration 非法：${m.duration}`);
    if (!Array.isArray(m.trackData) || m.trackData.length === 0) {
      fail(`measures[${i}] 没有 trackData`);
      return;
    }
    m.trackData.forEach((td, j) => {
      const hasAudio = typeof td.audioUrl === 'string' && td.audioUrl.length > 0;
      const hasMetronome = !!td.metronome?.enabled;
      if (hasAudio) audioMeasures++;
      else if (hasMetronome) metronomeMeasures++;
      else fail(`measures[${i}].trackData[${j}] 既无 audioUrl 也无 metronome（会导致「点了没声音」）`);

      const notes = td.notes || [];
      noteTotal += notes.length;
      const sorted = notes.every((n, k) => k === 0 || n.relativeTime >= notes[k - 1].relativeTime - 1e-6);
      if (!sorted) fail(`measures[${i}].trackData[${j}].notes 未按 relativeTime 升序`);
      for (const n of notes) {
        if (!(n.string >= 1 && n.string <= 7)) fail(`measure ${i} 音符 string 非法：${n.string}`);
        if (!(n.fret >= -1 && n.fret <= 24)) fail(`measure ${i} 音符 fret 非法：${n.fret}`);
        if (!(n.x >= 0 && n.x <= 1)) warn(`measure ${i} 音符 x 越界：${n.x}`);
        if (!(n.y >= 0 && n.y <= 1)) warn(`measure ${i} 音符 y 越界：${n.y}`);
        if (!(n.confidence >= 0 && n.confidence <= 1)) warn(`measure ${i} 音符 confidence 越界：${n.confidence}`);
        if (n.technique && !/^(normal|hammer_on|pull_off|slide|bend|vibrato|harmonic|palm_mute|mute|tap)$/.test(n.technique)) {
          fail(`measure ${i} 音符 technique 不在契约枚举内：${n.technique}`);
        }
      }
    });
    barreTotal += (m.barres || []).length;
    chordTotal += (m.chords || []).length;
    if (m.trackData.some((td) => !td.audioUrl)) {
      if (!(m.trackData.some((td) => td.metronome?.enabled))) {
        fail(`measures[${i}] 无音频却没有 metronome 配置`);
      }
    }
  });

  ok(`音符 ${noteTotal} 个 · 横按 ${barreTotal} 个 · 和弦 ${chordTotal} 个`);
  ok(`有音频小节 ${audioMeasures} 个 · 节拍器小节 ${metronomeMeasures} 个`);
  if (noteTotal === 0) warn('所有小节都没有音符节点（C 端将只有空谱面）');

  console.log('\n[5] 抽查小节音频可达性（最容易踩的坑：URL 存在但文件已被清理）');
  const audioUrls = measures
    .flatMap((m) => m.trackData.map((td) => td.audioUrl))
    .filter((u) => typeof u === 'string' && u.length > 0);
  const sample = audioUrls.slice(0, 3);
  if (sample.length === 0) {
    warn('所有小节都没有 audioUrl —— C 端将全部走节拍器模式（纯谱面练习，功能正常）');
  }
  for (const url of sample) {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (head.ok) ok(`可达 ${head.status} ${url.slice(0, 96)}`);
      else
        warn(
          `音频不可达 HTTP ${head.status}：${url.slice(0, 96)} —— C 端会自动回退到节拍器（不静音），但请重新发布以修正数据`,
        );
    } catch (err) {
      warn(`音频请求失败：${url.slice(0, 96)}（${err.message}）`);
    }
  }

  console.log('\n[6] 抽样（第 1 小节第一条分轨）');
  const m0 = measures[0];
  const td0 = m0?.trackData?.[0];
  if (m0 && td0) {
    console.log(
      `  小节 index=${m0.index} label="${m0.label}" section=${m0.section ?? '-'} start=${m0.startTime}s end=${m0.endTime}s duration=${m0.duration}s`,
    );
    console.log(
      `  分轨 instrument=${td0.instrument} audioUrl=${td0.audioUrl ? td0.audioUrl.slice(0, 72) : 'null'} metronome=${td0.metronome ? JSON.stringify(td0.metronome) : '无'}`,
    );
    console.log(`  tabImageUrl=${td0.tabImageUrl || '(空 → 走矢量渲染)'}`);
    const n0 = (td0.notes || [])[0];
    if (n0) {
      console.log(
        `  第 1 个音符：string=${n0.string} fret=${n0.fret} pitch=${n0.pitch} relativeTime=${n0.relativeTime}s x=${n0.x} y=${n0.y} technique=${n0.technique ?? '-'} confidence=${n0.confidence}`,
      );
    }
  } else {
    warn('没有小节可抽样');
  }

  console.log('\n' + '='.repeat(72));
  if (warnings.length > 0) {
    console.log(`⚠️  警告 ${warnings.length} 条（不阻断渲染）：`);
    for (const w of warnings.slice(0, 10)) console.log(`     - ${w}`);
  }
  if (errors.length > 0) {
    console.log(`❌ 致命问题 ${errors.length} 条：`);
    for (const e of errors.slice(0, 15)) console.log(`     - ${e}`);
    console.log('\n💥 契约校验未通过');
    process.exit(1);
  }
  console.log('🎉 契约校验通过：该响应可被小程序端 PracticeMeasure 直接渲染');
  console.log('');
})();
