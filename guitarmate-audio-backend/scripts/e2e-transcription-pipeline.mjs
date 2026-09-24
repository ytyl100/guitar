#!/usr/bin/env node
/**
 * 端到端验证：音频转录流水线
 * ==========================
 *
 * 覆盖从「上传音频」到「C 端契约 PracticePackage」的完整链路，并逐条断言不变式：
 *
 * ```
 * ① POST /api/transcription/projects/upload    上传 base64 WAV → 建 Project（立刻入队）
 * ② GET  /api/transcription/projects/:id       轮询 → 直到 review / failed
 *    └ 队列：separate → transcribe → convert（无 Redis/Python 依赖时自动降级）
 * ③ PATCH /api/transcription/projects/:id      人工复核：改品位/时值/技巧（模拟 ReviewPage 提交）
 * ④ POST /api/transcription/projects/:id/publish  切音频 → 上传 → relativeTime + 归一化坐标
 * ⑤ GET  /api/transcription/projects/:id/package  校验 schemaVersion 1.0 契约
 * ```
 *
 * 用法（后端需已启动 `node dist/main.js`）：
 * ```bash
 * node scripts/e2e-transcription-pipeline.mjs
 * node scripts/e2e-transcription-pipeline.mjs --wav uploads/demo/demo_original.wav --keep
 * ```
 *
 * 说明：
 * - 默认使用 `uploads/demo/demo_guitar.wav`（`npm run demo:audio` 生成）；
 * - 未安装 Demucs / Basic Pitch 时走「模拟转录」（产物带 simulated 标记），
 *   这正是本脚本能在任何机器上跑通的原因；
 * - 脚本结束后默认删除测试项目（`--keep` 保留以便在 CMS 里人工查看）。
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const API = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const WAV_ARG = argv.includes('--wav') ? argv[argv.indexOf('--wav') + 1] : 'uploads/demo/demo_guitar.wav';
const POLL_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 180_000);

/**
 * 自带**真实左手指法**（`<technical><fingering>`）的 MusicXML，用于验证：
 * 源文件已有的指法必须被保留，不能被 `fingering.ts` 的启发式覆盖 ——
 * 这正是以前被丢掉（parser 只读了 string/fret）的那部分信息。
 */
const MUSICXML_WITH_FINGERING = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>E2E：含真实指法标注</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Acoustic Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <direction>
        <direction-type>
          <metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome>
        </direction-type>
        <sound tempo="90"/>
      </direction>
      <note>
        <pitch><step>G</step><octave>2</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>6</string><fret>3</fret><fingering>3</fingering></technical></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>2</string><fret>1</fret><fingering>1</fingering></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>1</string><fret>0</fret><fingering>0</fingering></technical></notations>
      </note>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>3</string><fret>2</fret><fingering>2</fingering></technical></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>4</string><fret>2</fret></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>4</string><fret>2</fret></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>
