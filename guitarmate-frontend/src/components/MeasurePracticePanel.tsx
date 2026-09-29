import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, Music2, Play, Pause } from 'lucide-react';
import { api, ApiError } from '../services/api';
import {
  dedupeMeasuresByIndex,
  type PracticeMeasure as PracticeMeasureData,
  type PracticeNote,
  type PracticePackage,
} from '../practicePackage';
import { usePracticeClock } from '../hooks/usePracticeClock';
import { PracticeSystem } from './PracticeSystem';
import { ChordDiagram } from './ChordDiagram';
import { audioEngine } from '../utils/audioSynth';
import { getTabNoteFrequency } from '../utils/tabGenerator';

interface MeasurePracticePanelProps {
  /** 当前歌曲标题 —— 仅用于「本地示例曲目」按标题匹配后端已发布曲目 */
  songTitle?: string;
  /**
   * 后端已发布曲目 id。曲库列表里的云端曲目会直接带进来：
   * 面板**直接绑定**这首曲目，因此不再需要曲目下拉菜单。
   */
  scoreId?: string;
  isDark: boolean;
  /**
   * 播放状态 —— 与页面底部菜单的 PLAY 按钮**共享同一状态**。
   * 段落卡片上的播放按钮通过 `onPlayingChange` 反过来更新它，
   * 因此底部 PLAY 图标与段落播放状态始终一致。
   */
  isPlaying: boolean;
  /** 段落播放按钮回调（与底部 PLAY 共用状态） */
  onPlayingChange?: (playing: boolean) => void;
  /** 页面统一变速档位 (0.75x / 1x / 1.25x) */
  playbackSpeed?: number;
  /**
   * 已发布小节的**真实总时长**（秒）回调。
   * 列表接口的时长是按「小节数 × 小节时长」**估算**的（转录链路的 project.bpm 常为 null），
   * 拉到小节后这里回传精确值，页面底部计时器 / 停止条件就不会跑偏。
   */
  onTotalDuration?: (seconds: number) => void;
  /**
   * 重置令牌：由页面底部「重置进度」按钮递增。
   * 令牌变化时回到第 1 段，并把段落列表滚回最顶部。
   */
  resetToken?: number;
  /**
   * 音源模式，由页面顶部的 Simplified / Original 开关控制：
   * - `false`（Simplified，默认）：播放管理员选定的**练习声道**切片音频（通常是吉他）
   * - `true`（Original）：播放**原声**（含鼓 / 贝斯 / 电琴等全轨混音）切片音频
   *
   * 未发布原声时 Original 会自动回退到练习声道，保证不会出现「切过去没声音」。
   * 六线谱本体始终显示吉他谱，与声道选择无关。
   */
  useOriginal?: boolean;
}

/** 每段小节数可选项（与 CMS 复核工作台「每行小节数」同一套排版规则） */
const MEASURES_PER_SEGMENT_OPTIONS = [1, 2, 3] as const;
const DEFAULT_MEASURES_PER_SEGMENT = 2;

/** MeasureTrack.instrument → 中文短名（与 CMS 发布弹窗的声道下拉保持一致） */
const CHANNEL_LABELS: Record<string, string> = {
  guitar: '吉他',
  guitar_acoustic: '原声吉他',
  guitar_lead: '主音吉他',
  guitar_rhythm: '节奏吉他',
  bass: '贝斯',
  piano: '钢琴',
  drums: '鼓',
  other: '其他',
};

const channelLabelOf = (channel?: string): string =>
  CHANNEL_LABELS[(channel || 'guitar').trim()] || channel || '吉他';

/** 一个练习段落 = 1~3 个小节（一个谱行） */
interface Segment {
  /** 段落首小节在全曲中的下标（含） */
  start: number;
  /** 段落末小节在全曲中的下标（不含） */
  end: number;
  measures: PracticeMeasureData[];
  /** 段落总时长（秒） */
  duration: number;
  /** 段落内各小节的起点（相对段落起点，秒） */
  offsets: number[];
}

