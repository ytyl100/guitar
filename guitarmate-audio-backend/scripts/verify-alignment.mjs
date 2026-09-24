/**
 * 校验「合成/切片音频」与「六线谱标注节点」的时序对齐度
 *
 * 用法:
 *   node scripts/verify-alignment.mjs <wav路径> [scoreId]
 *
 * 例:
 *   node scripts/verify-alignment.mjs uploads/demo/render_xxx.wav
 *
 * 原理：对 16bit 单声道 WAV 做 10ms 窗 RMS，检测「拨弦起音 (attack)」，
 * 再与 /api/published/scores/:id/measures 里的 note.relativeTime 比对。
 *
 * 期望结果：
 *   ① 起音命中标注 ≈ 100%（偏差应在 ±10ms 内）
 *   ② 无标注处的多余起音 = 0
 *      （若少量出现，通常是多音持续共鸣产生的拍频包络，属正常物理现象）
 */
import { readFileSync } from 'fs';

const BASE = process.env.API_BASE || 'http://localhost:3000';
const SCORE_ID = process.argv[3];
const WAV_PATH = process.argv[2];

if (!WAV_PATH) {
  console.error('用法: node scripts/verify-alignment.mjs <wav路径> [scoreId]');
  process.exit(1);
}

function readWav(path) {
  const buf = readFileSync(path);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (bits !== 16 || channels !== 1) throw new Error('expected 16bit mono');
  const n = buf.readUInt32LE(40) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return { samples: out, sampleRate, duration: n / sampleRate };
}

function rmsWindows(samples, sampleRate, windowMs = 10) {
  const w = Math.floor((sampleRate * windowMs) / 1000);
  const out = [];
  for (let s = 0; s + w <= samples.length; s += w) {
    let sum = 0;
    for (let i = s; i < s + w; i++) sum += samples[i] * samples[i];
    out.push({ atSec: s / sampleRate, rms: Math.sqrt(sum / w) });
  }
  return out;
}

/** 起音检测：能量相对前一窗明显抬升且达到绝对阈值 */
function detectAttacks(windows, { riseRatio = 1.6, absThreshold = 0.01 } = {}) {
  const raw = [];
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1].rms;
    const cur = windows[i].rms;
    if (cur >= absThreshold && cur > prev * riseRatio) raw.push(windows[i].atSec);
  }
  const merged = [];
  for (const t of raw) {
    if (merged.length && t - merged[merged.length - 1] < 0.08) continue;
    merged.push(t);
  }
  return merged;
}

async function main() {
  let scoreId = SCORE_ID;
  if (!scoreId) {
    const scores = await (await fetch(`${BASE}/api/published/scores`)).json();
    if (scores.length === 0) throw new Error('后端没有已发布曲目，请在管理后台先发布小节');
    scoreId = scores[0].id;
    console.log(`未指定 scoreId，使用第一首已发布曲目：${scores[0].title} (${scoreId})`);
  }

  const measures = await (await fetch(`${BASE}/api/published/scores/${scoreId}/measures`)).json();

  const { samples, sampleRate, duration } = readWav(WAV_PATH);
  const windows = rmsWindows(samples, sampleRate, 10);
  const attacks = detectAttacks(windows);

  const noteSet = new Set();
  for (const m of measures) {
    for (const t of m.trackData) {
      for (const n of t.notes) noteSet.add(+(m.startTime + n.relativeTime).toFixed(3));
    }
  }
  const noteTimes = [...noteSet].sort((a, b) => a - b);

  const matched = attacks.filter((a) => noteTimes.some((t) => Math.abs(t - a) <= 0.06));
  const falsePositives = attacks.filter((a) => !noteTimes.some((t) => Math.abs(t - a) <= 0.06));

  console.log(
    `音频时长 ${duration.toFixed(2)}s · 标注节点 ${noteTimes.length} 个(去重) · 检测到起音 ${attacks.length} 次`,
  );
  console.log(
    `① 起音命中标注: ${matched.length}/${noteTimes.length} (${((matched.length / noteTimes.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `② 无标注处的多余起音: ${falsePositives.length} 次${
      falsePositives.length ? ' → ' + falsePositives.join(', ') : '（无多余声音）'
    }`,
  );
  console.log('\n起音时刻 vs 最近标注时刻:');
  for (const a of attacks.slice(0, 12)) {
    const nearest = noteTimes.reduce((b, t) => (Math.abs(t - a) < Math.abs(b - a) ? t : b), noteTimes[0]);
    console.log(
      `  ${a.toFixed(3)}s  ←→  标注 ${nearest.toFixed(3)}s   偏差 ${((a - nearest) * 1000).toFixed(0)}ms`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
