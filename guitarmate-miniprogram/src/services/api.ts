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

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  try {
    const res = await Taro.request<T>({
      url: `${API_BASE}${path}`,
      method,
      timeout: 20000,
      header: { Accept: 'application/json' },
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
