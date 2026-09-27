import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useMemo, useState } from 'react';
import { fetchPracticePackage } from '../../services/api';
import PracticeSegments from '../../components/PracticeSegments';
import BottomNav from '../../components/BottomNav';
import { pageClass } from '../../utils/settings';
import {
  dedupeMeasuresByIndex,
  formatSec,
  totalDurationSec,
  type PracticePackage,
} from '../../utils/practice';

/**
 * 曲目详情页
 * ==========
 *
 * 只有两个块，和 Web 版一样：
 * 1. **头部卡片**：标题 + 曲目信息 + Capo + `Simplified｜Original`；
 * 2. **段落练习面板**（`PracticeSegments`）：工具条、段落列表（每段自带六线谱与 ▶）、
 *    状态行、底部固定控制条。
 *
 * ⚠️ 段落列表**不在这里**渲染。它属于面板内部 —— Web 版的 `MeasurePracticePanel`
 * 就是自己拉数据、自己画列表的（见 `PracticeSegments` 文件头注释「为什么段落列表在这个组件里」）。
 *
 * ⚠️ 顶部标题走**原生导航栏**（`Taro.setNavigationBarTitle`）。
 * 参考图里那一行（返回 / 分享 / 收藏 / ⋯）是 Web 版被迫自绘的（网页没有原生导航栏），
 * 小程序再画一遍就会出现两个返回按钮 —— 那是在解决网页的问题，不是要复制的设计。
 */
