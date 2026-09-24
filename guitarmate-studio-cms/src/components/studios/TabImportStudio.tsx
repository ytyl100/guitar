import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Info,
  Layers,
  Loader2,
  Music4,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Table2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ApiScore,
  type TabImportPreview,
  type TabImportSaveResult,
  type TabRights,
  type TabSample,
  type TabSourceCatalog,
  type TabSourceFormatName,
} from '../../services/api';

interface TabImportStudioProps {
  darkMode: boolean;
  /** 保存成功后跳到「音频与六线谱对齐」工作台继续做音频对齐 + 发布 */
  onOpenInAudioStudio?: (scoreId: string) => void;
}

type SourceMode = 'paste' | 'file' | 'sample' | 'catalog';

const FORMAT_OPTIONS: Array<{ value: 'auto' | TabSourceFormatName; label: string }> = [
  { value: 'auto', label: '自动识别（推荐）' },
  { value: 'ascii-tab', label: 'ASCII 六线谱（Ultimate Guitar 文字谱）' },
  { value: 'chord-sheet', label: '和弦表 + 扫弦模式' },
  { value: 'musicxml', label: 'MusicXML（MuseScore / OpenScore 导出）' },
  { value: 'gpx', label: 'Guitar Pro .gpx' },
  { value: 'solo-trace', label: '转录 JSON（SoloTrace / Basic Pitch）' },
  { value: 'tab-project', label: 'TabProject（本平台统一格式）' },
];

const RIGHTS_OPTIONS: Array<{ value: TabRights; label: string }> = [
  { value: 'public-domain', label: '✅ 公有领域（可对外发布）' },
  { value: 'original-arrangement', label: '✅ 自有编配（可对外发布）' },
  { value: 'licensed', label: '✅ 已获授权（可对外发布）' },
  { value: 'user-submission', label: '⚠️ 用户投稿（内部校验用）' },
  { value: 'copyrighted', label: '⛔ 版权作品（禁止对外发布）' },
  { value: 'unknown', label: '❔ 未知（需人工确认）' },
];

const LICENSE_OPTIONS = [
  { value: 'public_domain', label: '公有领域 public_domain' },
  { value: 'cc_by', label: 'CC-BY cc_by' },
  { value: 'authorized', label: '已授权 authorized' },
  { value: 'user_uploaded', label: '自建/用户上传 user_uploaded' },
];

const TIER_STYLE: Record<string, string> = {
  'public-domain': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  'official-licensed': 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  'reference-only': 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  restricted: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
};

const RHYTHM_STYLE: Record<string, string> = {
  exact: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  approximate: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  synthetic: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
};

const RHYTHM_LABEL: Record<string, string> = {
  exact: '时值精确',
  approximate: '节奏近似',
  synthetic: '节奏合成',
};

/** 曲目元数据表单（②b：让这些字段可以在后台填写，最终出现在 C 端契约里） */
interface ScoreMetaFormValue {
  title: string;
  artist: string;
  bpm: string;
  timeSignature: string;
  songKey: string;
  capo: string;
  tuning: string;
  license: string;
  difficulty: string;
}

const emptyMeta = (): ScoreMetaFormValue => ({
  title: '',
  artist: '',
  bpm: '',
  timeSignature: '4/4',
  songKey: '',
  capo: '0',
  tuning: 'E A D G B E',
  license: 'user_uploaded',
  difficulty: '',
});

