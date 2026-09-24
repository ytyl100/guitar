import { createRequire } from 'module';
import { join } from 'path';
import type { StageJobPayload } from '../transcription.types';

/** 队列里的一条任务（BullMQ Job 与进程内任务的公共子集） */
export interface QueueJob<T = any> {
  id: string;
  /** = 阶段名（TranscribeStage） */
  name: string;
  data: T;
  attemptsMade: number;
}

/** 阶段处理器：由 TranscribeService 注册，负责调用对应的 Python worker */
export type StageHandler = (
  payload: StageJobPayload,
  job: QueueJob<StageJobPayload>,
) => Promise<void>;

/** 队列后端的统一接口（BullMQ / 进程内实现均遵循） */
export interface QueueAdapter {
  readonly driver: 'bullmq' | 'in-process';
  register(name: string, handler: StageHandler): void;
  enqueue(
    name: string,
    payload: StageJobPayload,
    opts?: { attempts?: number; jobId?: string },
  ): Promise<string>;
  counts(): Promise<{ waiting: number; active: number; completed: number; failed: number }>;
  close(): Promise<void>;
}

/**
 * 可选依赖加载器
 * ==============
 *
 * BullMQ / ioredis 未安装时必须**不影响** tsc 类型检查与 nest build，
 * 所以这里不能用 `import ... from 'bullmq'`（没有类型声明会直接编译失败），
 * 改用 Node 原生 `createRequire` 做运行时可选加载。
 */
export function optionalRequire<T = any>(id: string): T | null {
  try {
    return requireFromProjectRoot()(id) as T;
  } catch {
    return null;
  }
}

let cachedRequire: NodeRequire | null = null;

/** 以「后端进程工作目录」为基准解析可选依赖，避免打包后相对路径错位 */
function requireFromProjectRoot(): NodeRequire {
  if (cachedRequire) return cachedRequire;
  cachedRequire = createRequire(join(process.cwd(), 'package.json'));
  return cachedRequire;
}
