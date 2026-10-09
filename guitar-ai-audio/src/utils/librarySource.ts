/**
 * 曲库来源（供 UI 直接取用）
 * ==========================
 *
 * 曲库条目原先硬编码在 `data/libraryData.ts` 的 `INITIAL_LIBRARY_ITEMS` 常量里。
 * 现在数据在后端（`GET /api/library`，见 `guitarmate-audio-backend/src/library/`），
 * 这个模块只做一件事：把「取当前曲库列表」包成一个函数。
 *
 * ⚠️ 为什么单独建一个文件而不是让各组件自己 import `backendService`：
 * `backendService` 自己 import 了 `libraryData`（为了拿迁移种子），
 * 若 `libraryData` 反过来 import `backendService` 就成了**循环依赖** ——
 * 打包时能过，运行时在某些次序下会拿到 `undefined`，是那种「本机好好的、
 * 换个入口就白屏」的问题。多一个中间模块，依赖方向就永远是单向的。
 *
 * ⚠️ 需要在**渲染期**调用（每次都要拿到最新缓存），不要提到模块顶层存成常量
 * —— 那样会在 hydrate 之前就固定成兜底数据，永远不更新。
 */
import { backendService } from './backendService';
import type { TranscriptionItem } from '../data/libraryData';
import type { ScoreData } from '../types/music';

/** 当前曲库列表：已从后端载入则以库为准，否则回退源码种子（首屏不空白） */
export const getLibraryItems = (): TranscriptionItem[] => backendService.getLibraryItems();

/**
 * 「招牌演示曲」的曲库条目 id。
 *
 * 首页那个「试练 Macaroon 5 乐谱」按钮、以及首屏工作台的默认谱都指这一首。
 * 迁移前它们直接引用源码常量 `MACAROON_5_SCORE`；现在改成按 id 去**后端曲库**里取
 * —— 内容是完全一样的（迁移时做过 JSON 深度相等校验），但来源统一了：
 * 以后运营把这首换掉/改谱，前端不用改代码、也不用重新发版。
 */
export const FEATURED_DEMO_SCORE_ID = 'macaroon-5';

/** 按曲库条目 id 取乐谱本体（拿不到返回 undefined） */
export function getScoreById(id: string): ScoreData | undefined {
  return getLibraryItems().find((item) => item.id === id)?.score;
}

/**
 * 招牌演示曲的乐谱。
 *
 * ⚠️ 找不到时返回 `undefined` —— **刻意不回退到源码里的假谱**。
 * 「拿不到数据时给一份看上去很正常的演示谱」是这类项目最危险的降级方式：
 * 界面一切正常，但用户练的、老师批的、导出的是另一首曲子。
 * 这里宁可返回空，让上层显式处理（`pickDefaultScore()` 会退到「空谱」）。
 */
export function getFeaturedScore(): ScoreData | undefined {
  return getScoreById(FEATURED_DEMO_SCORE_ID) ?? getLibraryItems()[0]?.score;
}

/**
 * **空谱占位**：只在「后端连上了、但曲库真的是空的」这一种情况下用。
 *
 * 注意它和「假谱」的区别：这里没有任何音符、没有标题伪装成某首曲子，
 * 谱面上是空的（`measures: []`），并且标题直说"暂无乐谱"。
 * 这样既不会崩（`ScoreViewer` 依赖 `score.measures` / `tuning` 等字段存在），
 * 也不会让人误以为库里有东西。
 */
export const EMPTY_SCORE: ScoreData = {
  id: 'empty-score',
  title: '暂无乐谱',
  subtitle: '曲库为空 —— 请先在「我的曲谱库」录入或上传音频生成转谱',
  tempo: 100,
  timeSignature: '4/4',
  keySignature: 'C',
  flatsCount: 0,
  sharpsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 0,
  transcribedBy: '—',
  measures: [],
  totalDurationSeconds: 0,
};

/**
 * 首屏工作台的默认乐谱：招牌演示曲 → 曲库第一条 → 空谱。
 * **永不返回假数据**，也永不返回 `undefined`（工作台需要一份 `ScoreData`）。
 */
export function pickDefaultScore(): ScoreData {
  return getFeaturedScore() ?? getLibraryItems()[0]?.score ?? EMPTY_SCORE;
}
