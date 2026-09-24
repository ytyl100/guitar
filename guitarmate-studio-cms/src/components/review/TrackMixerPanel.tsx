import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WaveformTimeline, type WaveformMarker } from '../studios/tablature/WaveformTimeline';
import type { MultiTrackSource, UseMultiTrackPlayerResult } from '../../hooks/useMultiTrackPlayer';

/**
 * 音轨与波形面板（TrackMixerPanel）
 * ================================
 *
 * 六线谱校正工作台的「对照音频」区（需求 2.1）：
 * **波形时间轴 + 播放控制 + 多音轨选择**，让管理员一边听一边改谱。
 *
 * - 音轨来源由后端决定：`GET /projects/:id/audio-url`（原声）+ `tracks[].stemUrl`（分轨）；
 * - Demucs 不可用时只有 1 条分轨 → 调用方传「原声 / 伴奏」两条，本组件无需特判；
 * - 谱面滚动由**父组件的 `useTabAutoScroll`** 负责（按小节归属滚动，不在这里做比例滚动）。
 */

export interface TrackMixerPanelProps {
  isDark?: boolean;
  /** 由父组件持有的播放器实例（父组件还需要它的 currentTimeSec 驱动谱面） */
  player: UseMultiTrackPlayerResult;
  sources: MultiTrackSource[];
  peaks: number[];
  durationSec: number;
  markers?: WaveformMarker[];
  onSeek: (timeSec: number) => void;
  onMarkerDrag?: (index: number, timeSec: number) => void;
  onMarkerDragEnd?: () => void;
  /** 当前所在小节文字（如「第 12 小节」） */
  activeMeasureLabel?: string;
  /** 提示信息（例如「模拟转录：只有 1 条吉他分轨」） */
  hint?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const TrackMixerPanel: React.FC<TrackMixerPanelProps> = ({
  isDark = true,
  player,
  sources,
  peaks,
  durationSec,
  markers = [],
  onSeek,
  onMarkerDrag,
  onMarkerDragEnd,
  activeMeasureLabel,
  hint,
  collapsed,
  onToggleCollapse,
}) => {
  const surface = isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200';
  const dim = isDark ? 'text-slate-500' : 'text-slate-500';
  const chip = (active: boolean) =>
    `rounded-md border px-2 py-0.5 text-[11px] transition ${
      active
        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
        : isDark
          ? 'border-slate-700 text-slate-400 hover:border-slate-500'
          : 'border-slate-300 text-slate-600 hover:border-slate-400'
    }`;

  return (
    <div className="space-y-2">
      {/*
        折叠头本身就是**最常用的一排控件**（播放/暂停 + 归零 + 时间），
        这样不展开也能听；展开才给波形与多音轨混音。
        默认折叠是为了把纵向空间留给谱面 —— 谱面自己已经带了
        进度条 + 播放头，不需要一直盯着波形。
      */}
      <div className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 flex-wrap ${surface}`}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-xs font-semibold min-w-0"
          title={collapsed ? '展开波形与多音轨选择' : '收起波形（把空间留给谱面）'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className="truncate">② 对照音频：波形 · 播放 · 多音轨</span>
          <span className={`text-[10px] font-normal ${dim}`}>
            {sources.length} 条音轨{activeMeasureLabel ? ` · ${activeMeasureLabel}` : ''}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {player.error && <span className="text-[10px] text-rose-400">音频不可达</span>}
          <span className={`text-[10px] font-mono ${dim}`}>
            {player.currentTimeSec.toFixed(2)}s / {durationSec.toFixed(2)}s
          </span>
          <button
            type="button"
            onClick={player.toggle}
            disabled={sources.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
          >
            {player.isPlaying ? <Pause size={12} /> : <Play size={12} />}
            {player.isPlaying ? '暂停' : '播放'}
          </button>
          <button
            type="button"
            onClick={player.reset}
            className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs ${
              isDark ? 'border-slate-700 text-slate-300' : 'border-slate-300 text-slate-600'
            }`}
            title="停止并回到 0s"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {hint && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              {hint}
            </div>
          )}

          {player.error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              {player.error}
            </div>
          )}

          <WaveformTimeline
            peaks={peaks}
            durationSec={durationSec || player.durationSec}
            currentTimeSec={player.currentTimeSec}
            isPlaying={player.isPlaying}
            isDark={isDark}
            title="声学波形与对齐主时钟"
            subtitle={`128 点能量峰值 · 点击波形跳转${onMarkerDrag ? ' · 拖拽小节线微调' : ''}`}
            markers={markers}
            onSeek={onSeek}
            onMarkerDrag={onMarkerDrag}
            onMarkerDragEnd={onMarkerDragEnd}
            heightClass="h-20"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-[11px] ${dim}`}>速度</span>
              {[0.5, 0.75, 1, 1.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={chip(Math.abs(player.playbackRate - rate) < 0.01)}
                  onClick={() => player.setPlaybackRate(rate)}
                >
                  {rate}x
                </button>
              ))}
              <span className={`text-[11px] ${dim}`}>
                {player.loading ? '音轨加载中…' : player.ready ? '音轨就绪' : '等待音轨'}
              </span>
            </div>
          </WaveformTimeline>

          {/* 多音轨混音 */}
          <div className={`rounded-2xl border p-3 ${surface}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Headphones size={12} className="text-amber-400" />
                音轨选择（可多选 / 独奏）
              </span>
              <span className={`text-[10px] ${dim}`}>出声：{player.audibleIds.length} 条</span>
            </div>
            <div className="space-y-1.5">
              {sources.map((source) => {
                const audible = player.audibleIds.includes(source.id);
                const isSolo = player.soloId === source.id;
                return (
                  <div
                    key={source.id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => player.toggleMute(source.id)}
                      title={audible ? '点击静音' : '点击取消静音'}
                      className={`p-0.5 ${audible ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {audible ? <Volume2 size={13} /> : <VolumeX size={13} />}
                    </button>
                    <span className={`w-24 shrink-0 truncate text-[11px] ${audible ? '' : 'text-slate-500'}`}>
                      {source.label}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={player.volumes[source.id] ?? 1}
                      onChange={(e) => player.setVolume(source.id, Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                      title={`音量 ${Math.round((player.volumes[source.id] ?? 1) * 100)}%`}
                    />
                    <button
                      type="button"
                      onClick={() => player.setSolo(source.id)}
                      className={chip(isSolo)}
                      title="独奏这条音轨（再点一次取消）"
                    >
                      S
                    </button>
                  </div>
                );
              })}
              {sources.length === 0 && (
                <div className={`text-[11px] ${dim}`}>
                  该项目还没有可播放的音轨（源音频不可达或尚未分离）。谱面仍可正常校正。
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TrackMixerPanel;
