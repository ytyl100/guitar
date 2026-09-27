import { getPublishedLibrary, type LibraryItem } from '../services/api';

/**
 * 「按歌名在已发布曲库里找曲目」
 * ================================
 *
 * ## 为什么按歌名而不是 `songBinding.songId`
 *
 * ⚠️ CMS 的 `songBinding` 原本有两个字段：`songId` 与 `songName`。但那个 `songId` 指的是
 * **CMS 本地音乐库（localStorage）**里的条目，跟后端 `Score/Project` 的 id **不是一套** ——
 * 拿它往后端查必然查不到。所以唯一能用的关联键是**歌名**。
 *
 * ## 匹配规则（宽容但可预测）
 *
 * 1. 先归一化：去掉《》。·|｜- 与所有空白，转小写（`《Hotel California》` ↔ `hotelcalifornia`）；
 * 2. 先精确相等，再退一步用「互相包含」；
 * 3. 都找不到 → 返回 null，由调用方给出**可操作**的提示（例如"请先在 CMS 发布这首曲目"），
 *    不要静默失败。
 *
 * 抽成共享函数是因为**课时弹窗与课时视频页都要用**（懒/跟弹入口在多处），
 * 两份实现迟早就漂移（之前已经在两个地方各写过一遍）。
 */
export interface MatchedSong {
  id: string;
  title: string;
  artist: string;
}

const normalize = (s: string) => (s || '').replace(/[《》。·\s|｜\-]/g, '').toLowerCase();

/** 在已发布曲库里按歌名找曲目（找不到返回 null；网络错误照实抛出） */
export async function findPublishedSongByName(name: string): Promise<MatchedSong | null> {
  const wanted = normalize(name);
  if (!wanted) return null;

  const items: LibraryItem[] = await getPublishedLibrary();
  const hit =
    items.find((it) => normalize(it.title) === wanted) ||
    items.find((it) => {
      const t = normalize(it.title);
      return t.includes(wanted) || wanted.includes(t);
    });

  return hit ? { id: hit.id, title: hit.title, artist: hit.artist || '未标注' } : null;
}

/** 拼「曲目详情页」的 URL（列表页与多个入口共用同一套 query） */
export function songPageUrl(song: MatchedSong): string {
  return (
    `/pages/song/index?id=${encodeURIComponent(song.id)}` +
    `&title=${encodeURIComponent(song.title)}` +
    `&artist=${encodeURIComponent(song.artist)}`
  );
}

/** 拼「AI 跟弹评测页」的 URL（默认从第 1 段开始） */
export function songEvalUrl(song: MatchedSong, slot = 0): string {
  return (
    `/pages/ai-eval/index?id=${encodeURIComponent(song.id)}` +
    `&title=${encodeURIComponent(song.title)}&slot=${slot}`
  );
}
