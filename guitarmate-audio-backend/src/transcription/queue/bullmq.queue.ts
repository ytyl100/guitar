import { Logger } from '@nestjs/common';
import type { QueueAdapter, QueueJob, StageHandler } from './queue.types';
import { optionalRequire } from './queue.types';
import type { StageJobPayload } from '../transcription.types';

/**
 * BullMQ 队列适配器（Redis 可用时的生产实现）
 * ==========================================
 *
 * 分阶段派发：一个转录项目会依次投递 `separate → transcribe → convert` 三个阶段任务，
 * 每个阶段各自独立重试、独立耗时统计，互不拖累。
 *
 * 关键点：
 * - `bullmq` / `ioredis` 是**可选依赖**（`optionalRequire` 运行时加载），未安装时返回 null，
 *   由 `TranscribeQueueService` 自动降级为进程内队列；
 * - Worker 用 `queueName` 统一命名，多个后端进程可共享同一 Redis 横向扩容；
 * - 连接探测失败（Redis 未启动 / 端口不通）也返回 null，不会让进程启动失败。
 */
export class BullQueueAdapter implements QueueAdapter {
  readonly driver = 'bullmq' as const;
  private readonly logger = new Logger(BullQueueAdapter.name);

  private constructor(
    private readonly queueName: string,
    private readonly queue: any,
    private readonly worker: any,
    private readonly queues: Map<string, any>,
    private readonly connection: any,
  ) {}

  /**
   * 尝试建立 BullMQ 队列 / Worker。任一前置条件不满足（依赖缺失、Redis 连不上）返回 null。
   */
  static async create(
    queueName: string,
    handlers: Map<string, StageHandler>,
    redisUrl: string,
    options: { concurrency: number; attempts: number },
  ): Promise<BullQueueAdapter | null> {
    const logger = new Logger(BullQueueAdapter.name);
    const bullmq = optionalRequire<any>('bullmq');
    if (!bullmq?.Queue || !bullmq?.Worker) {
      logger.log('未安装 bullmq，跳过 Redis 队列（将使用进程内队列）。如需启用：npm i bullmq ioredis');
      return null;
    }

    const connection = parseRedisUrl(redisUrl);

    // ── 连接探测：Redis 不可用时干净退出，避免 BullMQ 无限重连刷日志 ──
    let probe: any;
    try {
      probe = new bullmq.Queue(queueName, { connection });
      await withTimeout(probe.waitUntilReady(), 4000);
    } catch (err: any) {
      try {
        await probe?.close?.();
      } catch {
        /* ignore */
      }
      logger.warn(
        `Redis 不可用（${redisUrl}）：${err?.message || err}。已降级为进程内队列。` +
          ` 如需启用 BullMQ，请启动 Redis 或设置 REDIS_URL。`,
      );
      return null;
    }
    try {
      await probe.close();
    } catch {
      /* ignore */
    }

    // ── 每个阶段一个队列，便于在 BullMQ Board / Redis 里按阶段观测 ──
    const queues = new Map<string, any>();
    const ensureQueue = (name: string) => {
      if (!queues.has(name)) queues.set(name, new bullmq.Queue(name, { connection }));
      return queues.get(name)!;
    };

    const worker = new bullmq.Worker(
      queueName,
      async (job: any) => {
        const handler = handlers.get(job.name);
        if (!handler) {
          throw new Error(
            `阶段「${job.name}」没有注册处理器（TranscribeService 可能未初始化完成）。`,
          );
        }
        const payload = job.data as StageJobPayload;
        const queueJob: QueueJob<StageJobPayload> = {
          id: String(job.id),
          name: job.name,
          data: payload,
          attemptsMade: Number(job.attemptsMade || 0),
        };
        await handler(payload, queueJob);
      },
      { connection, concurrency: Math.max(1, options.concurrency) },
    );

    worker.on('failed', (job: any, err: Error) => {
      logger.error(`[bullmq] ${job?.name} 任务 ${job?.id} 失败：${err?.message || err}`);
    });
    worker.on('error', (err: Error) => {
      logger.warn(`[bullmq] worker 错误：${err?.message || err}`);
    });

    logger.log(`BullMQ 已启用：queue=${queueName} redis=${redisUrl} concurrency=${options.concurrency}`);
    return new BullQueueAdapter(queueName, ensureQueue(queueName), worker, queues, connection);
  }

  register(_name: string, _handler: StageHandler): void {
    // handler 通过共享 Map 动态查找，无需在此重复登记
  }

  async enqueue(
    name: string,
    payload: StageJobPayload,
    opts?: { attempts?: number; jobId?: string },
  ): Promise<string> {
    const job = await this.queue.add(name, payload, {
      jobId: opts?.jobId,
      attempts: Math.max(1, opts?.attempts ?? 2),
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
    return String(job.id);
  }

  async counts() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }

  async close(): Promise<void> {
    try {
      await this.worker?.close?.();
    } catch {
      /* ignore */
    }
    for (const q of this.queues.values()) {
      try {
        await q.close?.();
      } catch {
        /* ignore */
      }
    }
    try {
      await this.connection?.quit?.();
    } catch {
      /* ignore */
    }
  }

  describe() {
    return { queueName: this.queueName, handlers: [], pending: 0 };
  }
}

/** `redis://user:pass@host:port/db` → BullMQ connection 选项 */
export function parseRedisUrl(redisUrl: string): any {
  try {
    const url = new URL(redisUrl);
    const db = url.pathname?.replace(/^\//, '');
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      db: db ? Number(db) : 0,
      // Worker 阻塞式读取要求该值为 null，否则 BullMQ 会警告并在空闲时反复断连
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`操作超时（>${ms}ms）`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
