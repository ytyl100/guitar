import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PythonRunnerService } from './python-runner.service';
import { NodeTranscriberService } from './node-transcriber.service';
import { TranscriptionSimulationService } from './simulation.service';
import { deriveLeftHandFingering } from '../tab-import/fingering';
import { deriveChords } from '../tab-import/chord-detect';
import { TranscribeQueueService } from './queue/transcribe.queue';
import type { QueueJob } from './queue/queue.types';
import {
  LOW_CONFIDENCE_THRESHOLD,
  PIPELINE_STAGES,
  PROJECT_STATUS_LABELS,
  STAGE_PROGRESS,
  STAGE_TO_PROJECT_STATUS,
  TABBED_INSTRUMENTS,
  defaultTuningFor,
  round4,
  toProjectStatus,
  type MidiToTabWorkerResult,
  type ProjectStatus,
  type SeparateWorkerResult,
  type StageJobPayload,
  type StemInstrument,
  type TranscribeWorkerResult,
  type TranscribedNote,
  type TranscriptionOverrides,
} from './transcription.types';
import { UploadService } from './upload.service';

/**
 * TranscribeService —— 转录流水线编排器
 * =====================================
 *
 * 三阶段（每一阶段都是独立的队列任务，可单独重试）：
 *
 * ```
 *  separate    workers/separate.py    Demucs htdemucs_6s → stems/*.wav
 *      ↓
 *  transcribe  workers/transcribe.py  Basic Pitch          → midi/*.mid + notes[]
 *      ↓
 *  convert     workers/midi_to_tab.py Tayuya               → tab/<instrument>.json (TabProject)
 * ```
 *
 * 设计要点：
 * 1. **阶段链**：每个阶段成功后由本服务把下一个阶段投递进队列，而不是串成一个长任务 ——
 *    这样某一阶段失败时可以单独重试，且进度可观测；
 * 2. **每阶段留痕**：写入 `TranscribeJob`（状态/耗时/入参出参摘要/错误），CMS 可直接展示时间线；
 * 3. **依赖缺失自动降级**：Python / Demucs / Basic Pitch / Tayuya 任一缺失时，
 *    走 `TranscriptionSimulationService`（ffmpeg + 纯 Node），保证链路可端到端验证；
 * 4. **只编排，不碰既有 Score/Track/Measure**：产物落在 Project / TranscribeTrack 上，
 *    何时回流到发布链路由 `PublishService` 决定（默认不写，避免污染现有数据）。
 */
@Injectable()
export class TranscribeService implements OnModuleInit {
  private readonly logger = new Logger(TranscribeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TranscribeQueueService,
    private readonly python: PythonRunnerService,
    private readonly upload: UploadService,
    private readonly simulation: TranscriptionSimulationService,
    private readonly nodeTranscriber: NodeTranscriberService,
  ) {}

