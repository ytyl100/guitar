/**
 * 生成一段真实可听的「吉他 solo + 和弦伴奏」样品音频
 * ==================================================
 *
 * 为什么自己合成、而不是下载一首曲子？
 *
 * 1. **版权**：市面上任何一首真实 solo 录音都有版权，不能进仓库、不能进 CI；
 * 2. **可复现**：样品必须每次生成都一样（含真值标注），否则验证无法比较；
 * 3. **真值**：合成时我们**知道每个音的真实音高**，可以直接量化
 *    「音频 → 六线谱」的识别准确率 —— 用别人的录音反而没法验。
 *
 * 声音本身是**物理建模**出来的（Karplus-Strong 拨弦模型：延迟线 + 递归低通），
 * 不是正弦波叠出来的「电子音」，因此频谱结构与真实拨弦一致，
 * 内置的 YIN 基频检测确实是在「听」它。
 *
 * ```
 *  A 小调 8 小节 · 96 BPM · 4/4
 *  和弦：Am | Am | F | F | C | C | G | G     ← 分解和弦琶音（支撑声部）
 *  solo：A 小调五声音阶 8 分音符线条            ← 被转录的主旋律（更响）
 * ```
 *
 * 用法：`npm run demo:solo` → `uploads/demo/solo_am_f_c_g.wav`（+ `.reference.json` 真值）
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'uploads', 'demo');

const SAMPLE_RATE = 44100;
const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const EIGHTH = BEAT / 2;
const BARS = 8;

const MASTER_GAIN = 0.86;
/**
 * 伴奏比 solo 轻很多，而且衰减更快 —— 两个现实理由：
 * 1. 单音基频检测（YIN）在「伴奏与 solo 同时存在」时会锁到公共次谐波；
 * 2. 练习谱的实际做法也是把伴奏压低、让主旋律听得清。
 */
const BED_GAIN = 0.13;
const BED_DECAY = 0.985;
const SOLO_GAIN = 0.62;
/** solo 音符时值占 8 分音符的比例：>1 会连音，=1 则有清晰界限（更利于起音检测） */
const SOLO_LEGATO = 1.02;

// ─────────────────────────────────────────────
// ① Karplus-Strong 拨弦合成
// ─────────────────────────────────────────────

/**
 * 拨响一根弦。
 *
 * 经典 KS：激励（滤波噪声）灌满长度为 `sr/f` 的环形延迟线，之后每步
 * `buf[j] ← decay × 0.5 × (buf[j] + buf[j+1])` —— 这个两点平均就是一个低通，
 * 高频衰减快、低频衰减慢，于是自动得到「拨弦后音色由亮变暗」的真实行为。
 *
 * @param {number} freq 基频
 * @param {number} durSec 时长
 * @param {number} decay 衰减系数（0.99 长延音，0.995 以上接近电吉他 sustain）
 */
function pluckString(freq, durSec, decay = 0.9965) {
  const n = Math.max(2, Math.round(SAMPLE_RATE / freq));
  const buf = new Float32Array(n);

  // 激励：低通噪声（越"软"越像手指拨弦，越"白"越像拨片）
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    const white = Math.random() * 2 - 1;
    last = 0.6 * white + 0.4 * last;
    buf[i] = last;
  }
  // 归一化激励，保证不同音高响度接近
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) for (let i = 0; i < n; i += 1) buf[i] /= peak;

  const length = Math.max(1, Math.round(durSec * SAMPLE_RATE));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const j = i % n;
    const k = (i + 1) % n;
    out[i] = buf[j];
    buf[j] = decay * 0.5 * (buf[j] + buf[k]);
  }
  return out;
}

/** 把一段音频叠加到总线上（带增益，越界相加，最后统一归一化） */
function mixInto(bus, clip, startSec, gain) {
  const offset = Math.round(startSec * SAMPLE_RATE);
  for (let i = 0; i < clip.length; i += 1) {
    const idx = offset + i;
    if (idx >= bus.length) break;
    bus[idx] += clip[i] * gain;
  }
}

// ─────────────────────────────────────────────
// ② 乐谱内容
// ─────────────────────────────────────────────

const MIDI = { A2: 45, C3: 48, F2: 41, G2: 43 };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * 伴奏声部：只取和弦的**中高音区**（不含最低根音）——
 * 让低频区域留给 YIN 做基频判断，避免伴奏把 solo 盖掉。
 * 数组元素为 MIDI 音高，按从低到高排列。
 */
const CHORD_BED = {
  Am: [57, 60, 64, 69], // A3 C4 E4 A4
  F: [53, 57, 60, 65], //  F3 A3 C4 F4
  C: [48, 52, 55, 60], //  C3 E3 G3 C4  ← 必须含根音，否则色度分析会把 C 认成 E
  G: [55, 59, 62, 67], //  G3 B3 D4 G4
};

