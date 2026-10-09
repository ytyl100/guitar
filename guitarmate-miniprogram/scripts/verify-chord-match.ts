/**
 * 和弦微测判定内核的验证脚本（只读、不联网、退出码非 0 即失败）
 * ==========================================================
 *
 * 跑法（Node 22.18+ 原生支持 TS 类型擦除，不需要 tsx/ts-node）：
 *
 * ```
 * cd guitarmate-miniprogram && node scripts/verify-chord-match.ts
 * ```
 *
 * 为什么值得单写一个脚本：这块逻辑**错了不会崩**，只会"悄悄判错"——
 * 学生明明按对了却得 0 分。所以要用断言把边界钉住，而不是靠手动点界面看感觉。
 */
import { getChordPositions } from '../src/utils/chordLibraryData';
import {
  MATCH_TOLERANCE,
  MIN_FRAMES,
  PASS_PERCENT,
  STRING_MIDI,
  chordTargetMidis,
  feedbackFor,
  midiToNoteName,
  parseChordName,
  scoreChordMatch,
  tierOf,
  type DetectedNote,
} from '../src/utils/chordMatch';

let pass = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(label: string, actual: T, expected: T) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, a === e ? '' : `实际 ${a}，期望 ${e}`);
}

console.log('\n【1】和弦名解析');
eq("'C' → C major", parseChordName('C'), { root: 'C', type: 'major' });
eq("'Am' → A minor", parseChordName('Am'), { root: 'A', type: 'minor' });
eq("'F' → F major", parseChordName('F'), { root: 'F', type: 'major' });
eq("'Em' → E minor", parseChordName('Em'), { root: 'E', type: 'minor' });
eq("'Dm7' → D m7", parseChordName('Dm7'), { root: 'D', type: 'm7' });
eq("'G7' → G 7", parseChordName('G7'), { root: 'G', type: '7' });
eq("'Cmaj7' → C maj7", parseChordName('Cmaj7'), { root: 'C', type: 'maj7' });
eq("'C#m' → C# minor（两字符根音）", parseChordName('C#m'), { root: 'C#', type: 'minor' });
eq("'Bb' → Bb major（降号根音）", parseChordName('Bb'), { root: 'Bb', type: 'major' });
eq("'Asus4' → A sus4", parseChordName('Asus4'), { root: 'A', type: 'sus4' });
eq("'' → C major（不抛异常）", parseChordName(''), { root: 'C', type: 'major' });
eq("'Xyz' → C major（认不出就退大三和弦）", parseChordName('Xyz'), { root: 'X', type: 'major' });

console.log('\n【2】空弦 MIDI（第 6 弦 → 第 1 弦）');
eq('STRING_MIDI = [40,45,50,55,59,64]', STRING_MIDI, [40, 45, 50, 55, 59, 64]);
eq('midiToNoteName(40) = E2', midiToNoteName(40), 'E2');
eq('midiToNoteName(64) = E4', midiToNoteName(64), 'E4');

console.log('\n【3】指法 → 目标音');
// E 大调开放和弦（0 2 2 1 0 0）= E2 B2 E3 G#3 B3 E4
const eMajor = chordTargetMidis({ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 });
eq('E 大调开放 = [40,47,52,56,59,64]', eMajor, [40, 47, 52, 56, 59, 64]);
// 闷弦（-1）要跳过，不能算成 0 品
eq(
  '闷弦被跳过（[-1,0,0,0,0,0] 只出 5 个音）',
  chordTargetMidis({ frets: [-1, 0, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0], baseFret: 1 }),
  [45, 50, 55, 59, 64],
);
// 高把位横按（baseFret 只是显示用，音符由 frets 的绝对品数算）
eq(
  '横按用绝对品位（[8,10,10,9,8,8]）',
  chordTargetMidis({ frets: [8, 10, 10, 9, 8, 8], fingers: [1, 3, 4, 2, 1, 1], baseFret: 8 }),
  [48, 55, 60, 64, 67, 72],
);

console.log('\n【4】命中率');
const target = [40, 47, 52, 56];
const at = 10_000;
const mk = (midis: number[], t0 = at): DetectedNote[] => midis.map((m, i) => ({ at: t0 + i * 60, midi: m }));

eq('四个音全听到 → 100%', scoreChordMatch(target, mk([40, 47, 52, 56])).percent, 100);
eq('听到三个 → 75%', scoreChordMatch(target, mk([40, 47, 52])).percent, 75);
eq('听到两个 → 50%', scoreChordMatch(target, mk([40, 47])).percent, 50);
eq('一个都没中 → 0%', scoreChordMatch(target, mk([41, 48])).percent, 0);
check(
  `帧数不足（< ${MIN_FRAMES}）不给分（防噪声凑分）`,
  scoreChordMatch(target, mk([40, 47])).percent === 50 &&
    scoreChordMatch(target, [{ at, midi: 40 }]).percent === 0,
);
check(
  `容差内（±${MATCH_TOLERANCE}）算命中`,
  // \u26a0\ufe0f 给两帧：只给一帧会被 MIN_FRAMES 门限挡住，那就变成"在测门限"而不是测容差
  scoreChordMatch([40], mk([40 + MATCH_TOLERANCE - 0.01, 40 + MATCH_TOLERANCE - 0.01])).percent === 100,
);
check(
  '超出容差算未命中',
  scoreChordMatch([40], mk([40 + MATCH_TOLERANCE + 0.01, 40 + MATCH_TOLERANCE + 0.01])).percent === 0,
);
check(
  '窗口外的旧音不算（2.5s 前）',
  scoreChordMatch([40, 47], [
    { at: at - 3000, midi: 40 },
    { at: at - 2900, midi: 47 },
    { at, midi: 52 },
    { at: at + 60, midi: 53 },
  ]).percent === 0,
);
eq('缺音列表给出没听到的目标音', scoreChordMatch(target, mk([40, 52])).missing, [47, 56]);
eq('空目标音 → 0 分且不崩', scoreChordMatch([], mk([40, 47])).percent, 0);

console.log('\n【5】档位与文案');
eq('90 → perfect', tierOf(90), 'perfect');
eq('89 → pass', tierOf(89), 'pass');
eq(`${PASS_PERCENT} → pass（达标线）`, tierOf(PASS_PERCENT), 'pass');
eq('79 → near', tierOf(79), 'near');
eq('65 → near', tierOf(65), 'near');
eq('64 → adjust', tierOf(64), 'adjust');
check('四档文案都不为空且互不相同', new Set([90, 85, 70, 30].map(feedbackFor)).size === 4);

console.log('\n【6】课程里真实用到的和弦，指法库里都有');
/** course_001 的微测项就是这四个（1674 万能走向） */
for (const name of ['C', 'Am', 'F', 'G', 'Em', 'D', 'Dm7', 'G7', 'A', 'E']) {
  const { root, type } = parseChordName(name);
  const positions = getChordPositions(root, type);
  const first = positions[0];
  const targets = first ? chordTargetMidis(first) : [];
  check(
    `${name}（${root} ${type}）→ 有指法且目标音非空`,
    positions.length > 0 && targets.length > 0,
    `positions=${positions.length} targets=${JSON.stringify(targets)}`,
  );
}

console.log('\n' + '─'.repeat(58));
if (failures.length) {
  console.log(`❌ ${failures.length} 项未通过（通过 ${pass} 项）：`);
  failures.forEach((f) => console.log(`   · ${f}`));
  process.exit(1);
}
console.log(`🎉 全部通过：${pass} 项断言`);
