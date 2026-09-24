import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TranscribeService } from './transcribe.service';
import { PublishService } from './publish.service';
import { PythonRunnerService } from './python-runner.service';
import { TranscribeQueueService } from './queue/transcribe.queue';
import {
  CreateUploadProjectDto,
  CreateUrlProjectDto,
  PublishProjectDto,
  StartProjectDto,
  UpdateProjectDto,
} from './dto/transcription.dto';
import { PROJECT_STATUSES, STAGE_PROGRESS } from './transcription.types';

/**
 * 音频转录流水线（Transcription）
 * ===============================
 *
 * 与既有 `/api/tab-import`（**人工制谱**导入）互补：
 * 这里处理的是**原始音频**，通过 Demucs → Basic Pitch → Tayuya 自动产出六线谱草稿。
 *
 * 完整链路：
 * ```
 * GET    /capabilities                     ← 先看本机具备哪些能力（Python / Demucs / yt-dlp）
 * POST   /projects/upload                  ← 上传 MP3/WAV/FLAC（base64）
 * POST   /projects/from-url                ← URL 下载（yt-dlp；直链走 HTTP）
 * POST   /projects/:id/start               ← 入队：separate → transcribe → convert
 * GET    /projects/:id                     ← 轮询进度（含每阶段耗时/错误、分轨音符）
 * PATCH  /projects/:id                     ← ReviewPage 人工复核（弦号/品位/时值/技巧/BPM）
 * POST   /projects/:id/publish             ← 切音频 + 上传 OSS + 生成 PracticePackage
 * GET    /projects/:id/package             ← 取 C 端契约 JSON（schemaVersion 1.0）
 * ```
 */
@ApiTags('Transcription')
@Controller('api/transcription')
export class TranscriptionController {
  constructor(
    private readonly transcribe: TranscribeService,
    private readonly publishService: PublishService,
    private readonly python: PythonRunnerService,
    private readonly queue: TranscribeQueueService,
  ) {}

  // ───────────────────────────────────────────
  // 能力 / 队列状态
  // ───────────────────────────────────────────

  @Get('capabilities')
  @ApiOperation({
    summary: '本机转录能力探测（Python / Demucs / Basic Pitch / Tayuya / yt-dlp / ffmpeg）',
    description:
      '返回每个外部依赖是否可用。任一缺失时会自动启用「模拟模式」（`simulate: true`），' +
      '让「上传 → 队列 → 复核 → 发布 → PracticePackage」链路依然可以端到端跑通（产物带模拟标记）。',
  })
  @ApiQuery({ name: 'force', required: false, description: '强制重新探测（默认使用进程内缓存）', example: false })
  async capabilities(@Query('force') force?: string) {
    const caps = await this.python.probe(force === 'true' || force === '1');
    return {
      success: true,
      capabilities: caps,
      /** 缺失依赖时给出的安装指引，可直接贴到终端 */
      installHints: buildInstallHints(caps),
      pipeline: {
        stages: Object.keys(STAGE_PROGRESS),
        progressBaseline: STAGE_PROGRESS,
        projectStatuses: PROJECT_STATUSES,
      },
    };
  }

  @Get('queue')
  @ApiOperation({
    summary: '队列统计与驱动信息（bullmq = Redis；in-process = 单机降级）',
    description:
      '未配置 `REDIS_URL` 或 Redis 不可连通时会自动降级为进程内 FIFO 队列，' +
      '该接口会如实报告当前驱动，便于运维判断是否需要补 Redis。',
  })
  async queueStatus() {
    const [counts, describe] = await Promise.all([this.queue.counts(), this.queue.describe()]);
    return { success: true, counts, driver: describe };
  }

  // ───────────────────────────────────────────
  // 创建项目
  // ───────────────────────────────────────────

