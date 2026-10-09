import { ScoreData } from '../types/music';
import { ChapterItem, CourseReturnContext } from '../types/curriculum';
import { getLibraryItems } from './librarySource';

export type { CourseReturnContext };

/**
 * 解析课程章节项应当练习的乐谱
 * ============================
 *
 * 规则只有一条：**按 `item.scoreId` 去后端曲库里精确匹配**。
 * 匹配不到就返回 `null` —— 由调用方显式处理（按钮置灰 + 说明）。
 *
 * ## 为什么删掉了原来那一大段「关键词猜谱」
 *
 * 老实现里在第 1 步匹配失败后，会拿章节标题做关键词匹配
 * （"空弦/拨弦" → Canon in D、"扫弦" → Laid Back Guitars、"泛音" → …共 9 个分支），
 * 最后一层还直接返回 Macaroon 5 冒充。
 *
 * 它带来的问题远大于"兜底"的好处：
 * 1. **静默换谱**：课程明明说要练 A，页面给了 B，学员和老师都看不出来；
 * 2. **无法发现数据问题**：章节项漏绑 / 绑到了已删除的曲目，
 *    只会"碰巧"显示成某首演示曲，运营永远发现不了；
 * 3. 与"乐谱统一从后端获取"直接冲突 —— 那 9 个分支读的是前端源码常量。
 *
 * 实测：库里所有章节项的 `scoreId` 都能在曲库条目中命中
 * （见 `npm run verify:migration` 的引用完整性检查），
 * 所以删掉兜底**不影响任何现存数据**，只是把"数据出错时的行为"从
 * 「假装正常」改成「明确告诉你没绑」。
 */
export function resolveScoreForItem(item: ChapterItem): ScoreData | null {
  const matched = getLibraryItems().find((s) => s.id === item.scoreId);
  if (!matched?.score) return null;

  const base = matched.score;
  /**
   * 章节项可以**覆盖展示信息**（同一份乐谱在不同章节用不同标题/速度练）——
   * 这些覆盖字段仍然生效，行为与老实现一致。
   */
  return {
    ...base,
    id: `score-${item.id}`,
    title: item.scoreTitle || item.title || base.title,
    subtitle: item.description || base.subtitle || '课程指定六线谱实战跟练',
    tempo: item.bpmTarget || base.tempo,
  };
}

/**
 * 该章节项是否绑定了可用的练习乐谱。
 * 给 UI 用来决定「试奏此谱」按钮是否可点（不需要构造整份 `ScoreData`，很轻）。
 */
export function hasBoundScore(item: ChapterItem): boolean {
  if (!item.scoreId) return false;
  return getLibraryItems().some((s) => s.id === item.scoreId);
}

