import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Resvg } from '@resvg/resvg-js';
import { PublishedLibraryService } from './published-library.service';
import type { MeasureTrackData, PracticeMeasure, PracticePackage } from './practice-package.types';
import {
  TAB_SVG_HEIGHT,
  TAB_SVG_WIDTH,
  renderTabSystemSvg,
  type TabRenderMeasure,
} from './tab-render/tab-svg';

export interface TabRenderQuery {
  /** 乐器；缺省取第一条音轨（通常是 guitar） */
  instrument?: string;
  /** 起始小节号（1 起） */
  from: number;
  /** 画几个小节（1-3，与前端「每段小节数」一致） */
  count: number;
  dark: boolean;
  width: number;
  height: number;
}

/**
 * 六线谱 PNG 渲染服务（服务端）
 * ============================
 *
 * **为什么在服务端渲染**：微信小程序不支持 WXML 里的 `<svg>` 标签。可选方案有
 * ① 客户端 canvas 重画、② SVG 转 base64 塞 `<Image>`、③ 服务端出 PNG。
 * 选 ③ 的原因：客户端最省事、性能最好（PNG 可缓存），且与 `guitarMate.md` 6.4
 * 的规划一致；代价是客户端只能做「图片 + 绝对定位高亮层」，不能点谱面跳转
 * （跳转仍然可用 —— 用每小节的 `contentLeft/contentRight` 换算即可，见返回的 meta）。
 *
 * ⚠️ 与 `publish.service.ts` **完全无关**：本服务只**读**已发布的 PracticePackage，
 * 不改动契约、不写库。所以它对现有 C 端（小程序模拟器 / CMS）是零风险的新增能力。
 *
 * 端点：`GET /api/published/items/:id/tab.png?instrument=guitar&from=1&count=2&theme=dark&width=600`
 */
@Injectable()
export class TabRenderService {
  private readonly logger = new Logger(TabRenderService.name);
  /** 进程内缓存：key 已含 publishedAt → 重新发布后自动失效 */
  private readonly cache = new Map<string, Buffer>();
  private readonly maxCacheEntries = 300;

  constructor(private readonly library: PublishedLibraryService) {}

  /**
   * 解析「该画哪条音轨、哪几个小节」。
   *
   * ⚠️ 历史发布数据里**同一 index 的小节可能重复**（发布是 append-only，
   * 实测 Canon in D 有 8 个 index ×2）→ 必须按 index 去重，否则谱行会重复渲染同一小节。
   * 与前端 `practicePackage.ts#dedupeMeasuresByIndex()` 同一口径：保留第一条。
   */
  private pickTrack(
    pkg: PracticePackage,
    instrument?: string,
  ): { trackDataOf: (m: PracticeMeasure) => MeasureTrackData | undefined; label: string; instrument: string } {
    const wanted = (instrument || '').trim().toLowerCase();
    let index = 0;
    if (wanted) {
      const found = pkg.tracks.findIndex(
        (t) =>
          String(t.instrument || '').toLowerCase() === wanted ||
          String(t.id || '').toLowerCase().endsWith(`_${wanted}-1`) ||
          String(t.id || '').toLowerCase().includes(`_${wanted}`),
      );
      if (found >= 0) index = found;
    } else {
      // 没有指定就优先吉他（练习音轨）
      const guitar = pkg.tracks.findIndex((t) => String(t.instrument || '').includes('guitar'));
      if (guitar >= 0) index = guitar;
    }
    const track = pkg.tracks[index];
    if (!track) throw new NotFoundException('该曲目没有可用音轨');
    return {
      trackDataOf: (m: PracticeMeasure) => m.trackData?.[index] ?? m.trackData?.[0],
      label: track.label || track.instrument || 'guitar',
      instrument: String(track.instrument || 'guitar'),
    };
  }

