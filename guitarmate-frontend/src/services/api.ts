/**
 * GuitarMate 小程序 — 六线谱练习 API 客户端
 * 对接 guitarmate-audio-backend (NestJS + Prisma + SQLite)
 *
 * 后端地址: http://localhost:3000  (Swagger: http://localhost:3000/docs)
 * 可通过 VITE_API_BASE_URL 覆盖。
 */
import type { Measure, PublishedScore } from '../practiceTypes';
import {
  PracticePackageError,
  SUPPORTED_SCHEMA_VERSIONS,
  normalizeToPracticePackage,
  validatePracticePackage,
  type PracticePackage,
} from '../practicePackage';

export const API_BASE_URL: string =
  (import.meta.env?.VITE_API_BASE_URL as string) || 'http://localhost:3000';

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError(
      `无法连接后端服务 ${API_BASE_URL}，请确认 guitarmate-audio-backend 已启动。`,
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

/**
 * C 端曲库条目（统一视图）
 * ========================
 * 后端两条发布链路（旧 Score 链路 / 转录 PracticePackage 链路）合并后的条目。
 * `id` 既可能是 Score id，也可能是转录 Project id —— 取详情时统一用
 * `/api/published/items/:id/package`，小程序端无需关心来源。
 */
export interface PublishedLibraryItem {
  id: string;
  source: 'score' | 'transcription';
  title: string;
  artist?: string | null;
  coverUrl?: string | null;
  bpm?: number | null;
  timeSignature?: string;
  originalAudio?: string | null;
  measureCount?: number;
  noteCount?: number | null;
  createdAt?: string;
  /** 旧接口字段（`GET /api/published/scores`） */
  _count?: { measures?: number; tracks?: number };
}

export const api = {
  /**
   * 统一曲库列表（推荐入口）
   * ======================
   * 必须走这个接口：只读 `/scores` 会漏掉**转录链路**发布的曲目
   * （复核页「发布 PracticePackage」默认不镜像到 Score，
   *  实测 Macaroon 5 / Isolated 就是这样在 C 端完全看不到的）。
   * 后端未升级（404）时自动回退到旧的 `/scores`。
   */
  getPublishedLibrary: async (): Promise<PublishedLibraryItem[]> => {
    try {
      return await request<PublishedLibraryItem[]>('/api/published/library');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const legacy = await request<PublishedLibraryItem[]>('/api/published/scores');
        return legacy.map((s) => ({ ...s, source: 'score' as const, measureCount: s._count?.measures }));
      }
      throw err;
    }
  },

  /** 已发布曲目列表 (旧接口，保留兼容) */
  getPublishedScores: () => request<PublishedScore[]>('/api/published/scores'),

  /** 指定曲目的全部练习小节 (含反序列化后的 notes) */
  getMeasuresByScore: (scoreId: string) =>
    request<Measure[]>(`/api/published/scores/${scoreId}/measures`),

  /**
   * 获取 PracticePackage —— 小程序端唯一数据契约
   * ==========================================
   *
   * 流程：
   * 1. 优先 `/api/published/items/:id/package` —— **同时支持 Score id 与转录 Project id**
   * 2. 后端未升级（404）→ 回退旧的 `/api/published/scores/:id/package`
   * 3. 再不行 → 回退更旧的 `/measures` 数组，并用 `normalizeToPracticePackage()` 包装
   * 4. 版本白名单 + 必需字段校验；校验失败时**降级**：保留可渲染的小节并回报问题，
   *    只有「致命错误」才抛 `PracticePackageError`（供 UI 提示用户升级小程序）
   *
   * 关键：调用方拿到的永远是同一套结构，渲染层只写一遍。
   */
  fetchPracticePackage: async (scoreId: string): Promise<PracticePackage> => {
    const attempts = [
      `/api/published/items/${scoreId}/package`,
      `/api/published/scores/${scoreId}/package`,
      `/api/published/scores/${scoreId}/measures`,
    ];

    let payload: unknown = null;
    let lastError: unknown = null;
    for (const path of attempts) {
      try {
        payload = await request<unknown>(path);
        break;
      } catch (err) {
        lastError = err;
        // 只有「接口不存在 / 资源不存在」才继续降级；网络错误直接抛出
        if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 400)) throw err;
      }
    }
    if (payload === null) {
      throw lastError instanceof ApiError ? lastError : new ApiError('无法加载已发布的练习数据');
    }

    const validation = validatePracticePackage(
      // 旧接口返回数组，先归一化成契约结构再校验（保证校验逻辑只有一套）
      Array.isArray(payload) ? normalizeToPracticePackage(payload, { scoreId }) : payload,
    );

    if (!validation.ok) {
      throw new PracticePackageError(
        `PracticePackage 数据不完整：${validation.errors.slice(0, 3).join('；')}`,
        validation.errors,
      );
    }
    if (validation.warnings.length > 0) {
      // 不阻断渲染：警告交给调用方决定如何提示（例如「该小节无音频，已用节拍器」）
      console.warn('[PracticePackage] 数据告警：', validation.warnings.slice(0, 5));
    }

    return normalizeToPracticePackage(payload, { scoreId });
  },

  /** 版本白名单（供 UI 在拉取前提示） */
  supportedSchemaVersions: SUPPORTED_SCHEMA_VERSIONS,
};

export default api;
