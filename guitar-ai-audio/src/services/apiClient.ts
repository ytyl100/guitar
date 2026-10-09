/**
 * 后端 API 客户端（guitar-ai-audio 的唯一 HTTP 出口）
 * ==================================================
 *
 * 背景：这个前端原先**完全没有网络层** —— 所有业务数据都由
 * `src/utils/backendService.ts` 直接读写浏览器 localStorage（46 个方法），
 * 换浏览器/清缓存就丢数据，小程序等其它端也读不到。
 *
 * 现在：**后端是唯一数据源**，本文件是唯一的出口。
 * - `backendService` 保留原方法签名（同步），内部改为「内存缓存 + 写穿透」，
 *   这样组件调用点、样式、功能都不需要改（见 `utils/backendService.ts` 顶部说明）；
 * - 新写的代码请直接用下面按领域分组的 `*Api` 对象。
 *
 * ⚠️ 两份契约的取向：
 * - **入参/出参字段名与前端类型完全一致**（`UserProfile` / `CourseCurriculum` …），
 *   后端 `users.service.ts#serialize()` 就是照着它写的 —— 迁移不需要改业务代码；
 * - 错误统一抛 `ApiError`（带 `status` / `path` / 后端 message），
 *   避免各处再写一遍 `if (!res.ok)`。
 */

/**
 * 后端基址。
 *
 * ⚠️ 构建期注入：`VITE_API_BASE`（`.env.local`）→ 否则默认本机 3000。
 * 真机/线上必须换成 HTTPS 域名（微信小程序还要求域名白名单）。
 * 写成 `(import.meta as any).env?.X` 而不是 `import.meta.env.X`：
 * 后者只在 Vite 打包时被静态替换，**在 Node 脚本（迁移工具）里会直接报错**。
 */
const envBase =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof process !== 'undefined' ? process.env?.VITE_API_BASE || process.env?.GUITARMATE_API : undefined);

export const API_BASE: string = (envBase || 'http://localhost:3000').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: unknown;
  constructor(message: string, status: number, path: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/** 把后端的错误体（Nest 的 `{statusCode,message}` / 纯文本）压成一句可读的话 */
function describeErrorBody(body: unknown, status: number): string {
  if (!body) return `HTTP ${status}`;
  if (typeof body === 'string') return body.slice(0, 300);
  const anyBody = body as any;
  const msg = anyBody.message ?? anyBody.error;
  if (Array.isArray(msg)) return msg.join('；');
  if (typeof msg === 'string') return msg;
  return `HTTP ${status}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 超时（毫秒），默认 20s */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** 统一请求入口（唯一使用 `fetch` 的地方，便于将来换 axios / 加追踪） */
export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = 20000, signal } = options;

  let url = `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 允许外部 signal 与内部超时同时生效
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = err?.name === 'AbortError';
    throw new ApiError(
      aborted
        ? `请求超时（${timeoutMs}ms）：${path}`
        : `无法连接后端（${API_BASE}）—— 请确认 guitarmate-audio-backend 已启动`,
      aborted ? 408 : 0,
      path,
    );
  }
  clearTimeout(timer);

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload: unknown = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  /**
   * ⚠️ 「2xx 但 body 是 HTML」是这台机器上的高发故障：
   * 后端端口 3000 被 Vite 抢走时，`/api/**` 会被 SPA 回退成 `index.html` 且返回 **200**。
   * 如果只看 `res.ok`，就会把一段 HTML 当正常数据往下传，最终炸在业务代码里
   * （仓库记忆里就有一次因此白屏）。这里显式拦下。
   */
  if (res.ok && !isJson && typeof payload === 'string' && /^\s*</.test(payload)) {
    throw new ApiError(
      `后端地址返回了 HTML 而不是 JSON —— ${API_BASE} 很可能被前端 dev server 占用了（请确认后端在 3000）`,
      200,
      path,
      payload.slice(0, 200),
    );
  }

  if (!res.ok) {
    throw new ApiError(describeErrorBody(payload, res.status), res.status, path, payload);
  }
  return payload as T;
}

/** 语法糖 */
export const http = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'PUT', body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'DELETE', query }),
};

// ═══════════════════════════════════════════════════════════════
// 领域 API（按需求 (1)~(4) 分组）
// ═══════════════════════════════════════════════════════════════

