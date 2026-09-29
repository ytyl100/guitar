import { View, Text, Image, Input } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useCallback, useMemo, useState } from 'react';
import { API_BASE, getPublishedLibrary, type LibraryItem } from '../../services/api';
import BottomNav from '../../components/BottomNav';
import { pageClass } from '../../utils/settings';

/** 收藏的本地存储 key（小程序没有 localStorage，用 `Taro.*StorageSync`） */
const FAV_KEY = 'guitarmate_fav_songs';

/**
 * 曲库页 —— 样式对齐 `guitarmate-frontend/src/components/MusicTab.tsx`
 * ====================================================================
 *
 * 类名与结构**逐块照搬现有组件的 `SongListItem`**（`<div>`→`<View>`、`<img>`→`<Image>`），
 * 因此两端视觉一致；Tailwind 工具类由 `weapp-tailwindcss` 转成 WXSS 后在小程序生效。
 *
 * 数据源是后端统一曲库（`GET /api/published/library`），**没有本地硬编码曲目** ——
 * CMS 里删掉，这里刷新后就看不到（早先 Web 版把演示曲目写死在前端，导致"删不掉"）。
 */
export default function Index() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  /**
   * 收藏 id 集合。
   * ⚠️ Web 版在这里踩过坑：收藏曾是 `useState`，而拉曲库的 `useCallback([])` 读的是**首次渲染的空集合**
   * （闭包过期）→ 刷新曲库后收藏全丢。小程序这边用 Set state + 每次变更同步写存储，
   * 刷新只改 `items`，不会碰 `favIds`。
   */
  const [favIds, setFavIds] = useState<Set<string>>(() => {
    try {
      const saved = Taro.getStorageSync(FAV_KEY);
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set<string>();
    }
  });

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const list = await getPublishedLibrary();
      setItems(Array.isArray(list) ? list : []);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  /** 每次进入页面都重新拉（CMS 发布/删除后切回来即可看到变化） */
  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(async () => {
    await load();
    Taro.stopPullDownRefresh();
  });

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const matched = !kw
      ? items
      : items.filter(
          (i) =>
            i.title.toLowerCase().includes(kw) || String(i.artist || '').toLowerCase().includes(kw),
        );
    /** 收藏置顶（与 Web 版一致：收藏单独成组，置顶在最前） */
    return matched.filter((i) => !favIds.has(i.id));
  }, [items, keyword, favIds]);

  /** 收藏的曲目（单独成组，与 Web 的 Section 1 一致） */
  const favList = useMemo(
    () => items.filter((i) => favIds.has(i.id)),
    [items, favIds],
  );

  const open = (item: LibraryItem) => {
    /**
     * 顺带把封面/标题/艺人带给详情页：`coverUrl` **只有曲库接口有**（`package` 接口没有），
     * 不带过去详情页的 Hero 就只能退化成首字母色块。带上了就不必再多发一次曲库请求。
     */
    Taro.navigateTo({
      url:
        `/pages/song/index?id=${encodeURIComponent(item.id)}` +
        `&cover=${encodeURIComponent(item.coverUrl || '')}` +
        `&title=${encodeURIComponent(item.title)}` +
        `&artist=${encodeURIComponent(item.artist || '')}`,
    });
  };

  /** 收藏 / 取消收藏：写本地存储（小程序没有 localStorage，用 Taro 存储 API） */
  const toggleFav = (id: string) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      Taro.setStorageSync(FAV_KEY, Array.from(next));
      return next;
    });
  };

  return (
    <View className={pageClass('gm-songs-page min-h-screen px-3 pt-4 pb-[140rpx]')}>
      {/** 标题区（对齐 Web `MusicTab`）：左侧标题+副标题，右侧「N 首」徒标 + 圆形刷新按钮 */}
      <View className="flex items-center justify-between mb-3">
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-white">吉他伴奏音乐库</Text>
          <Text className="block text-xs mt-0.5 text-zinc-400">曲库以后端已发布内容为准</Text>
        </View>
        <View className="flex items-center gap-2 shrink-0">
          <View
            className="px-2.5 py-1 rounded-full text-[11px] font-mono text-zinc-300 border border-zinc-800"
            style="background-color:#27272a"
          >
            <Text>{items.length} 首</Text>
          </View>
          <View
            className="p-1.5 rounded-full border transition bg-zinc-900 border-zinc-800"
            onClick={() => void load()}
          >
            <Text className="text-xs text-zinc-300">↻</Text>
          </View>
        </View>
      </View>

      {/* 搜索框（对齐 Web `MusicTab`：rounded-full · pl-10 给图标留位 · py-3 text-sm） */}
      <View className="flex items-center gap-2 mb-6">
        <Text className="text-lg text-zinc-400 shrink-0">🔍</Text>
        <Input
          className="flex-1 pl-3 pr-4 py-3 rounded-full text-sm font-medium bg-zinc-900 text-white border border-zinc-800"
          placeholder="搜索吉他曲目、歌手、调性..."
          placeholderClass="text-zinc-500"
          value={keyword}
          onInput={(e) => setKeyword(String(e.detail.value ?? ''))}
        />
      </View>

      {/** 加载中（对齐 Web：`h-[160px] flex flex-col items-center justify-center gap-2 text-xs`） */}
      {status === 'loading' && (
        <View className="h-[160px] flex flex-col items-center justify-center gap-2">
          <Text className="text-sm text-emerald-500">◌</Text>
          <Text className="text-xs text-zinc-400">正在同步后端曲库...</Text>
        </View>
      )}

      {/** 拉取失败（对齐 Web：`px-3 py-3 rounded-2xl bg-amber-500/10 border-amber-500/30 text-amber-400 text-[11px]` + ⚠ + 右侧重试） */}
      {status === 'error' && (
        <View
          className="mb-4 px-3 py-3 rounded-2xl border border-amber-500/30 flex items-start gap-2"
          style="background-color:rgba(245,158,11,0.1)"
        >
          <Text className="text-sm text-amber-400 shrink-0">⚠</Text>
          <View className="flex-1 min-w-0">
            <Text className="block text-[11px] text-amber-400">{error || '无法连接后端曲库'}</Text>
            <Text className="block text-[11px] text-amber-400 opacity-75 mt-1">
              曲库以后端已发布内容为准（不再内置示例曲目），请确认 guitarmate-audio-backend 已在 {API_BASE} 启动。
            </Text>
          </View>
          <View
            className="px-2 py-1 rounded-lg border border-amber-500/40 shrink-0"
            onClick={() => void load()}
          >
            <Text className="text-[11px] text-amber-300">重试</Text>
          </View>
        </View>
      )}

      {/** 后端暂无已发布曲目（对齐 Web：`h-[160px]` 居中，带说明文案） */}
      {status === 'ready' && items.length === 0 && (
        <View className="h-[160px] flex flex-col items-center justify-center gap-1">
          <Text className="text-base text-zinc-500">♪</Text>
          <Text className="text-xs text-zinc-400">后端暂无已发布曲目</Text>
          <Text className="text-xs text-zinc-500 opacity-70 px-6 text-center">
            在 guitarmate-studio-cms 中完成转录并「发布」后，曲目会自动出现在这里。
          </Text>
        </View>
      )}

      {/** 搜索无结果（对齐 Web：`h-[120px] flex items-center justify-center text-xs`） */}
      {status === 'ready' && items.length > 0 && filtered.length === 0 && (
        <View className="h-[120px] flex items-center justify-center">
          <Text className="text-xs text-zinc-400">没有找到匹配「{keyword}」的曲目</Text>
        </View>
      )}

      {/**
        * Section 1 · 「我的收藏」—— **Web 版有这一整块，我之前漏了**。
        * 徽标样式同样照搬：`text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 font-mono`
        */}
      {status === 'ready' && favList.length > 0 && (
        <View className="mb-7">
          <View className="flex items-center justify-between mb-3">
            <View className="flex items-center gap-1.5">
              <Text className="text-lg font-bold text-white">收藏曲目</Text>
              <Text className="text-xs px-2 py-0.5 rounded-full font-mono text-red-400" style="background-color:rgba(239,68,68,0.2)">
                已置顶 {favList.length}
              </Text>
            </View>
            {/**
              * Web 版这里有 `See all` 但它**没有绑定任何行为**。
              * 小程序里放一个点了没反应的按钮是「假控件」，所以这里给它一个真实语义：
              * 收藏是**全量平铺**的（没有分页/更多页），点它只是确认这一点。
              */}
            <Text
              className="text-xs text-zinc-400"
              onClick={() =>
                Taro.showToast({ title: `已显示全部 ${favList.length} 首收藏`, icon: 'none' })
              }
            >
              See all
            </Text>
          </View>
          {favList.map((item) => (
            <SongListItem
              key={item.id}
              song={item}
              isFav
              onSelect={() => open(item)}
              onToggleFav={() => toggleFav(item.id)}
            />
          ))}
        </View>
      )}

      {/* Top songs 分组标题 */}
      {status === 'ready' && filtered.length > 0 && (
        <View className="flex items-center justify-between mb-3">
          <Text className="text-lg font-bold text-white">热门推荐</Text>
          <Text className="text-xs text-zinc-400">按后端已发布内容</Text>
        </View>
      )}

      {filtered.map((item) => (
        <SongListItem
          key={item.id}
          song={item}
          isFav={favIds.has(item.id)}
          onSelect={() => open(item)}
          onToggleFav={() => toggleFav(item.id)}
        />
      ))}

      <BottomNav active="songs" />
    </View>
  );
}

