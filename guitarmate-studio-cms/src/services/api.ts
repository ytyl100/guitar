/**
 * GuitarMate Studio CMS — 后端 API 客户端
 * 对接 guitarmate-audio-backend (NestJS 10 + Prisma 5 + SQLite)
 *
 * 后端启动后可在 http://localhost:3000/docs 查看 Swagger 交互文档。
 * 可通过 .env 中的 VITE_API_BASE_URL 覆盖默认地址。
 */

export const API_BASE_URL: string =
  (import.meta.env?.VITE_API_BASE_URL as string) || 'http://localhost:3000';

// ─────────────────────────────────────────────
// 请求 / 响应类型 (与后端 DTO 对齐)
// ─────────────────────────────────────────────

export interface ApiNoteInput {
  id?: string;
  /** 绝对音频时间（秒） */
  audioTime: number;
  /** 琴弦编号 1-6 (1=最细弦) */
  string: number;
  /** 品位 0-24 */
  fret: number;
  /** MIDI 音高 */
  pitch: number;
  duration: number;
  confidence?: number;
  /** 归一化横坐标 0-1 */
  x?: number;
  /** 归一化纵坐标 0-1 */
  y?: number;
}

export interface ApiBarreInput {
  instrument?: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface ApiChordMarkerInput {
  instrument?: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface ApiMeasureItem {
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  notes: ApiNoteInput[];
  barres?: ApiBarreInput[];
  chords?: ApiChordMarkerInput[];
  tabImageUrl: string;
}

export interface PublishMeasuresPayload {
  scoreId: string;
  trackId: string;
  /** 分轨原始音频的本地绝对路径或 URL */
  trackAudioPath: string;
  /**
   * 练习声道标识 —— C 端 Simplified 模式播放该声道。
   * 可选：guitar / guitar_lead / guitar_rhythm / bass / piano / other。默认 guitar。
   */
  channel?: string;
  /**
   * 原声（含鼓 / 贝斯 / 电琴等全轨混音）路径或 URL —— C 端 Original 模式播放。
   * 留空时后端自动回退到 Score.originalAudio。
   */
  originalAudioPath?: string;
  bpm: number;
  timeSignature: string;
  measures: ApiMeasureItem[];
  /**
   * 允许在音频不可访问时仍然发布（仅入库谱面标注，C 端无法播放）。
   * 默认 false —— 后端会先校验音频来源并在不可访问时直接返回 400，避免静默失败。
   */
  allowMissingAudio?: boolean;  /**
   * 切片失败 / 压根没有音频时的降级策略：
   * - `source`（默认）：原始音频 + `#t=start,end` 时间片段
   * - `metronome`：后端为每个小节合成「节拍器 + 鼓」占位音频（纯谱面导入用）
   */
  audioFallback?: 'source' | 'metronome';}

export interface ApiScore {
  id: string;
  title: string;
  artist?: string | null;
  bpm?: number | null;
  timeSignature?: string;
  originalAudio?: string;
  coverUrl?: string | null;
  status: string;
  /** 调性，例如 "Bm" / "A minor" */
  songKey?: string | null;
  /** 变调夹品位 */
  capo?: number | null;
  /** 调弦音名数组（由低到高）：["E2","A2","D3","G3","B3","E4"] */
  tuning?: string[] | null;
  /** public_domain | cc_by | authorized | user_uploaded */
  license?: string | null;
  /** 难度 1-5（人工标注） */
  difficulty?: number | null;
  createdAt?: string;
  updatedAt?: string;
  tracks?: ApiTrack[];
  _count?: { measures?: number; tracks?: number };
}

export interface ApiScoreMetaInput {
  title?: string;
  artist?: string | null;
  bpm?: number | null;
  timeSignature?: string;
  originalAudio?: string;
  coverUrl?: string | null;
  songKey?: string | null;
  capo?: number | null;
  /** 传 null 表示清空 */
  tuning?: string[] | null;
  license?: string | null;
  difficulty?: number | null;
}

export interface ApiTrack {
  id: string;
  scoreId: string;
  instrument: string;
  audioUrl: string;
  jsonUrl?: string | null;
}

export interface ApiNoteResponse {
  id: string;
  string: number;
  fret: number;
  pitch: number;
  relativeTime: number;
  duration: number;
  confidence: number;
  x: number;
  y: number;
}

export interface ApiMeasureResponse {
  id: string;
  scoreId: string;
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  trackData: Array<{
    id: string;
    trackId: string;
    audioUrl: string;
    /** 练习声道标识 (guitar / guitar_lead / ...) */
    channel?: string;
    /** 原声（全轨混音）同区间切片音频，Original 模式播放；为空表示未发布原声 */
    originalAudioUrl?: string | null;
    tabImageUrl: string;
    imageWidth: number;
    imageHeight: number;
    notes: ApiNoteResponse[];
  }>;
  barres: ApiBarreInput[];
  chords: ApiChordMarkerInput[];
}

export interface ApiPublishResult {
  success: boolean;
  message: string;
  scoreId: string;
  trackId: string;
  /** 本次发布的练习声道 (C 端 Simplified 模式) */
  channel?: string;
  /** 是否成功发布原声轨 (C 端 Original 模式)；false 表示已降级回退到练习声道 */
  hasOriginalAudio?: boolean;
  measures: ApiMeasureResponse[];
  /** 音频切片失败、降级为「原始音频 + #t=start,end」的小节数量 */
  degradedAudioCount?: number;
  /** 没有可用音频、改用「节拍器占位音频」的小节数量（纯谱面发布） */
  metronomeFallbackCount?: number;
  /** 后端返回的告警信息（例如音频切片降级） */
  warnings?: string[];
}

// ─────────────────────────────────────────────
// 六线谱导入 (Tab Import) 类型
// ─────────────────────────────────────────────

export type TabSourceFormatName =
  | 'ascii-tab'
  | 'chord-sheet'
  | 'musicxml'
  | 'gpx'
  | 'gp3'
  | 'gp4'
  | 'gp5'
  | 'solo-trace'
  | 'tab-project';

export type TabRights =
  | 'public-domain'
  | 'original-arrangement'
  | 'licensed'
  | 'user-submission'
  | 'copyrighted'
  | 'unknown';

export interface TabWarning {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  measureIndex?: number;
}

export interface TabProjectPayload {
  format: 'guitarmate-tab-project';
  version: '1.0';
  meta: {
    title: string;
    artist?: string;
    bpm: number;
    timeSignature: string;
    key?: string;
    instrument: string;
    capo: number;
  };
  tuning: number[];
  capo: number;
  tracks: Array<{
    id: string;
    name: string;
    instrument: string;
    tuning: number[];
    capo: number;
    measures: Array<{
      index: number;
      label?: string;
      timeSignature?: string;
      bpm?: number;
      startTime: number;
      endTime: number;
      beats: number;
      notes: unknown[];
      chords?: unknown[];
      rawText?: string;
    }>;
  }>;
  source: {
    kind: TabSourceFormatName;
    fileName?: string;
    site?: string;
    rights: TabRights;
    rightsNote?: string;
    parsedAt: string;
    parserVersion: string;
  };
  warnings: TabWarning[];
  stats: {
    measureCount: number;
    noteCount: number;
    chordCount: number;
    barreCount: number;
    approximateRhythmMeasures: number;
    timeSignatureChanges: number;
    durationSec: number;
  };
}

/** 与 POST /api/measures/publish 的 measures[] 完全对齐（audioTime 为绝对秒） */
export interface ApiMeasureItemPublishReady {
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  notes: Array<{
    id: string;
    audioTime: number;
    string: number;
    fret: number;
    pitch: number;
    duration: number;
    confidence: number;
    x: number;
    y: number;
    technique?: string;
    chordName?: string;
  }>;
  barres: Array<{
    instrument: string;
    fret: number;
    fromString: number;
    toString: number;
    startTime: number;
    duration: number;
    x: number;
    y: number;
  }>;
  chords: Array<{
    instrument: string;
    chordName: string;
    startTime: number;
    duration: number;
    x: number;
    y: number;
  }>;
  tabImageUrl: string;
}

export interface TabImportPreview {
  success: boolean;
  format: TabSourceFormatName;
  project: TabProjectPayload;
  measures: ApiMeasureItemPublishReady[];
  diagnostics: {
    measureCount: number;
    noteCount: number;
    chordCount: number;
    barreCount: number;
    durationSec: number;
    bpm: number;
    timeSignature: string;
    tuning: string;
    capo: number;
    approximateRhythmMeasures: number;
    lowConfidenceCount: number;
    warnings: TabWarning[];
  };
  copyright: {
    tier: 'public-domain' | 'copyrighted' | 'unknown';
    publishable: boolean;
    reason: string;
  };
  asciiPreview: Array<{ index: number; label: string; ascii: string; noteCount: number }>;
}

export interface TabImportSaveResult {
  success: boolean;
  scoreId: string;
  trackId: string;
  projectUrl: string;
  projectPath: string;
  measureCount: number;
  noteCount: number;
  appliedMetadata: { songKey?: string; capo?: number; tuning?: string[]; license?: string };
  publishPayloadTemplate: {
    scoreId: string;
    trackId: string;
    bpm: number;
    timeSignature: string;
    channel: string;
    measures: ApiMeasureItemPublishReady[];
    allowMissingAudio: boolean;
    audioFallback: 'source' | 'metronome';
    note: string;
  };
  warnings: string[];
}

export interface TabFormatInfo {
  format: TabSourceFormatName;
  label: string;
  extensions: string[];
  rhythmAccuracy: 'exact' | 'approximate' | 'synthetic';
  note: string;
}

export interface TabSourceInfo {
  id: string;
  name: string;
  url: string;
  tier: 'public-domain' | 'official-licensed' | 'reference-only' | 'restricted';
  formats: string[];
  access: string;
  howTo: string;
  caution: string;
  importAs?: TabSourceFormatName;
}

export interface TabSample {
  id: string;
  label: string;
  format: TabSourceFormatName;
  description: string;
  rights: TabRights;
  rightsNote: string;
  content: string;
}

export interface TabSourceCatalog {
  success: boolean;
  formats: TabFormatInfo[];
  sources: TabSourceInfo[];
  publicDomainRepertoire: Array<{
    title: string;
    composer: string;
    level: string;
    focus: string;
    source: string;
    importAs: TabSourceFormatName;
  }>;
  tiers: Array<{ tier: string; label: string; note: string }>;
}

// ─────────────────────────────────────────────
// 音频转录流水线 (Transcription) 类型
// ─────────────────────────────────────────────

export type TranscriptionProjectStatus =
  | 'pending'
  | 'downloading'
  | 'separating'
  | 'transcribing'
  | 'converting'
  | 'review'
  | 'published'
  | 'failed';

export type TranscriptionStage = 'download' | 'separate' | 'transcribe' | 'convert' | 'slice' | 'publish';

export interface ApiTranscriptionCapabilities {
  python: { available: boolean; bin: string; version?: string; reason?: string };
  ytDlp: { available: boolean; bin: string; reason?: string };
  demucs: { available: boolean; reason?: string };
  basicPitch: { available: boolean; reason?: string };
  tayuya: { available: boolean; reason?: string };
  ffmpeg: { available: boolean; reason?: string };
  workersDir: string;
  /** true = 依赖缺失时用内置模拟转录，保证链路可跑通 */
  simulate: boolean;
}

export interface ApiTranscriptionCapabilitiesResponse {
  success: boolean;
  capabilities: ApiTranscriptionCapabilities;
  installHints: string[];
  pipeline: { stages: string[]; progressBaseline: Record<string, number>; projectStatuses: string[] };
}

export interface ApiTranscriptionQueue {
  success: boolean;
  counts: { waiting: number; active: number; completed: number; failed: number; driver: 'bullmq' | 'in-process'; queueName: string };
  driver: { driver: string; queueName: string; concurrency: number; attempts: number; redisUrl: string | null; registeredStages: string[] };
}

export interface ApiTranscriptionProjectSummary {
  id: string;
  title: string;
  artist?: string | null;
  status: TranscriptionProjectStatus;
  statusLabel: string;
  sourceType: 'upload' | 'url';
  sourceRef?: string | null;
  originalName?: string | null;
  audioUrl: string | null;
  durationSec?: number | null;
  bpm?: number | null;
  timeSignature?: string | null;
  capo?: number | null;
  tuning?: number[] | null;
  license?: string | null;
  progress: number;
  stageNote?: string | null;
  error?: string | null;
  scoreId?: string | null;
  hasTabProject: boolean;
  counts?: { tracks: number; jobs: number; packages: number };
  createdAt: string;
  updatedAt: string;
}

/** 转录出的单个音符（相对分轨起点的绝对秒） */
export interface ApiTranscriptionNote {
  id?: string;
  /** 1-6，1 = 最细的高音 E 弦 */
  string: number;
  fret: number;
  pitch: number;
  startSec: number;
  durationSec: number;
  confidence: number;
  velocity?: number;
  technique?: string;
}

export interface ApiTranscriptionTrack {
  id: string;
  instrument: string;
  status: 'pending' | 'separated' | 'transcribed' | 'converted' | 'failed';
  stemUrl: string | null;
  midiPath?: string | null;
  tabPath?: string | null;
  noteCount: number;
  confidenceAvg: number;
  lowConfidenceCount: number;
  /** true = 走的是内置模拟转录（未安装 Demucs / Basic Pitch） */
  simulated: boolean;
  warnings: string[];
  error?: string | null;
  notes: ApiTranscriptionNote[];
}

export interface ApiTranscriptionJob {
  id: string;
  stage: TranscriptionStage;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'skipped';
  queueName: string;
  jobId?: string | null;
  attempts: number;
  progress: number;
  input?: any;
  output?: any;
  error?: string | null;
  durationMs?: number | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

/** 后端返回的 TabProject（与 tab-import 同一结构） */
export interface ApiTabProject {
  format: 'guitarmate-tab-project';
  version: string;
  meta: { title: string; artist?: string; bpm: number; timeSignature: string; instrument: string; capo: number };
  tuning: number[];
  capo: number;
  tracks: Array<{
    id: string;
    name: string;
    instrument: string;
    tuning: number[];
    capo: number;
    measures: Array<{
      index: number;
      label: string;
      startTime: number;
      endTime: number;
      beats: number;
      notes: Array<Record<string, any>>;
      chords?: Array<Record<string, any>>;
    }>;
  }>;
  source: Record<string, any>;
  warnings: Array<{ level: string; code: string; message: string }>;
  stats: Record<string, any>;
}

export interface ApiTranscriptionProjectDetail extends ApiTranscriptionProjectSummary {
  tracks: ApiTranscriptionTrack[];
  jobs: ApiTranscriptionJob[];
  tabProject: ApiTabProject | null;
  packageRevisions: Array<{
    id: string;
    revision: number;
    schemaVersion: string;
    measureCount: number;
    noteCount: number;
    lowConfidenceCount: number;
    publishedBy: string;
    createdAt: string;
  }>;
  latestRevision: number;
}

export interface ApiTranscriptionPublishResult {
  success: boolean;
  projectId: string;
  packageId: string;
  revision: number;
  schemaVersion: string;
  stats: {
    measureCount: number;
    noteCount: number;
    trackCount: number;
    lowConfidenceCount: number;
    slicedAudioCount: number;
    degradedAudioCount: number;
    metronomeFallbackCount: number;
  };
  mirrored: { enabled: boolean; scoreId?: string; trackId?: string; measureCount?: number; error?: string };
  warnings: string[];
  package: any;
}

export interface ApiTranscriptionPackageResponse {
  id: string;
  revision: number;
  schemaVersion: string;
  publishedBy: string;
  createdAt: string;
  stats: {
    measureCount: number;
    noteCount: number;
    trackCount: number;
    lowConfidenceCount: number;
    slicedAudioCount: number;
    degradedAudioCount: number;
  };
  package: any;
}

/** 统一的网络层错误，便于 UI 层展示原因 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (err: any) {
    throw new ApiError(
      `无法连接后端服务 ${API_BASE_URL}，请确认 guitarmate-audio-backend 已启动 (npm run dev)。`,
    );
  }

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const msg =
      (payload && (payload.message || payload.error)) ||
      `请求失败 (${res.status} ${res.statusText})`;
    throw new ApiError(Array.isArray(msg) ? msg.join('; ') : String(msg), res.status);
  }

  return payload as T;
}

// ─────────────────────────────────────────────
// 业务 API
// ─────────────────────────────────────────────

export const api = {
  /** 健康检查 (app.controller) */
  health: () => request<{ status: string }>('/api/health'),

  // ── Scores 曲目管理 ──────────────────────────
  getScores: () => request<ApiScore[]>('/api/scores'),
  getScore: (scoreId: string) => request<ApiScore>(`/api/scores/${scoreId}`),
  createScore: (body: {
    title: string;
    artist?: string;
    bpm?: number;
    timeSignature?: string;
    originalAudio: string;
    coverUrl?: string;
    status?: string;
  }) => request<ApiScore>('/api/scores', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * 更新曲目元数据（调性 / 变调夹 / 调弦 / 授权状态 / 难度）。
   * 这些字段会直接出现在 C 端 PracticePackage 的 `score.*` 与 `provenance.license`。
   */
  updateScoreMeta: (scoreId: string, body: ApiScoreMetaInput) =>
    request<ApiScore>(`/api/scores/${scoreId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  addTrack: (
    scoreId: string,
    body: { instrument: string; audioUrl: string; jsonUrl?: string },
  ) =>
    request<ApiTrack>(`/api/scores/${scoreId}/tracks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateScoreStatus: (scoreId: string, status: 'draft' | 'published') =>
    request<ApiScore>(`/api/scores/${scoreId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /**
   * 导入 Mac 工作站 (SoloTrace / Basic Pitch) 导出的转录 JSON
   */
  importTranscription: (
    scoreId: string,
    body: {
      trackId?: string;
      instrument?: string;
      audioUrl?: string;
      fileName?: string;
      data: any;
    },
  ) =>
    request<{
      success: boolean;
      scoreId: string;
      trackId: string;
      jsonUrl: string;
      bpm: number;
      timeSignature: string;
      noteCount: number;
    }>(`/api/scores/${scoreId}/transcription`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Published 面向小程序 ──────────────────────
  getPublishedScores: () => request<ApiScore[]>('/api/published/scores'),
  getMeasuresByScore: (scoreId: string) =>
    request<ApiMeasureResponse[]>(`/api/published/scores/${scoreId}/measures`),

  // ── Measures 小节发布 ─────────────────────────
  /**
   * 发布小节: 后端会依次切片音频 → 上传 OSS → 计算 relativeTime → 写入 SQLite
   */
  publishMeasures: (payload: PublishMeasuresPayload) =>
    request<ApiPublishResult>('/api/measures/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** 清空指定曲目的全部已发布小节（重新发布前清理旧数据） */
  clearMeasuresByScore: (scoreId: string) =>
    request<{ success: boolean; scoreId: string; deleted: number; message: string }>(
      `/api/measures/score/${scoreId}`,
      { method: 'DELETE' },
    ),

  /** 后端内置示例音频信息（用于一键填入分轨音频路径） */
  getDemoAudio: () =>
    request<{
      available: boolean;
      suggestedPath: string;
      absolutePath: string;
      url: string;
      hint?: string;
    }>('/api/measures/demo-audio'),

  /**
   * 根据该曲目已发布小节的音符标注，合成「与之精确对齐」的示范音频。
   *
   * - `withBand: false`（默认）→ 仅吉他，填到「分轨音频路径」(C 端 Simplified)
   * - `withBand: true` → 吉他 + 贝斯 + 鼓，且鼓/贝斯与小节窗口同一节拍网格，
   *   填到「Original 原声路径」(C 端 Original)。**不是**占位音频，吉他会同样落在节点上。
   */
  renderDemoAudioFromAnnotations: (
    scoreId: string,
    fileName?: string,
    withBand?: boolean,
  ) =>
    request<{
      success: boolean;
      scoreId: string;
      /** 是否叠加了贝斯 + 鼓 */
      withBand?: boolean;
      beatsPerBar?: number;
      measureCount: number;
      suggestedPath: string;
      absolutePath: string;
      url: string;
      durationSec: number;
      noteCount: number;
      peaks: number[];
      message: string;
    }>('/api/measures/render-audio', {
      method: 'POST',
      body: JSON.stringify({ scoreId, fileName, withBand }),
    }),

  // ── Tab Import 六线谱导入 ────────────────────────────────────
  /** 支持的谱面格式清单（含节奏精度说明） */
  getTabFormats: () =>
    request<{ success: boolean; formats: TabFormatInfo[] }>('/api/tab-import/formats'),

  /** 谱面数据源目录 + 版权等级 + 公有领域曲目建议 */
  getTabSources: () => request<TabSourceCatalog>('/api/tab-import/sources'),

  /** 内置示例谱面（自有编配 / 公有领域） */
  getTabSamples: () =>
    request<{ success: boolean; samples: TabSample[] }>('/api/tab-import/samples'),

  /** 按曲名判断版权状态与发布风险 */
  getTabCopyright: (title: string) =>
    request<{
      success: boolean;
      title?: string;
      tier: 'public-domain' | 'copyrighted' | 'unknown';
      reason: string;
    }>(`/api/tab-import/copyright?title=${encodeURIComponent(title)}`),

  /** 解析任意谱面 → 统一 TabProject + 发布就绪小节（**不落库**，仅预览） */
  parseTab: (body: {
    content?: string;
    data?: unknown;
    base64?: string;
    format?: TabSourceFormatName;
    fileName?: string;
    url?: string;
    site?: string;
    title?: string;
    artist?: string;
    bpm?: number;
    timeSignature?: string;
    capo?: number;
    instrument?: string;
    rights?: TabRights;
    rightsNote?: string;
    chordsPerBar?: number;
    strumPattern?: string;
  }) =>
    request<TabImportPreview>('/api/tab-import/parse', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 直接解析某个内置示例 */
  parseTabSample: (id: string) =>
    request<TabImportPreview>(`/api/tab-import/samples/${encodeURIComponent(id)}/parse`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /**
   * 把解析好的 TabProject 存入曲目工程。
   * 后端会同时把谱面元数据（调性/变调夹/调弦/授权）写入 Score —— 这些会出现在 C 端契约里。
   */
  saveTabProject: (body: {
    scoreId?: string;
    newScore?: {
      title: string;
      artist?: string;
      bpm?: number;
      timeSignature?: string;
      originalAudio?: string;
      coverUrl?: string;
    };
    project: TabProjectPayload;
    fileName?: string;
    updateTrackId?: string;
  }) =>
    request<TabImportSaveResult>('/api/tab-import/save', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 列出已保存的 TabProject 文件 */
  getTabProjects: (scoreId?: string) =>
    request<{
      success: boolean;
      count: number;
      projects: Array<{
        scoreId: string;
        fileName: string;
        path: string;
        url: string;
        sizeBytes: number;
        modifiedAt: string;
      }>;
    }>(`/api/tab-import/projects${scoreId ? `?scoreId=${encodeURIComponent(scoreId)}` : ''}`),

  // ── Transcription 音频转录流水线 ─────────────────────────────
  /**
   * 本机转录能力探测（Python / Demucs / Basic Pitch / Tayuya / yt-dlp / ffmpeg）。
   * 任一缺失且 `simulate=true` 时会走内置模拟转录，链路依然可跑通。
   */
  getTranscriptionCapabilities: (force?: boolean) =>
    request<ApiTranscriptionCapabilitiesResponse>(
      `/api/transcription/capabilities${force ? '?force=true' : ''}`,
    ),

  /** 队列统计与驱动（bullmq = Redis；in-process = 单机降级） */
  getTranscriptionQueue: () => request<ApiTranscriptionQueue>('/api/transcription/queue'),

  listTranscriptionProjects: (limit = 50) =>
    request<{ success: boolean; total: number; projects: ApiTranscriptionProjectSummary[] }>(
      `/api/transcription/projects?limit=${limit}`,
    ),

  /** 项目详情：状态/进度 + 阶段时间线 + 分轨音符 + TabProject */
  getTranscriptionProject: (projectId: string) =>
    request<{ success: boolean; project: ApiTranscriptionProjectDetail }>(
      `/api/transcription/projects/${projectId}`,
    ),

  /** 上传本地音频（MP3/WAV/FLAC，base64）创建项目并立即入队 */
  createTranscriptionProjectFromUpload: (body: {
    title?: string;
    artist?: string;
    fileName: string;
    base64: string;
    bpm?: number;
    timeSignature?: string;
    capo?: number;
    tuning?: number[];
    license?: string;
  }) =>
    request<{ success: boolean; project: ApiTranscriptionProjectDetail; started: any }>(
      '/api/transcription/projects/upload',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** URL 导入（yt-dlp 下载；直链音频走 HTTP）创建项目并立即入队 */
  createTranscriptionProjectFromUrl: (body: {
    url: string;
    title?: string;
    artist?: string;
    bpm?: number;
    timeSignature?: string;
    capo?: number;
    tuning?: number[];
    license?: string;
    preferDirect?: boolean;
  }) =>
    request<{ success: boolean; project: ApiTranscriptionProjectDetail; started: any }>(
      '/api/transcription/projects/from-url',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** 启动/续跑流水线（202 立即返回，实际工作在队列里跑） */
  startTranscriptionProject: (
    projectId: string,
    body?: { bpm?: number; timeSignature?: string; capo?: number; tuning?: number[]; title?: string; artist?: string },
  ) =>
    request<{ success: boolean; projectId: string; stage: TranscriptionStage; jobId: string; driver: string }>(
      `/api/transcription/projects/${projectId}/start`,
      { method: 'POST', body: JSON.stringify(body || {}) },
    ),

  /** 失败后重试：自动从「第一个未完成的阶段」恢复 */
  retryTranscriptionProject: (projectId: string) =>
    request<{ success: boolean; projectId: string; stage: TranscriptionStage; jobId: string }>(
      `/api/transcription/projects/${projectId}/retry`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  /**
   * 人工复核保存。`tabProject` 为整体覆写 —— ReviewPage 逐音符编辑后直接回传，
   * 发布时会用这份数据（而不是模型原始输出）。
   */
  updateTranscriptionProject: (
    projectId: string,
    body: {
      bpm?: number;
      timeSignature?: string;
      capo?: number;
      tuning?: number[];
      license?: string;
      title?: string;
      artist?: string;
      tabProject?: ApiTabProject;
      status?: TranscriptionProjectStatus;
    },
  ) =>
    request<{ success: boolean; projectId: string; status: string; bpm: number }>(
      `/api/transcription/projects/${projectId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  deleteTranscriptionProject: (projectId: string) =>
    request<{ success: boolean; projectId: string; message: string }>(
      `/api/transcription/projects/${projectId}`,
      { method: 'DELETE' },
    ),

  /**
   * 发布 PracticePackage：按小节切音频（ffmpeg）→ 上传 OSS →
   * 计算 relativeTime 与归一化坐标 → 输出 schemaVersion 1.0 JSON。
   */
  publishTranscriptionProject: (
    projectId: string,
    body?: {
      publishedBy?: string;
      channel?: string;
      audioFallback?: 'source' | 'metronome';
      allowMissingAudio?: boolean;
      mirrorToScorePipeline?: boolean;
      maxMeasures?: number;
    },
  ) =>
    request<ApiTranscriptionPublishResult>(`/api/transcription/projects/${projectId}/publish`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  /** 取已发布的 PracticePackage（C 端契约，与 /api/published/scores/:id/package 同构） */
  getTranscriptionPackage: (projectId: string, revision?: number) =>
    request<ApiTranscriptionPackageResponse>(
      `/api/transcription/projects/${projectId}/package${revision ? `?revision=${revision}` : ''}`,
    ),

  /** 发布历史（每次发布 revision +1） */
  getTranscriptionRevisions: (projectId: string) =>
    request<{
      success: boolean;
      revisions: Array<{
        id: string;
        revision: number;
        schemaVersion: string;
        measureCount: number;
        noteCount: number;
        lowConfidenceCount: number;
        publishedBy: string;
        createdAt: string;
      }>;
    }>(`/api/transcription/projects/${projectId}/revisions`),

  /**
   * 项目源音频的可访问 URL —— 「对照音频校正六线谱」的播放源。
   * 分轨（吉他 / 贝斯 / 鼓 …）不走这里，直接用 `detail.tracks[].stemUrl`。
   *
   * ⚠️ 后端字段名是 `audioUrl`（不是 `url`），`url` 仅作兼容兜底。
   */
  getTranscriptionAudioUrl: (projectId: string) =>
    request<{
      success: boolean;
      audioUrl?: string | null;
      /** @deprecated 旧版字段名，仅兼容 */
      url?: string | null;
      relativePath?: string | null;
      durationSec?: number;
      title?: string;
    }>(`/api/transcription/projects/${projectId}/audio-url`),
};

export default api;
