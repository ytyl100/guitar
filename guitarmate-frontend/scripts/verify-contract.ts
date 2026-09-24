/**
 * PracticePackage 消费层验证（小程序端视角）
 * ========================================
 *
 * 与后端 `scripts/verify-practice-package.mjs` 互补：
 * 那个校验「服务端产出的 JSON 是否合规」，本脚本校验
 * **「小程序端现有的消费代码能否正确吃下这份 JSON」** —— 用真实的
 * `validatePracticePackage` / `normalizeToPracticePackage` 跑真数据。
 *
 * 跑法（在 guitarmate-frontend 目录）：
 *   npm run verify:contract
 *
 * 覆盖场景：
 * 1. 新接口 `/package`（契约结构）→ 校验 + 归一化
 * 2. 旧接口 `/measures`（数组）→ 兼容层归一化（后端灰度期间的兼容路径）
 * 3. 时间源选择：按 `usePracticeClock` 的同一套决策逻辑，判断每个小节
 *    会走「音频时钟」还是「节拍器时钟」——把「点了没声音」这类问题提前暴露
 */

import {
  normalizeToPracticePackage,
  validatePracticePackage,
  parseMediaFragment,
  type MeasureTrackData,
  type PracticePackage,
} from '../src/practicePackage';

const BASE: string =
  (globalThis as any).process?.env?.API_BASE || 'http://localhost:3000';

const errors: string[] = [];
const warnings: string[] = [];

const ok = (m: string) => console.log(`  ✅ ${m}`);
const fail = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

async function getJson(path: string): Promise<{ status: number; ok: boolean; json: any }> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

/** 与 usePracticeClock 完全一致的音源决策逻辑 */
function decideClockSource(track?: MeasureTrackData | null, useOriginal = false) {
  const audioUrl = useOriginal
    ? track?.originalAudioUrl || track?.audioUrl || null
    : track?.audioUrl || null;
  if (audioUrl) {
    // 后端降级时会返回 `url#t=start,end`，必须能解析出播放窗口
    const fragment = parseMediaFragment(audioUrl);
    return {
      source: 'audio' as const,
      url: fragment.baseUrl,
      windowStart: fragment.start,
      windowEnd: fragment.end,
      needFragmentClamp: fragment.end !== null,
    };
  }
  if (track?.metronome?.enabled) {
    return { source: 'metronome' as const, bpm: track.metronome.bpm, beats: track.metronome.beatsPerMeasure };
  }
  // 既没音频也没开启节拍器：仍可用节拍器配置兜底（契约现在总会下发该字段）
  return { source: 'metronome' as const, bpm: track?.metronome?.bpm ?? 80, beats: track?.metronome?.beatsPerMeasure ?? 4 };
}

function assertPackage(pkg: PracticePackage, label: string) {
  console.log(`\n—— ${label} ——`);
  ok(`schemaVersion=${pkg.schemaVersion} 曲目《${pkg.score.title}》 小节=${pkg.measures.length}`);

  const sorted = pkg.measures.every((m, i) => i === 0 || m.index >= pkg.measures[i - 1].index);
  if (!sorted) fail(`${label}：measures 未按 index 升序`);
  else ok('measures 按 index 升序');

  let audioMeasures = 0;
  let metronomeMeasures = 0;
  let noteTotal = 0;

  pkg.measures.forEach((m, i) => {
    if (!(m.duration > 0)) fail(`${label}：measures[${i}].duration=${m.duration}`);
    const track = m.trackData[0];
    if (!track) {
      fail(`${label}：measures[${i}] 没有 trackData`);
      return;
    }
    noteTotal += track.notes.length;
    const notesSorted = track.notes.every(
      (n, k) => k === 0 || n.relativeTime >= track.notes[k - 1].relativeTime - 1e-6,
    );
    if (!notesSorted) fail(`${label}：measures[${i}] 音符未按 relativeTime 升序`);

    const decision = decideClockSource(track);
    if (decision.source === 'audio') audioMeasures++;
    else metronomeMeasures++;

    for (const n of track.notes) {
      if (!(n.x >= 0 && n.x <= 1)) warn(`${label}：measure ${i} 音符 x 越界 ${n.x}`);
      if (!(n.y >= 0 && n.y <= 1)) warn(`${label}：measure ${i} 音符 y 越界 ${n.y}`);
      if (n.technique && !['normal', 'hammer_on', 'pull_off', 'slide', 'bend', 'vibrato', 'harmonic', 'palm_mute', 'mute', 'tap'].includes(n.technique)) {
        fail(`${label}：technique 不在契约枚举内 ${n.technique}`);
      }
    }
  });

  ok(`音符 ${noteTotal} 个 · 音频时钟小节 ${audioMeasures} · 节拍器小节 ${metronomeMeasures}`);

  // 渲染计划样例
  const m0 = pkg.measures[0];
  if (m0) {
    const td = m0.trackData[0];
    const decision = decideClockSource(td);
    console.log(
      `  渲染计划：measure#${m0.index} duration=${m0.duration}s → ${
        decision.source === 'audio'
          ? `音频时钟 ${String((decision as any).url).slice(0, 80)}${
              (decision as any).needFragmentClamp ? '（#t= 片段，需裁剪播放窗口）' : ''
            }`
          : `节拍器时钟 ${(decision as any).bpm}BPM / ${(decision as any).beats}拍`
      }`,
    );
    if (td.notes[0]) {
      console.log(
        `  首音符：string=${td.notes[0].string} fret=${td.notes[0].fret} t=${td.notes[0].relativeTime}s x=${td.notes[0].x} y=${td.notes[0].y}`,
      );
    }
    if (m0.chords.length || m0.barres.length) {
      console.log(`  标注：和弦 ${m0.chords.length} 个 · 横按 ${m0.barres.length} 个`);
    }
  }
}