export default function Song() {
  const [id, setId] = useState('');
  const [pkg, setPkg] = useState<PracticePackage | null>(null);
  const [useOriginal, setUseOriginal] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  /**
   * 封面 / 标题 / 艺人：从曲库列表跳转时**顺带带过来**（`cover` 只有列表接口有，`package` 里没有）。
   * 直接深链进来（没有参数）时全部回落为空 → 用首字母色块兜底，不会因为缺封面而报错。
   */
  const [hero, setHero] = useState({ cover: '', title: '', artist: '' });

  const load = useCallback(async (itemId: string) => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchPracticePackage(itemId);
      setPkg(data);
      setStatus('ready');
      if (data?.score?.title) {
        Taro.setNavigationBarTitle({ title: data.score.title });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useLoad((params) => {
    /**
     * ⚠️ `useLoad` 给的 query 值是**没有解码的原始串**（实测 H5 下 `title` 拿到
     * `Macaroon%205%20%7C%20...`）。所以这里统一解码；再包一层 try 兜住
     * 「值里本来就有 % 但不是转义序列」的情况（`decodeURIComponent` 会抛 URIError）。
     */
    const dec = (v: unknown) => {
      const s = String(v ?? '');
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    const itemId = dec(params?.id);
    setId(itemId);
    setHero({
      cover: dec(params?.cover),
      title: dec(params?.title),
      artist: dec(params?.artist),
    });
    if (itemId) void load(itemId);
    else {
      setError('缺少曲目 id');
      setStatus('error');
    }
  });

  /**
   * 工具栏 ↻：重新拉取曲目数据。
   * ⚠️ **不能复用 `load()`** —— 它会把 status 置成 `loading`，面板被卸载、
   * 正在播的 `InnerAudioContext` 一起被销毁（练到一半点刷新就静音了）。
   */
  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setPkg(await fetchPracticePackage(id));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  const measures = useMemo(() => dedupeMeasuresByIndex(pkg?.measures || []), [pkg]);
  const duration = useMemo(() => totalDurationSec(measures), [measures]);
  /** 标题/艺人：优先用列表带过来的（立即可见），否则用 package 里的 */
  const title = hero.title || pkg?.score?.title || '';
  const artist = hero.artist || pkg?.score?.artist || '未标注';

  if (status === 'loading') {
    return (
      <View className="gm-page">
        <Text className="gm-muted" style="display:block;margin-top:32px">
          正在加载曲目数据…
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View className="gm-page">
        <View className="gm-card">
          <Text className="gm-seg-label">加载失败</Text>
          <Text className="gm-meta" style="display:block">
            {error}
          </Text>
          <View className="gm-btn gm-btn--primary" style="margin-top:20px" onClick={() => void load(id)}>
            <Text>重试</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    /** 底部留白：底下有固定控制条（两行）**加**底部主导航，不留白会挡住最后一段的谱面 */
    <View className={pageClass()} style="padding-bottom:320px">
      {/**
        * 封面 Hero（对齐 Web 版 `MusicTab` 详情页：h-40 封面 + 底部渐变 + 标题/艺人压在左下）。
        * 没有封面（转录链路常没有）→ 首字母色块（与曲库列表的兜底同构）。
        * 文字用**渐变遮罩**压住，不用 `filter: brightness()`（WXSS 对 filter 支持不一致）。
        *
        * ⚠️ 尺寸一律用 `[Nrpx]` 类名而**不是行内 px**：行内 `px` 不会被 Taro 换成设计单位，
        * 在手机上会双倍大（这也正是 Hero 标题曾经 30px 的原因）。
        * 标题加 `truncate`：歌名很长时（如「Macaroon 5 | YouTube Audio Library」）
        * 固定 160px 高的 Hero 会把多余的行截掉，截断比削字好看。
        */}
      <View className="relative overflow-hidden rounded-2xl border border-zinc-800 mb-4">
        <View className="relative w-full h-[320rpx]">
          {hero.cover ? (
            <Image className="w-full h-[320rpx]" mode="aspectFill" src={hero.cover} />
          ) : (
            <View className="w-full h-[320rpx] flex items-center justify-center bg-emerald-900">
              <Text className="text-4xl font-extrabold text-emerald-200">
                {title.trim().slice(0, 1) || '♪'}
              </Text>
            </View>
          )}
          <View
            className="absolute inset-0"
            style="background:linear-gradient(to top,#101217,rgba(16,18,23,0.45),rgba(0,0,0,0.3))"
          />
          <View className="absolute left-[32rpx] right-[32rpx] bottom-[24rpx]">
            <Text className="block text-2xl font-extrabold text-white truncate">{title}</Text>
            <Text className="block text-xs text-zinc-200 mt-[4rpx] truncate">{artist}</Text>
          </View>
        </View>
      </View>

      {/** 曲目信息 + Capo + Simplified｜Original（对齐 Web 版：这两项在**详情页头部**） */}
      <View className="gm-card">
        <Text className="gm-meta" style="display:block">
          {measures.length} 小节 · {formatSec(duration)} · {pkg?.score?.timeSignature || '4/4'} · BPM{' '}
          {pkg?.score?.bpm || '—'}
        </Text>
        <Text className="gm-meta" style="display:block">
          音轨：{(pkg?.tracks || []).map((t) => t.label || t.instrument).join(' / ') || '—'}
        </Text>

        <View style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
          <Text className="gm-meta">Capo: {pkg?.score?.capo ?? '—'}</Text>
          <View style="display:flex">
            <View
              className={`gm-chip${!useOriginal ? ' gm-chip--active' : ''}`}
              onClick={() => setUseOriginal(false)}
            >
              <Text>Simplified</Text>
            </View>
            <View
              className={`gm-chip${useOriginal ? ' gm-chip--active' : ''}`}
              style="margin-right:0"
              onClick={() => setUseOriginal(true)}
            >
              <Text>Original</Text>
            </View>
          </View>
        </View>

        {/**
          * 云端/转录链路没有单独的「和弦库」标注（和弦是写在小节数据里的）。
          * Web 版这种情况给的就是这句中性提示 —— 直接照搬，不要自己造一个和弦库。
          */}
        <Text className="gm-meta block mt-[16rpx] opacity-70">
          该曲目为云端发布谱面，和弦标注请见下方分段练习
        </Text>

        {/**
          * AI 跟弹评测入口（**新功能**，Web 版没有这一块）。
          * 放在信息卡里而不是练习面板里：面板是"逐块照搬 Web"的部分，不要往里加自创控件。
          */}
        <View
          className="gm-eval-entry"
          onClick={() =>
            Taro.navigateTo({
              url:
                `/pages/ai-eval/index?id=${encodeURIComponent(id)}` +
                `&title=${encodeURIComponent(title)}&slot=0`,
            })
          }
        >
          <Text className="gm-eval-entry-title">🎤 AI 跟弹评测</Text>
          <Text className="gm-eval-entry-sub">
            跟着该段参考音频弹，端上听音逐音判定（准确 / 偏低 / 偏高 / 弹错）
          </Text>
        </View>
      </View>

      {pkg && (
        <PracticeSegments pkg={pkg} useOriginal={useOriginal} onRefresh={() => void refresh()} />
      )}

      {/** 底部主导航（对齐参考图：详情页同样保留 5 个 tab，与 Web 版一致） */}
      <BottomNav active="songs" />
    </View>
  );
}
