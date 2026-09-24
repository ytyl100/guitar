import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 多音轨播放器（useMultiTrackPlayer）
 * ==================================
 *
 * 六线谱校正时「对照音频」需要的播放能力：**原声 + 各条分轨**（吉他 / 贝斯 / 鼓 /
 * 电子琴 / 其它 / 人声）可以单选、多选、独奏（solo）、单独调音量。
 *
 * ### 为什么用多个 `<audio>` 而不是 Web Audio 的 `AudioBufferSourceNode`？
 *
 * 1. **零 CORS 风险**：`MediaElementAudioSourceNode` 遇到跨域且未带 CORS 头的音频会
 *    **静默变成静音**（后端 `uploads/` 与 CMS 不同源），排查成本极高；
 * 2. **零解码成本**：分轨是 WAV，动辄几十 MB，`decodeAudioData` 会卡住主线程；
 * 3. **同步够用**：以**第一轨为主时钟**，其余轨偏离 >120ms 时校正一次，肉眼与听感都无感。
 *
 * ### 与产品约定的降级
 *
 * 后端 Demucs 不可用时只会有 1 条 `guitar` 分轨 → 调用方应传入
 * 「原声 / 伴奏」两条来源（`role: 'original' | 'accompaniment'`），本 hook 不关心语义。
 */

export interface MultiTrackSource {
  id: string;
  /** 界面上的名称（吉他 / 贝斯 / 鼓 / 原声 …） */
  label: string;
  url: string;
  /** 语义标签：原声全轨 / 分轨 / 伴奏（原声降级） */
  role?: 'original' | 'stem' | 'accompaniment';
  /** 分轨对应的乐器（guitar / bass / drums / piano / vocals / other） */
  instrument?: string;
  /** 是否可单独选中（false = 仅作参考，不出声） */
  selectable?: boolean;
}

