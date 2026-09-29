/**
 * 六线谱 → SVG 字符串（服务端渲染用）
 * ==================================
 *
 * 为什么需要它：微信小程序**不支持 WXML 里的 `<svg>` 标签**，所以谱面改成
 * 「服务端渲染成 PNG → 小程序用 `<Image>` 显示 → 高亮层用数据里的 x/y 绝对定位」。
 *
 * ⚠️ 本文件是 `guitarmate-frontend/src/components/PracticeSystem.tsx` 的**逐元素镜像**：
 * 元素顺序、颜色、字号、锚点必须与它一致，否则「后台看到的谱 ≠ 学员练的谱」。
 * 改样式时**两处都要改**（前端那份是 React JSX，这份是字符串拼接，逻辑无法共享）。
 *
 * 与前端渲染的**唯一差异**（有意为之）：
 * - 不画播放头 / 当前音符高亮 / 下一音符描边 —— 这些要跟着时间动，放在小程序客户端做叠加层；
 * - 不输出 `<title>`（PNG 里没有 hover 提示）。
 *
 * 排版数学**不在这里** —— 全部复用 `tab-layout.ts`（与前端逐字节相同的引擎副本）。
 */
import {
  MINI_TAB_METRICS,
  buildStandardTabSystemLayout,
  type StandardTabSystemLayout,
  type StandardTabSystemMeasureInput,
} from './tab-layout';

/** 前端 `PracticeSystem` 的画布尺寸（保持完全一致） */
export const TAB_SVG_WIDTH = 600;
export const TAB_SVG_HEIGHT = 142;

export interface TabBarre {
  id: string;
  /** 1-6，1 = 最细高音弦 */
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
}

export interface TabRenderMeasure extends StandardTabSystemMeasureInput {
  /** 横按高亮（可选） */
  barres?: TabBarre[];
}

export interface TabSvgOptions {
  measures: TabRenderMeasure[];
  bpm: number;
  timeSignature?: string;
  tuning?: number[];
  width?: number;
  height?: number;
  showClef?: boolean;
  showTempo?: boolean;
  isLastSystem?: boolean;
  dark?: boolean;
}

/**
 * 配色取自前端（`PracticeSystem.tsx` 第 176-180 行）。
 *
 * ⚠️ `surface` 不只是背景色：它还用来**挖空弦线**（品位数字压在弦线上，弦线必须断开）。
 * 所以 PNG 必须输出**不透明背景**，且小程序里承载它的卡片底色要和它一致，否则数字上会横着一条线。
 */
function theme(dark: boolean) {
  return {
    line: dark ? '#475569' : '#94a3b8',
    dim: dark ? '#94a3b8' : '#64748b',
    text: dark ? '#e2e8f0' : '#0f172a',
    surface: dark ? '#0b1220' : '#ffffff',
    accent: '#f59e0b',
    beatTick: dark ? '#334155' : '#cbd5e1',
    chord: dark ? '#fbbf24' : '#b45309',
  };
}

/** XML 属性/文本转义（谱面里会出现 `○`、`x`、和弦名等） */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 数字格式化：避免出现 `1.0000000000000002` 之类把 PNG 体积撑大 / 触发解析问题 */
function n(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(digits)).toString();
}