  private dedupe(measures: PracticeMeasure[]): PracticeMeasure[] {
    const seen = new Set<number>();
    const out: PracticeMeasure[] = [];
    for (const m of measures || []) {
      const key = Number(m.index);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out.sort((a, b) => a.index - b.index);
  }

  private toRenderMeasure(
    measure: PracticeMeasure,
    trackData: MeasureTrackData | undefined,
    slot: number,
  ): TabRenderMeasure {
    return {
      index: measure.index,
      label: measure.label,
      duration: measure.duration,
      position: measure.position,
      chord: measure.chords?.[0]?.chordName,
      chords: (measure.chords || []).map((c) => ({ name: c.chordName, offsetSec: Number(c.startTime) || 0 })),
      notes: (trackData?.notes || []).map((note) => ({
        /**
         * ⚠️ id 加 `slot:` 前缀：**不同小节里可能出现相同 note id**
         * （旧 CMS 链路实测有 `n-1d` 这种跨小节重复的 id）→ 不加前缀会让排版层
         * 把它们当同一个音符（React key 重复的同源问题），叠加高亮也会串小节。
         * 与 Web 版 `PracticeSystem` 的 `${slot}:${id}` 同一策略。
         */
        id: `${slot}:${note.id}`,
        string: Number(note.string) || 1,
        fret: Number(note.fret) || 0,
        offsetSec: Number(note.relativeTime) || 0,
        durationSec: Number(note.duration) || 0,
        finger: note.finger,
        position: note.position,
        technique: note.technique,
      })),
      barres: (measure.barres || []).map((b) => ({
        id: String(b.id),
        fromString: Number(b.fromString) || 6,
        toString: Number(b.toString) || 1,
        startTime: Number(b.startTime) || 0,
        duration: Number(b.duration) || 0,
      })),
    };
  }

  /**
   * 构建一个「谱行」：排版 + SVG。
   *
   * ⚠️ **PNG 与「悬浮高亮层坐标」必须来自同一次排版** ——
   * 契约里的 `note.x` 是「音符在小节内的归一化时间」（0-1），而谱面上的 x 是
   * `contentLeft + ratio × contentWidth`（还要加上小节在谱行里的平移、以及谱号占位）。
   * 两者**不相等**，直接用归一化 x 叠加高亮会整体错位（小节越靠右偏得越多）。
   * 所以这里把排版结果一并返回，PNG 用 `svg`、小程序叠加层用 `layout`。
   */
  private async buildSystem(itemId: string, query: TabRenderQuery) {
    const pkg = await this.library.getPackage(itemId);
    const measures = this.dedupe(pkg.measures);
    if (measures.length === 0) throw new NotFoundException('该曲目没有已发布小节');

    const { trackDataOf, label, instrument } = this.pickTrack(pkg, query.instrument);

    const count = Math.max(1, Math.min(3, Math.round(query.count) || 2));
    const from = Math.max(1, Math.round(query.from) || 1);
    const slice = measures.filter((m) => m.index >= from && m.index < from + count);
    if (slice.length === 0) {
      throw new NotFoundException(`小节 ${from} 不存在（该曲目共 ${measures.length} 小节）`);
    }

    const isLastSystem = slice[slice.length - 1].index >= measures[measures.length - 1].index;
    const { svg, layout } = renderTabSystemSvg({
      measures: slice.map((m, slot) => this.toRenderMeasure(m, trackDataOf(m), slot)),
      bpm: Number(pkg.score?.bpm) || 100,
      timeSignature: pkg.score?.timeSignature || slice[0].timeSignature || '4/4',
      tuning: pkg.score?.tuning?.length === 6 ? pkg.score.tuning.map(toMidi) : undefined,
      width: query.width,
      height: query.height,
      showClef: true,
      showTempo: true,
      isLastSystem,
      dark: query.dark,
    });

    return { pkg, measures, slice, svg, layout, from, instrument, label, isLastSystem };
  }

  /** 渲染一个「谱行」（1-3 个小节并排）为 PNG */
  async renderSystemPng(
    itemId: string,
    query: TabRenderQuery,
  ): Promise<{ png: Buffer; measureCount: number; from: number; instrument: string; label: string }> {
    const built = await this.buildSystem(itemId, query);
    const { pkg, slice, svg, from, instrument, label } = built;
    const cacheKey = [
      itemId,
      pkg.publishedAt,
      instrument,
      from,
      slice.length,
      query.dark ? 'dark' : 'light',
      query.width,
      query.height,
    ].join('|');
    const cached = this.cache.get(cacheKey);
    if (cached) return { png: cached, measureCount: slice.length, from, instrument, label };

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: query.width },
      font: {
        /**
         * ⚠️ 谱面里有中文（「把位」）与符号（○ / ♪ / 和弦名）→ 必须加载**系统字体**，
         * 否则 resvg 挑不到字形会**静默画出空白**（不报错，只看 PNG 才能发现）。
         * resvg-js 这个版本没有 `fallbackFamilyNames` 选项；resvg 内部会在已加载的
         * 字体里找能覆盖该字形的字体，因此 `loadSystemFonts: true` 就够 ——
         * 但这条**必须用眼看 PNG 确认**（见渲染自测）。
         */
        loadSystemFonts: true,
        defaultFontFamily: 'Arial',
      },
      logLevel: 'error',
    });
    const png = Buffer.from(resvg.render().asPng());

    if (this.cache.size >= this.maxCacheEntries) {
      // 简单淘汰：清掉最早插入的一批（够用，避免无界增长）
      const drop = Math.floor(this.maxCacheEntries / 3);
      let i = 0;
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        if (++i >= drop) break;
      }
    }
    this.cache.set(cacheKey, png);
    this.logger.log(`谱面 PNG ${itemId} ${instrument} 小节 ${from}-${from + slice.length - 1} ${png.length}B`);
    return { png, measureCount: slice.length, from, instrument, label };
  }

  /**
   * 返回**与 PNG 同一次排版**的坐标，供小程序叠加高亮层。
   *
   * 坐标系 = PNG 的 viewBox（`width × height`，默认 600×142）。
   * 客户端把图片按 <Image> 的实际显示宽度等比缩放后，用同一比例缩放这些坐标即可。
   */
  async renderSystemLayout(itemId: string, query: TabRenderQuery) {
    const built = await this.buildSystem(itemId, query);
    const { pkg, slice, layout, from, instrument, label, isLastSystem } = built;
    const track = this.pickTrack(pkg, query.instrument);

    /** 排版时给音符 id 加了 `slot:` 前缀（避免跨小节的重复 id）→ 这里还原成契约里的 id */
    return {
      schemaVersion: '1.0' as const,
      scoreId: itemId,
      title: pkg.score?.title ?? '',
      instrument,
      label,
      /** 画布坐标系（= PNG 的 viewBox），客户端按显示宽度等比缩放 */
      width: query.width,
      height: query.height,
      staffTop: layout.staffTop,
      staffBottom: layout.staffBottom,
      progressY: layout.progressY,
      stringYs: layout.stringYs,
      noteAreaLeft: layout.metrics.noteAreaLeft,
      noteAreaRight: layout.metrics.noteAreaRight,
      from,
      isLastSystem,
      measures: slice.map((m, slot) => {
        const rect = layout.measures[slot];
        return {
          index: m.index,
          label: m.label,
          duration: Number(m.duration) || 0,
          contentLeft: rect?.contentLeft ?? 0,
          contentRight: rect?.contentRight ?? 0,
          audioUrl: (track.trackDataOf(m)?.audioUrl as string) || null,
          originalAudioUrl: (track.trackDataOf(m)?.originalAudioUrl as string) || null,
        };
      }),
      /** 每个音符在画布坐标系里的位置（用于叠加播放高亮） */
      notes: layout.notes.map((n) => {
        const [slotRaw, ...rest] = String(n.id).split(':');
        const slot = Number(slotRaw);
        const useSlot = Number.isFinite(slot) && rest.length > 0;
        return {
          id: useSlot ? rest.join(':') : String(n.id),
          /** 所属小节序号（1 起）+ 段内下标：客户端靠它过滤出「当前小节」的音符 */
          measureIndex: slice[useSlot ? slot : 0]?.index ?? 0,
          slot: useSlot ? slot : 0,
          x: n.x,
          y: n.y,
          w: n.maskWidth,
          h: n.maskHeight,
          string: n.string,
          fret: n.fret,
        };
      }),
      /** 横按高亮块（同样在画布坐标系里） */
      barres: slice.flatMap((m, slot) => {
        const rect = layout.measures[slot];
        if (!rect) return [];
        return (m.barres || []).map((b) => {
          const x1 = rect.timeToX(Number(b.startTime) || 0);
          const x2 = rect.timeToX((Number(b.startTime) || 0) + (Number(b.duration) || 0));
          const yTop = layout.stringYs[Math.min(layout.stringCount, Number(b.toString) || 1) - 1] - 3;
          const yBottom = layout.stringYs[Math.min(layout.stringCount, Number(b.fromString) || 6) - 1] + 3;
          return {
            id: String(b.id),
            measureIndex: m.index,
            x: x1,
            y: yTop,
            w: Math.max(4, x2 - x1),
            h: Math.max(6, yBottom - yTop),
          };
        });
      }),
    };
  }
}

/** 音名（E4 / Eb2）→ MIDI 号；解析不出来就跳过（引擎会用默认调弦） */
function toMidi(name: unknown): number {
  const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name || '').trim());
  if (!m) return Number(name) || 0;
  const base = map[m[1].toUpperCase()] ?? 0;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + base + accidental;
}

export { TAB_SVG_WIDTH, TAB_SVG_HEIGHT };