/** 用户组（角色 / 权限矩阵 / 权益额度） */
export const userGroupApi = {
  list: <T = unknown[]>() => http.get<T>('/api/user-groups'),
  get: <T = unknown>(code: string) => http.get<T>(`/api/user-groups/${encodeURIComponent(code)}`),
  update: <T = unknown>(code: string, patch: Record<string, unknown>) =>
    http.put<T>(`/api/user-groups/${encodeURIComponent(code)}`, patch),
};

/** 用户 / 权限 / 积分 */
export const userApi = {
  list: <T = unknown[]>(filters?: { role?: string; status?: string; q?: string }) =>
    http.get<T>('/api/users', filters),
  get: <T = unknown>(id: string) => http.get<T>(`/api/users/${encodeURIComponent(id)}`),
  create: <T = unknown>(user: Record<string, unknown>) => http.post<T>('/api/users', user),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/users/${encodeURIComponent(id)}`, patch),
  /** 分配用户组（换组 + 按新组重算积分/配额/套餐） */
  assignRole: <T = unknown>(
    id: string,
    body: { role: string; institutionId?: string; institutionName?: string; teacherId?: string; teacherName?: string; resetCredits?: boolean },
  ) => http.patch<T>(`/api/users/${encodeURIComponent(id)}/role`, body),
  bindTeacher: <T = unknown>(studentId: string, body: Record<string, unknown>) =>
    http.post<T>(`/api/users/${encodeURIComponent(studentId)}/bind-teacher`, body),
  /** 按组层级可见的用户（超管看全部 → 机构看旗下 → 教师看学员 → 学员看教师） */
  visible: <T = unknown>(asUserId: string) => http.get<T>('/api/users/visible', { asUserId }),
  search: <T = unknown[]>(q: string, role?: string) => http.get<T>('/api/users/search', { q, role }),
  importUsers: <T = unknown>(users: unknown[], replaceAll = false) =>
    http.post<T>('/api/users/import', { users, replaceAll }),
  taskProgress: <T = Record<string, boolean>>(userId: string) =>
    http.get<T>(`/api/users/${encodeURIComponent(userId)}/task-progress`),
  setTaskCompleted: <T = Record<string, boolean>>(userId: string, itemId: string, completed = true) =>
    http.post<T>(`/api/users/${encodeURIComponent(userId)}/task-progress`, { itemId, completed }),
  transactions: <T = unknown[]>(userId?: string, limit?: number) =>
    userId
      ? http.get<T>(`/api/users/${encodeURIComponent(userId)}/credits/transactions`, { limit })
      : http.get<T>('/api/users/credits/transactions', { limit }),
  /** 追加一条流水（幂等，按 id upsert）—— 余额那条链路已经是 `/api/users/import` */
  recordTransaction: <T = unknown>(
    tx: { id?: string; userId: string; amount: number; type: string; description: string; balanceAfter: number; createdAt?: string },
  ) => http.post<T>('/api/users/credits/transactions', tx),
  checkCredits: <T = unknown>(userId: string, body: { requiredCredits?: number; audioSeconds?: number }) =>
    http.post<T>(`/api/users/${encodeURIComponent(userId)}/credits/check`, body),
  deductCredits: <T = unknown>(
    userId: string,
    body: { amount?: number; audioSeconds?: number; description: string; type?: string },
  ) => http.post<T>(`/api/users/${encodeURIComponent(userId)}/credits/deduct`, body),
  grantCredits: <T = unknown>(
    userId: string,
    body: { amount?: number; audioSeconds?: number; description: string; type?: string },
  ) => http.post<T>(`/api/users/${encodeURIComponent(userId)}/credits/grant`, body),
};

/** 健康检查（联调第一步） */
export const healthApi = {
  check: <T = unknown>() => http.get<T>('/api/health'),
};

// ─────────────────────────────────────────────────────────────
// 需求 (2)：课纲 / 教学视频 / 和弦组合
// ─────────────────────────────────────────────────────────────

/**
 * 课程大纲。返回形状与前端 `CourseCurriculum` **完全一致**，
 * 所以 `backendService` 里可以直接把返回值当成原先 localStorage 里那份数据用。
 */
export const courseApi = {
  list: <T = unknown[]>(filters?: { status?: string; q?: string; teacherId?: string; institutionId?: string }) =>
    http.get<T>('/api/courses', filters),
  get: <T = unknown>(id: string) => http.get<T>(`/api/courses/${encodeURIComponent(id)}`),
  create: <T = unknown>(course: Record<string, unknown>) => http.post<T>('/api/courses', course),
  /** 整份覆盖保存（`saveSingleCourse` 用）；`baseUpdatedAt` 传了才做乐观锁 */
  upsert: <T = unknown>(id: string, course: Record<string, unknown>, baseUpdatedAt?: string) =>
    http.put<T>(`/api/courses/${encodeURIComponent(id)}`, course, baseUpdatedAt ? { baseUpdatedAt } : undefined),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/courses/${encodeURIComponent(id)}`, patch),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/courses/${encodeURIComponent(id)}`),
  publish: <T = unknown>(id: string, body: { versionNote?: string; author?: string }) =>
    http.post<T>(`/api/courses/${encodeURIComponent(id)}/publish`, body),
  archive: <T = unknown>(id: string) => http.post<T>(`/api/courses/${encodeURIComponent(id)}/archive`),
  rollback: <T = unknown>(id: string, targetVersion: string) =>
    http.post<T>(`/api/courses/${encodeURIComponent(id)}/rollback`, { targetVersion }),
  importCourses: <T = unknown>(courses: unknown[], replaceAll = false) =>
    http.post<T>('/api/courses/import', { courses, replaceAll }),
};

/** 教学视频（含打点 `cuePoints`） */
export const videoApi = {
  list: <T = unknown[]>(filters?: { status?: string; q?: string; associatedCourseId?: string }) =>
    http.get<T>('/api/videos', filters),
  get: <T = unknown>(id: string) => http.get<T>(`/api/videos/${encodeURIComponent(id)}`),
  create: <T = unknown>(video: Record<string, unknown>) => http.post<T>('/api/videos', video),
  upsert: <T = unknown>(id: string, video: Record<string, unknown>) =>
    http.put<T>(`/api/videos/${encodeURIComponent(id)}`, video),
  /** ⚠️ 默认级联清理课纲里引用该视频的内容项（与前端 `deleteVideo` 一致） */
  remove: <T = unknown>(id: string, cascade = true) =>
    http.del<T>(`/api/videos/${encodeURIComponent(id)}`, cascade ? undefined : { cascade: 'false' }),
  importVideos: <T = unknown>(videos: unknown[], replaceAll = false) =>
    http.post<T>('/api/videos/import', { videos, replaceAll }),
};

/** 和弦组合（BPM 阶梯） */
export const drillApi = {
  list: <T = unknown[]>(filters?: { status?: string; q?: string }) => http.get<T>('/api/drills', filters),
  get: <T = unknown>(id: string) => http.get<T>(`/api/drills/${encodeURIComponent(id)}`),
  create: <T = unknown>(drill: Record<string, unknown>) => http.post<T>('/api/drills', drill),
  upsert: <T = unknown>(id: string, drill: Record<string, unknown>) =>
    http.put<T>(`/api/drills/${encodeURIComponent(id)}`, drill),
  remove: <T = unknown>(id: string, cascade = true) =>
    http.del<T>(`/api/drills/${encodeURIComponent(id)}`, cascade ? undefined : { cascade: 'false' }),
  publishAll: <T = unknown>() => http.post<T>('/api/drills/publish-all'),
  importDrills: <T = unknown>(drills: unknown[], replaceAll = false) =>
    http.post<T>('/api/drills/import', { drills, replaceAll }),
};

// ─────────────────────────────────────────────────────────────
// 需求 (3)：音频乐谱库
// ─────────────────────────────────────────────────────────────

/**
 * 曲库条目（含每条的**完整乐谱** `score`）。
 *
 * ⚠️ 不要拿它跟 `/api/published/library` 混：那个是给小程序读的
 * 「已发布练习题（小节级）」，两者是同名但内容不同的两份转录。
 * 详见 `guitarmate-audio-backend/src/library/library.service.ts` 顶部说明。
 */
export const libraryApi = {
  list: <T = unknown[]>(filters?: { category?: string; instrument?: string; ownerUserId?: string; q?: string }) =>
    http.get<T>('/api/library', filters),
  get: <T = unknown>(id: string) => http.get<T>(`/api/library/${encodeURIComponent(id)}`),
  stats: <T = unknown>() => http.get<T>('/api/library/stats'),
  create: <T = unknown>(item: Record<string, unknown>) => http.post<T>('/api/library', item),
  /** 整份覆盖保存（含乐谱本体；不存在则新建） */
  upsert: <T = unknown>(id: string, item: Record<string, unknown>) =>
    http.put<T>(`/api/library/${encodeURIComponent(id)}`, item),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/library/${encodeURIComponent(id)}`, patch),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/library/${encodeURIComponent(id)}`),
  importItems: <T = unknown>(items: unknown[], replaceAll = false) =>
    http.post<T>('/api/library/import', { items, replaceAll }),
};

// ─────────────────────────────────────────────────────────────
// 需求 (4)：通知 / 积分恢复工单 / 企业线索 / 定价方案
// ─────────────────────────────────────────────────────────────

/** 站内通知（原 localStorage `guitarmate_notifications_list_v1`） */
export const notificationApi = {
  list: <T = unknown[]>(filters?: { isRead?: boolean; type?: string; q?: string }) =>
    http.get<T>('/api/notifications', filters as RequestOptions['query']),
  unreadCount: <T = { unread: number }>() => http.get<T>('/api/notifications/unread-count'),
  create: <T = unknown>(n: Record<string, unknown>) => http.post<T>('/api/notifications', n),
  upsert: <T = unknown>(id: string, n: Record<string, unknown>) =>
    http.put<T>(`/api/notifications/${encodeURIComponent(id)}`, n),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/notifications/${encodeURIComponent(id)}`, patch),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/notifications/${encodeURIComponent(id)}`),
  markAllRead: <T = unknown>() => http.post<T>('/api/notifications/mark-all-read'),
  importItems: <T = unknown>(items: unknown[], replaceAll = false) =>
    http.post<T>('/api/notifications/import', { items, replaceAll }),
};

/**
 * 积分恢复工单。
 *
 * ⚠️ `approve` 在服务端是**一个事务**（置状态 + 发积分 + 记流水）且**幂等**。
 * 前端不要自己 `grantCredits` 再改状态 —— 那样点两次就会发两次积分。
 */
export const creditRecoveryApi = {
  list: <T = unknown[]>(filters?: { status?: string; userId?: string }) => http.get<T>('/api/credit-recovery-requests', filters),
  pendingCount: <T = { pending: number }>() => http.get<T>('/api/credit-recovery-requests/pending-count'),
  get: <T = unknown>(id: string) => http.get<T>(`/api/credit-recovery-requests/${encodeURIComponent(id)}`),
  apply: <T = unknown>(body: {
    id?: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    userRole?: string;
    currentCredits?: number;
    requestedAmount?: number;
    reason: string;
    createdAt?: string;
  }) => http.post<T>('/api/credit-recovery-requests', body),
  approve: <T = { newBalance?: number; grantedAmount?: number }>(id: string, body: { approvedBy?: string; amount?: number } = {}) =>
    http.post<T>(`/api/credit-recovery-requests/${encodeURIComponent(id)}/approve`, body),
  reject: <T = unknown>(id: string, reason?: string) =>
    http.post<T>(`/api/credit-recovery-requests/${encodeURIComponent(id)}/reject`, { reason }),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/credit-recovery-requests/${encodeURIComponent(id)}`),
  importItems: <T = unknown>(items: unknown[], replaceAll = false) =>
    http.post<T>('/api/credit-recovery-requests/import', { items, replaceAll }),
};

