import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  FileJson,
  Loader2,
  Music4,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Smartphone,
  Rows3,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ApiTabProject,
  type ApiTranscriptionProjectDetail,
  type ApiTranscriptionPublishResult,
} from '../../services/api';
import { StandardTabSystemRenderer } from './StandardTabSystemRenderer';
import { buildStandardTabSystemLayout, MINI_TAB_METRICS } from './standardTabLayout';
import {
  DEFAULT_REVIEW_META,
  tabProjectToReviewMeasures,
  positionLabel,
  type ReviewMeasure,
} from './reviewTypes';
import { NoteAddDialog } from '../studios/tablature/NoteAddDialog';
import { instrumentLabel } from '../../utils/instrumentLabels';
import { useMultiTrackPlayer } from '../../hooks/useMultiTrackPlayer';
import { useTabAutoScroll } from '../../hooks/useTabAutoScroll';

/**
 * 曲目预览页（SongPreviewPanel）
 * ============================
 *
 * 需求 3：校正完成 → **这首歌自己的**预览页面（不再是侧边栏里的全局样例）。
 *
 * ### 与「六线谱排版预览」的区别
 *
 * | | 排版预览（侧边栏） | 本页 |
 * |---|---|---|
 * | 数据 | 卡农样例（内置） | 当前项目真实 TabProject |
 * | 音频 | 无 | 源音频 / 分轨，与谱面同步 |
 * | 目的 | 排版规则自检 | **发布前验收**：与小程序看到的界面一致 |
 *
 * ### 「和小程序一致」是怎么保证的
 *
 * 小程序 `PracticeMeasure` 用的就是 `buildStandardTabLayout` + `MINI_TAB_METRICS`，
 * 本页把同一套引擎 + 同一套 metrics 交给 `StandardTabSystemRenderer`（单小节），
 * 因此谱面像素级相同；差别只在小程序把每小节的切片音频拼起来播，
 * 而预览期还没切片，所以用**源音频**当时钟、按小节归属滚动。
 */

/** 小程序谱面尺寸（与 `PracticeMeasure` 的 SVG_WIDTH / SVG_HEIGHT 常量一致） */
const MINI_SVG_WIDTH = 600;
const MINI_SVG_HEIGHT = 142;

export interface SongPreviewPanelProps {
  projectId: string;
  darkMode: boolean;
  /** 发现问题 → 回到校正工作台 */
  onBackToEdit: (projectId: string) => void;
  /** 生成数据契约 → 契约核准与发布页 */
  onOpenContract: (projectId: string) => void;
  /** 发布成功（父级负责写入音乐库 / 提示） */
  onPublished?: (result: ApiTranscriptionPublishResult, title: string) => void;
}

