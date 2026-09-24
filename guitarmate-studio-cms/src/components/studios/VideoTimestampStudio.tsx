import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  Tag,
  User,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  Sliders,
  Tv,
  BookmarkPlus,
  Volume2,
} from 'lucide-react';
import { LessonStep, VideoKeyPoint } from '../../types';
import { CHORD_LIBRARY } from '../../data/initialData';
import { audioEngine } from '../../utils/audioEngine';

interface VideoTimestampStudioProps {
  lesson: LessonStep;
  onChangeLesson: (updated: LessonStep) => void;
  darkMode: boolean;
}

export const VideoTimestampStudio: React.FC<VideoTimestampStudioProps> = ({
  lesson,
  onChangeLesson,
  darkMode,
}) => {
  const videoData = lesson.videoData;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(45);
  const [selectedKeyPointId, setSelectedKeyPointId] = useState<string | null>(
    videoData.keyPoints[0]?.id || null
  );

  // New Keypoint state
  const [isAddingKeyPoint, setIsAddingKeyPoint] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<VideoKeyPoint['category']>('hand_posture');
  const [newLinkedChord, setNewLinkedChord] = useState<string>('C');

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Simulated video playback timer
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      const step = (time: number) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        setCurrentSec((prev) => {
          const next = prev + delta;
          if (next >= videoData.durationSec) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, videoData.durationSec]);

  // Selected keypoint details
  const activeKeyPoint = videoData.keyPoints.find((kp) => kp.id === selectedKeyPointId);
  const activeChord = activeKeyPoint?.linkedChordName ? CHORD_LIBRARY[activeKeyPoint.linkedChordName] : null;

  // Add new keypoint at current playback timestamp
  const handleSaveKeyPoint = () => {
    if (!newTitle.trim()) return;
    const newPoint: VideoKeyPoint = {
      id: `kp-${Date.now()}`,
      timestampSec: Math.floor(currentSec),
      title: newTitle.trim(),
      description: newDesc.trim() || '重点关注手型关节与力量传导。',
      category: newCategory,
      linkedChordName: newLinkedChord,
    };

    const updatedPoints = [...videoData.keyPoints, newPoint].sort(
      (a, b) => a.timestampSec - b.timestampSec
    );

    onChangeLesson({
      ...lesson,
      videoData: {
        ...videoData,
        keyPoints: updatedPoints,
      },
    });

    setSelectedKeyPointId(newPoint.id);
    setIsAddingKeyPoint(false);
    setNewTitle('');
    setNewDesc('');
  };

  const handleDeleteKeyPoint = (id: string) => {
    const updated = videoData.keyPoints.filter((kp) => kp.id !== id);
    onChangeLesson({
      ...lesson,
      videoData: {
        ...videoData,
        keyPoints: updated,
      },
    });
    if (selectedKeyPointId === id) {
      setSelectedKeyPointId(updated[0]?.id || null);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div id="video-timestamp-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner */}
      <div
        className={`px-6 py-3 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>教学视频资产与时间戳知识点打点器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">
                Timestamp Key-Points CMS
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              精准定位名师教学手型要领，时间秒数联动弹出 C 端学员和弦交互卡与防哑音锦囊
            </p>
          </div>
        </div>

        {/* Video Asset Meta Badges */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>主讲: {videoData.instructor}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{videoData.resolution} 转码就绪</span>
          </div>
        </div>
      </div>

      {/* Main Studio Viewport (Video Player on left 55%, Timestamp Keypoint List on right 45%) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Video Player Mockup & Visual Progress Bar */}
        <div className="w-7/12 p-6 flex flex-col justify-between border-r border-inherit overflow-y-auto custom-scrollbar">
          {/* Video Screen Simulation */}
          <div
            className={`relative aspect-video rounded-2xl overflow-hidden border flex flex-col justify-between shadow-xl ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            {/* Top Video Overlay: Title & Resolution */}
            <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
              <span className="text-xs font-semibold text-slate-200 drop-shadow truncate max-w-sm">
                {videoData.title}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-black">
                {videoData.resolution} HDR
              </span>
            </div>

            {/* Video Center: Guitarist Posture graphic simulation */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-2 opacity-80">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-sky-400/60 flex items-center justify-center mx-auto bg-sky-500/10 backdrop-blur-xs">
                  <Video className="w-8 h-8 text-sky-300 animate-pulse" />
                </div>
                <div className="text-xs font-medium text-slate-300">
                  名师 4K 特写机位 · 手型第一视角
                </div>
                <div className="text-[11px] font-mono text-sky-400">
                  当前打点时间: {formatTime(currentSec)} / {formatTime(videoData.durationSec)}
                </div>
              </div>

              {/* In-Video Realtime Keypoint Overlay Banner */}
              {activeKeyPoint && Math.abs(currentSec - activeKeyPoint.timestampSec) < 4 && (
                <div className="absolute bottom-16 left-6 right-6 p-3 rounded-xl bg-slate-950/90 border border-amber-500/50 text-amber-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      学员端实时弹出: {activeKeyPoint.title}
                    </span>
                    <span className="font-mono text-[10px]">秒数: {formatTime(activeKeyPoint.timestampSec)}</span>
                  </div>
                  <div className="text-xs text-slate-300">{activeKeyPoint.description}</div>
                </div>
              )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10 space-y-2">
              {/* Interactive Video Seekbar with pinned keypoint marks */}
              <div className="relative h-2 bg-slate-700/80 rounded-full cursor-pointer overflow-visible group">
                {/* Track progress */}
                <div
                  className="h-full bg-sky-400 rounded-full"
                  style={{ width: `${(currentSec / videoData.durationSec) * 100}%` }}
                />

                {/* Keypoint Pins on Seekbar */}
                {videoData.keyPoints.map((kp) => {
                  const left = (kp.timestampSec / videoData.durationSec) * 100;
                  const isSelected = selectedKeyPointId === kp.id;
                  return (
                    <div
                      key={kp.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentSec(kp.timestampSec);
                        setSelectedKeyPointId(kp.id);
                      }}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform ${
                        isSelected
                          ? 'bg-amber-400 border-white scale-130 z-20 shadow-md'
                          : 'bg-indigo-400 border-slate-900 hover:scale-120'
                      }`}
                      style={{ left: `${left}%` }}
                      title={`${kp.title} (${formatTime(kp.timestampSec)})`}
                    />
                  );
                })}
              </div>

              {/* Playback Buttons & Current second display */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 transition-transform active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>
                  <button
                    onClick={() => setCurrentSec(0)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono text-slate-300">
                    {formatTime(currentSec)} / {formatTime(videoData.durationSec)}
                  </span>
                </div>

                {/* Quick Drop Keypoint at this exact second */}
                <button
                  id="btn-drop-keypoint"
                  onClick={() => setIsAddingKeyPoint(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>在此秒数打点 ({formatTime(currentSec)})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Video Metadata Panel */}
          <div
            className={`mt-4 p-4 rounded-xl border ${
              darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-300">视频资产属性与标签</span>
              <span className="text-slate-400 font-mono">ID: {videoData.videoId}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['大横按破冰', '食指侧刃立指', '虎口离空工学', '无痛按弦肌肉记忆', '4K名师特写'].map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1"
                >
                  <Tag className="w-3 h-3 text-sky-400" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Key-points Timeline CMS list & Linked Chord Card */}
        <div className="w-5/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              时间戳关键知识点打点列表 ({videoData.keyPoints.length})
            </span>
            <button
              onClick={() => setIsAddingKeyPoint(true)}
              className="text-xs font-medium text-amber-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增关键打点</span>
            </button>
          </div>

          {/* New Keypoint Form */}
          {isAddingKeyPoint && (
            <div
              className={`p-4 rounded-2xl border transition-all ${
                darkMode ? 'bg-slate-900 border-amber-500/50' : 'bg-amber-50/50 border-amber-300'
              }`}
            >
              <div className="text-xs font-bold text-amber-400 mb-2 flex items-center justify-between">
                <span>录入新打点 (时间: {formatTime(currentSec)})</span>
                <button
                  onClick={() => setIsAddingKeyPoint(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">打点标题 (如: 虎口悬空要领)</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="输入手型要领核心标题..."
                    className={`w-full p-2 rounded-lg border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">避坑指导与力矩分析</label>
                  <textarea
                    rows={2}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="例如：食指不可下塌蹭到1弦空弦..."
                    className={`w-full p-2 rounded-lg border ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">分类标签</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as VideoKeyPoint['category'])}
                      className={`w-full p-2 rounded-lg border ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300'
                      }`}
                    >
                      <option value="hand_posture">手型工学 (Posture)</option>
                      <option value="anti_buzz">防哑音要点 (Anti-Buzz)</option>
                      <option value="chord_switch">换把连接 (Switch)</option>
                      <option value="rhythm_tip">律动重音 (Rhythm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">绑定联动和弦卡</label>
                    <select
                      value={newLinkedChord}
                      onChange={(e) => setNewLinkedChord(e.target.value)}
                      className={`w-full p-2 rounded-lg border ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300'
                      }`}
                    >
                      {Object.keys(CHORD_LIBRARY).map((chordName) => (
                        <option key={chordName} value={chordName}>
                          {chordName} 和弦
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsAddingKeyPoint(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveKeyPoint}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold"
                  >
                    确认打点
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Keypoints List */}
          <div className="space-y-3">
            {videoData.keyPoints.map((kp) => {
              const isSelected = selectedKeyPointId === kp.id;
              return (
                <div
                  key={kp.id}
                  onClick={() => {
                    setSelectedKeyPointId(kp.id);
                    setCurrentSec(kp.timestampSec);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/25 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/30'
                      : darkMode
                      ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        {formatTime(kp.timestampSec)}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{kp.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {kp.linkedChordName && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          {kp.linkedChordName}卡联动
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteKeyPoint(kp.id);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">{kp.description}</p>
                </div>
              );
            })}
          </div>

          {/* Linked Chord Card Preview Box */}
          {activeChord && (
            <div
              className={`p-4 rounded-2xl border mt-4 ${
                darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>联动和弦指法卡预览: {activeChord.name}</span>
                </span>
                <button
                  onClick={() => audioEngine.strumChord(activeChord.frets, activeChord.bassString)}
                  className="text-[11px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>试听该和弦发声</span>
                </button>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <div className="text-amber-300/90 font-medium">{activeChord.tips}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
