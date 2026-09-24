#!/usr/bin/env node
/**
 * 曲目元数据（license / tuning / capo / key / difficulty）往返验证
 * =============================================================
 *
 * 验证链路：`PATCH /api/scores/:id` → SQLite → `GET /api/published/scores/:id/package`
 * 即「后台填的元数据真的会出现在 C 端契约里」。
 *
 * 特性：**非破坏性** —— 测试前先读原始值，跑完自动还原。
 *
 * 用法：
 *   node scripts/verify-score-metadata.mjs            # 自动选第一首有已发布小节的曲目
 *   node scripts/verify-score-metadata.mjs --score=<id>
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';
const scoreArg = process.argv.find((a) => a.startsWith('--score='));
const argvScoreId = scoreArg ? scoreArg.split('=')[1] : '';

const errors = [];
const ok = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => {
  errors.push(m);
  console.log(`  ❌ ${m}`);
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
  console.log(`\n🏷️  曲目元数据往返验证 @ ${BASE}`);
  console.log('='.repeat(72));

  // ── 选曲目 ──
  let scoreId = argvScoreId;
  if (!scoreId) {
    const list = await req('GET', '/api/published/scores');
    if (!list.ok) {
      console.log(`❌ 无法获取曲目列表（HTTP ${list.status}），后端是否已启动？`);
      process.exit(1);
    }
    const target = (list.json || []).find((s) => (s._count?.measures ?? 0) > 0) || (list.json || [])[0];
    if (!target) {
      console.log('❌ 没有已发布曲目');
      process.exit(1);
    }
    scoreId = target.id;
    console.log(`\n[0] 曲目：《${target.title}》(${scoreId})`);
  }

  // ── 读原始值（用于还原） ──
  const before = await req('GET', `/api/scores/${scoreId}`);
  if (!before.ok) {
    console.log(`❌ 读取曲目失败 HTTP ${before.status}`);
    process.exit(1);
  }
  const origin = {
    songKey: before.json.songKey ?? null,
    capo: before.json.capo ?? null,
    tuning: before.json.tuning ?? null,
    license: before.json.license ?? null,
    difficulty: before.json.difficulty ?? null,
  };
  console.log(`\n[1] 原始元数据：${JSON.stringify(origin)}`);

  // ── 写入测试值 ──
  const testMeta = {
    songKey: 'A minor',
    capo: 2,
    tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], // Drop D
    license: 'public_domain',
    difficulty: 3,
  };
  console.log(`\n[2] PATCH /api/scores/${scoreId} → ${JSON.stringify(testMeta)}`);
  const patched = await req('PATCH', `/api/scores/${scoreId}`, testMeta);
  if (!patched.ok) {
    fail(`PATCH 失败 HTTP ${patched.status}：${JSON.stringify(patched.json).slice(0, 300)}`);
    process.exit(1);
  }
  ok('PATCH 成功（新增的 PATCH /api/scores/:id 路由可用）');

  // ── 从 C 端契约验证 ──
  console.log('\n[3] GET /api/published/scores/:id/package → 检查 score.* 与 provenance.license');
  const pkgRes = await req('GET', `/api/published/scores/${scoreId}/package`);
  if (!pkgRes.ok) {
    fail(`/package 失败 HTTP ${pkgRes.status}`);
  } else {
    const p = pkgRes.json;
    const checks = [
      ['score.key', p.score?.key, 'A minor'],
      ['score.capo', p.score?.capo, 2],
      ['score.difficulty', p.score?.difficulty, 3],
      ['provenance.license', p.provenance?.license, 'public_domain'],
    ];
    for (const [label, actual, expected] of checks) {
      if (actual === expected) ok(`${label} = ${JSON.stringify(actual)}`);
      else fail(`${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
    const tuning = p.score?.tuning;
    if (Array.isArray(tuning) && tuning[0] === 'D2' && tuning.length === 6) {
      ok(`score.tuning = ${tuning.join(' ')}（Drop D 生效）`);
    } else {
      fail(`score.tuning 期望 ["D2","A2","D3","G3","B3","E4"]，实际 ${JSON.stringify(tuning)}`);
    }
    const trackTuning = p.tracks?.[0]?.tuning;
    if (Array.isArray(trackTuning) && trackTuning[0] === 'D2') {
      ok(`tracks[0].tuning = ${trackTuning.join(' ')}（分轨调弦与曲目一致）`);
    } else {
      fail(`tracks[0].tuning 未跟随曲目调弦：${JSON.stringify(trackTuning)}`);
    }
    if (p.tracks?.[0]?.capo === 2) ok('tracks[0].capo = 2');
    else fail(`tracks[0].capo 期望 2，实际 ${p.tracks?.[0]?.capo}`);
  }

  // ── 还原 ──
  console.log('\n[4] 还原原始元数据');
  const restored = await req('PATCH', `/api/scores/${scoreId}`, origin);
  if (restored.ok) {
    const after = await req('GET', `/api/scores/${scoreId}`);
    const same =
      (after.json.songKey ?? null) === origin.songKey &&
      (after.json.capo ?? null) === origin.capo &&
      (after.json.license ?? null) === origin.license &&
      (after.json.difficulty ?? null) === origin.difficulty;
    if (same) ok('已还原（该脚本可反复运行，不污染数据）');
    else fail(`还原不完整：${JSON.stringify(after.json)}`);
  } else {
    fail(`还原失败 HTTP ${restored.status}`);
  }

  console.log('\n' + '='.repeat(72));
  if (errors.length > 0) {
    console.log(`💥 元数据往返验证未通过（${errors.length} 项）`);
    process.exit(1);
  }
  console.log('🎉 元数据往返验证通过：后台字段 → DB → C 端契约全部生效');
  console.log('');
})();