export function renderTabSystemSvg(options: TabSvgOptions): {
  svg: string;
  layout: StandardTabSystemLayout;
} {
  const width = options.width ?? TAB_SVG_WIDTH;
  const height = options.height ?? TAB_SVG_HEIGHT;
  const c = theme(options.dark !== false);

  /** 排版：与前端 `PracticeSystem` 用同一套参数 */
  const layout = buildStandardTabSystemLayout({
    measures: options.measures,
    bpm: options.bpm,
    timeSignature: options.timeSignature,
    tuning: options.tuning,
    width,
    height,
    showClef: options.showClef,
    showTempo: options.showTempo,
    isLastSystem: options.isLastSystem,
    noteLabel: 'fret',
    showFinger: false,
    metrics: MINI_TAB_METRICS,
  });

  /** 每小节自己的横按（前端从原始 measures 里取，不在排版结果里） */
  const barres = options.measures.flatMap((measure, slot) =>
    (measure.barres || []).map((b) => ({ slot, barre: b })),
  );

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
      `viewBox="0 0 ${n(width)} ${n(height)}">`,
  );
  // 不透明底色：既是背景，也是「挖空弦线」的填充色（见 theme() 的说明）
  parts.push(`<rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="${c.surface}"/>`);

  // ① 弦线
  for (const line of layout.lines) {
    parts.push(
      `<line x1="${n(line.x1)}" y1="${n(line.y1)}" x2="${n(line.x2)}" y2="${n(line.y2)}" ` +
        `stroke="${c.line}" stroke-width="${n(line.width)}"/>`,
    );
  }

  // ② 谱号 / 拍号 / 速度 / 小节号 / 把位 / 和弦名
  for (const t of layout.texts) {
    const common = `x="${n(t.x)}" y="${n(t.y)}" font-size="${n(t.size)}"`;
    switch (t.role) {
      case 'clef':
        parts.push(`<text ${common} font-family="Georgia, serif" font-weight="700" fill="${c.text}">${esc(t.text)}</text>`);
        break;
      case 'timeTop':
      case 'timeBottom':
        parts.push(
          `<text ${common} font-family="Georgia, serif" font-weight="700" fill="${c.text}" ` +
            `text-anchor="middle">${esc(t.text)}</text>`,
        );
        break;
      case 'tempo':
      case 'measureNumber':
      case 'positionLabel':
        parts.push(
          `<text ${common} font-family="monospace" fill="${t.role === 'positionLabel' ? c.accent : c.dim}" ` +
            `opacity="${t.role === 'measureNumber' ? '0.75' : '1'}">${esc(t.text)}</text>`,
        );
        break;
      case 'position':
      case 'positionShift':
        parts.push(
          `<text ${common} font-family="Georgia, serif" font-weight="${t.role === 'position' ? '700' : '400'}" ` +
            `fill="${c.accent}" opacity="${t.role === 'positionShift' ? '0.85' : '1'}">${esc(t.text)}</text>`,
        );
        break;
      default:
        parts.push(`<text ${common} font-family="Georgia, serif" font-weight="700" fill="${c.chord}">${esc(t.text)}</text>`);
        break;
    }
  }

  // ③ 挖空弦线（让品位数字落在「断开」的弦线上）
  const gapH = MINI_TAB_METRICS.fontSize + 3;
  for (const gap of layout.lineGaps) {
    parts.push(
      `<rect x="${n(gap.x1)}" y="${n(gap.y - gapH / 2)}" width="${n(Math.max(0, gap.x2 - gap.x1))}" ` +
        `height="${n(gapH)}" fill="${c.surface}" opacity="0.92"/>`,
    );
  }

  // ④ 拍点刻度
  for (const tick of layout.beatTicks) {
    parts.push(
      `<line x1="${n(tick.x)}" y1="${n(tick.y1)}" x2="${n(tick.x)}" y2="${n(tick.y2)}" ` +
        `stroke="${c.beatTick}" stroke-width="1"/>`,
    );
  }

  // ⑤ 节奏线：符干 + 符尾 + 连接符
  for (const stem of layout.stems) {
    parts.push(
      `<line x1="${n(stem.x)}" y1="${n(stem.y1)}" x2="${n(stem.x)}" y2="${n(stem.y2)}" ` +
        `stroke="${c.line}" stroke-width="1.1" stroke-linecap="round"/>`,
    );
    if (stem.levels >= 1 && !stem.beamId) {
      parts.push(
        `<line x1="${n(stem.x)}" y1="${n(stem.y2)}" x2="${n(stem.x + 3.5)}" y2="${n(stem.y2 + 5)}" ` +
          `stroke="${c.line}" stroke-width="1.1" stroke-linecap="round"/>`,
      );
    }
  }
  for (const beam of layout.beams) {
    parts.push(
      `<line x1="${n(beam.x1)}" y1="${n(beam.y)}" x2="${n(beam.x2)}" y2="${n(beam.y)}" ` +
        `stroke="${c.line}" stroke-width="2" stroke-linecap="round"/>`,
    );
  }

  // ⑥ 扫弦箭头
  for (const strum of layout.strums) {
    const midY = (strum.yTop + strum.yBottom) / 2;
    const headY = strum.direction === 'down' ? strum.yBottom : strum.yTop;
    const tailY = strum.direction === 'down' ? strum.yTop : strum.yBottom;
    const sign = Math.sign(headY - tailY || 1);
    parts.push(
      `<g stroke="${c.accent}" stroke-width="1.3" fill="none" stroke-linecap="round">` +
        `<line x1="${n(strum.x)}" y1="${n(tailY)}" x2="${n(strum.x)}" y2="${n(headY - 4 * sign)}"/>` +
        `<path d="M ${n(strum.x - 3)} ${n(headY - 4 * sign)} L ${n(strum.x)} ${n(headY)} L ${n(strum.x + 3)} ${n(headY - 4 * sign)}"/>` +
        `<line x1="${n(strum.x - 2.5)}" y1="${n(midY - 3)}" x2="${n(strum.x + 2.5)}" y2="${n(midY - 3)}" opacity="0.6"/>` +
        `</g>`,
    );
  }

  // ⑦ 横按高亮（用本小节自己的 timeToX，与谱面像素级一致）
  for (const { slot, barre } of barres) {
    const rect = layout.measures[slot];
    if (!rect) continue;
    const x1 = rect.timeToX(barre.startTime);
    const x2 = rect.timeToX(barre.startTime + barre.duration);
    const yTop = layout.stringYs[Math.min(layout.stringCount, barre.toString) - 1] - 3;
    const yBottom = layout.stringYs[Math.min(layout.stringCount, barre.fromString) - 1] + 3;
    parts.push(
      `<rect x="${n(x1)}" y="${n(yTop)}" width="${n(Math.max(4, x2 - x1))}" height="${n(Math.max(6, yBottom - yTop))}" ` +
        `rx="3" fill="#10b981" opacity="0.18" stroke="#10b981" stroke-width="1"/>`,
    );
  }

  // ⑧ 品位数字 + 手指上标 + 技巧标记
  for (const laid of layout.notes) {
    parts.push(
      `<text x="${n(laid.x)}" y="${n(laid.y + MINI_TAB_METRICS.fontSize * 0.36)}" ` +
        `font-size="${n(MINI_TAB_METRICS.fontSize)}" font-weight="600" text-anchor="middle" ` +
        `font-family="monospace" fill="${c.text}">${esc(laid.text)}</text>`,
    );
    if (laid.fingerText) {
      parts.push(
        `<text x="${n(laid.fingerX ?? 0)}" y="${n(laid.fingerY ?? 0)}" ` +
          `font-size="${n(MINI_TAB_METRICS.fingerFontSize)}" font-weight="700" text-anchor="middle" ` +
          `font-family="monospace" fill="${laid.fingerText === '○' ? c.dim : c.accent}">${esc(laid.fingerText)}</text>`,
      );
    }
    if (laid.techniqueText) {
      parts.push(
        `<text x="${n(laid.techniqueX ?? 0)}" y="${n(laid.techniqueY ?? 0)}" ` +
          `font-size="${n(MINI_TAB_METRICS.fingerFontSize)}" font-family="monospace" ` +
          `fill="${c.dim}">${esc(laid.techniqueText)}</text>`,
      );
    }
  }

  // ⑨ 小节线（末段最后一小节是一细一粗收尾）
  for (const bar of layout.barlines) {
    parts.push(
      `<line x1="${n(bar.x1)}" y1="${n(bar.y1)}" x2="${n(bar.x2)}" y2="${n(bar.y2)}" ` +
        `stroke="${c.line}" stroke-width="${n(bar.width)}"/>`,
    );
  }

  parts.push('</svg>');
  return { svg: parts.join(''), layout };
}
