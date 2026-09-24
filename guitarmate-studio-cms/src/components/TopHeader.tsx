import React from 'react';
import {
  Sliders,
  Volume2,
  Cpu,
  Moon,
  Sun,
  FileJson,
  CheckCircle2,
  Radio,
  Music4,
  ExternalLink,
  Laptop2,
  FileEdit,
  Archive,
} from 'lucide-react';
import { AudioTabSyncConfig, LessonStep, MusicTrack } from '../types';

interface TopHeaderProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  audioSyncConfig: AudioTabSyncConfig;
  selectedLesson: LessonStep;
  activeTrack?: MusicTrack;
  onOpenContractModal: () => void;
  audioEngineReady: boolean;
  onQuickSave: () => void;
  hasUnsavedChanges: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  darkMode,
  onToggleDarkMode,
  audioSyncConfig,
  selectedLesson,
  activeTrack,
  onOpenContractModal,
  audioEngineReady,
  onQuickSave,
  hasUnsavedChanges,
}) => {
  return (
    <header
      id="top-header"
      className={`h-15 border-b px-5 flex items-center justify-between transition-colors z-20 select-none ${
        darkMode
          ? 'bg-slate-900/95 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      {/* Brand & Active Project info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-md shadow-orange-500/20">
            <Music4 className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight font-sans">
                GuitarMate Studio <span className="text-amber-500 font-mono text-xs px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">CMS</span>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                C端契约已就绪 v2.4
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 truncate max-w-md">
              {activeTrack ? (
                <>
                  <span className="font-medium text-amber-400">当前挂谱曲目:</span>
                  <span className="truncate text-slate-200 font-semibold">{activeTrack.title}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    {activeTrack.currentVersion}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      activeTrack.status === 'published'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : activeTrack.status === 'draft'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {activeTrack.status}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-300">当前编排课时:</span>
                  <span className="truncate">{selectedLesson.title}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center Status Indicators */}
      <div className="hidden lg:flex items-center gap-5 px-3 py-1.5 rounded-lg border text-xs font-mono backdrop-blur-sm bg-slate-800/40 border-slate-700/60 text-slate-300">
        <div className="flex items-center gap-2" title="Web Audio API 实时状态">
          <Cpu className={`w-3.5 h-3.5 ${audioEngineReady ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>AudioDSP: {audioEngineReady ? '44.1kHz / 60FPS' : 'Ready'}</span>
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-1.5" title="蓝牙耳麦延迟微调">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>延迟补偿:</span>
          <span className={audioSyncConfig.playbackOffsetMs < 0 ? 'text-amber-400' : 'text-slate-200'}>
            {audioSyncConfig.playbackOffsetMs > 0 ? `+${audioSyncConfig.playbackOffsetMs}` : audioSyncConfig.playbackOffsetMs} ms
          </span>
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-1.5" title="小节与采样点总数">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span>波形点: 128 Pts</span>
          <span className="text-slate-500">|</span>
          <span>小节: {audioSyncConfig.measureTimestamps.length} Bars</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Quick contract export */}
        <button
          id="btn-export-contract"
          onClick={onOpenContractModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            darkMode
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
          }`}
          title="查看并导出适配C端学员系统的完整JSON数据契约"
        >
          <FileJson className="w-3.5 h-3.5 text-amber-400" />
          <span>数据契约导出</span>
        </button>

        {/* Save button */}
        <button
          id="btn-quick-save"
          onClick={onQuickSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm shadow-amber-500/20 transition-all font-semibold"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{hasUnsavedChanges ? '保存并同步C端' : '已同步至C端'}</span>
        </button>

        {/* Dark / Light Mode Toggle */}
        <button
          id="btn-toggle-theme"
          onClick={onToggleDarkMode}
          className={`p-2 rounded-lg border transition-colors ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
          }`}
          title={darkMode ? '切换至明亮工作台' : '切换至专业深色工作台'}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