/** 8 小节和弦进行（每和弦 2 小节） */
const PROGRESSION = ['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G'];

/**
 * solo 声部：A 小调五声音阶（A C D E G）的 8 分音符线条，每小节 8 个音。
 * 用 MIDI 音高写谱，弦/品位置交给下游的「最低把位」规则分配 ——
 * 与音频转录时真实发生的过程完全一致。
 */
const SOLO = [
  [69, 72, 74, 72, 76, 74, 72, 69], // 1  Am
  [72, 74, 76, 79, 81, 79, 76, 74], // 2  Am
  [77, 74, 72, 69, 72, 74, 77, 74], // 3  F
  [76, 74, 72, 74, 76, 79, 77, 74], // 4  F
  [72, 76, 79, 76, 72, 74, 72, 69], // 5  C
  [74, 76, 79, 81, 79, 76, 74, 72], // 6  C
  [71, 74, 79, 74, 71, 74, 76, 74], // 7  G
  [74, 72, 71, 69, 67, 69, 72, 69], // 8  G
];

// ─────────────────────────────────────────────
// ③ 渲染
// ─────────────────────────────────────────────

const totalSec = BARS * BAR + 1.2; // 尾巴留点余量给最后的延音
const bus = new Float32Array(Math.ceil(totalSec * SAMPLE_RATE));

const referenceNotes = [];

for (let bar = 0; bar < BARS; bar += 1) {
  const barStart = bar * BAR;
  const bed = CHORD_BED[PROGRESSION[bar]];

  // 伴奏：第 1 拍全和弦，第 3 拍轻一点再扫一次
  for (const [beatIndex, gain] of [
    [0, 1],
    [2, 0.72],
  ]) {
    const at = barStart + beatIndex * BEAT;
    bed.forEach((midi, i) => {
      // 扫弦：每根弦错开 9ms，模拟由上到下拨过
      const clip = pluckString(hz(midi), 1.2, BED_DECAY);
      mixInto(bus, clip, at + i * 0.009, BED_GAIN * gain * (i === 0 ? 1 : 0.85));
    });
  }

  // solo：8 分音符线条，每个音带一点人性化时值（±8ms）
  const line = SOLO[bar];
  for (let i = 0; i < line.length; i += 1) {
    const midi = line[i];
    const humanize = ((i * 37) % 17) / 1000 - 0.008; // 固定伪随机，保证可复现
    const startSec = barStart + i * EIGHTH + humanize;
    const duration = EIGHTH * SOLO_LEGATO;
    mixInto(bus, pluckString(hz(midi), duration + 0.25, 0.993), startSec, SOLO_GAIN);
    referenceNotes.push({
      startSec: Math.round(startSec * 10000) / 10000,
      midi,
      bar: bar + 1,
      eighth: i + 1,
    });
  }
}

// ─────────────────────────────────────────────
// ④ 归一化 + 写 16bit WAV
// ─────────────────────────────────────────────

let peak = 0;
for (let i = 0; i < bus.length; i += 1) peak = Math.max(peak, Math.abs(bus[i]));
const scale = peak > 0 ? MASTER_GAIN / peak : 1;

const pcm = Buffer.alloc(bus.length * 2);
for (let i = 0; i < bus.length; i += 1) {
  const v = Math.max(-1, Math.min(1, bus[i] * scale));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // fmt chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync(OUT_DIR, { recursive: true });
const wavPath = join(OUT_DIR, 'solo_am_f_c_g.wav');
writeFileSync(wavPath, Buffer.concat([header, pcm]));

// 真值文件：`demo-audio-to-miniprogram.mjs` 用它量化识别准确率
const referencePath = join(OUT_DIR, 'solo_am_f_c_g.reference.json');
writeFileSync(
  referencePath,
  JSON.stringify(
    {
      title: 'A 小调练习曲（solo + 和弦）',
      artist: 'GuitarMate 内置样品',
      license: 'public_domain',
      note: '本文件是合成样品的真值标注（不是转录结果），仅用于验证识别准确率。',
      bpm: BPM,
      timeSignature: '4/4',
      key: 'A minor',
      bars: BARS,
      durationSec: Math.round((bus.length / SAMPLE_RATE) * 1000) / 1000,
      chords: PROGRESSION,
      notes: referenceNotes,
    },
    null,
    2,
  ),
  'utf-8',
);

console.log(
  [
    '',
    '🎸 已生成吉他 solo + 和弦样品',
    `   音频：${wavPath}`,
    `   真值：${referencePath}`,
    `   ${BARS} 小节 · ${BPM} BPM · ${totalSec.toFixed(1)}s · ${referenceNotes.length} 个 solo 音`,
    `   和弦：${PROGRESSION.filter((c, i) => i === 0 || PROGRESSION[i - 1] !== c).join(' → ')}`,
    '',
  ].join('\n'),
);
