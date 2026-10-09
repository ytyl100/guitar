import { Image, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useCallback, useMemo, useState } from 'react';
import BottomNav from '../../components/BottomNav';
import {
  fetchScoreLibrary,
  type ScoreLibraryItem,
} from '../../services/api';
import { pageClass } from '../../utils/settings';

/**
 * 曲库（Songs tab）
 * =================
 *
 * ## 数据源已换到 `/api/library`
 *
 * ⚠️ 这里以前读 `GET /api/published/library`（5 条，服务端渲染好 `tab.png` 的那批）。
 * 现在读 **`GET /api/library`** —— 也就是 `guitar-ai-audio` 前端**乐谱库那个列表**的同一份数据
 * （7 条，含 `instrument / category / type / badges / tempo / keySignature / capo` 等完整元数据）。
 *
 * 两套 id 不是一回事，所以点进练习页时**必须同时换渲染方式**（见 `pages/song/index.tsx` 的
 * "客户端谱面"分支）：曲库条目的 id（如 `macaroon-5`）在已发布那套里**没有 `tab.png`**。
 *
 * ## 筛选条件对齐 Web 版 `TranscriptionListView`
 *
 * | Web 版 | 这里 |
 * |---|---|
 * | 搜索框 | 搜索框（标题/艺人/副标题） |
 * | `activeTab: 'system' \| 'user'` | 顶部 全部 / 系统曲库 / 我的上传 |
 * | `instrumentFilter` | 乐器 chip（**从数据里现算**，不写死四个值） |
 * | `filterUnlocked` / `filterTrial` | 状态 chip：已解锁 / 试听 |
 * | `sortOption: recently \| title \| tempo` | 排序 chip：最近 / 标题 / 速度 |
 *
 * 筛选在**客户端**做（与 Web 版一致）：条目量小，客户端筛能省一次往返，
 * 也让"筛选后还能不能看到收藏"这类组合条件更容易处理。
 *
 * ## 收藏
 *
 * 收藏仍是**本地**的（`Taro` storage）—— 后端没有收藏表，所以不做假的"云同步"。
 */

/** 收藏存在本地（后端没有收藏接口） */
const FAV_KEY = 'guitarmate_fav_songs';

type Category = 'all' | 'system' | 'user';
type SortKey = 'recently' | 'title' | 'tempo';
type TypeFilter = 'all' | 'unlocked' | 'trial';

const SORT_LABEL: Record<SortKey, string> = {
  recently: '最近添加',
  title: '标题',
  tempo: '速度',
};

const CATEGORY_LABEL: Record<Category, string> = {
  all: '全部',
  system: '系统曲库',
  user: '我的上传',
};

