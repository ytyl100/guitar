/**
 * 内置真实转录器（node-yin）精度验证
 * ==================================
 *
 * 有真值的音频才能定量评价「音频 → 六线谱」：
 * `scripts/generate-solo-sample.mjs` 合成样品时把**每个音的真实音高**写进了
 * `uploads/demo/solo_am_f_c_g.reference.json`，这里拿它当标准答案比对。
 *
 * 校验四项：
 * 1. **音高准确率**：真值每个音 → 找最近的转录音符 → 音高是否一致；
 * 2. **起音时值误差**：转录起始时间 vs 真实起始时间（毫秒级）；
 * 3. **和弦识别准确率**：每小节中点处的和弦名 vs 真值进行（Am/F/C/G）；
 * 4. **不变式**：`midi = 空弦音 + 品位`、弦/品在合法范围、时值 > 0。
 *
 * ⚠️ 必须先构建（脚本读的是 `dist/`，与 `node dist/main.js` 同源）：
 *
 * ```bash
 * npm run demo:solo                       # 生成样品（只需一次）
 * node node_modules/@nestjs/cli/bin/nest.js build
 * node scripts/verify-pitch-analysis.mjs
 * ```
 */

import { createRequire } from 'module';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const WAV = join(ROOT, 'uploads', 'demo', 'solo_am_f_c_g.wav');
const REFERENCE = join(ROOT, 'uploads', 'demo', 'solo_am_f_c_g.reference.json');

if (!existsSync(WAV) || !existsSync(REFERENCE)) {
  console.error('缺少样品音频，请先运行：npm run demo:solo');
  process.exit(1);
}

const { NodeTranscriberService } = require('../dist/transcription/node-transcriber.service.js');
const { STANDARD_TUNING_MIDI } = require('../dist/transcription/transcription.types.js');

const reference = JSON.parse(readFileSync(REFERENCE, 'utf-8'));

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${name}${detail ? `  \u001b[90m${detail}\u001b[0m` : ''}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}  ${detail}`);
  }
}

const workDir = mkdtempSync(join(tmpdir(), 'guitarmate-yin-'));
const service = new NodeTranscriberService({ subDir: () => workDir });

console.log('\n\u001b[1m🎧 内置真实转录器精度验证（node-yin）\u001b[0m');
console.log(`  样品：${WAV}`);
console.log(`  真值：${reference.notes.length} 个 solo 音 · ${reference.bpm} BPM · ${reference.bars} 小节\n`);

const startedAt = Date.now();
const result = await service.transcribe({
  projectId: 'verify',
  instrument: 'guitar',
  audioPath: WAV,
  bpm: 0, // 故意不给 BPM，检验自动估计
  tuning: [...STANDARD_TUNING_MIDI],
  midiPath: join(workDir, 'guitar.mid'),
});
const elapsedSec = (Date.now() - startedAt) / 1000;

console.log('\u001b[1m[1] 基本指标\u001b[0m');
check('转录出音符', result.notes.length > 0, `${result.notes.length} 个音符 / ${elapsedSec.toFixed(1)}s`);
check(
  '音符数接近真值（40-80 之间）',
  result.notes.length >= 40 && result.notes.length <= 80,
  `真值 ${reference.notes.length}，转录 ${result.notes.length}`,
);
check(
  '有音高的帧占比合理（> 40%）',
  result.analysis.voicedRatio > 0.4,
  `${(result.analysis.voicedRatio * 100).toFixed(1)}%`,
);

console.log('\n\u001b[1m[2] BPM 估计\u001b[0m');
const bpmError = Math.abs(result.analysis.bpm - reference.bpm) / reference.bpm;
check(
  `BPM 估计接近真值 ${reference.bpm}`,
  result.analysis.bpmEstimated && bpmError <= 0.05,
  `估计 ${result.analysis.bpm}（误差 ${(bpmError * 100).toFixed(1)}%）`,
);

console.log('\n\u001b[1m[3] 音高准确率（对齐真值）\u001b[0m');
const used = new Set();
let matched = 0;
let onsetErrors = [];
for (const truth of reference.notes) {
  let bestIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  result.notes.forEach((note, index) => {
    if (used.has(index)) return;
    const delta = Math.abs(note.startSec - truth.startSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  if (bestIndex >= 0 && bestDelta <= 0.12) {
    used.add(bestIndex);
    const note = result.notes[bestIndex];
    if (note.pitch === truth.midi) matched += 1;
    onsetErrors.push(Math.abs(note.startSec - truth.startSec) * 1000);
  }
}
const accuracy = matched / reference.notes.length;
check(`音高准确率 ≥ 85%`, accuracy >= 0.85, `${(accuracy * 100).toFixed(1)}%（${matched}/${reference.notes.length}）`);
const meanOnset = onsetErrors.length ? onsetErrors.reduce((a, b) => a + b, 0) / onsetErrors.length : 0;
check('起音时值平均误差 ≤ 60ms', meanOnset <= 60, `${meanOnset.toFixed(1)}ms（比对上 ${onsetErrors.length} 个音）`);

console.log('\n\u001b[1m[4] 和弦识别（按小节中点比对）\u001b[0m');
const beatSec = 60 / reference.bpm;
const barSec = beatSec * 4;
let chordHits = 0;
const chordRows = [];
for (let bar = 0; bar < reference.bars; bar += 1) {
  const at = bar * barSec + barSec / 2;
  const segment = result.chords.find((s) => at >= s.startSec && at < s.endSec);
  const expected = reference.chords[bar];
  const got = segment?.name ?? '(无)';
  const ok = got === expected;
  if (ok) chordHits += 1;
  chordRows.push(`m${bar + 1} ${expected}${ok ? '=' : '≠'}${got}`);
}
const chordAccuracy = chordHits / reference.bars;
check('和弦识别准确率 ≥ 60%', chordAccuracy >= 0.6, `${(chordAccuracy * 100).toFixed(0)}%`);
console.log(`     \u001b[90m${chordRows.join(' · ')}\u001b[0m`);
check('和弦段不为空', result.chords.length > 0, `${result.chords.length} 段`);

console.log('\n\u001b[1m[5] 六线谱不变式\u001b[0m');
const openStrings = [...STANDARD_TUNING_MIDI];
check(
  '每个音符都有合法的弦号（1-6）与品位（0-19）',
  result.notes.every((n) => n.string >= 1 && n.string <= 6 && n.fret >= 0 && n.fret <= 19),
  `${result.notes.filter((n) => n.string < 1 || n.string > 6).length} 个异常`,
);
check(
  '不变式 midi = 空弦 + 品位 全部成立',
  result.notes.every((n) => n.pitch === openStrings[n.string - 1] + n.fret),
  `${result.notes.length} 个音符`,
);
check('所有时值 > 0', result.notes.every((n) => n.durationSec > 0));
check('音符按时间升序', result.notes.every((n, i) => i === 0 || n.startSec >= result.notes[i - 1].startSec));
check('置信度都在 0-1', result.notes.every((n) => n.confidence >= 0 && n.confidence <= 1));

console.log(`\n\u001b[1m汇总\u001b[0m：${passed}/${passed + failed} 通过`);
if (failed > 0) {
  console.log(`\n\u001b[31m${failed} 项失败\u001b[0m\n`);
  process.exit(1);
}
console.log('\u001b[32m内置转录器精度符合预期 ✅\u001b[0m\n');
