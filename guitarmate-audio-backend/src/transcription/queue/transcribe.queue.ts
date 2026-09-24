import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BullQueueAdapter } from './bullmq.queue';
import { InProcessQueueAdapter } from './in-process.queue';
import type { QueueAdapter, StageHandler } from './queue.types';
import type { QueueCounts, StageJobPayload, TranscribeStage } from '../transcription.types';
import { STAGE_TO_PROJECT_STATUS } from '../transcription.types';

/**
 * 转录任务队列（BullMQ 优先，Redis 缺失时自动降级）
 * ================================================
 *
 * 为什么用「队列 + 阶段」而不是一把梭的函数调用？
 * ----
 * Demucs 分离一首 4 分钟的歌在中端机器上要 1-3 分钟，Basic Pitch 转录也要几十秒。
 * 如果直接在 HTTP 请求里同步跑，必然超时。所以：
 *
 * ```
 * POST /projects/:id/start  →  立刻返回 202 + projectId（前端轮询进度）
 *        ↓ enqueue('separate')
 *        ↓ enqueue('transcribe')  ← 分离完成后再投递，形成阶段链
 *        ↓ enqueue('convert')
 * ```
 *
 * 降级策略（保证开发机 / 无 Redis 环境下链路依然可用）：
 * - 设置了 `REDIS_URL` 且 Redis 可连通 → BullMQ（多进程、可观测、重启不丢任务）
 * - 未设置 / 连接失败 / 未安装 bullmq → 进程内 FIFO 队列（功能等价，重启丢队列）
 *
 * 环境变量：
 * | 变量 | 默认值 | 说明 |
 * |---|---|---|
 * | `REDIS_URL` | `redis://127.0.0.1:6379`（仅当 `QUEUE_DRIVER=bullmq`） | Redis 连接串 |
 * | `QUEUE_DRIVER` | 自动 | 显式指定 `bullmq` / `in-process` |
 * | `TRANSCRIBE_QUEUE_NAME` | `transcription` | 队列名 |
 * | `TRANSCRIBE_CONCURRENCY` | `1` | Worker 并发（Demucs 吃满 CPU，默认 1） |
 * | `TRANSCRIBE_JOB_ATTEMPTS` | `2` | 单阶段最大尝试次数 |
 */
@Injectable()
export class TranscribeQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(TranscribeQueueService.name);

  readonly queueName = (process.env.TRANSCRIBE_QUEUE_NAME || 'transcription').trim();
  private readonly redisUrl = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
  private readonly driverPreference = (process.env.QUEUE_DRIVER || 'auto').trim().toLowerCase();
  private readonly concurrency = Math.max(1, Number(process.env.TRANSCRIBE_CONCURRENCY) || 1);
  private readonly attempts = Math.max(1, Number(process.env.TRANSCRIBE_JOB_ATTEMPTS) || 2);

  /** 阶段名 → 处理器（与适配器共享引用，BullMQ 的 Processor 会动态查找） */
  private readonly handlers = new Map<string, StageHandler>();

  private adapter: QueueAdapter | null = null;
  private startPromise: Promise<QueueAdapter> | null = null;

  /** 由 TranscribeService 在启动时调用，注册每个阶段的执行体 */
  register(stage: TranscribeStage, handler: StageHandler): void {
    this.handlers.set(stage, handler);
    this.logger.log(`已注册阶段处理器：${stage}`);
    // handler 集合变化后确保队列已就绪（进程内适配器需要它来排空启动期积压）
    void this.start().catch(() => undefined);
  }

  /** 投递一个阶段任务，返回队列任务 ID（会写入 TranscribeJob.jobId） */
  async enqueue(
    stage: TranscribeStage,
    payload: StageJobPayload,
    opts?: { jobId?: string },
  ): Promise<{ jobId: string; driver: QueueAdapter['driver'] }> {
    const adapter = await this.start();
    const jobId = await adapter.enqueue(stage, { ...payload, stage }, {
      attempts: this.attempts,
      jobId: opts?.jobId,
    });
    this.logger.log(
      `[${adapter.driver}] 入队阶段 ${stage}（project=${payload.projectId}${
        payload.instrument ? `, instrument=${payload.instrument}` : ''
      }）→ job ${jobId}，目标状态 ${STAGE_TO_PROJECT_STATUS[stage]}`,
    );
    return { jobId, driver: adapter.driver };
  }

  /** 队列统计（CMS 顶栏 / 运维排查用） */
  async counts(): Promise<QueueCounts> {
    const adapter = await this.start();
    const counts = await adapter.counts();
    return { ...counts, driver: adapter.driver, queueName: this.queueName };
  }

  async describe() {
    const adapter = await this.start();
    return {
      driver: adapter.driver,
      queueName: this.queueName,
      concurrency: this.concurrency,
      attempts: this.attempts,
      redisUrl: adapter.driver === 'bullmq' ? this.redisUrl : null,
      registeredStages: [...this.handlers.keys()],
    };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.adapter?.close();
    } catch (err: any) {
      this.logger.warn(`关闭队列失败：${err?.message || err}`);
    }
  }

  /** 幂等启动：并发调用只会真正初始化一次 */
  private start(): Promise<QueueAdapter> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.createAdapter();
    return this.startPromise;
  }

  private async createAdapter(): Promise<QueueAdapter> {
    const wantBull = this.driverPreference !== 'in-process';

    if (wantBull) {
      try {
        const bull = await BullQueueAdapter.create(
          this.queueName,
          this.handlers,
          this.redisUrl,
          { concurrency: this.concurrency, attempts: this.attempts },
        );
        if (bull) {
          this.adapter = bull;
          return bull;
        }
      } catch (err: any) {
        this.logger.warn(`BullMQ 初始化失败，降级为进程内队列：${err?.message || err}`);
      }
    }

    const inProcess = new InProcessQueueAdapter(this.queueName);
    // 把已注册的 handler 同步过去（进程内适配器需要它们来排空队列）
    for (const [stage, handler] of this.handlers) {
      inProcess.register(stage, handler);
    }
    this.adapter = inProcess;
    this.logger.warn(
      `转录任务队列已降级为「进程内 FIFO」（queue=${this.queueName}）。` +
        `生产环境请配置 REDIS_URL 并安装 bullmq/ioredis 以获得持久化与多进程能力。`,
    );
    return inProcess;
  }
}