/**
 * 单个曲目行 —— 与现有 App 的 `SongListItem` 逐类名对齐：
 * `flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition active:scale-[0.99]`
 * `bg-zinc-900/60 border-zinc-800/70`
 */
function SongListItem({
  song,
  isFav,
  onSelect,
  onToggleFav,
}: {
  song: LibraryItem;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  const tags = ['TAB', song.source === 'transcription' ? '转录' : '云端'];
  return (
    <View
      className="flex items-center justify-between p-2.5 rounded-2xl border bg-zinc-900/60 border-zinc-800/70 mb-2.5"
      onClick={onSelect}
    >
      <View className="flex items-center gap-3 min-w-0 flex-1">
        {song.coverUrl ? (
          <Image
            className="w-14 h-14 rounded-xl shrink-0 border border-zinc-800"
            src={song.coverUrl}
            mode="aspectFill"
          />
        ) : (
          /* 转录链路没有封面 → 首字母色块兜底（尺寸/圆角与封面一致，不破坏布局） */
          <View
            className="w-14 h-14 rounded-xl shrink-0 border border-zinc-800 flex items-center justify-center"
            style="background-color:#064e3b"
          >
            <Text className="text-base font-bold" style="color:#a7f3d0">
              {song.title.trim().slice(0, 1) || '♪'}
            </Text>
          </View>
        )}
        <View className="min-w-0 flex-1">
          <View className="flex items-center gap-2">
            <Text className="text-base font-bold text-white truncate flex-1">{song.title}</Text>
            {tags.map((tag) => (
              <Text
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border bg-zinc-800 text-zinc-300 border-zinc-700"
              >
                {tag}
              </Text>
            ))}
          </View>
          <Text className="block text-xs text-zinc-400 truncate mt-0.5">
            {song.artist || '未标注'}
          </Text>
          <View className="flex items-center gap-2 mt-1">
            <Text className="text-[10px] text-emerald-500 font-mono">
              {song.measureCount} 小节{song.noteCount ? ` · ${song.noteCount} 音符` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/**
        * 收藏按钮（对齐 Web 版 `SongListItem` 右侧的 `onToggleFav`）。
        * ⚠️ 必须 `stopPropagation`：它在整张卡片的 onClick 里，
        * 不拦截会边收藏边进入详情页。
        */}
      <View
        className="px-1.5 py-1 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
      >
        <Text className={isFav ? 'text-base text-rose-500' : 'text-base text-zinc-500'}>
          {isFav ? '♥' : '♡'}
        </Text>
      </View>
    </View>
  );
}

