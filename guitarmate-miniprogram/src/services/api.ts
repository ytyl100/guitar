import Taro from '@tarojs/taro';

/**
 * 后端接口层（小程序版）
 * =====================
 *
 * 与 Web 版 `guitarmate-frontend/src/services/api.ts` **同一个后端契约**，
 * 但传输层从 `fetch` 换成 `Taro.request`（小程序没有 fetch）。
 *
 * ⚠️ 网络域名限制：
 * - **开发者工具**：用 `project.config.json` 里的 `setting.urlCheck: false`（已设）即可访问 `http://localhost`；
 * - **真机预览**：小程序要求 request/音频域名都是 **HTTPS** 且已加入「服务器域名」白名单，
 *   `http://` 与 IP 地址都不允许。真机联调需要把后端部署到 HTTPS 域名，
 *   或用内网穿透工具给一个 https 域名。
 */

/** 后端基址：可在 `config/index.js` 的 defineConstants 里覆盖 */
export const API_BASE: string =
  (typeof process !== 'undefined' && (process.env as Record<string, string>)?.TARO_APP_API) ||
  'http://localhost:3000';

/** 把契约里的相对路径（`/uploads/...`）补成完整地址 */
export function resolveUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  try {
    const res = await Taro.request<T>({
      url: `${API_BASE}${path}`,
      method,
      timeout: 20000,
      header: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { data: body }),
    });
    if (res.statusCode >= 400) {
      const body = res.data as unknown as { message?: string; error?: string };
      throw new Error(body?.message || body?.error || `HTTP ${res.statusCode}`);
    }
    return res.data;
  } catch (err) {
    /**
     * ⚠️ `Taro.request` 的失败原因非常容易被“吞掉”：
     * 域名未校验 / 后端没起 / 端口写错，在真机上都表现为同一句 `request:fail`。
     * 所以这里把原始 message 带出去，页面直接把可操作提示展示给用户。
     */
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`请求 ${path} 失败：${msg}（后端 ${API_BASE} 是否已启动？）`);
  }
}

/** 与后端 `PublishedLibraryService.list()` 对应 */
export interface LibraryItem {
  id: string;
  source: 'score' | 'transcription';
  title: string;
  artist: string | null;
  coverUrl: string | null;
  bpm: number | null;
  timeSignature: string | null;
  measureCount: number;
  noteCount: number | null;
  createdAt: string;
}

/** C 端统一曲库（小程序只读这一个接口，与 CMS「已发布」保持一致） */
export function getPublishedLibrary(): Promise<LibraryItem[]> {
  return request<LibraryItem[]>('/api/published/library');
}

export function fetchPracticePackage(id: string): Promise<import('../utils/practice').PracticePackage> {
  return request(`/api/published/items/${encodeURIComponent(id)}/package`);
}

export interface TabRenderParams {
  from: number;
  count: number;
  instrument?: string;
  theme?: 'dark' | 'light';
  /** 画布像素宽；**建议传成图片实际显示宽度**，这样坐标可以 1:1 使用，无需缩放 */
  width?: number;
}

function tabQuery(params: TabRenderParams): string {
  const q = [
    `from=${params.from}`,
    `count=${params.count}`,
    `theme=${params.theme ?? 'dark'}`,
    `width=${params.width ?? 600}`,
  ];
  if (params.instrument) q.push(`instrument=${encodeURIComponent(params.instrument)}`);
  return q.join('&');
}

/** 六线谱 PNG（服务端渲染，小程序不支持 WXML 里的 <svg>） */
export function tabPngUrl(id: string, params: TabRenderParams): string {
  return `${API_BASE}/api/published/items/${encodeURIComponent(id)}/tab.png?${tabQuery(params)}`;
}

/**
 * 课程大纲（C 端投影）
 * =====================
 *
 * ⚠️ **课程不再是前端硬编码的一份假数据**：课程大纲由 CMS（`guitarmate-studio-cms` 的
 * 课程大纲工作台）维护，经 `PUT /api/curriculum` 存到后端，C 端只读
 * `GET /api/curriculum/learn` 这个**投影**（不含 prerequisite 阈值、转码状态等管理字段）。
 * 后端返回的形状与 CMS 的课程树一一对应：阶段 → 课程 → 章节 → 课时。
 */