  @Post('projects/upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '上传本地音频创建转录项目（MP3 / WAV / FLAC，base64）',
    description:
      '为什么是 base64 而不是 multipart？与既有 `/api/tab-import/parse` 保持一致，' +
      '且 `main.ts` 已把 body limit 提到 30mb —— 这样**无需新增 multer 依赖**即可支持二进制上传。\n\n' +
      '校验：扩展名白名单 + 魔数（RIFF/fLaC/ID3 或 MPEG 帧同步）+ 体积上限。',
  })
  async createFromUpload(@Body() dto: CreateUploadProjectDto) {
    const project = await this.transcribe.createProject({
      title: dto.title,
      artist: dto.artist,
      sourceType: 'upload',
      fileName: dto.fileName,
      base64: dto.base64,
      bpm: dto.bpm,
      timeSignature: dto.timeSignature,
      capo: dto.capo,
      tuning: dto.tuning,
      license: dto.license,
    });
    const started = await this.transcribe.startProject(project.id);
    return { success: true, project: await this.transcribe.getProject(project.id), started };
  }

  @Post('projects/from-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'URL 导入创建转录项目（yt-dlp 下载，直链音频走 HTTP）',
    description:
      'yt-dlp 缺失时仅支持直链音频（.mp3/.wav/.flac）；下载后统一转为 44.1kHz WAV 供 Demucs 使用。\n' +
      '为避免长时间阻塞请求，下载在队列的 `download` 阶段异步执行，本接口立即返回。',
  })
  async createFromUrl(@Body() dto: CreateUrlProjectDto) {
    const project = await this.transcribe.createProject({
      title: dto.title,
      artist: dto.artist,
      sourceType: 'url',
      url: dto.url,
      bpm: dto.bpm,
      timeSignature: dto.timeSignature,
      capo: dto.capo,
      tuning: dto.tuning,
      license: dto.license,
    });
    const started = await this.transcribe.startProject(project.id);
    return { success: true, project: await this.transcribe.getProject(project.id), started };
  }

  // ───────────────────────────────────────────
  // 项目查询 / 编辑
  // ───────────────────────────────────────────

  @Get('projects')
  @ApiOperation({ summary: '转录项目列表（按更新时间倒序）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（1-200，默认 50）', example: 50 })
  async listProjects(@Query('limit') limit?: string) {
    const projects = await this.transcribe.listProjects(Number(limit) || 50);
    return { success: true, total: projects.length, projects };
  }

  @Get('projects/:id')
  @ApiOperation({
    summary: '项目详情：状态/进度 + 阶段时间线（TranscribeJob）+ 分轨与音符',
    description: 'CMS 轮询该接口即可渲染全流程进度；`tracks[].notes` 可直接喂给 ReviewPage 渲染。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProject(@Param('id') id: string) {
    return { success: true, project: await this.transcribe.getProject(id) };
  }

  @Patch('projects/:id')
  @ApiOperation({
    summary: '人工复核保存（BPM / 拍号 / 变调夹 / 调弦 / 授权 / 整体 TabProject 覆写）',
    description:
      'ReviewPage 逐音符编辑弦号 / 品位 / 时值 / 技巧后，把整个 TabProject 回传到这里，' +
      '发布时会用这份数据（而不是模型原始输出）。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const updated = await this.transcribe.updateProject(id, {
      bpm: dto.bpm,
      timeSignature: dto.timeSignature,
      capo: dto.capo,
      tuning: dto.tuning,
      license: dto.license,
      title: dto.title,
      artist: dto.artist,
      tabProject: dto.tabProject,
      status: dto.status as any,
    });
    return {
      success: true,
      projectId: updated.id,
      status: updated.status,
      bpm: updated.bpm,
      timeSignature: updated.timeSignature,
      capo: updated.capo,
      tuning: updated.tuning,
      stageNote: updated.stageNote,
    };
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: '删除转录项目（级联删除任务 / 分轨 / 发布快照）' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async deleteProject(@Param('id') id: string) {
    return this.transcribe.deleteProject(id);
  }

  // ───────────────────────────────────────────
  // 流水线控制
  // ───────────────────────────────────────────

  @Post('projects/:id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: '启动/续跑流水线（入队 separate，或先 download）',
    description:
      '**立即返回 202**，实际工作在队列里执行（Demucs 分离一首歌通常需要 1-3 分钟，不能同步等待）。' +
      '轮询 `GET /projects/:id` 看 `status` 与 `progress`。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async start(@Param('id') id: string, @Body() dto: StartProjectDto) {
    return this.transcribe.startProject(id, dto);
  }

  @Post('projects/:id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: '失败后重试：自动定位「第一个未完成的阶段」并从该阶段恢复',
    description: '例如 Demucs 成功但 Basic Pitch 失败，只会重跑 transcribe，不会重复跑分离。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async retry(@Param('id') id: string) {
    return this.transcribe.retryProject(id);
  }

  // ───────────────────────────────────────────
  // 发布
  // ───────────────────────────────────────────

  @Post('projects/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成并发布 PracticePackage（按小节切音频 → 上传 OSS → relativeTime/归一化坐标 → schemaVersion 1.0）',
    description:
      '每个小节：\n' +
      '1. `ffmpeg` 切出 `[startTime, endTime]` 区间（复用既有 `AudioService.sliceAudio`）；\n' +
      '2. 上传 OSS / 本地静态目录（复用既有 `OssService.upload`）；\n' +
      '3. `relativeTime = audioTime - startTime`，`x = relativeTime / duration`，`y = (string-1)/5`；\n' +
      '4. `metronome` 始终下发（`enabled: !audioUrl`）→ 音频 404 时客户端立即降级，不会「点了没声音」；\n' +
      '5. 落库 `PracticePackage.payload`（String，SQLite 不支持 Json），revision 自增保留历史快照。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 400, description: '尚未转录完成 / 源音频不可达且禁止缺音频发布' })
  async publish(@Param('id') id: string, @Body() dto: PublishProjectDto) {
    return this.publishService.publish(id, {
      publishedBy: dto.publishedBy,
      channel: dto.channel,
      audioFallback: dto.audioFallback,
      allowMissingAudio: dto.allowMissingAudio,
      mirrorToScorePipeline: dto.mirrorToScorePipeline,
      mirrorScoreId: dto.mirrorScoreId,
      maxMeasures: dto.maxMeasures,
    });
  }

  @Get('projects/:id/package')
  @ApiOperation({
    summary: '获取已发布的 PracticePackage（C 端唯一数据契约，schemaVersion 1.0）',
    description:
      '与既有 `GET /api/published/scores/:id/package` 结构**完全一致** —— ' +
      '小程序端 `validatePracticePackage` 无需任何改动即可消费。',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiQuery({ name: 'revision', required: false, description: '指定版本号（默认最新）', example: 1 })
  async getPackage(@Param('id') id: string, @Query('revision') revision?: string) {
    return this.publishService.getPackage(id, Number(revision) || undefined);
  }

  @Get('projects/:id/revisions')
  @ApiOperation({ summary: '发布历史（每次发布 revision +1，保留历史快照）' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async listRevisions(@Param('id') id: string) {
    return { success: true, revisions: await this.publishService.listRevisions(id) };
  }

  // ───────────────────────────────────────────
  // 便捷：上传后直接返回可访问 URL（调试用）
  // ───────────────────────────────────────────

  @Get('projects/:id/audio-url')
  @ApiOperation({ summary: '项目源音频的可访问 URL（用于前端试听 / 波形绘制）' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async audioUrl(@Param('id') id: string) {
    const project = await this.transcribe.getProject(id);
    return { success: true, audioUrl: project.audioUrl, durationSec: project.durationSec };
  }
}

/** 依据能力探测结果生成可直接复制的安装命令 */
function buildInstallHints(caps: Awaited<ReturnType<PythonRunnerService['probe']>>) {
  const hints: string[] = [];
  if (!caps.python.available) {
    hints.push(
      '未检测到 Python 3：请安装 Python 3.10+ 并确保 `python3`/`python` 在 PATH 中，或用 PYTHON_BIN 指定路径。',
    );
  }
  if (!caps.demucs.available) hints.push('pip install -U demucs');
  if (!caps.basicPitch.available) hints.push('pip install -U basic-pitch');
  if (!caps.tayuya.available) {
    hints.push('# Tayuya（MIDI → 六线谱）：按上游 README 安装，或设置 TAYUYA_BIN 指向可执行文件');
  }
  if (!caps.ytDlp.available) hints.push('pip install -U yt-dlp');
  if (!caps.ffmpeg.available) hints.push('# ffmpeg-static 缺失：npm i ffmpeg-static');
  return hints;
}
