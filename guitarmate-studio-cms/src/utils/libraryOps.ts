/**
 * 通用列表操作（libraryOps）
 * ========================
 *
 * 视频库 / 和弦库 / 和弦组都是「带 id 的数组」，增删改查 + 排序的逻辑完全一样。
 * 写成一组泛型纯函数，避免在三个页面里各抄一份 `map` + `filter`。
 */

export interface WithId {
  id: string;
}

/** 新增或按 id 覆盖（保持顺序：存在则原地替换，不存在则追加） */
export function upsertById<T extends WithId>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

/** 批量写入（按 id 合并，保持已有顺序） */
export function upsertManyById<T extends WithId>(list: T[], items: T[]): T[] {
  return items.reduce((acc, item) => upsertById(acc, item), list);
}

export function removeById<T extends WithId>(list: T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}

export function findById<T extends WithId>(list: T[], id: string | null | undefined): T | undefined {
  if (!id) return undefined;
  return list.find((entry) => entry.id === id);
}

/** 与相邻项交换位置（delta = -1 上移 / +1 下移） */
export function moveById<T extends WithId>(list: T[], id: string, delta: -1 | 1): T[] {
  const index = list.findIndex((entry) => entry.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** 按关键字模糊匹配（标题 / 名称 / 标签），空关键字返回原列表 */
export function filterByKeyword<T extends WithId>(
  list: T[],
  keyword: string,
  pick: (item: T) => Array<string | undefined | null>,
): T[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return list;
  return list.filter((item) =>
    pick(item)
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(kw)),
  );
}

/** 统计某 id 在多个列表里被引用的次数（删除前提示用） */
export function countReferences<T extends WithId>(
  owners: Array<{ name: string; ids: Array<string | undefined | null> }>,
  id: string,
): Array<{ name: string; count: number }> {
  return owners
    .map((owner) => ({ name: owner.name, count: owner.ids.filter((value) => value === id).length }))
    .filter((entry) => entry.count > 0);
}

/** 生成不重复的 `id`：`prefix-1` / `prefix-2` … */
export function nextSequentialId(prefix: string, existingIds: string[]): string {
  const used = new Set(existingIds);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/** 调和弦 key → 显示名（和弦库里 key 就是名字，这里只是防御空值） */
export function chordKeyLabel(key?: string | null): string {
  const value = String(key || '').trim();
  return value || '未指定';
}