export const SongPreviewPanel: React.FC<SongPreviewPanelProps> = ({
  projectId,
  darkMode,
  onBackToEdit,
  onOpenContract,
  onPublished,
}) => {
  const [detail, setDetail] = useState<ApiTranscriptionProjectDetail | null>(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);
  /** true = 小程序单小节视图（默认）；false = 段落视图（便于发现问题） */
  const [miniView, setMiniView] = useState(true);
  const [publishResult, setPublishResult] = useState<ApiTranscriptionPublishResult | null>(null);
  const [isRefillOpen, setIsRefillOpen] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const peaksCacheRef = useRef<Map<string, number[]>>(new Map());

  const notify = (kind: 'info' | 'error' | 'success', text: string) => {
    setMessage({ kind, text });
    if (kind !== 'error') setTimeout(() => setMessage(null), 6000);
  };

  // ── 加载项目 ──
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [detailRes, audioRes] = await Promise.all([
          api.getTranscriptionProject(projectId),
          api.getTranscriptionAudioUrl(projectId).catch(() => ({} as { audioUrl?: string; url?: string })),
        ]);
        if (cancelled) return;
        setDetail(detailRes.project);
        setSourceAudioUrl(audioRes.audioUrl || audioRes.url || '');
      } catch (err) {
        if (!cancelled) notify('error', `加载项目失败：${err instanceof ApiError ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const draft: ApiTabProject | null = detail?.tabProject || null;
  const measures: ReviewMeasure[] = useMemo(() => tabProjectToReviewMeasures(draft), [draft]);
  const tuning = draft?.tuning || DEFAULT_REVIEW_META.tuning;
  const bpm = draft?.meta?.bpm || DEFAULT_REVIEW_META.bpm;
  const timeSignature = draft?.meta?.timeSignature || DEFAULT_REVIEW_META.timeSignature;
  const capo = draft?.capo || 0;

  // ── 播放器：预览期只用源音频（切片要等发布） ──
  /** 音轨清单：源音频优先；源音频不可达时退回分轨（模拟转录时分轨就是源文件） */
  const playerSources = useMemo(() => {
    const list: Array<{ id: string; label: string; url: string; role: 'original' | 'stem' }> = [];
    if (sourceAudioUrl) {
      list.push({ id: 'original', label: '原声（全轨）', url: sourceAudioUrl, role: 'original' });
    }
    for (const track of detail?.tracks || []) {
      if (!track.stemUrl) continue;
      if (track.stemUrl === sourceAudioUrl) continue;
      list.push({
        id: `stem:${track.instrument}`,
        label: `${instrumentLabel(track.instrument)}分轨`,
        url: track.stemUrl,
        role: 'stem',
      });
    }
    /** 兜底：源音频拿不到但分轨可达（模拟转录常见），至少能听一条 */
    if (list.length === 0) {
      const first = (detail?.tracks || []).find((t) => !!t.stemUrl);
      if (first?.stemUrl) {
        list.push({
          id: `stem:${first.instrument}`,
          label: `${instrumentLabel(first.instrument)}（源音频）`,
          url: first.stemUrl,
          role: 'original',
        });
      }
    }
    return list;
  }, [detail?.tracks, sourceAudioUrl]);

  const playerSourcesCount = playerSources.length;

  const player = useMultiTrackPlayer(playerSources, { timeUpdateIntervalMs: 50 });

  const [activeMeasureIndex, setActiveMeasureIndex] = useState(-1);
  useEffect(() => {
    const t = player.currentTimeSec;
    const idx = measures.findIndex((m) => t >= m.startTime - 1e-6 && t < m.endTime + 1e-6);
    setActiveMeasureIndex((prev) => (prev === idx ? prev : idx));
  }, [player.currentTimeSec, measures]);

  const { containerRef, registerItem } = useTabAutoScroll(activeMeasureIndex, player.isPlaying);
  const activeMeasure = activeMeasureIndex >= 0 ? measures[activeMeasureIndex] : undefined;

  // ── 波形 ──
  useEffect(() => {
    if (!sourceAudioUrl) return;
    const cached = peaksCacheRef.current.get(sourceAudioUrl);
    if (cached) {
      setWaveformPeaks(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(sourceAudioUrl);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const { peaks } = await audioEngineExtract(buf);
        if (!cancelled) {
          peaksCacheRef.current.set(sourceAudioUrl, peaks);
          setWaveformPeaks(peaks);
        }
      } catch {
        /* 波形拿不到不影响预览 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceAudioUrl]);

  /**
   * 播放头 / 谱内进度条 / 当前音符高亮全部交给 `StandardTabSystemRenderer`
   * 的内置实现（传 `playheadTimeSec`），因此预览页与小程序用的是**同一段绘制逻辑**，
   * 不再在这里重复算一遍坐标。
   */

  /** 段落视图：每行 2 小节 */
  const systems = useMemo(() => {
    const out: ReviewMeasure[][] = [];
    for (let i = 0; i < measures.length; i += 2) out.push(measures.slice(i, i + 2));
    return out;
  }, [measures]);

  const handlePublish = async () => {
    if (!projectId) return;
    setBusy('publish');
    try {
      const res = await api.publishTranscriptionProject(projectId, {
        publishedBy: 'cms',
        audioFallback: 'source',
        allowMissingAudio: true,
        mirrorToScorePipeline: true,
      });
      setPublishResult(res);
      notify(
        'success',
        `已发布 PracticePackage r${res.revision}：${res.stats.measureCount} 小节 / ${res.stats.noteCount} 音符` +
          (res.mirrored?.scoreId ? `（已镜像到音乐库 scoreId=${res.mirrored.scoreId}）` : ''),
      );
      onPublished?.(res, detail?.title || '未命名曲目');
    } catch (err) {
      notify('error', `发布失败：${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  };

  const surface = darkMode ? 'bg-slate-900/60 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  const field = darkMode ? 'bg-slate-950/70 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800';
  const dim = 'text-slate-500';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin mr-2" /> 正在加载曲目预览…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── 顶部：返回 / 标题 / 视图切换 / 契约 / 发布 ── */}
      <div className={`shrink-0 border-b px-5 py-3 ${surface}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onBackToEdit(projectId)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${field}`}
              title="回到校正工作台继续修改"
            >
              <ArrowLeft size={12} /> 返回编辑
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="text-amber-400" />
                <span className="text-sm font-semibold truncate">{detail?.title || '曲目预览'}</span>
                {detail?.latestRevision ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    已发布 r{detail.latestRevision}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                    未发布
                  </span>
                )}
              </div>
              <div className={`mt-0.5 text-[11px] ${dim}`}>
                {measures.length} 小节 · ♩={bpm} · {timeSignature}
                {capo > 0 ? ` · 变调夹 ${capo} 品` : ''}
                {detail?.tracks?.length ? ` · ${detail.tracks.map((t) => instrumentLabel(t.instrument)).join(' / ')}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setMiniView((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${field}`}
              title="小程序单小节视图 ↔ 段落视图（每行 2 小节）"
            >
              {miniView ? <Rows3 size={12} /> : <Smartphone size={12} />}
              {miniView ? '切到段落视图' : '切到小程序视图'}
            </button>
            <button
              type="button"
              onClick={() => onOpenContract(projectId)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${field}`}
            >
              <FileJson size={12} /> 生成数据契约
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy === 'publish' || !draft}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
            >
              {busy === 'publish' ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
              发布到小程序
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
              message.kind === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* ── 谱面 ── */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {measures.length === 0 && (
          <div className={`rounded-xl border px-4 py-3 text-[11px] ${surface}`}>
            该项目还没有可预览的六线谱（流水线可能尚未跑完）。
          </div>
        )}

        {miniView
          ? measures.map((measure, index) => {
              const isActive = index === activeMeasureIndex;
              return (
                <section
                  key={`${measure.index}-${measure.displayIndex}`}
                  ref={(el) => registerItem(index, el)}
                  className={`rounded-2xl border p-3 transition-shadow ${surface} ${
                    isActive ? 'ring-2 ring-emerald-500/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <Music4 size={12} className="text-amber-400" />
                      <span className="font-semibold">{measure.label}</span>
                      {typeof measure.position === 'number' && (
                        <span
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                          title={positionLabel(measure.position)}
                        >
                          {measure.position} 把位
                        </span>
                      )}
                      {measure.chord && (
                        <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                          {measure.chord}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono ${dim}`}>
                      {measure.startTime.toFixed(2)}s–{measure.endTime.toFixed(2)}s
                    </span>
                  </div>

                  {/* 小程序同款谱面（600×142 / MINI_TAB_METRICS）
                      + 谱内进度条 + 播放头 + 当前音符高亮（由渲染器统一负责） */}
                  <div className="relative" style={{ width: MINI_SVG_WIDTH, maxWidth: '100%' }}>
                    <StandardTabSystemRenderer
                      measures={[
                        {
                          index: measure.displayIndex,
                          label: measure.label,
                          /** 整曲时间轴起点：播放头靠它定位 */
                          startTime: measure.startTime,
                          notes: measure.notes,
                          chords: measure.chords,
                          chord: measure.chord,
                          position: measure.position,
                          duration: measure.duration,
                        },
                      ]}
                      bpm={bpm}
                      timeSignature={timeSignature}
                      tuning={tuning}
                      capo={capo}
                      measureDuration={measure.duration}
                      width={MINI_SVG_WIDTH}
                      minWidth={MINI_SVG_WIDTH}
                      height={MINI_SVG_HEIGHT}
                      isDark={darkMode}
                      showClef
                      showTempo={index === 0}
                      noteLabel="fret"
                      showConfidence={false}
                      showStats={false}
                      playheadTimeSec={player.currentTimeSec}
                      metrics={MINI_TAB_METRICS}
                    />
                  </div>
                </section>
              );
            })
          : systems.map((group, si) => {
              const first = group[0];
              const last = group[group.length - 1];
              const isActive = activeMeasureIndex >= first.index && activeMeasureIndex <= last.index;
              return (
                <section
                  key={`sys-${first.index}`}
                  ref={(el) => registerItem(first.index, el)}
                  className={`rounded-2xl border p-3 transition-shadow ${surface} ${
                    isActive ? 'ring-2 ring-emerald-500/60' : ''
                  }`}
                >
                  <div className={`mb-2 text-[11px] ${dim}`}>
                    编辑段落 {si + 1} · 第 {first.displayIndex}–{last.displayIndex} 小节
                  </div>
                  <StandardTabSystemRenderer
                    measures={group.map((m) => ({
                      index: m.displayIndex,
                      label: m.label,
                      startTime: m.startTime,
                      notes: m.notes,
                      chords: m.chords,
                      chord: m.chord,
                      position: m.position,
                      duration: m.duration,
                    }))}
                    bpm={bpm}
                    timeSignature={timeSignature}
                    tuning={tuning}
                    capo={capo}
                    measureDuration={first.duration}
                    isDark={darkMode}
                    showClef
                    showTempo={si === 0}
                    isLastSystem={si === systems.length - 1}
                    noteLabel="fret"
                    showConfidence={false}
                    showStats={false}
                    playheadTimeSec={player.currentTimeSec}
                  />
                </section>
              );
            })}
      </div>

      {/* ── 底部：播放 + 进度条（确保音频与谱面行进一致） ── */}
      <div className={`shrink-0 border-t px-5 py-3 ${surface}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={player.toggle}
            disabled={playerSourcesCount === 0}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
            title={
              playerSourcesCount === 0
                ? '该项目没有可播放的音轨'
                : player.isPlaying
                  ? '暂停'
                  : '播放'
            }
          >
            {player.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={player.reset}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${field}`}
            title="回到开头"
          >
            <RotateCcw size={13} />
          </button>

          <span className="text-[11px] font-mono text-slate-400 w-24 shrink-0">
            {player.currentTimeSec.toFixed(2)} / {(player.durationSec || detail?.durationSec || 0).toFixed(2)}s
          </span>

          <input
            type="range"
            min={0}
            max={Math.max(0.1, player.durationSec || detail?.durationSec || 1)}
            step={0.01}
            value={Math.min(player.currentTimeSec, player.durationSec || detail?.durationSec || 1)}
            onChange={(e) => player.seek(Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />

          <span className={`text-[11px] w-24 text-right shrink-0 ${dim}`}>
            {activeMeasure ? `第 ${activeMeasure.displayIndex} 小节` : '—'}
          </span>
        </div>

        {waveformPeaks.length > 0 && (
          <div className="mt-2 flex h-6 items-center gap-[2px]">
            {waveformPeaks.map((peak, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${
                  (i / waveformPeaks.length) * (player.durationSec || 1) <= player.currentTimeSec
                    ? 'bg-amber-400'
                    : darkMode
                      ? 'bg-slate-700'
                      : 'bg-slate-300'
                }`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            ))}
          </div>
        )}

        {publishResult && (
          <div className="mt-2 text-[11px] text-emerald-300">
            已发布 r{publishResult.revision} · {publishResult.stats.measureCount} 小节 /{' '}
            {publishResult.stats.noteCount} 音符
            {publishResult.mirrored?.scoreId ? ` · 已进入音乐库（${publishResult.mirrored.scoreId}）` : ''}
          </div>
        )}
      </div>

      {/* 预览期也能快速补音（复用同一个新增节点弹窗） */}
      <NoteAddDialog
        isOpen={isRefillOpen}
        onClose={() => setIsRefillOpen(false)}
        onSubmit={() => setIsRefillOpen(false)}
        isDark={darkMode}
        atSec={player.currentTimeSec}
        relativeSec={activeMeasure ? Math.max(0, player.currentTimeSec - activeMeasure.startTime) : 0}
        measureLabel={activeMeasure ? `第 ${activeMeasure.displayIndex} 小节` : undefined}
        beatSec={60 / (bpm > 0 ? bpm : 90)}
        tuning={tuning}
        capo={capo}
        defaultPosition={activeMeasure?.position ?? 1}
      />
    </div>
  );
};

/** 波形提取的薄封装：延迟引入 audioEngine，避免预览页首屏加载 Web Audio 逻辑 */
async function audioEngineExtract(buffer: ArrayBuffer): Promise<{ peaks: number[] }> {
  const mod = await import('../../utils/audioEngine');
  const result = await mod.audioEngine.extractWaveformPeaks(buffer, 128);
  return { peaks: result.peaks };
}

export default SongPreviewPanel;
