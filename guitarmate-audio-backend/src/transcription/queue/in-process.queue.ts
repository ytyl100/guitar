import { Logger } from '@nestjs/common';
import type { QueueJob, StageHandler, QueueAdapter } from './queue.types';
import type { StageJobPayload } from '../transcription.types';

interface PendingJob {
  id: string;
  name: string;
  payload: StageJobPayload;
  attempts: number;
  maxAttempts: number;
  attemptsMade: number;
}

/**
 * 进程内 FIFO 队列（Redis / BullMQ 不可用时的降级实现）
 * ==================================================
 *
 * 为什么需要它？
 * ----
 * BullMQ 是**可选依赖**。开发机 / 单机部署往往没有 Redis，如果强依赖它，
 * `nest build` 会因找不到模块而失败，`node dist/main.js` 也会在启动时报错，
 * 直接破坏「不改动现有结构、保证兼容」的前提。
 *
 * 因此这里提供一个语义等价的最小实现：
 * - 与 BullMQ 相同的接口（`register` / `enqueue` / `counts` / `close`）；
 * - 串行执行（concurrency = 1）—— 与 Demucs 这类吃满 CPU 的任务的合理并发一致；
 * - 支持 `attempts` 重试与指数退避；
 * - **启动期缓冲**：Worker 在 `register()` 之前到达的任务会先排队，等 handler 注册后再跑，
 *   避免 NestJS provider 初始化顺序导致的「任务丢失」。
 *
 * ⚠️ 局限（已在 README 中说明）：进程重启会丢失排队中的任务，
 * 也没有跨进程 / 跨机器的可见性。生产环境请配置 `REDIS_URL` 以启用 BullMQ。
 */
export class InProcessQueueAdapter implements QueueAdapter {
  readonly driver = 'in-process' as const;
  private readonly logger = new Logger(InProcessQueueAdapter.name);

  private handlers = new Map<string, StageHandler>();
  private pending: PendingJob[] = [];
  private running = false;
  private closed = false;
  private seq = 0;

  private readonly counters = { waiting: 0, active: 0, completed: 0, failed: 0 };

  constructor(private readonly queueName: string) {}

  register(name: string, handler: StageHandler): void {
    this.handlers.set(name, handler);
    // handler 到位后立刻排空启动期积压的任务
    this.pump();
  }

  async enqueue(
    name: string,
    payload: StageJobPayload,
    opts?: { attempts?: number; jobId?: string },
  ): Promise<string> {
    const id = opts?.jobId || `${name}-${Date.now()}-${++this.seq}`;
    this.pending.push({
      id,
      name,
      payload,
      attempts: Math.max(1, opts?.attempts ?? 2),
      maxAttempts: Math.max(1, opts?.attempts ?? 2),
      attemptsMade: 0,
    });
    this.counters.waiting += 1;
    this.pump();
    return id;
  }

  async counts() {
    return { ...this.counters };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.pending = [];
    this.counters.waiting = 0;
  }

  /** 串行泵：一次只跑一个任务，跑完继续下一个 */
  private pump(): void {
    if (this.running || this.closed) return;
    const job = this.pending.shift();
    if (!job) return;

    const handler = this.handlers.get(job.name);
    if (!handler) {
      // handler 尚未注册 → 放回队首，等 register() 再次触发
      this.pending.unshift(job);
      return;
    }

    this.running = true;
    this.counters.waiting = Math.max(0, this.counters.waiting - 1);
    this.counters.active += 1;

    const queueJob: QueueJob<StageJobPayload> = {
      id: job.id,
      name: job.name,
      data: job.payload,
      attemptsMade: job.attemptsMade,
    };

    Promise.resolve()
      .then(() => handler(job.payload, queueJob))
      .then(() => {
        this.counters.completed += 1;
        this.logger.log(`[in-process] 阶段 ${job.name} 完成（${job.id}）`);
      })
      .catch((err: any) => {
        job.attemptsMade += 1;
        if (job.attemptsMade < job.maxAttempts) {
          const delayMs = Math.min(30_000, 2 ** job.attemptsMade * 1000);
          this.logger.warn(
            `[in-process] 阶段 ${job.name} 失败（第 ${job.attemptsMade}/${job.maxAttempts} 次）：${err?.message || err}；${delayMs}ms 后重试`,
          );
          this.pending.push(job);
          this.counters.waiting += 1;
          setTimeout(() => this.pump(), delayMs);
        } else {
          this.counters.failed += 1;
          this.logger.error(
            `[in-process] 阶段 ${job.name} 最终失败（${job.id}）：${err?.message || err}`,
          );
        }
      })
      .finally(() => {
        this.counters.active = Math.max(0, this.counters.active - 1);
        this.running = false;
        // 让出事件循环，避免长时间阻塞 HTTP 请求处理
        setImmediate(() => this.pump());
      });
  }

  /** 仅用于诊断：是否有 handler 缺失（会表现为任务一直等待） */
  describe(): { queueName: string; handlers: string[]; pending: number } {
    return {
      queueName: this.queueName,
      handlers: [...this.handlers.keys()],
      pending: this.pending.length,
    };
  }
}
