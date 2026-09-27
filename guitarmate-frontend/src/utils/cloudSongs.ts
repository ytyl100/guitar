/**
 * 云端曲库同步（后端已发布内容 → 小程序 Songs 曲库）
 * ==================================================
 *
 * ## 唯一数据源原则
 * 曲库列表 **完全由后端决定**，不再混入前端硬编码的演示曲目。
 *
 * 早期实现是「把云端曲目并入本地 `INITIAL_SONGS` 示例曲库」，结果小程序里
 * 出现了 CMS 里根本找不到的曲目（Hotel California / Perfect / Yellow /
 * Wonderwall / Knockin' On Heaven's Door / I'm Yours / Ella），
 * 用户看到的就是「前后端曲库不同步」；而且**后端删掉的曲目在前端依然存在**。
 *
 * 现在：`GET /api/published/library`（= CMS 已发布的全部内容，两条发布链路合并）
 * 就是列表本身 —— 后端删掉 / 改为 draft → 下次刷新即消失。
 *
 * ⚠️ 列表接口不含小节时长，所以时长按「小节数 × 小节时长」估算 ——
 * 与后端切片同一口径（拍数 × (60/bpm) × (4/拍号分母)），不要用 `60/bpm` 硬算。
 * 真实时长由 `MeasurePracticePanel` 拉到小节后回传（见 `onTotalDuration`）。
 */
import type { PublishedLibraryItem } from '../services/api';
import type { SongItem } from '../types';

/** 后端列表无封面时的兜底图（与示例曲目同一风格，保证卡片样式统一） */
export const CLOUD_COVER_FALLBACK =
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&auto=format&fit=crop&q=80';

/** 小节时长 = 拍数 × (60/bpm) × (4/拍号分母) —— 与后端切片同一口径 */
export function measureDurationSecOf(
  bpm?: number | null,
  timeSignature?: string | null,
): number {
  const safeBpm = Number(bpm) > 0 ? Number(bpm) : 80;
  const [beatsRaw, denomRaw] = String(timeSignature || '4/4').split('/');
  const beats = Number(beatsRaw) > 0 ? Number(beatsRaw) : 4;
  const denom = Number(denomRaw) > 0 ? Number(denomRaw) : 4;
  return beats * (60 / safeBpm) * (4 / denom);
}

/** 列表接口下发的小节数（新接口 `measureCount` / 旧接口 `_count.measures`） */
export function measureCountOf(item: PublishedLibraryItem): number {
  const n = Number(item.measureCount ?? item._count?.measures ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 按「小节数 × 小节时长」估算整曲时长（秒）；无小节数据时返回兜底值 */
export function estimateDurationSec(item: PublishedLibraryItem): number {
  const measureCount = measureCountOf(item);
  if (!measureCount) return 180;
  const seconds = measureCount * measureDurationSecOf(item.bpm, item.timeSignature);
  return seconds > 0 ? Math.round(seconds) : 180;
}

/** 后端已发布曲目 → 小程序曲库条目 */
export function publishedScoreToSongItem(item: PublishedLibraryItem): SongItem {
  const artist = (item.artist || '').trim();
  return {
    // 前缀避免与本地示例曲目 id 冲突（本地是 'hotel-california' 这类 slug）
    id: `cloud-${item.id}`,
    scoreId: item.id,
    isCloud: true,
    cloudSource: item.source,
    title: item.title || '未命名曲目',
    artist: artist || '未标注',
    coverUrl: item.coverUrl || CLOUD_COVER_FALLBACK,
    // 云端曲目暂无学员评分（评分体系尚未接入）→ 用中性值，不假装有数据
    rating: 5,
    ratingCount: '云端',
    tags: ['TAB', '云端'],
    isFavorite: false,
    // 列表接口未下发 capo（契约里在 PracticePackage.score.capo）→ 不编造
    capo: 'Capo: —',
    // 和弦列表来自小节标注，详情页加载 PracticePackage 后才有；列表阶段留空
    chords: [],
    bpm: Number(item.bpm) > 0 ? Number(item.bpm) : 80,
    durationSec: estimateDurationSec(item),
    difficulty: 'Beginner',
    lyrics: [],
  };
}

/**
 * 后端已发布内容 → 小程序曲库列表（**唯一数据源**）。
 *
 * @param published `GET /api/published/library` 的返回
 * @param favoriteIds 客户端收藏集合（纯前端状态，刷新曲库时保留）
 */
export function toLibrarySongs(
  published: PublishedLibraryItem[],
  favoriteIds?: ReadonlySet<string>,
): SongItem[] {
  return published
    .map(publishedScoreToSongItem)
    .map((song) =>
      favoriteIds?.has(song.id) ? { ...song, isFavorite: true } : song,
    );
}
