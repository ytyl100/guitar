import React, { useCallback, useMemo, useState } from 'react';
import { Scissors, Merge, Wand2, Trash2, Clock, Music4 } from 'lucide-react';
import type { TabNote } from '../../../types';

interface MeasureSlicerProps {
  /** 全部音符（用于统计每个小节内的音符数量） */
  notes: TabNote[];
  bpm: number;
  timeSignature?: [number, number];
  audioDurationSec: number;
  /** 受控的小节起始时间列表（秒），升序 */
  measureTimestamps: number[];
  /** 小节列表变更回调 */
  onChangeMeasures: (timestamps: number[]) => void;
  darkMode?: boolean;
  onShowToast?: (msg: string) => void;
}

/**
 * 小节切分器
 *
 * - 按 BPM + 拍号自动生成初始小节线（每小节 = beats * 60/bpm 秒）
 * - 支持合并 (merge) 多个小节 / 拆分 (split) 单个小节 / 删除小节线
 */
export const MeasureSlicer: React.FC<MeasureSlicerProps> = ({
  notes,
  bpm,
  timeSignature = [4, 4],
  audioDurationSec,
  measureTimestamps,
  onChangeMeasures,
  darkMode = true,
  onShowToast,
}) => {
  const [selected, setSelected] = useState<number[]>([]);

  /** 每小节时长（秒） */
  const measureDuration = useMemo(() => {
    const safeBpm = bpm > 0 ? bpm : 80;
    const beatSec = 60 / safeBpm;
    return beatSec * timeSignature[0] * (4 / timeSignature[1]);
  }, [bpm, timeSignature]);

  /** 每个小节内的音符数量统计 */
  const noteCountByMeasure = useMemo(() => {
    const list = measureTimestamps.map((start, idx) => {
      const end = idx + 1 < measureTimestamps.length ? measureTimestamps[idx + 1] : audioDurationSec;
      return notes.filter((n) => n.timestampSec >= start && n.timestampSec < end).length;
    });
    return list;
  }, [measureTimestamps, notes, audioDurationSec]);

  /** 按 BPM 自动生成小节线 */
  const handleAutoGenerate = useCallback(() => {
    const total = audioDurationSec > 0 ? audioDurationSec : measureDuration * 4;
    const auto: number[] = [];
    for (let t = 0; t < total + 1e-6; t += measureDuration) {
      auto.push(Number(t.toFixed(3)));
    }
    if (auto.length === 0) auto.push(0);
    onChangeMeasures(auto);
    setSelected([]);
    onShowToast?.(
      `已按 ${bpm} BPM / ${timeSignature[0]}/${timeSignature[1]} 自动生成 ${auto.length} 个小节 (每小节 ${measureDuration.toFixed(2)}s)`,
    );
  }, [audioDurationSec, measureDuration, bpm, timeSignature, onChangeMeasures, onShowToast]);

  /** 拆分选中的单个小节（在其 1/2 处插入一条小节线） */
  const handleSplit = useCallback(() => {
    if (selected.length !== 1) {
      onShowToast?.('请只选中 1 个小节后再执行拆分');
      return;
    }
    const idx = selected[0];
    const start = measureTimestamps[idx];
    const end =
      idx + 1 < measureTimestamps.length ? measureTimestamps[idx + 1] : audioDurationSec;
    const mid = Number(((start + end) / 2).toFixed(3));
    if (mid <= start || mid >= end) {
      onShowToast?.('小节时长过短，无法继续拆分');
      return;
    }
    const next = [...measureTimestamps, mid].sort((a, b) => a - b);
    onChangeMeasures(next);
    setSelected([]);
    onShowToast?.(`第 ${idx + 1} 小节已在 ${mid.toFixed(2)}s 处拆分为两小节`);
  }, [selected, measureTimestamps, audioDurationSec, onChangeMeasures, onShowToast]);

  /** 合并选中的多个小节（移除中间的小节线） */
  const handleMerge = useCallback(() => {
    if (selected.length < 2) {
      onShowToast?.('请至少选中 2 个相邻小节后再执行合并');
      return;
    }
    const sortedSel = [...selected].sort((a, b) => a - b);
    // 校验连续性
    for (let i = 1; i < sortedSel.length; i++) {
      if (sortedSel[i] - sortedSel[i - 1] !== 1) {
        onShowToast?.('仅支持合并连续的小节');
        return;
      }
    }
    const removeSet = new Set(sortedSel.slice(1)); // 保留第一个小节的起始线
    const next = measureTimestamps.filter((_, i) => !removeSet.has(i));
    onChangeMeasures(next);
    onShowToast?.(
      `已将第 ${sortedSel[0] + 1} ~ ${sortedSel[sortedSel.length - 1] + 1} 小节合并为一个练习段落`,
    );
    setSelected([]);
  }, [selected, measureTimestamps, onChangeMeasures, onShowToast]);

  /** 删除选中/指定小节线 */
  const handleRemove = useCallback(
    (idx: number) => {
      if (measureTimestamps.length <= 1) {
        onShowToast?.('至少需要保留 1 条小节线');
        return;
      }
      const next = measureTimestamps.filter((_, i) => i !== idx);
      onChangeMeasures(next);
      setSelected([]);
      onShowToast?.(`已删除第 ${idx + 1} 条小节线`);
    },
    [measureTimestamps, onChangeMeasures, onShowToast],
  );

  const toggleSelect = (idx: number) => {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b),
    );
  };

  return (
    <div className="space-y-3 text-xs">
      {/* 参数概览 */}
      <div className="grid grid-cols-3 gap-2">
        <div
          className={`px-2.5 py-2 rounded-lg border text-center ${
            darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-500 mb-0.5">BPM</div>
          <div className="font-mono font-bold text-amber-400">{bpm}</div>
        </div>
        <div
          className={`px-2.5 py-2 rounded-lg border text-center ${
            darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-500 mb-0.5">拍号</div>
          <div className="font-mono font-bold text-indigo-400">
            {timeSignature[0]}/{timeSignature[1]}
          </div>
        </div>
        <div
          className={`px-2.5 py-2 rounded-lg border text-center ${
            darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-500 mb-0.5">小节时长</div>
          <div className="font-mono font-bold text-emerald-400">
            {measureDuration.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleAutoGenerate}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1"
          title="按 BPM 与拍号重新等分生成小节线"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>按 BPM 自动生成</span>
        </button>
        <button
          onClick={handleSplit}
          disabled={selected.length !== 1}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
            selected.length === 1
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/40'
              : 'opacity-45 cursor-not-allowed border-slate-700 text-slate-400'
          }`}
          title="在选中小节的中点插入一条小节线"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>拆分 (Split)</span>
        </button>
        <button
          onClick={handleMerge}
          disabled={selected.length < 2}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
            selected.length >= 2
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40'
              : 'opacity-45 cursor-not-allowed border-slate-700 text-slate-400'
          }`}
          title="合并选中的连续小节为一个练习段落"
        >
          <Merge className="w-3.5 h-3.5" />
          <span>合并 (Merge)</span>
        </button>
        <span className="text-[11px] text-slate-500 ml-1">
          已选 {selected.length} 个小节
        </span>
      </div>

      {/* 小节列表 */}
      <div
        className={`rounded-lg border p-2 space-y-1 max-h-52 overflow-y-auto custom-scrollbar ${
          darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
          <Music4 className="w-3 h-3" />
          <span>小节切片列表 ({measureTimestamps.length})</span>
        </div>

        {measureTimestamps.map((start, idx) => {
          const end = idx + 1 < measureTimestamps.length ? measureTimestamps[idx + 1] : audioDurationSec;
          const isSelected = selected.includes(idx);
          return (
            <div
              key={`${idx}-${start}`}
              onClick={() => toggleSelect(idx)}
              className={`px-2.5 py-1.5 rounded-lg border cursor-pointer flex items-center justify-between transition-colors ${
                isSelected
                  ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200'
                  : darkMode
                  ? 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="点击选中该小节 (可多选以合并)"
            >
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-amber-400">M{idx + 1}</span>
                <span className="text-[11px] text-slate-400">
                  {start.toFixed(2)}s ~ {end.toFixed(2)}s
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 font-mono">
                  {noteCountByMeasure[idx] ?? 0} 音符
                </span>
                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {(end - start).toFixed(2)}s
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(idx);
                  }}
                  className="text-slate-500 hover:text-rose-400"
                  title="删除该小节线"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeasureSlicer;
