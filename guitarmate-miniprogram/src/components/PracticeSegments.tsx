import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { fetchTabLayout, tabPngUrl, type TabLayout } from '../services/api';
import { useSegmentPlayer } from '../hooks/useSegmentPlayer';
import {
  formatSec,
  segmentLabel,
  splitSegments,
  trackDataOf,
  type PracticePackage,
  type PracticeMeasure,
} from '../utils/practice';

/**
 * 段落练习面板（内联在曲目详情页里，不跳页）
 * =========================================
 *
 * 结构、文案、控件位置都对齐 Web 版
 * `guitarmate-frontend/src/components/MeasurePracticePanel.tsx`：
 *
 * ```
 * 工具条    每段小节数 1/2/3 · N 段 / M 小节 ·          音源徽标
 * 段落列表  每段一张**整宽卡片**：段标签 + 音符数/和弦 + ▶ + 本段自己的六线谱
 *           当前段那张卡片的谱面额外挂叠加层（播放头 / 当前音符 / 横按）
 * 状态行    未播放 → 操作提示；播放中 → 正在练哪一段 + 秒数进度
 * 底部条    [当前时间 / 本段时长          速度 0.75x · 1x · 1.25x]
 *           [↺ 重置              大圆形 PLAY              右侧等宽占位]
 * ```
 *
 * ## 为什么段落列表在这个组件里、而不是留在 `pages/song`
 *
 * Web 版的段落列表本来就在面板内部（面板拿到 scoreId 后自己拉数据、自己渲染）。
 * 我起初把它拆到页面里、面板只画「当前段」，立刻出现两处别扭：
 * 1. 选中的那段反而**看不到谱面** —— 得在页面最下方另画一张，还要小心别重复渲染；
 * 2. 「每段小节数」掉到 40 多张卡片的**下面**，想改设置先得滚到底。
 * 现在按 Web 版收回面板内部：段落、谱面、▶、状态行是同一棵子树，天然一致。
 *
 * ## 小程序特有的偏离（平台限制，不是设计漂移）
 *
 * 1. **谱面用服务端渲染的 PNG**：小程序不支持 WXML 里的 `<svg>`，
 *    所以 SVG 由后端 `src/published/tab-render/` 渲染成 PNG，客户端只叠加会动的层。
 * 2. **叠加层坐标取自 `tab.json`，不能用契约的归一化 `x`/`y`**：
 *    契约的 `x = relativeTime / duration`（小节内 0-1），而谱面真实 x 是
 *    `contentLeft + ratio × contentWidth`（还要叠加小节在谱行里的横向平移与谱号占位），
 *    用归一化值画会整体错位、且越靠右的小节偏得越多。后端因此用**同一次排版**
 *    额外返回一版像素坐标。
 * 3. 请求 PNG 时 `width` 直接传图片的**实际显示宽度**（`innerPx`），
 *    画布 1px == 屏幕 1px，坐标可 1:1 使用 —— 省掉比例换算，也就少一个出错点。
 */
export interface PracticeSegmentsProps {
  pkg: PracticePackage;
  /** true = 原声轨（Original），false = 练习声道（Simplified）。由详情页头部那组开关控制 */
  useOriginal: boolean;
  /** 重新拉取该曲目的已发布小节（后端重新发布后不必重启小程序） */
  onRefresh?: () => void;
}

/** 每段小节数可选项（与 CMS 复核工作台「每行小节数」同一套排版规则） */
const MEASURES_PER_SEGMENT_OPTIONS = [1, 2, 3];

/** 选段时要做什么：反复练本段 / 顺序练（推进）/ 只选中不播 */
type SelectMode = 'loop' | 'all' | 'none';