/**
 * 云端六线谱分段练习面板（music-detail 页面内嵌）
 * ==============================================
 *
 * 三项关键设计（对应需求）：
 * 1. **没有标题栏、没有曲目下拉菜单** —— 曲目由曲库列表直接带入（`scoreId`），
 *    云端曲目「列表 → 练习」一步到位，无需在详情页二次选择；
 * 2. **每段可显示 1 / 2 / 3 个小节** —— 由 `PracticeSystem` 用与 CMS 复核工作台
 *    相同的排版引擎（`buildStandardTabSystemLayout`）横向并排，样式完全统一；
 * 3. **每段一个播放按钮 → 反复循环本段** —— 练习某一段时不必每次回到顶部重新开始。
 *
 * 底部菜单的 PLAY 仍是「顺序播放全部段落」，两者共享同一播放状态：
 * 点底部 PAUSE 会同时结束段落循环（下次 PLAY 即恢复顺序播放）。
 */
export const MeasurePracticePanel: React.FC<MeasurePracticePanelProps> = ({
  songTitle,
  scoreId,
  isDark,
  isPlaying,
  onPlayingChange,
  playbackSpeed = 1,
  resetToken = 0,
  useOriginal = false,
  onTotalDuration,
}) => {
  const [measures, setMeasures] = useState<PracticeMeasureData[]>([]);
  /** 当前曲目的完整 PracticePackage（统一契约，含 assets / provenance / metronome） */
  const [pkg, setPkg] = useState<PracticePackage | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  /** 每段小节数（1 / 2 / 3） */
  const [measuresPerSegment, setMeasuresPerSegment] = useState<number>(
    DEFAULT_MEASURES_PER_SEGMENT,
  );
  /** 是否正在「反复播放当前段落」 */
  const [looping, setLooping] = useState(false);
  /** 兜底播放状态（父级未接 `onPlayingChange` 时仍能独立工作） */
  const [localPlaying, setLocalPlaying] = useState(false);

  const [resolvedScoreId, setResolvedScoreId] = useState<string>(scoreId || '');
  const [loadingScore, setLoadingScore] = useState(false);
  const [loadingMeasures, setLoadingMeasures] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChordDiagram, setShowChordDiagram] = useState(false);
  /** 手动刷新令牌（点刷新按钮时强制重新拉取小节） */
  const [refreshToken, setRefreshToken] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Array<HTMLDivElement | null>>([]);
  /** 已拉取过小节的曲目键（scoreId#refreshToken），避免重复请求导致播放进度被重置 */
  const loadedScoreRef = useRef<string>('');

  // ── 最新值镜像 ────────────────────────────────────────
  // 供**身份稳定**的回调使用：`PracticeSystem` 被 React.memo 包裹，
  // 若回调每次渲染都变，长谱面（几十个段落）就会全程跟着重渲染 → 掉帧。
  const segmentsRef = useRef<Segment[]>([]);
  const activeIndexRef = useRef(0);
  const pauseRef = useRef<() => void>(() => {});
  const seekRef = useRef<(seconds: number) => void>(() => {});
  /** 已预取过的音频 URL（避免重复请求） */
  const prefetchedRef = useRef<Set<string>>(new Set());

  const playing = onPlayingChange ? isPlaying : localPlaying;

  const setPlaying = useCallback(
    (next: boolean) => {
      onPlayingChange?.(next);
      setLocalPlaying(next);
    },
    [onPlayingChange],
  );

  // ── 段落切分（1 / 2 / 3 个小节一段） ────────────────────
  const segments = useMemo<Segment[]>(() => {
    const size = Math.max(1, measuresPerSegment);
    const out: Segment[] = [];
    for (let i = 0; i < measures.length; i += size) {
      const slice = measures.slice(i, i + size);
      const offsets: number[] = [];
      let acc = 0;
      for (const m of slice) {
        offsets.push(acc);
        acc += Math.max(0, m.duration || 0);
      }
      out.push({ start: i, end: i + slice.length, measures: slice, duration: acc, offsets });
    }
    return out;
  }, [measures, measuresPerSegment]);

  const activeSegmentIndex = useMemo(() => {
    if (!segments.length) return 0;
    const size = Math.max(1, measuresPerSegment);
    return Math.min(segments.length - 1, Math.max(0, Math.floor(activeIndex / size)));
  }, [activeIndex, measuresPerSegment, segments.length]);

  const activeSegment = segments[activeSegmentIndex];
  const activeMeasure: PracticeMeasureData | undefined = measures[activeIndex];
  const activeTrack = activeMeasure?.trackData?.[0];

  /** 已发布小节的真实总时长（用于页面底部计时器，替代列表估算值） */
  const totalDuration = useMemo(
    () => measures.reduce((sum, m) => sum + Math.max(0, m.duration || 0), 0),
    [measures],
  );
  useEffect(() => {
    if (totalDuration > 0) onTotalDuration?.(totalDuration);
  }, [totalDuration, onTotalDuration]);

  /**
   * 当前小节的播放音源：
   * Original 模式优先取 originalAudioUrl；未发布原声时回退到练习声道 audioUrl，
   * 避免用户切到 Original 后完全没声音。
   */
  const effectiveAudioUrl = useMemo(() => {
    if (!activeTrack) return '';
    if (useOriginal) return activeTrack.originalAudioUrl || activeTrack.audioUrl || '';
    return activeTrack.audioUrl || '';
  }, [activeTrack, useOriginal]);

  /** 实际生效的音源类型（回退时告知用户） */
  const isOriginalFallback = useOriginal && !!activeTrack && !activeTrack.originalAudioUrl;

  /**
   * 该曲目是否真的发布了**独立**的原声轨。
   *
   * ⚠️ 后端转录链路在「音轨分离没有真正执行」时（本机没装 demucs → 分离是空操作），
   * 练习声道就是源混音本身，于是 `originalAudioUrl === audioUrl`（实测同一文件名 + 同一 SHA-1）。
   * 这种情况下切 Simplified / Original **必然听不出区别** —— 是**服务端数据**如此，
   * 不是客户端没切换。这里把它显式标出来，避免用户以为「切换坏了」。
   */
  const hasDistinctOriginal = useMemo(
    () =>
      measures.some((m) => {
        const t = m.trackData?.[0];
        return !!t?.originalAudioUrl && t.originalAudioUrl !== t.audioUrl;
      }),
    [measures],
  );
  /** 想听原声，但服务端没有独立原声轨（与练习声道同一个文件） */
  const originalSameAsChannel = useOriginal && measures.length > 0 && !hasDistinctOriginal;

  /** 当前练习声道的短名（Simplified 提示用）——契约里叫 instrument */
  const channelLabel = channelLabelOf(activeTrack?.instrument);

  /** 当前小节拍数（拍号分子）——供节拍器时钟与拍线使用 */
  const beatsPerMeasure = useMemo(() => {
    const n = parseInt(String(activeMeasure?.timeSignature || '4/4').split('/')[0], 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  }, [activeMeasure?.timeSignature]);

  /**
   * 小节播完 → 衔接下一小节：
   * - 段落循环模式：本段内循环（最后一个小节播完回到本段第一个小节）；
   * - 顺序播放模式：全曲顺序推进，末尾回到第 1 小节。
   */
  const handleMeasureEnded = useCallback(() => {
    setActiveIndex((i) => {
      if (measures.length === 0) return 0;
      if (looping) {
        const size = Math.max(1, measuresPerSegment);
        const start = Math.floor(i / size) * size;
        const end = Math.min(start + size, measures.length);
        return i + 1 < end ? i + 1 : start;
      }
      return i + 1 < measures.length ? i + 1 : 0;
    });
  }, [measures.length, measuresPerSegment, looping]);

  /**
   * 统一时间源：有音频 → 音频时钟；没音频 / 音频加载失败 → 节拍器时钟。
   * 两种情况下渲染逻辑完全一致。
   */
  const clock = usePracticeClock({
    trackData: activeTrack,
    useOriginal,
    duration: activeMeasure?.duration ?? 0,
    beatsPerMeasure,
    bpm: activeMeasure?.bpm ?? 80,
    // 单小节不自循环：段落循环由 handleMeasureEnded 跨小节控制
    loop: false,
    onEnded: handleMeasureEnded,
  });

  const currentTime = clock.currentTime;

  /** 当前正在响的音符（与 PracticeSystem 内部判定一致，用于和弦提示） */
  const activeNoteId = useMemo(() => {
    const hit = (activeTrack?.notes || []).find(
      (n) => currentTime >= n.relativeTime && currentTime < n.relativeTime + Math.max(n.duration, 0.08),
    );
    return hit?.id ?? null;
  }, [activeTrack, currentTime]);

  // 兼容原有变量名：音频异常现在会自动降级到节拍器，不再需要手动重试
  const audioStatus = clock.audioFailed ? 'error' : clock.status;
  const audioError = clock.fallbackReason;
  const play = clock.play;
  const pause = clock.pause;
  const seek = clock.seek;
  const setRate = clock.setRate;

  // 把「会变的值」同步到 ref，供稳定回调读取（见上方 refs 声明处的说明）
  segmentsRef.current = segments;
  activeIndexRef.current = activeIndex;
  pauseRef.current = pause;
  seekRef.current = seek;

  // ── 解析要练习的曲目 ───────────────────────────────────
  // 云端曲目直接带 scoreId（曲库列表 → 详情页一步到位）；本地示例曲目没有
  // scoreId → 按标题匹配后端已发布曲目。**匹配不到就不绑定**：
  // 早期版本会退回「列表第一条」，结果在《Wonderwall》详情页里显示的是另一首曲目的谱，
  // 现在改为显示空状态（见下方「该曲目暂无云端小节数据」提示）。
  useEffect(() => {
    if (scoreId) {
      setResolvedScoreId(scoreId);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingScore(true);
      try {
        // 用统一曲库接口：转录链路发布的曲目（无 Score）也在其中
        const list = await api.getPublishedLibrary();
        if (cancelled) return;
        const matched = songTitle
          ? list.find((s) => s.title.toLowerCase().includes(songTitle.toLowerCase()))
          : undefined;
        setResolvedScoreId(matched?.id || '');
      } catch (err: any) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : '加载云端曲目失败');
      } finally {
        if (!cancelled) setLoadingScore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scoreId, songTitle]);

  // ── 拉取小节数据 ──────────────────────────────────────
  // ⚠️ `loadedScoreRef` 必须**成功返回后**才写入：React 18 StrictMode 在开发模式下
  // 会「挂载 → 清理 → 再挂载」，若在请求前就写标记，第二次挂载会直接 early-return，
  // 而第一次请求已被 cleanup 标记为 cancelled → 面板永远停在「正在加载」。
  useEffect(() => {
    if (!resolvedScoreId) return;
    const loadKey = `${resolvedScoreId}#${refreshToken}`;
    if (loadedScoreRef.current === loadKey) return;

    let cancelled = false;

    (async () => {
      setLoadingMeasures(true);
      setError(null);
      try {
        // 统一契约：一次拿全（score / tracks / measures / assets / provenance），
        // 服务端已保证排序、坐标兜底、无音频时的 metronome 配置
        const result = await api.fetchPracticePackage(resolvedScoreId);
        if (cancelled) return;
        loadedScoreRef.current = loadKey;
        setPkg(result);
        // 后端发布是 append-only → 历史数据可能有重复小节，这里按 index 去重
        setMeasures(dedupeMeasuresByIndex(result.measures));
        setActiveIndex(0);
        setLooping(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : '加载小节数据失败');
        setPkg(null);
        setMeasures([]);
      } finally {
        if (!cancelled) setLoadingMeasures(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedScoreId, refreshToken]);

  // 播放状态跟随页面底部 PLAY / 段落播放按钮；小节切换或音源切换
  // （Simplified ↔ Original）时在新音源上重新起播
  useEffect(() => {
    if (measures.length === 0) return;
    if (playing) play();
    else pause();
  }, [playing, measures.length, activeIndex, effectiveAudioUrl, play, pause]);

  // 停止播放 → 同时结束段落循环（下次 PLAY 即「顺序播放全部段落」）
  useEffect(() => {
    if (!playing) setLooping(false);
  }, [playing]);

  // 变速跟随页面统一档位
  useEffect(() => {
    setRate(playbackSpeed);
  }, [playbackSpeed, setRate]);

  // ── 底部「重置进度」→ 回到最顶部的第 1 段 ──────────────
  useEffect(() => {
    if (!resetToken) return;
    setActiveIndex(0);
    setLooping(false);
    setShowChordDiagram(false);
    seek(0);
    const container = listRef.current;
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetToken, seek]);

  /** 刷新：强制重新拉取当前曲目小节 */
  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  // ── 自动滚动到当前段落 ─────────────────────────────────
  useEffect(() => {
    const row = rowsRef.current[activeSegmentIndex];
    const container = listRef.current;
    if (!row || !container) return;
    const target = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeSegmentIndex]);

  /** 切换「每段小节数」：段落边界随新尺寸重算，循环语义保持不变 */
  const handleMeasuresPerSegmentChange = (next: number) => {
    if (next === measuresPerSegment) return;
    setMeasuresPerSegment(next);
  };

  /** 段落播放按钮：反复播放本段（再点一次停止） */
  const handleToggleSegmentPlay = (segIdx: number) => {
    const seg = segments[segIdx];
    if (!seg) return;
    if (playing && looping && segIdx === activeSegmentIndex) {
      setPlaying(false);
      return;
    }
    setLooping(true);
    setActiveIndex(seg.start);
    setShowChordDiagram(false);
    setPlaying(true);
  };

  /** 点击段落卡片：把该段落设为当前练习段落 */
  const handleSelectSegment = (segIdx: number) => {
    const seg = segments[segIdx];
    if (!seg || segIdx === activeSegmentIndex) return;
    setActiveIndex(seg.start);
  };

  /** 当前小节的和弦（用于底部提示与指法图） */
  const activeChordName = useMemo(() => {
    if (!activeMeasure) return null;
    const chords = activeMeasure.chords || [];
    const note = activeTrack?.notes.find((n) => n.id === activeNoteId);
    if (note) {
      const hit = chords.find(
        (c) =>
          note.relativeTime >= c.startTime &&
          note.relativeTime < c.startTime + Math.max(c.duration, 0.2),
      );
      if (hit) return hit.chordName;
    }
    return chords[0]?.chordName ?? null;
  }, [activeMeasure, activeTrack, activeNoteId]);

  /** 点击谱面跳转：segmentIndex 为段落序号，measureIndex 为段落内下标 */
  const handleSeekInSegment = useCallback(
    (segmentIndex: number, measureIndex: number, offsetSec: number) => {
      const seg = segmentsRef.current[segmentIndex];
      const target = seg ? seg.start + measureIndex : measureIndex;
      pauseRef.current();
      setActiveIndex(target);
      if (target === activeIndexRef.current) seekRef.current(offsetSec);
    },
    [],
  );

  /** 点击音符：先试听该音，再把小节切到它所在的位置（同样是稳定回调） */
  const handleNoteClick = useCallback(
    (segmentIndex: number, measureIndex: number, note: PracticeNote) => {
      pauseRef.current();
      const seg = segmentsRef.current[segmentIndex];
      const target = seg ? seg.start + measureIndex : measureIndex;
      if (target !== activeIndexRef.current) setActiveIndex(target);
      if (note.fret >= 0) {
        audioEngine.playString(getTabNoteFrequency(note.string, note.fret), 1.4, 0);
      }
    },
    [],
  );

  /**
   * 预取下一个小节的音频。
   *
   * 后端 `/uploads/**` 已按「文件名自带时间戳 → 内容永不变更」配了长缓存
   * （`max-age=7d, immutable`），所以这里提前 `fetch` 一次就能让
   * 下一小节的 `audio.src` 直接命中 HTTP 缓存 —— 切小节几乎没有加载停顿。
   */
  useEffect(() => {
    const next = measures[activeIndex + 1];
    const track = next?.trackData?.[0];
    if (!track) return;
    const url = useOriginal
      ? track.originalAudioUrl || track.audioUrl
      : track.audioUrl;
    if (!url) return;
    if (prefetchedRef.current.has(url)) return;
    prefetchedRef.current.add(url);
    // 不 abort：让它在后台安静地把缓存焐热（失败也没关系，到时候正常加载）
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .catch(() => {
        prefetchedRef.current.delete(url);
      });
  }, [activeIndex, measures, useOriginal]);

  const subText = isDark ? 'text-zinc-400' : 'text-zinc-500';

  /** 渲染一个练习段落（1~3 个小节的谱行） */
  const renderSegment = (seg: Segment, segIdx: number) => {
    const isActiveSeg = segIdx === activeSegmentIndex;
    const isLoopingSeg = looping && isActiveSeg;
    const isCompleted = !looping && segIdx < activeSegmentIndex;
    const first = seg.measures[0];
    const last = seg.measures[seg.measures.length - 1];

    const label =
      seg.measures.length > 1
        ? `第 ${first.index}–${last.index} 小节`
        : first.label || `第 ${first.index} 小节`;

    /** 段落内的播放位置（秒，相对本段起点） */
    let playheadTimeSec: number | null = null;
    if (isActiveSeg) {
      const offsetInSeg = seg.offsets[activeIndex - seg.start] ?? 0;
      playheadTimeSec = offsetInSeg + currentTime;
    } else if (isCompleted) {
      // 已练过的段落显示满进度（不画播放头走动）
      playheadTimeSec = seg.duration;
    }

    return (
      <div
        key={`segment-${seg.start}`}
        ref={(el) => {
          rowsRef.current[segIdx] = el;
        }}
        onClick={() => handleSelectSegment(segIdx)}
        className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
          isActiveSeg
            ? isDark
              ? 'bg-zinc-900/95 border-emerald-500/80 ring-1 ring-emerald-500/40 shadow-[0_4px_25px_rgba(16,185,129,0.14)]'
              : 'bg-white border-emerald-500 ring-1 ring-emerald-400 shadow-md'
            : isDark
              ? 'bg-zinc-900/40 border-zinc-800/60 opacity-70 hover:opacity-100 hover:border-emerald-500/50'
              : 'bg-white/80 border-zinc-200 opacity-80 hover:opacity-100 hover:border-emerald-500/50'
        }`}
        title={`点击切换到${label}`}
      >
        {/* 段落头：播放按钮 + 段落编号 + 时间信息 */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSegmentPlay(segIdx);
              }}
              title={isLoopingSeg ? '停止本段反复播放' : '反复播放本段（循环练习）'}
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition active:scale-95 ${
                isLoopingSeg
                  ? 'bg-emerald-400 text-black ring-2 ring-emerald-500/40'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              {isLoopingSeg ? (
                <Pause size={11} className="fill-current" />
              ) : (
                <Play size={11} className="fill-current ml-[1px]" />
              )}
            </button>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider border truncate ${
                isDark
                  ? 'bg-zinc-800/90 text-emerald-400 border-zinc-700/60'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}
            >
              {label}
            </span>
            {isLoopingSeg && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                反复练习中
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-mono whitespace-nowrap ${
              isDark ? 'text-zinc-500' : 'text-zinc-400'
            }`}
          >
            {first.startTime.toFixed(2)}s ~ {last.endTime.toFixed(2)}s · {first.bpm} BPM ·{' '}
            {first.timeSignature}
          </span>
        </div>

        <PracticeSystem
          measures={seg.measures}
          segmentIndex={segIdx}
          playheadTimeSec={playheadTimeSec}
          isDark={isDark}
          isLastSystem={segIdx === segments.length - 1}
          showTempo={segIdx === 0}
          onNoteClick={handleNoteClick}
          onSeek={handleSeekInSegment}
        />

        {/* 音频异常提示：现在会自动降级到节拍器，练习不中断 */}
        {isActiveSeg && audioStatus === 'error' && (
          <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-400">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              {audioError || '音频加载失败'}
              {effectiveAudioUrl ? (
                <span className="opacity-75 break-all">{' —— '}{effectiveAudioUrl}</span>
              ) : null}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 whitespace-nowrap">
              已切换节拍器
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    // 外层不套边框／背景卡片：每个段落自身就是整宽卡片（与页面其它卡片同宽同边框）
    <div className="relative mb-4">
      {/* 工具条：每段小节数 + 音源徽标 + 刷新（原「标题 + 曲目下拉菜单」已按要求移除） */}
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${subText}`}>每段小节数</span>
          <div
            className={`flex p-0.5 rounded-lg border ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
            }`}
          >
            {MEASURES_PER_SEGMENT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => handleMeasuresPerSegmentChange(n)}
                className={`w-6 py-0.5 text-[10px] font-mono font-bold rounded-md transition ${
                  measuresPerSegment === n
                    ? 'bg-emerald-500 text-black'
                    : isDark
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title={`每段显示 ${n} 个小节`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className={`text-[10px] ${subText}`}>
            {segments.length > 0 ? `${segments.length} 段 / ${measures.length} 小节` : 'TAB'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono whitespace-nowrap ${
              useOriginal
                ? originalSameAsChannel
                  ? 'bg-zinc-500/12 text-zinc-400 border-zinc-500/25'
                  : 'bg-amber-500/12 text-amber-400 border-amber-500/25'
                : 'bg-cyan-500/12 text-cyan-400 border-cyan-500/25'
            }`}
            title={
              useOriginal
                ? isOriginalFallback || originalSameAsChannel
                  ? '服务端没有为这首曲目产出独立原声轨（音轨分离未执行），Original 与 Simplified 是同一个音频文件 —— 因此听不出区别'
                  : '正在播放原声（含鼓 / 贝斯 / 电琴等全轨混音）'
                : `正在播放练习声道：${channelLabel}`
            }
          >
            {useOriginal
              ? originalSameAsChannel || isOriginalFallback
                ? 'Original（同练习声道）'
                : 'Original 原声'
              : `Simplified · ${channelLabel}`}
          </span>
          {(isOriginalFallback || originalSameAsChannel) && (
            <span className="text-[10px] text-zinc-400 whitespace-nowrap" title="需要独立原声：请安装 demucs 后重新分离/转录并发布，或使用 CMS 的「按标注生成原声」">
              （服务端无独立原声轨）
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loadingScore || loadingMeasures}
            className={`p-1.5 rounded-lg border transition-colors ${
              isDark
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                : 'bg-zinc-100 border-zinc-300 text-zinc-600 hover:bg-zinc-200'
            }`}
            title="重新拉取该曲目的已发布小节"
          >
            {loadingScore || loadingMeasures ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-2.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            {error}
            <br />
            <span className="opacity-75">
              请确认 guitarmate-audio-backend 已在 localhost:3000 启动，并在管理后台发布小节数据。
            </span>
          </span>
        </div>
      )}

      {/* 段落列表：每段 1~3 个小节，纵向排列，当前段自动滚动进入视野 */}
      {loadingMeasures || loadingScore ? (
        <div className={`h-[120px] flex items-center justify-center text-xs ${subText}`}>
          <Loader2 size={16} className="animate-spin mr-2" />
          正在加载小节六线谱数据...
        </div>
      ) : segments.length > 0 ? (
        <div className="relative">
          {/* 全局滚动条宽 5px（见 index.css ::-webkit-scrollbar），
              用 -mr-[5px] 抵消它的占位，保证段落卡片与其它卡片同宽 */}
          <div
            ref={listRef}
            className="space-y-2.5 max-h-[440px] overflow-y-auto custom-scrollbar -mr-[5px]"
          >
            {segments.map((seg, idx) => renderSegment(seg, idx))}
          </div>

          {/* 播放状态提示（非控制按钮） */}
          <div className={`mt-2 text-[10px] flex items-center gap-2 flex-wrap ${subText}`}>
            <Music2 size={10} className="shrink-0" />
            {playing ? (
              <span className="text-emerald-400 font-medium">
                <Play size={9} className="inline -mt-0.5 mr-0.5" />
                {looping ? '段落反复练习' : '正在播放'} ·{' '}
                {activeSegment
                  ? activeSegment.measures.length > 1
                    ? `第 ${activeSegment.measures[0].index}–${
                        activeSegment.measures[activeSegment.measures.length - 1].index
                      } 小节`
                    : activeSegment.measures[0].label
                  : ''}{' '}
                · {currentTime.toFixed(2)}s / {(activeMeasure?.duration ?? 0).toFixed(2)}s
              </span>
            ) : (
              <span>点段落上的 ▶ 反复练习该段；点底部 PLAY 顺序练习全部段落</span>
            )}
            {pkg && (
              <span className="opacity-70" title={`统一数据契约 v${pkg.schemaVersion}`}>
                授权：
                {pkg.provenance.license === 'public_domain'
                  ? '公有领域'
                  : pkg.provenance.license === 'authorized'
                    ? '已授权'
                    : '自建谱面'}
              </span>
            )}
            {activeChordName && (
              <button
                onClick={() => setShowChordDiagram((v) => !v)}
                className="ml-auto font-mono text-emerald-400 hover:text-emerald-300 transition"
                title="点击查看/隐藏当前小节和弦指法图"
              >
                当前和弦 {activeChordName}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`h-[100px] flex flex-col items-center justify-center text-[11px] gap-1 ${subText}`}
        >
          <span>该曲目暂无云端小节数据</span>
          <span className="opacity-70 text-center px-4">
            本地示例曲目尚未发布到云端。请在曲库列表中打开带「云端」标记的曲目，
            或在 guitarmate-studio-cms 中完成转录标注后「发布小节至后端」。
          </span>
        </div>
      )}

      {/* 当前和弦指法图（点底部「当前和弦」开关，不占用谱面空间） */}
      {activeChordName && showChordDiagram && (
        <div
          className={`absolute right-1 z-40 rounded-xl border backdrop-blur-md ${
            isDark
              ? 'bg-zinc-950/95 border-emerald-500/40'
              : 'bg-white/95 border-emerald-500/50 shadow-md'
          }`}
          style={{ bottom: 10, transform: 'scale(0.8)', transformOrigin: 'bottom right' }}
        >
          <ChordDiagram chordName={activeChordName} size="sm" showPlayButton={false} hideHint />
        </div>
      )}
    </div>
  );
};

export default MeasurePracticePanel;
