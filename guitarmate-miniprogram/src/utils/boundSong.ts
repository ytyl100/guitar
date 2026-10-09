import { fetchScoreLibraryItem, getPublishedLibrary, type LibraryItem } from '../services/api';

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

/**
 * 课程内容项 → 已发布曲目（**课程页/视频页专用**）
 * ==============================================
 *
 * 课程的乐谱项有两个"名字"，别搞混：
 *
 * ```
 * item.title     教研自拟的练习名，如「基础扫弦练习曲 · 72 BPM」   ← 曲库里没有这个名字
 * item.scoreId   教师绑定的**曲库条目** id，如 'laid-back-guitars'  ← 这才是真关联
 * ```
 *
 * 所以**不能拿 `item.title` 去曲库找**（实测 10 条里 9 条必然找不到）。
 * 正确的两步链路：
 *
 * 1. `item.scoreId` → `/api/library` 条目 → 它自己的 `scoreId` 就是**已发布乐谱 id**；
 * 2. 该条目 `scoreId` 为空时（如 `macaroon-5` / `isolated`），退一步按**条目标题**去已发布曲库匹配；
 * 3. 都拿不到才返回 null，由调用方给出可操作提示。
 *
 * ⚠️ 这只是**当前两套谱面管线并存期**的桥接：
 * 练习页现在只能读 `/api/published/*`（服务端渲染的 `tab.png`），
 * 而 `item.scoreId` 属于 `/api/library`。等练习页改成直接渲染曲库条目的 `score` JSON 后，
 * 这里整段可以删掉 —— 直接 `id = item.scoreId` 即可。
 */
export async function findPublishedSongForCourseItem(item: {
  scoreId?: string;
  scoreTitle?: string;
  title?: string;
}): Promise<MatchedSong | null> {
  const libId = (item.scoreId || '').trim();
  if (libId) {
    /** 曲库条目拿不到（404 / 后端旧版）时不要整段失败，继续走标题兜底 */
    const lib = await fetchScoreLibraryItem(libId).catch(() => null);
    if (lib) {
      const published = await getPublishedLibrary();
      /** ① 条目自带 `scoreId`（指向已发布乐谱）—— 最准的一条 */
      if (lib.scoreId) {
        const byId = published.find((it) => it.id === lib.scoreId);
        if (byId) return { id: byId.id, title: byId.title, artist: byId.artist || '未标注' };
      }
      /** ② 条目 `scoreId` 为空 → 按条目标题匹配已发布曲库 */
      const byTitle = await findPublishedSongByName(lib.title);
      if (byTitle) return byTitle;
    }
  }
  /** ③ 最后兜底：按内容项自己的曲名（教研自拟名，多半匹配不上，但聊胜于无） */
  return findPublishedSongByName(item.scoreTitle || item.title || '');
}
