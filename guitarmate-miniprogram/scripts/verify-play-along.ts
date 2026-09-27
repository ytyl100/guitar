/**
 * AI 跟弹评测的判定逻辑回归（纯函数，不需要麦克风）
 * ==================================================
 *
 * 为什么要有这个脚本：判定逻辑跑在真机上的"麦克风 + 播放"里，**几乎没法调试**
 * （要一边弹一边看）。所以把「帧序列 → 逐音结论」抽成纯函数（`utils/playAlongScore.ts`），
 * 用合成数据把每种情况都钉住：弹准、偏高、偏低、弹错音、没弹、窗口边界、中位数抗离群。
 *
 * 跑法（复用 CMS 里的 tsx，本包没有 tsx 依赖）：
 * ```powershell
 * cd d:\djc\guitar\guitarmate-miniprogram
 * node ..\guitarmate-studio-cms\node_modules\tsx\dist\cli.mjs scripts\verify-play-along.ts
 * ```
 */
import {
  HIT_CENTS,
  LEAD_SEC,
  TAIL_SEC,
  centsBetween,
  collectEvalNotes,
  hzToMidi,
  midiToHz,
  noteMidi,
  scorePlayAlong,
  type EvalNote,
  type PitchFrame,
} from '../src/utils/playAlongScore';
import type { PracticeMeasure } from '../src/utils/practice';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

/** 造一个新音符：绝对时间轴上的 [start, start+dur) */
const note = (id: string, startSec: number, duration: number, midi: number): EvalNote => ({
  id,
  startSec,
  endSec: startSec + duration,
  midi,
  string: 3,
  fret: midi - 55,
});

/** 在 [from, to] 之间按 step 铺一批帧，频率由 midi 决定（可加音分偏移） */
function frames(from: number, to: number, midi: number, offsetCents = 0, step = 0.064): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let t = from; t <= to; t += step) {
    const hz = midiToHz(midi + offsetCents / 100);
    out.push({ tSec: Math.round(t * 1000) / 1000, freq: hz });
  }
  return out;
}

console.log('\u001b[1m[1] 音高换算\u001b[0m');
check('A4 = 440Hz → midi 69', Math.abs(hzToMidi(440) - 69) < 1e-9, String(hzToMidi(440)));
check('midi 69 → 440Hz', Math.abs(midiToHz(69) - 440) < 1e-9);
check(
  '半音 = 100 音分',
  Math.abs(centsBetween(midiToHz(69.5), 69) - 50) < 1e-6,
  String(centsBetween(midiToHz(69.5), 69)),
);
check(
  'noteMidi 优先用契约里的 midi',
  noteMidi({ string: 1, fret: 3, midi: 100 }) === 100,
);
check(
  'noteMidi 缺失时按「空弦 + 品 + capo」算（1 弦 3 品 = E4+3 = midi 67）',
  noteMidi({ string: 1, fret: 3 }) === 67,
  String(noteMidi({ string: 1, fret: 3 })),
);
check(
  'noteMidi 带上 capo',
  noteMidi({ string: 6, fret: 0 }, undefined, 2) === 42,
  String(noteMidi({ string: 6, fret: 0 }, undefined, 2)),
);

console.log('\u001b[1m[2] 弹准（每个音都对）\u001b[0m');
const perfect = [
  note('a', 0.0, 0.4, 64),
  note('b', 0.5, 0.4, 66),
  note('c', 1.0, 0.4, 67),
];
const perfectScore = scorePlayAlong(perfect, [
  ...frames(0.0, 0.4, 64),
  ...frames(0.5, 0.9, 66),
  ...frames(1.0, 1.4, 67),
]);
check('命中率 100%', perfectScore.hitRate === 1, String(perfectScore.hitRate));
check('全部 hit', perfectScore.hit === 3 && perfectScore.graded === 3);
check('平均偏差 ≈ 0', perfectScore.avgAbsCents < 1, String(perfectScore.avgAbsCents));

console.log('\u001b[1m[3] 偏高 / 偏低\u001b[0m');
const sharpScore = scorePlayAlong(
  [note('a', 0.0, 0.4, 64)],
  frames(0, 0.4, 64, HIT_CENTS + 20),
);
check('+45 音分 → sharp', sharpScore.notes[0].verdict === 'sharp', sharpScore.notes[0].verdict);
check('音分数值正确（≈+45）', Math.abs((sharpScore.notes[0].cents || 0) - 45) < 2, String(sharpScore.notes[0].cents));

const flatScore = scorePlayAlong(
  [note('a', 0.0, 0.4, 64)],
  frames(0, 0.4, 64, -(HIT_CENTS + 20)),
);
check('-45 音分 → flat', flatScore.notes[0].verdict === 'flat', flatScore.notes[0].verdict);
check('flat 的音分为负', (flatScore.notes[0].cents || 0) < 0);

const edgeScore = scorePlayAlong([note('a', 0.0, 0.4, 64)], frames(0, 0.4, 64, HIT_CENTS));
check(`正好 ${HIT_CENTS} 音分仍算 hit（边界取等号）`, edgeScore.notes[0].verdict === 'hit');

