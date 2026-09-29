/**
 * 诊断脚本：审计「C 端曲库」每一条已发布小节的音频可达性
 * ========================================================
 *
 * 用途：排查「后面的小节没有声音」这类问题。它对每个已发布曲目：
 *   1. 拉 `/api/published/library`（统一曲库：旧 Score 链路 ∪ 转录 PracticePackage 链路）
 *   2. 逐个拉 `/api/published/items/:id/package`（统一取契约，id 可以是 Score id 或 Project id）
 *   3. 对 Simplified / Original 两个声道逐个发 HEAD 请求，打印状态码 + 字节数
 *   4. 顺带检查「同一曲目里多个小节是否指向**同一个文件**」（切片失败时会出现）
 *
 * 用法：node scripts/audit-measure-audio.mjs [apiBase]
 * 退出码：0 = 全部可达；1 = 存在不可达的音频（会被打印出来）
 */
const API = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

async function head(url) {
  if (!url) return { ok: false, label: 'no-url' };
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    return { ok: res.ok, label: `${res.status}/${len ?? '?'}` };
  } catch (err) {
    return { ok: false, label: `ERR ${String(err.message).slice(0, 40)}` };
  }
}

const library = await (await fetch(`${API}/api/published/library`)).json();
if (!library.length) {
  console.log('（后端暂无已发布曲目）');
  process.exit(0);
}

let bad = 0;
for (const item of library) {
  const res = await fetch(`${API}/api/published/items/${item.id}/package`);
  if (!res.ok) {
    console.log(`\n=== ${item.title} (${item.id}) — ❌ 取 package 失败：${res.status} ===`);
    bad += 1;
    continue;
  }
  const pkg = await res.json();
  /** 与前端 dedupeMeasuresByIndex 同一规则：同 index 只保留第一条 */
  const seen = new Set();
  const measures = (pkg.measures || []).filter((m) => {
    if (seen.has(m.index)) return false;
    seen.add(m.index);
    return true;
  });

  console.log(
    `\n=== ${item.title} [${item.source}] (${item.id}) — raw=${pkg.measures?.length ?? 0} dedup=${measures.length} ===`,
  );

  const audioUrls = new Set();
  let duplicateFile = false;
  for (const m of measures) {
    const track = m.trackData?.[0];
    const a = await head(track?.audioUrl);
    const o = await head(track?.originalAudioUrl);
    if (!a.ok) bad += 1;
    if (track?.audioUrl) {
      if (audioUrls.has(track.audioUrl)) duplicateFile = true;
      audioUrls.add(track.audioUrl);
    }
    const flags = [a.ok ? '' : '❌SIMPLIFIED', o.ok ? '' : '⚠️ORIGINAL'].filter(Boolean).join(' ');
    console.log(
      `  m${String(m.index).padStart(3)} dur=${Number(m.duration).toFixed(2)}s  audio=${a.label.padEnd(14)} orig=${o.label.padEnd(14)} ${
        track?.audioUrl?.split('/').pop() ?? '-'
      } ${flags}`,
    );
  }
  if (duplicateFile && measures.length > 1) {
    console.log('  ⚠️ 多个小节指向同一个音频文件 —— 切片可能失败（每小节应各自一个文件）');
  }
}

console.log(bad === 0 ? '\n✅ 所有小节的练习声道音频均可达' : `\n❌ 有 ${bad} 处音频不可达`);
process.exit(bad === 0 ? 0 : 1);

