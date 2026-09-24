/**
 * 一次性联调脚本：把已发布曲目「重新发布」为双声道版本
 *  - Simplified 声道：uploads/demo/render_<scoreId>.wav（按标注对齐的吉他音频）
 *  - Original  声道：uploads/demo/render_band_<scoreId>.wav
 *                    （同一批吉他节点 + 贝斯 + 鼓，节拍网格取自小节窗口，整轨都落在节点上）
 *
 * 用法: node scripts/republish-dual-channel.mjs <scoreId> [Simplified音频] [Original音频]
 * 后两个参数省略时，会先调 POST /api/measures/render-audio 按标注合成：
 *   - 不带 withBand → 吉他（Simplified）
 *   - 带 withBand   → 吉他 + 贝斯 + 鼓（Original）
 */
const BASE = process.env.API_BASE || 'http://localhost:3000';
const scoreId = process.argv[2];
if (!scoreId) {
  console.error('usage: node scripts/republish-dual-channel.mjs <scoreId> [renderPath] [originalPath]');
  process.exit(1);
}

const j = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`);
  return body;
};

// 未显式指定音频路径时，按标注合成（吉他 / 吉他+贝斯+鼓）
let renderPath = process.argv[3];
let originalPath = process.argv[4];
if (!renderPath) {
  const guitar = await j('/api/measures/render-audio', {
    method: 'POST',
    body: JSON.stringify({ scoreId, fileName: `render_${scoreId}`, withBand: false }),
  });
  renderPath = guitar.suggestedPath;
  console.log(`🎸 吉他声道（Simplified）: ${renderPath} · ${guitar.durationSec}s`);
}
if (!originalPath) {
  const band = await j('/api/measures/render-audio', {
    method: 'POST',
    body: JSON.stringify({ scoreId, fileName: `render_band_${scoreId}`, withBand: true }),
  });
  originalPath = band.suggestedPath;
  console.log(
    `🥁 原声道（Original）: ${originalPath} · ${band.durationSec}s · 每小节 ${band.beatsPerBar} 拍`,
  );
}

const score = await j(`/api/scores/${scoreId}`);
const raw = await j(`/api/published/scores/${scoreId}/measures`);

// 后端 publish 是「追加」语义，同一曲目多次发布会产生重复小节。
// 这里按 index 去重，只保留第一个，避免把重复数据再发布一遍。
const deduped = new Map();
for (const m of raw) if (!deduped.has(m.index)) deduped.set(m.index, m);
const measures = [...deduped.values()].sort((a, b) => a.index - b.index);
if (measures.length !== raw.length) {
  console.log(`⚠️  检测到重复小节：${raw.length} → 去重后 ${measures.length}`);
}

const trackId = score.tracks[0].id;

console.log(`曲目《${score.title}》 小节数=${measures.length} track=${trackId}`);
console.log(`时间轴: ${measures[0].startTime} → ${measures[measures.length - 1].endTime}s`);

const payload = {
  scoreId,
  trackId,
  trackAudioPath: renderPath,
  channel: 'guitar',
  originalAudioPath: originalPath,
  bpm: measures[0].bpm,
  timeSignature: measures[0].timeSignature,
  measures: measures.map((m) => ({
    index: m.index,
    label: m.label,
    startTime: m.startTime,
    endTime: m.endTime,
    tabImageUrl: m.trackData[0]?.tabImageUrl || '',
    notes: (m.trackData[0]?.notes || []).map((n) => ({
      id: n.id,
      audioTime: Number((m.startTime + n.relativeTime).toFixed(4)),
      string: n.string,
      fret: n.fret,
      pitch: n.pitch,
      duration: n.duration,
      confidence: n.confidence,
      x: n.x,
      y: n.y,
    })),
    barres: (m.barres || []).map((b) => ({
      instrument: b.instrument,
      fret: b.fret,
      fromString: b.fromString,
      toString: b.toString,
      startTime: b.startTime,
      duration: b.duration,
      x: b.x,
      y: b.y,
    })),
    chords: (m.chords || []).map((c) => ({
      instrument: c.instrument,
      chordName: c.chordName,
      startTime: c.startTime,
      duration: c.duration,
      x: c.x,
      y: c.y,
    })),
  })),
};

const cleared = await j(`/api/measures/score/${scoreId}`, { method: 'DELETE' });
console.log('已清空旧小节:', cleared);

const res = await j('/api/measures/publish', { method: 'POST', body: JSON.stringify(payload) });
console.log('发布结果:', {
  success: res.success,
  channel: res.channel,
  hasOriginalAudio: res.hasOriginalAudio,
  degradedAudioCount: res.degradedAudioCount,
  warnings: res.warnings,
});
const first = res.measures[0].trackData[0];
const last = res.measures[res.measures.length - 1].trackData[0];
console.log('第 1 小节音源:', { channel: first.channel, audioUrl: first.audioUrl, originalAudioUrl: first.originalAudioUrl });
console.log('末 小节音源:', { audioUrl: last.audioUrl, originalAudioUrl: last.originalAudioUrl });