console.log('\u001b[1m[4] 弹错音 / 没弹\u001b[0m');
const wrongScore = scorePlayAlong([note('a', 0.0, 0.4, 64)], frames(0, 0.4, 59)); // 高 5 个半音
check('音高差 5 个半音 → wrong', wrongScore.notes[0].verdict === 'wrong', wrongScore.notes[0].verdict);
check('wrong 不计入 graded（有声音但不判分）', wrongScore.graded === 1 && wrongScore.hitRate === 0);

const noneScore = scorePlayAlong([note('a', 0.0, 0.4, 64)], []);
check('完全没帧 → silent', noneScore.notes[0].verdict === 'silent');
check('silent 不进命中率分母', noneScore.graded === 0 && noneScore.hitRate === 0);
check('覆盖率 0', noneScore.coverage === 0);

const halfScore = scorePlayAlong(
  [note('a', 0.0, 0.4, 64), note('b', 0.5, 0.4, 66)],
  frames(0, 0.4, 64),
);
check('一个弹了一个没弹 → graded=1、hitRate=1', halfScore.graded === 1 && halfScore.hitRate === 1);
check('覆盖率 50%', halfScore.coverage === 0.5, String(halfScore.coverage));
check('silent 计数 = 1', halfScore.silent === 1);

console.log('\u001b[1m[5] 窗口边界与抗噪\u001b[0m');
check(
  `起点前 ${LEAD_SEC}s 内的帧算「已起音」（起振延迟）`,
  scorePlayAlong([note('a', 1.0, 0.4, 64)], frames(1.0 - LEAD_SEC + 0.005, 1.01, 64)).notes[0].verdict ===
    'hit',
);
check(
  `尾端后 ${TAIL_SEC}s 内的帧仍然采信（余韵）`,
  scorePlayAlong([note('a', 1.0, 0.2, 64)], frames(1.01, 1.2 + TAIL_SEC - 0.01, 64)).notes[0].verdict === 'hit',
);
check(
  '窗口外（远超前扩）的帧不算这个音的',
  scorePlayAlong([note('a', 1.0, 0.2, 64)], frames(0.2, 0.6, 64)).notes[0].verdict === 'silent',
);

/**
 * 中位数抗离群：90% 的帧都在目标音高上，混入 2 帧八度泛音（+1200 音分、仍在 ±1 半音之外）
 * → 判定不应被带跑（如果实现里写成"取第一个匹配帧"或"平均"就会出错）。
 */
const noisyFrames: PitchFrame[] = [
  ...frames(0, 0.4, 64),
  { tSec: 0.1, freq: midiToHz(64 + 12) },
  { tSec: 0.2, freq: midiToHz(64 - 12) },
];
const noisyScore = scorePlayAlong([note('a', 0.0, 0.4, 64)], noisyFrames);
check('混入八度泛音后仍然判定为 hit', noisyScore.notes[0].verdict === 'hit', noisyScore.notes[0].verdict);
check('音分偏差仍接近 0', Math.abs(noisyScore.notes[0].cents || 0) < 5, String(noisyScore.notes[0].cents));

console.log('\u001b[1m[6] 小节 → 音符时间轴（绝对秒）\u001b[0m');
const measures: PracticeMeasure[] = [
  {
    id: 'm1',
    index: 1,
    startTime: 10,
    endTime: 12,
    duration: 2,
    trackData: [
      {
        trackId: 't',
        instrument: 'guitar',
        audioUrl: 'a.mp3',
        originalAudioUrl: null,
        notes: [
          { id: 'n1', string: 3, fret: 0, midi: 55, relativeTime: 0, duration: 0.4 },
          { id: 'n2', string: 3, fret: 2, midi: 57, relativeTime: 1, duration: 0.4 },
        ],
      },
    ],
  },
  {
    id: 'm2',
    index: 2,
    startTime: 12,
    endTime: 14,
    duration: 2,
    trackData: [
      {
        trackId: 't',
        instrument: 'guitar',
        audioUrl: 'b.mp3',
        originalAudioUrl: null,
        notes: [{ id: 'n3', string: 4, fret: 0, midi: 50, relativeTime: 0.5, duration: 0.2 }],
      },
    ],
  },
];
const collected = collectEvalNotes(measures, 0);
check('音符数量正确', collected.length === 3, String(collected.length));
check(
  '小节内偏移 + 小节绝对起点 = 绝对时间（10+1=11）',
  collected[1].startSec === 11,
  String(collected[1].startSec),
);
check('跨小节也正确（12+0.5=12.5）', collected[2].startSec === 12.5, String(collected[2].startSec));
check('按时间升序', collected[0].startSec < collected[1].startSec && collected[1].startSec < collected[2].startSec);
check(
  'duration 缺失时给下界（不会出现 0 长度窗口）',
  collectEvalNotes(
    [
      {
        ...measures[0],
        trackData: [
          {
            trackId: 't',
            instrument: 'guitar',
            audioUrl: 'a.mp3',
            originalAudioUrl: null,
            notes: [{ id: 'n', string: 1, fret: 0, relativeTime: 0 }],
          },
        ],
      },
    ],
    0,
  )[0].endSec > 0,
);
check('缺 midi 时按调弦推算（3 弦空弦 = midi 55）', collected[0].midi === 55, String(collected[0].midi));

console.log(`\n\u001b[1m汇总\u001b[0m：${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
