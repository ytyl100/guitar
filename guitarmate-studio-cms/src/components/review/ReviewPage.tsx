import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  FileJson,
  Loader2,
  Music2,
  Play,
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
import { StandardTabRenderer } from './StandardTabRenderer';
import { NoteInspector } from './NoteInspector';
import {
  DEFAULT_REVIEW_META,
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
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  darkMode,
  initialProjectId,
  onOpenInAudioStudio,
}) => {
  // ── 全局状态 ──
  const [capabilities, setCapabilities] = useState<ApiTranscriptionCapabilitiesResponse | null>(null);
  const [queueDriver, setQueueDriver] = useState<string>('');
  const [projects, setProjects] = useState<ApiTranscriptionProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialProjectId || '');
  const [detail, setDetail] = useState<ApiTranscriptionProjectDetail | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [message, setMessage] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);

  // ── 复核草稿 ──
  const [draft, setDraft] = useState<ApiTabProject | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);
  /** 检查器可折叠：窄窗口下可以把它收起来，把宽度全留给谱面 */
  const [showInspector, setShowInspector] = useState(true);
  /**
   * 弦线上的数字：默认与学员端一致写**手指号**（品位由把位标记反推）；
   * 复核纠正错品时切到 `'fret'` 看真实品位 + 手指上标。
   */
  const [noteLabel, setNoteLabel] = useState<'finger' | 'fret'>('finger');
  const [collapsedMeasures, setCollapsedMeasures] = useState<Set<number>>(new Set());

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
          setDraft(res.project.tabProject);
          setDirty(false);
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
        setDraft(next.tabProject);
        setDirty(false);
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
  // 交互
  // ═══════════════════════════════════════════

  const patchNote = (
    patch: Partial<Pick<ReviewNote, 'string' | 'fret' | 'durationSec' | 'technique' | 'finger'>>,
  ) => {
    if (!draft || !selectedNote) return;
    setDraft(applyNoteEdit(draft, selectedNote.measureIndex, selectedNote.id, patch));
    setDirty(true);
  };

  /** 改小节把位（小节级属性：一个小节内换把意味着手型整体平移） */
  const patchMeasurePosition = (measureIndex: number, position: number | undefined) => {
    if (!draft) return;
    setDraft(applyMeasurePosition(draft, measureIndex, position));
    setDirty(true);
  };

  /** 按当前把位重算本小节所有音符的手指 */
  const refingerMeasureAt = (measureIndex: number) => {
    if (!draft) return;
    setDraft(applyMeasureRefinger(draft, measureIndex));
    setDirty(true);
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
    setDraft(next);
    setDirty(true);
    setSelectedNoteId(null);
  };

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
      setDirty(false);
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
      setDraft(null);
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
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <div className="font-semibold mb-1">当前为「模拟转录」模式（Python 依赖不全）</div>
            <div className="text-amber-200/80">
              链路完全可用，但音符是按节拍网格生成的练习乐句，**不能当作真实转录结果上线**。
              安装依赖后可获得真实转录：
            </div>
            <ul className="mt-1 list-disc list-inside font-mono text-amber-200/80">
              {(capabilities.installHints || []).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
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
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              请选择左侧的一个转录项目（或新建）
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
                    onClick={() => setNoteLabel((v) => (v === 'finger' ? 'fret' : 'finger'))}
                    title="谱面弦线上的数字：手指号（学员端样式）↔ 品位号 + 手指上标（复核纠错用）"
                    className={`rounded-lg border px-2 py-1 transition ${
                      noteLabel === 'finger'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {noteLabel === 'finger' ? '弦线数字：手指数' : '弦线数字：品位数'}
                  </button>
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

              {/* 小节列表 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {!draft && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200">
                    转录尚未产出 TabProject。请等待流水线跑完（状态变为「待人工复核」），
                    或点击「从失败阶段重试」。
                  </div>
                )}

                {draft && visibleMeasures.length === 0 && (
                  <div className="text-xs text-slate-500">没有符合筛选条件的小节。</div>
                )}

                {visibleMeasures.map((measure) => {
                  const collapsed = collapsedMeasures.has(measure.index);
                  return (
                    <section key={measure.index} className={`rounded-2xl border overflow-hidden ${surface}`}>
                      <header className={`flex items-center justify-between px-4 py-2 ${subtle}`}>
                        <button
                          type="button"
                          onClick={() => toggleMeasure(measure.index)}
                          className="flex items-center gap-2 text-xs font-medium"
                        >
                          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          {measure.label}
                          <span className="text-[10px] text-slate-500 font-normal">
                            {measure.startTime.toFixed(2)}s–{measure.endTime.toFixed(2)}s ·{' '}
                            {(measure.duration).toFixed(2)}s · {measure.notes.length} 音符
                          </span>
                          {typeof measure.position === 'number' && measure.position >= 1 && (
                            <span
                              className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                              title={positionLabel(measure.position)}
                            >
                              {measure.position} 把位
                            </span>
                          )}
                        </button>
                        {measure.lowConfidenceCount > 0 && (
                          <span className="text-[10px] text-rose-400">
                            {measure.lowConfidenceCount} 个待复核
                          </span>
                        )}
                      </header>

                      {!collapsed && (
                        <div className="px-4 py-3">
                          <StandardTabRenderer
                            notes={measure.notes}
                            chords={measure.chords}
                            measureDuration={measure.duration}
                            bpm={tabBpm}
                            timeSignature={tabTimeSignature}
                            tuning={tuning}
                            capo={tabCapo}
                            position={measure.position}
                            isDark={darkMode}
                            selectedNoteId={selectedNoteId}
                            onSelectNote={(id) => setSelectedNoteId(id)}
                            showLegend={measure.index === visibleMeasures[0]?.index}
                            /** 每条“谱线”的第一小节画 TAB 谱号 + 拍号；全曲第一小节加速度标记 */
                            showClef={measure.index === 0}
                            showTempo={measure.index === 0}
                            isLastMeasure={measure.index === measures.length - 1}
                            measureIndex={measure.displayIndex}
                            noteLabel={noteLabel}
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