export interface LearnLesson {
  id: string;
  title: string;
  /** tuning | video | chord_quiz | pair_drill | song_sync */
  type: string;
  /** 黄金 20 分钟配比（分）；缺省为 null */
  timeAllocation: {
    tuningMin?: number;
    videoMin?: number;
    quizMin?: number;
    drillMin?: number;
    songMin?: number;
  } | null;
  video: {
    /** 视频库条目 id（内联副本回退时为空串） */
    id?: string;
    title: string;
    instructor: string;
    durationSec: number;
    resolution: string;
    /** 真正能播的地址（后端已拼成绝对 URL）；空串 = 还没有视频源 */
    url?: string;
    /**
     * 「能不能播」由**后端**判定（CMS 填过地址才算），不信任 CMS 里写死的 `transcodeStatus`。
     * C 端据此决定给不给播放按钮 —— 不给假按钮。
     *
     * ⚠️ 语义是「有地址」，**不是「地址可达」**：种子里的 `cdn.guitarmate.dev` 是占位域名，
     * 这种条目也会返回 true，点下去播放器会加载失败（后端目前不做可达性探测，原因见投影注释）。
     */
    playable?: boolean;
    keyPoints: Array<{
      timeSec: number;
      title: string;
      /** 打点说明（视频库实体里才有） */
      description?: string;
      /** 该打点联动的和弦名（视频库实体里才有） */
      chordName?: string;
    }>;
  } | null;
  chordGroupIds: string[];
  song: {
    songName?: string;
    difficulty?: string;
    originalArtist?: string;
  } | null;
}

export interface LearnChapter {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LearnLesson[];
}

export interface LearnCourse {
  id: string;
  title: string;
  subtitle: string;
  /** CMS 里存的课程主题色（Tailwind 渐变 token，不是颜色值） */
  coverColor: string;
  /**
   * 课程封面图（后端给的**绝对 URL**，CMS 上传得到）。
   * 为空/缺失 → 回退到 `coverColor` 渐变（与 Web 版一致：不塞占位照片，不编造内容）。
   */
  coverImage?: string | null;
  targetLevel: string;
  chapters: LearnChapter[];
}

export interface LearnStage {
  id: string;
  stageCode: string;
  name: string;
  focus: string;
  order: number;
  courses: LearnCourse[];
}

export interface LearnCurriculum {
  revision: number;
  updatedAt: string;
  stages: LearnStage[];
}

export function fetchCurriculumLearn(): Promise<LearnCurriculum> {
  return request<LearnCurriculum>('/api/curriculum/learn');
}

/** 与 PNG **同一次排版**的坐标（叠加高亮层用，坐标系 = PNG 的 viewBox） */
export function tabLayoutUrl(id: string, params: TabRenderParams): string {
  return `${API_BASE}/api/published/items/${encodeURIComponent(id)}/tab.json?${tabQuery(params)}`;
}

/**
 * 和弦/单弦试听：让**后端**合成一段 WAV，返回可直接播放的地址。
 *
 * ⚠️ 为什么不是客户端合成：Web 版用 Web Audio 的振荡器（`audioSynth.playString`），
 * 而小程序**没有 Web Audio API** —— `InnerAudioContext` 只能播文件。
 * 后端已有纯 Node 的拨弦合成器，所以这里只是要一个 URL。
 *
 * @param frets 6 个品位，顺序 = 第 6 弦 → 第 1 弦；`-1` = 不弹
 * @param delayMs 每弦间隔毫秒（扫弦 35；拨单弦 0）
 */
export function fetchStrumUrl(frets: number[], delayMs: number): Promise<string> {
  return request<{ url: string }>(
    `/api/audio/strum?frets=${frets.join(',')}&delay=${delayMs}`,
  ).then((r) => r.url);
}

export interface TabLayoutNote {
  id: string;
  /** 所属小节序号（1 起） */
  measureIndex: number;
  /** 段内下标（0 起）—— 过滤「当前小节」的音符用它 */
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  string: number;
  fret: number;
}

export interface TabLayoutMeasure {
  index: number;
  label: string;
  duration: number;
  contentLeft: number;
  contentRight: number;
  audioUrl: string | null;
  originalAudioUrl: string | null;
}