export interface UseMultiTrackPlayerResult {
  /** 当前时间（秒），播放中按帧刷新 */
  currentTimeSec: number;
  /** 主轨时长（秒） */
  durationSec: number;
  isPlaying: boolean;
  /** 主轨元数据已就绪 */
  ready: boolean;
  loading: boolean;
  /** 不可达 / 播放失败的可读错误（用于提示「该分轨试听不了，但谱面仍可编辑」） */
  error: string | null;
  /** 各轨音量 0-1 */
  volumes: Record<string, number>;
  /** 各轨静音开关 */
  muted: Record<string, boolean>;
  /** 独奏轨 id（null = 不独奏） */
  soloId: string | null;
  /** 最终会出声的轨 id（已经过 solo / mute 计算） */
  audibleIds: string[];
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 跳转（所有轨一起跳，保持同步） */
  seek: (timeSec: number) => void;
  /** 归零并停止 */
  reset: () => void;
  setVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;
  setSolo: (id: string | null) => void;
  /** 只播放某一轨（其余静音）—— 等价于 solo */
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

/** 主轨与从轨允许的最大漂移（秒）；超过就校正一次 */
const DRIFT_TOLERANCE_SEC = 0.12;

export function useMultiTrackPlayer(
  sources: MultiTrackSource[],
  options: { loop?: boolean; timeUpdateIntervalMs?: number } = {},
): UseMultiTrackPlayerResult {
  /**
   * React 可见时间的推送节流（默认 50ms = 20Hz）。
   *
   * 为什么不是每帧都 `setState`？—— 播放头本身 60FPS 才顺滑，但**消费时间的父页面**
   * （校正工作台）每次重渲染都要 diff 几十条小节 SVG；实测 60Hz 推送会明显掉帧。
   * 因此：RAF 仍跑 60FPS（用于音轨漂移校正），只把「显示用时间」按 20Hz 推给 React，
   * 波形上的播放头步进约 1-2px，肉眼看不出差别。
   */
  const timeUpdateIntervalMs = options.timeUpdateIntervalMs ?? 50;
  const lastPushRef = useRef(0);
  const elementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const rafRef = useRef<number | null>(null);

  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [soloId, setSoloId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  /** 依赖键：id + url 变化才重建元素（数组字面量每次渲染都会变，不能直接当依赖） */
  const sourceKey = useMemo(
    () => sources.map((s) => `${s.id}>${s.url}`).join('|'),
    [sources],
  );

  const getElement = useCallback((id: string) => elementsRef.current.get(id) || null, []);

  /** 依据 solo / mute / volume 把状态刷到元素上 */
  const applyMix = useCallback((solo: string | null, muteMap: Record<string, boolean>, volumeMap: Record<string, number>) => {
    for (const [id, el] of elementsRef.current) {
      const audible = solo ? id === solo : !muteMap[id];
      el.muted = !audible;
      el.volume = Math.max(0, Math.min(1, volumeMap[id] ?? 1));
      el.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // ① 创建 / 更新音频元素（按 sourceKey，url 变了才重新加载）
  useEffect(() => {
    const map = elementsRef.current;
    const wanted = new Set(sources.map((s) => s.id));

    for (const [id, el] of [...map.entries()]) {
      if (!wanted.has(id)) {
        el.pause();
        el.removeAttribute('src');
        map.delete(id);
      }
    }

    for (const source of sources) {
      let el = map.get(source.id);
      if (!el) {
        el = new Audio();
        el.preload = 'auto';
        el.crossOrigin = null;
        map.set(source.id, el);
      }
      const current = el.getAttribute('src') || '';
      if (current !== source.url) {
        el.src = source.url;
        el.load();
      }
      el.loop = !!options.loop;
      el.playbackRate = playbackRate;
    }

    setError(null);
    setReady(false);
    setDurationSec(0);
    setLoading(sources.length > 0);

    const primary = sources[0] ? map.get(sources[0].id) : null;
    if (!primary) {
      setLoading(false);
      return;
    }

    const onLoaded = () => {
      setReady(true);
      setLoading(false);
      setDurationSec(Number.isFinite(primary.duration) ? primary.duration : 0);
    };
    const onError = () => {
      setLoading(false);
      setError(`音频加载失败：${sources[0].label} 不可达（谱面仍可编辑，可稍后重试）`);
    };
    const onEnded = () => {
      setIsPlaying(false);
    };

    primary.addEventListener('loadedmetadata', onLoaded);
    primary.addEventListener('error', onError);
    primary.addEventListener('ended', onEnded);
    if (primary.readyState >= 1) onLoaded();

    return () => {
      primary.removeEventListener('loadedmetadata', onLoaded);
      primary.removeEventListener('error', onError);
      primary.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, options.loop]);

  // ② 混音参数变化 → 刷到元素
  useEffect(() => {
    applyMix(soloId, muted, volumes);
  }, [applyMix, soloId, muted, volumes]);

  // ③ 播放循环（主轨驱动播放头 + 从轨漂移校正）
  const tick = useCallback(() => {
    const list = sources.map((s) => elementsRef.current.get(s.id)).filter(Boolean) as HTMLAudioElement[];
    const primary = list[0];
    if (primary) {
      const now = performance.now();
      if (now - lastPushRef.current >= timeUpdateIntervalMs) {
        lastPushRef.current = now;
        setCurrentTimeSec(primary.currentTime);
      }
      for (let i = 1; i < list.length; i += 1) {
        const el = list[i];
        if (Math.abs(el.currentTime - primary.currentTime) > DRIFT_TOLERANCE_SEC) {
          el.currentTime = primary.currentTime;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, timeUpdateIntervalMs]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    const list = sources.map((s) => elementsRef.current.get(s.id)).filter(Boolean) as HTMLAudioElement[];
    if (!list.length) return;
    const from = currentTimeSec;
    lastPushRef.current = 0;
    for (const el of list) {
      if (el.readyState >= 1) el.currentTime = from;
      el.playbackRate = playbackRate;
    }
    applyMix(soloId, muted, volumes);
    Promise.all(
      list.map((el) =>
        el.play().catch((err: unknown) => {
          setError(`播放失败：${err instanceof Error ? err.message : String(err)}`);
        }),
      ),
    ).then(() => setIsPlaying(true));
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  }, [applyMix, currentTimeSec, muted, playbackRate, soloId, sources, stopLoop, tick, volumes]);

  const pause = useCallback(() => {
    for (const el of elementsRef.current.values()) el.pause();
    stopLoop();
    setIsPlaying(false);
  }, [stopLoop]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const seek = useCallback((timeSec: number) => {
    const t = Math.max(0, timeSec);
    for (const el of elementsRef.current.values()) {
      if (el.readyState >= 1) el.currentTime = t;
    }
    setCurrentTimeSec(t);
  }, []);

  const reset = useCallback(() => {
    pause();
    seek(0);
  }, [pause, seek]);

  // 卸载时停止所有音轨
  useEffect(
    () => () => {
      for (const el of elementsRef.current.values()) {
        el.pause();
        el.removeAttribute('src');
      }
      elementsRef.current.clear();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const audibleIds = useMemo(
    () => sources.filter((s) => (soloId ? s.id === soloId : !muted[s.id])).map((s) => s.id),
    [muted, soloId, sources],
  );

  return {
    currentTimeSec,
    durationSec,
    isPlaying,
    ready,
    loading,
    error,
    volumes,
    muted,
    soloId,
    audibleIds,
    play,
    pause,
    toggle,
    seek,
    reset,
    setVolume: (id, volume) => setVolumes((prev) => ({ ...prev, [id]: Math.max(0, Math.min(1, volume)) })),
    toggleMute: (id) => setMuted((prev) => ({ ...prev, [id]: !prev[id] })),
    setSolo: (id) => setSoloId((prev) => (prev === id ? null : id)),
    playbackRate,
    setPlaybackRate: (rate) => setPlaybackRate(Math.max(0.25, Math.min(2, rate))),
  };
}

export default useMultiTrackPlayer;
