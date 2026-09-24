/**
 * 生成一段真实可播放的示例吉他分解和弦 WAV 文件
 * 用途：
 *   1. 本地开发 / 联调时验证「小节音频切片 → 前端播放」全链路
 *   2. 在管理后台发布小节时作为「分轨音频路径」使用
 *
 * 用法: node scripts/generate-demo-audio.mjs [输出路径]
 * 默认输出: ./uploads/demo/demo_guitar.wav
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const SAMPLE_RATE = 22050;
const BPM = 80;
const BEAT = 60 / BPM;
const BAR = BEAT * 4; // 3.0s / 小节
const BARS = 8;
const DURATION = BAR * BARS + 1.0;

/** 每小节的分解和弦指法 (按时间顺序的 MIDI 音高) */
const CHORDS = [
  { name: 'Am', notes: [45, 57, 60, 64, 60, 57] }, // A2 A3 C4 E4 C4 A3
  { name: 'F', notes: [41, 53, 57, 60, 57, 53] }, // F2 F3 A3 C4 A3 F3
  { name: 'C', notes: [48, 55, 60, 64, 60, 55] }, // C3 G3 C4 E4 C4 G3
  { name: 'G', notes: [43, 55, 59, 62, 59, 55] }, // G2 G3 B3 D4 B3 G3
];

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const totalSamples = Math.floor(SAMPLE_RATE * DURATION);
const samples = new Float32Array(totalSamples);

/**
 * 叠加一个带衰减包络的拨弦音（基频 + 少量泛音，模拟钢弦吉他音色）
 */
const pluck = (startSec, freq, gain = 0.5, ringSec = 1.6) => {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(ringSec * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= totalSamples) continue;
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-4.2 * t) * (1 - Math.exp(-380 * t)); // 快速起音 + 指数衰减
    const w = 2 * Math.PI * freq * t;
    const v =
      Math.sin(w) +
      0.36 * Math.sin(2 * w) +
      0.18 * Math.sin(3 * w) +
      0.09 * Math.sin(4 * w);
    samples[idx] += v * env * gain * 0.32;
  }
};

// 逐小节生成 6 连音分解和弦（八分音符）
for (let bar = 0; bar < BARS; bar++) {
  const chord = CHORDS[bar % CHORDS.length];
  const barStart = bar * BAR;
  const step = BAR / 8; // 八分音符间隔
  chord.notes.forEach((midi, i) => {
    pluck(barStart + i * step, midiToFreq(midi), i === 0 ? 0.62 : 0.46, 1.8);
  });
}

// 归一化并加淡出，避免削波
let peak = 0;
for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
const norm = peak > 0 ? 0.86 / peak : 1;
const fadeStart = Math.floor(totalSamples - SAMPLE_RATE * 0.25);

const dataBytes = totalSamples * 2;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16); // fmt chunk size
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
buffer.writeUInt16LE(2, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample
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
  process.argv[2] || join(process.cwd(), 'uploads', 'demo', 'demo_guitar.wav'),
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);

console.log(`✅ 已生成示例音频: ${outPath}`);
console.log(`   时长 ${DURATION.toFixed(2)}s · ${SAMPLE_RATE}Hz 16bit mono · ${BARS} 小节 @ ${BPM} BPM`);
console.log(`   每小节 ${BAR.toFixed(2)}s —— 与管理后台「按 BPM 自动生成小节」结果一致`);
