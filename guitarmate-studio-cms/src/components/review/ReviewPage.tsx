import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  Eye,
  FileJson,
  Loader2,
  Music2,
  Pause,
  Play,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ApiTabProject,
  type ApiTranscriptionCapabilitiesResponse,
  type ApiTranscriptionProjectDetail,
  type ApiTranscriptionProjectSummary,
  type ApiTranscriptionPublishResult,
} from '../../services/api';
import { StandardTabSystemRenderer } from './StandardTabSystemRenderer';
import { NoteInspector } from './NoteInspector';
import { RevisionPanel, type PublishedRevision } from './RevisionPanel';
import { TrackMixerPanel } from './TrackMixerPanel';
import { useDraftHistory } from './useDraftHistory';
import { practicePackageToTabProject, type PackageLike } from './revisionStore';
import { NoteAddDialog, type NewNoteSpec } from '../studios/tablature/NoteAddDialog';
import { useMultiTrackPlayer, type MultiTrackSource } from '../../hooks/useMultiTrackPlayer';
import { useTabAutoScroll } from '../../hooks/useTabAutoScroll';
import { audioEngine } from '../../utils/audioEngine';
import { stemLabel } from '../../utils/instrumentLabels';
import {
  DEFAULT_REVIEW_META,
  applyAddNote,
  applyMeasurePosition,
  applyMeasureRefinger,
  applyNoteEdit,
  isSimulatedTabProject,
  positionLabel,
  summarizeReview,
  tabProjectToReviewMeasures,
  tabProjectWarnings,
  toRoman,
  type ReviewMeasure,
  type ReviewNote,
} from './reviewTypes';

/**
 * 音频转录复核工作台（ReviewPage）
 * ==============================
 *
 * ```
 *  上传 MP3/WAV/FLAC 或填 URL ─► 队列自动跑 separate → transcribe → convert
 *        ↓（轮询进度，实时显示每阶段耗时/错误）
 *  逐小节复核：StandardTabRenderer（标准六线谱）+ NoteOverlay（低置信度标红）+ NoteInspector（改弦号/品位/时值/技巧/手指/把位）
 *        ↓
 *  保存复核（PATCH tabProject）→ 发布（切音频 + 上传 OSS + 生成 PracticePackage）→ 预览 C 端契约 JSON
 * ```
 *
 * 与「六线谱导入工作台 / 音频与六线谱对齐」的关系：
 * - `TabImportStudio`：人工制谱（ASCII/MusicXML/GPX）→ TabProject
 * - **本工作台**：原始音频 → Demucs/Basic Pitch/Tayuya → TabProject（**同一结构**）→ PracticePackage
 * - `AudioTabSyncStudio`：对已发布的 Score/Measure 做精细对齐（可选的回流链路）
 */
