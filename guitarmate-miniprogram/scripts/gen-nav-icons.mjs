/**
 * 生成底部导航图标的 data URI（写进 app.scss 的标记之间）
 * ===================================================
 *
 * 为什么要生成而不是手写：
 * - 图标路径**逐字取自 `lucide-react@0.546.0`**（与 `guitarmate-frontend` 的底部导航同一套，
 *   `<Music2 size={20} />` 那种）。手抄路径极易抄错，而抄错了很难看出来。
 * - 小程序 WXSS **不能写本地图片路径**，所以只能把图标内联成 data URI；
 *   而 data URI 里的图 **拿不到外部颜色**（不能写 `currentColor`），
 *   于是「未激活 / 激活」两张图必须各生成一份 —— 5 个图标 × 2 态 = 10 条规则。
 *
 * ⚠️ **默认输出 PNG（base64），不是 SVG**：
 *    SVG data URI 在 WXSS 里的支持度在不同基础库/工具版本上并存疑，
 *    而 `<image>`/`background-image` 用 base64 PNG 是小程序里**人人都在用**的写法。
 *    所以用 `@resvg/resvg-js`（后端已有依赖，按路径复用，不给小程序加依赖）
 *    把同一份 SVG 栅格化成 80×80 PNG（显示 20px → 4x 图，高分屏不糊）。
 *    找不到 resvg 时**自动退回 SVG data URI**并打印警告（不至于跑不了）。
 *
 * 用法：
 *   node scripts/gen-nav-icons.mjs            # 写入 app.scss（幂等，重复跑结果一致）
 *   node scripts/gen-nav-icons.mjs --print    # 只打印，不改文件
 *
 * 改图标时：① 更新下面 ICONS 的 path 数据（从 node_modules/lucide-react/dist/esm/icons/<name>.js 抄）
 *          ② 跑一遍本脚本。
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SCSS = join(HERE, '..', 'src', 'app.scss');

/** PNG 栅格化尺寸：显示 20px → 4x（高分屏不糊） */
const RASTER_WIDTH = 80;

/** 找一个可用的 resvg：先看小程序自己，再看隔壁后端（仓库里它已有这个依赖） */
function loadResvg() {
  const candidates = [
    '@resvg/resvg-js',
    join(HERE, '..', '..', 'guitarmate-audio-backend', 'node_modules', '@resvg', 'resvg-js'),
  ];
  for (const c of candidates) {
    try {
      return require(c).Resvg;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}


/** 与 guitarmate-frontend 底部导航一一对应：nav key → lucide 图标名 + 形状数据 */
const ICONS = {
  /** lucide `music-2`（Web: <Music2 />） */
  songs: [
    ['circle', { cx: '8', cy: '18', r: '4' }],
    ['path', { d: 'M12 18V2l7 4' }],
  ],
  /** lucide `graduation-cap`（Web: <GraduationCap />） */
  learn: [
    [
      'path',
      {
        d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
      },
    ],
    ['path', { d: 'M22 10v6' }],
    ['path', { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }],
  ],
  /** lucide `radio`（Web: <Radio />） */
  tune: [
    ['path', { d: 'M16.247 7.761a6 6 0 0 1 0 8.478' }],
    ['path', { d: 'M19.075 4.933a10 10 0 0 1 0 14.134' }],
    ['path', { d: 'M4.925 19.067a10 10 0 0 1 0-14.134' }],
    ['path', { d: 'M7.753 16.239a6 6 0 0 1 0-8.478' }],
    ['circle', { cx: '12', cy: '12', r: '2' }],
  ],
  /** lucide `book-open`（Web: <BookOpen />） */
  tools: [
    ['path', { d: 'M12 7v14' }],
    [
      'path',
      {
        d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
      },
    ],
  ],
  /** lucide `user`（Web: <User />） */
  profile: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
  ],
};

/** 与 Web 端相同的两个态：未激活描边 2，激活描边 2.5（Web 的 `stroke-[2.5]`） */
const STATES = [
  { name: 'off', color: '#71717a', width: '2' }, // zinc-500
  { name: 'on', color: '#10b981', width: '2.5' }, // emerald-500
];

/** 24×24 viewBox、fill=none、round 端点 —— lucide 的默认渲染参数 */
function svgOf(shapes, { color, width }) {
  const body = shapes
    .map(([tag, attrs]) =>
      `<${tag}${Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('')}/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/** SVG → 可直接写进 WXSS 的 data URI：优先 PNG（兼容性最好），退而求其次才用 SVG */
const Resvg = loadResvg();
function dataUriOf(svg) {
  if (Resvg) {
    try {
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: RASTER_WIDTH } }).render().asPng();
      return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    } catch (err) {
      console.warn(`⚠️ resvg 栅格化失败，退回 SVG data URI：${err.message}`);
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const lines = [];
lines.push(
  `/* 由 scripts/gen-nav-icons.mjs 生成（${Resvg ? `PNG ${RASTER_WIDTH}×${RASTER_WIDTH} base64` : 'SVG base64'}）—— 形状取自 lucide-react@0.546.0 */`,
);
for (const [key, shapes] of Object.entries(ICONS)) {
  const off = STATES.find((s) => s.name === 'off');
  const on = STATES.find((s) => s.name === 'on');
  lines.push(`.gm-nav-icon--${key} {`);
  lines.push(`  background-image: url("${dataUriOf(svgOf(shapes, off))}");`);
  lines.push('}');
  lines.push(`/** 激活：换一张 emerald-500 + stroke 2.5 的同形状图 */`);
  lines.push(`.gm-nav-item--on .gm-nav-icon--${key} {`);
  lines.push(`  background-image: url("${dataUriOf(svgOf(shapes, on))}");`);
  lines.push('}');
}
const block = lines.join('\n');

const START = '/* >>> NAV-ICONS:START';
const END = '/* <<< NAV-ICONS:END <<< */';

if (process.argv.includes('--print')) {
  console.log(block);
  process.exit(0);
}

const scss = readFileSync(APP_SCSS, 'utf8');
const startIdx = scss.indexOf(START);
const endIdx = scss.indexOf(END);
if (startIdx < 0 || endIdx < 0) {
  console.error('❌ app.scss 里找不到 NAV-ICONS 标记，先把标记加上再跑。');
  process.exit(1);
}
/** 保留 START 那一整行（含注释尾部），只替换它与 END 之间的内容 */
const startLineEnd = scss.indexOf('\n', startIdx);
const next =
  scss.slice(0, startLineEnd + 1) + block + '\n' + scss.slice(endIdx);
writeFileSync(APP_SCSS, next, 'utf8');
console.log(
  `✅ 已写入 ${Object.keys(ICONS).length} 个图标 × ${STATES.length} 个状态 → src/app.scss（${block.length} 字节）`,
);