/** 企业版线索（定价页「联系我们」表单） */
export const enterpriseLeadApi = {
  list: <T = unknown[]>(filters?: { status?: string; q?: string }) => http.get<T>('/api/enterprise-leads', filters),
  stats: <T = unknown>() => http.get<T>('/api/enterprise-leads/stats'),
  create: <T = unknown>(lead: Record<string, unknown>) => http.post<T>('/api/enterprise-leads', lead),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/enterprise-leads/${encodeURIComponent(id)}`, patch),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/enterprise-leads/${encodeURIComponent(id)}`),
  importItems: <T = unknown>(items: unknown[], replaceAll = false) =>
    http.post<T>('/api/enterprise-leads/import', { items, replaceAll }),
};

/** 定价方案（原前端常量 `PRICING_PLANS`） */
export const pricingPlanApi = {
  list: <T = unknown[]>() => http.get<T>('/api/pricing-plans'),
  get: <T = unknown>(id: string) => http.get<T>(`/api/pricing-plans/${encodeURIComponent(id)}`),
  create: <T = unknown>(plan: Record<string, unknown>) => http.post<T>('/api/pricing-plans', plan),
  update: <T = unknown>(id: string, patch: Record<string, unknown>) =>
    http.patch<T>(`/api/pricing-plans/${encodeURIComponent(id)}`, patch),
  remove: <T = unknown>(id: string) => http.del<T>(`/api/pricing-plans/${encodeURIComponent(id)}`),
  importPlans: <T = unknown>(plans: unknown[], replaceAll = false) =>
    http.post<T>('/api/pricing-plans/import', { plans, replaceAll }),
};
