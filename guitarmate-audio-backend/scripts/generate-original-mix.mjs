/**
 * 生成一段「原声（全轨混音）」示例 WAV —— 用于验证 C 端 Original 模式。
 *
 * 与 generate-demo-audio.mjs 使用完全相同的 BPM / 小节长度 / 和声进行，
 * 但叠加了贝斯、底鼓、军鼓、踩镲，因此听起来明显「更满」，
 * 便于在小程序里对比 Simplified(仅吉他) 与 Original(全轨) 的差异。
 *
 * 用法: node scripts/generate-original-mix.mjs [输出路径]
 * 默认输出: ./uploads/demo/demo_original.wav
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const SAMPLE_RATE = 22050;
const BPM = 80;
const BEAT = 60 / BPM;
const BAR = BEAT * 4; // 3.0s / 小节
const BARS = 8;
const DURATION = BAR * BARS + 1.0;

/** 与吉他示例音频相同的小节和声进行（含贝斯根音，MIDI 音高） */
const CHORDS = [
  { name: 'Am', guitar: [45, 57, 60, 64, 60, 57], bass: 45 }, // A2
  { name: 'F', guitar: [41, 53, 57, 60, 57, 53], bass: 41 }, // F2
  { name: 'C', guitar: [48, 55, 60, 64, 60, 55], bass: 48 }, // C3
  { name: 'G', guitar: [43, 55, 59, 62, 59, 55], bass: 43 }, // G2
];

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const totalSamples = Math.floor(SAMPLE_RATE * DURATION);
const samples = new Float32Array(totalSamples);

const add = (idx, v) => {
  if (idx < 0 || idx >= totalSamples) return;
  samples[idx] += v;
};

/** 拨弦：基频 + 泛音 + 指数衰减（吉他） */
const pluck = (startSec, freq, gain = 0.5, ringSec = 1.6) => {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(ringSec * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-4.2 * t) * (1 - Math.exp(-380 * t));
    const w = 2 * Math.PI * freq * t;
    const v =
      Math.sin(w) + 0.36 * Math.sin(2 * w) + 0.18 * Math.sin(3 * w) + 0.09 * Math.sin(4 * w);
    add(start + i, v * env * gain * 0.32);
  }
};

/** 贝斯：正弦基频 + 轻微二次谐波，音头更硬、余音更长 */
const bassNote = (startSec, freq, gain = 0.55, ringSec = 2.4) => {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(ringSec * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-1.5 * t) * (1 - Math.exp(-500 * t));
    const w = 2 * Math.PI * freq * t;
    add(start + i, (Math.sin(w) + 0.22 * Math.sin(2 * w)) * env * gain * 0.42);
  }
};

/** 打击乐：用带通化的白噪声 + 低频正弦包络模拟底鼓 / 军鼓 / 踩镲 */
const drum = (startSec, kind) => {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const conf = {
    kick: { len: 0.28, gain: 0.9, decay: 16 },
    snare: { len: 0.22, gain: 0.42, decay: 22 },
    hihat: { len: 0.06, gain: 0.2, decay: 70 },
  }[kind];
  const len = Math.floor(conf.len * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-conf.decay * t);
    if (kind === 'kick') {
      // 音高下滑的底鼓
      const freq = 120 * Math.exp(-22 * t) + 45;
      add(start + i, Math.sin(2 * Math.PI * freq * t) * env * conf.gain * 0.6);
    } else if (kind === 'snare') {
      const noise = Math.random() * 2 - 1;
      add(start + i, (noise * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.5) * env * conf.gain * 0.6);
    } else {
      const noise = Math.random() * 2 - 1;
      add(start + i, noise * env * conf.gain * 0.45);
    }
  }
};

for (let bar = 0; bar < BARS; bar++) {
  const chord = CHORDS[bar % CHORDS.length];
  const barStart = bar * BAR;

  // 吉他：八分音符分解，音量比纯吉他示例低一些，给贝斯/鼓留空间
  const step = BAR / 8;
  chord.guitar.forEach((midi, i) => {
    pluck(barStart + i * step, midiToFreq(midi), i === 0 ? 0.5 : 0.34, 1.8);
  });

  // 贝斯：每拍一下根音，第 3 拍加一个五度
  for (let beat = 0; beat < 4; beat++) {
    const midi = beat === 2 ? chord.bass + 7 : chord.bass;
    bassNote(barStart + beat * BEAT, midiToFreq(midi), 0.62, 1.1);
  }

  // 鼓：底鼓 1/3 拍、军鼓 2/4 拍、踩镲八分音符
  for (let beat = 0; beat < 4; beat++) {
    if (beat % 2 === 0) drum(barStart + beat * BEAT, 'kick');
    else drum(barStart + beat * BEAT, 'snare');
    drum(barStart + beat * BEAT + BEAT / 2, 'hihat');
  }
  drum(barStart, 'hihat');
}

// 归一化并加淡出，避免削波
let peak = 0;
for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
const norm = peak > 0 ? 0.9 / peak : 1;
const fadeStart = Math.floor(totalSamples - SAMPLE_RATE * 0.25);

const dataBytes = totalSamples * 2;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < totalSamples; i++) {
  let v = samples[i] * norm;
  if (i >= fadeStart) {
    const k = 1 - (i - fadeStart) / (totalSamples - fadeStart);
    v *= Math.max(0, k);
  }
  buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
}

const outPath = resolve(
  process.argv[2] || join(process.cwd(), 'uploads', 'demo', 'demo_original.wav'),
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);

console.log(`✅ 已生成原声（全轨混音）示例音频: ${outPath}`);
console.log(`   时长 ${DURATION.toFixed(2)}s · ${SAMPLE_RATE}Hz 16bit mono · ${BARS} 小节 @ ${BPM} BPM`);
console.log(`   含吉他 + 贝斯 + 底鼓/军鼓/踩镲 —— 用于 C 端 Original 模式对比`);
