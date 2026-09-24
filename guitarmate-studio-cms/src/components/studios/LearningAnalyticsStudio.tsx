import React, { useState } from 'react';
import {
  BarChart3,
  TrendingDown,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowDownRight,
  PieChart,
  Activity,
  Flame,
  Zap,
} from 'lucide-react';
import { HARD_CHORDS_METRICS, DROPOFF_FUNNEL_STEPS } from '../../data/initialData';
import { HardChordMetric } from '../../types';

interface LearningAnalyticsStudioProps {
  darkMode: boolean;
}

export const LearningAnalyticsStudio: React.FC<LearningAnalyticsStudioProps> = ({ darkMode }) => {
  const [selectedChord, setSelectedChord] = useState<HardChordMetric>(HARD_CHORDS_METRICS[0]);

  return (
    <div id="learning-analytics-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner */}
      <div
        className={`px-6 py-3 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>教研与学员学情分析看板</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30">
                Learning Analytics & Funnel
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              各课时环节流失漏斗分析、全网高频卡点和弦声学图谱与教研教学干预建议
            </p>
          </div>
        </div>

        {/* Aggregate KPI Badges */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>有效学员样本: 58,420 人</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold">
            <Flame className="w-3.5 h-3.5" />
            <span>最大教学阻抗: 大横按 F (32.4%)</span>
          </div>
        </div>
      </div>

      {/* Main Studio Viewport (Left: 20-min Dropoff Funnel, Right: Hard Chords Leaderboard) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: 20-min Golden Slice Drop-off Funnel */}
        <div className="w-6/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-r border-inherit space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span>20 分钟切片课时流失率漏斗 (Drop-off Funnel)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                从校音到曲目对拍的学员留存轨迹，定位教学阻抗突变点
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              全课完播通关率: 56.8%
            </span>
          </div>

          {/* Funnel Step Bars */}
          <div className="space-y-3">
            {DROPOFF_FUNNEL_STEPS.map((step, idx) => {
              const isWorstDropoff = step.dropoffRate >= 15;
              return (
                <div
                  key={step.stepKey}
                  className={`p-4 rounded-2xl border transition-all ${
                    darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{step.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        {step.durationMin} 分钟切片
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-slate-300 font-bold">留存: {step.completionRate}%</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          isWorstDropoff
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        流失率: -{step.dropoffRate}%
                      </span>
                    </div>
                  </div>

                  {/* Funnel Horizontal Progress Bar */}
                  <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isWorstDropoff
                          ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      }`}
                      style={{ width: `${step.completionRate}%` }}
                    />
                  </div>

                  {/* Teaching intervention note for high dropoff steps */}
                  {isWorstDropoff && (
                    <div className="mt-2.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                      <span>
                        <strong>教研预警：</strong>该环节发生严重卡顿流失 (-{step.dropoffRate}%)。建议调降起始速度至 35 BPM，或增加「保留指过渡慢镜头」演示。
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: High-frequency Barrier Chords Leaderboard & Acoustic Spectrum */}
        <div className="w-6/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>全网高频卡点和弦排行榜 (Top Hard Chords)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                基于真实学员麦克风采音评测大数据统计，聚焦初学痛点
              </p>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">点击卡片切换声学图谱</span>
          </div>

          {/* Hard Chords List */}
          <div className="space-y-2.5">
            {HARD_CHORDS_METRICS.map((item, idx) => {
              const isSelected = selectedChord.chordName === item.chordName;
              return (
                <div
                  key={item.chordName}
                  onClick={() => setSelectedChord(item)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-rose-950/20 border-rose-500/50 shadow-md ring-1 ring-rose-500/30'
                      : darkMode
                      ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                          idx === 0
                            ? 'bg-rose-500 text-white'
                            : idx === 1
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{item.chordName}</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-slate-400">平均卡点: {item.avgStuckDays} 天</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          item.passRate < 40
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        通过率: {item.passRate}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 truncate">
                    典型症结: {item.topFailureReason}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Acoustic Issue Diagnostic for Selected Chord */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                <span>【{selectedChord.chordName}】采音声学缺陷分布图谱 (Acoustic Spectrum)</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                采样量: {selectedChord.sampleCount.toLocaleString()} 次
              </span>
            </div>

            {/* 4 Diagnostic Acoustic Bars */}
            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">琴弦打品嗡鸣 (Fret Buzzing)</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {selectedChord.acousticIssueSpectrum.buzzingRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${selectedChord.acousticIssueSpectrum.buzzingRate}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">琴弦受蹭发哑闷音 (Muted String)</span>
                  <span className="font-mono text-rose-400 font-bold">
                    {selectedChord.acousticIssueSpectrum.muteStringRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full"
                    style={{ width: `${selectedChord.acousticIssueSpectrum.muteStringRate}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">换把速度滞后超时 (Slow Transition)</span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {selectedChord.acousticIssueSpectrum.slowTransitionRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${selectedChord.acousticIssueSpectrum.slowTransitionRate}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">音高偏差越界 &gt;15 Cents (Wrong Pitch)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {selectedChord.acousticIssueSpectrum.wrongPitchRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full"
                    style={{ width: `${selectedChord.acousticIssueSpectrum.wrongPitchRate}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Pedagogical intervention advice */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 leading-relaxed">
              <strong className="text-emerald-400">教研组标准干预方案：</strong>
              针对该和弦学员平均需重试 {selectedChord.avgRetryTimes} 次，卡点达 {selectedChord.avgStuckDays} 天。系统建议在前置视频 01:30 增加「侧刃受力微距动画」，并在和弦微测中将容差暂开至 ±20 Cents，待 40 BPM 稳定后再收紧至 ±15 Cents。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