const parseTuningText = (text: string): string[] | null => {
  const tokens = text
    .trim()
    .toUpperCase()
    .match(/[A-G][#B]?\d?/g);
  if (!tokens || tokens.length < 4) return null;
  // 允许只写音名（E A D G B E）→ 自动补八度
  const withOctave = tokens.map((t, i) => (/[0-9]/.test(t) ? t : `${t}${i < 3 ? 2 : 3}`));
  return withOctave;
};

/**
 * 六线谱导入工作台
 * ================
 *
 * 解决「网上只有人工制谱、没有统一 JSON」的问题：
 *
 * ```
 * ① 从数据源拿到谱面（ASCII tab / MusicXML / .gpx / 和弦表 / 转录 JSON）
 * ② POST /api/tab-import/parse  → 统一 TabProject + 发布就绪小节 + 诊断 + 版权判定
 * ③ 人工复核（ASCII 回显 / 近似节奏提示 / 低置信度音符）
 * ④ POST /api/tab-import/save   → 落到曲目工程（自动建 Score / Track + 写入调性/变调夹/调弦/授权）
 * ⑤ 补音频 → POST /api/measures/publish → 小程序
 * ```
 */
export const TabImportStudio: React.FC<TabImportStudioProps> = ({ darkMode, onOpenInAudioStudio }) => {
  const [sourceMode, setSourceMode] = useState<SourceMode>('paste');
  const [toast, setToast] = useState<string | null>(null);

  // 输入
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'auto' | TabSourceFormatName>('auto');
  const [fileName, setFileName] = useState('');
  const [base64, setBase64] = useState<string | undefined>(undefined);
  const [site, setSite] = useState('');
  const [meta, setMeta] = useState<ScoreMetaFormValue>(emptyMeta);
  const [rights, setRights] = useState<TabRights>('unknown');
  const [rightsNote, setRightsNote] = useState('');
  const [instrument, setInstrument] = useState('guitar_rhythm');
  const [strumPattern, setStrumPattern] = useState('');

  // 目录
  const [catalog, setCatalog] = useState<TabSourceCatalog | null>(null);
  const [samples, setSamples] = useState<TabSample[]>([]);

  // 解析结果
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<TabImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // 保存 / 发布
  const [scores, setScores] = useState<ApiScore[]>([]);
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [scoreId, setScoreId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<TabImportSaveResult | null>(null);

  const [publishAudioPath, setPublishAudioPath] = useState('');
  const [publishChannel, setPublishChannel] = useState('guitar_rhythm');
  const [publishAllowMissing, setPublishAllowMissing] = useState(true);
  const [publishFallback, setPublishFallback] = useState<'metronome' | 'source'>('metronome');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    measureCount: number;
    channel?: string;
    metronomeFallbackCount?: number;
    degradedAudioCount?: number;
    warnings: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 4200);
  }, []);

  const t = useMemo(
    () => ({
      card: darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
      sub: darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
      text: darkMode ? 'text-slate-100' : 'text-slate-900',
      muted: darkMode ? 'text-slate-400' : 'text-slate-500',
      input: darkMode
        ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-600'
        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400',
    }),
    [darkMode],
  );
  const inputClass = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 ${t.input}`;
  const labelClass = `block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${t.muted}`;

  // 初始化
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, list] = await Promise.all([api.getTabSources(), api.getTabSamples()]);
        if (cancelled) return;
        setCatalog(cat);
        setSamples(list.samples || []);
      } catch (err: any) {
        if (!cancelled) showToast(`⚠️ 无法加载格式/数据源目录：${err instanceof ApiError ? err.message : err?.message}`);
      }
      try {
        const scores = await api.getScores();
        if (!cancelled) setScores(scores);
      } catch {
        /* 后端未启动时静默降级 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const applyParsedMeta = (result: TabImportPreview) => {
    const p = result.project;
    setMeta({
      title: p.meta.title || '',
      artist: p.meta.artist || '',
      bpm: String(p.meta.bpm || ''),
      timeSignature: p.meta.timeSignature || '4/4',
      songKey: p.meta.key || '',
      capo: String(p.capo ?? 0),
      tuning: p.tuning?.length
        ? p.tuning.map((m) => midiName(m)).reverse().join(' ')
        : 'E A D G B E',
      license:
        p.source.rights === 'public-domain'
          ? 'public_domain'
          : p.source.rights === 'licensed'
            ? 'authorized'
            : 'user_uploaded',
      difficulty: '',
    });
  };

  const runParse = useCallback(
    async (override?: { content?: string; format?: TabSourceFormatName; fileName?: string }) => {
      const body = {
        content: override?.content ?? content,
        base64: override ? undefined : base64,
        format: override?.format || (format === 'auto' ? undefined : format),
        fileName: override?.fileName || fileName || undefined,
        site: site || undefined,
        instrument: instrument || undefined,
        rights,
        rightsNote: rightsNote || undefined,
        strumPattern: strumPattern || undefined,
      };
      if (!body.content && !body.base64) {
        setParseError('请先粘贴谱面内容，或选择文件 / 示例。');
        return;
      }

      setParsing(true);
      setParseError(null);
      setSaveResult(null);
      setPublishResult(null);
      try {
        const result = await api.parseTab(body);
        setPreview(result);
        applyParsedMeta(result);
        showToast(
          `✅ 解析成功：${result.diagnostics.measureCount} 小节 / ${result.diagnostics.noteCount} 音符（来源 ${result.format}）`,
        );
      } catch (err: any) {
        setPreview(null);
        const msg = err instanceof ApiError ? err.message : err?.message || '解析失败';
        setParseError(msg);
        showToast(`⚠️ ${msg}`);
      } finally {
        setParsing(false);
      }
    },
    [content, base64, format, fileName, site, instrument, rights, rightsNote, strumPattern, showToast],
  );

  const handleParseSample = async (sample: TabSample) => {
    setParsing(true);
    setParseError(null);
    setSaveResult(null);
    setPublishResult(null);
    setFileName(`${sample.id}.txt`);
    setRights(sample.rights);
    setRightsNote(sample.rightsNote);
    setContent(sample.content);
    setFormat(sample.format);
    try {
      const result = await api.parseTabSample(sample.id);
      setPreview(result);
      applyParsedMeta(result);
      showToast(`✅ 已解析示例《${sample.label}》`);
    } catch (err: any) {
      setPreview(null);
      const msg = err instanceof ApiError ? err.message : err?.message || '示例解析失败';
      setParseError(msg);
      showToast(`⚠️ ${msg}`);
    } finally {
      setParsing(false);
    }
  };

  const handleFile = async (file: File) => {
    const isBinary = /\.(gpx|gp3|gp4|gp5|mxl)$/i.test(file.name);
    setFileName(file.name);
    setSaveResult(null);
    setPreview(null);
    if (isBinary) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      setBase64(btoa(binary));
      setContent('');
      setFormat(/\.gpx$/i.test(file.name) ? 'gpx' : 'auto');
      if (/\.(gp3|gp4|gp5)$/i.test(file.name)) {
        showToast('⛔ .gp3/.gp4/.gp5 是私有二进制格式 —— 请先用 MuseScore 导出 MusicXML 再导入。');
      }
    } else {
      const text = await file.text();
      setBase64(undefined);
      setContent(text);
      setFormat('auto');
    }
  };

  /** 保存到曲目工程（新建时把元数据一并写入） */
  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const tuningArr = parseTuningText(meta.tuning);
      const result = await api.saveTabProject({
        scoreId: targetMode === 'existing' ? scoreId || undefined : undefined,
        newScore:
          targetMode === 'new'
            ? {
                title: meta.title || preview.project.meta.title,
                artist: meta.artist || preview.project.meta.artist,
                bpm: meta.bpm ? Number(meta.bpm) : preview.project.meta.bpm,
                timeSignature: meta.timeSignature || preview.project.meta.timeSignature,
              }
            : undefined,
        project: preview.project,
        fileName: fileName || `${preview.project.meta.title}.tabproject`,
      });

      // ②b：把表单里的元数据显式写入 Score（新建时后端已写入，这里补齐/修正）
      try {
        await api.updateScoreMeta(result.scoreId, {
          songKey: meta.songKey || null,
          capo: meta.capo ? Number(meta.capo) : 0,
          tuning: tuningArr,
          license: meta.license || null,
          difficulty: meta.difficulty ? Number(meta.difficulty) : null,
        });
      } catch (metaErr: any) {
        showToast(`⚠️ 谱面已保存，但元数据写入失败：${metaErr?.message}`);
      }

      setSaveResult(result);
      setPublishChannel(result.publishPayloadTemplate.channel || 'guitar_rhythm');
      showToast(`✅ 已保存到曲目工程 (scoreId=${result.scoreId})`);
      try {
        setScores(await api.getScores());
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      showToast(`⚠️ 保存失败：${err instanceof ApiError ? err.message : err?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUseDemoAudio = async () => {
    try {
      const demo = await api.getDemoAudio();
      if (!demo?.available) {
        showToast(`⚠️ 示例音频不可用：${demo?.hint || '请先执行 npm run demo:audio'}`);
        return;
      }
      setPublishAudioPath(demo.suggestedPath || '');
      showToast('✅ 已填入示例音频路径，可直接发布试试');
    } catch (err: any) {
      showToast(`⚠️ ${err instanceof ApiError ? err.message : '获取示例音频失败'}`);
    }
  };

  /** 直接发布到后端（C 端小程序读的就是这些数据） */
  const handlePublish = async () => {
    if (!saveResult) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      // 发布是 append-only：重新发布会重复追加小节，先清空
      try {
        const cleared = await api.clearMeasuresByScore(saveResult.scoreId);
        if (cleared.deleted > 0) showToast(`🧹 已清空旧的 ${cleared.deleted} 个已发布小节`);
      } catch {
        /* 首次发布没有旧数据 */
      }

      const res = await api.publishMeasures({
        scoreId: saveResult.scoreId,
        trackId: saveResult.trackId,
        trackAudioPath: publishAudioPath,
        channel: publishChannel,
        bpm: saveResult.publishPayloadTemplate.bpm,
        timeSignature: saveResult.publishPayloadTemplate.timeSignature,
        measures: saveResult.publishPayloadTemplate.measures,
        allowMissingAudio: publishAllowMissing,
        audioFallback: publishFallback,
      });

      setPublishResult({
        measureCount: res.measures?.length ?? saveResult.measureCount,
        channel: res.channel,
        metronomeFallbackCount: res.metronomeFallbackCount,
        degradedAudioCount: res.degradedAudioCount,
        warnings: res.warnings || [],
      });
      showToast(`🚀 发布成功：${res.measures?.length ?? 0} 个小节已入库，小程序端可见`);
    } catch (err: any) {
      showToast(`⚠️ 发布失败：${err instanceof ApiError ? err.message : err?.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleLoadExistingMeta = async () => {
    if (!scoreId) return;
    try {
      const score = await api.getScore(scoreId);
      setMeta({
        title: score.title || '',
        artist: score.artist || '',
        bpm: score.bpm ? String(score.bpm) : '',
        timeSignature: score.timeSignature || '4/4',
        songKey: score.songKey || '',
        capo: String(score.capo ?? 0),
        tuning: Array.isArray(score.tuning) && score.tuning.length ? score.tuning.join(' ') : 'E A D G B E',
        license: score.license || 'user_uploaded',
        difficulty: score.difficulty ? String(score.difficulty) : '',
      });
      showToast(`已载入《${score.title}》的元数据`);
    } catch (err: any) {
      showToast(`⚠️ ${err instanceof ApiError ? err.message : '载入失败'}`);
    }
  };

  const diag = preview?.diagnostics;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Header ── */}
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className={`text-lg font-bold flex items-center gap-2 ${t.text}`}>
              <Wand2 className="w-5 h-5 text-emerald-500" />
              六线谱导入工作台
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-semibold">
                外部谱面 → 统一 JSON
              </span>
            </h1>
            <p className={`text-xs mt-1 max-w-3xl leading-relaxed ${t.muted}`}>
              网上没有「音频转录后的统一六线谱 JSON」这种公开数据集。可行路线是把
              <span className="text-emerald-500 font-semibold">人工制谱</span>
              （ASCII tab / MusicXML / Guitar Pro / 和弦表）与
              <span className="text-emerald-500 font-semibold">AI 转录草稿</span>
              统一成 TabProject，再用人工谱做 ground truth 复核。本工作台负责前半段：解析 → 校对 → 入库。
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-600/40 hover:border-emerald-500/60 flex items-center gap-1.5 transition"
          >
            <Upload className="w-3.5 h-3.5" /> 上传谱面文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.tab,.ascii,.chords,.json,.xml,.musicxml,.mxl,.gpx,.gp3,.gp4,.gp5"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {(catalog?.formats || []).map((f) => (
            <span
              key={f.format}
              title={f.note}
              className={`text-[10px] px-2 py-1 rounded-md border font-medium ${RHYTHM_STYLE[f.rhythmAccuracy] || ''}`}
            >
              {f.label} · {RHYTHM_LABEL[f.rhythmAccuracy]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* 左：输入 */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <div className={`rounded-2xl border p-3 flex gap-1.5 ${t.card}`}>
            {(
              [
                { id: 'paste', label: '粘贴文本', icon: ClipboardPaste },
                { id: 'file', label: '上传文件', icon: Upload },
                { id: 'sample', label: '内置示例', icon: Sparkles },
                { id: 'catalog', label: '数据源 & 版权', icon: BookOpen },
              ] as Array<{ id: SourceMode; label: string; icon: any }>
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setSourceMode(m.id)}
                className={`flex-1 px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
                  sourceMode === m.id
                    ? 'bg-emerald-500 text-white shadow'
                    : darkMode
                      ? 'text-slate-400 hover:bg-slate-800'
                      : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>

          {(sourceMode === 'paste' || sourceMode === 'file') && (
            <div className={`rounded-2xl border p-4 space-y-3 ${t.card}`}>
              <div>
                <label className={labelClass}>谱面内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`直接粘贴谱面文本，例如：\n\nTitle: 练习曲\nTempo: 90\nTime: 4/4\n\nAm        C\n e|--------0-------|\n B|-----1----------|\n G|---2------------|`}
                  spellCheck={false}
                  className={`${inputClass} h-52 font-mono text-[11px] leading-5 resize-y`}
                />
                {base64 && (
                  <p className="text-[11px] mt-1 text-emerald-500">
                    已读取二进制文件（{(base64.length / 1024).toFixed(0)} KB base64），点「解析」后由后端解压。
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>源格式</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as any)} className={inputClass}>
                    {FORMAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>来源站点</label>
                  <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="MuseScore / OpenScore / 自有编配…" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>乐器 / 声道</label>
                  <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className={inputClass}>
                    <option value="guitar_rhythm">节奏吉他 (guitar_rhythm)</option>
                    <option value="guitar_lead">主音吉他 (guitar_lead)</option>
                    <option value="guitar">吉他 (guitar)</option>
                    <option value="bass">贝斯 (bass)</option>
                    <option value="other">其他 (other)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>扫弦模式（和弦表用）</label>
                  <input value={strumPattern} onChange={(e) => setStrumPattern(e.target.value)} placeholder="D D U U D U" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>版权状态（决定能否对外发布）</label>
                  <select value={rights} onChange={(e) => setRights(e.target.value as TabRights)} className={inputClass}>
                    {RIGHTS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={() => void runParse()}
                disabled={parsing}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {parsing ? '解析中…' : '解析为统一 TabProject'}
              </button>

              {parseError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-400 whitespace-pre-wrap">
                  {parseError}
                </div>
              )}
            </div>
          )}

          {sourceMode === 'sample' && (
            <div className={`rounded-2xl border p-4 space-y-3 ${t.card}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${t.text}`}>
                <Sparkles className="w-4 h-4 text-amber-500" /> 内置示例（自有编配 / 公有领域）
              </h3>
              <p className={`text-[11px] ${t.muted}`}>
                全部可安全用于演示与回归测试：不含任何受版权保护的流行歌曲谱面。
              </p>
              {samples.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void handleParseSample(s)}
                  className={`w-full text-left p-3 rounded-xl border transition hover:border-emerald-500/60 ${t.sub}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${t.text}`}>{s.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                      {s.format}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 leading-relaxed ${t.muted}`}>{s.description}</p>
                </button>
              ))}
            </div>
          )}

          {sourceMode === 'catalog' && (
            <div className={`rounded-2xl border p-4 space-y-3 ${t.card}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${t.text}`}>
                <BookOpen className="w-4 h-4 text-sky-500" /> 谱面数据源目录（含版权等级）
              </h3>
              <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${t.sub} ${t.muted}`}>
                <span className="font-bold text-amber-500">核心结论：</span>
                不存在公开的「音频转录 → 名曲级六线谱 JSON」数据集。能搜到的都是人工制谱，
                而流行歌曲仍在版权保护期内，<span className="font-semibold text-rose-400">不能直接抓取后对外发布</span>。
                合规路线只有三条：公有领域曲目 / 官方授权渠道 / 自有编配。
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(catalog?.sources || []).map((s) => (
                  <div key={s.id} className={`p-3 rounded-xl border ${t.sub}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-bold ${t.text}`}>{s.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${TIER_STYLE[s.tier] || ''}`}>
                        {s.tier}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${t.muted}`}>
                      <span className="font-semibold">怎么用：</span>
                      {s.howTo}
                    </p>
                    <p className="text-[11px] mt-1 text-amber-500">
                      <span className="font-semibold">注意：</span>
                      {s.caution}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-500 hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> 打开站点
                      </a>
                      {s.importAs && (
                        <button
                          onClick={() => {
                            setFormat(s.importAs as TabSourceFormatName);
                            setSourceMode('paste');
                            showToast(`已切换到「${s.importAs}」导入模式，请粘贴或上传谱面内容`);
                          }}
                          className="text-[10px] text-emerald-500 hover:underline"
                        >
                          用 {s.importAs} 导入
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <h4 className={`text-xs font-bold pt-2 ${t.text}`}>建议的公有领域曲库（零版权风险）</h4>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {(catalog?.publicDomainRepertoire || []).map((r) => (
                  <div key={r.title} className={`p-2.5 rounded-lg border ${t.sub}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold ${t.text}`}>{r.title}</span>
                      <span className="text-[10px] text-emerald-500">{r.level}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 ${t.muted}`}>{r.composer} · 练习重点：{r.focus}</p>
                    <p className="text-[10px] text-sky-500 mt-0.5">来源 {r.source} · 建议用 {r.importAs} 导入</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：预览 & 入库 & 发布 */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          {!preview && (
            <div className={`rounded-2xl border p-10 flex flex-col items-center justify-center text-center gap-3 ${t.card}`}>
              <FileJson className={`w-10 h-10 ${t.muted}`} />
              <p className={`text-sm font-semibold ${t.text}`}>还没有解析结果</p>
              <p className={`text-xs max-w-md leading-relaxed ${t.muted}`}>
                左侧粘贴谱面文本 →「解析为统一 TabProject」。也可以直接点「内置示例」跑通整条链路，
                或用「数据源 &amp; 版权」查看合规拿谱方式。
              </p>
              <div className={`text-[11px] p-3 rounded-xl border text-left max-w-lg ${t.sub} ${t.muted}`}>
                <p className="font-semibold mb-1">📌 推荐拿数据的三种方式</p>
                <p>① 公有领域古典/民谣 → MusicXML（时值精确，直接可用）</p>
                <p>② Guitar Pro .gpx → 直接解析（人工精修，质量最高）</p>
                <p>③ 和弦表 + 扫弦模式 → 自动展开成节奏吉他六线谱（做种子数据最快）</p>
              </div>
            </div>
          )}

          {preview && diag && (
            <>
              <div className={`rounded-2xl border p-4 ${t.card}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${t.text}`}>
                    <Layers className="w-4 h-4 text-emerald-500" /> 解析诊断
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                      来源 {preview.format}
                    </span>
                  </h3>
                  <button onClick={() => void runParse()} className="text-[11px] text-sky-500 hover:underline flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> 重新解析
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { k: '小节', v: diag.measureCount },
                    { k: '音符', v: diag.noteCount },
                    { k: '和弦标记', v: diag.chordCount },
                    { k: '横按', v: diag.barreCount },
                    { k: 'BPM', v: diag.bpm },
                    { k: '拍号', v: diag.timeSignature },
                    { k: '时长', v: `${diag.durationSec}s` },
                    { k: '变调夹', v: diag.capo },
                  ].map((d) => (
                    <div key={d.k} className={`p-2.5 rounded-xl border ${t.sub}`}>
                      <p className={`text-[10px] ${t.muted}`}>{d.k}</p>
                      <p className={`text-sm font-bold ${t.text}`}>{d.v}</p>
                    </div>
                  ))}
                </div>

                <div className={`mt-3 p-3 rounded-xl border text-[11px] space-y-1 ${t.sub}`}>
                  <p className={t.muted}><span className="font-semibold">调弦：</span> {diag.tuning}</p>
                  <p className={t.muted}>
                    <span className="font-semibold">可发布小节：</span> {preview.measures.length} 个（含弦/品/音高/归一化坐标）
                  </p>
                  {diag.lowConfidenceCount > 0 && (
                    <p className="text-amber-500">
                      <span className="font-semibold">低置信度音符：</span> {diag.lowConfidenceCount} 个（转录草稿建议优先复核）
                    </p>
                  )}
                  {diag.approximateRhythmMeasures > 0 && (
                    <p className="text-orange-500">
                      <span className="font-semibold">近似节奏小节：</span> {diag.approximateRhythmMeasures} 个 ——
                      ASCII 谱没有时值信息，节奏是按列位置估算的
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 flex items-start gap-3 ${
                  preview.copyright.publishable ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/30'
                }`}
              >
                {preview.copyright.publishable ? (
                  <BadgeCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-xs font-bold ${t.text}`}>
                    版权判定：{preview.copyright.tier}
                    {preview.copyright.publishable ? ' · 可以对外发布' : ' · 禁止直接对外发布'}
                  </p>
                  <p className={`text-[11px] mt-1 leading-relaxed ${t.muted}`}>{preview.copyright.reason}</p>
                </div>
              </div>

              {diag.warnings?.length > 0 && (
                <div className={`rounded-2xl border p-4 ${t.card}`}>
                  <h3 className={`text-sm font-bold mb-2 flex items-center gap-2 ${t.text}`}>
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> 解析提示（{diag.warnings.length}）
                  </h3>
                  <div className="space-y-1.5">
                    {diag.warnings.map((w, i) => (
                      <div
                        key={`${w.code}-${i}`}
                        className={`text-[11px] p-2.5 rounded-lg border ${
                          w.level === 'error'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : w.level === 'warn'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                              : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-80">{w.code}</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{w.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`rounded-2xl border p-4 ${t.card}`}>
                <h3 className={`text-sm font-bold mb-2 flex items-center gap-2 ${t.text}`}>
                  <Table2 className="w-4 h-4 text-sky-500" /> 谱面回显（前 3 小节，供人工校对）
                </h3>
                <div className="space-y-3">
                  {preview.asciiPreview.map((m) => (
                    <div key={m.index}>
                      <p className={`text-[11px] mb-1 ${t.muted}`}>{m.label} · {m.noteCount} 个音符</p>
                      <pre className={`text-[11px] leading-5 font-mono p-3 rounded-xl border overflow-x-auto ${t.sub} ${t.text}`}>
                        {m.ascii}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              {/* 入库 + ②b 元数据表单 */}
              <div className={`rounded-2xl border p-4 ${t.card}`}>
                <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${t.text}`}>
                  <CloudUpload className="w-4 h-4 text-emerald-500" /> 保存到曲目工程
                </h3>

                <div className="flex gap-2 mb-3">
                  {(
                    [
                      { id: 'new', label: '新建曲目' },
                      { id: 'existing', label: '并入已有曲目' },
                    ] as Array<{ id: 'new' | 'existing'; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTargetMode(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                        targetMode === m.id
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : darkMode
                            ? 'border-slate-700 text-slate-400'
                            : 'border-slate-300 text-slate-500'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                  {targetMode === 'existing' && (
                    <button
                      onClick={() => void handleLoadExistingMeta()}
                      disabled={!scoreId}
                      className="ml-auto text-[11px] text-sky-500 hover:underline disabled:opacity-40"
                    >
                      载入该曲目元数据
                    </button>
                  )}
                </div>

                {targetMode === 'existing' && (
                  <div className="mb-3">
                    <label className={labelClass}>目标曲目</label>
                    <select value={scoreId} onChange={(e) => setScoreId(e.target.value)} className={inputClass}>
                      <option value="">— 选择后端已有的曲目 —</option>
                      {scores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                          {s.artist ? ` — ${s.artist}` : ''} ({s._count?.measures ?? 0} 已发布小节)
                        </option>
                      ))}
                    </select>
                    <p className={`text-[11px] mt-1.5 ${t.muted}`}>
                      注意：发布是 append-only，并入已发布过小节的曲目前请先清空。
                    </p>
                  </div>
                )}

                {/* 元数据（会出现在 C 端 PracticePackage 的 score.* 与 provenance.license） */}
                <div className={`p-3 rounded-xl border mb-3 ${t.sub}`}>
                  <p className={`text-[11px] font-bold mb-2 ${t.text}`}>
                    曲目元数据（将写入 C 端契约：score.* / provenance.license）
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelClass}>曲名</label>
                      <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>作者</label>
                      <input value={meta.artist} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>调性（key）</label>
                      <input value={meta.songKey} onChange={(e) => setMeta({ ...meta, songKey: e.target.value })} placeholder="A minor / Bm" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>BPM</label>
                      <input value={meta.bpm} onChange={(e) => setMeta({ ...meta, bpm: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>拍号</label>
                      <input value={meta.timeSignature} onChange={(e) => setMeta({ ...meta, timeSignature: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>变调夹 capo</label>
                      <input value={meta.capo} onChange={(e) => setMeta({ ...meta, capo: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>调弦（由低到高）</label>
                      <input value={meta.tuning} onChange={(e) => setMeta({ ...meta, tuning: e.target.value })} placeholder="E A D G B E" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>授权状态 license</label>
                      <select value={meta.license} onChange={(e) => setMeta({ ...meta, license: e.target.value })} className={inputClass}>
                        {LICENSE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>难度 1-5</label>
                      <select value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value })} className={inputClass}>
                        <option value="">（自动推导）</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => void handleSave()}
                  disabled={saving || (targetMode === 'existing' && !scoreId)}
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                  {saving ? '保存中…' : '保存 TabProject 到曲目工程'}
                </button>
              </div>

              {saveResult && (
                <div className="rounded-2xl border p-4 bg-emerald-500/5 border-emerald-500/30">
                  <h3 className={`text-sm font-bold mb-2 flex items-center gap-2 ${t.text}`}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 已入库
                  </h3>
                  <div className={`text-[11px] p-3 rounded-xl border space-y-1 font-mono ${t.sub} ${t.muted}`}>
                    <p>scoreId = {saveResult.scoreId}</p>
                    <p>trackId = {saveResult.trackId}</p>
                    <p>measures = {saveResult.measureCount} / notes = {saveResult.noteCount}</p>
                    <p>metadata = {JSON.stringify(saveResult.appliedMetadata)}</p>
                    <p className="break-all">json = {saveResult.projectUrl}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(saveResult.scoreId);
                        showToast('📋 scoreId 已复制');
                      }}
                      className="px-3 py-2 rounded-lg text-[11px] font-semibold border border-slate-600/40 hover:border-emerald-500/60 flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> 复制 scoreId
                    </button>
                    <button
                      onClick={() => onOpenInAudioStudio?.(saveResult.scoreId)}
                      className="px-3 py-2 rounded-lg text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1.5"
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> 去对齐工作台微调
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* 发布到小程序 */}
              {saveResult && (
                <div className={`rounded-2xl border p-4 ${t.card}`}>
                  <h3 className={`text-sm font-bold mb-1 flex items-center gap-2 ${t.text}`}>
                    <PlayCircle className="w-4 h-4 text-emerald-500" /> 发布到小程序
                  </h3>
                  <p className={`text-[11px] mb-3 leading-relaxed ${t.muted}`}>
                    发布后 C 端「云端六线谱」就能拉到这 {saveResult.measureCount} 个小节。
                    发布是 <span className="font-semibold text-amber-500">append-only</span>，本按钮会先自动清空旧小节再发布。
                  </p>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className={labelClass}>分轨音频路径 / URL（可留空）</label>
                        <button onClick={() => void handleUseDemoAudio()} className="text-[10px] text-sky-500 hover:underline mb-1.5">
                          使用内置示例音频
                        </button>
                      </div>
                      <input
                        value={publishAudioPath}
                        onChange={(e) => setPublishAudioPath(e.target.value)}
                        placeholder="例如 uploads/demo/render_xxx.wav 或 https://…/guitar.mp3"
                        className={inputClass}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>练习声道</label>
                        <select value={publishChannel} onChange={(e) => setPublishChannel(e.target.value)} className={inputClass}>
                          <option value="guitar_rhythm">节奏吉他 guitar_rhythm</option>
                          <option value="guitar_lead">主音吉他 guitar_lead</option>
                          <option value="guitar">吉他 guitar</option>
                          <option value="bass">贝斯 bass</option>
                          <option value="other">其他 other</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>无音频时降级策略</label>
                        <select
                          value={publishFallback}
                          onChange={(e) => setPublishFallback(e.target.value as 'metronome' | 'source')}
                          className={inputClass}
                          disabled={!publishAllowMissing}
                        >
                          <option value="metronome">节拍器占位（推荐，C 端可播）</option>
                          <option value="source">原始音频 + 时间片段</option>
                        </select>
                      </div>
                    </div>

                    <label className={`flex items-center gap-2 text-[11px] cursor-pointer ${t.muted}`}>
                      <input
                        type="checkbox"
                        checked={publishAllowMissing}
                        onChange={(e) => setPublishAllowMissing(e.target.checked)}
                        className="w-3.5 h-3.5 accent-emerald-500"
                      />
                      允许无音频发布（纯谱面练习：C 端用节拍器 + 六线谱高亮）
                    </label>

                    <button
                      onClick={() => void handlePublish()}
                      disabled={publishing}
                      className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
                    >
                      {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                      {publishing ? '发布中（切片 + 上传）…' : '发布这个小节谱面到小程序'}
                    </button>
                  </div>

                  {publishResult && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/30 space-y-1">
                      <p className="text-[11px] font-bold text-emerald-500">
                        ✅ 已发布 {publishResult.measureCount} 个小节 · 声道 {publishResult.channel || publishChannel}
                      </p>
                      {!!publishResult.metronomeFallbackCount && (
                        <p className="text-[10px] text-amber-500">
                          {publishResult.metronomeFallbackCount} 个小节使用了「节拍器占位音频」（拿不到真实音频）。
                        </p>
                      )}
                      {!!publishResult.degradedAudioCount && (
                        <p className="text-[10px] text-amber-500">
                          {publishResult.degradedAudioCount} 个小节降级为「原始音频 + 时间片段」，请确认该音源公网可访问。
                        </p>
                      )}
                      {publishResult.warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                          • {w}
                        </p>
                      ))}
                      <p className="text-[10px] text-slate-400 pt-1">
                        现在可以在小程序「音乐」→ 对应曲目的云端六线谱面板里看到小节节点高亮与循环练习。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 支持格式说明 */}
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h3 className={`text-sm font-bold mb-2 flex items-center gap-2 ${t.text}`}>
              <Info className="w-4 h-4 text-sky-500" /> 各格式拿到后怎么处理
            </h3>
            <div className="space-y-2">
              {(catalog?.formats || []).map((f) => (
                <div key={f.format} className={`p-3 rounded-xl border ${t.sub}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${t.text}`}>{f.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RHYTHM_STYLE[f.rhythmAccuracy] || ''}`}>
                      {RHYTHM_LABEL[f.rhythmAccuracy]}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 ${t.muted}`}>{f.note}</p>
                  <p className={`text-[10px] mt-1 font-mono ${t.muted}`}>扩展名：{f.extensions.join(' / ')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md px-4 py-3 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl flex items-start gap-2">
          <Music4 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{toast}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export default TabImportStudio;
