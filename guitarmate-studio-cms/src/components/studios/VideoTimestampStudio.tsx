import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Film,
  FolderOpen,
  HardDrive,
  Layers,
  Link2,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
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
import {
  ChordConfig,
  CurriculumAssetLibrary,
  CurriculumAssetRef,
  CurriculumHealth,
  CurriculumVideoAsset,
  LessonStep,
  StorageHealth,
  TeachingVideo,
  VideoKeyPoint,
} from '../../types';
import { countReferences, moveById, nextSequentialId, removeById, upsertById } from '../../utils/libraryOps';
import { audioEngine } from '../../utils/audioEngine';
import { api } from '../../services/api';

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

/**
 * 字节 → 人类可读。
 *
 * ⚠️ 小于 1MB 一律显示 KB：实测 48818B 被格式化成「0.0MB」看着像转码失败，
 * 用户就是为了这个来问的（小片段本来就是几十 KB）。
 */
function formatBytes(n: number): string {
  if (n <= 0) return '0KB';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
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

type RightTab = 'keypoints' | 'link' | 'library' | 'assets';

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

  /**
   * 直传本地视频到后端（≤20MB，**不转码**），拿到相对路径写进 `videoUrl`。
   *
   * ⚠️ 存**相对路径**（`/uploads/curriculum/videos/x.mp4`）而不是绝对 URL：
   * 换域名/换机器时不用把整棵课程树重编一遍；C 端投影会拼成绝对地址。
   * ⚠️ 注意 `transcodeStatus` **不会**被这个按钮改成 READY —— 直传的是**源文件**，
   * 根本没转码；状态该由「转码」那步去写（不然后面又会出现“写着 READY 但没转码”的旧毛病）。
   */
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadMsg, setVideoUploadMsg] = useState('');
  const [videoTranscoding, setVideoTranscoding] = useState(false);
  const [videoTranscodeMsg, setVideoTranscodeMsg] = useState('');
  /**
   * ffprobe 探到的**文件真实时长**（转码时顺便带回来）。
   *
   * ⚠️ 为什么要它：`durationSec` 是人工填的（种子里写 360），跟真实文件可以差很远 ——
   * 实测那个直传的演示片段只有 **3.0s**，而打点在 1:00~5:00：
   * 学员点打点会 seek 到片尾之外，跳过去什么都没发生。
   * 存着真实值 → 给一个「用真实时长覆盖」按钮（**不默默改**，人工填的可能才是目标值）。
   */
  const [probeDuration, setProbeDuration] = useState<number | null>(null);

  /**
   * 转码（真跑 ffmpeg）：产物写进 `variants`，并把 `videoUrl` 默认指到**最小可播的变体**
   * （720p 对手机端最划算），同时把 `transcodeStatus` 置为 READY ——
   * 这是**唯一**该把状态写成 READY 的地方（直传按钮不许改它，否则又会出现"写着 READY 却没转码"）。
   */
  const handleTranscode = async () => {
    if (!focusedVideo?.videoUrl) return;
    setVideoTranscodeMsg('');
    setVideoTranscoding(true);
    try {
      const res = await api.transcodeCurriculumVideo(focusedVideo.videoUrl);
      /**
       * 选哪个变体作为播放源：能出 720p 就用 720p（手机端最划算），
       * 否则用实际产出的那个（例如源本身只有 270p 时，产出的就是 `270p`）。
       */
      const preferred = res.variants.find((v) => v.label === '720p') || res.variants[0];
      patchFocusedVideo({
        variants: res.variants.map((v) => ({ label: v.label, url: v.path })),
        videoUrl: preferred.path,
        /** ⚠️ 只有**真跑完 ffmpeg 并拿到产物**才置 READY */
        transcodeStatus: 'READY',
      });
      /** 小产物显示 KB（实测 48818B 显示成「0.0MB」看着像失败） */
      const size = (n: number) =>
        n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
      /**
       * 时长对账：人工填的 `durationSec` vs ffprobe 探到的真値。
       * 不一致 / 有打点超出片长 → 在消息里说清楚（C 端按填的秒数显示时长，超出的打点跳不过去）。
       */
      const probed = res.durationSec;
      setProbeDuration(probed);
      const warnings: string[] = [];
      if (probed != null && Math.abs(probed - focusedVideo.durationSec) > 1) {
        warnings.push(
          `文件实际时长 ${formatTime(probed)}（${probed.toFixed(1)}s），与「时长（秒）」里填的 ${focusedVideo.durationSec}s 不一致 —— C 端会按填写的秒数展示`,
        );
      }
      const beyond = probed != null ? keyPoints.filter((kp) => kp.timestampSec > probed).length : 0;
      if (beyond > 0) {
        warnings.push(`有 ${beyond} 个打点超出片长，学员点下去会跳不过去（进度条上标成红色）`);
      }
      setVideoTranscodeMsg(
        `✅ 转码完成（${(res.elapsedMs / 1000).toFixed(1)}s）：` +
          res.variants.map((v) => `${v.label} ${size(v.sizeBytes)}`).join(' · ') +
          (res.notes.length ? `\nℹ ${res.notes.join('；')}` : '') +
          (warnings.length ? `\n⚠ ${warnings.join('；')}` : '') +
          `\n（已把视频源指到 ${preferred.label}，可在上面切换变体）`,
      );
    } catch (err) {
      /** 这里才是真失败：ffmpeg 报错 / 超时 / 源文件缺失 */
      patchFocusedVideo({ transcodeStatus: 'FAILED' });
      setVideoTranscodeMsg(`❌ 转码失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVideoTranscoding(false);
    }
  };

  const handleUploadVideo = async (file: File) => {
    setVideoUploadMsg('');
    if (file.size > 20 * 1024 * 1024) {
      setVideoUploadMsg(
        `视频 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过直传 20MB 上限 —— 请放到 OSS/CDN 后填地址。`,
      );
      return;
    }
    setVideoUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取本地文件失败'));
        reader.readAsDataURL(file);
      });
      const stored = await api.uploadCurriculumVideo(base64, file.name);
      patchFocusedVideo({ videoUrl: stored.path });
      setVideoUploadMsg(
        `✅ 已上传 ${(stored.sizeBytes / 1024 / 1024).toFixed(1)}MB → ${stored.path}（源文件，未转码）`,
      );
    } catch (err) {
      setVideoUploadMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVideoUploading(false);
    }
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

  /**
   * 编辑已有打点（本轮新增）。
   *
   * ⚠️ 之前打点卡片是**只读**的 —— 只能「新增」与「删除」，录错了时间/标题就只删了重建，
   * 用户直接反馈「无法改动编辑视频打点的内容」。现在每张卡片右上多了支笔，点开就是行内编辑表单
   * （字段与新增表单完全一致，含时间秒数）。
   */
  const [editDraft, setEditDraft] = useState<{
    id: string;
    timestampSec: string;
    title: string;
    description: string;
    category: VideoKeyPoint['category'];
    linkedChordName: string;
  } | null>(null);

  const startEditKeyPoint = (kp: VideoKeyPoint) => {
    setEditDraft({
      id: kp.id,
      timestampSec: String(kp.timestampSec),
      title: kp.title,
      description: kp.description,
      category: kp.category,
      linkedChordName: kp.linkedChordName || '',
    });
    setSelectedKeyPointId(kp.id);
  };

  const commitEditKeyPoint = () => {
    if (!editDraft) return;
    const title = editDraft.title.trim();
    if (!title) return;
    /** 时间允许直接改（`00:35` 那种写法也认：转成秒） */
    const raw = editDraft.timestampSec.trim();
    const parsed = /^\d+:\d{1,2}$/.test(raw)
      ? raw.split(':').reduce((acc, part, i) => acc + Number(part) * (i === 0 ? 60 : 1), 0)
      : Number(raw);
    const timestampSec = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
    writeKeyPoints(
      keyPoints
        .map((kp) =>
          kp.id === editDraft.id
            ? {
                ...kp,
                title,
                timestampSec,
                description: editDraft.description.trim() || kp.description,
                category: editDraft.category,
                linkedChordName: editDraft.linkedChordName || undefined,
              }
            : kp,
        )
        .sort((a, b) => a.timestampSec - b.timestampSec),
    );
    setEditDraft(null);
  };

  /**
   * 进度条上**拖拽打点圆点**改时间（本轮新增）。
   *
   * 为什么需要：之前只有「吸附到当前秒数新增」与「手填秒数编辑」两条路 ——
   * 想微调 45s → 43s 得先去编辑框里心算秒数，看不见相对位置，也不好对齐画面。
   *
   * 实现要点：
   * - 拖动过程**只改本地 `dragKeyPoint`**（预览卡/圆点实时跟随），**松手才 `writeKeyPoints`**；
   *   否则每个 pointermove 都写一次课程文档 → 会刷爆 `useCurriculumStore` 的 debounce PUT 与 revision。
   * - 用 `setPointerCapture` 让手指/鼠标移出圆点后仍收得到事件（不然拖快了就丢失）。
   * - 拖拽时**强制停表**：否则播放头的 RAF 会一直覆盖 `currentSec`，预览卡跟手指抢位置。
   * - 时间取整到秒（与新增/编辑打点、C 端 `mm:ss` 展示口径一致）。
   */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragKeyPoint, setDragKeyPoint] = useState<{ id: string; timeSec: number } | null>(null);
  const [dragHint, setDragHint] = useState('');

  /** 进度条横坐标 → 秒（与播放进度共用同一坐标系，clamp 在两段之内） */
  const clientXToSec = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration);
  };

  const handleKeyPointDragStart =
    (kp: VideoKeyPoint) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsPlaying(false);
      setSelectedKeyPointId(kp.id);
      setDragKeyPoint({ id: kp.id, timeSec: kp.timestampSec });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };

  const handleKeyPointDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragKeyPoint) return;
    const sec = clientXToSec(e.clientX);
    setDragKeyPoint({ ...dragKeyPoint, timeSec: sec });
    setCurrentSec(sec);
  };

  const handleKeyPointDragEnd = () => {
    if (!dragKeyPoint) return;
    const { id, timeSec } = dragKeyPoint;
    setDragKeyPoint(null);
    const target = keyPoints.find((kp) => kp.id === id);
    if (!target || target.timestampSec === timeSec) return;
    writeKeyPoints(
      keyPoints
        .map((kp) => (kp.id === id ? { ...kp, timestampSec: timeSec } : kp))
        .sort((a, b) => a.timestampSec - b.timestampSec),
    );
    setDragHint(`「${target.title}」移到 ${formatTime(timeSec)}`);
    window.setTimeout(() => setDragHint(''), 3200);
  };

  /**
   * 统一视频资产库（本轮新增）：**磁盘上所有已提交的视频文件**
   *
   * ## 为什么要有它（用户直接问的）
   *
   * 「视频库」那个页签列的是 `TeachingVideo` **记录**（标题/讲师/打点），
   * 而「上传本地视频」交上来的**字节**落在后端 `uploads/curriculum/videos/`。
   * 两者不是一回事：传完没挂到任何记录上的文件，之前**任何界面都看不到** ——
   * 用户就会问「我新提交的视频在哪儿统一管理？」。
   *
   * 现在这里把两边对起来：大小 / 真实时长 / 分辨率 / 被谁引用 / 哪些是孤儿，还能直接设成当前视频源。
   */
  const [assetLibrary, setAssetLibrary] = useState<CurriculumAssetLibrary | null>(null);
  const [health, setHealth] = useState<CurriculumHealth | null>(null);
  /** 课程以外目录的存储体检（转录项目 / 小节切片 / 导入工程 / 合成缓存） */
  const [storage, setStorage] = useState<StorageHealth | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState('');
  const [assetMsg, setAssetMsg] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | 'used' | 'orphan'>('all');
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<string | null>(null);
  /** 清理孤儿：两段式确认（避免一键删掉一堆文件还没反应过来） */
  const [confirmCleanOrphans, setConfirmCleanOrphans] = useState(false);
  /** 存储目录清理：先跑 dryRun 拿到「将删几个」，再让用户确认 */
  const [pendingStorageClean, setPendingStorageClean] = useState<{
    domain: string;
    files: number;
    bytes: number;
  } | null>(null);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError('');
    try {
      /** 资产库 + 两类体检一起拉：它们回答的是同一个问题的两面（文件在不在 / 引用对不对） */
      const [lib, h, st] = await Promise.all([
        api.listCurriculumAssets(),
        api.fetchCurriculumHealth(),
        api.fetchStorageHealth(),
      ]);
      setAssetLibrary(lib);
      setHealth(h);
      setStorage(st);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  /**
   * 存储目录的孤儿清理：**第一次点是演练**（dryRun，只报将要删多少），第二次点才真删。
   *
   * 真正删除时后端会**重新跑一遍归属判定**（不信任前端传的列表），所以演练与实删不会不一致。
   */
  const handleStorageClean = async (domain: string) => {
    setAssetMsg('');
    try {
      if (!pendingStorageClean || pendingStorageClean.domain !== domain) {
        const dry = await api.cleanupStorageOrphans(domain, true);
        setPendingStorageClean({ domain, files: dry.removedFiles, bytes: dry.freedBytes });
        setAssetMsg(
          `演练（未删）：${domain} 将清理 ${dry.removedFiles} 个文件 / ${formatBytes(dry.freedBytes)}`,
        );
        return;
      }
      const res = await api.cleanupStorageOrphans(domain, false);
      setPendingStorageClean(null);
      setAssetMsg(
        `✅ 已清理 ${domain}：${res.removedFiles} 个文件、释放 ${formatBytes(res.freedBytes)}` +
          (res.skipped.length ? `\nℹ 跳过 ${res.skipped.length} 个（被引用 / 占用中）` : ''),
      );
      await loadAssets();
    } catch (err) {
      setPendingStorageClean(null);
      setAssetMsg(`❌ ${domain} 清理失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * 进页面就拉一次（**不等用户点开页签**）。
   *
   * 原因就是用户的问题：「我传的视频在哪儿统一管理？」——
   * 页签上那个数字本身就是入口广告，等于 0 的话这页等于不存在。
   * 文件在磁盘上、不随课程文档变化，所以只拉一次，不做轮询。
   */
  useEffect(() => {
    if (assetLibrary === null && !assetsLoading) void loadAssets();
  }, [assetLibrary, assetsLoading, loadAssets]);

  /** 删单个文件（视频/封面同一个接口） */
  const handleDeleteAsset = async (
    asset: { fileName: string; relativePath: string; sizeBytes: number; referencedBy: CurriculumAssetRef[] },
    force: boolean,
  ) => {
    setAssetMsg('');
    try {
      await api.deleteCurriculumAsset(asset.relativePath, force);
      setAssetMsg(`✅ 已删除 ${asset.fileName}（释放 ${formatBytes(asset.sizeBytes)}）`);
      setPendingDeleteAsset(null);
      await loadAssets();
    } catch (err) {
      /** 409 = 还被引用：把后端的话原样说出来（它已经写清了是谁在用），而不是笼统报错 */
      setAssetMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * 一键清理孤儿（**所有**条引用的文件：视频源文件 / 转码产物 / 重复产物 / 旧封面）。
   *
   * ⚠️ 逐个删、**不带 force**：引用关系由后端现查现判，所以刚在别处挂上的文件会被 409 挡住
   * （宁可留着也不误删）。这也顺带把「上传后忘了挂」「换封面留下的旧图」这类历史垃圾清干净。
   */
  const handleCleanOrphans = async () => {
    const book = assetLibrary;
    if (!book) return;
    const targets = [
      ...book.videos.items.filter((v) => v.referencedBy.length === 0),
      ...book.covers.items.filter((c) => c.referencedBy.length === 0),
    ];
    setConfirmCleanOrphans(false);
    setAssetMsg(`清理中…（${targets.length} 个文件）`);
    let deleted = 0;
    let freed = 0;
    const skipped: string[] = [];
    for (const t of targets) {
      try {
        const res = await api.deleteCurriculumAsset(t.relativePath, false);
        deleted += 1;
        freed += res.sizeBytes;
      } catch (err) {
        /** 被引用（409）/ 已被别人删掉（404）：跳过并说明，不中断整批 */
        skipped.push(`${t.fileName}：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setAssetMsg(
      `✅ 清理完成：删除 ${deleted} 个文件、释放 ${formatBytes(freed)}` +
        (skipped.length ? `\n⚠ 跳过 ${skipped.length} 个：\n${skipped.join('\n')}` : ''),
    );
    await loadAssets();
  };

  const handleUseAsset = (asset: CurriculumVideoAsset) => {
    if (!focusedVideo) {
      setAssetMsg('⚠ 先在上面选中一个教学视频，再把这个文件设成它的视频源。');
      return;
    }
    patchFocusedVideo({ videoUrl: asset.relativePath });
    setAssetMsg(`✅ 已把「${focusedVideo.title}」的视频源指向 ${asset.fileName}`);
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

  /**
   * 删视频记录。
   *
   * ⚠️ 删记录**不会**自动删文件 —— 这正是磁盘上孤儿文件的**主要来源**
   * （删了记录，`videoUrl` 指着的那份字节还留在 `uploads/`）。
   * 所以这里顺手把「只属于这条记录、且删完之后没人再引用」的文件也删了，
   * 但仍然**逐个问后端**（不带 force）：后端会现查引用，被别的地方用了就 409 拦住。
   */
  const confirmDeleteVideo = async () => {
    if (!pendingDeleteVideoId) return;
    const removed = pendingDeleteVideo;
    onChangeVideoLibrary(removeById(videoLibrary, pendingDeleteVideoId));
    onDetachVideoFromLessons?.(pendingDeleteVideoId);
    if (focusedVideoId === pendingDeleteVideoId) setFocusedVideoId('');
    setPendingDeleteVideoId(null);
    setRightTab('library');

    if (!removed || !deleteFilesWithVideo) return;
    /** 这条记录自己指向的本地文件（videoUrl + 各变体），外链会被后端当成非资产直接拒掉 */
    const paths = [removed.videoUrl, ...(removed.variants || []).map((v) => v.url)].filter(
      (p): p is string => !!p && p.includes('/uploads/curriculum/'),
    );
    if (!paths.length) return;

    let deleted = 0;
    let freed = 0;
    const skipped: string[] = [];
    for (const path of [...new Set(paths)]) {
      try {
        /** 带上 ignoreVideoId：这条记录刚被删，文档保存还是防抖的，不带就会自已被自已拦成 409 */
        const res = await api.deleteCurriculumAsset(path, false, removed.id);
        deleted += 1;
        freed += res.sizeBytes;
      } catch (err) {
        skipped.push(`${path.split('/').pop()}（${err instanceof Error ? err.message : String(err)}）`);
      }
    }
    setAssetMsg(
      `✅ 已删除记录「${removed.title}」` +
        (deleted ? `，并清掉 ${deleted} 个文件（释放 ${formatBytes(freed)}）` : '') +
        (skipped.length ? `\n⚠ 有 ${skipped.length} 个文件没删：\n${skipped.join('\n')}` : ''),
    );
    await loadAssets();
  };

  const pendingDeleteVideo = videoLibrary.find((v) => v.id === pendingDeleteVideoId) || null;
  /** 删记录时是否顺手删文件（默认开：不删就又成了孤儿）+ 它指向几个本地文件 */
  const [deleteFilesWithVideo, setDeleteFilesWithVideo] = useState(true);
  const pendingDeleteFilePaths = pendingDeleteVideo
    ? [
        ...new Set(
          [pendingDeleteVideo.videoUrl, ...(pendingDeleteVideo.variants || []).map((v) => v.url)].filter(
            (p): p is string => !!p && p.includes('/uploads/curriculum/'),
          ),
        ),
      ]
    : [];
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
    /** 文件层面（磁盘）：视频 + 封面都算，与上面三个「文档层面」的页签不是一回事 */
    {
      id: 'assets',
      label: '视频资产',
      badge: (assetLibrary?.videos.total ?? 0) + (assetLibrary?.covers.total ?? 0),
    },
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
                'aspect-video shrink-0 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 text-xs text-slate-400',
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
              {/**
               * 播放器。
               *
               * ⚠️ `shrink-0` 不能删：它是个 `aspect-video` 的 flex 子项，而父级左栏是
               * `flex flex-col overflow-y-auto`。左栏内容超过可视高度时（窗口不高 /
               * 视频资产卡很长），flex 会把这个子项**压缩到 2px**（只剩边框）——
               * `overflow-hidden` 随之把整条进度条（含打点圆点）裁掉：看不见、点不到。
               * 加 `shrink-0` 让它守住 16:9 的高度，改为让左栏正常滚动。
               */}
              <div
                className={cn(
                  'relative shrink-0 aspect-video rounded-2xl overflow-hidden border flex flex-col justify-between shadow-xl',
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
                  {/** 进度条：点空白处定位播放头；圆点**可直接左右拖拽**改打点时间（松手才写库） */}
                  <div
                    ref={trackRef}
                    onPointerDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      setCurrentSec(clientXToSec(e.clientX));
                    }}
                    className="relative h-2 bg-slate-700/80 rounded-full cursor-pointer"
                  >
                    <div
                      className="h-full bg-sky-400 rounded-full pointer-events-none"
                      style={{ width: `${duration > 0 ? (currentSec / duration) * 100 : 0}%` }}
                    />
                    {keyPoints.map((kp) => {
                      const isDragging = dragKeyPoint?.id === kp.id;
                      const timeSec = isDragging ? dragKeyPoint.timeSec : kp.timestampSec;
                      /**
                       * 超出片长的打点（人工填的时长比真文件短时常见）：**贴在右端并标红**，
                       * 而不是让它按 `timestampSec/duration` 算出 left:1800% 飘到轨道外面看不见。
                       */
                      const beyondEnd = duration > 0 && timeSec > duration;
                      const leftPercent =
                        duration > 0 ? Math.min(100, (timeSec / duration) * 100) : 0;
                      return (
                        <div
                          key={kp.id}
                          onPointerDown={handleKeyPointDragStart(kp)}
                          onPointerMove={handleKeyPointDragMove}
                          onPointerUp={handleKeyPointDragEnd}
                          onPointerCancel={handleKeyPointDragEnd}
                          className={cn(
                            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex items-center justify-center touch-none select-none',
                            isDragging ? 'cursor-grabbing' : 'cursor-grab',
                          )}
                          /** 22px 命中区：圆点只有 14px，直接拖会很难点中 */
                          style={{ left: `${leftPercent}%`, width: 22, height: 22 }}
                          title={`拖拽可改时间 · ${kp.title}（${formatTime(timeSec)}）${
                            beyondEnd ? ` ⚠ 超出片长（视频只有 ${formatTime(duration)}）` : ''
                          }`}
                        >
                          <span
                            className={cn(
                              'rounded-full border-2 pointer-events-none transition-transform',
                              isDragging
                                ? 'w-4 h-4 bg-sky-400 border-white scale-125 shadow-lg shadow-sky-500/60'
                                : beyondEnd
                                  ? 'w-3.5 h-3.5 bg-rose-500 border-white' + (selectedKeyPointId === kp.id ? ' scale-125' : '')
                                  : selectedKeyPointId === kp.id
                                    ? 'w-3.5 h-3.5 bg-amber-400 border-white scale-125'
                                    : 'w-3.5 h-3.5 bg-indigo-400 border-slate-900 hover:scale-110',
                            )}
                          />
                          {isDragging && (
                            <span className="absolute -top-6 px-1.5 py-0.5 rounded bg-sky-400 text-slate-950 text-[10px] font-mono font-black whitespace-nowrap shadow-lg">
                              {formatTime(timeSec)}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
                      {dragHint ? (
                        <span className="text-[10px] font-mono text-sky-300">↔ {dragHint}</span>
                      ) : (
                        <span className="text-[10px] text-slate-500">拖动进度条圆点可改打点时间</span>
                      )}
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
                    <label className="block text-slate-400 mb-1">视频源地址（CDN / OSS，或本服务直传）</label>
                    <input
                      value={focusedVideo.videoUrl}
                      placeholder="https://cdn.guitarmate.dev/videos/xxx.mp4"
                      onChange={(e) => patchFocusedVideo({ videoUrl: e.target.value })}
                      className={fieldClass}
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        ref={videoFileRef}
                        type="file"
                        accept="video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadVideo(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={videoUploading}
                        onClick={() => videoFileRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                      >
                        {videoUploading ? '上传中…' : '上传本地视频'}
                      </button>
                      <span className="text-[10px] text-slate-500">
                        MP4 / WEBM · ≤20MB（不转码）；大视频请放 OSS/CDN 后填地址
                      </span>
                    </div>
                    {!!videoUploadMsg && (
                      <p className="text-[10px] mt-1 text-amber-400">{videoUploadMsg}</p>
                    )}

                    {/** 转码：真跑 ffmpeg（后端的 720p/1080p 变体链）；产物写回 `variants` 与 `videoUrl` */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        type="button"
                        disabled={videoTranscoding || !focusedVideo.videoUrl}
                        onClick={() => void handleTranscode()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                      >
                        {videoTranscoding ? '转码中（可能几十秒）…' : '转码出 720p/1080p'}
                      </button>
                      <span className="text-[10px] text-slate-500">
                        只接本服务已上传的文件（外链请先下载再传）；源低于目标尺寸时不做放大转码
                      </span>
                    </div>
                    {!!videoTranscodeMsg && (
                      <p className="text-[10px] mt-1 text-emerald-400 whitespace-pre-wrap">
                        {videoTranscodeMsg}
                      </p>
                    )}
                    {/** 真实时长与填写值不一致时，给一个**明确**的覆盖入口（不默默改人工数据） */}
                    {probeDuration != null && Math.abs(probeDuration - focusedVideo.durationSec) > 1 && (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => patchFocusedVideo({ durationSec: Math.round(probeDuration) })}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white"
                        >
                          把时长改成实测的 {Math.round(probeDuration)}s
                        </button>
                        <span className="text-[10px] text-slate-500">
                          改完记得重看一下打点（超出的那些会贴在进度条右端）
                        </span>
                      </div>
                    )}
                    {!!(focusedVideo.variants || []).length && (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-400">转码产物：</span>
                        {(focusedVideo.variants || []).map((v) => (
                          <button
                            key={v.label}
                            type="button"
                            onClick={() => patchFocusedVideo({ videoUrl: v.url })}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              focusedVideo.videoUrl === v.url
                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                                : 'border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                            title="点一下把视频源切换到这个变体"
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}
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
                  const isEditing = editDraft?.id === kp.id;
                  return (
                    <div
                      key={kp.id}
                      onClick={() => {
                        if (isEditing) return;
                        setSelectedKeyPointId(kp.id);
                        setCurrentSec(kp.timestampSec);
                      }}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-all',
                        isEditing ? '' : 'cursor-pointer',
                        isSelected
                          ? 'bg-indigo-950/25 border-indigo-500/60 shadow-md'
                          : darkMode
                          ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs',
                      )}
                    >
                      {isEditing && editDraft ? (
                        <div className="space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
                          <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
                            <span>编辑打点</span>
                            <button
                              type="button"
                              onClick={() => setEditDraft(null)}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-slate-400 mb-1">时间（秒，也忈 mm:ss）</label>
                              <input
                                value={editDraft.timestampSec}
                                onChange={(e) => setEditDraft({ ...editDraft, timestampSec: e.target.value })}
                                className={fieldClass}
                              />
                            </div>
                            <div>
                              <label className="block text-slate-400 mb-1">标题</label>
                              <input
                                value={editDraft.title}
                                onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                                className={fieldClass}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-slate-400 mb-1">避坑指导与力矩分析</label>
                            <textarea
                              rows={2}
                              value={editDraft.description}
                              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                              className={fieldClass}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-slate-400 mb-1">分类标签</label>
                              <select
                                value={editDraft.category}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    category: e.target.value as VideoKeyPoint['category'],
                                  })
                                }
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
                                value={editDraft.linkedChordName}
                                onChange={(e) => setEditDraft({ ...editDraft, linkedChordName: e.target.value })}
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
                            <button type="button" onClick={() => setEditDraft(null)} className={subtleBtn}>
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={commitEditKeyPoint}
                              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                            >
                              保存修改
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                                title="编辑这个打点"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditKeyPoint(kp);
                                }}
                                className="text-slate-500 hover:text-amber-400 p-1"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
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
                        </>
                      )}
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
                    勾选即建立多对多关联；排在第一位的视频是主视频，会镜像进旧字段 videoData。
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
            {/** ── Tab 4：视频资产库（磁盘上的文件） ─────────────────────────────── */}
            {rightTab === 'assets' && (
              <>
                {/** ① 数据体检：引用了不存在的东西 + 孤儿文件汇总（体检里的「处理」入口） */}
                <div className={cn(cardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                      数据体检
                      {health && (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-bold border',
                            health.counts.error > 0
                              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                              : health.counts.warn > 0
                                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
                          )}
                        >
                          {health.counts.error > 0
                            ? `${health.counts.error} 个错误`
                            : health.counts.warn > 0
                              ? `${health.counts.warn} 个警告`
                              : '通过'}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadAssets()}
                      disabled={assetsLoading}
                      className={cn(subtleBtn, 'disabled:opacity-50')}
                    >
                      <RefreshCw className={cn('w-3 h-3', assetsLoading && 'animate-spin')} /> 刷新
                    </button>
                  </div>

                  {!health && <p className="text-[11px] text-slate-500">正在体检…</p>}

                  {health && (
                    <>
                      <p className="text-[10px] text-slate-500 font-mono mb-2">
                        视频 {health.summary.videos} · 封面 {health.summary.covers} · 课时{' '}
                        {health.summary.lessons} · 孤儿 {health.summary.orphanVideos + health.summary.orphanCovers}{' '}
                        个（{formatBytes(health.summary.orphanBytes)}）
                      </p>
                      {health.issues.length === 0 && (
                        <p className="text-[11px] text-emerald-400">
                          ✓ 没有任何悬空引用，磁盘上也没有多余文件。
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {health.issues.map((issue) => (
                          <div
                            key={`${issue.code}-${issue.target}`}
                            className={cn(
                              'px-2 py-1.5 rounded-lg border text-[10px] leading-relaxed',
                              issue.level === 'error'
                                ? 'border-rose-500/40 bg-rose-500/5 text-rose-200'
                                : issue.level === 'warn'
                                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
                                  : 'border-slate-700 bg-slate-900/40 text-slate-300',
                            )}
                          >
                            <div className="font-bold">
                              {issue.level === 'error' ? '✕' : issue.level === 'warn' ? '⚠' : 'ℹ'}{' '}
                              {issue.message}
                            </div>
                            <div className="text-slate-400 mt-0.5">建议：{issue.fixHint}</div>
                          </div>
                        ))}
                      </div>

                      {/** 一键清理：只删「没人引用」的文件；被引用的会被后端 409 挡住（宁留不误删） */}
                      {health.summary.orphanVideos + health.summary.orphanCovers > 0 && (
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {confirmCleanOrphans ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleCleanOrphans()}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white"
                              >
                                确认清理这{' '}
                                {health.summary.orphanVideos + health.summary.orphanCovers} 个文件（
                                {formatBytes(health.summary.orphanBytes)}）
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCleanOrphans(false)}
                                className={subtleBtn}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmCleanOrphans(true)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white"
                              >
                                🧹 清理孤儿文件（{health.summary.orphanVideos + health.summary.orphanCovers} 个 ·{' '}
                                {formatBytes(health.summary.orphanBytes)}）
                              </button>
                              <span className="text-[10px] text-slate-500">
                                只删没人引用的；被引用的会被拦下（不会误删正在用的）
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {!!assetMsg && (
                    <p className="text-[11px] mt-2 text-amber-400 whitespace-pre-wrap">{assetMsg}</p>
                  )}
                  {!!assetsError && (
                    <p className="text-[11px] mt-2 text-rose-400 whitespace-pre-wrap">
                      ❌ 读取资产库失败：{assetsError}
                    </p>
                  )}

                  {/**
                    * ── 后端存储体检（课程以外的上传目录） ─────────────────────────
                    *
                    * 同一套模式（引用对账 → 体检 → 一键清理），只是「主记录」来自别的表：
                    * transcriptions/<projectId>、measures/<scoreId>、tab-projects/<scoreId>、demo/（缓存）。
                    * 放在同一张体检卡里，是为了让「数据体检」只有一个入口。
                    */}
                  {storage && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-300">
                          后端存储（课程以外的 uploads 目录）
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {storage.totals.files} 个文件 · {formatBytes(storage.totals.bytes)}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {storage.domains.map((d) => {
                          const isPending = pendingStorageClean?.domain === d.domain;
                          const bad = d.orphanFiles + d.missingRefs + d.dataGaps.length;
                          return (
                            <div
                              key={d.domain}
                              className={cn(
                                'px-2 py-1.5 rounded-lg border text-[10px]',
                                bad > 0
                                  ? 'border-amber-500/40 bg-amber-500/5'
                                  : 'border-slate-700 bg-slate-900/40',
                              )}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-slate-200">{d.dir}/</span>
                                <span className="text-slate-500">
                                  {d.files} 个 · {formatBytes(d.bytes)}
                                </span>
                                {d.orphanFiles > 0 && (
                                  <span className="text-amber-300">
                                    孤儿 {d.orphanFiles}（{formatBytes(d.orphanBytes)}）
                                  </span>
                                )}
                                {d.missingRefs > 0 && (
                                  <span className="text-rose-300">悬空引用 {d.missingRefs}</span>
                                )}
                                {d.dataGaps.length > 0 && (
                                  <span className="text-sky-300">数据缺失 {d.dataGaps.length}</span>
                                )}
                                {bad === 0 && <span className="text-emerald-400">✓ 干净</span>}
                                {d.cleanable && d.orphanFiles > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => void handleStorageClean(d.domain)}
                                    className={cn(
                                      'ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold text-white',
                                      isPending
                                        ? 'bg-rose-600 hover:bg-rose-500'
                                        : 'bg-slate-700 hover:bg-slate-600',
                                    )}
                                    title={d.note}
                                  >
                                    {isPending
                                      ? `确认删这 ${pendingStorageClean?.files} 个`
                                      : '演练清理'}
                                  </button>
                                )}
                              </div>
                              {d.orphanSample.length > 0 && (
                                <div className="text-slate-500 mt-0.5 truncate font-mono">
                                  例：{d.orphanSample[0].rel}
                                </div>
                              )}
                              {d.missingSample.slice(0, 2).map((m) => (
                                <div key={`${m.rel}-${m.field}`} className="text-rose-200/80 mt-0.5 truncate">
                                  ✕ {m.rel} ← {m.owner}.{m.field}（文件不存在）
                                </div>
                              ))}
                              {d.dataGaps.slice(0, 2).map((g) => (
                                <div key={g} className="text-sky-200/80 mt-0.5">
                                  ℹ {g}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        清理只删**没有任何记录引用**的文件；目录名还是某条记录 id 的目录里的中间产物一律保留。
                        悬空引用（有记录、没文件）无法自动修复，需要人工决定重传或废弃该记录。
                      </p>
                    </div>
                  )}
                </div>

                {/** ② 视频文件（直传源 + 转码产物） */}
                <div className={cn(cardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      视频文件（{assetLibrary?.videos.total ?? 0}）
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      合计 {formatBytes(assetLibrary?.videos.totalBytes ?? 0)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                    「上传本地视频」与「转码」产出的文件都在这里（后端
                    <span className="font-mono"> uploads/curriculum/videos/</span>
                    ）。上面的「视频库管理」列的是记录；传完还没挂到记录上的文件只会出现在这一页。
                  </p>

                  {assetLibrary && (
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {[
                        { id: 'all' as const, label: `全部 ${assetLibrary.videos.total}` },
                        { id: 'used' as const, label: `已引用 ${assetLibrary.videos.referencedCount}` },
                        { id: 'orphan' as const, label: `孤儿 ${assetLibrary.videos.orphanCount}` },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setAssetFilter(f.id)}
                          className={cn(
                            'px-2 py-0.5 rounded-lg text-[10px] border font-mono',
                            assetFilter === f.id
                              ? 'bg-sky-600 border-sky-500 text-white'
                              : darkMode
                                ? 'border-slate-700 text-slate-300 hover:border-slate-500'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400',
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {assetsLoading && !assetLibrary && (
                    <p className="text-[11px] text-slate-500">正在扫描后端资产目录…</p>
                  )}

                <div className="space-y-1.5">
                  {(assetLibrary?.videos.items || [])
                    .filter((a) =>
                      assetFilter === 'all'
                        ? true
                        : assetFilter === 'used'
                          ? a.referencedBy.length > 0
                          : a.referencedBy.length === 0,
                    )
                    .map((asset) => {
                      const isPendingDelete = pendingDeleteAsset === asset.relativePath;
                      const isCurrentSource = focusedVideo?.videoUrl === asset.relativePath;
                      return (
                        <div
                          key={asset.relativePath}
                          className={cn(
                            'px-2.5 py-2 rounded-xl border text-xs',
                            isCurrentSource
                              ? 'border-emerald-500/60 bg-emerald-500/5'
                              : darkMode
                                ? 'bg-slate-950/60 border-slate-800'
                                : 'bg-slate-50 border-slate-200',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="truncate flex-1 font-mono text-[11px]"
                              title={asset.relativePath}
                            >
                              {asset.fileName}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border',
                                asset.folder === 'transcoded'
                                  ? 'text-indigo-300 border-indigo-500/40 bg-indigo-500/10'
                                  : 'text-sky-300 border-sky-500/40 bg-sky-500/10',
                              )}
                            >
                              {asset.folder === 'transcoded' ? '转码产物' : '直传源文件'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-mono flex-wrap">
                            <span>{formatBytes(asset.sizeBytes)}</span>
                            <span>·</span>
                            <span>
                              {asset.durationSec != null
                                ? formatTime(asset.durationSec)
                                : asset.probed
                                  ? '读不出时长'
                                  : '未探测'}
                            </span>
                            {asset.resolution && (
                              <>
                                <span>·</span>
                                <span>
                                  {asset.resolution.width}×{asset.resolution.height}
                                </span>
                              </>
                            )}
                            <span>·</span>
                            <span>{new Date(asset.mtimeMs).toLocaleString('zh-CN')}</span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {asset.referencedBy.length > 0 ? (
                              <span
                                className="text-[10px] text-emerald-400"
                                title={asset.referencedBy.map((r) => r.title).join('\n')}
                              >
                                ✓ 被 {asset.referencedBy.length} 处使用：
                                {asset.referencedBy[0].title.length > 14
                                  ? `${asset.referencedBy[0].title.slice(0, 14)}…`
                                  : asset.referencedBy[0].title}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400">
                                ⚠ 未被任何记录引用（孤儿文件）
                              </span>
                            )}

                            <div className="ml-auto flex items-center gap-1">
                              {isCurrentSource ? (
                                <span className="text-[10px] text-emerald-400 px-1">当前视频源</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUseAsset(asset)}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                                  title="把这个文件写成当前选中视频的 videoUrl"
                                >
                                  设为视频源
                                </button>
                              )}
                              <a
                                href={asset.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 text-slate-500 hover:text-sky-400"
                                title="在新标签打开预览"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(asset.relativePath);
                                  setAssetMsg(`已复制路径：${asset.relativePath}`);
                                }}
                                className="p-1 text-slate-500 hover:text-sky-400"
                                title="复制相对路径"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {isPendingDelete ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteAsset(asset, asset.referencedBy.length > 0)
                                    }
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white"
                                    title={
                                      asset.referencedBy.length > 0
                                        ? '这个文件还被引用，删了那些地方会播不出来'
                                        : '确认删除文件'
                                    }
                                  >
                                    {asset.referencedBy.length > 0 ? '强删' : '确认删'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteAsset(null)}
                                    className="p-1 text-slate-500 hover:text-slate-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssetMsg('');
                                    setPendingDeleteAsset(asset.relativePath);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-400"
                                  title="删除这个文件"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {assetLibrary && assetLibrary.videos.items.length === 0 && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" />
                      后端视频目录还是空的：点上面「上传本地视频」传一个试试。
                    </p>
                  )}
                </div>
              </div>

                {/** ③ 封面图：同一种“孤儿”问题（换封面后旧图留在盘上） */}
                <div className={cn(cardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      封面图（{assetLibrary?.covers.total ?? 0}）
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      合计 {formatBytes(assetLibrary?.covers.totalBytes ?? 0)}
                      {!!assetLibrary?.covers.orphanCount &&
                        ` · 孤儿 ${assetLibrary.covers.orphanCount}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                    课程封面图（<span className="font-mono">uploads/curriculum/covers/</span>
                    ）。换封面只是改课程上的字段，旧图会留在盘上 —— 就是这里的孤儿。
                  </p>
                  <div className="space-y-1.5">
                    {(assetLibrary?.covers.items || []).map((cover) => {
                      const isPendingDelete = pendingDeleteAsset === cover.relativePath;
                      return (
                        <div
                          key={cover.relativePath}
                          className={cn(
                            'px-2.5 py-2 rounded-xl border text-xs',
                            darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate flex-1 font-mono text-[11px]" title={cover.relativePath}>
                              {cover.fileName}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-500 font-mono">
                              {formatBytes(cover.sizeBytes)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {cover.referencedBy.length > 0 ? (
                              <span
                                className="text-[10px] text-emerald-400 truncate"
                                title={cover.referencedBy.map((r) => r.title).join('\n')}
                              >
                                ✓ {cover.referencedBy[0].title}
                                {cover.referencedBy.length > 1
                                  ? ` 等 ${cover.referencedBy.length} 门课`
                                  : ''}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400">⚠ 孤儿：没有任何课程在用</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <a
                                href={cover.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 text-slate-500 hover:text-sky-400"
                                title="在新标签打开预览"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(cover.relativePath);
                                  setAssetMsg(`已复制路径：${cover.relativePath}`);
                                }}
                                className="p-1 text-slate-500 hover:text-sky-400"
                                title="复制相对路径（可粘到课程的 coverImage）"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {isPendingDelete ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteAsset(cover, cover.referencedBy.length > 0)}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white"
                                  >
                                    {cover.referencedBy.length > 0 ? '强删' : '确认删'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteAsset(null)}
                                    className="p-1 text-slate-500 hover:text-slate-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssetMsg('');
                                    setPendingDeleteAsset(cover.relativePath);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-400"
                                  title="删除这个文件"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {assetLibrary && assetLibrary.covers.items.length === 0 && (
                      <p className="text-[11px] text-slate-500">还没有上传过封图。</p>
                    )}
                  </div>
                </div>

                {/** ④ 悬空引用：被引用但文件不在 —— C 端会点出假播放按钮 / 封面裂图 */}
                {!!assetLibrary?.dangling.length && (
                  <div className={cn(cardClass, 'p-4 border-rose-500/40')}>
                    <span className="text-xs font-bold flex items-center gap-1.5 text-rose-300 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      悬空引用（{assetLibrary.dangling.length}）
                    </span>
                    <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                      下面这些地址被课程引用了，但后端已经没有对应文件 —— C 端会给出一个点不开的播放按钮。
                    </p>
                    <div className="space-y-1.5">
                      {assetLibrary.dangling.map((d) => (
                        <div
                          key={`${d.kind}-${d.path}`}
                          className="px-2 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 text-[10px]"
                        >
                          <div className="font-mono truncate text-rose-200" title={d.path}>
                            {d.path}
                          </div>
                          <div className="text-slate-400 mt-0.5">
                            被 {d.referencedBy.length} 处引用：
                            {d.referencedBy.map((r) => r.title).join('、')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
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

              {/** 文件 ≠ 记录：删记录不删文件就会在磁盘上留孤儿（所以默认勾上） */}
              {pendingDeleteFilePaths.length > 0 && (
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteFilesWithVideo}
                    onChange={(e) => setDeleteFilesWithVideo(e.target.checked)}
                    className="mt-0.5 accent-rose-500"
                  />
                  <span className="text-[11px] text-slate-300 leading-relaxed">
                    同时删掉它指向的 {pendingDeleteFilePaths.length} 个本地视频文件
                    <span className="block text-[10px] text-slate-500">
                      后端会先查引用：被其它记录/课时内联副本用着的会被拦下不删。
                    </span>
                  </span>
                </label>
              )}
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