(async () => {
  console.log(`\n🎼 小程序端 PracticePackage 消费层验证 @ ${BASE}`);
  console.log('='.repeat(72));

  // ── 选一首有已发布小节的曲目 ──
  const list = await getJson('/api/published/scores');
  if (!list.ok) {
    console.log(`❌ 无法访问后端（HTTP ${list.status}）—— 请先启动 guitarmate-audio-backend`);
    (globalThis as any).process?.exit?.(1);
    return;
  }
  const target = (list.json || []).find((s: any) => (s._count?.measures ?? 0) > 0) || (list.json || [])[0];
  if (!target) {
    console.log('❌ 没有已发布曲目，请先在 CMS 发布小节');
    (globalThis as any).process?.exit?.(1);
    return;
  }
  console.log(`\n[0] 曲目：《${target.title}》(${target.id}) · 已发布小节 ${target._count?.measures ?? 0}`);

  // ── 场景 1：新接口 /package ──
  console.log('\n[1] GET /api/published/scores/:id/package（契约结构）');
  const pkgRes = await getJson(`/api/published/scores/${target.id}/package`);
  if (!pkgRes.ok) {
    fail(`/package 返回 HTTP ${pkgRes.status}（后端是否已重新构建？）`);
  } else {
    const validation = validatePracticePackage(pkgRes.json);
    if (!validation.ok) validation.errors.forEach(fail);
    validation.warnings.forEach(warn);
    ok(`validatePracticePackage → ok=${validation.ok}（warnings ${validation.warnings.length}）`);
    assertPackage(normalizeToPracticePackage(pkgRes.json, { scoreId: target.id }), '场景1：契约结构');
  }

  // ── 场景 2：旧接口 /measures + 兼容层 ──
  console.log('\n[2] GET /api/published/scores/:id/measures（旧数组）+ normalizeToPracticePackage');
  const legacyRes = await getJson(`/api/published/scores/${target.id}/measures`);
  if (!legacyRes.ok) {
    fail(`/measures 返回 HTTP ${legacyRes.status}`);
  } else {
    if (!Array.isArray(legacyRes.json)) fail('/measures 应返回数组');
    const normalized = normalizeToPracticePackage(legacyRes.json, {
      scoreId: target.id,
      title: target.title,
      artist: target.artist || undefined,
    });
    const validation = validatePracticePackage(normalized);
    if (!validation.ok) validation.errors.forEach(fail);
    ok(`归一化后 validatePracticePackage → ok=${validation.ok}`);
    assertPackage(normalized, '场景2：旧接口兼容层');
  }

  // ── 场景 3：坏数据（故意破坏字段，确认校验器能拦住）──
  console.log('\n[3] 负向测试：故意破坏契约，校验器必须报错');
  const broken = { schemaVersion: '9.9', score: null, measures: 'not-an-array' };
  const brokenResult = validatePracticePackage(broken);
  if (brokenResult.ok) fail('校验器未拦住非法数据（版本 + 结构都错了）');
  else ok(`正确拦截 ${brokenResult.errors.length} 个致命问题，例：${brokenResult.errors[0]}`);

  const legacyBroken = validatePracticePackage(normalizeToPracticePackage([], { scoreId: 'x' }));
  ok(`空小节列表 → 归一化后 warnings=${legacyBroken.warnings.length}、ok=${legacyBroken.ok}`);

  console.log('\n' + '='.repeat(72));
  if (warnings.length > 0) {
    console.log(`⚠️  警告 ${warnings.length} 条（不阻断渲染）：`);
    for (const w of warnings.slice(0, 10)) console.log(`     - ${w}`);
  }
  if (errors.length > 0) {
    console.log(`❌ 失败 ${errors.length} 条：`);
    for (const e of errors.slice(0, 15)) console.log(`     - ${e}`);
    console.log('\n💥 小程序端消费层验证未通过');
    (globalThis as any).process?.exit?.(1);
    return;
  }
  console.log('🎉 小程序端消费层验证通过：PracticeMeasure + usePracticeClock 可直接渲染该数据');
  console.log('');
})();