export interface ReviewPageProps {
  darkMode: boolean;
  /** 从其它工作台跳转进来时直接定位的项目 */
  initialProjectId?: string;
  /** 发布并镜像到既有发布链路后，可跳到「音频与六线谱对齐」继续精修 */
  onOpenInAudioStudio?: (scoreId: string) => void;
  /** 点「预览」→ 打开该曲目的预览页（按小程序渲染 + 音频对齐播放） */
  onPreviewProject?: (projectId: string) => void;
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  darkMode,
  initialProjectId,
  onOpenInAudioStudio,
  onPreviewProject,
}) => {
  // ── 全局状态 ──
  const [capabilities, setCapabilities] = useState<ApiTranscriptionCapabilitiesResponse | null>(null);
  const [queueDriver, setQueueDriver] = useState<string>('');
  const [projects, setProjects] = useState<ApiTranscriptionProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialProjectId || '');
  const [detail, setDetail] = useState<ApiTranscriptionProjectDetail | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [message, setMessage] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);

  // ── 复核草稿 + 撤销历史（需求 2.3：回滚到之前的修改点）──
  const {
    present: draft,
    dirty,
    commit: commitDraft,
    reset: loadDraft,
    undo: undoDraft,
    redo: redoDraft,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    markClean: markDraftClean,
  } = useDraftHistory<ApiTabProject>();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);
  /** 检查器可折叠：窄窗口下可以把它收起来，把宽度全留给谱面 */
  const [showInspector, setShowInspector] = useState(true);
  /**
   * 弦线上的数字：默认 `'fret'`（**品位优先**）—— 六线谱的第一信息就是品位，
   * 把位则由每小节左上角的「N 把位」给出（第一顺位标注）。
   * `'finger'` 只在复核左手指法时切换。
   */
  const [noteLabel, setNoteLabel] = useState<'finger' | 'fret'>('fret');
  /**
   * 每个**编辑段落**（谱行）放几个小节 —— 与市面练习谱一致：2-3 个小节一行。
   * 选修正好覆盖「单小节精修 / 标准练习谱版式 / 紧凑版式」三种复核习惯。
   */
  const [perSystem, setPerSystem] = useState<1 | 2 | 3>(2);
  const [collapsedMeasures, setCollapsedMeasures] = useState<Set<number>>(new Set());

  // ── 对照音频校正（需求 2.1 / 2.2）──
  /** 源音频可访问 URL（原声全轨），分轨走 detail.tracks[].stemUrl */
  const [sourceAudioUrl, setSourceAudioUrl] = useState<string>('');
  /** 波形面板折叠（**默认折叠**：把纵向空间留给谱面，谱面自带进度条+播放头） */
  const [mixerCollapsed, setMixerCollapsed] = useState(true);
  /** 新增节点弹窗 */
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  /** 波形 128 点能量包络（拿不到波形时为 []，不影响校正） */
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  /** 上一次录入的节点设置（连续录入时不用每次重选） */
  const [lastNoteSpec, setLastNoteSpec] = useState<Partial<NewNoteSpec>>({});
  /** 发布历史（回滚到任意一次发布） */
  const [publishedRevisions, setPublishedRevisions] = useState<PublishedRevision[]>([]);
  /** 第 ① 步导入区的拖拽高亮 */
  const [dragActive, setDragActive] = useState(false);

  // ── 新建项目表单 ──
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newBpm, setNewBpm] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ── 发布结果 / 契约预览 ──
  const [publishResult, setPublishResult] = useState<ApiTranscriptionPublishResult | null>(null);
  const [packagePreview, setPackagePreview] = useState<string>('');

  const notify = (kind: 'info' | 'error' | 'success', text: string) => {
    setMessage({ kind, text });
    if (kind !== 'error') setTimeout(() => setMessage(null), 5000);
  };

  const describeError = (err: unknown): string => {
    if (err instanceof ApiError) return err.message;
    return err instanceof Error ? err.message : String(err);
  };

  // ═══════════════════════════════════════════
  // 加载：能力 / 队列 / 项目列表
  // ═══════════════════════════════════════════

  const loadCapabilities = useCallback(async (force = false) => {
    try {
      const [caps, queue] = await Promise.all([
        api.getTranscriptionCapabilities(force),
        api.getTranscriptionQueue(),
      ]);
      setCapabilities(caps);
      setQueueDriver(`${queue.counts.driver}（${queue.counts.queueName}）`);
    } catch (err) {
      notify('error', `能力探测失败：${describeError(err)}`);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.listTranscriptionProjects(80);
      setProjects(res.projects);
      return res.projects;
    } catch (err) {
      notify('error', `加载项目列表失败：${describeError(err)}`);
      return [];
    }
  }, []);

  const loadDetail = useCallback(
    async (projectId: string, keepDraft = false) => {
      try {
        const res = await api.getTranscriptionProject(projectId);
        setDetail(res.project);
        if (!keepDraft) {
          loadDraft(res.project.tabProject);
          setSelectedNoteId(null);
        }
        return res.project;
      } catch (err) {
        notify('error', `加载项目失败：${describeError(err)}`);
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    loadCapabilities();
    loadProjects();
  }, [loadCapabilities, loadProjects]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ── 流水线运行中时轮询 ──
  const runningStatuses = ['pending', 'downloading', 'separating', 'transcribing', 'converting'];
  useEffect(() => {
    if (!selectedId || !detail) return;
    if (!runningStatuses.includes(detail.status)) return;
    const timer = setInterval(async () => {
      const next = await loadDetail(selectedId, true);
      if (next && !runningStatuses.includes(next.status)) {
        loadDraft(next.tabProject);
        loadProjects();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [selectedId, detail, loadDetail, loadProjects]);

  // ═══════════════════════════════════════════
  // 派生视图模型
  // ═══════════════════════════════════════════

  const measures: ReviewMeasure[] = useMemo(
    () => tabProjectToReviewMeasures(draft),
    [draft],
  );
  const stats = useMemo(() => summarizeReview(measures), [measures]);

  const visibleMeasures = useMemo(
    () => (onlyLowConfidence ? measures.filter((m) => m.lowConfidenceCount > 0) : measures),
    [measures, onlyLowConfidence],
  );

  /**
   * 「编辑段落」（谱行）= 每行 1-3 个小节。
   * 谱面按段落整行排版（与市面练习谱一致），复核时一眼就能看到
   * 「这 2-3 小节的把位 / 推荐和弦 / 节奏型」是否连贯。
   */
  const systems = useMemo(() => {
    const size = Math.max(1, Math.min(3, perSystem));
    const out: ReviewMeasure[][] = [];
    for (let i = 0; i < visibleMeasures.length; i += size) {
      out.push(visibleMeasures.slice(i, i + size));
    }
    return out;
  }, [visibleMeasures, perSystem]);

  /** 全曲扁平音符顺序（用于检查器的上一个/下一个） */
  const flatNotes: ReviewNote[] = useMemo(() => measures.flatMap((m) => m.notes), [measures]);
  const selectedIndex = useMemo(
    () => flatNotes.findIndex((n) => n.id === selectedNoteId),
    [flatNotes, selectedNoteId],
  );
  const selectedNote = selectedIndex >= 0 ? flatNotes[selectedIndex] : null;
  const tuning = draft?.tuning || DEFAULT_REVIEW_META.tuning;
  // 从 draft 里提前取出渲染需要的标量：避免在 map 回调里引用可能为 null 的对象
  const tabBpm = draft?.meta?.bpm || DEFAULT_REVIEW_META.bpm;
  const tabTimeSignature = draft?.meta?.timeSignature || DEFAULT_REVIEW_META.timeSignature;
  const tabCapo = draft?.capo || 0;

  const warnings = useMemo(() => tabProjectWarnings(draft), [draft]);
  const simulated = useMemo(() => isSimulatedTabProject(draft), [draft]);

  // ═══════════════════════════════════════════
  // 对照音频：多音轨播放 + 谱面跟随（需求 2.1 / 2.2）
  // ═══════════════════════════════════════════

  /**
   * 音轨清单 = 原声（全轨）+ 各条分轨。
   *
   * 降级约定（与产品确认过）：Demucs 不可用时后端只会产出 1 条 `guitar` 分轨，
   * 此时清单自然是「原声（全轨）/ 吉他分轨」两条 —— 也就是**原声 / 伴奏**双声道，
   * 组件层不需要特判。
   */
  const playerSources: MultiTrackSource[] = useMemo(() => {
    const list: MultiTrackSource[] = [];
    if (sourceAudioUrl) {
      list.push({ id: 'original', label: '原声（全轨）', url: sourceAudioUrl, role: 'original' });
    }
    for (const track of detail?.tracks || []) {
      if (!track.stemUrl) continue;
      if (track.stemUrl === sourceAudioUrl) continue;
      list.push({
        id: `stem:${track.instrument}`,
        label: stemLabel(track.instrument),
        url: track.stemUrl,
        role: 'stem',
        instrument: track.instrument,
      });
    }
    return list;
  }, [detail?.tracks, sourceAudioUrl]);

  const player = useMultiTrackPlayer(playerSources, { timeUpdateIntervalMs: 50 });

  /** 播放头落在哪个小节（-1 = 不在任何小节内） */
  const [activeMeasureIndex, setActiveMeasureIndex] = useState(-1);
  useEffect(() => {
    const t = player.currentTimeSec;
    const idx = measures.findIndex((m) => t >= m.startTime - 1e-6 && t < m.endTime + 1e-6);
    setActiveMeasureIndex((prev) => (prev === idx ? prev : idx));
  }, [player.currentTimeSec, measures]);

  /** 谱面随音频滚动：把当前小节滚到列表中间 */
  const { containerRef: measureListRef, registerItem: registerMeasureRow } = useTabAutoScroll(
    activeMeasureIndex,
    player.isPlaying,
    { smooth: true },
  );

  /** 波形峰值：抓一次源音频算 128 点包络；跨域/失败则退化成"只有播放头与刻度" */
  const peaksCacheRef = useRef<Map<string, number[]>>(new Map());
  useEffect(() => {
    if (!sourceAudioUrl) return;
    const cached = peaksCacheRef.current.get(sourceAudioUrl);
    if (cached) {
      setWaveformPeaks(cached);
      return;
    }
    let cancelled = false;
    setWaveformPeaks([]);
    (async () => {
      try {
        const res = await fetch(sourceAudioUrl);
        if (!res.ok) throw new Error(String(res.status));
        const buffer = await res.arrayBuffer();
        const { peaks } = await audioEngine.extractWaveformPeaks(buffer, 128);
        if (cancelled) return;
        peaksCacheRef.current.set(sourceAudioUrl, peaks);
        setWaveformPeaks(peaks);
      } catch {
        /* 拿不到波形不影响校正：仍可拖拽/点击时间轴 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceAudioUrl]);

  /** 源音频 URL + 发布历史（切项目时刷新） */
  useEffect(() => {
    if (!selectedId) {
      setSourceAudioUrl('');
      setPublishedRevisions([]);
      return;
    }
    let cancelled = false;
    api
      .getTranscriptionAudioUrl(selectedId)
      .then((res) => {
        if (!cancelled) setSourceAudioUrl(res.audioUrl || res.url || '');
      })
      .catch(() => {
        if (!cancelled) setSourceAudioUrl('');
      });
    api
      .getTranscriptionRevisions(selectedId)
      .then((res) => {
        if (!cancelled) setPublishedRevisions(res.revisions || []);
      })
      .catch(() => {
        if (!cancelled) setPublishedRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, detail?.updatedAt]);

  /** 切换项目时把播放器归零（避免上一首的播放头/音轨残留） */
  useEffect(() => {
    player.reset();
    setActiveMeasureIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const activeMeasure = activeMeasureIndex >= 0 ? measures[activeMeasureIndex] : undefined;
  const waveformMarkers = useMemo(
    () =>
      measures.map((m, i) => ({
        time: m.startTime,
        label: `M${m.displayIndex}`,
        active: i === activeMeasureIndex,
        title: `第 ${m.displayIndex} 小节 · ${m.startTime.toFixed(2)}s`,
      })),
    [measures, activeMeasureIndex],
  );

  // ═══════════════════════════════════════════
  // 交互
  // ═══════════════════════════════════════════

  const patchNote = (
    patch: Partial<Pick<ReviewNote, 'string' | 'fret' | 'durationSec' | 'technique' | 'finger'>>,
  ) => {
    if (!draft || !selectedNote) return;
    commitDraft(applyNoteEdit(draft, selectedNote.measureIndex, selectedNote.id, patch));
  };

  /** 改小节把位（小节级属性：一个小节内换把意味着手型整体平移） */
  const patchMeasurePosition = (measureIndex: number, position: number | undefined) => {
    if (!draft) return;
    commitDraft(applyMeasurePosition(draft, measureIndex, position));
  };

  /** 按当前把位重算本小节所有音符的手指 */
  const refingerMeasureAt = (measureIndex: number) => {
    if (!draft) return;
    commitDraft(applyMeasureRefinger(draft, measureIndex));
  };

  const deleteSelectedNote = () => {
    if (!draft || !selectedNote) return;
    const { measureIndex, id } = selectedNote;
    const next: ApiTabProject = {
      ...draft,
      tracks: draft.tracks.map((track, tIndex) =>
        tIndex !== 0
          ? track
          : {
              ...track,
              measures: track.measures.map((m, index) =>
                index !== measureIndex
                  ? m
                  : { ...m, notes: m.notes.filter((raw: any, i: number) => String(raw.id || `m${m.index}_n${i}`) !== id) },
              ),
            },
      ),
    };
    commitDraft(next);
    setSelectedNoteId(null);
  };

  /**
   * 在**播放头**位置新增一个节点（需求 2.2：校正不只是删改，还要能加）。
   * 目标小节优先取播放头所在小节，其次取当前选中音符所在小节。
   */
  const handleAddNote = (spec: NewNoteSpec) => {
    if (!draft) return;
    const measureIndex = activeMeasureIndex >= 0 ? activeMeasureIndex : (selectedNote?.measureIndex ?? 0);
    const target = measures[measureIndex];
    if (!target) {
      notify('error', '没有可写入的小节，请先把播放头移到谱面范围内');
      return;
    }
    const relativeSec = Math.max(0, Math.min(target.duration, player.currentTimeSec - target.startTime));
    commitDraft(applyAddNote(draft, measureIndex, { ...spec, offsetSec: relativeSec }));
    setLastNoteSpec(spec);
    setIsAddNoteOpen(false);
    notify('success', `已在第 ${target.displayIndex} 小节 +${relativeSec.toFixed(2)}s 新增 ${spec.string} 弦 ${spec.fret} 品`);
  };

  /** 恢复本地存点到草稿（只改内存，仍需「保存复核」才落库；可再撤销） */
  const handleRestoreSnapshot = (project: ApiTabProject, label: string) => {
    commitDraft(project);
    notify('info', `已恢复到存点「${label}」—— 确认后点「保存复核」写回后端`);
  };

  /** 回滚到某个已发布版本：拉发布快照 → 反解成 TabProject 草稿 */
  const handleRollbackToRevision = async (revision: number) => {
    if (!selectedId || !draft) return;
    setBusy(`rollback-${revision}`);
    try {
      const res = await api.getTranscriptionPackage(selectedId, revision);
      commitDraft(practicePackageToTabProject(res.package as PackageLike, draft));
      notify('info', `已回滚到发布快照 r${revision} —— 确认无误后点「保存复核」`);
    } catch (err) {
      notify('error', `回滚失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  /** Ctrl+Z / Ctrl+Shift+Z 撤销重做（仅在编辑区、未聚焦输入框时生效） */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redoDraft();
      else undoDraft();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoDraft, undoDraft]);

  const saveReview = async () => {
    if (!selectedId || !draft) return;
    setBusy('save');
    try {
      await api.updateTranscriptionProject(selectedId, {
        tabProject: draft,
        bpm: draft.meta?.bpm,
        timeSignature: draft.meta?.timeSignature,
        capo: draft.capo,
        tuning: draft.tuning,
        license: detail?.license || undefined,
      });
      markDraftClean();
      notify('success', '复核结果已保存（发布时会使用这份数据，而不是模型原始输出）');
      await loadDetail(selectedId, true);
    } catch (err) {
      notify('error', `保存失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const runPublish = async (mirror: boolean) => {
    if (!selectedId) return;
    setBusy('publish');
    setPublishResult(null);
    setPackagePreview('');
    try {
      const res = await api.publishTranscriptionProject(selectedId, {
        publishedBy: 'cms',
        channel: 'guitar',
        audioFallback: 'source',
        allowMissingAudio: true,
        mirrorToScorePipeline: mirror,
      });
      setPublishResult(res);
      notify(
        'success',
        `已发布 PracticePackage r${res.revision}：${res.stats.measureCount} 小节 / ${res.stats.noteCount} 音符` +
          `（切片 ${res.stats.slicedAudioCount}，降级 ${res.stats.degradedAudioCount}）`,
      );
      await loadDetail(selectedId, true);
      await loadProjects();
    } catch (err) {
      notify('error', `发布失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const loadPackagePreview = async () => {
    if (!selectedId) return;
    setBusy('package');
    try {
      const res = await api.getTranscriptionPackage(selectedId);
      setPackagePreview(JSON.stringify(res, null, 2));
    } catch (err) {
      notify('error', `读取契约失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleUploadFile = async (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.mp3', '.wav', '.flac'].includes(ext)) {
      notify('error', `只支持 MP3 / WAV / FLAC，收到 ${ext || '(无扩展名)'}`);
      return;
    }
    if (file.size > 24 * 1024 * 1024) {
      notify('error', `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB > 24MB），请压缩后重试或改用 URL 导入`);
      return;
    }
    setBusy('upload');
    try {
      const base64 = await readFileAsBase64(file);
      const res = await api.createTranscriptionProjectFromUpload({
        title: newTitle.trim() || file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        base64,
        bpm: Number(newBpm) > 0 ? Number(newBpm) : undefined,
        license: 'user_uploaded',
      });
      setSelectedId(res.project.id);
      notify('success', `已上传并入队（${res.started?.stage} 阶段，队列驱动 ${res.started?.driver}）`);
      await loadProjects();
    } catch (err) {
      notify('error', `上传失败：${describeError(err)}`);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCreateFromUrl = async () => {
    if (!newUrl.trim()) return;
    setBusy('url');
    try {
      const res = await api.createTranscriptionProjectFromUrl({
        url: newUrl.trim(),
        title: newTitle.trim() || undefined,
        bpm: Number(newBpm) > 0 ? Number(newBpm) : undefined,
        license: 'user_uploaded',
      });
      setNewUrl('');
      setSelectedId(res.project.id);
      notify('success', '已创建 URL 转录项目并开始下载（yt-dlp）');
      await loadProjects();
    } catch (err) {
      notify('error', `URL 导入失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleRetry = async () => {
    if (!selectedId) return;
    setBusy('retry');
    try {
      const res = await api.retryTranscriptionProject(selectedId);
      notify('info', `已从「${res.stage}」阶段重新入队`);
      await loadDetail(selectedId, true);
    } catch (err) {
      notify('error', `重试失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setBusy('delete');
    try {
      await api.deleteTranscriptionProject(selectedId);
      setSelectedId('');
      setDetail(null);
      loadDraft(null);
      notify('info', '项目已删除');
      await loadProjects();
    } catch (err) {
      notify('error', `删除失败：${describeError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const toggleMeasure = (index: number) => {
    setCollapsedMeasures((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // ═══════════════════════════════════════════
  // 样式
  // ═══════════════════════════════════════════

  const surface = darkMode ? 'bg-slate-900/60 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  const subtle = darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200';
  const field = darkMode ? 'bg-slate-950/70 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800';
  const hoverRow = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100';

  const caps = capabilities?.capabilities;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ═══ 顶部状态条 ═══ */}
      <div className={`shrink-0 border-b px-5 py-3 ${surface}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Wand2 size={17} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">音频转录复核工作台</h2>
              <p className="text-[11px] text-slate-500">
                上传 MP3/WAV/FLAC 或 URL(yt-dlp) → Demucs 分离 → Basic Pitch 转录 → Tayuya 转谱 → 人工复核 → PracticePackage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <Badge
              icon={<Cpu size={11} />}
              tone={caps?.simulate && (!caps.demucs.available || !caps.basicPitch.available) ? 'warn' : 'ok'}
              label={caps ? `${caps.python.available ? 'Python ✓' : 'Python ✗'} · ${caps.demucs.available ? 'Demucs ✓' : 'Demucs ✗'} · ${caps.basicPitch.available ? 'BasicPitch ✓' : 'BasicPitch ✗'} · ${caps.tayuya.available ? 'Tayuya ✓' : 'Tayuya ✗'}` : '检测能力中…'}
            />
            <Badge
              icon={<Cloud size={11} />}
              tone={queueDriver.startsWith('bullmq') ? 'ok' : 'warn'}
              label={`队列 ${queueDriver || '…'}`}
            />
            <button
              type="button"
              onClick={() => loadCapabilities(true)}
              title="强制重新探测本机能力"
              className={`p-1.5 rounded-lg border ${field}`}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] ${
              message.kind === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                : message.kind === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
            }`}
          >
            {message.kind === 'error' ? <AlertTriangle size={12} className="mt-0.5" /> : <CheckCircle2 size={12} className="mt-0.5" />}
            <span className="whitespace-pre-wrap">{message.text}</span>
          </div>
        )}

        {capabilities && (caps?.simulate ?? false) && (!caps?.demucs.available || !caps?.basicPitch.available) && (
          /**
           * 默认折叠：这条提示讲的是「本机依赖」，与当前曲目无关，
           * 但展开时占 100+px，会把「波形 + 谱面」挤到看不全 —— 折成一行摘要。
           */
          <details className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <summary className="cursor-pointer font-semibold select-none">
              当前为「模拟转录」模式（Python 依赖不全）—— 展开查看安装命令
            </summary>
            <div className="mt-1 text-amber-200/80">
              链路完全可用，但音符是按节拍网格生成的练习乐句，不能当作真实转录结果上线。安装依赖后可获得真实转录：
            </div>
            <ul className="mt-1 list-disc list-inside font-mono text-amber-200/80">
              {(capabilities.installHints || []).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* ═══ 主体三栏 ═══ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── 左：项目列表 + 新建 ── */}
        <aside className={`w-[260px] shrink-0 border-r flex flex-col min-h-0 ${surface}`}>
          <div className={`p-4 border-b ${subtle} space-y-2`}>
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Upload size={12} className="text-amber-400" /> 新建转录项目
            </div>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="曲目名（可留空，默认用文件名）"
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${field}`}
            />
            <div className="flex items-center gap-2">
              <input
                value={newBpm}
                onChange={(e) => setNewBpm(e.target.value)}
                placeholder="BPM（可空，自动估计）"
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${field}`}
              />
              <input
                ref={fileRef}
                type="file"
                accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f);
                }}
              />
              <button
                type="button"
                disabled={busy === 'upload'}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {busy === 'upload' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                上传音频
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="或粘贴 URL（yt-dlp：YouTube/B站/直链）"
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${field}`}
              />
              <button
                type="button"
                disabled={busy === 'url' || !newUrl.trim()}
                onClick={handleCreateFromUrl}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
              >
                {busy === 'url' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                下载
              </button>
            </div>
            <div className="text-[10px] text-slate-500">
              文件上限 24MB（base64 传输，与既有 tab-import 同一约定，无需 multer 依赖）
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {projects.length === 0 && (
              <div className="p-4 text-[11px] text-slate-500">
                还没有转录项目。上传一段音频（或填 URL）即可开始，队列会自动跑完三个阶段。
              </div>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-4 py-3 border-b transition-colors ${
                  selectedId === p.id
                    ? 'bg-amber-500/10 border-l-2 border-l-amber-500 border-slate-800'
                    : `border-slate-800/60 ${hoverRow}`
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{p.title}</span>
                  <StatusPill status={p.status} label={p.statusLabel} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{p.sourceType === 'url' ? 'URL' : '上传'}</span>
                  {p.durationSec ? <span>· {p.durationSec.toFixed(1)}s</span> : null}
                  <span>· {p.progress}%</span>
                  {p.counts ? <span>· {p.counts.tracks} 轨</span> : null}
                </div>
                {p.stageNote && <div className="mt-1 text-[10px] text-slate-500 truncate">{p.stageNote}</div>}
              </button>
            ))}
          </div>
        </aside>

        {/* ── 中：谱面复核 ── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!detail ? (
            /* ═══ 第 ① 步：导入音频（整条流水线的关键入口） ═══ */
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="mx-auto max-w-3xl space-y-5">
                {/* 步骤导览 */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  {[
                    { n: '①', label: '导入音频' },
                    { n: '②', label: '校正六线谱' },
                    { n: '③', label: '预览跟弹' },
                    { n: '④', label: '数据契约' },
                    { n: '⑤', label: '发布到音乐库' },
                  ].map((step, i) => (
                    <React.Fragment key={step.n}>
                      {i > 0 && <span className="text-slate-600">→</span>}
                      <span
                        className={`rounded-full border px-2.5 py-1 ${
                          i === 0
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 font-semibold'
                            : 'border-slate-700 text-slate-500'
                        }`}
                      >
                        {step.n} {step.label}
                      </span>
                    </React.Fragment>
                  ))}
                </div>

                <div className={`rounded-2xl border p-6 ${surface}`}>
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-amber-400" />
                    <h3 className="text-sm font-semibold">上传音频文件，自动转成标准六线谱</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    支持 MP3 / WAV / FLAC（≤24MB）。上传后自动跑 download → Demucs 分离 → 音高转录 → 转谱，
                    产出可编辑的六线谱；也可以直接粘贴音频 URL（YouTube / B站 / 直链）。
                  </p>

                  {/* 拖拽区 */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void handleUploadFile(file);
                    }}
                    className={`mt-4 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                      dragActive
                        ? 'border-amber-400 bg-amber-500/10'
                        : darkMode
                          ? 'border-slate-700 hover:border-slate-500'
                          : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <Upload size={22} className="mx-auto text-amber-400" />
                    <div className="mt-2 text-xs">把音频拖到这里，或</div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy === 'upload'}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
                    >
                      {busy === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {busy === 'upload' ? '上传中…' : '选择音频文件'}
                    </button>
                  </div>

                  {/* URL 导入 */}
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreateFromUrl();
                      }}
                      placeholder="或粘贴音频 URL（yt-dlp：YouTube / B站 / 直链）"
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs ${field}`}
                    />
                    <button
                      type="button"
                      onClick={handleCreateFromUrl}
                      disabled={!newUrl.trim() || busy === 'url'}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-40 ${field}`}
                    >
                      {busy === 'url' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      下载并转录
                    </button>
                  </div>

                  {/* 可选：曲目名 / BPM */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="曲目名（可留空，默认用文件名）"
                      className={`rounded-lg border px-3 py-2 text-xs ${field}`}
                    />
                    <input
                      value={newBpm}
                      onChange={(e) => setNewBpm(e.target.value)}
                      placeholder="BPM（可空，自动估计）"
                      className={`rounded-lg border px-3 py-2 text-xs ${field}`}
                    />
                  </div>
                </div>

                {/* 最近的转录项目 */}
                {projects.length > 0 && (
                  <div className={`rounded-2xl border p-4 ${surface}`}>
                    <div className="text-xs font-semibold mb-2">或继续之前的项目</div>
                    <div className="grid grid-cols-2 gap-2">
                      {projects.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-[11px] transition ${hoverRow} ${
                            darkMode ? 'border-slate-800' : 'border-slate-200'
                          }`}
                        >
                          <div className="truncate font-medium">{p.title}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {p.statusLabel} · {p.counts?.tracks ?? 0} 轨 · {p.durationSec ? `${p.durationSec.toFixed(0)}s` : '—'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 项目操作条 */}
              <div className={`shrink-0 border-b px-5 py-3 ${surface}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{detail.title}</span>
                      <StatusPill status={detail.status} label={detail.statusLabel} />
                      {simulated && <Badge icon={<AlertTriangle size={11} />} tone="warn" label="模拟转录" />}
                      {dirty && <Badge icon={<Save size={11} />} tone="warn" label="有未保存修改" />}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      进度 {detail.progress}% · {detail.stageNote || '—'}
                      {detail.durationSec ? ` · 音频 ${detail.durationSec.toFixed(1)}s` : ''}
                      {` · 已发布 r${detail.latestRevision}`}
                    </div>
                    {detail.error && (
                      <div className="mt-1 text-[11px] text-rose-400 whitespace-pre-wrap">
                        {detail.error.slice(0, 400)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {runningStatuses.includes(detail.status) && (
                      <Badge icon={<Loader2 size={11} className="animate-spin" />} tone="info" label="流水线运行中" />
                    )}
                    {['failed'].includes(detail.status) && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={busy === 'retry'}
                        className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20"
                      >
                        <RotateCcw size={12} /> 从失败阶段重试
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveReview}
                      disabled={!draft || busy === 'save'}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      保存复核
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInspector((v) => !v)}
                      title={showInspector ? '收起检查器（把宽度留给谱面）' : '展开音符检查器'}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${field}`}
                    >
                      <Music2 size={12} /> 检查器
                    </button>
                    <button
                      type="button"
                      onClick={loadPackagePreview}
                      disabled={busy === 'package' || detail.latestRevision === 0}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40 ${field}`}
                    >
                      <FileJson size={12} /> 契约 JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddNoteOpen(true)}
                      disabled={!draft}
                      title="在播放头位置新增一个节点（弦 / 品位 / 时值 / 把位 / 技巧）"
                      className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                    >
                      <PlusCircle size={12} /> 新增节点
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedId && onPreviewProject?.(selectedId)}
                      disabled={!selectedId}
                      title="按小程序渲染预览（带音频对齐播放）；发现问题可回到本页继续校正"
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40 ${field}`}
                    >
                      <Eye size={12} /> 预览
                    </button>
                    <button
                      type="button"
                      onClick={() => runPublish(false)}
                      disabled={!draft || busy === 'publish'}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
                    >
                      {busy === 'publish' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      发布 PracticePackage
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy === 'delete'}
                      title="删除项目（级联删除任务/分轨/发布快照）"
                      className="p-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* 复核统计 */}
                <div className="mt-3 flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
                  <span>小节 {stats.measureCount}</span>
                  <span>音符 {stats.noteCount}</span>
                  <span className={stats.lowConfidenceCount > 0 ? 'text-rose-400' : ''}>
                    低置信度 {stats.lowConfidenceCount}
                  </span>
                  <span>平均置信度 {(stats.avgConfidence * 100).toFixed(0)}%</span>
                  <span>最高品位 {stats.maxFret}</span>
                  <span className={stats.withFingerCount > 0 ? 'text-amber-400' : ''}>
                    已标指法 {stats.withFingerCount}/{stats.noteCount}
                  </span>
                  <span>BPM {draft?.meta?.bpm ?? '—'}</span>
                  <span>拍号 {draft?.meta?.timeSignature ?? '—'}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyLowConfidence}
                      onChange={(e) => setOnlyLowConfidence(e.target.checked)}
                    />
                    只显示含低置信度的小节
                  </label>
                  <button
                    type="button"
                    onClick={() => setNoteLabel((v) => (v === 'fret' ? 'finger' : 'fret'))}
                    title="谱面弦线上的数字：品位（默认，把位优先）↔ 手指号（复核左手指法用）"
                    className={`rounded-lg border px-2 py-1 transition ${
                      noteLabel === 'fret'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {noteLabel === 'fret' ? '弦线数字：品位数' : '弦线数字：手指数'}
                  </button>
                  <span className="inline-flex items-center gap-1">
                    <span>每行小节数</span>
                    {([1, 2, 3] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPerSystem(n)}
                        title={
                          n === 1
                            ? '单小节一行（最宽的谱面，适合逐音精修）'
                            : `${n} 小节一行（练习谱的「编辑段落」版式）`
                        }
                        className={`rounded-md border px-2 py-0.5 transition ${
                          perSystem === n
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                            : 'border-slate-600/50 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </div>

                {warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {warnings.slice(0, 3).map((w, i) => (
                      <div
                        key={`${w.code}-${i}`}
                        className={`text-[11px] ${w.level === 'error' ? 'text-rose-400' : 'text-amber-300'}`}
                      >
                        ⚠ {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ② 对照音频：波形 + 播放 + 多音轨（需求 2.1） */}
              <div className="shrink-0 px-5 pt-4">
                <TrackMixerPanel
                  isDark={darkMode}
                  player={player}
                  sources={playerSources}
                  peaks={waveformPeaks}
                  durationSec={detail.durationSec || player.durationSec}
                  markers={waveformMarkers}
                  onSeek={(sec) => player.seek(sec)}
                  activeMeasureLabel={activeMeasure ? `第 ${activeMeasure.displayIndex} 小节` : undefined}
                  hint={
                    playerSources.length <= 1
                      ? simulated
                        ? '本机 Demucs 不可用，当前是「模拟转录」：只有原声 / 伴奏两路可听。谱面校正与发布链路不受影响。'
                        : '该项目只有 1 条音轨，已降级为「原声」单路试听。'
                      : undefined
                  }
                  collapsed={mixerCollapsed}
                  onToggleCollapse={() => setMixerCollapsed((v) => !v)}
                />
              </div>

              {/* 小节列表 */}
              <div ref={measureListRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {!draft && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200">
                    转录尚未产出 TabProject。请等待流水线跑完（状态变为「待人工复核」），
                    或点击「从失败阶段重试」。
                  </div>
                )}

                {draft && visibleMeasures.length === 0 && (
                  <div className="text-xs text-slate-500">没有符合筛选条件的小节。</div>
                )}

                {systems.map((group, systemIndex) => {
                  const anchor = group[0];
                  const collapsed = collapsedMeasures.has(anchor.index);
                  const first = group[0];
                  const last = group[group.length - 1];
                  const isLastSystem =
                    systemIndex === systems.length - 1 && last.index === measures[measures.length - 1]?.index;
                  const lowCount = group.reduce((sum, m) => sum + m.lowConfidenceCount, 0);
                  /** 当前播放位置落在这一行 → 高亮（谱面随音频滚动时的「你现在在这」） */
                  const isActiveSystem =
                    activeMeasureIndex >= first.index && activeMeasureIndex <= last.index;
                  return (
                    <section
                      key={anchor.index}
                      ref={(el) => registerMeasureRow(anchor.index, el)}
                      className={`rounded-2xl border overflow-hidden transition-shadow ${surface} ${
                        isActiveSystem ? 'ring-2 ring-emerald-500/50' : ''
                      }`}
                    >
                      <header className={`flex items-center justify-between px-4 py-2 ${subtle}`}>
                        <button
                          type="button"
                          onClick={() => toggleMeasure(anchor.index)}
                          className="flex items-center gap-2 text-xs font-medium"
                        >
                          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          {group.length > 1
                            ? `编辑段落 ${first.displayIndex}–${last.displayIndex}`
                            : first.label}
                          <span className="text-[10px] text-slate-500 font-normal">
                            {first.startTime.toFixed(2)}s–{last.endTime.toFixed(2)}s ·{' '}
                            {group.reduce((sum, m) => sum + m.duration, 0).toFixed(2)}s ·{' '}
                            {group.reduce((sum, m) => sum + m.notes.length, 0)} 音符
                          </span>
                          {/* 推荐和弦 + 把位（每个小节一组，与谱面标注一一对应） */}
                          {group.map((m) => (
                            <span key={m.index} className="flex items-center gap-1">
                              {m.chord && (
                                <span
                                  className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300"
                                  title={`第 ${m.displayIndex} 小节推荐和弦`}
                                >
                                  {m.chord}
                                </span>
                              )}
                              {typeof m.position === 'number' && m.position >= 1 && (
                                <span
                                  className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                                  title={`第 ${m.displayIndex} 小节：${positionLabel(m.position)}`}
                                >
                                  {m.position} 把位
                                </span>
                              )}
                            </span>
                          ))}
                        </button>
                        {lowCount > 0 && (
                          <span className="text-[10px] text-rose-400">{lowCount} 个待复核</span>
                        )}
                      </header>

                      {!collapsed && (
                        <div className="px-4 py-3">
                          <StandardTabSystemRenderer
                            measures={group.map((m) => ({
                              index: m.displayIndex,
                              label: m.label,
                              /** 整曲时间轴起点 —— 播放头/谱内进度条靠它定位 */
                              startTime: m.startTime,
                              notes: m.notes,
                              chords: m.chords,
                              chord: m.chord,
                              position: m.position,
                              duration: m.duration,
                            }))}
                            bpm={tabBpm}
                            timeSignature={tabTimeSignature}
                            tuning={tuning}
                            capo={tabCapo}
                            measureDuration={group[0].duration}
                            isDark={darkMode}
                            selectedNoteId={selectedNoteId}
                            onSelectNote={(id) => setSelectedNoteId(id)}
                            showLegend={systemIndex === 0}
                            /** 每条谱行都画 TAB 谱号 + 拍号；全曲第一条谱行加速度标记 */
                            showClef
                            showTempo={systemIndex === 0}
                            isLastSystem={isLastSystem}
                            noteLabel={noteLabel}
                            /** 复核时把手指上标也画出来（品位 + 手指一起看，改错更快） */
                            showFinger={noteLabel === 'fret'}
                            /** 播放行进条：谱内进度条 + 播放头 + 当前音符高亮 */
                            playheadTimeSec={player.currentTimeSec}
                          />
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* ── 右：检查器 + 发布结果 ── */}
        <aside className={`${showInspector ? 'w-[300px]' : 'w-0'} shrink-0 border-l overflow-y-auto transition-all ${surface}`}>
          <div className={showInspector ? 'p-4 space-y-3' : 'hidden'}>
          <NoteInspector
            note={selectedNote}
            tuning={tuning}
            capo={tabCapo}
            measureNoteCount={selectedNote ? measures[selectedNote.measureIndex]?.notes.length : undefined}
            measureIndexLabel={selectedNote ? `第 ${measures[selectedNote.measureIndex]?.displayIndex ?? selectedNote.measureIndex + 1} 小节` : undefined}
            measurePosition={
              selectedNote ? measures[selectedNote.measureIndex]?.position : undefined
            }
            onPatchMeasurePosition={
              selectedNote
                ? (position) => patchMeasurePosition(selectedNote.measureIndex, position)
                : undefined
            }
            onRefingerMeasure={
              selectedNote ? () => refingerMeasureAt(selectedNote.measureIndex) : undefined
            }
            darkMode={darkMode}
            onPatch={patchNote}
            onDelete={deleteSelectedNote}
            onPrev={() => selectedIndex > 0 && setSelectedNoteId(flatNotes[selectedIndex - 1].id)}
            onNext={() => selectedIndex >= 0 && selectedIndex < flatNotes.length - 1 && setSelectedNoteId(flatNotes[selectedIndex + 1].id)}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < flatNotes.length - 1}
            onClose={() => setSelectedNoteId(null)}
          />

          {/* 修订点：撤销 / 存点 / 回滚到已发布版本（需求 2.3） */}
          <RevisionPanel
            projectId={selectedId}
            isDark={darkMode}
            draft={draft}
            canUndo={canUndo}
            canRedo={canRedo}
            undoCount={undoCount}
            redoCount={redoCount}
            onUndo={undoDraft}
            onRedo={redoDraft}
            onRestore={handleRestoreSnapshot}
            onRollbackToRevision={handleRollbackToRevision}
            publishedRevisions={publishedRevisions}
            busy={busy}
          />

          {/* 流水线时间线 */}
          {detail && detail.jobs.length > 0 && (
            <div className={`rounded-2xl border p-4 ${surface}`}>
              <div className="text-xs font-semibold mb-2">阶段时间线</div>
              <div className="space-y-2">
                {[...detail.jobs].reverse().map((job) => (
                  <div key={job.id} className="flex items-start justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <div className="font-mono">
                        {job.stage}
                        {job.input?.instrument ? ` · ${job.input.instrument}` : ''}
                      </div>
                      {job.error && <div className="text-rose-400 truncate">{job.error}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <JobStatusPill status={job.status} />
                      {job.durationMs ? (
                        <div className="text-[10px] text-slate-500">{(job.durationMs / 1000).toFixed(1)}s</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 发布结果 */}
          {publishResult && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-[11px] text-emerald-200 space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={12} /> 已发布 r{publishResult.revision}（schemaVersion {publishResult.schemaVersion}）
              </div>
              <ul className="space-y-0.5">
                <li>小节 {publishResult.stats.measureCount} · 音符 {publishResult.stats.noteCount}</li>
                <li>
                  音频切片 {publishResult.stats.slicedAudioCount} · 降级 {publishResult.stats.degradedAudioCount} · 节拍器{' '}
                  {publishResult.stats.metronomeFallbackCount}
                </li>
                <li>低置信度 {publishResult.stats.lowConfidenceCount}</li>
              </ul>
              {publishResult.warnings?.length > 0 && (
                <div className="text-amber-200 space-y-0.5">
                  {publishResult.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                {publishResult.mirrored?.scoreId && onOpenInAudioStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenInAudioStudio(publishResult.mirrored.scoreId!)}
                    className="rounded-lg border border-emerald-500/40 px-2 py-1"
                  >
                    去对齐工作台精修
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runPublish(true)}
                  className="rounded-lg border border-emerald-500/40 px-2 py-1"
                  title="同时写入既有 Score/Track/Measure 链路（会先清空该曲目旧小节）"
                >
                  镜像到旧发布链路
                </button>
              </div>
            </div>
          )}

          {/* 契约预览 */}
          {packagePreview && (
            <div className={`rounded-2xl border p-4 ${surface}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">已发布契约快照</span>
                <button type="button" onClick={() => setPackagePreview('')} className="text-[10px] text-slate-500">
                  关闭
                </button>
              </div>
              <pre className="max-h-[320px] overflow-auto rounded-lg bg-slate-950/70 border border-slate-800 p-2 text-[10px] leading-relaxed text-slate-300">
                {packagePreview}
              </pre>
            </div>
          )}
          </div>
        </aside>
      </div>

      {/* 新增节点对话框（需求 2.2）：时间取播放头，落在当前小节内 */}
      <NoteAddDialog
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        onSubmit={handleAddNote}
        isDark={darkMode}
        atSec={player.currentTimeSec}
        relativeSec={
          activeMeasure
            ? Math.max(0, Math.min(activeMeasure.duration, player.currentTimeSec - activeMeasure.startTime))
            : 0
        }
        measureLabel={activeMeasure ? `第 ${activeMeasure.displayIndex} 小节` : undefined}
        beatSec={60 / (tabBpm > 0 ? tabBpm : 90)}
        tuning={tuning}
        capo={tabCapo}
        defaultPosition={activeMeasure?.position ?? 1}
        occupiedStrings={activeMeasure?.notes.map((n) => n.string) ?? []}
        lastUsed={lastNoteSpec}
      />
    </div>
  );
};

// ─────────────────────────────────────────────
// 小组件
// ─────────────────────────────────────────────

const Badge: React.FC<{ icon: React.ReactNode; tone: 'ok' | 'warn' | 'info'; label: string }> = ({
  icon,
  tone,
  label,
}) => {
  const tones = {
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${tones[tone]}`}>
      {icon}
      {label}
    </span>
  );
};

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  downloading: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  separating: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  transcribing: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  converting: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  review: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  failed: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

const StatusPill: React.FC<{ status: string; label: string }> = ({ status, label }) => (
  <span
    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
      STATUS_TONES[status] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }`}
  >
    {label}
  </span>
);

const JobStatusPill: React.FC<{ status: string }> = ({ status }) => {
  const tone =
    status === 'completed'
      ? 'text-emerald-400'
      : status === 'failed'
        ? 'text-rose-400'
        : status === 'active'
          ? 'text-sky-400'
          : 'text-slate-400';
  return <span className={`text-[10px] font-mono ${tone}`}>{status}</span>;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export default ReviewPage;