  onModuleInit(): void {
    // 注册 4 个阶段处理器；队列在首次入队时才真正初始化（Redis 探测是异步的）
    this.queue.register('download', (payload, job) => this.handleDownload(payload, job));
    this.queue.register('separate', (payload, job) => this.handleSeparate(payload, job));
    this.queue.register('transcribe', (payload, job) => this.handleTranscribe(payload, job));
    this.queue.register('convert', (payload, job) => this.handleConvert(payload, job));
    this.logger.log(`转录流水线已注册阶段：${PIPELINE_STAGES.join(' → ')}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 项目管理
  // ═══════════════════════════════════════════════════════════

  /** 创建项目（upload 或 url 两种来源） */
  async createProject(input: {
    title?: string;
    artist?: string;
    sourceType: 'upload' | 'url';
    /** upload: 文件名 + base64；url: 链接 */
    fileName?: string;
    base64?: string;
    url?: string;
    /**
     * URL 项目的下载执行方：
     * - `server`（默认）：服务器跑 yt-dlp（适合海外/能直连 YouTube 的部署）；
     * - `client`：服务器不下载，等项目状态变成 `awaiting_audio` 后由**本机下载代理**回传音频
     *   （国内或服务器访问不了 YouTube 时用）。
     */
    downloadDriver?: 'server' | 'client';
    bpm?: number;
    timeSignature?: string;
    capo?: number;
    tuning?: number[];
    license?: string;
  }) {
    const sourceType = input.sourceType === 'url' ? 'url' : 'upload';
    /**
     * 下载执行方优先级：请求参数 > `YTDLP_DRIVER` 环境变量 > server。
     * 这样「国内部署」只需在 .env 里写 `YTDLP_DRIVER=client`，不用改任何调用方。
     */
    const envDriver = (process.env.YTDLP_DRIVER || '').trim().toLowerCase();
    const requestedDriver = input.downloadDriver || (envDriver === 'client' ? 'client' : 'server');
    const downloadDriver =
      sourceType === 'url' ? (requestedDriver === 'client' ? 'client' : 'server') : null;
    if (sourceType === 'url' && !(input.url || '').trim()) {
      throw new BadRequestException('sourceType=url 时必须提供 `url`。');
    }
    if (sourceType === 'upload' && !(input.base64 || '').trim()) {
      throw new BadRequestException('sourceType=upload 时必须提供 `base64` 与 `fileName`。');
    }

    // 先建行拿到 id，再用 id 作为存储目录（避免并发上传互相覆盖）
    const project = await this.prisma.project.create({
      data: {
        title: (input.title || input.fileName || '未命名转录项目').slice(0, 200),
        artist: input.artist || null,
        status: sourceType === 'url' ? 'pending' : 'pending',
        sourceType,
        sourceRef: sourceType === 'url' ? input.url!.trim() : input.fileName || null,
        downloadDriver,
        /**
         * 留空而不是写死 100 —— `Project.bpm` 是「人工可覆写」的节奏基准：
         * null 表示还没人指定，发布时回退到转录产物（Basic Pitch / 模拟器）给出的 BPM。
         */
        bpm: Number(input.bpm) > 0 ? Number(input.bpm) : null,
        timeSignature: input.timeSignature || '4/4',
        capo: Number(input.capo) || 0,
        tuning: JSON.stringify(input.tuning?.length ? input.tuning : defaultTuningFor('guitar')),
        license: input.license || 'user_uploaded',
        stageNote:
          sourceType === 'url'
            ? downloadDriver === 'client'
              ? '已创建项目，等待**本机下载代理**回传音频（npm run agent）'
              : '已创建项目，等待 URL 下载（yt-dlp）'
            : '已创建项目，等待音频写入',
      },
    });

    try {
      if (sourceType === 'upload') {
        const stored = await this.upload.saveUpload({
          projectId: project.id,
          fileName: input.fileName!,
          base64: input.base64,
        });
        const probe = await this.upload.probeAudio(stored.absolutePath);
        return await this.prisma.project.update({
          where: { id: project.id },
          data: {
            audioPath: stored.absolutePath,
            originalName: stored.fileName,
            durationSec: probe.durationSec ?? null,
            sampleRate: probe.sampleRate ?? null,
            channels: probe.channels ?? null,
            format: stored.ext.replace('.', ''),
            stageNote: `音频已就绪（${(stored.sizeBytes / 1024 / 1024).toFixed(1)}MB，时长 ${
              probe.durationSec ? `${probe.durationSec.toFixed(1)}s` : '未知'
            }）`,
          },
        });
      }
      return project;
    } catch (err) {
      // 落盘/校验失败 → 清理刚创建的空项目，避免留下脏数据
      await this.prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      throw err;
    }
  }

  /** 启动流水线（幂等：重复调用只会重新投递第一个阶段） */
  async startProject(projectId: string, overrides?: TranscriptionOverrides) {
    const project = await this.getProjectRow(projectId);
    const caps = await this.python.probe();

    const needsDownload = project.sourceType === 'url' && !project.audioPath;
    if (!needsDownload && !project.audioPath) {
      throw new BadRequestException(
        '项目还没有可用音频：请重新上传（POST /api/transcription/projects/upload）或补充 URL。',
      );
    }

    await this.applyOverrides(projectId, overrides);

    /**
     * `downloadDriver='client'`：服务器**不**下载 —— 直接把项目停在「等待本机代理回传音频」。
     * 这样国内部署 / 服务器访问不了 YouTube 时，主通路依然可用（本机取音频 → 上传 → 服务器跑重活）。
     */
    if (needsDownload && project.downloadDriver === 'client') {
      await this.parkAwaitingAudio(projectId);
      return {
        success: true,
        projectId,
        stage: 'awaiting_audio' as const,
        driver: 'client',
        hint: '请在**本机**运行 npm run agent（脚本会取音频并回传）',
      };
    }

    if (!caps.simulate && needsDownload && !caps.ytDlp.available) {
      throw new BadRequestException(
        `需要先下载音频，但 yt-dlp 不可用且已禁用模拟模式：${caps.ytDlp.reason}`,
      );
    }

    const firstStage = needsDownload ? 'download' : 'separate';
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: STAGE_TO_PROJECT_STATUS[firstStage],
        progress: Math.max(1, STAGE_PROGRESS[firstStage] - 2),
        error: null,
        stageNote: `已入队阶段「${firstStage}」`,
      },
    });

    const enqueued = await this.enqueueStage(projectId, firstStage, undefined, overrides);
    return {
      success: true,
      projectId,
      stage: firstStage,
      ...enqueued,
      simulate: caps.simulate && (!caps.demucs.available || !caps.basicPitch.available),
      capabilities: caps,
    };
  }

  /**
   * 重试：把项目从 failed 拉回，并从「第一个未完成的阶段」重新开始。
   *
   * `from` 可显式指定起点阶段 —— 用途：**用新版识别算法重新转录已有项目**
   * （否则已 transcribed 的项目只会从 convert 开始，拿不到新的音符）。
   */
  async retryProject(projectId: string, from?: StageJobPayload['stage']) {
    const project = await this.getProjectRow(projectId);
    const tracks = await this.prisma.transcribeTrack.findMany({ where: { projectId } });

    let stage: StageJobPayload['stage'] = 'separate';
    if (from) {
      stage = from;
    } else if (!project.audioPath) {
      stage = 'download';
    } else if (tracks.some((t) => t.status === 'transcribed')) {
      stage = 'convert';
    } else if (tracks.some((t) => t.status === 'separated')) {
      stage = 'transcribe';
    }

    /**
     * 显式重跑 transcribe 时，必须把分轨状态退回 `separated` ——
     * 否则 `handleTranscribe` 看到的仍是旧的 transcribed 状态与旧音符。
     */
    if (from === 'transcribe' || from === 'separate' || from === 'download') {
      await this.prisma.transcribeTrack.updateMany({
        where: { projectId },
        data: { status: 'pending', meta: null, error: null },
      });
    }

    /**
     * ⚠️ **`transcribe` / `convert` 是「按分轨」的阶段：一次任务只能处理一条轨**
     * （`handleTranscribe` 从 `payload.instrument` 取轨，**缺省值是 `guitar`**；处理完
     * 该轨后自己再 enqueue 自己的 `convert`）。所以重试这两个阶段**必须按分轨扇出**。
     *
     * 早期实现只 enqueue 一个**不带 instrument** 的任务：
     *   separate      → N 条 transcribe（每条自链自己的 convert）✓
     *   retry transcribe → 1 条 transcribe（被默认成 guitar）✗
     * 结果：只有 guitar 跑完，bass/other/piano 永远停在 `pending` → `remaining` 永远 > 0
     * → 项目卡死在 `converting` 75%，且**日志里没有任何报错**
     * （实测 Macaroon 5：10:56 卡到 11:15，无 Python 进程、无输出）。
     */
    const fanout: StemInstrument[] =
      stage === 'transcribe'
        ? tracks
            .filter((t) => !!t.stemPath && existsSync(t.stemPath))
            .map((t) => t.instrument as StemInstrument)
        : stage === 'convert'
          ? tracks
              .filter((t) => !!t.midiPath && existsSync(t.midiPath))
              .map((t) => t.instrument as StemInstrument)
          : [];

    if (fanout.length > 0) {
      let first: { jobId: string; driver: string } | null = null;
      for (const instrument of fanout) {
        const enqueued = await this.enqueueStage(projectId, stage, instrument);
        if (!first) first = enqueued;
      }
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: STAGE_TO_PROJECT_STATUS[stage],
          error: null,
          stageNote: `手动重试「${stage}」：已按分轨派发 ${fanout.length} 条任务（${fanout.join(' / ')}）`,
        },
      });
      return {
        success: true,
        projectId,
        stage,
        ...(first as { jobId: string; driver: string }),
        jobs: fanout.length,
        instruments: fanout,
      };
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        /**
         * ⚠️ 这里**不要**再用 `'failed'` 当"准备中"标记：
         * ① 界面上会闪一下「失败」，用户以为重试把项目弄坏了；
         * ② 自动化/轮询把它当**终态**（`failed` 的语义就是结束），
         *    会在流水线还没跑完时就去做清理/断言 —— 实测就是这个坑。
         * 直接写该阶段的**目标状态**（与 `enqueueStage` 的语义一致）。
         */
        status: STAGE_TO_PROJECT_STATUS[stage],
        error: null,
        stageNote: `手动重试，从「${stage}」阶段恢复`,
      },
    });
    const enqueued = await this.enqueueStage(projectId, stage);
    return { success: true, projectId, stage, ...enqueued };
  }

  /**
   * 把项目挂到「等待本机下载代理回传音频」（幂等）。
   *
   * 为什么不报错：`downloadDriver='client'` 时服务器本来就不该下载 ——
   * 这是设计上的正常中间状态，而不是失败。
   */
  private async parkAwaitingAudio(projectId: string, jobRowId?: string) {
    if (jobRowId) {
      await this.completeStage(jobRowId, {
        awaitingAudio: true,
        driver: 'client',
        hint: '等待本机下载代理上传音频（npm run agent）',
      });
    }
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'awaiting_audio',
        progress: 5,
        error: null,
        stageNote: '等待本机下载代理回传音频 —— 请在本机运行 npm run agent',
      },
    });
  }

  /**
   * 本机下载代理回传音频（方案 A 的主通路）
   * =====================================
   *
   * 流程：代理在本机用 yt-dlp 取音频（那里有受信任的浏览器会话 + 住宅 IP）→
   * base64 回传到本接口 → 服务器落盘并**从 separate 阶段继续**原有流水线。
   *
   * 与 `/projects/upload` 的区别：那个是「新建 + 上传」，这个是把音频**接到已有 URL 项目**上，
   * 因此 URL / 标题 / 版权等元信息都保留。
   */
  async attachAudio(
    projectId: string,
    input: { base64: string; fileName?: string; title?: string; durationSec?: number },
  ) {
    const project = await this.getProjectRow(projectId);
    if (project.audioPath && existsSync(project.audioPath)) {
      throw new BadRequestException('该项目已经有音频了；如需替换请先删除或新建项目。');
    }
    if (!(input.base64 || '').trim()) {
      throw new BadRequestException('缺少 base64 音频内容（字段名 `base64`）。');
    }

    const stored = await this.upload.saveUpload({
      projectId,
      fileName: input.fileName || 'agent-audio.mp3',
      base64: input.base64,
    });
    const probe = await this.upload.probeAudio(stored.absolutePath);

    /**
     * ⚠️ **先验证、再落库**。
     *
     * `saveUpload()` 只按扩展名写文件（文件头不一致仅 warn），所以早期实现
     * 会把一段乱码 base64 直接写进 `Project.audioPath` 并推进流水线 —— 项目被污染成
     * `separating`，要等 separate / transcribe 才爆，错误离现场很远（而且此时音频
     * 已经被“认下”了，再回传真音频会被 400 拒绝）。
     *
     * 因此这里做两道闸：文件头（魔数）+ ffmpeg 能否读出时长；任一不过 → 删掉文件、400 返回。
     */
    const rejectAndDiscard = (message: string) => {
      try {
        rmSync(stored.absolutePath, { force: true });
      } catch {
        /* 删不掉也不影响拒绝结果 */
      }
      throw new BadRequestException(message);
    };
    if (!stored.magicVerified) {
      this.logger.warn(`代理回传内容非可识别音频（magic 校验失败）：${stored.ext}`);
      rejectAndDiscard(
        `回传内容不是可识别的音频（${stored.ext} 文件头校验失败）。` +
          '请确认本机代理上传的是 yt-dlp 取到的音频（推荐 mp3），而不是 HTML 错误页或空内容。',
      );
    }
    if (!probe.durationSec && !(Number(input.durationSec) > 0)) {
      rejectAndDiscard(
        '回传的音频无法解码（ffmpeg 读不到时长）。文件可能已损坏或不完整 —— 请在本机重新取一次音频后回传。',
      );
    }

    // 代理拿得到视频标题时，用它给「未命名转录项目」命名（与服务器下载的行为一致）
    const nextTitle =
      input.title && isPlaceholderTitle(project.title, project.sourceRef)
        ? input.title.slice(0, 120)
        : undefined;

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        title: nextTitle,
        audioPath: stored.absolutePath,
        originalName: input.title || project.originalName || stored.fileName,
        durationSec: probe.durationSec ?? input.durationSec ?? null,
        sampleRate: probe.sampleRate ?? null,
        channels: probe.channels ?? null,
        format: stored.ext.replace('.', ''),
        status: STAGE_TO_PROJECT_STATUS.separate,
        progress: Math.max(1, STAGE_PROGRESS.separate - 2),
        error: null,
        stageNote: `本机代理已回传音频（${(stored.sizeBytes / 1024 / 1024).toFixed(1)}MB，时长 ${
          probe.durationSec ? `${probe.durationSec.toFixed(1)}s` : '未知'
        }）→ 开始分离/转录`,
      },
    });

    const enqueued = await this.enqueueStage(projectId, 'separate');
    return {
      success: true,
      projectId,
      stored: {
        relativePath: stored.relativePath,
        url: stored.url,
        sizeBytes: stored.sizeBytes,
        ext: stored.ext,
        magicVerified: stored.magicVerified,
      },
      probe,
      ...enqueued,
    };
  }

  /**
   * 供本机下载代理轮询：列出「等着回传音频」的项目。
   * 同时带上 `failedDownload` 清单（服务器下载失败的项目）—— 代理可选用 `--rescue` 接管。
   */
  async listDownloadTasks() {
    const projects = await this.prisma.project.findMany({
      where: { sourceType: 'url' },
      orderBy: { createdAt: 'asc' },
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const awaiting = projects
      .filter((p) => p.status === 'awaiting_audio' && !p.audioPath)
      .map((p) => ({
        id: p.id,
        title: p.title,
        url: p.sourceRef,
        status: p.status,
        downloadDriver: p.downloadDriver || 'server',
        createdAt: p.createdAt,
      }));

    const failedDownload = projects
      .filter(
        (p) =>
          !p.audioPath &&
          p.status === 'failed' &&
          p.jobs[0]?.stage === 'download' &&
          p.jobs[0]?.status === 'failed',
      )
      .map((p) => ({
        id: p.id,
        title: p.title,
        url: p.sourceRef,
        status: p.status,
        lastError: p.jobs[0]?.error ? String(p.jobs[0].error).split('\n')[0] : null,
        createdAt: p.createdAt,
      }));

    return { awaitingAudio: awaiting, failedDownload };
  }

  async listProjects(limit = 50) {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
      include: {
        _count: { select: { tracks: true, jobs: true, practicePackages: true } },
      },
    });
    return projects.map((p) => this.decorateProject(p));
  }

  /** 项目详情（含阶段时间线与分轨），CMS 轮询用 */
  async getProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tracks: { orderBy: { instrument: 'asc' } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 50 },
        practicePackages: { orderBy: { revision: 'desc' }, take: 3 },
      },
    });
    if (!project) throw new NotFoundException(`转录项目 ${projectId} 不存在`);

    const latestPackage = project.practicePackages[0];
    return {
      ...this.decorateProject(project),
      tracks: project.tracks.map((t) => this.decorateTrack(t)),
      jobs: project.jobs.map((j) => ({
        ...j,
        input: safeJson(j.input),
        output: safeJson(j.output),
      })),
      packageRevisions: project.practicePackages.map((p) => ({
        id: p.id,
        revision: p.revision,
        schemaVersion: p.schemaVersion,
        measureCount: p.measureCount,
        noteCount: p.noteCount,
        lowConfidenceCount: p.lowConfidenceCount,
        publishedBy: p.publishedBy,
        createdAt: p.createdAt,
      })),
      latestRevision: latestPackage?.revision ?? 0,
      /** 供前端渲染 ReviewPage 的扁平音符列表（按小节分组） */
      tabProject: safeJson(project.tabProject),
    };
  }

  /** 保存人工复核结果（BPM / 拍号 / 变调夹 / 调弦 / 甚至整体 TabProject 覆写） */
  async updateProject(
    projectId: string,
    patch: {
      bpm?: number;
      timeSignature?: string;
      capo?: number;
      tuning?: number[];
      license?: string;
      title?: string;
      artist?: string;
      /** 复核后的 TabProject（ReviewPage 逐音符编辑后整体回传） */
      tabProject?: any;
      status?: ProjectStatus;
    },
  ) {
    await this.getProjectRow(projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        bpm: Number(patch.bpm) > 0 ? Number(patch.bpm) : undefined,
        timeSignature: patch.timeSignature || undefined,
        capo: typeof patch.capo === 'number' ? patch.capo : undefined,
        tuning: patch.tuning?.length ? JSON.stringify(patch.tuning) : undefined,
        license: patch.license || undefined,
        title: patch.title || undefined,
        artist: patch.artist ?? undefined,
        tabProject: patch.tabProject ? JSON.stringify(patch.tabProject) : undefined,
        status: patch.status ? toProjectStatus(patch.status) : undefined,
        stageNote: patch.tabProject ? '人工复核已保存（TabProject 已更新）' : undefined,
      },
    });
  }

  async deleteProject(projectId: string) {
    const project = await this.getProjectRow(projectId);
    await this.prisma.project.delete({ where: { id: projectId } });

    /**
     * 连同 `uploads/transcriptions/<projectId>/` 一起删掉。
     *
     * ⚠️ 两个前提，否则会误删 C 端在用的音频：
     * ① 该项目的 PracticePackage / TranscribeTrack 都是 `onDelete: Cascade`，
     *    库里的引用已经随项目一起没了；
     * ② **镜像发布**的小节切片现在存在 `uploads/measures/<scoreId>/`（Score 维度），
     *    不在项目目录下 —— 所以删项目不会再让已发布曲目变成死链。
     * （早期只有项目维度的切片，删项目 = C 端 404，实测撞到过。）
     */
    const projectDir = join(process.cwd(), 'uploads', 'transcriptions', projectId);
    let filesRemoved = false;
    try {
      if (existsSync(projectDir)) {
        rmSync(projectDir, { recursive: true, force: true });
        filesRemoved = true;
      }
    } catch (err: any) {
      this.logger.warn(`删除项目目录失败（不影响数据库删除）：${err?.message || err}`);
    }

    return {
      success: true,
      projectId,
      mirroredScoreId: project.scoreId || null,
      filesRemoved,
      message:
        '项目及其任务/分轨/发布快照已删除（级联）' +
        (filesRemoved ? '，项目上传目录已清理' : '') +
        (project.scoreId ? `；镜像出的曲目 ${project.scoreId} 保留在 C 端（切片为 Score 维度）` : ''),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 阶段实现
  // ═══════════════════════════════════════════════════════════

  /** ① 下载：yt-dlp（或直链 HTTP）→ 写入 audioPath */
  private async handleDownload(payload: StageJobPayload, job: QueueJob<StageJobPayload>): Promise<void> {
    const { projectId } = payload;
    const project = await this.getProjectRow(projectId);
    const jobRowId = await this.beginStage(projectId, 'download', job.id, { url: project.sourceRef });

    /**
     * 下载交给本机代理时，服务器这一步只负责「挂起等待」，不能报错 ——
     * 否则重试 / 重复入队会把项目误标为 failed。
     */
    if (project.downloadDriver === 'client' && !project.audioPath) {
      await this.parkAwaitingAudio(projectId, jobRowId);
      return;
    }

    try {
      if (project.audioPath && existsSync(project.audioPath)) {
        await this.completeStage(jobRowId, { skipped: true, reason: 'audioPath 已存在' });
      } else {
        const caps = await this.python.probe();
        if (!caps.ytDlp.available && !caps.simulate) {
          throw new Error(caps.ytDlp.reason || 'yt-dlp 不可用');
        }
        const downloaded = await this.upload.downloadFromUrl({
          projectId,
          url: project.sourceRef || '',
        });
        const probe = await this.upload.probeAudio(downloaded.absolutePath);
        await this.prisma.project.update({
          where: { id: projectId },
          data: {
            // 用户没填名字时用**视频真实标题**命名（否则列表里全是「未命名转录项目」，无法分辨）
            title:
              isPlaceholderTitle(project.title, project.sourceRef) && downloaded.title
                ? String(downloaded.title).slice(0, 120)
                : undefined,
            audioPath: downloaded.absolutePath,
            originalName: downloaded.title || downloaded.fileName,
            durationSec: probe.durationSec ?? downloaded.durationSec ?? null,
            sampleRate: probe.sampleRate ?? null,
            channels: probe.channels ?? null,
            format: downloaded.ext.replace('.', ''),
            progress: STAGE_PROGRESS.download,
            stageNote: `下载完成（${downloaded.viaYtDlp ? 'yt-dlp' : '直链 HTTP'}）`,
          },
        });
        await this.completeStage(jobRowId, {
          viaYtDlp: downloaded.viaYtDlp,
          relativePath: downloaded.relativePath,
          sizeBytes: downloaded.sizeBytes,
          durationSec: probe.durationSec ?? null,
        });
      }
    } catch (err: any) {
      await this.failStage(jobRowId, err);
      throw err;
    }

    await this.enqueueStage(projectId, 'separate', undefined, payload.overrides);
  }

  /** ② 乐器分离：Demucs htdemucs_6s → stems/ */
  private async handleSeparate(payload: StageJobPayload, job: QueueJob<StageJobPayload>): Promise<void> {
    const { projectId } = payload;
    const project = await this.getProjectRow(projectId);
    const source = this.upload.resolveLocal(project.audioPath || '');
    const jobRowId = await this.beginStage(projectId, 'separate', job.id, { source });

    if (!source || !existsSync(source)) {
      const err = new Error(`源音频不存在：${project.audioPath || '(空)'}`);
      await this.failStage(jobRowId, err);
      throw err;
    }

    const caps = await this.python.probe();
    let stems: SeparateWorkerResult['stems'];
    let model: string;

    if (caps.demucs.available) {
      const outDir = this.upload.subDir(projectId, 'stems');
      const outcome = await this.python.runWorker<SeparateWorkerResult>('separate.py', [
        '--input',
        source,
        '--output',
        outDir,
        '--model',
        process.env.DEMUCS_MODEL || 'htdemucs_6s',
        '--stems',
        TABBED_INSTRUMENTS.join(','),
      ]);
      const result = outcome.result;
      if (!outcome.ok || !result?.ok) {
        const err = new Error(
          `Demucs 分离失败：${outcome.error || result?.message || 'worker 未返回结果'}`,
        );
        await this.failStage(jobRowId, err, outcome.durationMs);
        throw err;
      }
      stems = result.stems;
      model = result.model;
    } else {
      if (!caps.simulate) {
        const err = new Error(caps.demucs.reason || 'Demucs 不可用');
        await this.failStage(jobRowId, err);
        throw err;
      }
      const simulated = this.simulation.buildStems(source, project.durationSec || 0);
      stems = simulated.stems;
      model = simulated.model;
    }

    // 落库分轨（只登记要转录的乐器 + 其它 stem 的基本信息）
    for (const stem of stems) {
      const instrument = (stem.instrument || 'other') as StemInstrument;
      await this.prisma.transcribeTrack.upsert({
        where: { projectId_instrument: { projectId, instrument } },
        create: {
          projectId,
          instrument,
          stemPath: stem.path,
          status: 'separated',
        },
        update: { stemPath: stem.path, status: 'separated', error: null },
      });
    }

    await this.completeStage(jobRowId, {
      model,
      stems: stems.map((s) => ({ instrument: s.instrument, path: this.upload.toRelativePath(s.path) })),
    });

    // 分离阶段与「转录」在同一个项目内并行度 = 1，逐个分轨投递
    const targets = stems
      .map((s) => s.instrument as StemInstrument)
      .filter((i) => TABBED_INSTRUMENTS.includes(i));
    const list = targets.length > 0 ? targets : (['guitar'] as StemInstrument[]);

    for (const instrument of list) {
      await this.enqueueStage(projectId, 'transcribe', instrument, payload.overrides);
    }
  }

  /** 读取内置转录器落盘的和弦时间线（不存在就是空数组，不报错） */
  private loadAudioChords(
    projectId: string,
    instrument: string,
  ): Array<{ startSec: number; endSec: number; name: string }> {
    try {
      const path = this.nodeTranscriber.chordsPath(projectId, instrument);
      if (!existsSync(path)) return [];
      const parsed = safeJson(readFileSync(path, 'utf-8'));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (s: any) =>
          Number.isFinite(Number(s?.startSec)) &&
          Number.isFinite(Number(s?.endSec)) &&
          typeof s?.name === 'string' &&
          s.name.trim().length > 0,
      );
    } catch {
      return [];
    }
  }

  /** ③ 转录：Basic Pitch → midi + notes[] */
  private async handleTranscribe(payload: StageJobPayload, job: QueueJob<StageJobPayload>): Promise<void> {
    const { projectId } = payload;
    const instrument = (payload.instrument || 'guitar') as StemInstrument;
    const project = await this.getProjectRow(projectId);
    const track = await this.prisma.transcribeTrack.findUnique({
      where: { projectId_instrument: { projectId, instrument } },
    });
    const stemPath = track?.stemPath || project.audioPath || '';
    const jobRowId = await this.beginStage(projectId, 'transcribe', job.id, { instrument, stemPath });

    if (!stemPath || !existsSync(stemPath)) {
      const err = new Error(`分轨音频不存在（${instrument}）：${stemPath || '(空)'}`);
      await this.failStage(jobRowId, err);
      await this.markTrackFailed(projectId, instrument, err.message);
      throw err;
    }

    const caps = await this.python.probe();
    const bpm = payload.overrides?.bpm || project.bpm || 100;
    const tuning = parseTuning(project.tuning) || defaultTuningFor(instrument);
    const midiPath = join(this.upload.subDir(projectId, 'midi'), `${instrument}.mid`);

    let result: TranscribeWorkerResult;
    /** 真实引擎标记：Basic Pitch / 内置 YIN 都是「真实转录」，模拟器不是 */
    let realEngine = false;
    let engineName = 'simulation';
    let analysisSummary: Record<string, unknown> | null = null;
    if (caps.basicPitch.available) {
      const onsetThreshold = process.env.BASIC_PITCH_ONSET ?? '0.5';
      /**
       * 默认帧阈值从 0.3 提到 0.45 + 最短音符 58ms 提到 100ms：
       * 实测（Macaroon 5 吉他分轨 20s 片段）
       *   onset0.5/frame0.3/minlen58  → 165 音符，平均置信度 0.535，低置信（<0.5）68 个（41%）
       *   onset0.5/frame0.45/minlen100 → 95 音符，平均置信度 0.626，低置信 10 个（11%）
       * 前者会把大量泛音/串音写进六线谱（C 端表现为莫名其妙的音符），
       * 后者更接近 basic-pitch 上游默认（上游 minimum_note_length 默认 127.8ms）。
       */
      const frameThreshold = process.env.BASIC_PITCH_FRAME ?? '0.45';
      const minNoteMs = process.env.BASIC_PITCH_MIN_NOTE_MS ?? '100';
      const outcome = await this.python.runWorker<TranscribeWorkerResult>('transcribe.py', [
        '--input',
        stemPath,
        '--output',
        midiPath,
        '--instrument',
        instrument,
        '--onset-threshold',
        onsetThreshold,
        '--frame-threshold',
        frameThreshold,
        '--min-note-length-ms',
        minNoteMs,
        '--bpm',
        String(bpm),
      ]);
      if (!outcome.ok || !outcome.result?.ok) {
        const err = new Error(
          `Basic Pitch 转录失败（${instrument}）：${outcome.error || outcome.result?.message || 'worker 未返回结果'}`,
        );
        await this.failStage(jobRowId, err, outcome.durationMs);
        await this.markTrackFailed(projectId, instrument, err.message);
        throw err;
      }
      result = outcome.result;
      realEngine = true;
      engineName = 'basic-pitch';
    } else if (this.nodeTranscriber.canTranscribe()) {
      /**
       * 没有 Basic Pitch 时的**真实**兜底：内置 YIN 单音转录 + 色度和声分析。
       * 它真的听音频（而不是按网格造音符），因此 `simulated=false`，
       * 后续 `convert` 阶段会走真实的 `midi_to_tab.py`。
       */
      const produced = await this.nodeTranscriber.transcribe({
        projectId,
        instrument,
        audioPath: stemPath,
        bpm: payload.overrides?.bpm || project.bpm || 0,
        tuning,
        midiPath,
      });
      result = produced;
      realEngine = true;
      engineName = 'node-yin';
      analysisSummary = produced.analysis as unknown as Record<string, unknown>;
    } else {
      if (!caps.simulate) {
        const err = new Error(caps.basicPitch.reason || 'Basic Pitch 不可用，且 ffmpeg 不可用（无法做内置分析）');
        await this.failStage(jobRowId, err);
        await this.markTrackFailed(projectId, instrument, err.message);
        throw err;
      }
      result = this.simulation.buildTranscription({
        instrument,
        durationSec: project.durationSec || 0,
        bpm,
        tuning,
        midiPath,
      });
    }

    const notes: TranscribedNote[] = result.notes || [];
    const lowConfidence = notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length;

    await this.prisma.transcribeTrack.update({
      where: { projectId_instrument: { projectId, instrument } },
      data: {
        midiPath: result.midiPath || midiPath,
        status: 'transcribed',
        noteCount: notes.length,
        lowConfidenceCount: lowConfidence,
        confidenceAvg: Number(result.confidenceAvg ?? 0),
        meta: JSON.stringify({
          notes,
          simulated: !realEngine,
          engine: engineName,
          analysis: analysisSummary,
          bpm: result.bpm || bpm,
          warnings: result.message ? [result.message] : [],
        }),
        error: null,
      },
    });

    await this.completeStage(jobRowId, {
      instrument,
      noteCount: notes.length,
      lowConfidenceCount: lowConfidence,
      confidenceAvg: result.confidenceAvg,
      engine: engineName,
      midiPath: this.upload.toRelativePath(result.midiPath || midiPath),
      // 诊断：为什么谱面节点比听到的少（起音数 / 浊音率 / 生效门限）
      analysis: analysisSummary,
    });

    await this.enqueueStage(projectId, 'convert', instrument, payload.overrides);
  }

  /** ④ 转谱：Tayuya → TabProject（既有统一中间格式） */
  private async handleConvert(payload: StageJobPayload, job: QueueJob<StageJobPayload>): Promise<void> {
    const { projectId } = payload;
    const instrument = (payload.instrument || 'guitar') as StemInstrument;
    const project = await this.getProjectRow(projectId);
    const track = await this.prisma.transcribeTrack.findUnique({
      where: { projectId_instrument: { projectId, instrument } },
    });
    const jobRowId = await this.beginStage(projectId, 'convert', job.id, { instrument });

    if (!track) {
      const err = new Error(`找不到分轨记录：${instrument}`);
      await this.failStage(jobRowId, err);
      throw err;
    }

    const meta = safeJson(track.meta) || {};
    const notes: TranscribedNote[] = meta.notes || [];
    const caps = await this.python.probe();
    const bpm = payload.overrides?.bpm || project.bpm || meta.bpm || 100;
    const timeSignature = payload.overrides?.timeSignature || project.timeSignature || '4/4';
    const capo = payload.overrides?.capo ?? project.capo ?? 0;
    const tuning = payload.overrides?.tuning?.length
      ? payload.overrides.tuning
      : parseTuning(project.tuning) || defaultTuningFor(instrument);
    const tabPath = join(this.upload.subDir(projectId, 'tab'), `${instrument}.json`);

    let tabProject: any;
    const warnings: string[] = [];

    // Tayuya 阶段：`workers/midi_to_tab.py` 是纯标准库实现（脚本存在即可运行），
    // 因此这里只需要「有真实 MIDI 且不是模拟产物」两个条件。
    const canRunConverter =
      caps.python.available && !!track.midiPath && existsSync(track.midiPath) && !meta.simulated;

    if (canRunConverter) {
      const outcome = await this.python.runWorker<MidiToTabWorkerResult>('midi_to_tab.py', [
        '--input',
        track.midiPath!,
        '--output',
        tabPath,
        '--instrument',
        instrument,
        '--bpm',
        String(bpm),
        '--time-signature',
        timeSignature,
        '--capo',
        String(capo),
        /**
         * 量化网格。
         *
         * ⚠️ 这里原来写的是「Basic Pitch 给的 MIDI 时间戳比较粗，用 1/8 就够」—— **这句是错的**，
         * 而且代价很大。Basic Pitch 是帧级输出（hop ≈ 11.6ms），时间戳一点都不粗；
         * 真正的误差来源恰恰是 `midi_to_tab.py` 把起点**吸附到 1/8 网格**（4/4 @100BPM = 300ms）。
         *
         * 用 `scripts/verify-transcription-alignment.py` 拿音频**真实起音点**当基准实测
         * （Macaroon 5 / 206s，中位偏差 / ±50ms 命中率，`attack(晚)` 口径）：
         *   guitar  1/8 → 68ms / 36.1%    1/16 → 51ms / 48.7%    1/32 → 38ms / 60.0%
         *   bass    1/8 → 102ms / 30.3%   1/16 → 60ms / 44.2%    1/32 → 53ms / 47.7%
         * 反向覆盖率（音频起音点被谱面覆盖）也从 75.9% ⇒ 入谱后只剩 45.8%（容差 ±80ms）。
         *
         * 默认取 **1/16**：标准记谱分辨率（十六分音符），误差比 1/8 砍掉约一半，
         * 又不至于让谱面出现大量非标准的 32 分位置。想要最大保真可用
         * `TAB_QUANTIZE_GRID=1/32`（实测 guitar 中位 38ms / ±50ms 60%）。
         * 内置 YIN 的起音本来就是毫秒级，同样给 1/16。
         */
        '--grid',
        process.env.TAB_QUANTIZE_GRID ?? '1/16',
        '--tuning',
        tuning.join(','),
        '--title',
        project.title,
        ...(project.artist ? ['--artist', project.artist] : []),
      ]);
      if (outcome.ok && outcome.result?.ok) {
        tabProject =
          outcome.result.tabProject ||
          safeJson(readIfExists(outcome.result.tabProjectPath));
        warnings.push(...(outcome.result.warnings || []));
      } else {
        warnings.push(
          `midi_to_tab.py 执行失败（${outcome.error || outcome.result?.message || '未知原因'}），已降级为内置装配器。`,
        );
      }
    } else if (!caps.python.available) {
      warnings.push(`Python 不可用（${caps.python.reason || '未安装'}），已降级为内置装配器。`);
    }

    if (!tabProject) {
      if (!caps.simulate && !meta.simulated && !caps.python.available) {
        const err = new Error(caps.python.reason || 'Python 不可用');
        await this.failStage(jobRowId, err);
        await this.markTrackFailed(projectId, instrument, err.message);
        throw err;
      }
      tabProject = this.simulation.buildTabProject({
        instrument,
        notes,
        bpm,
        timeSignature,
        tuning,
        capo,
        title: project.title,
        artist: project.artist || undefined,
        reason: canRunConverter
          ? 'midi_to_tab.py 执行失败，已用内置装配器从建值输出 TabProject。'
          : undefined,
      });
    }

    /**
     * 真实音频和弦（内置 YIN 分析产物）→ 直接覆盖启发式推定。
     * 只有跑过 `NodeTranscriberService` 的项目才有这份时间线，模拟器没有。
     */
    const audioChords = this.loadAudioChords(projectId, instrument);
    if (audioChords.length > 0) {
      const applied = applyAudioChordTimeline(tabProject, audioChords);
      if (applied.count > 0) {
        warnings.push(
          `已把音频分析出的 ${applied.count} 个和弦（${applied.names.join(' / ')}）映射到小节上 —— ` +
            `名称来自录音的色度和声分析（不是从旋律反推），仍需人工核对转位与加音。`,
        );
      }
    }

    /**
     * 补全左手指法 / 把位。
     *
     * 音频转录**本质上拿不到指法** —— Basic Pitch 只给出音高，弦/品位置是按「最低把位」
     * 反推出来的，至于用哪根手指按、当前是第几把位，必须由规则推定
     * （见 `tab-import/fingering.ts`）。这也是真实六线谱上都会带 1-4 手指标注的原因。
     */
    const fingering = deriveLeftHandFingering(tabProject, { onlyMissing: true });
    tabProject = fingering.project;
    warnings.push(...fingering.warnings.map((w) => w.message));

    /**
     * 补全和弦标注（谱面上方和弦名）。
     * 转录得到的往往是一条**单音旋律** —— 参考谱面里的和弦名描述的是和声，
     * 所以这里会走「窗口和声分析」；结果必须人工核对（会写进 warnings）。
     */
    const chordDetection = deriveChords(tabProject, { onlyMissing: true });
    tabProject = chordDetection.project;
    warnings.push(...chordDetection.warnings);

    // 落盘 TabProject（可回灌 tab-import 工作台继续人工编辑）
    try {
      const dir = join(tabPath, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(tabPath, JSON.stringify(tabProject, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.warn(`写入 TabProject 失败（不影响后续）：${err?.message || err}`);
    }

    const measureCount = tabProject?.tracks?.[0]?.measures?.length || 0;
    const noteCount = tabProject?.stats?.noteCount || notes.length;

    // 同一项目的多分轨 → 按乐器合并（保留每个乐器的 tracks，前者为主轨）
    const merged = mergeTabProjects(safeJson(project.tabProject), tabProject);

    await this.prisma.transcribeTrack.update({
      where: { projectId_instrument: { projectId, instrument } },
      data: {
        tabPath,
        status: 'converted',
        noteCount,
        error: null,
        meta: JSON.stringify({ ...meta, warnings }),
      },
    });

    const remaining = await this.prisma.transcribeTrack.count({
      where: { projectId, status: { in: ['pending', 'separated', 'transcribed'] } },
    });

    /**
     * ⚠️ 进度文案必须汇报**整个项目**的规模，而不是「最后一条分轨」的。
     *
     * 早期实现直接用循环里的 `measureCount` / `noteCount`（= 刚处理完的那条轨），
     * 多分轨项目于是显示成最后一条轨的数字 —— 实测 Macaroon 5 明明转录出
     * guitar 227 / bass 145 / other 81 / piano 7 音符，却显示
     * 「转录完成（46 小节 / 7 音符）」（= piano 那条），
     * 让人误以为分离/转录把结果搞坏了。这里改成汇总所有分轨。
     */
    const finishedTracks = await this.prisma.transcribeTrack.findMany({
      where: { projectId },
      select: { instrument: true, noteCount: true, confidenceAvg: true },
      orderBy: { instrument: 'asc' },
    });
    const totalNotes = finishedTracks.reduce((sum, t) => sum + (t.noteCount || 0), 0);
    const perTrack = finishedTracks
      .filter((t) => (t.noteCount || 0) > 0)
      .map((t) => `${t.instrument} ${t.noteCount}`)
      .join(' / ');
    /** 全曲小节数 = 各分轨里最长的那条（合并后的时间轴长度） */
    const mergedMeasures = (merged as any)?.tracks?.length
      ? Math.max(
          ...(merged as any).tracks.map((t: any) => t?.measures?.length || 0),
          measureCount,
        )
      : measureCount;

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        tabProject: JSON.stringify(merged),
        progress: remaining === 0 ? STAGE_PROGRESS.convert : Math.min(90, STAGE_PROGRESS.transcribe + 10),
        status: remaining === 0 ? 'review' : STAGE_TO_PROJECT_STATUS.convert,
        stageNote:
          remaining === 0
            ? `转录完成（${mergedMeasures} 小节 / 共 ${totalNotes} 音符：${perTrack || '无'}），等待人工复核`
            : `已完成 ${instrument} 转谱，剩余 ${remaining} 条分轨处理中`,
      },
    });

    await this.completeStage(jobRowId, {
      instrument,
      tabPath: this.upload.toRelativePath(tabPath),
      measureCount,
      noteCount,
      fingering: fingering.stats,
      chords: chordDetection.stats,
      warnings,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 队列 / 任务留痕
  // ═══════════════════════════════════════════════════════════

  private async enqueueStage(
    projectId: string,
    stage: StageJobPayload['stage'],
    instrument?: StemInstrument,
    overrides?: TranscriptionOverrides,
  ) {
    const payload: StageJobPayload = { projectId, stage, instrument, overrides };
    const { jobId, driver } = await this.queue.enqueue(stage, payload);

    await this.prisma.transcribeJob.create({
      data: {
        projectId,
        stage,
        status: 'queued',
        queueName: this.queue.queueName,
        jobId,
        input: JSON.stringify({ instrument: instrument || null, overrides: overrides || null, driver }),
      },
    });

    return { jobId, driver };
  }

  /** 阶段开始：状态置为 active，并同步 Project 状态 */
  private async beginStage(
    projectId: string,
    stage: StageJobPayload['stage'],
    jobId: string,
    input?: unknown,
  ): Promise<string> {
    const queued = await this.prisma.transcribeJob.findFirst({
      where: { projectId, stage, jobId },
      orderBy: { createdAt: 'desc' },
    });

    const row = queued
      ? await this.prisma.transcribeJob.update({
          where: { id: queued.id },
          data: {
            status: 'active',
            attempts: { increment: 1 },
            startedAt: new Date(),
            input: input ? JSON.stringify(input) : queued.input,
          },
        })
      : await this.prisma.transcribeJob.create({
          data: {
            projectId,
            stage,
            status: 'active',
            queueName: this.queue.queueName,
            jobId,
            attempts: 1,
            startedAt: new Date(),
            input: input ? JSON.stringify(input) : null,
          },
        });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: STAGE_TO_PROJECT_STATUS[stage],
        progress: STAGE_PROGRESS[stage],
        stageNote: `正在执行阶段「${stage}」`,
        error: null,
      },
    });

    return row.id;
  }

  private async completeStage(jobRowId: string, output: unknown, durationMsHint?: number): Promise<void> {
    const row = await this.prisma.transcribeJob.findUnique({ where: { id: jobRowId } });
    const durationMs =
      durationMsHint ??
      (row?.startedAt ? Date.now() - new Date(row.startedAt).getTime() : undefined);
    await this.prisma.transcribeJob.update({
      where: { id: jobRowId },
      data: {
        status: 'completed',
        progress: 100,
        output: JSON.stringify(output),
        finishedAt: new Date(),
        durationMs: durationMs ?? null,
      },
    });
  }

  private async failStage(jobRowId: string, err: any, durationMsHint?: number): Promise<void> {
    const row = await this.prisma.transcribeJob.findUnique({ where: { id: jobRowId } });
    const message = err?.message || String(err);
    const durationMs =
      durationMsHint ??
      (row?.startedAt ? Date.now() - new Date(row.startedAt).getTime() : undefined);
    const updated = await this.prisma.transcribeJob.update({
      where: { id: jobRowId },
      data: {
        status: 'failed',
        error: message,
        finishedAt: new Date(),
        durationMs: durationMs ?? null,
      },
    });

    await this.prisma.project.update({
      where: { id: updated.projectId },
      data: {
        status: 'failed',
        error: message,
        stageNote: `阶段「${updated.stage}」失败：${message.slice(0, 180)}`,
      },
    });
  }

  private async markTrackFailed(projectId: string, instrument: StemInstrument, message: string) {
    await this.prisma.transcribeTrack
      .update({
        where: { projectId_instrument: { projectId, instrument } },
        data: { status: 'failed', error: message },
      })
      .catch(() => undefined);
  }

  // ═══════════════════════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════════════════════

  private async getProjectRow(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`转录项目 ${projectId} 不存在`);
    return project;
  }

  private async applyOverrides(projectId: string, overrides?: TranscriptionOverrides) {
    if (!overrides) return;
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        bpm: Number(overrides.bpm) > 0 ? Number(overrides.bpm) : undefined,
        timeSignature: overrides.timeSignature || undefined,
        capo: typeof overrides.capo === 'number' ? overrides.capo : undefined,
        tuning: overrides.tuning?.length ? JSON.stringify(overrides.tuning) : undefined,
        title: overrides.title || undefined,
        artist: overrides.artist ?? undefined,
      },
    });
  }

  private decorateProject(project: any) {
    const status = toProjectStatus(project.status);
    return {
      id: project.id,
      title: project.title,
      artist: project.artist,
      status,
      statusLabel: PROJECT_STATUS_LABELS[status],
      sourceType: project.sourceType,
      sourceRef: project.sourceRef,
      originalName: project.originalName,
      audioUrl: project.audioPath ? this.upload.toPublicUrl(project.audioPath) : null,
      durationSec: project.durationSec,
      bpm: project.bpm,
      timeSignature: project.timeSignature,
      capo: project.capo,
      tuning: parseTuning(project.tuning),
      license: project.license,
      progress: project.progress,
      stageNote: project.stageNote,
      error: project.error,
      scoreId: project.scoreId,
      /** URL 项目的下载执行方（server | client）—— CMS 用来解释「为什么在等」 */
      downloadDriver: project.downloadDriver || null,
      hasTabProject: !!project.tabProject,
      counts: project._count
        ? {
            tracks: project._count.tracks,
            jobs: project._count.jobs,
            packages: project._count.practicePackages,
          }
        : undefined,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private decorateTrack(track: any) {
    const meta = safeJson(track.meta) || {};
    return {
      id: track.id,
      instrument: track.instrument,
      status: track.status,
      stemUrl: track.stemPath ? this.upload.toPublicUrl(track.stemPath) : null,
      midiPath: track.midiPath,
      tabPath: track.tabPath,
      noteCount: track.noteCount,
      confidenceAvg: round4(track.confidenceAvg),
      lowConfidenceCount: track.lowConfidenceCount,
      simulated: !!meta.simulated,
      /**
       * 实际跑的转录引擎：`basic-pitch`（ML）/ `node-yin`（内置零依赖真实转录）/ `simulation`。
       * CMS 与演示脚本据此判断「这条谱是真的听音频听出来的」还是造的。
       */
      engine: (meta.engine as string) || (meta.simulated ? 'simulation' : 'basic-pitch'),
      /** 内置分析摘要（BPM 估计 / 有音高帧占比 / 和弦段数）—— 排查与展示用 */
      analysis: meta.analysis || null,
      warnings: meta.warnings || [],
      error: track.error,
      /** 供 ReviewPage 直接渲染的转录音符（相对分轨起点） */
      notes: (meta.notes || []) as TranscribedNote[],
    };
  }
}

// ─────────────────────────────────────────────
// 纯函数工具
// ─────────────────────────────────────────────

export function safeJson(raw?: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readIfExists(path?: string | null): string | null {
  if (!path) return null;
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function parseTuning(raw?: string | null): number[] | null {
  if (!raw) return null;
  const parsed = safeJson(raw);
  if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) return parsed;
  return null;
}

/**
 * 把「从音频分析出的和弦时间线」映射到 TabProject 的小节上。
 *
 * 为什么需要它：转录得到的往往是一条**单音旋律**，和弦名只能靠旋律反推（猜）；
 * 而真实的伴奏和弦就写在录音里 —— 用 `pitch-analysis.ts#analyzeChords` 的
 * 色度 + 模板匹配结果直接覆盖，谱面上的和弦名就与听感一致了。
 *
 * 映射规则（**宁少勿滥**：练习谱通常一小节一个和弦，多标反而误导）：
 * - 取与本小节重叠最多的和弦段作**主和弦**，标在小节开头；
 * - 只有当另一段在小节内**独立占到大半小节**（≥50% 且长度 ≥0.5s）时才补标，
 *   —— 用来表现「小节内真的换和弦」，而不是把分析窗的抖动当成和弦变化；
 * - 偏移/时长钳进小节范围，并同步算好 `beat`（谱面横坐标依赖它）。
 */
export function applyAudioChordTimeline(
  tabProject: any,
  segments: Array<{ startSec: number; endSec: number; name: string }>,
): { count: number; names: string[] } {
  let count = 0;
  const names: string[] = [];
  if (!tabProject?.tracks?.length || !segments.length) return { count, names };

  for (const track of tabProject.tracks) {
    for (const measure of track.measures || []) {
      const ms = Number(measure.startTime) || 0;
      const me = Number(measure.endTime) || 0;
      const len = Math.max(0.05, me - ms);

      const overlaps = segments
        .map((s) => ({ s, overlap: Math.min(me, s.endSec) - Math.max(ms, s.startSec) }))
        .filter((x) => Number.isFinite(x.overlap) && x.overlap > Math.min(0.2, len * 0.25));
      if (!overlaps.length) continue;

      const ranked = overlaps.sort((a, b) => b.overlap - a.overlap);
      const picked = [ranked[0]];
      for (const candidate of ranked.slice(1)) {
        const longEnough = candidate.overlap >= len * 0.5 && candidate.s.endSec - candidate.s.startSec >= 0.5;
        const insideMeasure = candidate.s.startSec - ms >= len * 0.25;
        const differs = candidate.s.name !== ranked[0].s.name;
        if (longEnough && insideMeasure && differs) picked.push(candidate);
      }
      picked.sort((a, b) => a.s.startSec - b.s.startSec);

      const beatSec = 60 / (Number(measure.bpm) || 100);
      const chords: Array<{ name: string; offsetSec: number; beat: number; durationSec: number }> = [];
      const seen = new Set<string>();
      for (const { s } of picked) {
        const offsetSec = Math.max(0, Math.min(len, Number((s.startSec - ms).toFixed(4))));
        const key = `${s.name}@${offsetSec.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chords.push({
          name: s.name,
          offsetSec,
          beat: Number((offsetSec / beatSec).toFixed(4)),
          durationSec: Number(Math.max(0.05, Math.min(len - offsetSec, s.endSec - s.startSec)).toFixed(4)),
        });
      }
      if (!chords.length) continue;
      measure.chords = chords;
      count += chords.length;
      names.push(...chords.map((c) => c.name));
    }
  }

  return { count, names: [...new Set(names)] };
}

function countNotes(track: any): number {
  return (track?.measures || []).reduce(
    (sum: number, m: any) => sum + (m?.notes?.length || 0),
    0,
  );
}

/**
 * 判断项目标题是否还是「占位」状态（空 / 未命名… / 直接就是 URL）。
 * 用于下载完成后自动用视频标题命名，避免列表里一堆「未命名转录项目」。
 */
export function isPlaceholderTitle(title?: string | null, sourceRef?: string | null): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  if (/^未命名/.test(t)) return true;
  if (sourceRef && t === sourceRef.trim()) return true;
  return false;
}

/**
 * 合并多分轨的 TabProject：主轨（吉他）保留在 `tracks[0]`，
 * 其余乐器追加为 `tracks[i]` 并同步 `stats`。
 * 与 tab-import 的 TabProject 结构保持一致，CMS 无需特殊处理。
 */
export function mergeTabProjects(existing: any, incoming: any): any {
  if (!existing?.tracks?.length) return incoming;
  if (!incoming?.tracks?.length) return existing;

  const incomingTrack = incoming.tracks[0];
  const already = existing.tracks.some(
    (t: any) => t.instrument === incomingTrack.instrument && t.id === incomingTrack.id,
  );
  const tracks = already
    ? existing.tracks.map((t: any) => (t.id === incomingTrack.id ? incomingTrack : t))
    : [...existing.tracks, incomingTrack];

  return {
    ...existing,
    tracks,
    warnings: [...(existing.warnings || []), ...(incoming.warnings || [])],
    stats: {
      ...existing.stats,
      measureCount: Math.max(existing.stats?.measureCount || 0, incoming.stats?.measureCount || 0),
      noteCount: tracks.reduce((sum: number, t: any) => sum + countNotes(t), 0),
      durationSec: Math.max(existing.stats?.durationSec || 0, incoming.stats?.durationSec || 0),
    },
  };
}