export default function Songs() {
  const [items, setItems] = useState<ScoreLibraryItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<Category>('all');
  /** '' = 全部乐器 */
  const [instrument, setInstrument] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recently');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  /**
   * ⚠️ 收藏用 `Set` 且放进 state。
   * Web 版在这里踩过坑：收藏曾经是普通 state，而拉曲库的 `useCallback([])` 读的是
   * **首次渲染的空集合** → 收藏在列表上永远不显示。所以这里用函数式更新，
   * 且读取时统一走 `favIds`（不要缓存到闭包里）。
   */
  const [favIds, setFavIds] = useState<Set<string>>(() => {
    try {
      const saved = Taro.getStorageSync(FAV_KEY);
      return new Set(Array.isArray(saved) ? (saved as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  const load = useCallback(async () => {
    setStatus((prev) => (prev === 'ready' ? prev : 'loading'));
    setError('');
    try {
      /** 列表不要谱面本体（29KB → 3KB），点开某条时再按 id 取完整版 */
      const list = await fetchScoreLibrary({ withScore: false });
      setItems(list);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  /** 从曲库页返回时重新拉一次（后台可能刚改过曲库） */
  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });

  /** 乐器选项从数据里现算：不写死，曲库加了新乐器也不用改代码 */
  const instruments = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => it.instrument && set.add(it.instrument));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = items.filter((it) => {
      if (category !== 'all' && it.category !== category) return false;
      if (instrument && it.instrument !== instrument) return false;
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (!kw) return true;
      return (
        it.title.toLowerCase().includes(kw) ||
        (it.subtitle || '').toLowerCase().includes(kw) ||
        (it.artist || '').toLowerCase().includes(kw)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN');
      if (sortKey === 'tempo') return (b.tempo || 0) - (a.tempo || 0);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return list;
  }, [items, keyword, category, instrument, typeFilter, sortKey]);

  /** 收藏的曲目单独提到最前面一组（只在"全部/未过滤"时分组，避免把筛选结果切碎） */
  const favList = useMemo(
    () => filtered.filter((s) => favIds.has(s.id)),
    [filtered, favIds],
  );
  const restList = useMemo(
    () => filtered.filter((s) => !favIds.has(s.id)),
    [filtered, favIds],
  );

  /** 点进练习页：带上标题/艺人/封面，练习页在被深链时也能立刻显示头部 */
  const open = (item: ScoreLibraryItem) => {
    Taro.navigateTo({
      url:
        `/pages/song/index?id=${encodeURIComponent(item.id)}` +
        `&title=${encodeURIComponent(item.title)}` +
        `&artist=${encodeURIComponent(item.artist || '')}` +
        `&cover=${encodeURIComponent(item.coverUrl || '')}`,
    });
  };

  const toggleFav = (id: string) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        Taro.setStorageSync(FAV_KEY, Array.from(next));
      } catch {
        /* 存不下就只在内存里生效，不打断用户 */
      }
      return next;
    });
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] border ${
      active
        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
        : 'bg-zinc-900 border-zinc-800 text-zinc-400'
    }`;

  const renderCard = (song: ScoreLibraryItem) => {
    const isFav = favIds.has(song.id);
    return (
      <View
        key={song.id}
        className="flex items-center justify-between p-2.5 rounded-2xl border bg-zinc-900/60 border-zinc-800/70 mb-2.5"
        onClick={() => open(song)}
      >
        <View className="flex items-center gap-3 min-w-0 flex-1">
          {song.coverUrl ? (
            <Image
              className="w-14 h-14 rounded-xl shrink-0 border border-zinc-800"
              src={song.coverUrl}
              mode="aspectFill"
            />
          ) : (
            <View
              className="w-14 h-14 rounded-xl shrink-0 border border-zinc-800 flex items-center justify-center"
              style="background-image:linear-gradient(135deg,#065f46,#115e59)"
            >
              <Text className="text-base font-bold" style="color:#a7f3d0">
                ♪
              </Text>
            </View>
          )}

          <View className="min-w-0 flex-1">
            <View className="flex items-center gap-2">
              <Text className="text-base font-bold text-white truncate flex-1">{song.title}</Text>
              {/** 试听/已解锁徽标 */}
              <Text
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${
                  song.type === 'trial'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {song.type === 'trial' ? '试听' : '已解锁'}
              </Text>
              {song.category === 'user' && (
                <Text className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border bg-zinc-800 text-zinc-300 border-zinc-700">
                  我的
                </Text>
              )}
            </View>

            <Text className="block text-xs text-zinc-400 truncate mt-0.5">
              {song.artist || '未标注艺人'}
              {song.subtitle ? ` · ${song.subtitle}` : ''}
            </Text>

            <View className="flex items-center gap-2 mt-1">
              <Text className="text-[10px] text-emerald-500 font-mono">
                {song.tempo ? `${song.tempo} BPM` : '— BPM'}
              </Text>
              <Text className="text-[10px] text-zinc-500 font-mono truncate">
                {[song.instrument, song.keySignature, song.capo ? `Capo ${song.capo}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>

            {song.badges.length > 0 && (
              <View className="flex items-center gap-1.5 mt-1">
                {song.badges.map((b) => (
                  <Text
                    key={b}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700"
                  >
                    {b}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </View>

        <View className="px-1.5 py-1 shrink-0" onClick={() => toggleFav(song.id)}>
          <Text className={isFav ? 'text-base text-rose-500' : 'text-base text-zinc-500'}>
            {isFav ? '★' : '☆'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View className={pageClass('gm-songs-page min-h-screen px-3 pt-4 pb-[140rpx]')}>
      <View className="flex items-center justify-between mb-3">
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-white">吉他伴奏音乐库</Text>
          <Text className="block text-xs mt-0.5 text-zinc-400">
            曲库以后端乐谱库为准（含你的上传）
          </Text>
        </View>
        <View className="flex items-center gap-2 shrink-0">
          <View className="px-2.5 py-1 rounded-full text-[11px] font-mono text-zinc-300 border border-zinc-800">
            <Text>
              {filtered.length}/{items.length}
            </Text>
          </View>
          <View
            className="p-1.5 rounded-full border transition bg-zinc-900 border-zinc-800"
            onClick={() => void load()}
          >
            <Text className="text-xs text-zinc-300">↻</Text>
          </View>
        </View>
      </View>

      {/** ── 搜索 ─────────────────────────────────────────────── */}
      <View className="flex items-center gap-2 mb-3">
        <Text className="text-lg text-zinc-400 shrink-0">🔍</Text>
        <Input
          className="flex-1 pl-3 pr-4 py-3 rounded-full text-sm font-medium bg-zinc-900 text-white border border-zinc-800"
          value={keyword}
          placeholder="搜索曲名 / 艺人"
          placeholderClass="text-zinc-500"
          confirmType="search"
          onInput={(e) => setKeyword(String(e.detail.value ?? ''))}
        />
        {!!keyword && (
          <Text className="text-lg text-zinc-500 shrink-0" onClick={() => setKeyword('')}>
            ✕
          </Text>
        )}
      </View>

      {/** ── 筛选：来源 / 乐器 / 状态 / 排序 ────────────────────── */}
      <View className="mb-4">
        <View className="flex items-center gap-2 mb-2">
          {(['all', 'system', 'user'] as Category[]).map((c) => (
            <Text key={c} className={chip(category === c)} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </Text>
          ))}
        </View>

        {instruments.length > 1 && (
          <View className="flex items-center gap-2 mb-2" style="flex-wrap:wrap">
            <Text className={chip(!instrument)} onClick={() => setInstrument('')}>
              全部乐器
            </Text>
            {instruments.map((ins) => (
              <Text
                key={ins}
                className={chip(instrument === ins)}
                onClick={() => setInstrument(instrument === ins ? '' : ins)}
              >
                {ins}
              </Text>
            ))}
          </View>
        )}

        <View className="flex items-center gap-2" style="flex-wrap:wrap">
          <Text className={chip(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>
            全部状态
          </Text>
          <Text className={chip(typeFilter === 'unlocked')} onClick={() => setTypeFilter('unlocked')}>
            已解锁
          </Text>
          <Text className={chip(typeFilter === 'trial')} onClick={() => setTypeFilter('trial')}>
            试听
          </Text>
          <Text className="text-[11px] text-zinc-600 px-1">|</Text>
          {(['recently', 'title', 'tempo'] as SortKey[]).map((s) => (
            <Text key={s} className={chip(sortKey === s)} onClick={() => setSortKey(s)}>
              按{SORT_LABEL[s]}
            </Text>
          ))}
        </View>
      </View>

      {status === 'loading' && (
        <View className="h-[160px] flex flex-col items-center justify-center gap-2">
          <Text className="text-sm text-emerald-500">◌</Text>
          <Text className="text-xs text-zinc-400">正在同步后端曲库...</Text>
        </View>
      )}

      {status === 'error' && (
        <View
          className="mb-4 px-3 py-3 rounded-2xl border border-amber-500/30 flex items-start gap-2"
          style="background-color:rgba(245,158,11,0.08)"
        >
          <Text className="text-sm text-amber-400 shrink-0">⚠</Text>
          <View className="flex-1 min-w-0">
            <Text className="block text-[11px] text-amber-400">{error || '无法连接后端曲库'}</Text>
            <Text className="block text-[11px] text-amber-400 opacity-75 mt-1">
              曲库数据来自 guitarmate-audio-backend 的 /api/library，请确认后端已启动。
            </Text>
          </View>
          <View className="px-2 py-1 rounded-lg border border-amber-500/40 shrink-0" onClick={() => void load()}>
            <Text className="text-[11px] text-amber-300">重试</Text>
          </View>
        </View>
      )}

      {status === 'ready' && items.length === 0 && (
        <View className="h-[160px] flex flex-col items-center justify-center gap-1">
          <Text className="text-base text-zinc-500">♪</Text>
          <Text className="text-xs text-zinc-400">后端乐谱库还没有曲目</Text>
          <Text className="text-xs text-zinc-500 opacity-70 px-6 text-center">
            在 guitarmate-audio-backend 的 /api/library 里添加曲目后会出现在这里。
          </Text>
        </View>
      )}

      {status === 'ready' && items.length > 0 && filtered.length === 0 && (
        <View className="h-[120px] flex items-center justify-center">
          <Text className="text-xs text-zinc-400">没有符合条件的曲目，试试放宽筛选</Text>
        </View>
      )}

      {status === 'ready' && favList.length > 0 && (
        <View className="mb-7">
          <View className="flex items-center justify-between mb-3">
            <View className="flex items-center gap-1.5">
              <Text className="text-lg font-bold text-white">收藏曲目</Text>
              <Text
                className="text-xs px-2 py-0.5 rounded-full font-mono text-red-400"
                style="background-color:rgba(239,68,68,0.2)"
              >
                {favList.length}
              </Text>
            </View>
            <Text className="text-xs text-zinc-400">本地收藏</Text>
          </View>
          {favList.map(renderCard)}
        </View>
      )}

      {status === 'ready' && restList.length > 0 && (
        <View>
          <View className="flex items-center justify-between mb-3">
            <Text className="text-lg font-bold text-white">
              {favList.length > 0 ? '其他曲目' : '全部曲目'}
            </Text>
            <Text className="text-xs text-zinc-400">按{SORT_LABEL[sortKey]}</Text>
          </View>
          {restList.map(renderCard)}
        </View>
      )}

      <BottomNav active="songs" />
    </View>
  );
}
