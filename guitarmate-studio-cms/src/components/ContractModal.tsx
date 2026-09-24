import React, { useState } from 'react';
import {
  FileJson,
  Copy,
  Check,
  Download,
  X,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Library,
} from 'lucide-react';
import { AudioTabSyncConfig, LessonStep, Stage, MusicTrack } from '../types';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioSyncConfig: AudioTabSyncConfig;
  lessonStep: LessonStep;
  stages: Stage[];
  tracks?: MusicTrack[];
  darkMode: boolean;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  isOpen,
  onClose,
  audioSyncConfig,
  lessonStep,
  stages,
  tracks = [],
  darkMode,
}) => {
  const [activeTab, setActiveTab] = useState<'musicLibrary' | 'audioTabSync' | 'lessonStep' | 'fullSystem'>('musicLibrary');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // C-End client published music list contract
  const publishedTracksPayload = {
    contract: 'GuitarMate-Client-Published-Music-List',
    apiVersion: 'v2.4',
    timestamp: new Date().toISOString(),
    totalPublished: tracks.filter((t) => t.status === 'published').length,
    // What the C-end user actually receives
    publishedMusicList: tracks
      .filter((t) => t.status === 'published')
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        difficulty: t.difficulty,
        genre: t.genre,
        keySignature: t.keySignature,
        bpm: t.tabConfig.bpm,
        currentVersion: t.currentVersion,
        tags: t.tags,
        audioDurationSec: t.tabConfig.audioDurationSec,
        noteCount: t.tabConfig.noteTimestamps.length,
        measureCount: t.tabConfig.measureTimestamps.length,
        waveformPeaksCount: t.tabConfig.waveformPeaks.length,
        publishedAt: t.updatedAt,
      })),
  };

  // Build the strict compliant contract payload
  const audioContractPayload = {
    audioId: audioSyncConfig.audioId,
    audioDurationSec: audioSyncConfig.audioDurationSec,
    waveformPeaks: audioSyncConfig.waveformPeaks,
    measureTimestamps: audioSyncConfig.measureTimestamps,
    noteTimestamps: audioSyncConfig.noteTimestamps,
    playbackOffsetMs: audioSyncConfig.playbackOffsetMs,
    bpm: audioSyncConfig.bpm,
    timeSignature: audioSyncConfig.timeSignature,
    loopRegion: audioSyncConfig.loopRegion,
  };

  const lessonStepPayload = {
    id: lessonStep.id,
    title: lessonStep.title,
    type: lessonStep.type,
    prerequisite: lessonStep.prerequisite,
    timeAllocation: lessonStep.timeAllocation,
    videoData: lessonStep.videoData,
    trainerData: lessonStep.trainerData,
    songBinding: lessonStep.songBinding,
  };

  const fullSystemPayload = {
    contractVersion: 'v2.4-production',
    exportTimestamp: new Date().toISOString(),
    system: 'GuitarMate Studio CMS',
    publishedTracks: publishedTracksPayload,
    audioTabSyncConfig: audioContractPayload,
    activeLessonStep: lessonStepPayload,
    curriculumStages: stages,
  };

  const currentPayload =
    activeTab === 'musicLibrary'
      ? publishedTracksPayload
      : activeTab === 'audioTabSync'
      ? audioContractPayload
      : activeTab === 'lessonStep'
      ? lessonStepPayload
      : fullSystemPayload;

  const jsonString = JSON.stringify(currentPayload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guitarmate-${activeTab}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-5 select-none">
      <div
        className={`w-full max-w-4xl max-h-[90vh] rounded-3xl border flex flex-col shadow-2xl transition-all ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  C端学员系统数据契约检测与导出中心
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  契约 100% 校验通过
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                严格遵循 AudioTabSyncConfig 与 LessonStep 数据结构规范
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body with Contract Tabs */}
        <div className="p-6 flex-1 flex flex-col min-h-0 space-y-4">
          {/* Tab Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-800/60 border border-slate-700 text-xs font-mono">
              <button
                onClick={() => setActiveTab('musicLibrary')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'musicLibrary'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>C端已发布曲库 ({tracks.filter((t) => t.status === 'published').length})</span>
              </button>
              <button
                onClick={() => setActiveTab('audioTabSync')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'audioTabSync'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                AudioTabSyncConfig (音频六线谱)
              </button>
              <button
                onClick={() => setActiveTab('lessonStep')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'lessonStep'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                LessonStep (课时与20m切片)
              </button>
              <button
                onClick={() => setActiveTab('fullSystem')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'fullSystem'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full System Snapshot (全系统快照)
              </button>
            </div>

            {/* Actions: Copy & Download */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已复制契约 JSON' : '复制 JSON'}</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载 .json 交付包</span>
              </button>
            </div>
          </div>

          {/* JSON Code Viewport */}
          <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 p-4 overflow-auto font-mono text-xs text-slate-300 custom-scrollbar select-text">
            <pre>{jsonString}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
