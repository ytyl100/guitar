import { Image, Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPracticePackage, type LibraryItem, getPublishedLibrary } from '../../services/api';
import BottomNav from '../../components/BottomNav';
import { pageClass } from '../../utils/settings';
import {
  collectEvalNotes,
  scorePlayAlong,
  type EvalNote,
  type PitchFrame,
  type PlayAlongScore,
  VERDICT_LABEL,
} from '../../utils/playAlongScore';
import { splitSegments, type PracticeMeasure, type PracticePackage } from '../../utils/practice';
import {
  useMicPitch,
  type MicPitchFrame,
  type TunerStringDef,
} from '../../hooks/useMicPitch';

/**
 * AI 跟弹评测（新功能，Web 版没有对应页面）
 * ==========================================
 *
 * ## 它到底做了什么（不含糊其辞）
 *
 * 1. 播放**该段落的后端切片音频**（学员跟着弹）；
 * 2. 同时开麦克风，逐帧做 YIN 音高检测（**在端上算，不上传音频**，见 `utils/pitchDetect.ts`）；
 * 3. 把每一帧和谱面音符按时间窗对齐（`utils/playAlongScore.ts`，纯函数、可回归）；
 * 4. 给出逐音判定 + 命中率 / 覆盖率 / 平均音分偏差。
 *
 * ## 为什么不做成"打分 0-100"
 *
 * 命中率、覆盖率、平均偏差三个数**都能追溯到具体哪几个音**（界面上逐音上色），
 * 而 0-100 的"分数"是编出来的权重；学员更需要知道"第 3 小节那个 D 我低了 30 音分"。
 *
 * ## 平台限制（界面里也写出来，不藏）
 *
 * - **H5 预览里没有 PCM 分帧录音**（浏览器 MediaRecorder 拿不到原始波形）→ 明确提示去真机；
 * - 真机上麦克风与播放同时进行时，外放的声音可能被麦克风拾到 → 建议**戴耳机/减小音量**。
 */

/** 评测用标准调弦（6→1 弦），仅为显示/匹配最近弦 */
const STANDARD_TUNING: TunerStringDef[] = [
  { stringNumber: 6, noteName: 'E', octave: 2, targetFreq: 82.41 },
  { stringNumber: 5, noteName: 'A', octave: 2, targetFreq: 110 },
  { stringNumber: 4, noteName: 'D', octave: 3, targetFreq: 146.83 },
  { stringNumber: 3, noteName: 'G', octave: 3, targetFreq: 196 },
  { stringNumber: 2, noteName: 'B', octave: 3, targetFreq: 246.94 },
  { stringNumber: 1, noteName: 'E', octave: 4, targetFreq: 329.63 },
];

/** 空弦 MIDI（6→1 弦） */
const TUNING_MIDI = [40, 45, 50, 55, 59, 64];

