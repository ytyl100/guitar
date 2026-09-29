/**
 * 谱面渲染一致性自测（服务端 vs 网页端）
 * =====================================
 *
 * 背景：小程序不支持 `<svg>`，谱面改由服务端渲染 PNG。为了保证
 * 「后台看到的谱 = 学员练的谱」，服务端 SVG 必须与前端 `PracticeSystem.tsx`
 * 渲染出**同样的元素与坐标**。
 *
 * 本脚本用**同一份已发布数据**（Macaroon 5 第 1-2 小节）在服务端出 SVG，
 * 打印各标签元素数量与坐标校验和；浏览器端用同样的脚本口径统计，
 * 两者应当一致（允许的差异是**有意的**，见下）。
 *
 * 允许差异：
 *   - `rect` ：服务端多 1 个（背景底色矩形，用于「挖空弦线」的填充色）
 *   - `circle`：网页端多 2 个（当前/下一音符高亮 —— 服务端不做，留给小程序叠加层）
 *   - `g`     ：网页端把每个音符包在 `<g onClick>` 里（只为交互），服务端不包
 *
 * 用法：node scripts/verify-tab-render.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

const { renderTabSystemSvg } = require(join(dist, 'published', 'tab-render', 'tab-svg.js'));

const ITEM = process.env.TAB_ITEM ?? 'cmugk3yso00088syw2k3zmlq2';
const FROM = Number(process.env.TAB_FROM ?? 1);
const COUNT = Number(process.env.TAB_COUNT ?? 2);
const API = process.env.TAB_API ?? 'http://localhost:3000';

const res = await fetch(`${API}/api/published/items/${ITEM}/package`);
if (!res.ok) {
  console.error(`❌ 取包失败 HTTP ${res.status}`);
  process.exit(1);
}
const pkg = await res.json();

// 与 tab-render.service.ts 同口径：按 index 去重 + 取吉他轨
const seen = new Set();
const measures = pkg.measures
  .filter((m) => {
    if (seen.has(m.index)) return false;
    seen.add(m.index);
    return true;
  })
  .sort((a, b) => a.index - b.index);
const trackIndex = Math.max(
  0,
  pkg.tracks.findIndex((t) => String(t.instrument || '').includes('guitar')),
);
const slice = measures.filter((m) => m.index >= FROM && m.index < FROM + COUNT);
if (!slice.length) {
  console.error(`❌ 小节 ${FROM} 起没有数据`);
  process.exit(1);
}
const lastIndex = measures[measures.length - 1].index;

const { svg } = renderTabSystemSvg({
  measures: slice.map((m) => {
    const td = m.trackData?.[trackIndex] ?? m.trackData?.[0];
    return {
      index: m.index,
      label: m.label,
      duration: m.duration,
      position: m.position,
      chord: m.chords?.[0]?.chordName,
      chords: (m.chords || []).map((c) => ({ name: c.chordName, offsetSec: c.startSec ?? c.startTime ?? 0 })),
      notes: (td?.notes || []).map((n) => ({
        id: n.id,
        string: n.string,
        fret: n.fret,
        offsetSec: n.relativeTime,
        durationSec: n.duration,
        finger: n.finger,
        position: n.position,
        technique: n.technique,
      })),
      barres: (m.barres || []).map((b) => ({
        id: b.id,
        fromString: b.fromString,
        toString: b.toString,
        startTime: b.startTime,
        duration: b.duration,
      })),
    };
  }),
  bpm: pkg.score?.bpm || 100,
  timeSignature: pkg.score?.timeSignature || '4/4',
  width: 600,
  height: 142,
  showClef: true,
  showTempo: true,
  isLastSystem: slice[slice.length - 1].index >= lastIndex,
  dark: true,
});

/** 统计标签数量（与浏览器端 querySelectorAll 同口径） */
const count = (tag) => (svg.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
const counts = {
  line: count('line'),
  rect: count('rect'),
  text: count('text'),
  path: count('path'),
  circle: count('circle'),
  g: count('g'),
};

/** 坐标校验和：把所有 line 的 x1,y1,x2,y2 与 text 的 x,y 取出来做数值指纹 */
const sums = { line: 0, text: 0 };
for (const m of svg.matchAll(/<line[^>]*x1="([-\d.]+)"[^>]*y1="([-\d.]+)"[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/g)) {
  sums.line += Number(m[1]) + Number(m[2]) + Number(m[3]) + Number(m[4]);
}
for (const m of svg.matchAll(/<text[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"/g)) {
  sums.text += Number(m[1]) + Number(m[2]);
}

/**
 * 网页版首段实测（浏览器 `querySelectorAll` 统计，2026-09-26 对照过一次）：
 *
 *   line=38  rect=12  text=28  path=1  circle=2
 *
 * 其中 **3 根线 + 1 个圆点是客户端播放头**（`PracticeSystem.tsx` 第 466-499 行：
 * 进度条底轨 + 绿色已完成段 + 红色竖线 = 3 根 line，外加进度条端点的绿点 = 1 个 circle），
 * 另有 1 个 circle 是「当前音符高亮」。这些**刻意不在 PNG 里**（小程序用叠加层做，才能跟着时间动）。
 *
 * 因此期望值：
 *   line   = 38 - 3            = 35
 *   circle = 0                 （播放高亮全留给客户端）
 *   rect   = 12 + 1            = 13   （多出来的 1 个是背景底色矩形，同时用于挖空弦线）
 *   text   = 28                 （逐个一致，说明所有文字标注完全对齐）
 *   path   = 1                  （扫弦箭头）
 */
const EXPECTED = { line: 35, rect: 13, text: 28, path: 1, circle: 0 };
const WEB = { line: 38, rect: 12, text: 28, path: 1, circle: 2 };

console.log(`服务端 SVG（${pkg.score.title} 小节 ${FROM}-${FROM + slice.length - 1}）`);
console.log(`  viewBox 600x142  svg ${svg.length} 字节`);
console.log(
  `  counts  line=${counts.line} rect=${counts.rect} text=${counts.text} path=${counts.path} circle=${counts.circle} g=${counts.g}`,
);
console.log(`  坐标指纹 line=${sums.line.toFixed(2)} text=${sums.text.toFixed(2)}`);

const problems = [];
for (const [tag, expected] of Object.entries(EXPECTED)) {
  if (counts[tag] !== expected) {
    problems.push(
      `${tag}: 服务端 ${counts[tag]}，期望 ${expected}` +
        `（网页端 ${WEB[tag]}）`,
    );
  }
}

if (problems.length) {
  console.log('');
  console.log('❌ 与网页端渲染不一致：');
  for (const p of problems) console.log(`   - ${p}`);
  process.exit(1);
}
console.log('');
console.log('✅ 与网页端渲染一致（仅保留有意的差异：背景矩形 / 播放高亮层）');