export interface TabLayout {
  width: number;
  height: number;
  staffTop: number;
  staffBottom: number;
  progressY: number;
  stringYs: number[];
  from: number;
  isLastSystem: boolean;
  measures: TabLayoutMeasure[];
  notes: TabLayoutNote[];
  barres: Array<{ id: string; measureIndex: number; x: number; y: number; w: number; h: number }>;
}

export function fetchTabLayout(id: string, params: TabRenderParams): Promise<TabLayout> {
  return request<TabLayout>(`/api/published/items/${encodeURIComponent(id)}/tab.json?${tabQuery(params)}`);
}

/* ═══════════════════════════════════════════════════════════════════
 * 用户 / 用户组 / 任务进度 / 通知 / 积分
 * ═══════════════════════════════════════════════════════════════════
 *
 * 这一段对应「需求 (1) 用户权限体系」与「需求 (4) 通知与 credits」，
 * 与 Web 版 `guitar-ai-audio` 读的是**同一套** `/api/users`、`/api/notifications`、
 * `/api/credits-*`，所以两端看到的用户资料/余额/通知是一致的。
 */

/**
 * ⚠️ **当前用户是怎么来的**：小程序还没有登录态（没有 `wx.login` + openid 绑定），
 * 所以这里先用一个**可配置的演示账号**顶着：
 * 默认 `usr_student_demo`（学员小明，与 Web 版当前登录的演示账号同名），
 * 可用 `config/index.js` 的 `defineConstants.TARO_APP_USER_ID` 覆盖成任意账号 id。
 *
 * 接真实登录时**只需要改这一处**：把换来的 userId 塞进来即可，
 * 下面所有接口与「我的」页都不用动。
 */
export const CURRENT_USER_ID: string = process.env.TARO_APP_USER_ID || 'usr_student_demo';

/** 后端 `UserProfile`（与 Web 版同形；字段为 null 表示后端没有这个信息） */
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isLoggedIn: boolean;
  memberSince: string;
  plan: string;
  trialActive: boolean;
  trialExpiresAt?: string;
  language: string;
  credits: number;
  isUnlimitedCredits: boolean;
  monthlyCreditQuota?: number;
  creditsCycleResetDate?: string;
  optOutAiTraining: boolean;
  institutionId?: string;
  institutionName?: string;
  teacherId?: string;
  teacherName?: string;
  completedLessonsCount: number;
  status: string;
  phone?: string;
  wechat?: string;
  address?: string;
  bio?: string;
}

/** 用户组（角色 / 权限矩阵 / 权益额度） */
export interface ApiUserGroup {
  code: string;
  name: string;
  level: number;
  description?: string;
  permissions?: string[];
  isUnlimitedCredits?: boolean;
  defaultCredits?: number;
  maxTranscriptionSeconds?: number;
  exportFormats?: string[];
  curriculumRights?: string;
}

/** 站内通知（与 Web 版 `AppNotification` 同形） */
export interface ApiNotification {
  id: string;
  /** feedback | score_update | drill_award | system */
  type: string;
  title: string;
  summary: string;
  content: string;
  timeAgo: string;
  timestamp: string;
  isRead: boolean;
  tag?: string;
  author?: string;
  scoreId?: string;
  courseId?: string;
}

/** 积分流水（负数 = 扣减） */
export interface ApiCreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export function fetchUser(userId: string = CURRENT_USER_ID): Promise<ApiUser> {
  return request<ApiUser>(`/api/users/${encodeURIComponent(userId)}`);
}

export function fetchUserGroups(): Promise<ApiUserGroup[]> {
  return request<ApiUserGroup[]>('/api/user-groups');
}

/** 任务进度：`{ [itemId]: boolean }`。itemId 既可能是 CMS 的 `lesson-step-xxx`，也可能是课程内容项 id */
export function fetchTaskProgress(userId: string = CURRENT_USER_ID): Promise<Record<string, boolean>> {
  return request<Record<string, boolean>>(`/api/users/${encodeURIComponent(userId)}/task-progress`);
}

export function setTaskCompleted(
  itemId: string,
  completed = true,
  userId: string = CURRENT_USER_ID,
): Promise<Record<string, boolean>> {
  return request<Record<string, boolean>>(`/api/users/${encodeURIComponent(userId)}/task-progress`, 'POST', {
    itemId,
    completed,
  });
}

export function fetchNotifications(): Promise<ApiNotification[]> {
  return request<ApiNotification[]>('/api/notifications');
}

