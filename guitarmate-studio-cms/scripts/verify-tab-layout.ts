/**
 * 标准六线谱排版回归测试
 * ======================
 *
 * 排版是**纯函数**，所以能像业务逻辑一样被断言 —— 不必靠肉眼看截图。
 * 这里逐条校验参考谱面（卡农古典吉他谱 / 练习谱）要求的标准元素：
 *
 * ```
 *   ♪ = 84                                    12          13     ← 小节号（每小节右上角）
 *      D                    A                                    ← 推荐和弦（每小节一个）
 *   1 把位                5 把位                                  ← **把位 = 第一顺位标注**
 *   T│─0──2──3──┬───5──7──7───│
 *   A│───────────┼─────────────│
 *   B│═══════════╪═════════════│                                ← 加粗低音弦
 *      │   │   │   │  │   │   │   │
 *      ╞════════╡   ╞════════╡                                 ← 节奏线（符干 + 连接符）
 * ```
 *
 * 运行：`npm run verify:tab-layout`
 */

import {
  CMS_TAB_METRICS,
  FINGER_MARKS,
  MINI_TAB_METRICS,
  buildStandardTabLayout,
  buildStandardTabSystemLayout,
  durationToBeamLevels,
  type StandardTabNoteInput,
} from '../src/components/review/standardTabLayout';
import {
  CANON_IN_D_BPM,
  CANON_IN_D_MEASURES,
  CANON_IN_D_TIME_SIGNATURE,
  chunkCanonMeasures,
} from '../src/data/canonInD';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}${detail ? `  \u001b[90m${detail}\u001b[0m` : ''}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}  ${detail}`);
  }
}

const BPM = 120; // 一拍 = 0.5s
const BEAT = 60 / BPM;

/** 八分音符单音旋律 + 一个三音和弦（覆盖参考谱面的全部元素） */
const NOTES: StandardTabNoteInput[] = [
  { id: 'n1', string: 1, fret: 0, offsetSec: 0, durationSec: BEAT / 2, finger: 0 },
  { id: 'n2', string: 1, fret: 2, offsetSec: BEAT / 2, durationSec: BEAT / 2, finger: 1 },
  { id: 'n3', string: 1, fret: 3, offsetSec: BEAT, durationSec: BEAT / 2, finger: 2 },
  { id: 'n4', string: 2, fret: 0, offsetSec: (BEAT * 3) / 2, durationSec: BEAT / 2, finger: 0 },
  // 四分音符：不应产生连接符
  { id: 'n5', string: 2, fret: 1, offsetSec: BEAT * 2, durationSec: BEAT, finger: 1 },
  // 三音和弦簇（同一时刻）→ 竖排 + 扫弦箭头
  { id: 'c1', string: 3, fret: 0, offsetSec: BEAT * 3, durationSec: BEAT, finger: 0 },
  { id: 'c2', string: 4, fret: 2, offsetSec: BEAT * 3, durationSec: BEAT, finger: 2 },
  { id: 'c3', string: 5, fret: 3, offsetSec: BEAT * 3, durationSec: BEAT, finger: 4 },
];

const CHORDS = [
  { name: 'C', offsetSec: 0 },
  { name: 'G', offsetSec: BEAT * 2 },
];

const layout = buildStandardTabLayout({
  notes: NOTES,
  chords: CHORDS,
  measureDuration: BEAT * 4,
  bpm: BPM,
  timeSignature: '4/4',
  tuning: [64, 59, 55, 50, 45, 40],
  position: 2,
  width: 1080,
  height: 168,
  measureIndex: 5,
  showClef: true,
  showTempo: true,
  isLastMeasure: true,
  metrics: CMS_TAB_METRICS,
});

console.log('\n\u001b[1m🎼 标准六线谱排版回归\u001b[0m\n');

// ── 1. 琴弦 ─────────────────────────────────
console.log('\u001b[1m[1] 琴弦与谱号\u001b[0m');
const lineWidths = layout.lines.map((l) => l.width);
check('共 6 条弦线', layout.lines.length === 6, `${layout.lines.length} 条`);
check(
  '低音 E 弦（最下方）线更粗',
  lineWidths[5] > lineWidths[0] && lineWidths.slice(0, 5).every((w) => w === lineWidths[0]),
  `上部 ${lineWidths[0]}px / 低音弦 ${lineWidths[5]}px`,
);
check('弦线自上而下等距', layout.stringYs.every((y, i) => i === 0 || y - layout.stringYs[i - 1] === CMS_TAB_METRICS.lineSpacing));
check('弦线横跨整个谱面宽度', layout.lines.every((l) => l.x1 < l.x2 && l.x1 === layout.lines[0].x1));

const clefTexts = layout.texts.filter((t) => t.role === 'clef');
check('TAB 谱号 = T / A / B 三个字母', clefTexts.map((t) => t.text).join('') === 'TAB', clefTexts.map((t) => t.text).join(''));
check(
  'TAB 字母自上而下排列（T 在 2 弦、B 在 6 弦）',
  clefTexts[0].y < clefTexts[1].y && clefTexts[1].y < clefTexts[2].y,
  clefTexts.map((t) => `y=${t.y.toFixed(0)}`).join(' < '),
);

const timeTexts = layout.texts.filter((t) => t.role === 'timeTop' || t.role === 'timeBottom');
check('拍号 4/4 已绘制', timeTexts.map((t) => t.text).join('/') === '4/4', timeTexts.map((t) => t.text).join('/'));
check('拍号分子在分母之上', timeTexts[0].y < timeTexts[1].y);
check('谱号与拍号在音符区左侧', clefTexts[0].x < layout.notes[0].x && timeTexts[0].x < layout.notes[0].x);
check('谱号 / 拍号仅在第一小节绘制', layout.texts.some((t) => t.role === 'clef'));

// ── 2. 速度 / 小节号 / 把位 ─────────────────
console.log('\n\u001b[1m[2] 速度 / 小节号 / 把位\u001b[0m');
const tempo = layout.texts.find((t) => t.role === 'tempo');
check('速度标记 ♪ = 120', !!tempo && tempo.text.includes('120'), tempo?.text || '(缺失)');
const measureNumber = layout.texts.find((t) => t.role === 'measureNumber');
check('小节号已绘制', measureNumber?.text === '5', measureNumber?.text || '(缺失)');
const positionMark = layout.texts.find((t) => t.role === 'position');
// 把位用**阿拉伯数字**（与「第 2 把位」的口径一致，学员不用先认罗马数字）
check('把位是阿拉伯数字 2（不再是罗马数字 II）', positionMark?.text === '2', positionMark?.text || '(缺失)');
check(
  '把位标记在左上角、小节号在右上角（对角分开）',
  !!positionMark && !!measureNumber && positionMark.x < layout.staffTop && measureNumber.x > 1080 * 0.6,
  `把位 x=${positionMark?.x.toFixed(0)} · 小节号 x=${measureNumber?.x.toFixed(0)}`,
);
check(
  '两个数字距离足够远（不会被读成同一个数）',
  !!positionMark && !!measureNumber && measureNumber.x - positionMark.x > 400,
  `相距 ${((measureNumber?.x ?? 0) - (positionMark?.x ?? 0)).toFixed(0)}px`,
);
const positionLabel = layout.texts.find((t) => t.role === 'positionLabel');
check(
  '把位数字后面紧跟「把位」小字（不与小号区分）',
  !!positionLabel && positionLabel.x > positionMark!.x && positionLabel.x < positionMark!.x + 24,
  `${positionMark?.text} + ${positionLabel?.text}`,
);

// ── 3. 和弦行 ───────────────────────────────
console.log('\n\u001b[1m[3] 和弦行\u001b[0m');
const chordTexts = layout.texts.filter((t) => t.role === 'chord');
check('和弦名已绘制（C / G）', chordTexts.map((t) => t.text).join(',') === 'C,G', chordTexts.map((t) => t.text).join(','));
check('和弦名在弦线**上方**', chordTexts.every((t) => t.y < layout.staffTop), `chordY=${chordTexts[0]?.y} staffTop=${layout.staffTop}`);
check(
  '和弦 x 与时间成正比（G 在第 3 拍）',
  Math.abs(chordTexts[1].x - layout.timeToX(BEAT * 2)) < 0.01,
  `x=${chordTexts[1].x.toFixed(1)} vs ${layout.timeToX(BEAT * 2).toFixed(1)}`,
);

// ── 4. 弦线上的数字（默认写手指号）──────
console.log('\n\u001b[1m[4] 弦线数字（手指号 / 品位号）\u001b[0m');
check('音符数 = 8', layout.notes.length === 8, `${layout.notes.length}`);
check(
  '弦线数字的 y 严格等于对应弦线 y（即「落在线上」）',
  layout.notes.every((n) => Math.abs(n.y - layout.stringYs[n.string - 1]) < 0.01),
  layout.notes.map((n) => `${n.text}@${n.string}:${n.y}`).slice(0, 4).join(' '),
);
check('每个弦线数字都有挖空区（弦线不被数字压住）', layout.lineGaps.length === layout.notes.length);
check(
  '挖空区与音符 x/y 对齐',
  layout.lineGaps.every((gap, i) => Math.abs(gap.y - layout.notes[i].y) < 0.01 && layout.notes[i].x >= gap.x1 && layout.notes[i].x <= gap.x2),
);

// 默认模式（把位优先）：弦线上的数字 = 品位，手指号降级为右上角上标
check(
  '默认模式弦线数字 = 品位（六线谱的第一信息）',
  layout.notes.every((n) => n.text === String(n.fret)),
  layout.notes.map((n) => n.text).join(','),
);
check(
  '默认不画手指上标（把位优先，谱面只留「把位 + 品位」）',
  layout.notes.every((n) => n.fingerText === undefined),
  layout.notes.map((n) => n.fingerText ?? '-').join(','),
);
check(
  '打开 showFinger 后手指上标全部绘制（0 显示为 ○）',
  (() => {
    const withFinger = buildStandardTabLayout({
      notes: NOTES,
      chords: CHORDS,
      measureDuration: BEAT * 4,
      bpm: BPM,
      tuning: [64, 59, 55, 50, 45, 40],
      width: 1080,
      height: 168,
      showClef: true,
      showFinger: true,
      metrics: CMS_TAB_METRICS,
    });
    return (
      withFinger.notes.every((n) => !!n.fingerText) &&
      withFinger.notes.every((n) => (n.fingerX ?? 0) > n.x && (n.fingerY ?? 0) < n.y)
    );
  })(),
);
check(
  '空弦写成 0（品位写法），不是 ○',
  layout.notes.filter((n) => n.fret === 0).every((n) => n.text === '0'),
  `${layout.notes.filter((n) => n.fret === 0).length} 个空弦`,
);
check(
  '真实品位仍然完整保留在 note.fret（供 title / 复核面板用）',
  layout.notes.map((n) => n.fret).join(',') === '0,2,3,0,1,0,2,3',
  layout.notes.map((n) => n.fret).join(','),
);
check(
  '弦线数字宽度按实际字符计算（1 字宽）',
  layout.notes[1].maskWidth < CMS_TAB_METRICS.fontSize * 0.68 * 2 + 5,
  `${layout.notes[1].maskWidth.toFixed(1)}px`,
);

// finger 模式（复核左手指法）：弦线数字 = 手指号，0 写成 ○
const fingerMode = buildStandardTabLayout({
  notes: NOTES,
  chords: CHORDS,
  measureDuration: BEAT * 4,
  bpm: BPM,
  timeSignature: '4/4',
  tuning: [64, 59, 55, 50, 45, 40],
  position: 2,
  width: 1080,
  height: 168,
  measureIndex: 5,
  showClef: true,
  noteLabel: 'finger',
  metrics: CMS_TAB_METRICS,
});
check(
  'finger 模式弦线数字 = 手指号（0 显示为 ○）',
  fingerMode.notes.every((n) => n.text === FINGER_MARKS[n.finger as number]),
  fingerMode.notes.map((n) => n.text).join(','),
);
check('finger 模式下不再重复画手指上标', fingerMode.notes.every((n) => n.fingerText === undefined));
check('finger 模式手指上标位置为空（未绘制）', fingerMode.notes.every((n) => n.fingerX === undefined));
check(
  '两种模式除了写什么字符，几何位置完全一致',
  fingerMode.notes.every((n, i) => Math.abs(n.x - layout.notes[i].x) < 0.01 && Math.abs(n.y - layout.notes[i].y) < 0.01),
);

// ── 4b. 换把标记（小节内手位变化）─────────────────
console.log('\n\u001b[1m[4b] 换把标记（品位始终可反推）\u001b[0m');
check(
  '音符未带手位时不画换把标记（只有小节把位）',
  layout.texts.filter((t) => t.role === 'positionShift').length === 0,
);
/**
 * 构造一小节内换把的合法数据：前 4 个音在第 2 把位、后 4 个音回到第 1 把位，
 * 手指号严格按 `finger = fret − position + 1` 生成（这正是「数字=手指号」可读的前提）。
 */
const shiftedNotes = NOTES.map((n, i) => {
  const position = i < 4 ? 2 : 1;
  return { ...n, position, finger: n.fret <= 0 ? 0 : Math.min(4, Math.max(1, n.fret - position + 1)) };
});
const shifted = buildStandardTabLayout({
  notes: shiftedNotes,
  chords: CHORDS,
  measureDuration: BEAT * 4,
  bpm: BPM,
  timeSignature: '4/4',
  tuning: [64, 59, 55, 50, 45, 40],
  position: 2,
  width: 1080,
  height: 168,
  measureIndex: 1,
  metrics: CMS_TAB_METRICS,
});
const shiftMarks = shifted.texts.filter((t) => t.role === 'positionShift');
check('手位变化处画出换把标记', shiftMarks.length === 1, `${shiftMarks.length} 个`);
check('换把标记写法为「N把位」', shiftMarks[0]?.text === '1把位', shiftMarks[0]?.text ?? '(无)');
check(
  '换把标记画在弦线上方（不压住数字）',
  !!shiftMarks[0] && shiftMarks[0].y < shifted.staffTop,
  `y=${shiftMarks[0]?.y.toFixed(0)} staffTop=${shifted.staffTop}`,
);
check(
  '不变式：任意音符都能由 position + 手指号反推品位（fret = position + finger − 1）',
  shifted.notes.every((n) => {
    if (!n.finger) return n.fret <= 0;
    return n.fret === (n.position ?? 1) + n.finger - 1;
  }),
  shifted.notes.map((n) => `${n.fret}→p${n.position}/f${n.finger}`).join(' '),
);
check(
  '弦线数字始终是**品位**（把位优先，不因换把而变成手指号）',
  shifted.notes.every((n) => n.text === String(n.fret)),
  shifted.notes.map((n) => n.text).join(','),
);

// ── 5. 节奏连接符 ───────────────────────────
console.log('\n\u001b[1m[5] 节奏连接符（速率连接符）\u001b[0m');
check('八分音符 → 1 条连接符', durationToBeamLevels(BEAT / 2, BEAT) === 1);
check('十六分音符 → 2 条连接符', durationToBeamLevels(BEAT / 4, BEAT) === 2);
check('四分音符 → 无连接符', durationToBeamLevels(BEAT, BEAT) === 0);
check('存在连接符（8 分音符组）', layout.beams.length > 0, `${layout.beams.length} 条`);
check('连接符画在弦线**下方**', layout.beams.every((b) => b.y > layout.staffBottom), `beamY=${layout.beams[0]?.y} staffBottom=${layout.staffBottom}`);
check('连接符跨 ≥2 个音符', layout.beams.every((b) => b.x2 > b.x1));
check(
  '四分音符不参与连接（第 5 个音符是四分）',
  layout.beams.every((b) => b.x1 < layout.notes[4].x),
  `四分音符 x=${layout.notes[4].x.toFixed(0)}`,
);

// ── 5b. 节奏线（符干 / 符尾 / 拍内分组）──────
console.log('\n\u001b[1m[5b] 节奏线（符干 + 连接符）\u001b[0m');
check(
  '每个发音点一条符干（含和弦簇，共 6 个发音点）',
  layout.stems.length === 6,
  `${layout.stems.length} 条`,
);
check(
  '符干从最低发声弦下方垂到节奏线',
  layout.stems.every((s) => s.y2 === layout.rhythmY && s.y1 < layout.rhythmY),
  `rhythmY=${layout.rhythmY}`,
);
check('节奏线在最低弦线之下、画布之内', layout.rhythmY > layout.staffBottom && layout.rhythmY < 168);
check(
  '四分音符只有符干、没有连接符（levels = 0）',
  layout.stems.filter((s) => !s.beamId).length === 2,
  `${layout.stems.filter((s) => !s.beamId).length} 条无连接符`,
);
check(
  '同拍内成组的符干带上 beamId（渲染层据此不再画符尾）',
  layout.stems.filter((s) => !!s.beamId).length === 4,
  `${layout.stems.filter((s) => !!s.beamId).length} 条在连接符组内`,
);
check(
  '连接符按拍分组：两组各 2 个八分音符',
  layout.beams.length === 2 && layout.beams.every((b) => b.level === 1),
  layout.beams.map((b) => `L${b.level}`).join(','),
);
check(
  '十六分音符产生两层连接符',
  durationToBeamLevels(BEAT / 4, BEAT) === 2 && durationToBeamLevels(BEAT / 8, BEAT) === 3,
);
check(
  '关闭节奏线时符干/连接符都不生成（showRhythm = false）',
  (() => {
    const noRhythm = buildStandardTabLayout({
      notes: NOTES,
      chords: CHORDS,
      measureDuration: BEAT * 4,
      bpm: BPM,
      tuning: [64, 59, 55, 50, 45, 40],
      width: 1080,
      height: 168,
      showClef: true,
      showRhythm: false,
      metrics: CMS_TAB_METRICS,
    });
    return noRhythm.stems.length === 0 && noRhythm.beams.length === 0;
  })(),
);

// ── 5c. 谱内进度条（播放行进条）──────────────
console.log('\n\u001b[1m[5c] 谱内进度条（播放行进条）\u001b[0m');
check(
  '进度条 y = 最低弦线 + progressRowGap',
  layout.progressY === layout.staffBottom + CMS_TAB_METRICS.progressRowGap,
  `progressY=${layout.progressY} staffBottom=${layout.staffBottom}`,
);
check('进度条在节奏线之下、画布之内', layout.progressY > layout.rhythmY && layout.progressY < 168);

// ── 6. 和弦簇 / 扫弦 ────────────────────────
console.log('\n\u001b[1m[6] 和弦簇与扫弦箭头\u001b[0m');
const clusterXs = [layout.notes[5].x, layout.notes[6].x, layout.notes[7].x];
check('同一时刻的音落在同一 x（自然竖排）', Math.max(...clusterXs) - Math.min(...clusterXs) < 0.01);
check('三音簇识别为扫弦', layout.strums.length === 1, `${layout.strums.length} 个扫弦`);
check('扫弦箭头在簇左侧', (layout.strums[0]?.x ?? 0) < Math.min(...clusterXs));
check(
  '扫弦箭头跨越整个簇的弦范围',
  !!layout.strums[0] && layout.strums[0].yTop < layout.stringYs[2] && layout.strums[0].yBottom > layout.stringYs[4],
);
check(
  '簇内音符标记了 strumId',
  layout.notes.slice(5).every((n) => !!n.strumId),
);

// ── 7. 小节线 / 拍点 ────────────────────────
console.log('\n\u001b[1m[7] 小节线与拍点刻度\u001b[0m');
check('拍点刻度 = 5 个（4/4）', layout.beatTicks.length === 5, `${layout.beatTicks.length}`);
check('拍点刻度在弦线下方', layout.beatTicks.every((t) => t.y1 > layout.staffBottom));
check('末小节画一细一粗两条收尾线', layout.barlines.length === 2 && layout.barlines[1].width > layout.barlines[0].width);
check('小节线在谱面右侧', layout.barlines[0].x1 > layout.timeToX(BEAT * 3.5));

// ── 8. 坐标系统一致性 ───────────────────────
console.log('\n\u001b[1m[8] 坐标系统\u001b[0m');
check('x 随时间单调递增', layout.notes.every((n, i) => i === 0 || n.x >= layout.notes[i - 1].x - 0.01));
check('t=0 → 音符区左边界', Math.abs(layout.timeToX(0) - CMS_TAB_METRICS.noteAreaLeft) < 0.01, `${layout.timeToX(0)}`);
check(
  't=小节时长 → 右侧留白之前',
  Math.abs(layout.timeToX(BEAT * 4) - (1080 - CMS_TAB_METRICS.noteAreaRight)) < 0.01,
  `${layout.timeToX(BEAT * 4).toFixed(1)}`,
);
check('越界时间被夹取（不画到画布外）', layout.timeToX(-5) === layout.timeToX(0) && layout.timeToX(999) === layout.timeToX(BEAT * 4));

// ── 9. 小程序端复用同一套规则 ───────────────
console.log('\n\u001b[1m[9] 小程序端（600×142 紧凑版）\u001b[0m');
const mini = buildStandardTabLayout({
  notes: NOTES,
  chords: CHORDS,
  measureDuration: BEAT * 4,
  bpm: BPM,
  timeSignature: '4/4',
  tuning: [64, 59, 55, 50, 45, 40],
  position: 2,
  width: 600,
  height: 142,
  measureIndex: 1,
  showClef: true,
  showTempo: true,
  metrics: MINI_TAB_METRICS,
});
check('小程序端同样是 6 线 + TAB 谱号', mini.lines.length === 6 && mini.texts.filter((t) => t.role === 'clef').length === 3);
check('小程序端低音弦线同样加粗', mini.lines[5].width > mini.lines[0].width);
check(
  '小程序端谱面不超出画布高度（连接符 + 进度条不重叠）',
  mini.beams.every((b) => b.y < 132 - 4),
  `最大 beamY=${Math.max(...mini.beams.map((b) => b.y))}`,
);
check('两端排版规则一致（都来自 buildStandardTabLayout）', mini.notes.length === layout.notes.length && mini.beams.length === layout.beams.length);
check(
  '小程序端进度条 y = 132（与 PracticeMeasure 的 PROGRESS_Y 常量一致）',
  mini.progressY === 132,
  `${mini.progressY}`,
);

// ── 10. 谱行（编辑段落 = 2-3 小节并排）───────
console.log('\n\u001b[1m[10] 谱行排版（一个编辑段落 = 2-3 小节）\u001b[0m');

const measureA = { index: 1, notes: NOTES, chords: CHORDS, chord: 'C', position: 2, duration: BEAT * 4 };
const measureB = { index: 2, notes: NOTES, chord: 'G', position: 5, duration: BEAT * 4 };
const system = buildStandardTabSystemLayout({
  measures: [measureA, measureB],
  bpm: BPM,
  timeSignature: '4/4',
  tuning: [64, 59, 55, 50, 45, 40],
  width: 1080,
  height: 168,
  showClef: true,
  showTempo: true,
  isLastSystem: true,
  metrics: CMS_TAB_METRICS,
});

check('谱行内小节数 = 2', system.measures.length === 2, `${system.measures.length}`);
check(
  '两个小节横向依次排列、互不重叠',
  system.measures[0].contentLeft < system.measures[0].contentRight &&
    system.measures[0].contentRight < system.measures[1].contentLeft &&
    system.measures[1].contentRight <= 1080 - CMS_TAB_METRICS.noteAreaRight + 0.01,
  `${system.measures.map((m) => `${m.contentLeft.toFixed(0)}–${m.contentRight.toFixed(0)}`).join(' | ')}`,
);
check(
  '小节号 / 把位各画一次，推荐和弦在没有显式和弦时补上',
  system.texts.filter((t) => t.role === 'measureNumber').length === 2 &&
    system.texts.filter((t) => t.role === 'position').length === 2 &&
    system.texts.filter((t) => t.role === 'chord').length === 3,
  `小节号 ${system.texts.filter((t) => t.role === 'measureNumber').length} · 把位 ${system.texts.filter((t) => t.role === 'position').length} · 和弦 ${system.texts.filter((t) => t.role === 'chord').length}`,
);
check(
  '推荐和弦落在本小节内容区左边界（和弦行最左）',
  (() => {
    const mine = system.texts.filter((t) => t.role === 'chord' && Math.abs(t.x - system.measures[1].contentLeft) < 0.01);
    return mine.length === 1 && mine[0].text === 'G';
  })(),
  system.texts.filter((t) => t.role === 'chord').map((t) => `${t.text}@${t.x.toFixed(0)}`).join(' '),
);
check(
  '每个小节的把位标记落在该小节左上角',
  system.texts
    .filter((t) => t.role === 'position')
    .every((t, i) => Math.abs(t.x - (system.measures[i].contentLeft + 2)) < 0.01),
  system.texts.filter((t) => t.role === 'position').map((t) => t.x.toFixed(0)).join(','),
);
check(
  '弦线上的数字跟着小节走（第二小节整体在小节区右移）',
  system.notes.filter((n) => n.x > system.measures[1].contentLeft - 1).length === NOTES.length,
);
check(
  '弦线横贯整条谱行（不是每小节画一段）',
  system.lines.length === 6 && system.lines.every((l) => l.x2 === 1080 - CMS_TAB_METRICS.noteAreaRight),
);
check(
  '谱号 / 拍号 / 速度只在谱行最左侧画一次',
  system.texts.filter((t) => t.role === 'clef').length === 3 &&
    system.texts.filter((t) => t.role === 'tempo').length === 1,
);
check(
  '中间小节线画在槽位之间、只有末尾是粗收尾线',
  system.barlines.length === 3 &&
    system.barlines.some((b) => b.x1 > system.measures[0].contentRight && b.x1 < system.measures[1].contentLeft) &&
    (() => {
      const rightmost = system.barlines.reduce((max, b) => (b.x1 > max.x1 ? b : max));
      return rightmost.width === Math.max(...system.barlines.map((b) => b.width)) && rightmost.width >= 4;
    })(),
  system.barlines.map((b) => `${b.x1.toFixed(0)}/${b.width}`).join(' '),
);
check(
  '节奏线按小节铺开（符号数 = 单小节 × 2）',
  system.stems.length === layout.stems.length * 2 && system.beams.length === layout.beams.length * 2,
  `符干 ${system.stems.length} · 连接符 ${system.beams.length}`,
);
check(
  '单小节谱行与多小节谱行的音符坐标连续（第 2 小节 = 第 1 小节 + 位移）',
  Math.abs(
    system.notes[NOTES.length].x - system.notes[0].x - (system.measures[1].contentLeft - system.measures[0].contentLeft),
  ) < 0.01,
);
check(
  '小节数超过 3 时被截断（避免品位数挤到看不清）',
  buildStandardTabSystemLayout({
    measures: [measureA, measureB, { ...measureA, index: 3 }, { ...measureA, index: 4 }],
    bpm: BPM,
    tuning: [64, 59, 55, 50, 45, 40],
    width: 1080,
    height: 168,
    metrics: CMS_TAB_METRICS,
  }).measures.length === 3,
);
check(
  '单小节仍由同一个引擎排版（谱行调用的就是 buildStandardTabLayout）',
  Math.abs(system.measures[0].timeToX(0) - system.measures[0].contentLeft) < 0.01 &&
    Math.abs(system.measures[0].timeToX(BEAT * 4) - system.measures[0].contentRight) < 0.01,
);
check(
  '谱行的进度条 y 与小节一致（播放行进条跨整行可用）',
  system.progressY === layout.progressY,
  `system=${system.progressY} single=${layout.progressY}`,
);
check(
  '小程序端谱行规则一致（同样 2 小节、同样音符数）',
  (() => {
    const miniSystem = buildStandardTabSystemLayout({
      measures: [measureA, measureB],
      bpm: BPM,
      timeSignature: '4/4',
      tuning: [64, 59, 55, 50, 45, 40],
      width: 600,
      height: 142,
      showClef: true,
      metrics: MINI_TAB_METRICS,
    });
    return miniSystem.measures.length === 2 && miniSystem.notes.length === system.notes.length;
  })(),
);

// ── 11. 卡农前 16 小节（真实测试数据）────────
console.log('\n\u001b[1m[11] 卡农前 16 小节（把位 / 推荐和弦 / 节奏线）\u001b[0m');

const canonChords = CANON_IN_D_MEASURES.map((m) => m.chord);
check('共 16 小节', CANON_IN_D_MEASURES.length === 16, `${CANON_IN_D_MEASURES.length} 小节`);
check(
  '和声骨架 = 卡农固定低音（D A Bm F#m G D G A 走两遍）',
  canonChords.join(',') === 'D,A,Bm,F#m,G,D,G,A,D,A,Bm,F#m,G,D,G,A',
  canonChords.join(','),
);
check(
  '每个小节都有推荐和弦与把位（用户要求的两项小节级标注数据）',
  CANON_IN_D_MEASURES.every((m) => !!m.chord && m.position >= 1),
);
const canonPositions = Array.from(new Set(CANON_IN_D_MEASURES.map((m) => m.position))).sort((a, b) => a - b);
check('把位覆盖 1 / 2 / 3 / 5 / 7（含多次换把）', canonPositions.join(',') === '1,2,3,5,7', canonPositions.join(','));
check(
  '不变式：每个音符 fret = position + finger − 1（或空弦 finger = 0）',
  CANON_IN_D_MEASURES.every((m) =>
    m.notes.every((n) => (n.fret <= 0 ? n.finger === 0 : n.fret === n.position + n.finger - 1)),
  ),
);
check(
  '所有音符都落在小节窗口内（offsetSec + durationSec ≤ 小节时长）',
  CANON_IN_D_MEASURES.every((m) =>
    m.notes.every((n) => n.offsetSec + n.durationSec <= m.duration + 1e-6),
  ),
);

const canonSystems = chunkCanonMeasures(2);
check('每行 2 小节 → 8 条谱行', canonSystems.length === 8, `${canonSystems.length} 行`);

const canonSystemLayouts = canonSystems.map((group, i) =>
  buildStandardTabSystemLayout({
    measures: group.map((m) => ({
      index: m.index,
      notes: m.notes,
      chord: m.chord,
      position: m.position,
      duration: m.duration,
    })),
    bpm: CANON_IN_D_BPM,
    timeSignature: CANON_IN_D_TIME_SIGNATURE,
    tuning: [64, 59, 55, 50, 45, 40],
    width: 1080,
    height: 168,
    showClef: true,
    showTempo: i === 0,
    isLastSystem: i === canonSystems.length - 1,
    metrics: CMS_TAB_METRICS,
  }),
);

check(
  '8 条谱行的音符总数为 131',
  canonSystemLayouts.reduce((sum, l) => sum + l.notes.length, 0) === 131,
  `${canonSystemLayouts.reduce((sum, l) => sum + l.notes.length, 0)}`,
);
check(
  '每条谱行都渲染出把位标记（2 个小节 → 2 个）',
  canonSystemLayouts.every((l) => l.texts.filter((t) => t.role === 'position').length === 2),
);
check(
  '每条谱行都渲染出推荐和弦（2 个小节 → 2 个）',
  canonSystemLayouts.every((l) => l.texts.filter((t) => t.role === 'chord').length === 2),
);
check(
  '音符 / 节奏线不越出画布，也不压到谱面外',
  canonSystemLayouts.every((l) =>
    l.notes.every((n) => n.x > 0 && n.x < 1080) &&
    l.stems.every((s) => s.y2 === l.rhythmY && s.x > 0 && s.x < 1080),
  ),
);
check(
  '第 5 条谱行（第 9-10 小节）出现两层连接符（第 10 小节含 16 分音符对）',
  canonSystemLayouts[4].beams.some((b) => b.level === 2),
  `levels=${Array.from(new Set(canonSystemLayouts[4].beams.map((b) => b.level))).join(',')}`,
);
check(
  '最后一条谱行有扫弦箭头（第 16 小节以 6 音和弦收尾）',
  canonSystemLayouts[7].strums.length === 1 &&
    canonSystemLayouts[7].strums[0].stringCount === 6,
  `${canonSystemLayouts[7].strums.length} 个扫弦`,
);
check(
  '换把处两条谱行的把位标记不同（第 11 / 12 小节 = 7 / 2 把位）',
  canonSystemLayouts[5].texts
    .filter((t) => t.role === 'position')
    .map((t) => t.text)
    .join(',') === '7,2',
  canonSystemLayouts[5].texts.filter((t) => t.role === 'position').map((t) => t.text).join(','),
);
check(
  '小程序端用同一份数据也能排出 8 条谱行（两端一致）',
  canonSystems.every((group) => {
    const l = buildStandardTabSystemLayout({
      measures: group.map((m) => ({
        index: m.index,
        notes: m.notes,
        chord: m.chord,
        position: m.position,
        duration: m.duration,
      })),
      bpm: CANON_IN_D_BPM,
      timeSignature: CANON_IN_D_TIME_SIGNATURE,
      tuning: [64, 59, 55, 50, 45, 40],
      width: 600,
      height: 142,
      showClef: true,
      metrics: MINI_TAB_METRICS,
    });
    return l.measures.length === group.length && l.notes.length === group.reduce((s, m) => s + m.notes.length, 0);
  }),
);

// ── 汇总 ────────────────────────────────────
console.log(`\n\u001b[1m汇总\u001b[0m：${passed}/${passed + failed} 通过`);
if (failed > 0) {
  console.log(`\n\u001b[31m${failed} 项失败\u001b[0m\n`);
  process.exit(1);
}
console.log('\u001b[32m标准六线谱排版全部符合预期 ✅\u001b[0m\n');
