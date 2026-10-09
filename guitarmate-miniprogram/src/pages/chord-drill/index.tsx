import { Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChordFretboard from '../../components/ChordFretboard';
import BottomNav from '../../components/BottomNav';
import { useMicPitch, type MicPitchFrame, type TunerStringDef } from '../../hooks/useMicPitch';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import {
  CURRENT_USER_ID,
  fetchChordDrills,
  fetchCourses,
  fetchStrumUrl,
  resolveUrl,
  setTaskCompleted,
  type ChordDrill,
} from '../../services/api';
import { getChordPositions, type ChordPosition } from '../../utils/chordLibraryData';
import {
  PASS_PERCENT,
  chordTargetMidis,
  feedbackFor,
  midiToNoteName,
  parseChordName,
  scoreChordMatch,
  tierOf,
  type DetectedNote,
} from '../../utils/chordMatch';
import { findCourseItem } from '../../utils/courseLookup';
import { pageClass } from '../../utils/settings';

/**
 * 和弦微测（Interactive Chord Drill）
 * ==================================
 *
 * ## 对应 Web 版的什么
 *
 * `guitar-ai-audio/src/components/InteractiveChordDrillModal.tsx`（808 行）的**版式与玩法**：
 * 深色底 → 当前和弦名（白色胶囊，点击试听）+ 下一个和弦名 → **两张和弦图**（主图 + 右下角
 * 半透明的"下一个"）→ 匹配度百分比卡片 → 底部**分段进度条** + `Auto 自动切换` / 拾音 /
 * `Tuner 标准音` / 完成打卡。
 *
 * 配色与排版**换成小程序的暗色体系**（`gm-*` / zinc-900 系，与曲库页、课程页一致），
 * 不是把 Web 的 indigo 主题搬过来 —— 这是需求里"整体效果要符合微信小程序样式"的要求。
 *
 * ## 判定方式的替换（关键差异，不是偷懒）
 *
 * Web 版靠 Web Audio 的 `AnalyserNode.getFloatFrequencyData()` 拿**频谱**，
 * 逐目标频率找能量峰值。小程序**没有 Web Audio**（见 `hooks/useMicPitch.ts`），
 * 只能拿到 YIN 算出的**单音基频**。所以判定换成：
 *
 * > 最近 2.5s 内检测到的音里，命中了几根弦的目标音 → 百分比
 *
 * 扫弦余音是依次衰减的，YIN 在这个窗口里通常能抓到大部分弦，
 * 所以「命中了几根弦」是个可解释、可复现的分数。内核是纯函数，见 `utils/chordMatch.ts`
 * （45 项断言的验证脚本：`scripts/verify-chord-match.ts`）。
 *
 * ⚠️ **不提供"模拟评分"**：Web 版有个 `Math.random()` 出分的自测按钮，
 * 那会**编造学习成果**并写进后端进度。这里麦克风不可用就如实告知（`supported=false` 分支）。
 *
 * ## 入参
 *
 * `?itemId=item_xxx`（课程内容项，课程页点进来的）或 `?drillId=drill_xxx`（直接看某个组合）。
 */

/** 标准调弦（6→1 弦），交给 `useMicPitch` 做"最近弦"匹配 */
const TUNING_STRINGS: TunerStringDef[] = [
  { stringNumber: 6, noteName: 'E', octave: 2, targetFreq: 82.41 },
  { stringNumber: 5, noteName: 'A', octave: 2, targetFreq: 110.0 },
  { stringNumber: 4, noteName: 'D', octave: 3, targetFreq: 146.83 },
  { stringNumber: 3, noteName: 'G', octave: 3, targetFreq: 196.0 },
  { stringNumber: 2, noteName: 'B', octave: 3, targetFreq: 246.94 },
  { stringNumber: 1, noteName: 'E', octave: 4, targetFreq: 329.63 },
];

/** 目标音时间窗（毫秒）。太短抓不到扫弦余音，太长会把上一次的扫弦算进来。 */
const MATCH_WINDOW_MS = 2500;
/** 达标后自动切入下一个和弦的延迟（与 Web 版一致） */
const AUTO_ADVANCE_DELAY_MS = 1500;

const TIER_STYLE: Record<string, { box: string; tag: string; bar: string; label: string }> = {
  perfect: {
    box: 'bg-emerald-500/10 border-emerald-500/40',
    tag: 'bg-emerald-500 text-zinc-950',
    bar: 'bg-emerald-400',
    label: '完美精准',
  },
  pass: {
    box: 'bg-teal-500/10 border-teal-500/40',
    tag: 'bg-teal-500 text-zinc-950',
    bar: 'bg-teal-400',
    label: '良好达标',
  },
  near: {
    box: 'bg-amber-500/10 border-amber-500/40',
    tag: 'bg-amber-400 text-zinc-950',
    bar: 'bg-amber-400',
    label: '基本合格',
  },
  adjust: {
    box: 'bg-rose-500/10 border-rose-500/30',
    tag: 'bg-rose-500 text-white',
    bar: 'bg-rose-400',
    label: '需调整指位',
  },
};

/**
 * 按缩放比例画一张和弦图。
 *
 * ⚠️ `ChordFretboard` 的几何是**写死的 260×330 行内 px**（原 SVG viewBox，不能改，
 * 见该文件顶部注释），而**行内 px 不会随屏幕宽度变化** —— 所以缩放比例必须由
 * `useWindowWidth` 现算（写死 0.8 在窄屏上会横着溢出，在宽窗口里又显得小）。
 *
 * 外面再套一层**按缩放后尺寸裁切**的框，否则元素仍占 260×330 的位。
 */
function ScaledChord({
  position,
  scale,
  dim = false,
}: {
  position: ChordPosition;
  scale: number;
  dim?: boolean;
}) {
  /**
   * `ChordFretboard` 的 330 里有 **52px 是顶部留白**（`TOP_MARKER_Y=30` 放 x/o 记号、
   * `BOARD_TOP_Y=52` 才是琴枕）—— 不裁的话两张图上方会顶出一大块空区，
   * 手机上看着“版式散了一大截”。裁掉 18，只留 x/o 记号需要的那一点。
   */
  const CROP_TOP = 18;
  return (
    <View
      style={`width:${260 * scale}px;height:${(330 - CROP_TOP) * scale}px;overflow:hidden;opacity:${
        dim ? 0.45 : 1
      }`}
    >
      {/** `translateY` 写在 `scale` 前面：矩阵是 T×S，位移量要先乘缩放才是屏幕像素 */}
      <View
        style={`transform:translateY(${-CROP_TOP * scale}px) scale(${scale});transform-origin:top left`}
      >
        {/**
          * ⚠️ memo：录音时 `useMicPitch` 内部 state 每 ~64ms 变一次 → 页面整体重渲染。
          * 和弦图是这棵树里最重的部分（几十个 View），而 `position` 的引用是稳定的，
          * 所以用 memo 把它挡在重渲染之外（否则指针会明显发涩）。
          */}
        <MemoChordFretboard position={position} />
      </View>
    </View>
  );
}
const MemoChordFretboard = memo(ChordFretboard);

export default function ChordDrill() {
  /** 和弦图缩放靠它算（行内 px 不随屏幕变，写死就会在窄屏溢出） */
  const winW = useWindowWidth();
  const [itemId, setItemId] = useState('');
  const [drillId, setDrillId] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  /** 本次要练的东西 */
  const [title, setTitle] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [bpmTarget, setBpmTarget] = useState<number | null>(null);
  const [drill, setDrill] = useState<ChordDrill | null>(null);
  /** 教师发布的**和弦序列**（来自内容项或微测组合） */
  const [sequence, setSequence] = useState<string[]>([]);
  /** 课程内容项 id（完成打卡要写回后端进度，用的是它） */
  const [progressItemId, setProgressItemId] = useState('');

  const [current, setCurrent] = useState(0);
  const [mastery, setMastery] = useState<Record<number, number>>({});
  const [percent, setPercent] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [completing, setCompleting] = useState(false);

  /** 最近的检测音（判定窗口用）。放 ref：每帧都会写，不能进 state。 */
  const framesRef = useRef<DetectedNote[]>([]);
  /** 已掌握分数的**权威副本**：判定回调里读它，避免闭包拿到旧 state */
  const masteryRef = useRef<Record<number, number>>({});
  /** 当前下标 / 副本次数 / 目标音，同理用 ref 给回调读 */
  const currentRef = useRef(0);
  const targetsRef = useRef<number[][]>([]);
  const autoAdvanceRef = useRef(true);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);

  useLoad((options: Record<string, string>) => {
    /** ⚠️ Taro 给的 query 是原始编码值，要自己 decode */
    const decode = (v?: string) => {
      const raw = v || '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    setItemId(decode(options?.itemId));
    setDrillId(decode(options?.drillId));
    Taro.setNavigationBarTitle({ title: '和弦微测' });
  });

  /** 指法与目标音（由和弦名现算，纯函数） */
  const positions = useMemo<ChordPosition[]>(
    () =>
      sequence.map((name) => {
        const { root, type } = parseChordName(name);
        return getChordPositions(root, type)[0];
      }),
    [sequence],
  );

  useEffect(() => {
    targetsRef.current = positions.map((p) => (p ? chordTargetMidis(p) : []));
    /** 换和弦序列 → 清掉旧的掌握度（否则下标会串位） */
    masteryRef.current = {};
    setMastery({});
    setPercent(null);
    setMissing([]);
    setFeedback('');
    framesRef.current = [];
    currentRef.current = 0;
    setCurrent(0);
  }, [positions]);

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  /* ── 数据加载 ─────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!itemId && !drillId) {
      setError('缺少参数：需要 ?itemId=（课程内容项）或 ?drillId=（微测组合 id）');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const [courses, drills] = await Promise.all([fetchCourses(), fetchChordDrills()]);
      const drillById = new Map<string, ChordDrill>(drills.map((d) => [d.id, d]));

      if (itemId) {
        const hit = findCourseItem(courses, itemId);
        if (!hit) {
          setError(`课程大纲里找不到这条内容项（itemId=${itemId}）—— 可能教师已删除或调整。`);
          setStatus('error');
          return;
        }
        const { course, chapter, item } = hit;
        const bound: ChordDrill | undefined = item.chordDrillId
          ? drillById.get(item.chordDrillId)
          : undefined;
        /** 和弦序列：内容项上写的优先（教师可能只改了序列没改微测组合） */
        const chords = item.chords?.length ? item.chords : bound?.chords || [];
        setTitle(item.title);
        setCourseTitle(course.title);
        setChapterTitle(chapter.title);
        setBpmTarget(item.bpmTarget ?? bound?.bpmTarget ?? null);
        setDrill(bound || null);
        setProgressItemId(item.id);
        setSequence(chords);
        setStatus('ready');
        return;
      }

      const bound = drillById.get(drillId);
      if (!bound) {
        setError(`微测组合里找不到 id=${drillId}（可能已删除）。`);
        setStatus('error');
        return;
      }
      setTitle(bound.title);
      setCourseTitle('');
      setChapterTitle('');
      setBpmTarget(bound.bpmTarget ?? null);
      setDrill(bound);
      setProgressItemId('');
      setSequence(bound.chords || []);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [itemId, drillId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── 音频：试听标准音（后端合成拨弦） ─────────────────────────── */

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = Taro.createInnerAudioContext();
    return audioCtxRef.current;
  }, []);

  useEffect(
    () => () => {
      audioCtxRef.current?.destroy();
      audioCtxRef.current = null;
    },
    [],
  );

  /** 请后端合成这个和弦的扫弦（35ms/弦）；`-1` 的闷弦后端会跳过 */
  const playChord = useCallback(
    async (position?: ChordPosition) => {
      if (!position) return;
      try {
        const url = await fetchStrumUrl(position.frets, 35);
        const ctx = ensureCtx();
        ctx.stop();
        ctx.src = resolveUrl(url);
        setPlaying(true);
        setTimeout(() => setPlaying(false), 700);
        try {
          const ret = ctx.play() as unknown;
          if (ret && typeof (ret as Promise<void>).catch === 'function') {
            (ret as Promise<void>).catch(() => {
              /* H5 自动播放策略：忽略（真机无此限制） */
            });
          }
        } catch {
          /* 同上 */
        }
      } catch (err) {
        Taro.showToast({
          title: `试听失败：${err instanceof Error ? err.message : String(err)}`,
          icon: 'none',
        });
        setPlaying(false);
      }
    },
    [ensureCtx],
  );

  /* ── 判定 ─────────────────────────────────────────────────────── */

  const goTo = useCallback((idx: number) => {
    currentRef.current = idx;
    setCurrent(idx);
    setPercent(masteryRef.current[idx] ?? null);
    setMissing([]);
    setFeedback('');
    /** 换和弦 → 丢掉旧的检测音，否则上一个和弦的余音会算进新和弦 */
    framesRef.current = [];
  }, []);

  const goNext = useCallback(() => {
    const idx = currentRef.current;
    if (idx < targetsRef.current.length - 1) goTo(idx + 1);
  }, [goTo]);

  /** 达标且开了 Auto → 1.5s 后自动切下一个（与 Web 版同一节奏） */
  const scheduleAutoAdvance = useCallback(
    (idx: number) => {
      if (!autoAdvanceRef.current) return;
      if (advanceTimerRef.current) return;
      if (idx >= targetsRef.current.length - 1) return;
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        goTo(currentRef.current + 1);
      }, AUTO_ADVANCE_DELAY_MS);
    },
    [goTo],
  );

  /**
   * 每收到一个有效音帧就重算当前和弦的命中率。
   *
   * ⚠️ 这里**只在不降分时更新 state**：60ms 一帧、每帧都 setState 会让整页
   * 每秒重渲染十几次。掌握度取历史最高分（与 Web 版 `Math.max` 同义），
   * 所以"分数变小"本来就不需要重绘。
   */
  const handleFrame = useCallback(
    (frame: MicPitchFrame) => {
      const idx = currentRef.current;
      const targets = targetsRef.current[idx] || [];
      if (!targets.length) return;

      const window = framesRef.current.filter((d) => frame.at - d.at <= MATCH_WINDOW_MS);
      window.push({ at: frame.at, midi: frame.midi });
      framesRef.current = window;

      const result = scoreChordMatch(targets, window, MATCH_WINDOW_MS);
      if (result.percent <= 0) return;

      const prevBest = masteryRef.current[idx] || 0;
      if (result.percent <= prevBest) return;

      masteryRef.current = { ...masteryRef.current, [idx]: result.percent };
      setMastery(masteryRef.current);
      setPercent(result.percent);
      setMissing(result.missing);
      setFeedback(feedbackFor(result.percent));
      if (result.percent >= PASS_PERCENT) scheduleAutoAdvance(idx);
    },
    [scheduleAutoAdvance],
  );

  const mic = useMicPitch(TUNING_STRINGS, { onFrame: handleFrame });

  /** 停止拾音时把判定窗口清掉（否则残留的旧音会被算进下一次） */
  const toggleListening = useCallback(async () => {
    if (mic.listening) {
      mic.stop();
      framesRef.current = [];
      return;
    }
    framesRef.current = [];
    await mic.start();
  }, [mic]);

  /** 离开页面必须停录音，否则麦克风一直占着（真机上是实际问题） */
  useEffect(
    () => () => {
      mic.stop();
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** 每个和弦都达标（≥80）→ 可以打卡通关 */
  const allMastered = useMemo(
    () => sequence.length > 0 && sequence.every((_, idx) => (mastery[idx] || 0) >= PASS_PERCENT),
    [sequence, mastery],
  );

  const complete = async () => {
    setCompleting(true);
    try {
      /**
       * 写回后端任务进度（「我的」页的课程进度读的是同一张表）。
       * 直接给 `drillId` 进来的没有课纲条目可标记 → 只提示，不写。
       */
      if (progressItemId) {
        await setTaskCompleted(progressItemId, true, CURRENT_USER_ID);
        Taro.showToast({ title: '已记录：本条已掌握', icon: 'success' });
      } else {
        Taro.showToast({ title: '全部达标！', icon: 'success' });
      }
      setTimeout(() => {
        try {
          Taro.navigateBack();
        } catch {
          Taro.switchTab({ url: '/pages/learn/index' });
        }
      }, 900);
    } catch (err) {
      Taro.showToast({
        title: `记录失败：${err instanceof Error ? err.message : String(err)}`,
        icon: 'none',
      });
    } finally {
      setCompleting(false);
    }
  };

  const activeName = sequence[current] || '';
  const activePosition = positions[current];
  const nextName = current < sequence.length - 1 ? sequence[current + 1] : '';
  const nextPosition = positions[current + 1];
  const tier = percent !== null ? tierOf(percent) : null;

  /**
   * 两张和弦图按**实际窗口宽度**分屏：主图 6 成、预览 3 成、中间留 12px。
   * 写死 0.8 / 0.44 在窄屏（360pt）会横着溢出 —— 主图就占满了，预览被挤下去。
   */
  const availW = Math.max(240, winW - 32);
  const mainScale = Math.min(1, (availW * 0.6) / 260);
  const previewScale = Math.min(0.6, (availW * 0.3) / 260);

  return (
    <View className={pageClass('gm-drill-page')} style="padding-bottom:200px">
      {status === 'loading' && (
        <View className="gm-learn-state">
          <Text className="gm-meta">正在读取微测组合…</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="gm-learn-error">
          <Text>⚠ {error}</Text>
          <View className="gm-learn-retry" onClick={() => void load()}>
            <Text>重试</Text>
          </View>
          <View className="gm-learn-retry" onClick={() => Taro.navigateBack()}>
            <Text>‹ 返回课程</Text>
          </View>
        </View>
      )}

      {status === 'ready' && (
        <View>
          {/** 位置感：从哪门课点进来的（课程名很长，单行截断即可，标题就在下面） */}
          {!!courseTitle && (
            <View className="gm-learn-back" onClick={() => Taro.navigateBack()}>
              <Text className="block truncate">‹ 返回课程 · {courseTitle}</Text>
            </View>
          )}

          <View className="px-3 pt-2">
            <Text className="block text-white font-black text-lg leading-snug">{title}</Text>
            <Text className="block text-[11px] text-zinc-400 mt-1">
              {[chapterTitle, bpmTarget ? `目标 ${bpmTarget} BPM` : '', drill?.steps?.length ? `阶梯 ${drill.steps.join('/')}` : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          {/** ── 当前和弦（白色胶囊，点击试听）+ 下一个预览 ─────────────── */}
          <View className="flex items-center justify-center gap-6 mt-5">
            <View
              className={`px-6 py-1.5 rounded-full ${playing ? 'bg-emerald-300' : 'bg-white'}`}
              onClick={() => void playChord(activePosition)}
            >
              <Text className="text-zinc-900 font-black text-2xl">{activeName || '—'}</Text>
            </View>
            {!!nextName && (
              <Text className="text-zinc-500 text-lg font-bold" onClick={goNext}>
                {nextName}
              </Text>
            )}
          </View>

          {/** ── 两张和弦图：主图 + 半透明的「下一个」（对齐 practice_chor 的版式） ── */}
          <View className="flex items-center justify-center gap-3 mt-4">
            {activePosition ? (
              <View onClick={() => void playChord(activePosition)}>
                <ScaledChord position={activePosition} scale={mainScale} />
              </View>
            ) : (
              <View
                className="gm-learn-state"
                style={`width:${Math.round(mainScale * 260)}px;height:${
                  Math.round(mainScale * 200)
                }px`}
              >
                <Text className="gm-meta">指法库里没有 {activeName}</Text>
              </View>
            )}
            {nextPosition && (
              <View className="flex flex-col items-center" onClick={goNext}>
                <ScaledChord position={nextPosition} scale={previewScale} dim />
                <Text className="text-[10px] text-zinc-500 mt-1">下一个</Text>
              </View>
            )}
          </View>

          {/** ── 匹配度卡片 ───────────────────────────────────────── */}
          <View className="mx-3 mt-4">
            {percent !== null && tier ? (
              <View className={`rounded-2xl border p-3 ${TIER_STYLE[tier].box}`}>
                <View className="flex items-center justify-between">
                  <View className="flex items-center gap-1.5">
                    <Text className="text-[11px] text-zinc-300">和弦声音比对匹配度</Text>
                    <Text className="text-xl font-black text-white">{percent}%</Text>
                  </View>
                  <Text
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TIER_STYLE[tier].tag}`}
                  >
                    {TIER_STYLE[tier].label}
                  </Text>
                </View>

                <View className="w-full h-1.5 rounded-full bg-black/40 mt-2 overflow-hidden">
                  <View
                    className={`h-full rounded-full ${TIER_STYLE[tier].bar}`}
                    style={`width:${percent}%`}
                  />
                </View>

                <Text className="block text-[11px] text-zinc-200 mt-2 leading-relaxed">
                  {feedback}
                </Text>
                {missing.length > 0 && (
                  <Text className="block text-[10px] text-zinc-400 mt-1">
                    还没听到：{missing.map((m) => midiToNoteName(m)).join(' / ')}
                  </Text>
                )}
              </View>
            ) : (
              <View className="rounded-xl bg-zinc-900 border border-zinc-800 p-2.5 text-center">
                <Text className="text-[11px] text-zinc-300">
                  {mic.listening
                    ? '🎙️ 正在听… 请扫响当前和弦'
                    : `💡 按住 ${activeName} 的指法，然后开启琴声比对`}
                </Text>
              </View>
            )}
          </View>

          {/** ── 麦克风不可用时如实说明（H5 拿不到 PCM 帧） ────────── */}
          {!mic.supported && (
            <View className="mx-3 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
              <Text className="block text-[11px] text-amber-300 leading-relaxed">
                ⚠ 当前环境拿不到麦克风的原始 PCM 帧（「分帧录音」是微信运行时特有的能力），
                无法做实时听音判定 —— 请在微信开发者工具或真机上试。和弦指法图与标准音试听在这里仍可用。
              </Text>
            </View>
          )}
          {!!mic.error && (
            <Text className="block mx-3 mt-2 text-[11px] text-rose-300">{mic.error}</Text>
          )}

          {/** ── 底部：分段进度条 + 控制（Auto / 拾音 / 标准音 / 完成） ── */}
          <View className="mx-3 mt-5 mb-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-3">
            <View className="flex items-center gap-1.5">
              {sequence.map((name, idx) => {
                const isCurrent = idx === current;
                const isDone = (mastery[idx] || 0) >= PASS_PERCENT || idx < current;
                return (
                  <View key={`${name}-${idx}`} className="flex-1" onClick={() => goTo(idx)}>
                    <View
                      className={`h-1.5 rounded-full ${
                        isCurrent ? 'bg-white' : isDone ? 'bg-emerald-400' : 'bg-white/20'
                      }`}
                    />
                    <Text
                      className={`block text-center text-[9px] mt-1 ${
                        isCurrent ? 'text-white' : 'text-zinc-500'
                      }`}
                    >
                      {name}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View className="flex items-center justify-between mt-3">
              {/** Auto：达标 80% 后自动切下一个 */}
              <View
                className="flex items-center gap-1.5"
                onClick={() => setAutoAdvance(!autoAdvance)}
              >
                <View
                  className={`w-2.5 h-2.5 rounded-full ${
                    autoAdvance ? 'bg-emerald-400' : 'bg-zinc-600'
                  }`}
                />
                <Text className={`text-[11px] font-semibold ${autoAdvance ? 'text-white' : 'text-zinc-500'}`}>
                  Auto 自动切换
                </Text>
              </View>

              {/** 拾音开关（H5 上会被 hook 挡下并给出说明） */}
              <View
                className={`px-3 py-1.5 rounded-xl ${
                  mic.listening ? 'bg-rose-600' : 'bg-emerald-600'
                }`}
                onClick={() => void toggleListening()}
              >
                <Text className="text-[11px] font-bold text-white">
                  {mic.listening ? '⏹ 正在拾音比对' : '🎙 开启琴声比对'}
                </Text>
              </View>

              {allMastered ? (
                <View
                  className="px-3 py-1.5 rounded-xl bg-emerald-400"
                  onClick={() => void complete()}
                >
                  <Text className="text-[11px] font-black text-zinc-950">
                    {completing ? '记录中…' : '✓ 完成通关打卡'}
                  </Text>
                </View>
              ) : (
                <View
                  className="px-3 py-1.5 rounded-xl bg-zinc-800"
                  onClick={() => void playChord(activePosition)}
                >
                  <Text className="text-[11px] font-semibold text-zinc-200">♪ 标准音试听</Text>
                </View>
              )}
            </View>

            {/** 上个/下个和弦：真机没有键盘，靠这两个箭头翻 */}
            <View className="flex items-center justify-between mt-3">
              <View className="px-4 py-1.5 rounded-xl bg-zinc-800" onClick={() => goTo(Math.max(0, current - 1))}>
                <Text className="text-[11px] text-zinc-300">‹ 上一个</Text>
              </View>
              <Text className="text-[10px] text-zinc-500">
                第 {current + 1} / {sequence.length} 个和弦
              </Text>
              <View className="px-4 py-1.5 rounded-xl bg-zinc-800" onClick={goNext}>
                <Text className="text-[11px] text-zinc-300">下一个 ›</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/** 与其他详情页（视频/曲目）保持一致：底部保留 5 个 tab */}
      <BottomNav active="learn" />
    </View>
  );
}