function decodeParam(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function measureLabel(measure: PracticeMeasure): string {
  return `第 ${measure.index} 小节`;
}

export default function AiEval() {
  const [songId, setSongId] = useState('');
  const [title, setTitle] = useState('');
  const [pkg, setPkg] = useState<PracticePackage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  /** 段落下标（按「每段 2 小节」切，与练习面板默认一致） */
  const [slot, setSlot] = useState(0);
  const [score, setScore] = useState<PlayAlongScore | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  /** 帧缓存：评测期间累积，结束后一次性喂给判定函数 */
  const framesRef = useRef<PitchFrame[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 复用的音频上下文（⚠️ 必须复用：换 src 而不是重建，否则 iOS 上第二段就哑了） */
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);
  const queueRef = useRef<string[]>([]);

  const { supported, listening, start: startMic, stop: stopMic, error: micError } = useMicPitch(
    STANDARD_TUNING,
    {
      onFrame: useCallback((frame: MicPitchFrame) => {
        if (!startedAtRef.current) return;
        framesRef.current.push({ tSec: (frame.at - startedAtRef.current) / 1000, freq: frame.freq });
      }, []),
    },
  );

  useLoad((options: Record<string, string>) => {
    setSongId(decodeParam(options.id));
    setTitle(decodeParam(options.title));
    const s = Number(decodeParam(options.slot));
    if (Number.isFinite(s) && s > 0) setSlot(Math.floor(s));
    Taro.setNavigationBarTitle({ title: 'AI 跟弹评测' });
  });

  const load = useCallback(async (id: string) => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchPracticePackage(id);
      setPkg(data);
      setStatus('ready');
      /** 歌名兜底：从曲库里补（有些入口只传了 id） */
      if (!title) {
        try {
          const items: LibraryItem[] = await getPublishedLibrary();
          const hit = items.find((it) => it.id === id);
          if (hit) setTitle(hit.title);
        } catch {
          /* 只是标题，取不到就算了 */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [title]);

  useEffect(() => {
    if (songId) void load(songId);
  }, [songId, load]);

  /** 段落（每段 2 小节，与练习面板默认一致） */
  const segments = useMemo(
    () => (pkg ? splitSegments(pkg.measures || [], 2) : []),
    [pkg],
  );
  const segment = segments[Math.min(slot, Math.max(0, segments.length - 1))] || null;

  const trackIndex = useMemo(
    () => (pkg ? Math.max(0, pkg.tracks.findIndex((t) => String(t.instrument || '').includes('guitar'))) : 0),
    [pkg],
  );

  /**
   * 该段待评分的音符。时间轴换算：段内第 0 秒 = 段首小节的绝对起点。
   * `scorePlayAlong` 只认相对时间，所以这里统一减掉段首。
   */
  const evalNotes: EvalNote[] = useMemo(() => {
    if (!segment) return [];
    const base = Number(segment.measures[0]?.startTime) || 0;
    return collectEvalNotes(segment.measures, trackIndex, {
      tuning: TUNING_MIDI,
      capo: Number(pkg?.score?.capo) || 0,
    }).map((n) => ({ ...n, startSec: n.startSec - base, endSec: n.endSec - base }));
  }, [segment, trackIndex, pkg]);

  /** 该段的参考音频（逐小节切片，按顺序播一次） */
  const segmentAudio = useMemo(() => {
    if (!segment) return [];
    return segment.measures
      .map((m) => {
        const track = m.trackData?.[trackIndex] ?? m.trackData?.[0];
        return track?.audioUrl || '';
      })
      .filter(Boolean);
  }, [segment, trackIndex]);

  /** 清场：停麦克风、停音频、清定时器（切段/卸载/重测都要走） */
  const teardown = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    stopMic();
    try {
      audioRef.current?.stop();
    } catch {
      /* 没在播时会抛，忽略 */
    }
    setRunning(false);
  }, [stopMic]);

  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    try {
      audioRef.current?.stop();
      audioRef.current?.destroy();
    } catch {
      /* ignore */
    }
  }, []);

  /** 依次播放本段切片（复用同一个 InnerAudioContext） */
  const playQueue = useCallback((urls: string[]) => {
    if (!urls.length) return;
    let ctx = audioRef.current;
    if (!ctx) {
      ctx = Taro.createInnerAudioContext();
      /** 与练习面板同一处理：iOS 静音键下也要出声 */
      ctx.obeyMuteSwitch = false;
      audioRef.current = ctx;
    }
    queueRef.current = [...urls];
    const next = () => {
      const url = queueRef.current.shift();
      if (!url) return;
      ctx!.src = url;
      ctx!.play();
    };
    ctx.offEnded?.(next as never);
    ctx.onEnded(() => {
      if (queueRef.current.length) next();
      else teardown();
    });
    ctx.onError(() => {
      setNotice('参考音频播放失败（后端切片不可达？），本次评测的时间轴会不准。');
      teardown();
    });
    next();
  }, [teardown]);

  const begin = useCallback(async () => {
    if (!supported) {
      setNotice('当前运行环境不支持 PCM 分帧录音（浏览器端拿不到原始波形），请在微信开发者工具或真机上做评测。');
      return;
    }
    if (!segment || !evalNotes.length) {
      setNotice('这一段没有可评分的音符。');
      return;
    }
    if (!segmentAudio.length) {
      setNotice('这一段没有可播放的参考音频（后端还没发布该小节的切片），无法做跟弹评测。');
      return;
    }
    setNotice('');
    setScore(null);
    framesRef.current = [];
    startedAtRef.current = Date.now();
    setRunning(true);
    await startMic();
    playQueue(segmentAudio);
    /** 兜底：切片播放异常时也要收尾（段长 + 2s） */
    const total = segment.measures.reduce((sum, m) => sum + (Number(m.duration) || 0), 0);
    stopTimerRef.current = setTimeout(() => teardown(), Math.round((total + 2) * 1000));
  }, [supported, segment, evalNotes, segmentAudio, startMic, playQueue, teardown]);

  /** 手动停止 → 用已收集的帧立即出结果 */
  const finish = useCallback(() => {
    teardown();
    setScore(scorePlayAlong(evalNotes, framesRef.current));
  }, [evalNotes, teardown]);

  const verdictCounts = useMemo(() => {
    if (!score) return [] as Array<{ label: string; color: string; count: number }>;
    const tally = new Map<string, { label: string; color: string; count: number }>();
    for (const item of score.notes) {
      const meta = VERDICT_LABEL[item.verdict];
      const prev = tally.get(item.verdict) || { label: meta.text, color: meta.color, count: 0 };
      prev.count += 1;
      tally.set(item.verdict, prev);
    }
    return Array.from(tally.values());
  }, [score]);

  const scoreByNoteId = useMemo(() => {
    const map = new Map<string, PlayAlongScore['notes'][number]>();
    score?.notes.forEach((n) => map.set(n.note.id, n));
    return map;
  }, [score]);

  return (
    <View className={pageClass()}>
      <View className="gm-eval-head">
        <View style="min-width:0;flex:1">
          <Text className="gm-learn-title">AI 跟弹评测</Text>
          <Text className="gm-meta" style="display:block;margin-top:4px">
            {title || songId || '—'} · 端上音高检测（不上传录音）
          </Text>
        </View>
      </View>

      {status === 'loading' && (
        <View className="gm-learn-state">
          <Text className="gm-meta">正在读取曲目数据…</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="gm-learn-error">
          <Text>⚠ {error}</Text>
          <View className="gm-learn-retry" onClick={() => songId && void load(songId)}>
            <Text>重试</Text>
          </View>
        </View>
      )}

      {status === 'ready' && (
        <View>
          {/** 段落选择：与练习面板同一切段规则，保证"评的就是练的那段" */}
          <View className="gm-learn-filter">
            {(segments || []).map((s) => (
              <Text
                key={s.from}
                className={`gm-learn-chip${s.from === segment?.from ? ' gm-learn-chip--on' : ''}`}
                onClick={() => {
                  if (running) return;
                  setSlot(s.slot);
                  setScore(null);
                  setNotice('');
                }}
              >
                {s.label}
              </Text>
            ))}
          </View>

          <View className="gm-eval-card">
            <Text className="gm-eval-title">怎么评的</Text>
            <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.6">
              点「开始评测」后，先播这一段的参考音频，同时用麦克风逐帧识别你弹的音高；
              每个音符和谱面按时间窗对齐，音分偏差在 ±25 音分内算「准确」，超出算偏低/偏高，
              音高完全对不上算「弹错音」，窗口内没听到声音算「没弹」（不计入命中率分母）。
            </Text>
            <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.6;opacity:0.8">
              建议戴耳机或把音量调小：外放的声音可能被麦克风拾到，那样评的不是你弹的琴。
            </Text>
          </View>

          {!supported && (
            <View className="gm-learn-error">
              <Text>
                ⚠ 此环境不支持 PCM 分帧录音（浏览器端拿不到原始波形），评测请到微信开发者工具或真机上做。
              </Text>
            </View>
          )}

          <View className="gm-eval-actions">
            {!running ? (
              <View className="gm-eval-btn" onClick={() => void begin()}>
                <Text>▶ 开始评测（{evalNotes.length} 个音）</Text>
              </View>
            ) : (
              <View className="gm-eval-btn gm-eval-btn--stop" onClick={finish}>
                <Text>⏹ 停止并出结果</Text>
              </View>
            )}
            {!!notice && (
              <Text className="gm-meta" style="display:block;margin-top:12px;color:#fbbf24">
                {notice}
              </Text>
            )}
            {!!micError && (
              <Text className="gm-meta" style="display:block;margin-top:12px;color:#f87171">
                {micError}
              </Text>
            )}
            {listening && (
              <Text className="gm-meta" style="display:block;margin-top:12px;color:#34d399">
                🎤 正在听你弹…（已采集 {framesRef.current.length} 帧）
              </Text>
            )}
          </View>

          {score && (
            <View className="gm-eval-card">
              <Text className="gm-eval-title">本次结果</Text>
              <View className="gm-eval-metrics">
                <View className="gm-eval-metric">
                  <Text className="gm-eval-metric-value" style="color:#10b981">
                    {Math.round(score.hitRate * 100)}%
                  </Text>
                  <Text className="gm-meta">
                    命中 {score.hit}/{score.graded}
                  </Text>
                </View>
                <View className="gm-eval-metric">
                  <Text className="gm-eval-metric-value">
                    {Math.round(score.coverage * 100)}%
                  </Text>
                  <Text className="gm-meta">弹出声占比</Text>
                </View>
                <View className="gm-eval-metric">
                  <Text className="gm-eval-metric-value">{score.avgAbsCents}</Text>
                  <Text className="gm-meta">平均音分偏差</Text>
                </View>
              </View>
              <View className="gm-eval-legend">
                {verdictCounts.map((v) => (
                  <Text key={v.label} className="gm-eval-legend-item" style={`color:${v.color}`}>
                    {v.label} {v.count}
                  </Text>
                ))}
              </View>
              {score.silent > 0 && (
                <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.6">
                  有 {score.silent} 个音没听到声音：可能是漏弹、也可能是麦克风太远。命中率只按「听到了声音的{' '}
                  {score.graded} 个音」计算。
                </Text>
              )}
            </View>
          )}

          {/** 逐音结果：按小节列出，评过的上色（没有结果的显示中性色） */}
          {(segment?.measures || []).map((measure) => {
            const notes = evalNotes.filter(
              (n) =>
                n.startSec >= (Number(measure.startTime) || 0) - (Number(segment?.measures[0]?.startTime) || 0) - 0.001 &&
                n.startSec <
                  (Number(measure.startTime) || 0) +
                    (Number(measure.duration) || 0) -
                    (Number(segment?.measures[0]?.startTime) || 0),
            );
            if (!notes.length) return null;
            return (
              <View key={measure.index} className="gm-eval-card">
                <Text className="gm-eval-title">{measureLabel(measure)}</Text>
                <View className="gm-eval-note-list">
                  {notes.map((n) => {
                    const result = scoreByNoteId.get(n.id);
                    const meta = result ? VERDICT_LABEL[result.verdict] : null;
                    return (
                      <View
                        key={n.id}
                        className="gm-eval-note"
                        style={meta ? `border-color:${meta.color};color:${meta.color}` : ''}
                      >
                        <Text className="gm-eval-note-text">
                          {n.string} 弦 {n.fret} 品 · {n.startSec.toFixed(2)}s
                        </Text>
                        <Text className="gm-eval-note-verdict">
                          {result
                            ? `${VERDICT_LABEL[result.verdict].text}${
                                typeof result.cents === 'number' ? ` ${result.cents > 0 ? '+' : ''}${result.cents}¢` : ''
                              }`
                            : '待评'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <BottomNav active="learn" />
    </View>
  );
}