export function fetchUnreadNotificationCount(): Promise<{ unread: number }> {
  return request<{ unread: number }>('/api/notifications/unread-count');
}

/** 一键全部已读（后端返回全量列表，直接拿去刷新本地状态） */
export function markAllNotificationsRead(): Promise<{ updated: number; notifications: ApiNotification[] }> {
  return request<{ updated: number; notifications: ApiNotification[] }>('/api/notifications/mark-all-read', 'POST');
}

export function fetchCreditTransactions(
  userId: string = CURRENT_USER_ID,
  limit = 20,
): Promise<ApiCreditTransaction[]> {
  return request<ApiCreditTransaction[]>(
    `/api/users/${encodeURIComponent(userId)}/credits/transactions?limit=${limit}`,
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * 课程大纲（guitar-ai-audio 的学员课纲）
 * ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️ 与 `fetchCurriculumLearn()`（CMS 课纲 `/api/curriculum/learn`）是**两套不同的课纲**：
 *
 * | | `/api/curriculum/learn`（CMS） | `/api/courses`（本段） |
 * |---|---|---|
 * | 结构 | 阶段 → 课程 → 章节 → 课时（黄金 20 分钟五步） | 课程 → 章节 → **内容项**（3 种类型） |
 * | 谁在用 | `guitarmate-studio-cms` 的课纲工作台 | **`guitar-ai-audio` 的学员端**（教师发布） |
 * | 内容项 | 调音/视频/微测/转换/跟弹 五种课时 | `video` / `chord_drill` / `transcription_score` 三种 |
 *
 * 学员在微信小程序里要看的正是**教师发布的那套**，所以本段读 `/api/courses`。
 * 两套都保留：CMS 那套是教研侧的排课，这套是学员侧的课纲。
 */

/** 章节内容项（三种类型，对应三个内页） */
export interface CourseItem {
  id: string;
  title: string;
  /** `video` = 视频教程 | `chord_drill` = 和弦微测 | `transcription_score` = 乐谱练习 */
  type: 'video' | 'chord_drill' | 'transcription_score';
  description: string;
  orderIndex: number;
  /** 视频项：关联 `TeachingVideo.id` */
  videoId?: string;
  videoUrl?: string;
  cuePoints?: VideoCuePoint[];
  /** 和弦微测项：关联 `ChordDrill.id` */
  chordDrillId?: string;
  chords?: string[];
  bpmTarget?: number;
  /** 乐谱练习项：关联**曲库条目** id（`/api/library` 的 id，如 `macaroon-5`） */
  scoreId?: string;
  scoreTitle?: string;
  scoreArtist?: string;
  scoreCoverUrl?: string;
  scoreTempo?: number;
}

export interface VideoCuePoint {
  id: string;
  timeSeconds: number;
  timeFormatted: string;
  label: string;
  description?: string;
}

export interface CourseChapter {
  id: string;
  title: string;
  category: string;
  description: string;
  totalDuration: string;
  orderIndex: number;
  items: CourseItem[];
}

/** 课程（`guitar-ai-audio` 的 `CourseCurriculum`，与后端 `Course` 表一一对应） */
export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverImage: string;
  level: string;
  totalLessons: number;
  totalHours: string;
  category: string;
  teacherId: string;
  teacherName: string;
  institutionId: string;
  institutionName: string;
  /**
   * ⚠️ **系统基础课**标记。学员端的"课程切换"就靠它分两组：
   * `true` = 平台内置基础课（人人可见）；`false` = 教师/机构发布的课（学员及以上可见）。
   */
  isSystemBasic?: boolean;
  isFree?: boolean;
  status: 'published' | 'draft' | 'archived';
  version: string;
  versionHistory: Array<{ version: string; date: string; author: string; note: string }>;
  orderIndex: number;
  chapters: CourseChapter[];
}

/** 教学视频（含关键打点） */
export interface TeachingVideo {
  id: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  durationFormatted: string;
  associatedCourseId?: string;
  associatedCourseTitle?: string;
  cuePoints: VideoCuePoint[];
  status?: 'published' | 'draft';
  videoSourceType?: 'link' | 'upload';
}

/** 和弦微测组合（BPM 阶梯） */
export interface ChordDrill {
  id: string;
  title: string;
  chords: string[];
  bpmStart: number;
  bpmTarget: number;
  /** BPM 阶梯，如 `[60,80,100,120]` */
  steps: number[];
  description?: string;
  createdAt: string;
  status?: 'published' | 'draft';
}

/** 曲库条目（`/api/library`；⚠️ **带完整乐谱本体** `score`，与 `/api/published/library` 不是一回事） */
export interface ScoreLibraryItem {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  coverUrl: string;
  /** Acoustic Guitar | Electric Guitar | Classical Guitar | Bass */
  instrument: string;
  /** system = 平台曲库 | user = 用户上传 */
  category: 'system' | 'user';
  /** unlocked = 正式解锁 | trial = 试听 */
  type: 'unlocked' | 'trial';
  badges: string[];
  tempo: number;
  keySignature: string;
  capo: number;
  durationSeconds: number;
  createdAt: string;
  isFavorite?: boolean;
  /** 交叉引用：对应的已发布乐谱 id（可空） */
  scoreId?: string;
  /** **乐谱本体**（`ScoreData`）—— 客户端据此渲染五线谱/六线谱 */
  score: ScoreData;
}

/** 乐谱数据（与 `guitar-ai-audio/src/types/music.ts` 的 `ScoreData` 同形） */
export interface ScoreData {
  id: string;
  title: string;
  subtitle: string;
  tempo: number;
  timeSignature: string;
  keySignature: string;
  flatsCount?: number;
  sharpsCount?: number;
  /** [高音 E, B, G, D, A, 低音 E] */
  tuning: string[];
  tuningName: string;
  capo: number;
  transcribedBy: string;
  measures: ScoreMeasure[];
  totalDurationSeconds: number;
  sourceType?: 'youtube' | 'tiktok' | 'file' | 'audio';
  videoUrl?: string;
  videoTitle?: string;
  videoArtist?: string;
  videoThumbnail?: string;
}

export interface ScoreNote {
  id: string;
  /** 1 = 最细的高音 E 弦 */
  string: number;
  fret: number;
  duration: string;
  /** 小节内位置（四分音符为单位） */
  beat: number;
  durationBeats: number;
  isTied?: boolean;
  technique?: string;
  pitch: string;
  midi: number;
}

export interface ScoreMeasure {
  id: string;
  number: number;
  chord?: { name: string; fretPosition?: number; beat: number; diagramFret?: number };
  notes: ScoreNote[];
}

/** 课程列表（默认只取已发布；`status` 可覆盖） */
export function fetchCourses(query?: { status?: string; q?: string }): Promise<Course[]> {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return request<Course[]>(`/api/courses${qs ? `?${qs}` : ''}`);
}

export function fetchCourse(id: string): Promise<Course> {
  return request<Course>(`/api/courses/${encodeURIComponent(id)}`);
}

export function fetchTeachingVideos(query?: { status?: string }): Promise<TeachingVideo[]> {
  const qs = query?.status ? `?status=${encodeURIComponent(query.status)}` : '';
  return request<TeachingVideo[]>(`/api/videos${qs}`);
}

export function fetchChordDrills(query?: { status?: string }): Promise<ChordDrill[]> {
  const qs = query?.status ? `?status=${encodeURIComponent(query.status)}` : '';
  return request<ChordDrill[]>(`/api/drills${qs}`);
}

/**
 * 曲库列表。
 *
 * ⚠️ 列表页用 `withScore: false`：带上乐谱本体时 7 条就要 29KB（约 156 B/音符），
 * 曲子一多列表就会白白拖慢首屏。**要点开某一条练习时再按 id 取完整版**
 * （`fetchScoreLibraryItem`）。
 */
export function fetchScoreLibrary(query?: {
  category?: string;
  instrument?: string;
  q?: string;
  withScore?: boolean;
}): Promise<ScoreLibraryItem[]> {
  const params: Record<string, string> = {};
  if (query?.category) params.category = query.category;
  if (query?.instrument) params.instrument = query.instrument;
  if (query?.q) params.q = query.q;
  if (query?.withScore === false) params.withScore = 'false';
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return request<ScoreLibraryItem[]>(`/api/library${qs ? `?${qs}` : ''}`);
}

/** 单条曲库条目（**含乐谱本体** `score`，练习页用） */
export function fetchScoreLibraryItem(id: string): Promise<ScoreLibraryItem> {
  return request<ScoreLibraryItem>(`/api/library/${encodeURIComponent(id)}`);
}