`;

const results = [];
let failed = 0;

function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail });
  if (!condition) failed += 1;
  const icon = condition ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  console.log(`  ${icon} ${name}${detail ? `  \u001b[90m${detail}\u001b[0m` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const msg = payload?.message || payload?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${init?.method || 'GET'} ${path} → ${Array.isArray(msg) ? msg.join('; ') : msg}`);
  }
  return payload;
}

async function main() {
  console.log(`\n\u001b[1m🎸 音频转录流水线 E2E\u001b[0m  API=${API}\n`);

  // ── 0. 前置检查 ─────────────────────────────
  console.log('\u001b[1m[0] 前置检查\u001b[0m');
  const health = await request('/api/health').catch(() => null);
  check('后端可访问', !!health, health ? JSON.stringify(health).slice(0, 60) : `无法连接 ${API}，请先启动 node dist/main.js`);

  const caps = await request('/api/transcription/capabilities');
  const c = caps.capabilities;
  console.log(
    `     能力：python=${c.python.available} demucs=${c.demucs.available} ` +
      `basic-pitch=${c.basicPitch.available} tayuya=${c.tayuya.available} ` +
      `yt-dlp=${c.ytDlp.available} ffmpeg=${c.ffmpeg.available} simulate=${c.simulate}`,
  );
  check('能力探测返回 4 个阶段', caps.pipeline.stages.length >= 6);

  const queue = await request('/api/transcription/queue');
  console.log(`     队列驱动：${queue.counts.driver}（queue=${queue.counts.queueName}）`);

  const wavPath = resolve(process.cwd(), WAV_ARG);
  check('测试音频存在', existsSync(wavPath), wavPath);
  if (!existsSync(wavPath)) {
    console.error('\n请先执行 `npm run demo:audio` 生成示例音频，或用 --wav 指定音频文件。');
    process.exit(1);
  }
  const buffer = readFileSync(wavPath);
  console.log(`     测试音频：${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

  // ── 1. 上传 ────────────────────────────────
  console.log('\n\u001b[1m[1] 上传音频（base64）→ 建项目 + 入队\u001b[0m');
  const created = await request('/api/transcription/projects/upload', {
    method: 'POST',
    body: JSON.stringify({
      title: '[E2E] 转录流水线',
      artist: 'GuitarMate',
      fileName: WAV_ARG.split(/[\\/]/).pop(),
      base64: buffer.toString('base64'),
      bpm: 80,
      timeSignature: '4/4',
      license: 'public_domain',
    }),
  });
  const projectId = created.project.id;
  check('创建项目成功', !!projectId, `projectId=${projectId}`);
  check('已入队第一个阶段', !!created.started?.jobId, `stage=${created.started?.stage} driver=${created.started?.driver}`);
  check(
    '音频已落盘并可访问',
    !!created.project.audioUrl,
    created.project.audioUrl || '(无 URL)',
  );

  // ── 2. 轮询流水线 ───────────────────────────
  console.log('\n\u001b[1m[2] 轮询流水线（separate → transcribe → convert）\u001b[0m');
  const startedAt = Date.now();
  let project = null;
  let lastStatus = '';
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    project = (await request(`/api/transcription/projects/${projectId}`)).project;
    if (project.status !== lastStatus) {
      lastStatus = project.status;
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`     [${secs}s] status=${project.status} progress=${project.progress}%  ${project.stageNote || ''}`);
    }
    if (['review', 'published', 'failed'].includes(project.status)) break;
    await sleep(700);
  }

  check('流水线未失败', project?.status !== 'failed', project?.error || '');
  check('已进入待复核状态（review）', ['review', 'published'].includes(project?.status), `status=${project?.status}`);
  check('生成了 TabProject', !!project?.tabProject, `measures=${project?.tabProject?.tracks?.[0]?.measures?.length ?? 0}`);
  const track = project?.tracks?.[0];
  check('分轨已生成音符', (track?.notes?.length || 0) > 0, `${track?.notes?.length || 0} 个音符`);
  /**
   * 低置信度音符是 ReviewPage 标红的依据。
   * 它取决于**实际跑的引擎**：模拟器刻意注入 ~1/5 的低置信度音符（保证复核流程可演示），
   * 而真实引擎（Basic Pitch / 内置 YIN）给的是诚实置信度 —— 干净的录音里可能一个都没有。
   * 所以只在模拟器路径上要求「必须有」，真实引擎只要求字段合法。
   */
  const engine = track?.engine || '(未知)';
  const lowCount = track?.lowConfidenceCount || 0;
  if (engine === 'simulation') {
    check('存在低置信度音符（供 ReviewPage 标红）', lowCount > 0, `engine=${engine} low=${lowCount}`);
  } else {
    check(
      '低置信度计数字段合法（真实引擎下数量由音频质量决定）',
      Number.isFinite(lowCount) && lowCount >= 0,
      `engine=${engine} low=${lowCount}`,
    );
  }

  const jobStages = (project?.jobs || []).map((j) => `${j.stage}:${j.status}`).join(' ');
  check('阶段时间线留痕完整', (project?.jobs || []).length >= 3, jobStages);

  // ── 2b. 左手指法 / 把位（真实六线谱的核心标注）──────────
  const tpMeasures = project.tabProject?.tracks?.[0]?.measures || [];
  const filteredNotes = tpMeasures.flatMap((m) => m.notes || []);
  const withFinger = filteredNotes.filter((n) => typeof n.finger === 'number');
  check(
    '已推定左手指法（0 = 空弦 / 1-4 = 食指…小指）',
    withFinger.length >= filteredNotes.length * 0.9,
    `${withFinger.length}/${filteredNotes.length} 个音符带手指`,
  );
  check(
    '每个小节都标注了把位',
    tpMeasures.length > 0 && tpMeasures.every((m) => Number.isFinite(m.position) && m.position >= 1),
    `${tpMeasures.filter((m) => Number.isFinite(m.position)).length}/${tpMeasures.length} 小节`,
  );

  let fingerChecked = 0;
  let fingerBad = 0;
  /**
   * 手位优先取**音符自己**的 `note.position`（小节内换把时它与小节把位不同）——
   * 谱面上的数字是手指号，必须靠 `fret = position + finger − 1` 唯一反推，
   * 所以这条不变式是「手指标注能不能被读懂」的底线。
   */
  for (const m of tpMeasures) {
    for (const n of m.notes || []) {
      if (typeof n.finger !== 'number') continue;
      const position = Number.isFinite(n.position) ? n.position : m.position;
      if (!Number.isFinite(position)) continue;
      const expected = n.fret <= 0 ? 0 : Math.min(4, Math.max(1, n.fret - position + 1));
      fingerChecked += 1;
      if (n.finger !== expected) fingerBad += 1;
    }
  }
  check(
    '不变式：finger = fret − 手位 + 1（空弦为 0）',
    fingerChecked > 0 && fingerBad === 0,
    `校验 ${fingerChecked} 个音符，异常 ${fingerBad}`,
  );
  check(
    '每个音符都带手位（换把处也能反推品位）',
    filteredNotes.filter((n) => typeof n.finger === 'number').every((n) => Number.isFinite(n.position) && n.position >= 1),
    `${filteredNotes.filter((n) => Number.isFinite(n.position)).length}/${filteredNotes.length} 个音符带 position`,
  );
  check(
    '小节把位 = 该小节最早那个音符的手位（标记与谱面一致）',
    tpMeasures.every((m) => {
      const first = [...(m.notes || [])]
        .sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string)
        .find((n) => Number.isFinite(n.position));
      return !first || first.position === m.position;
    }),
  );
  check(
    '空弦音符标记为 0（不按左手）',
    filteredNotes.filter((n) => n.fret <= 0).every((n) => n.finger === 0),
    `${filteredNotes.filter((n) => n.fret <= 0).length} 个空弦音`,
  );
  check(
    '指法推定已写入告警（提醒人工核对）',
    (project.tabProject?.warnings || []).some((w) => String(w.code).startsWith('fingering')),
    (project.tabProject?.warnings || []).map((w) => w.code).join(', '),
  );

  // ── 2c. 和弦标注（谱面上方和弦名）──────────────
  const measuresWithChords = tpMeasures.filter((m) => (m.chords || []).length > 0);
  const allChords = tpMeasures.flatMap((m) => m.chords || []);
  const chordNames = [...new Set(allChords.map((c) => c.name))];
  check(
    '已识别出和弦（转录链路走窗口和声分析）',
    allChords.length > 0,
    `${allChords.length} 个标记 / ${measuresWithChords.length} 小节：${chordNames.slice(0, 8).join(', ')}`,
  );
  check(
    '和弦名取自内置和弦库（非乱码）',
    allChords.length > 0 && allChords.every((c) => /^[A-G][#b]?/.test(String(c.name))),
    chordNames.slice(0, 8).join(', '),
  );
  check(
    '连续相同的和弦已压缩为一次标注（原谱只在变化处标注）',
    tpMeasures.every((m) => {
      const names = (m.chords || []).map((c) => c.name);
      return names.length <= 1 || names.every((n, i) => i === 0 || n !== names[i - 1]);
    }),
  );

  // ── 3. 人工复核（模拟 ReviewPage 提交）────────────────
  console.log('\n\u001b[1m[3] 人工复核：改品位 / 时值 / 技巧 + 覆写 BPM\u001b[0m');
  const tabProject = project.tabProject;
  const targetMeasure = tabProject.tracks[0].measures.find((m) => m.notes.length > 0);
  const targetNote = targetMeasure.notes[0];
  const beforeFret = targetNote.fret;
  targetNote.fret = 5;
  targetNote.midi = tabProject.tuning[targetNote.string - 1] + 5 + (tabProject.capo || 0);
  targetNote.durationSec = 0.42;
  targetNote.technique = 'hammer-on';
  /** 人工改指法：把这一音指定为小指（4） */
  targetNote.finger = 4;

  const patched = await request(`/api/transcription/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ tabProject, bpm: 88, timeSignature: '4/4', license: 'public_domain' }),
  });
  check('复核保存成功', patched.success === true, `bpm=${patched.bpm}`);
  check('BPM 已覆写', patched.bpm === 88, `bpm=${patched.bpm}`);

  // ── 4. 发布 ────────────────────────────────
  console.log('\n\u001b[1m[4] 发布：切音频 → 上传 → relativeTime + 归一化坐标\u001b[0m');
  const publish1 = await request(`/api/transcription/projects/${projectId}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      publishedBy: 'e2e',
      channel: 'guitar',
      audioFallback: 'metronome',
      allowMissingAudio: true,
      maxMeasures: 6, // 只跑 6 个小节，保证脚本足够快
    }),
  });
  check('发布成功', publish1.success === true, `revision=${publish1.revision}`);
  check('schemaVersion = 1.0', publish1.package?.schemaVersion === '1.0', publish1.package?.schemaVersion);
  check('切出音频切片', publish1.stats.slicedAudioCount > 0, `sliced=${publish1.stats.slicedAudioCount} degraded=${publish1.stats.degradedAudioCount}`);
  check('发布后项目状态 = published', (await request(`/api/transcription/projects/${projectId}`)).project.status === 'published');

  // ── 5. 契约校验 ─────────────────────────────
  console.log('\n\u001b[1m[5] PracticePackage 契约校验\u001b[0m');
  const fetched = await request(`/api/transcription/projects/${projectId}/package`);
  const pkg = fetched.package;

  check('顶层字段齐全', ['schemaVersion', 'score', 'tracks', 'measures', 'assets', 'provenance'].every((k) => k in pkg));
  check('score.tuning 为音名数组', Array.isArray(pkg.score.tuning) && /^[A-G]#?\d/.test(pkg.score.tuning[0] || ''), JSON.stringify(pkg.score.tuning));
  check('measures 按 index 升序', isAscending(pkg.measures.map((m) => m.index)));
  check('每个小节都下发 metronome', pkg.measures.every((m) => m.trackData.every((td) => !!td.metronome)));
  check(
    '音频缺失时 metronome.enabled = true',
    pkg.measures.every((m) => m.trackData.every((td) => (td.audioUrl ? true : td.metronome.enabled === true))),
  );

  const allNotes = pkg.measures.flatMap((m) => m.trackData.flatMap((td) => td.notes));
  check('音符非空', allNotes.length > 0, `${allNotes.length} 个音符`);
  check('音符按 relativeTime 升序', pkg.measures.every((m) => m.trackData.every((td) => isAscending(td.notes.map((n) => n.relativeTime)))));

  const coordsOk = pkg.measures.every((m) =>
    m.trackData.every((td) =>
      td.notes.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1 && Math.abs(n.y - (n.string - 1) / 5) < 1e-3),
    ),
  );
  check('x / y 均为 0-1 且 y = (string-1)/5', coordsOk);

  const relOk = pkg.measures.every((m) =>
    m.trackData.every((td) => td.notes.every((n) => n.relativeTime >= -1e-6 && n.relativeTime <= m.duration + 1e-6)),
  );
  check('relativeTime 落在小节时长内', relOk);

  const xConsistent = pkg.measures.every((m) =>
    m.trackData.every((td) =>
      td.notes.every((n) => Math.abs(n.x - Math.min(0.999, n.relativeTime / m.duration)) < 0.02),
    ),
  );
  check('x ≈ relativeTime / duration（与 CMS / tab-import 同一公式）', xConsistent);

  check(
    '小节时长 = 拍数 × (60/bpm) × (4/分母)',
    closeTo(pkg.measures[0].duration, (60 / pkg.measures[0].bpm) * 4, 0.02),
    `${pkg.measures[0].duration}s @ bpm=${pkg.measures[0].bpm}`,
  );
  check('人工覆写的 BPM 已进入契约', pkg.score.bpm === 88, `score.bpm=${pkg.score.bpm}`);
  check(
    'BPM 覆写后小节被重新划分（音频切片窗口 = 谱面小节）',
    closeTo(pkg.measures[0].duration, (60 / 88) * 4, 0.02),
    `${pkg.measures[0].duration}s（期望 ${((60 / 88) * 4).toFixed(3)}s）`,
  );
  check(
    '（BPM 覆写时给出告警）',
    (publish1.warnings || []).some((w) => /重新划分|覆盖/.test(w)),
    (publish1.warnings || [])[0] || '(无告警)',
  );

  // 复核结果是否真的落到契约里
  const measureIndex = targetMeasure.index + 1;
  const published = pkg.measures.find((m) => m.index === measureIndex);
  const publishedNote = published?.trackData?.[0]?.notes?.find((n) => n.fret === 5 && n.technique === 'hammer_on');
  check(
    '人工复核生效（fret=5 / hammer_on）',
    !!publishedNote,
    `原 fret=${beforeFret} → 现 fret=${publishedNote?.fret} technique=${publishedNote?.technique}`,
  );

  // ── 5b. 契约里的指法 / 把位 ──────────────────
  const notesWithFinger = allNotes.filter((n) => typeof n.finger === 'number');
  check(
    '契约下发左手指法',
    notesWithFinger.length > 0,
    `${notesWithFinger.length}/${allNotes.length} 个音符带 finger`,
  );
  check(
    '手指标记取值均为 0-4',
    notesWithFinger.every((n) => n.finger >= 0 && n.finger <= 4 && Number.isInteger(n.finger)),
  );
  check(
    '契约下发小节把位',
    pkg.measures.every((m) => Number.isFinite(m.position) && m.position >= 1),
    pkg.measures.map((m) => m.position).join(','),
  );
  check(
    '人工指定的手指已生效（finger=4）',
    !!publishedNote && publishedNote.finger === 4,
    `finger=${publishedNote?.finger}`,
  );

  // ── 5c. 契约里的和弦（谱面上方和弦名的数据源）──
  const contractChords = pkg.measures.flatMap((m) => m.chords || []);
  check(
    '契约下发小节和弦标注',
    contractChords.length > 0,
    `${contractChords.length} 个：${[...new Set(contractChords.map((c) => c.chordName))].slice(0, 8).join(', ')}`,
  );
  check(
    '和弦坐标落在 0-1（谱面上方和弦行定位用）',
    contractChords.every((c) => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1),
  );
  check(
    '和弦 startTime 为小节内相对时间',
    contractChords.every((c) => c.startTime >= -1e-6),
    `max=${Math.max(...contractChords.map((c) => c.startTime)).toFixed(2)}s`,
  );

  // 音频可达性
  const audioUrls = pkg.measures.map((m) => m.trackData[0]?.audioUrl).filter(Boolean);
  if (audioUrls.length > 0) {
    const head = await fetch(audioUrls[0], { method: 'HEAD' }).catch(() => null);
    check('切片音频 URL 可访问', !!head?.ok, `${audioUrls[0].slice(0, 72)}… → HTTP ${head?.status ?? 'ERR'}`);
  } else {
    check('切片音频 URL 可访问', true, '（本次全为节拍器模式，无切片）');
  }

  // ── 6. revision 自增 ────────────────────────
  console.log('\n\u001b[1m[6] 再次发布 → revision 自增（历史快照保留）\u001b[0m');
  const publish2 = await request(`/api/transcription/projects/${projectId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ publishedBy: 'e2e', audioFallback: 'metronome', allowMissingAudio: true, maxMeasures: 6 }),
  });
  check('revision 自增到 2', publish2.revision === publish1.revision + 1, `${publish1.revision} → ${publish2.revision}`);
  const revisions = await request(`/api/transcription/projects/${projectId}/revisions`);
  check('发布历史可查询', revisions.revisions.length >= 2, `${revisions.revisions.length} 个版本`);

  // ── 7. MusicXML 真实指法必须被保留（不能被启发式覆盖）────
  console.log('\n\u001b[1m[7] MusicXML <fingering> 真实指法保留\u001b[0m');
  const preview = await request('/api/tab-import/parse', {
    method: 'POST',
    body: JSON.stringify({
      content: MUSICXML_WITH_FINGERING,
      format: 'musicxml',
      fileName: 'fingering-demo.musicxml',
      rights: 'original-arrangement',
      rightsNote: 'E2E 测试用自有编配，含真实指法标注',
    }),
  });
  const xmlNotes = preview.measures.flatMap((m) => m.notes || []);
  const xmlFingers = xmlNotes.filter((n) => typeof n.finger === 'number');
  check(
    'MusicXML 的 <fingering> 已解析并保留（含 0 = 空弦）',
    xmlFingers.length >= 4 && xmlFingers.every((n) => n.finger >= 0 && n.finger <= 4),
    `${xmlFingers.length}/${xmlNotes.length} 个音符带源文件指法：${xmlFingers.map((n) => n.finger).join(',')}`,
  );
  check(
    '真实指法未被启发式覆盖（原值 3 保留）',
    xmlNotes.some((n) => n.finger === 3),
    `fingers=${xmlFingers.map((n) => n.finger).join(',')}`,
  );
  check(
    '无指法的音符被自动推定',
    (preview.diagnostics?.fingering?.derivedCount || 0) > 0,
    `derived=${preview.diagnostics?.fingering?.derivedCount} preserved=${preview.diagnostics?.fingering?.preservedCount}`,
  );
  check(
    '小节把位由真实指法反推（position = fret − finger + 1）',
    preview.project.tracks[0].measures.every((m) => Number.isFinite(m.position) && m.position >= 1),
    preview.project.tracks[0].measures.map((m) => m.position).join(','),
  );

  // ── 8. 清理 ────────────────────────────────
  if (!KEEP) {
    console.log('\n\u001b[1m[8] 清理测试项目\u001b[0m');
    await request(`/api/transcription/projects/${projectId}`, { method: 'DELETE' });
    const list = await request('/api/transcription/projects');
    check('项目已删除', !list.projects.some((p) => p.id === projectId));
  } else {
    console.log(`\n\u001b[1m[8] --keep 已指定，保留项目\u001b[0m  projectId=${projectId}`);
    console.log(`     可在 CMS「音频转录复核」工作台，或 /api/transcription/projects/${projectId} 查看`);
  }

  // ── 汇总 ────────────────────────────────────
  console.log(`\n\u001b[1m汇总\u001b[0m：${results.length - failed}/${results.length} 通过`);
  if (failed > 0) {
    console.log('\n失败项：');
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}  ${r.detail || ''}`);
    process.exit(1);
  }
  console.log('\u001b[32m全部通过 ✅\u001b[0m\n');
}

const isAscending = (values) => values.every((v, i) => i === 0 || v >= values[i - 1] - 1e-9);
const closeTo = (a, b, tol) => Math.abs(a - b) <= tol;
main().catch((err) => {
  console.error(`\n\u001b[31mE2E 中断：${err.message}\u001b[0m\n`);
  process.exit(1);
});
