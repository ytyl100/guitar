import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Film,
  Layers,
  Link2,
  ListChecks,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  Tv,
  Unlink,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { ChordConfig, LessonStep, TeachingVideo, VideoKeyPoint } from '../../types';
import { countReferences, moveById, nextSequentialId, removeById, upsertById } from '../../utils/libraryOps';
import { audioEngine } from '../../utils/audioEngine';

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const KEYPOINT_CATEGORIES: Array<{ value: VideoKeyPoint['category']; label: string }> = [
  { value: 'hand_posture', label: '手型工学 (Posture)' },
  { value: 'anti_buzz', label: '防哑音要点 (Anti-Buzz)' },
  { value: 'chord_switch', label: '换把连接 (Switch)' },
  { value: 'rhythm_tip', label: '律动重音 (Rhythm)' },
];

const VIDEO_STATUS_LABEL: Record<TeachingVideo['status'], string> = {
  draft: '草稿',
  ready: '已就绪',
  archived: '已归档',
};

/** 把秒数格式化成 mm:ss */
function formatTime(secs: number): string {
  const safe = Number.isFinite(secs) ? Math.max(0, secs) : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export interface VideoTimestampStudioProps {
  lesson: LessonStep;
  onChangeLesson: (updated: LessonStep) => void;
  darkMode: boolean;
  /** 教学视频库（可被多个课时复用） */
  videoLibrary: TeachingVideo[];
  onChangeVideoLibrary: (next: TeachingVideo[]) => void;
  /** 删除视频时，从所有课时的 `videoIds` 里摘掉该引用 */
  onDetachVideoFromLessons?: (videoId: string) => void;
  /** 课程体系里所有课时的「已关联视频 id」，用于删除前提示引用数 */
  lessonOwners?: Array<{ name: string; ids: string[] }>;
  /** 和弦库（打点可联动和弦指法卡） */
  chordLibrary?: Record<string, ChordConfig>;
  onGoToCurriculum?: () => void;
}

type RightTab = 'keypoints' | 'link' | 'library';

export const VideoTimestampStudio: React.FC<VideoTimestampStudioProps> = ({
  lesson,
  onChangeLesson,
  darkMode,
  videoLibrary,
  onChangeVideoLibrary,
  onDetachVideoFromLessons,
  lessonOwners = [],
  chordLibrary = {},
  onGoToCurriculum,
}) => {
  // ── 当前聚焦的视频 ─────────────────────────
  const linkedVideoIds = lesson.videoIds || [];
  const [focusedVideoId, setFocusedVideoId] = useState<string>(
    () => linkedVideoIds[0] || lesson.videoData?.videoId || videoLibrary[0]?.id || '',
  );
  const focusedVideo = videoLibrary.find((v) => v.id === focusedVideoId) || null;

  // 聚焦的视频被删掉 / 切换课时 → 自动落到一个可用视频
  useEffect(() => {
    if (focusedVideo) return;
    const fallback = linkedVideoIds[0] || lesson.videoData?.videoId || videoLibrary[0]?.id || '';
    if (fallback !== focusedVideoId) setFocusedVideoId(fallback);
  }, [focusedVideo, focusedVideoId, linkedVideoIds, lesson.videoData?.videoId, videoLibrary]);

  /** 课时的主视频：多对多里排第一的那个（旧字段 `videoData` 永远镜像它） */
  const primaryVideoId = linkedVideoIds[0] || lesson.videoData?.videoId || '';
  const isPrimaryFocused = !!focusedVideo && focusedVideo.id === primaryVideoId;

  // ── 播放模拟 ───────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const duration = focusedVideo?.durationSec || 0;

  useEffect(() => {
    if (!isPlaying || duration <= 0) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    lastTimeRef.current = performance.now();
    const step = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      setCurrentSec((prev) => {
        const next = prev + delta;
        if (next >= duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, duration]);

  // 换视频 → 停表回到 0
  useEffect(() => {
    setIsPlaying(false);
    setCurrentSec(0);
    setSelectedKeyPointId(null);
    setIsAddingKeyPoint(false);
  }, [focusedVideoId]);

  // ── 打点状态 ───────────────────────────────
  const keyPoints = focusedVideo?.keyPoints || [];
  const [selectedKeyPointId, setSelectedKeyPointId] = useState<string | null>(null);
  const [isAddingKeyPoint, setIsAddingKeyPoint] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<VideoKeyPoint['category']>('hand_posture');
  const [newLinkedChord, setNewLinkedChord] = useState<string>('');

  const activeKeyPoint = keyPoints.find((kp) => kp.id === selectedKeyPointId) || null;
  const activeChord = activeKeyPoint?.linkedChordName ? chordLibrary[activeKeyPoint.linkedChordName] : null;

  const [rightTab, setRightTab] = useState<RightTab>('keypoints');
  const [pendingDeleteVideoId, setPendingDeleteVideoId] = useState<string | null>(null);

  // ── 视频库写入 ─────────────────────────────
  /**
   * 写视频库；若写的就是**课时主视频**，同时把元数据镜像回 `lesson.videoData`，
   * 这样老链路（C 端 legacy 字段 / 契约 JSON）不会因为改成多对多而丢数据。
   */
  const updateVideo = (video: TeachingVideo, extraKeyPoints?: VideoKeyPoint[]) => {
    const next: TeachingVideo = { ...video, updatedAt: new Date().toISOString() };
    onChangeVideoLibrary(upsertById(videoLibrary, next));

    if (next.id === primaryVideoId) {
      onChangeLesson({
        ...lesson,
        videoData: {
          ...lesson.videoData,
          videoId: next.id,
          title: next.title,
          instructor: next.instructor,
          durationSec: next.durationSec,
          resolution: next.resolution,
          transcodeStatus: next.transcodeStatus,
          keyPoints: extraKeyPoints ?? next.keyPoints,
        },
      });
    }
  };

  const patchFocusedVideo = (patch: Partial<TeachingVideo>) => {
    if (!focusedVideo) return;
    updateVideo({ ...focusedVideo, ...patch });
  };

  const writeKeyPoints = (list: VideoKeyPoint[]) => {
    if (!focusedVideo) return;
    updateVideo({ ...focusedVideo, keyPoints: list }, list);
  };

  const handleSaveKeyPoint = () => {
    if (!newTitle.trim() || !focusedVideo) return;
    const point: VideoKeyPoint = {
      id: `kp-${Date.now()}`,
      timestampSec: Math.floor(currentSec),
      title: newTitle.trim(),
      description: newDesc.trim() || '重点关注手型关节与力量传导。',
      category: newCategory,
      linkedChordName: newLinkedChord || undefined,
    };
    writeKeyPoints([...keyPoints, point].sort((a, b) => a.timestampSec - b.timestampSec));
    setSelectedKeyPointId(point.id);
    setIsAddingKeyPoint(false);
    setNewTitle('');
    setNewDesc('');
  };

  const handleDeleteKeyPoint = (id: string) => {
    const next = keyPoints.filter((kp) => kp.id !== id);
    writeKeyPoints(next);
    if (selectedKeyPointId === id) setSelectedKeyPointId(next[0]?.id || null);
  };

  // ── 课时 ↔ 视频 多对多 ─────────────────────
  const toggleLink = (videoId: string) => {
    const next = linkedVideoIds.includes(videoId)
      ? linkedVideoIds.filter((id) => id !== videoId)
      : [...linkedVideoIds, videoId];
    onChangeLesson({ ...lesson, videoIds: next });
  };

  const moveLink = (videoId: string, delta: -1 | 1) =>
    onChangeLesson({ ...lesson, videoIds: moveById(linkedVideoIds.map((id) => ({ id })), videoId, delta).map((x) => x.id) });

  // ── 视频库 CRUD ────────────────────────────
  const handleAddVideo = () => {
    const now = new Date().toISOString();
    const created: TeachingVideo = {
      id: nextSequentialId('video', videoLibrary.map((v) => v.id)),
      title: '新教学视频',
      instructor: '待填写主讲老师',
      videoUrl: '',
      durationSec: 300,
      resolution: '1080P',
      transcodeStatus: 'PROCESSING',
      status: 'draft',
      tags: [],
      keyPoints: [],
      sourceLessonId: lesson.id,
      createdAt: now,
      updatedAt: now,
    };
    onChangeVideoLibrary([created, ...videoLibrary]);
    setFocusedVideoId(created.id);
    setRightTab('library');
  };

  const handleDuplicateVideo = (video: TeachingVideo) => {
    const now = new Date().toISOString();
    const copy: TeachingVideo = {
      ...video,
      id: nextSequentialId('video', videoLibrary.map((v) => v.id)),
      title: `${video.title}（副本）`,
      keyPoints: video.keyPoints.map((kp, i) => ({ ...kp, id: `kp-copy-${Date.now()}-${i}` })),
      createdAt: now,
      updatedAt: now,
    };
    onChangeVideoLibrary(upsertById(videoLibrary, copy));
    setFocusedVideoId(copy.id);
  };

  const confirmDeleteVideo = () => {
    if (!pendingDeleteVideoId) return;
    onChangeVideoLibrary(removeById(videoLibrary, pendingDeleteVideoId));
    onDetachVideoFromLessons?.(pendingDeleteVideoId);
    if (focusedVideoId === pendingDeleteVideoId) setFocusedVideoId('');
    setPendingDeleteVideoId(null);
    setRightTab('library');
  };

  const pendingDeleteVideo = videoLibrary.find((v) => v.id === pendingDeleteVideoId) || null;
  const pendingReferences = useMemo(
    () => (pendingDeleteVideoId ? countReferences(lessonOwners, pendingDeleteVideoId) : []),
    [pendingDeleteVideoId, lessonOwners],
  );
  const referenceTotal = pendingReferences.reduce((sum, r) => sum + r.count, 0);

  // ── 样式 ───────────────────────────────────
  const cardClass = cn(
    'rounded-2xl border',
    darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
  );
  const fieldClass = cn(
    'w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none focus:ring-1 focus:ring-sky-500/60',
    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800',
  );
  const subtleBtn = cn(
    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1',
    darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  );
  const primaryBtn =
    'px-3 py-1.5 rounded-xl text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-sm flex items-center gap-1.5 transition-colors';

  const tabs: Array<{ id: RightTab; label: string; badge: number }> = [
    { id: 'keypoints', label: '时间戳打点', badge: keyPoints.length },
    { id: 'link', label: '课时关联视频', badge: linkedVideoIds.length },
    { id: 'library', label: '视频库管理', badge: videoLibrary.length },
  ];

  return (
    <div id="video-timestamp-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* 顶部横幅 */}
      <div
        className={cn(
          'px-6 py-3 border-b flex items-center justify-between shrink-0 gap-4',
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Film className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <span>教学视频库 与 时间戳知识点打点器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">
                Video Library + Key-Points CMS
              </span>
            </h2>
            <p className="text-xs text-slate-400 truncate">
              视频资产集中管理 · 一个课时可关联多个教学视频 · 秒级打点联动 C 端和弦交互卡
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-xs text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="max-w-[220px] truncate">当前课时：{lesson.title}</span>
          </div>
          {focusedVideo && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono font-bold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {focusedVideo.resolution} · {focusedVideo.transcodeStatus}
              </span>
            </div>
          )}
          {onGoToCurriculum && (
            <button type="button" onClick={onGoToCurriculum} className={subtleBtn}>
              <Link2 className="w-3 h-3" /> 回课程大纲
            </button>
          )}
          <button type="button" onClick={handleAddVideo} className={primaryBtn}>
            <Plus className="w-3.5 h-3.5" /> 新建教学视频
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左：播放器 + 视频元数据 */}
        <div className="w-7/12 p-6 flex flex-col gap-4 border-r border-inherit overflow-y-auto custom-scrollbar">
          {!focusedVideo ? (
            <div
              className={cn(
                'aspect-video rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 text-xs text-slate-400',
                darkMode ? 'border-slate-700 bg-slate-950/60' : 'border-slate-300 bg-slate-50',
              )}
            >
              <Tv className="w-8 h-8 opacity-40" />
              <span>还没有可预览的视频</span>
              <button type="button" onClick={handleAddVideo} className={primaryBtn}>
                <Plus className="w-3.5 h-3.5" /> 新建教学视频
              </button>
            </div>
          ) : (
            <>
              {/* 播放器 */}
              <div
                className={cn(
                  'relative aspect-video rounded-2xl overflow-hidden border flex flex-col justify-between shadow-xl',
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700 text-white',
                )}
              >
                <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
                  <span className="text-xs font-semibold text-slate-200 drop-shadow truncate max-w-sm">
                    {focusedVideo.title}
                    {isPrimaryFocused && (
                      <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                        课时主视频
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-black">
                    {focusedVideo.resolution} HDR
                  </span>
                </div>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center space-y-2 opacity-80">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-sky-400/60 flex items-center justify-center mx-auto bg-sky-500/10">
                      <Tv className="w-8 h-8 text-sky-300 animate-pulse" />
                    </div>
                    <div className="text-xs font-medium text-slate-300">
                      {focusedVideo.videoUrl || '尚未填入视频源地址（CDN / OSS）'}
                    </div>
                    <div className="text-[11px] font-mono text-sky-400">
                      当前打点时间: {formatTime(currentSec)} / {formatTime(duration)}
                    </div>
                  </div>

                  {activeKeyPoint && Math.abs(currentSec - activeKeyPoint.timestampSec) < 4 && (
                    <div className="absolute bottom-16 left-6 right-6 p-3 rounded-xl bg-slate-950/90 border border-amber-500/50 text-amber-200 shadow-2xl">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-400 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          学员端实时弹出: {activeKeyPoint.title}
                        </span>
                        <span className="font-mono text-[10px]">
                          秒数: {formatTime(activeKeyPoint.timestampSec)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">{activeKeyPoint.description}</div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10 space-y-2">
                  <div className="relative h-2 bg-slate-700/80 rounded-full cursor-pointer">
                    <div
                      className="h-full bg-sky-400 rounded-full"
                      style={{ width: `${duration > 0 ? (currentSec / duration) * 100 : 0}%` }}
                    />
                    {keyPoints.map((kp) => (
                      <div
                        key={kp.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentSec(kp.timestampSec);
                          setSelectedKeyPointId(kp.id);
                        }}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform',
                          selectedKeyPointId === kp.id
                            ? 'bg-amber-400 border-white scale-125 z-20'
                            : 'bg-indigo-400 border-slate-900 hover:scale-110',
                        )}
                        style={{ left: `${duration > 0 ? (kp.timestampSec / duration) * 100 : 0}%` }}
                        title={`${kp.title} (${formatTime(kp.timestampSec)})`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 transition-transform active:scale-95"
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentSec(0)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(currentSec)} / {formatTime(duration)}
                      </span>
                    </div>

                    <button
                      id="btn-drop-keypoint"
                      type="button"
                      onClick={() => {
                        setRightTab('keypoints');
                        setIsAddingKeyPoint(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>在此秒数打点 ({formatTime(currentSec)})</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 视频资产编辑器 */}
              <div className={cn(cardClass, 'p-4')}>
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="font-bold flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-sky-400" />
                    视频资产属性（直接编辑并入库）
                  </span>
                  <span className="text-slate-400 font-mono">ID: {focusedVideo.id}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2">
                    <label className="block text-slate-400 mb-1">视频标题</label>
                    <input
                      value={focusedVideo.title}
                      onChange={(e) => patchFocusedVideo({ title: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">主讲老师</label>
                    <input
                      value={focusedVideo.instructor}
                      onChange={(e) => patchFocusedVideo({ instructor: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">时长（秒）</label>
                    <input
                      type="number"
                      min={0}
                      value={focusedVideo.durationSec}
                      onChange={(e) => patchFocusedVideo({ durationSec: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-400 mb-1">视频源地址（CDN / OSS）</label>
                    <input
                      value={focusedVideo.videoUrl}
                      placeholder="https://cdn.guitarmate.dev/videos/xxx.mp4"
                      onChange={(e) => patchFocusedVideo({ videoUrl: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">清晰度</label>
                    <select
                      value={focusedVideo.resolution}
                      onChange={(e) => patchFocusedVideo({ resolution: e.target.value as TeachingVideo['resolution'] })}
                      className={fieldClass}
                    >
                      <option value="720P">720P</option>
                      <option value="1080P">1080P</option>
                      <option value="4K">4K</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">转码状态</label>
                    <select
                      value={focusedVideo.transcodeStatus}
                      onChange={(e) =>
                        patchFocusedVideo({ transcodeStatus: e.target.value as TeachingVideo['transcodeStatus'] })
                      }
                      className={fieldClass}
                    >
                      <option value="PROCESSING">PROCESSING</option>
                      <option value="READY">READY</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">上架状态</label>
                    <select
                      value={focusedVideo.status}
                      onChange={(e) => patchFocusedVideo({ status: e.target.value as TeachingVideo['status'] })}
                      className={fieldClass}
                    >
                      {(['draft', 'ready', 'archived'] as const).map((status) => (
                        <option key={status} value={status}>
                          {VIDEO_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">标签（逗号分隔）</label>
                    <input
                      value={focusedVideo.tags.join(', ')}
                      onChange={(e) =>
                        patchFocusedVideo({
                          tags: e.target.value
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {focusedVideo.tags.map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3 text-sky-400" />
                      {tag}
                    </span>
                  ))}
                  {focusedVideo.tags.length === 0 && (
                    <span className="text-[11px] text-slate-500">还没有标签</span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => handleDuplicateVideo(focusedVideo)}
                    className={subtleBtn}
                  >
                    <Copy className="w-3 h-3" /> 复制视频
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteVideoId(focusedVideo.id)}
                    className={cn(subtleBtn, 'hover:text-rose-400 hover:border-rose-500/40')}
                  >
                    <Trash2 className="w-3 h-3" /> 删除视频
                  </button>
                  <span className="text-[11px] text-slate-500 ml-auto">
                    更新于 {new Date(focusedVideo.updatedAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右：打点 / 课时关联 / 视频库 */}
        <div className="w-5/12 p-6 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-4 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5',
                  rightTab === tab.id
                    ? 'bg-sky-600 border-sky-500 text-white'
                    : darkMode
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'font-mono text-[10px] px-1.5 rounded',
                    rightTab === tab.id ? 'bg-black/25' : 'bg-black/20',
                  )}
                >
                  {tab.badge}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {/* ── Tab 1：时间戳打点 ── */}
            {rightTab === 'keypoints' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    当前视频的打点列表（{keyPoints.length}）
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingKeyPoint(true)}
                    className="text-xs font-medium text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新增打点
                  </button>
                </div>

                {isAddingKeyPoint && (
                  <div
                    className={cn(
                      'p-4 rounded-2xl border',
                      darkMode ? 'bg-slate-900 border-amber-500/50' : 'bg-amber-50/50 border-amber-300',
                    )}
                  >
                    <div className="text-xs font-bold text-amber-400 mb-2 flex items-center justify-between">
                      <span>录入新打点（时间: {formatTime(currentSec)}）</span>
                      <button
                        type="button"
                        onClick={() => setIsAddingKeyPoint(false)}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">打点标题</label>
                        <input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="如：虎口悬空要领"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">避坑指导与力矩分析</label>
                        <textarea
                          rows={2}
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                          placeholder="例如：食指不可下塌蹭到 1 弦空弦…"
                          className={fieldClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-400 mb-1">分类标签</label>
                          <select
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value as VideoKeyPoint['category'])}
                            className={fieldClass}
                          >
                            {KEYPOINT_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">绑定联动和弦卡（可选）</label>
                          <select
                            value={newLinkedChord}
                            onChange={(e) => setNewLinkedChord(e.target.value)}
                            className={fieldClass}
                          >
                            <option value="">不联动</option>
                            {Object.keys(chordLibrary).map((chordName) => (
                              <option key={chordName} value={chordName}>
                                {chordName} 和弦
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setIsAddingKeyPoint(false)} className={subtleBtn}>
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveKeyPoint}
                          className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                        >
                          确认打点
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {keyPoints.length === 0 && !isAddingKeyPoint && (
                  <p className="text-[11px] text-slate-500">该视频还没有打点，点「在此秒数打点」开始。</p>
                )}

                {keyPoints.map((kp) => {
                  const isSelected = selectedKeyPointId === kp.id;
                  return (
                    <div
                      key={kp.id}
                      onClick={() => {
                        setSelectedKeyPointId(kp.id);
                        setCurrentSec(kp.timestampSec);
                      }}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-all cursor-pointer',
                        isSelected
                          ? 'bg-indigo-950/25 border-indigo-500/60 shadow-md'
                          : darkMode
                          ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs',
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                            {formatTime(kp.timestampSec)}
                          </span>
                          <span className="text-xs font-bold truncate">{kp.title}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {kp.linkedChordName && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                              {kp.linkedChordName}卡联动
                            </span>
                          )}
                          <button
                            type="button"
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

                {activeChord && (
                  <div className={cn(cardClass, 'p-4 mt-2')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> 联动和弦指法卡预览: {activeChord.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => audioEngine.strumChord(activeChord.frets, activeChord.bassString)}
                        className="text-[11px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                      >
                        <Volume2 className="w-3 h-3" /> 试听
                      </button>
                    </div>
                    <div className="text-xs text-amber-300/90">{activeChord.tips}</div>
                  </div>
                )}
              </>
            )}

            {/* ── Tab 2：课时关联视频 ── */}
            {rightTab === 'link' && (
              <>
                <div className={cn(cardClass, 'p-4')}>
                  <div className="text-xs font-bold mb-1 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-amber-400" />
                    课时「{lesson.title}」关联的视频（{linkedVideoIds.length}）
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    勾选即建立多对多关联；排在第一位的视频是**主视频**，会镜像进旧字段 `videoData`。
                  </p>

                  {linkedVideoIds.length === 0 ? (
                    <p className="text-[11px] text-slate-500">还没有关联任何视频。</p>
                  ) : (
                    <div className="space-y-1.5">
                      {linkedVideoIds.map((id, index) => {
                        const video = videoLibrary.find((v) => v.id === id);
                        return (
                          <div
                            key={id}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs',
                              video
                                ? darkMode
                                  ? 'bg-slate-950/60 border-slate-800'
                                  : 'bg-slate-50 border-slate-200'
                                : 'bg-rose-500/10 border-rose-500/40 text-rose-300',
                            )}
                          >
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/20 shrink-0">
                              #{index + 1}
                            </span>
                            <span className="truncate flex-1">{video ? video.title : `已失效的视频 ${id}`}</span>
                            {index === 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 shrink-0">
                                主视频
                              </span>
                            )}
                            <button
                              type="button"
                              title="上移"
                              disabled={index === 0}
                              onClick={() => moveLink(id, -1)}
                              className={cn('p-1', index === 0 ? 'opacity-30' : 'hover:text-sky-400')}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              title="下移"
                              disabled={index === linkedVideoIds.length - 1}
                              onClick={() => moveLink(id, 1)}
                              className={cn(
                                'p-1',
                                index === linkedVideoIds.length - 1 ? 'opacity-30' : 'hover:text-sky-400',
                              )}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              title="取消关联"
                              onClick={() => toggleLink(id)}
                              className="p-1 hover:text-rose-400"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={cn(cardClass, 'p-4')}>
                  <div className="text-xs font-bold mb-2 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-sky-400" /> 从视频库里勾选关联
                  </div>
                  {videoLibrary.length === 0 ? (
                    <p className="text-[11px] text-slate-500">视频库为空，先到「视频库管理」新建。</p>
                  ) : (
                    <div className="space-y-1">
                      {videoLibrary.map((video) => {
                        const checked = linkedVideoIds.includes(video.id);
                        return (
                          <label
                            key={video.id}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs border transition-colors',
                              checked
                                ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                                : darkMode
                                ? 'border-transparent hover:bg-slate-800/60 text-slate-300'
                                : 'border-transparent hover:bg-slate-100 text-slate-600',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLink(video.id)}
                              className="accent-sky-500"
                            />
                            <span className="truncate flex-1">{video.title}</span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {formatTime(video.durationSec)} · {VIDEO_STATUS_LABEL[video.status]}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setFocusedVideoId(video.id);
                                setRightTab('keypoints');
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 hover:text-sky-300 shrink-0"
                            >
                              打点
                            </button>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Tab 3：视频库管理 ── */}
            {rightTab === 'library' && (
              <div className={cn(cardClass, 'p-4')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-sky-400" /> 视频库（{videoLibrary.length}）
                  </span>
                  <button type="button" onClick={handleAddVideo} className={subtleBtn}>
                    <Plus className="w-3 h-3" /> 新建
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  删除视频会自动从所有课时里摘掉引用；被引用的视频删除前会提示影响范围。
                </p>

                {videoLibrary.length === 0 && <p className="text-[11px] text-slate-500">视频库为空。</p>}

                <div className="space-y-1.5">
                  {videoLibrary.map((video) => {
                    const isFocused = video.id === focusedVideoId;
                    const refs = countReferences(lessonOwners, video.id);
                    const refCount = refs.reduce((sum, r) => sum + r.count, 0);
                    return (
                      <div
                        key={video.id}
                        onClick={() => setFocusedVideoId(video.id)}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs cursor-pointer transition-colors',
                          isFocused
                            ? 'border-sky-500/60 bg-sky-500/10'
                            : darkMode
                            ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={linkedVideoIds.includes(video.id)}
                          onChange={() => toggleLink(video.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-sky-500"
                          title="勾选 = 关联到当前课时"
                        />
                        <span className="truncate flex-1">{video.title}</span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {formatTime(video.durationSec)} · {refCount} 处引用
                        </span>
                        <button
                          type="button"
                          title="复制"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateVideo(video);
                          }}
                          className="p-1 text-slate-500 hover:text-sky-400"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteVideoId(video.id);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 删除视频确认 ── */}
      {pendingDeleteVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={() => setPendingDeleteVideoId(null)}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border shadow-2xl',
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">删除教学视频「{pendingDeleteVideo.title}」</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {referenceTotal > 0
                    ? `该视频被 ${referenceTotal} 处课时引用，删除后会自动解除这些关联。`
                    : '该视频目前没有被任何课时引用。'}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2">
              {pendingReferences.length > 0 && (
                <ul className="space-y-1">
                  {pendingReferences.map((ref) => (
                    <li key={ref.name} className="text-[11px] text-rose-200/90 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rose-400" />
                      {ref.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">
                该视频的 {pendingDeleteVideo.keyPoints.length} 个时间戳打点也会一并删除，操作不可撤销。
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDeleteVideoId(null)} className={subtleBtn}>
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteVideo}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> 确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
