import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, CloudDownload, Music2, Play } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { PublishedScore } from '../practiceTypes';
import type {
  PracticeMeasure as PracticeMeasureData,
  PracticePackage,
} from '../practicePackage';
import { createIdleClock, usePracticeClock } from '../hooks/usePracticeClock';
import { PracticeMeasure } from './PracticeMeasure';
import { ChordDiagram } from './ChordDiagram';
import { audioEngine } from '../utils/audioSynth';
import { getTabNoteFrequency } from '../utils/tabGenerator';

interface MeasurePracticePanelProps {
  /** 当前歌曲标题，用于自动匹配后端已发布曲目 */
  songTitle?: string;
  isDark: boolean;
  /**
   * 播放状态 —— 由页面底部菜单的 PLAY 按钮**统一控制**。
   * 本面板不再提供独立的播放 / 暂停 / 重置 / 变速按钮。
   */
  isPlaying: boolean;
  /** 页面统一变速档位 (0.75x / 1x / 1.25x) */
  playbackSpeed?: number;
  /** 是否默认展开 */
  defaultOpen?: boolean;
  /**
   * 重置令牌：由页面底部「重置进度」按钮递增。
   * 令牌变化时本面板回到第 1 小节，并把小节列表滚回最顶部。
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

const PLAYHEAD_RATIO = 1 / 3;

/** MeasureTrack.channel → 中文短名（与 CMS 发布弹窗的声道下拉保持一致） */
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

/**
 * 云端六线谱小节练习面板 (music-detail 页面内嵌)
 *
 * 展示方式与下方歌词区的「模拟六线谱」完全一致：
 * - **每个小节占一个栏目（一行）**，纵向依次排列，复用同一套 600×142 谱面版式
 * - 播放时自动高亮当前小节，并自动滚动衔接到下一个栏目
 * - 当前小节音频播完 → 自动进入下一小节；最后一个小节播完回到第一小节循环
 * - 播放 / 暂停 / 变速全部由页面底部菜单的 PLAY 按钮统一驱动
 */
export const MeasurePracticePanel: React.FC<MeasurePracticePanelProps> = ({
  songTitle,
  isDark,
  isPlaying,
  playbackSpeed = 1,
  defaultOpen = true,
  resetToken = 0,
  useOriginal = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [scores, setScores] = useState<PublishedScore[]>([]);
  const [selectedScoreId, setSelectedScoreId] = useState<string>('');
  const [measures, setMeasures] = useState<PracticeMeasureData[]>([]);
  /** 当前曲目的完整 PracticePackage（统一契约，含 assets / provenance / metronome） */
  const [pkg, setPkg] = useState<PracticePackage | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [loadingScores, setLoadingScores] = useState(false);
  const [loadingMeasures, setLoadingMeasures] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChordDiagram, setShowChordDiagram] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Array<HTMLDivElement | null>>([]);
  /** 已拉取过小节的曲目键（scoreId#refreshToken），避免重复请求导致播放进度被重置 */
  const loadedScoreRef = useRef<string>('');
  /** 手动刷新令牌（点刷新按钮时强制重新拉取小节） */
  const [refreshToken, setRefreshToken] = useState(0);

  const activeMeasure: PracticeMeasureData | undefined = measures[activeIndex];
  const activeTrack = activeMeasure?.trackData?.[0];
  /** 当前小节是否真的带原声（用于 Original 按钮的可用性提示） */
  const hasOriginalAudio = useMemo(
    () => measures.some((m) => !!m.trackData?.[0]?.originalAudioUrl),
    [measures],
  );

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
  const isOriginalFallback =
    useOriginal && !!activeTrack && !activeTrack.originalAudioUrl;

  /** 当前练习声道的短名（Simplified 模式提示用）——契约里叫 instrument */
  const channelLabel = channelLabelOf(activeTrack?.instrument);

  /** 非当前小节使用的静态时钟（避免为每一行都建一个 HTMLAudioElement） */
  const idleClocks = useMemo(
    () => measures.map((m) => createIdleClock(m.duration)),
    [measures],
  );

  /** 当前小节拍数（拍号分子）——供节拍器时钟与拍线使用 */
  const beatsPerMeasure = useMemo(() => {
    const n = parseInt(String(activeMeasure?.timeSignature || '4/4').split('/')[0], 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  }, [activeMeasure?.timeSignature]);

  /** 当前小节播完 → 自动衔接到下一小节（末尾回到第一小节） */
  const handleMeasureEnded = useCallback(() => {
    setActiveIndex((i) => {
      if (measures.length === 0) return 0;
      return i + 1 < measures.length ? i + 1 : 0;
    });
  }, [measures.length]);

  /**
   * 统一时间源：有音频 → 音频时钟；没音频 / 音频加载失败 → 节拍器时钟。
   * 两种情况下本面板的渲染逻辑完全一致（旧版 `useScrollSync` 只认音频，
   * 音频一坏就“点了没声”，这正是本次改造要解决的痛点）。
   */
  const clock = usePracticeClock({
    trackData: activeTrack,
    useOriginal,
    duration: activeMeasure?.duration ?? 0,
    beatsPerMeasure,
    bpm: activeMeasure?.bpm ?? 80,
    // 由底部 PLAY 统一控制；单小节不自循环，改为播完衔接到下一小节
    loop: false,
    onEnded: handleMeasureEnded,
  });

  const currentTime = clock.currentTime;
  const progressPercent =
    clock.duration > 0 ? Math.max(0, Math.min(100, (currentTime / clock.duration) * 100)) : 0;

  /** 当前正在响的音符（与 PracticeMeasure 内部判定一致，用于和弦提示） */
  const activeNoteId = useMemo(() => {
    const hit = (activeTrack?.notes || []).find(
      (n) => currentTime >= n.relativeTime && currentTime < n.relativeTime + Math.max(n.duration, 0.08),
    );
    return hit?.id ?? null;
  }, [activeTrack, currentTime]);

  // 兼容原有 JSX 的变量名：音频异常现在会自动降级到节拍器，不再需要手动重试
  const audioStatus = clock.audioFailed ? 'error' : clock.status;
  const audioError = clock.fallbackReason;
  const play = clock.play;
  const pause = clock.pause;
  const seek = clock.seek;
  const setRate = clock.setRate;

  // 面板播放状态跟随页面底部的 PLAY 按钮（折叠时暂停，避免不可见仍出声）
  // effectiveAudioUrl 变化（Simplified ↔ Original 切换）时需要在新音源上重新起播
  useEffect(() => {
    if (measures.length === 0) return;
    if (isPlaying && isOpen) play();
    else pause();
  }, [isPlaying, isOpen, measures.length, activeIndex, effectiveAudioUrl, play, pause]);

  // 变速跟随页面统一档位
  useEffect(() => {
    setRate(playbackSpeed);
  }, [playbackSpeed, setRate]);

  // ── 底部「重置进度」→ 回到最顶部的第 1 小节 ──────────────
  // 放在 useScrollSync 之后，以便同时把当前小节音频 seek 回起点
  useEffect(() => {
    if (!resetToken) return;
    setActiveIndex(0);
    setShowChordDiagram(false);
    seek(0);
    const container = listRef.current;
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetToken, seek]);

  // ── 拉取已发布曲目 ─────────────────────────────────────
  const loadScores = useCallback(async () => {
    setLoadingScores(true);
    setError(null);
    try {
      const list = await api.getPublishedScores();
      setScores(list);
      if (list.length === 0) {
        setSelectedScoreId('');
        setMeasures([]);
        return;
      }
      const matched =
        (songTitle &&
          list.find((s) => s.title.toLowerCase().includes(songTitle.toLowerCase()))) ||
        list[0];
      setSelectedScoreId(matched.id);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : '加载云端曲目失败');
      setScores([]);
    } finally {
      setLoadingScores(false);
    }
  }, [songTitle]);

  // ── 拉取小节数据 ──────────────────────────────────────
  // 仅当所选曲目变化时拉取；不能依赖 isOpen，
  // 否则每次展开/收起都会重新拉取并把播放进度重置回第 1 小节
  useEffect(() => {
    if (!selectedScoreId) return;
    const loadKey = `${selectedScoreId}#${refreshToken}`;
    if (loadedScoreRef.current === loadKey) return;
    loadedScoreRef.current = loadKey;

    let cancelled = false;

    (async () => {
      setLoadingMeasures(true);
      setError(null);
      try {
        // 统一契约：一次拿全（score / tracks / measures / assets / provenance），
        // 服务端已保证排序、坐标兜底、无音频时的 metronome 配置
        const result = await api.fetchPracticePackage(selectedScoreId);
        if (cancelled) return;
        setPkg(result);
        setMeasures(result.measures);
        setActiveIndex(0);
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
  }, [selectedScoreId, refreshToken]);

  useEffect(() => {
    if (isOpen && scores.length === 0 && !loadingScores) {
      loadScores();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 刷新：重新拉取曲目列表 + 强制重新拉取当前曲目小节
  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
    loadScores();
  }, [loadScores]);

  // ── 自动滚动到当前小节栏目 ─────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const row = rowsRef.current[activeIndex];
    const container = listRef.current;
    if (!row || !container) return;
    const target = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeIndex, isOpen]);

  /** 当前小节的和弦（用于顶部提示与指法图） */
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

  /** 点击小节栏目：切换练习小节 */
  const handleSelectMeasure = (idx: number) => {
    if (idx === activeIndex) {
      seek(0);
      return;
    }
    setActiveIndex(idx);
  };

  /** 每个小节的进度：已播完 = 100，未开始 = 0，当前 = 实时进度 */
  const rowProgress = (idx: number) => {
    if (idx < activeIndex) return 100;
    if (idx > activeIndex) return 0;
    return progressPercent;
  };

  /** 渲染单个小节栏目（整宽卡片：与原歌词卡片同宽同边框） */
  const renderMeasureRow = (m: PracticeMeasureData, idx: number) => {
    const isActive = idx === activeIndex;
    const track = m.trackData?.[0];

    return (
      <div
        key={m.id}
        ref={(el) => {
          rowsRef.current[idx] = el;
        }}
        onClick={() => handleSelectMeasure(idx)}
        className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
          isActive
            ? isDark
              ? 'bg-zinc-900/95 border-emerald-500/80 ring-1 ring-emerald-500/40 shadow-[0_4px_25px_rgba(16,185,129,0.14)]'
              : 'bg-white border-emerald-500 ring-1 ring-emerald-400 shadow-md'
            : isDark
            ? 'bg-zinc-900/40 border-zinc-800/60 opacity-70 hover:opacity-100 hover:border-emerald-500/50'
            : 'bg-white/80 border-zinc-200 opacity-80 hover:opacity-100 hover:border-emerald-500/50'
        }`}
        title={`点击切换到${m.label}`}
      >
        {/* 栏目头：小节编号与时间（与歌词区小节标签同风格） */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider border ${
              isDark
                ? 'bg-zinc-800/90 text-emerald-400 border-zinc-700/60'
                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}
          >
            {m.label || `第 ${m.index} 小节`}
          </span>
          <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {m.startTime.toFixed(2)}s ~ {m.endTime.toFixed(2)}s · {m.bpm} BPM · {m.timeSignature}
          </span>
        </div>

        <PracticeMeasure
          bare
          measure={m}
          // 当前小节用真实时钟（音频 / 节拍器自动切换）；
          // 其余小节用静态空闲时钟 + progressOverride，不占用音频资源
          clock={isActive ? clock : idleClocks[idx]}
          isDark={isDark}
          height={190}
          playheadRatio={PLAYHEAD_RATIO}
          progressOverride={isActive ? undefined : rowProgress(idx)}
          onNoteClick={(n) => {
            pause();
            if (!isActive) setActiveIndex(idx);
            if (n.fret >= 0) {
              audioEngine.playString(getTabNoteFrequency(n.string, n.fret), 1.4, 0);
            }
            if (isActive) seek(n.relativeTime);
          }}
          onChordClick={(chord) => audioEngine.playChord(chord)}
          onSeek={(p) => {
            pause();
            if (!isActive) setActiveIndex(idx);
            if (isActive && m.duration > 0) seek((p / 100) * m.duration);
          }}
        />

        {/* 音频异常提示：现在会自动降级到节拍器，练习不中断 */}
        {isActive && audioStatus === 'error' && (
          <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-400">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              {audioError || '音频加载失败'}
              {(isActive ? effectiveAudioUrl : track?.audioUrl) ? (
                <span className="opacity-75 break-all">
                  {' —— '}
                  {isActive ? effectiveAudioUrl : track?.audioUrl}
                </span>
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

  const subText = isDark ? 'text-zinc-400' : 'text-zinc-500';

  return (
    // 外层不再套边框／背景卡片：小节栏目自身就是整宽卡片，
    // 与原先歌词卡片的宽度与边框保持一致（p-4 rounded-2xl border）
    <div className="relative mb-4">
      {/* 折叠头 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <CloudDownload size={14} className="text-emerald-400" />
          <span
            className={`text-xs font-bold tracking-wide ${
              isDark ? 'text-zinc-200' : 'text-zinc-800'
            }`}
          >
            云端六线谱小节练习
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-400 border border-emerald-500/25 font-mono">
            {measures.length > 0 ? `${measures.length} 小节` : 'TAB'}
          </span>
          {pkg && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-500/12 text-zinc-400 border border-zinc-500/25 font-mono"
              title={`统一数据契约 v${pkg.schemaVersion} · ${pkg.provenance.source} · 人工校对度 ${pkg.provenance.humanReviewLevel} · 授权 ${pkg.provenance.license}`}
            >
              {pkg.provenance.license === 'public_domain'
                ? '公有领域'
                : pkg.provenance.license === 'authorized'
                  ? '已授权'
                  : '自建谱面'}
            </span>
          )}
          {/* 当前音源模式：由页面顶部 Simplified / Original 开关控制 */}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${
              useOriginal
                ? 'bg-amber-500/12 text-amber-400 border-amber-500/25'
                : 'bg-cyan-500/12 text-cyan-400 border-cyan-500/25'
            }`}
            title={
              useOriginal
                ? isOriginalFallback
                  ? '该曲目尚未发布原声，已自动回退到练习声道音频'
                  : '正在播放原声（含鼓 / 贝斯 / 电琴等全轨混音）'
                : `正在播放练习声道：${channelLabel}`
            }          >
            {useOriginal ? 'Original 原声' : `Simplified · ${channelLabel}`}
          </span>
          {isOriginalFallback && (
            <span className="text-[10px] text-amber-400">（原声未发布，已回退）</span>
          )}
          <span className={`text-[10px] ${subText}`}>· 由底部 PLAY 统一控制</span>
        </div>
        <span className={`text-[11px] ${subText}`}>{isOpen ? '收起 ▲' : '展开 ▼'}</span>
      </button>

      {isOpen && (
        <div className="pb-1 pt-2">
          {/* 曲目选择 + 刷新 + 和弦图 */}
          <div className="flex items-center gap-2 mb-2.5">
            <select
              value={selectedScoreId}
              onChange={(e) => setSelectedScoreId(e.target.value)}
              className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border font-mono ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                  : 'bg-zinc-50 border-zinc-300 text-zinc-800'
              }`}
            >
              <option value="">
                {loadingScores ? '加载中...' : scores.length === 0 ? '暂无已发布曲目' : '选择曲目'}
              </option>
              {scores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.artist ? ` · ${s.artist}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleRefresh}
              disabled={loadingScores}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-600 hover:bg-zinc-200'
              }`}
              title="重新拉取后端已发布曲目与小节"
            >
              {loadingScores ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
            </button>
            {activeChordName && (
              <button
                onClick={() => setShowChordDiagram((v) => !v)}
                className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg border transition-colors ${
                  showChordDiagram
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/15'
                }`}
                title="点击查看/隐藏当前小节和弦指法图"
              >
                和弦 {activeChordName}
              </button>
            )}
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

          {/* 小节栏目列表：一个小节一个栏目，纵向自动衔接 */}
          {loadingMeasures ? (
            <div className={`h-[120px] flex items-center justify-center text-xs ${subText}`}>
              <Loader2 size={16} className="animate-spin mr-2" />
              正在加载小节六线谱数据...
            </div>
          ) : measures.length > 0 ? (
            <div className="relative">
              {/* 全局滚动条宽 5px（见 index.css ::-webkit-scrollbar），
                  用 -mr-[5px] 抵消它的占位，保证小节卡片与上方「和弦库」卡片同宽 */}
              <div
                ref={listRef}
                className="space-y-2.5 max-h-[440px] overflow-y-auto custom-scrollbar -mr-[5px]"
              >
                {measures.map((m, idx) => renderMeasureRow(m, idx))}
              </div>

              {/* 播放状态提示（非控制按钮） */}
              <div className={`mt-2 text-[10px] flex items-center gap-2 ${subText}`}>
                <Music2 size={10} className="shrink-0" />
                {isPlaying ? (
                  <span className="text-emerald-400 font-medium">
                    <Play size={9} className="inline -mt-0.5 mr-0.5" />
                    正在播放 · {activeMeasure?.label} · {currentTime.toFixed(2)}s /{' '}
                    {(activeMeasure?.duration ?? 0).toFixed(2)}s
                  </span>
                ) : (
                  <span>点击底部 PLAY 开始逐小节练习（小节播完自动衔接下一小节）</span>
                )}
                {activeChordName && (
                  <span className="ml-auto font-mono text-emerald-400">
                    当前和弦 {activeChordName}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`h-[100px] flex flex-col items-center justify-center text-[11px] gap-1 ${subText}`}
            >
              <span>暂无云端小节数据</span>
              <span className="opacity-70">
                请在 guitarmate-studio-cms 中完成转录标注后「发布小节至后端」
              </span>
            </div>
          )}
        </div>
      )}

      {/* 当前和弦指法图（按需展开，不占用谱面空间） */}
      {isOpen && activeChordName && showChordDiagram && (
        <div
          className={`absolute right-1 z-40 rounded-xl border backdrop-blur-md ${
            isDark
              ? 'bg-zinc-950/95 border-emerald-500/40'
              : 'bg-white/95 border-emerald-500/50 shadow-md'
          }`}
          style={{ bottom: 10, transform: 'scale(0.8)', transformOrigin: 'bottom right' }}
        >
          <ChordDiagram
            chordName={activeChordName}
            size="sm"
            showPlayButton={false}
            hideHint
          />
        </div>
      )}
    </div>
  );
};

export default MeasurePracticePanel;