export default function PracticeSegments({ pkg, useOriginal, onRefresh }: PracticeSegmentsProps) {
  const [perSegment, setPerSegment] = useState(2);
  /** 当前选中的段（起始小节号） */
  const [activeFrom, setActiveFrom] = useState(0);
  /** false = 反复本段（点段落 ▶）；true = 顺序练完全部段落（底部大 PLAY） */
  const [playAll, setPlayAll] = useState(false);
  /**
   * 开播请求。**必须走 state + effect，不能在点击处直接 `player.play()`**：
   * 点击那一刻 `setActiveFrom` 刚入队，`segmentRef` 里还是**旧段**，
   * 直接播会「按了下一段却响上一段」——旧的独立练习页踩过这个坑。
   * effect 在渲染之后执行，那时 ref 已是新段。
   */
  const [playRequest, setPlayRequest] = useState<{ token: number; loop: boolean }>({
    token: 0,
    loop: true,
  });
  const [layout, setLayout] = useState<TabLayout | null>(null);
  const [layoutError, setLayoutError] = useState('');

  const measures = useMemo(() => pkg.measures || [], [pkg]);
  const trackIndex = useMemo(
    () => Math.max(0, pkg.tracks.findIndex((t) => String(t.instrument || '').includes('guitar'))),
    [pkg],
  );
  const segments = useMemo(() => splitSegments(measures, perSegment), [measures, perSegment]);
  /** 选中段的下标；`activeFrom` 若不在任何段起点（刚改过每段小节数），回落到第 1 段 */
  const slotIndex = useMemo(
    () => Math.max(0, segments.findIndex((s) => s.from === activeFrom)),
    [segments, activeFrom],
  );
  const segment = segments[slotIndex] || null;

  /**
   * 谱面宽度：**实测**卡片内容宽度，而不是按 padding 去算。
   *
   * ⚠️ 算错过两次，而且错得很隐蔽：
   * 1. 写死 660px → 375 屏上右侧被直接裁掉；
   * 2. 按「页边距 24 + 卡片 12」算 → 但 weapp 多一层 Taro 的 `page{padding:24rpx…}`（H5 没有）。
   * 内边距一改公式就失效，而失效的表现是**谱面右侧被裁**——H5 里基本看不出来。
   * 现在改为：每张卡片里放一个 0 高度、100% 宽度的探针，量它的实际宽度（跨平台都准）。
   */
  const [measuredWidth, setMeasuredWidth] = useState(0);
  useEffect(() => {
    Taro.createSelectorQuery()
      .select('#gm-tab-probe')
      .boundingClientRect((rect) => {
        const w = Math.round(Number((rect as { width?: number } | null)?.width) || 0);
        /** 差 <2px 就不更新：避免测量值微动引起多一次 tab.json 请求 */
        if (w > 0) setMeasuredWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev));
      })
      .exec();
  }, [segments]);

  const dpr = useMemo(() => {
    const info = (
      typeof Taro.getWindowInfo === 'function' ? Taro.getWindowInfo() : Taro.getSystemInfoSync()
    ) as { windowWidth?: number; pixelRatio?: number };
    return Math.min(3, Math.max(1, Number(info?.pixelRatio) || 2));
  }, []);

  /** 测量落地前的兜底值：窗口宽 − 页面左右 16×2 − 卡片左右 16×2 − 2px 余量 */
  const fallbackCssWidth = useMemo(() => {
    const info = (
      typeof Taro.getWindowInfo === 'function' ? Taro.getWindowInfo() : Taro.getSystemInfoSync()
    ) as { windowWidth?: number };
    const ww = info?.windowWidth || 375;
    return Math.max(240, Math.round(ww - 32 - 32 - 2));
  }, []);

  const cssWidth = measuredWidth || fallbackCssWidth;
  /** 按 dpr 请求位图（375 屏上谱面只有 ~300 CSS px，1x 位图字会糊）；后端把 width 夹在 320..1600 */
  const canvasWidth = Math.min(1600, Math.round(cssWidth * dpr));

  /**
   * 画布像素 → CSS px。
   * ⚠️ 用 `canvasWidth / cssWidth` **回算**而不是直接用 `dpr` —— 后端可能夹取过 canvasWidth。
   * 叠加层坐标一律过这个函数：`layout` 里的坐标属于 `canvasWidth` 那个坐标系。
   */
  const canvasScale = canvasWidth / cssWidth;
  const toCss = (v: number) => v / canvasScale;

  const player = useSegmentPlayer({
    segment,
    trackIndex,
    useOriginal,
    loop: !playAll,
    /** 顺序练习时本段播完：后面还有段就切过去继续（'all'），已经是最后一段就收尾 */
    onSegmentEnd: () => {
      const nextSeg = segments[slotIndex + 1];
      if (nextSeg) selectSegment(nextSeg.from, 'all');
      else setPlayAll(false);
    },
  });

  /**
   * 选段（函数声明，先于定义处被 `onSegmentEnd` 引用也没问题）。
   * - `'loop'`：点段落上的 ▶ → 立即反复练本段；
   * - `'all'`：顺序练习推进 → 立即接着往下练；
   * - `'none'`：点卡片本体 → 只选中（显示带叠加层的谱面），不动播放。
   */
  function selectSegment(from: number, mode: SelectMode) {
    setActiveFrom(from);
    if (mode === 'none') return;
    setPlayRequest((p) => ({ token: p.token + 1, loop: mode === 'loop' }));
  }

  /** 段落 ▶：正在反复练本段时再点一次 = 停 */
  function toggleSegment(slot: number) {
    const seg = segments[slot];
    if (!seg) return;
    if (player.isPlaying && !playAll && slot === slotIndex) {
      player.pause();
      return;
    }
    selectSegment(seg.from, 'loop');
  }

  /** 底部大 PLAY：开始 / 暂停「顺序练完全部段落」 */
  function togglePlayAll() {
    if (player.isPlaying) {
      player.pause();
      return;
    }
    if (!playAll) {
      // 首次按：进入顺序练习，从本段第 1 小节开始
      setPlayAll(true);
      player.play(0);
      return;
    }
    // 已在顺序练习中：从当前小节接着播
    player.play();
  }

  /** ↺ 重置：停止播放、回到第 1 段（对齐 Web 版 resetToken 的语义） */
  function reset() {
    player.stop();
    setPlayAll(false);
    setActiveFrom(segments[0]?.from ?? 0);
  }

  /**
   * 自动开播：token 变化即触发。
   * ⚠️ 顺序推进在同一批 state 里同时更新 `activeFrom` 与 token，
   * 所以本 effect 执行时 `segment` 已是新段，不会出现「旧段把播放请求吃掉」。
   */
  useEffect(() => {
    if (!playRequest.token || !segment) return;
    setPlayAll(!playRequest.loop);
    player.play(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest.token]);

  /** 拉取「当前段」的像素级排版（与 tab.png 同一次排版） */
  useEffect(() => {
    if (!segment) return;
    let cancelled = false;
    setLayoutError('');
    /**
     * ⚠️ 切段时**必须先清空上一段的排版**：不清空的话，新段的谱面会短暂地
     * 套用旧段的像素坐标（叠加层是绝对定位，错位看起来就是「高亮画到了别的音符上」）。
     * 清空后回退成不带叠加层的纯图片，而图片 URL 没变（服务端 `Cache-Control` 7 天），
     * 所以不会有重新下载的闪动。
     */
    setLayout(null);
    fetchTabLayout(pkg.score.id, {
      from: segment.from,
      count: segment.measures.length,
      width: canvasWidth,
      theme: 'dark',
    })
      .then((data) => !cancelled && setLayout(data))
      .catch((e) => !cancelled && setLayoutError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [segment, pkg.score.id, canvasWidth]);

  const cur = layout?.measures?.[player.measureSlot];
  const ratio = cur && cur.duration > 0 ? Math.max(0, Math.min(1, player.offsetSec / cur.duration)) : 0;
  const playheadX = cur ? cur.contentLeft + ratio * (cur.contentRight - cur.contentLeft) : 0;

  /** 本段总时长（各小节时长求和；不用 bpm 推 —— 转录链路 bpm 常为 null） */
  const segmentDurationSec = useMemo(
    () => (segment?.measures || []).reduce((s, m) => s + (Number(m.duration) || 0), 0),
    [segment],
  );
  /** 已播秒数 = 本段前几个小节时长之和 + 当前小节内偏移（底部时间显示用） */
  const elapsedSec = useMemo(() => {
    if (!segment) return 0;
    let sum = 0;
    for (let i = 0; i < player.measureSlot; i += 1) {
      sum += Number(segment.measures[i]?.duration) || 0;
    }
    return sum + player.offsetSec;
  }, [segment, player.measureSlot, player.offsetSec]);

  /** 叠加层：当前小节里「正在响」的音符（实心点）与「下一个」音符（空心圈） */
  const { active, next } = useMemo(() => {
    const a: Array<{ x: number; y: number; w: number; h: number }> = [];
    const n: Array<{ x: number; y: number; w: number; h: number }> = [];
    const measure: PracticeMeasure | undefined = segment?.measures?.[player.measureSlot];
    if (!layout || !measure || !player.isPlaying) return { active: a, next: n };
    const notes = trackDataOf(measure, trackIndex)?.notes || [];
    const off = player.offsetSec;
    const ids = new Set(
      notes
        .filter((x) => x.relativeTime <= off + 1e-6 && x.relativeTime + Math.max(x.duration, 0.08) > off)
        .map((x) => x.id),
    );
    const nextNote = notes.find((x) => x.relativeTime > off + 0.001);
    for (const laid of layout.notes) {
      if (laid.slot !== player.measureSlot) continue;
      if (ids.has(laid.id)) a.push(laid);
      else if (nextNote && laid.id === nextNote.id) n.push(laid);
    }
    return { active: a, next: n };
  }, [layout, segment, trackIndex, player.isPlaying, player.offsetSec, player.measureSlot]);

  if (!segment) return null;

  const channelLabel =
    pkg.tracks?.[trackIndex]?.label || pkg.tracks?.[trackIndex]?.instrument || 'guitar';

  return (
    <View>
      {/* ── 工具条：每段小节数 + 段落统计 + 音源徽标 ────────────────── */}
      {/* ⚠️ 整行**不套卡片**（对齐 Web 版：每个段落自己就是整宽卡片，工具条只是它上方一行） */}
      {/* `flex-wrap`：窄屏（375）上徽标 + 刷新会挤到第二行（Web 版也是 flex-wrap） */}
      <View style="display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;margin-bottom:12px">
        <View style="display:flex;align-items:baseline">
          <Text className="gm-meta" style="margin-right:8px">
            每段小节数
          </Text>
          {MEASURES_PER_SEGMENT_OPTIONS.map((n) => (
            <View
              key={n}
              className={`gm-chip gm-chip--tight${perSegment === n ? ' gm-chip--active' : ''}`}
              onClick={() => {
                if (n === perSegment) return;
                /**
                 * 段落边界随新尺寸重算；循环语义不变（对齐 Web 版 handleMeasuresPerSegmentChange）。
                 * ⚠️ 正在播的音频属于**旧**分段，必须停掉，否则会出现「谱面换了、响的还是上一段」。
                 */
                player.stop();
                setPlayAll(false);
                setPerSegment(n);
              }}
            >
              <Text>{n}</Text>
            </View>
          ))}
          <Text className="gm-meta">
            {segments.length} 段 / {measures.length} 小节
          </Text>
        </View>

        {/** 右侧：音源徽标（正在练哪个声道）+ 刷新（后端重新发布后可直接重拉） */}
        <View style="display:flex;align-items:center">
          <Text
            className="gm-meta"
            style={`padding:2px 12px;border-radius:999px;border:1px solid ${
              useOriginal ? 'rgba(245,158,11,0.25)' : 'rgba(6,182,212,0.25)'
            };background-color:${useOriginal ? 'rgba(245,158,11,0.12)' : 'rgba(6,182,212,0.12)'};color:${
              useOriginal ? '#fbbf24' : '#22d3ee'
            }`}
          >
            {useOriginal ? 'Original 原声' : `Simplified · ${channelLabel}`}
          </Text>
          {onRefresh && (
            <View
              style="margin-left:12px;padding:4px 14px;border-radius:12px;border:1px solid rgba(63,63,70,0.8);background-color:rgba(39,39,42,0.6)"
              onClick={onRefresh}
            >
              <Text className="gm-meta">↻</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── 段落列表：每段一张整宽卡片，各自带六线谱与 ▶ ─────────────── */}
      {segments.map((seg, idx) => {
        const isActive = seg.slot === slotIndex;
        /** 正在反复练本段（Web 的 isLoopingSeg） */
        const isLooping = isActive && player.isPlaying && !playAll;
        const first = seg.measures[0];
        const last = seg.measures[seg.measures.length - 1];
        return (
          <View
            key={seg.slot}
            className={`gm-seg-card${isActive ? ' gm-seg-card--active' : ''}`}
            onClick={() => selectSegment(seg.from, 'none')}
          >
            {/** 宽度探针：0 高度、占满卡片内容宽度；谱面宽度按它实测（见上方注释） */}
            <View id="gm-tab-probe" style="width:100%;height:0" />
            {/**
              * 段落头（逐元素对齐 Web 版：**左** ▶ + 段编号徽标 + 「反复练习中」，**右** 时间区间 / BPM / 拍号）。
              * ⚠️ 之前我在这里写的是「N 个音符 · 和弦 X / Y」——那是我自己编的内容，
              * Web 版是 `0.00s ~ 4.80s · 103 BPM · 4/4`（和弦本来就画在谱面里）。
              */}
            <View className="gm-seg-head">
              <View style="display:flex;align-items:center;min-width:0">
                {/**
                  * ⚠️ `stopPropagation` 是必需的：这个 ▶ 嵌在外层卡片的 onClick 里，
                  * 不拦截就会先执行本元素的「反复练本段」、再执行外层卡片的「只选中」，
                  * 后者把播放请求覆盖掉 —— 点 ▶ 进去却不播（Web 版 `handleSurfaceClick` 踩过同一个坑）。
                  */}
                <View
                  className={`gm-seg-play${isLooping ? ' gm-seg-play--on' : ''} gm-center`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSegment(idx);
                  }}
                >
                  <Text>{isLooping ? '❚❚' : '▶'}</Text>
                </View>
                <Text className="gm-seg-badge">{seg.label || segmentLabel(seg.measures)}</Text>
                {isLooping && <Text className="gm-seg-loop">反复练习中</Text>}
              </View>
              <Text className="gm-seg-time">
                {Number(first.startTime).toFixed(2)}s ~ {Number(last.endTime).toFixed(2)}s ·{' '}
                {first.bpm || pkg.score?.bpm || '—'} BPM ·{' '}
                {first.timeSignature || pkg.score?.timeSignature || '4/4'}
              </Text>
            </View>

            {/**
              * 每段**都有自己的六线谱**（对齐网页版）。
              * `lazyLoad` 避免 43 张 PNG 同时申请（小程序图片并发很有限）。
              */}
            {isActive && layout ? (
              /**
               * ⚠️ 舞台尺寸**由排版数据显式算出**，不靠图片自己撑：
               * Taro H5 的 `widthFix` 外层壳会报一个比图片高得多的尺寸（实测 240 vs 156），
               * 舞台被撑高后叠加层的坐标系也跟着含糊；显式宽高在两个平台都一样精确。
               * 高度用 `tab.json` 自己的宽高比 → 与 PNG 同源，`aspectFit` 不会留边。
               */
              <View
                className="gm-tab-stage"
                style={`width:${cssWidth}px;height:${Math.round((cssWidth * layout.height) / layout.width)}px`}
              >
                <Image
                  className="gm-tab-img"
                  style="width:100%;height:100%"
                  src={tabPngUrl(pkg.score.id, {
                    from: seg.from,
                    count: seg.measures.length,
                    width: canvasWidth,
                  })}
                  mode="aspectFit"
                />
                <View className="gm-tab-overlay">
                  {layout.barres.map((b) => (
                    <View
                      key={`barre-${b.id}`}
                      style={`position:absolute;left:${toCss(b.x)}px;top:${toCss(b.y)}px;width:${toCss(b.w)}px;height:${toCss(b.h)}px;border-radius:6px;background-color:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.9)`}
                    />
                  ))}
                  <View
                    className="gm-progress-track"
                    style={`left:${toCss(cur?.contentLeft ?? 0)}px;top:${toCss(layout.progressY)}px;width:${toCss(cur ? cur.contentRight - cur.contentLeft : 0)}px`}
                  />
                  <View
                    className="gm-progress-fill"
                    style={`left:${toCss(cur?.contentLeft ?? 0)}px;top:${toCss(layout.progressY)}px;width:${toCss(Math.max(0, playheadX - (cur?.contentLeft ?? 0)))}px`}
                  />
                  {next.map((n) => {
                    const r = toCss(Math.max(n.w, n.h) / 2 + 2);
                    return (
                      <View
                        key={`n-${n.x}-${n.y}`}
                        className="gm-note-ring"
                        style={`left:${toCss(n.x) - r}px;top:${toCss(n.y) - r}px;width:${r * 2}px;height:${r * 2}px`}
                      />
                    );
                  })}
                  {active.map((n) => {
                    const r = toCss(Math.max(n.w, n.h) / 2 + 2);
                    return (
                      <View
                        key={`a-${n.x}-${n.y}`}
                        className="gm-note-dot"
                        style={`left:${toCss(n.x) - r}px;top:${toCss(n.y) - r}px;width:${r * 2}px;height:${r * 2}px`}
                      />
                    );
                  })}
                  {player.isPlaying && cur && (
                    <View
                      className="gm-playhead"
                      style={`left:${toCss(playheadX)}px;top:${toCss(layout.staffTop - 10)}px;height:${toCss(layout.staffBottom - layout.staffTop + 20)}px`}
                    />
                  )}
                </View>
              </View>
            ) : (
              <Image
                className="gm-tab-img"
                src={tabPngUrl(pkg.score.id, {
                  from: seg.from,
                  count: seg.measures.length,
                  width: canvasWidth,
                })}
                mode="widthFix"
                lazyLoad
              />
            )}

            {/** 音频异常提示（对齐 Web 版那条琥珀色提示；不再静默失败） */}
            {isActive && (player.error || layoutError) && (
              <Text
                className="gm-meta"
                style="display:block;margin-top:8px;padding:8px 12px;border-radius:12px;background-color:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#fbbf24"
              >
                ⚠ {player.error || `谱面加载失败：${layoutError}`}
              </Text>
            )}
          </View>
        );
      })}

      {/* ── 状态行：未播放给提示，播放中给「在练哪一段 + 进度」───────── */}
      <View style="display:flex;align-items:center;margin:8px 0 16px">
        <Text className="gm-meta" style="margin-right:8px">
          ♪
        </Text>
        {player.isPlaying ? (
          <Text className="gm-meta" style="color:#34d399">
            {playAll ? '正在播放' : '段落反复练习'} · {segmentLabel(segment.measures)} ·{' '}
            {player.offsetSec.toFixed(2)}s / {(cur?.duration ?? 0).toFixed(2)}s
          </Text>
        ) : (
          <Text className="gm-meta">点段落上的 ▶ 反复练习该段；点底部 PLAY 顺序练习全部段落</Text>
        )}
      </View>

      {/* ── 底部固定控制条 ──────────────────────────────────────────── */}
      <View className="gm-bar" style="flex-direction:column;align-items:stretch">
        {/* 第一行：左「时间 / 本段时长」＋ 右「速度 0.75x · 1x · 1.25x」 */}
        <View style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <Text className="gm-meta" style="font-family:monospace">
            {formatSec(elapsedSec)} / {formatSec(segmentDurationSec)}
          </Text>
          <View style="display:flex;align-items:center">
            <Text className="gm-meta" style="margin-right:8px">
              速度:
            </Text>
            {[0.75, 1, 1.25].map((r) => (
              <View
                key={r}
                className={`gm-chip gm-chip--tight${player.rate === r ? ' gm-chip--active' : ''}`}
                style="margin-right:0"
                onClick={() => player.setRate(r)}
              >
                <Text>{r}x</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 第二行：左「重置 ↺」＋ 中「大圆形 PLAY/暂停」＋ 右侧等宽占位（让圆钮真正居中） */}
        <View style="display:flex;align-items:center;justify-content:space-between">
          <View className="gm-play-btn" onClick={reset}>
            <Text>↺</Text>
          </View>
          <View
            className="gm-play-btn gm-play-btn--on"
            /**
             * ⚠️ 尺寸必须走 `Taro.pxTransform`：**行内 style 里的 `px` 不会被 Taro 改成设计单位**
             * （只有 WXSS 里的 px 会被改），写 `112px` 真就渲染 112 CSS px ——
             * 实测手机上比 Web 版（56px）大了一倍。入参是**设计 px（750 画布）**，所以传 112。
             */
            style={`width:${Taro.pxTransform(112)};height:${Taro.pxTransform(112)};font-size:${Taro.pxTransform(40)}`}
            onClick={togglePlayAll}
          >
            <Text>{player.isPlaying ? '❚❚' : '▶'}</Text>
          </View>
          {/**
            * 右侧等宽占位：必须与左侧「重置」按钮**同宽**，大圆钮才会真正居中。
            * ⚠️ 同样不能用行内 `px`（不会被子 Taro 换算），否则占位变成重置钮的两倍宽，圆钮左偏。
            */}
          <View style={`width:${Taro.pxTransform(72)};height:${Taro.pxTransform(72)}`} />
        </View>
      </View>
    </View>
  );
}