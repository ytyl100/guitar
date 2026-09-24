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

export const api = {
  /** 已发布曲目列表 (小程序曲库) */
  getPublishedScores: () => request<PublishedScore[]>('/api/published/scores'),

  /** 指定曲目的全部练习小节 (含反序列化后的 notes) */
  getMeasuresByScore: (scoreId: string) =>
    request<Measure[]>(`/api/published/scores/${scoreId}/measures`),

  /**
   * 获取 PracticePackage —— 小程序端唯一数据契约
   * ==========================================
   *
   * 流程：
   * 1. 优先请求 `/api/published/scores/:id/package`（带 schemaVersion 的完整包）
   * 2. 若后端尚未升级（404），自动回退到旧的 `/measures` 数组接口，
   *    并用 `normalizeToPracticePackage()` 包装成同一结构
   * 3. 版本白名单 + 必需字段校验；校验失败时**降级**：保留可渲染的小节并回报问题，
   *    只有「致命错误」才抛 `PracticePackageError`（供 UI 提示用户升级小程序）
   *
   * 关键：调用方拿到的永远是同一套结构，渲染层只写一遍。
   */
  fetchPracticePackage: async (scoreId: string): Promise<PracticePackage> => {
    let payload: unknown;
    try {
      payload = await request<unknown>(`/api/published/scores/${scoreId}/package`);
    } catch (err) {
      // 后端未提供 /package（旧版本）→ 回退到 /measures
      const fallback = await request<Measure[]>(`/api/published/scores/${scoreId}/measures`);
      payload = fallback;
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
