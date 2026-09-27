import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurriculumService, type AssetRef, type CurriculumData } from './curriculum.service';
import { CurriculumAssetsService, type VideoAssetEntry } from './curriculum-assets.service';
import { CurriculumTranscodeService } from './curriculum-transcode.service';

/** 资产库列表里的视频项：文件信息 + ffprobe 结果 + 引用情况 */
type EnrichedVideoAsset = VideoAssetEntry & {
  durationSec: number | null;
  resolution: { width: number; height: number } | null;
  probed: boolean;
  referencedBy: AssetRef[];
};

/**
 * 课程大纲 API（后端唯一数据源）
 *
 * | 方法 | 路径 | 谁用 | 说明 |
 * |---|---|---|---|
 * | GET | `/api/curriculum` | CMS 管理端 | 整棵树（含草稿状态、转码状态等管理字段） |
 * | PUT | `/api/curriculum` | CMS 管理端 | 整体保存；`?baseRevision=` 做乐观锁，冲突返回 409 |
 * | GET | `/api/curriculum/learn` | 小程序 Learn 页 | **C 端投影**，不含管理字段 |
 * | GET | `/api/curriculum/health` | CMS 管理端 | **数据体检**：悬空引用 / 孤儿文件汇总 |
 * | POST | `/api/curriculum/assets/cover` | CMS 管理端 | 上传课程封面图（base64）→ 返回可存的相对路径 |
 * | POST | `/api/curriculum/assets/video` | CMS 管理端 | 直传课程视频（base64，≤20MB，不转码） |
 * | POST | `/api/curriculum/assets/transcode` | CMS 管理端 | 转码出 720p/1080p 变体（同步） |
 * | GET | `/api/curriculum/assets` | CMS 管理端 | **统一资产库**：列磁盘上所有视频 + 封面（含孤儿与悬空引用） |
 * | DELETE | `/api/curriculum/assets` | CMS 管理端 | 删文件；被引用时 409（要删得带 `?force=1`） |
 *
 * ⚠️ `PUT` 是「整棵树覆盖」而不是逐字段 PATCH —— 原因见 `curriculum.service.ts` 顶部注释
 * （CMS 的增删改是按整棵树离线算的，892 行已测逻辑，不在服务端重写）。
 */
@ApiTags('curriculum')
@Controller('api/curriculum')
export class CurriculumController {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly assets: CurriculumAssetsService,
    private readonly transcode: CurriculumTranscodeService,
  ) {}

  @Get()
  @ApiOperation({ summary: '读取整份课程大纲（CMS 管理端）' })
  get() {
    return this.curriculum.get();
  }

  @Put()
  @ApiOperation({ summary: '整体保存课程大纲（CMS 管理端）' })
  @ApiQuery({
    name: 'baseRevision',
    required: false,
    description: '客户端读到的版本号；与库内不一致时返回 409',
  })
  @ApiBody({
    description: '整棵树：{ stages, videoLibrary, chords, chordGroups }',
    schema: {
      type: 'object',
      properties: {
        stages: { type: 'array', items: { type: 'object' } },
        videoLibrary: { type: 'array', items: { type: 'object' } },
        chords: { type: 'object' },
        chordGroups: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  put(@Body() body: Partial<CurriculumData>, @Query('baseRevision') baseRevision?: string) {
    const revision = Number(baseRevision);
    return this.curriculum.put(body, Number.isFinite(revision) ? revision : undefined);
  }

  @Get('learn')
  @ApiOperation({ summary: 'C 端投影：小程序 Learn 页消费的形状' })
  learn() {
    return this.curriculum.getLearnView();
  }

  /**
   * 上传课程封面图
   *
   * 请求：`{ base64, fileName? }`（base64 可带 `data:image/png;base64,` 前缀）
   * 响应：`{ path, url, mime, sizeBytes }`
   *   - `path` = `/uploads/curriculum/covers/cover_<sha1前12位>.<ext>` → **存进课程树的 `coverImage`**
   *   - `url`  = 绝对地址，仅供「上传后立刻预览」
   *
   * ⚠️ 类型由**文件头**判定，不看扩展名；判不出来直接 400（避免存下打不开的封面）。
   */
  @Post('assets/cover')
  @ApiOperation({ summary: '上传课程封面图（base64 → /uploads/curriculum/covers/）' })  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        base64: { type: 'string', description: '图片 base64（可带 data: 前缀）' },
        fileName: { type: 'string', description: '原始文件名（仅用于报错提示）' },
      },
      required: ['base64'],
    },
  })
  uploadCover(@Body() body: { base64?: string; fileName?: string }) {
    return this.assets.saveCover({ base64: body?.base64, fileName: body?.fileName });
  }

  /**
   * 上传课程视频（base64，≤20MB，**不转码**）
   *
   * 大视频请放 OSS/CDN 后把地址填进 CMS 的 `TeachingVideo.videoUrl` ——
   * 直传只适合短片段/本地演示（原因见 `curriculum-assets.service.ts#MAX_VIDEO_BYTES`）。
   */
  @Post('assets/video')
  @ApiOperation({ summary: '上传课程视频（base64 → /uploads/curriculum/videos/，不转码）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        base64: { type: 'string', description: '视频 base64（可带 data: 前缀）' },
        fileName: { type: 'string', description: '原始文件名（仅用于报错提示）' },
      },
      required: ['base64'],
    },
  })
  uploadVideo(@Body() body: { base64?: string; fileName?: string }) {
    return this.assets.saveVideo({ base64: body?.base64, fileName: body?.fileName });
  }

  /**
   * 转码课程视频（真实 ffmpeg，出 720p / 1080p 变体）
   *
   * 请求：`{ source }`（相对路径 `/uploads/curriculum/videos/x.mp4`；外链先下载再传）
   * 响应：`{ variants: [{label,path,url,height,sizeBytes}], notes, elapsedMs, durationSec }`
   *
   * ⚠️ **同步接口**（会一直占到转完，默认超时 10 分钟）：单步、量小的活；
   * 要做成产品级应当是任务表 + 队列 + 轮询（见 `curriculum-transcode.service.ts` 顶部注释）。
   * ⚠️ 服务端**不改课程文档**：把返回的 `variants[].path` 由 CMS 写进 `videoUrl` 并 PUT ——
   * 保持「CMS 是课程树唯一写者」这个前提，避免乐观锁打架。
   */
  @Post('assets/transcode')
  @ApiOperation({ summary: '转码课程视频（ffmpeg → 720p / 1080p）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { source: { type: 'string', description: '视频相对路径（/uploads/...）' } },
      required: ['source'],
    },
  })
  transcodeVideo(@Body() body: { source?: string }) {
    return this.transcode.transcode({ source: body?.source || '' });
  }

  /**
   * 统一资产库：**磁盘上所有已提交的字节**（视频 + 封面）
   *
   * 回答的是「用户新提交了视频，去哪儿统一管理」——
   * 课程文档里的 `TeachingVideo` 只是**记录**（标题/讲师/打点），真正上传上来的**字节**
   * 落在 `uploads/curriculum/videos/`（直传 + `transcoded/`）与 `uploads/curriculum/covers/`。
   * 本接口把两边对起来：
   *
   * - 每个文件多大、视频多长/多少像素、**被哪些记录引用**、哪些是孤儿（`orphanCount`）；
   * - `dangling`：**反过来**的不一致 —— 被引用、但文件不在磁盘上（C 端会点出假播放按钮）；
   * - `orphanBytes`：一键清理能省多少空间。
   *
   * 为什么对账放服务端：引用关系就在课程文档里，让前端自己扫一遍等于把规则复制一份
   * （这正是本仓库一直在避免的「两份必须同步的规则」）。
   */
  @Get('assets')
  @ApiOperation({ summary: '统一资产库：视频 + 封面（含孤儿、转码产物、悬空引用）' })
  async listAssets() {
    const refs = await this.curriculum.collectAssetRefs();
    const videos = this.assets.listVideos();
    const covers = this.assets.listCovers();

    /**
     * 逐个 ffprobe 探真实时长/分辨率。
     *
     * ⚠️ 必须**限流**：每个 ffprobe 都要起一个进程（~50-100ms），一次列几百个会拖死接口、
     * 也会把机器打满。最多探前 `PROBE_LIMIT` 个（列表已按 mtime 倒序，最近提交的一定在里面），
     * 并发 `PROBE_CONCURRENCY`，其余文件先只给文件系统信息（下次再列就轮到了）。
     * 封面不探测（图片不需要）。
     */
    const PROBE_LIMIT = 40;
    const PROBE_CONCURRENCY = 4;
    const videoItems: EnrichedVideoAsset[] = [];

    for (let i = 0; i < videos.length; i += PROBE_CONCURRENCY) {
      const slice = videos.slice(i, i + PROBE_CONCURRENCY);
      const batch = await Promise.all(
        slice.map(async (item) => {
          if (i >= PROBE_LIMIT) return { item, probe: null, probed: false };
          const abs = this.assets.resolveVideoPath(item.relativePath);
          const probe = await this.transcode.probeFile(abs, { quiet: true });
          return { item, probe, probed: true };
        }),
      );
      for (const { item, probe, probed } of batch) {
        videoItems.push({
          ...item,
          durationSec: probe?.durationSec ?? null,
          resolution: probe ? { width: probe.width, height: probe.height } : null,
          probed,
          referencedBy: refs.videos.get(item.relativePath) || [],
        });
      }
    }

    const coverItems = covers.map((item) => ({
      ...item,
      referencedBy: refs.covers.get(item.relativePath) || [],
    }));

    /** 悬空引用：被引用、但文件不在（本地路径才算；外链无法用文件系统判断） */
    const videoPaths = new Set(videos.map((v) => v.relativePath));
    const coverPaths = new Set(covers.map((c) => c.relativePath));
    const dangling = [
      ...[...refs.videos.entries()]
        .filter(([p]) => this.assets.isLocalAssetPath(p) && !videoPaths.has(p))
        .map(([path, referencedBy]) => ({ kind: 'video' as const, path, referencedBy })),
      ...[...refs.covers.entries()]
        .filter(([p]) => this.assets.isLocalAssetPath(p) && !coverPaths.has(p))
        .map(([path, referencedBy]) => ({ kind: 'cover' as const, path, referencedBy })),
    ];

    const stat = (
      items: Array<{ sizeBytes: number; referencedBy: unknown[] }>,
    ) => {
      const orphans = items.filter((i) => i.referencedBy.length === 0);
      return {
        total: items.length,
        totalBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
        referencedCount: items.length - orphans.length,
        orphanCount: orphans.length,
        orphanBytes: orphans.reduce((sum, i) => sum + i.sizeBytes, 0),
      };
    };

    return {
      videos: { ...stat(videoItems), probeLimit: PROBE_LIMIT, items: videoItems },
      covers: { ...stat(coverItems), items: coverItems },
      dangling,
      /** 一键清理能省下的空间（视频 + 封面） */
      orphanBytes: stat(videoItems).orphanBytes + stat(coverItems).orphanBytes,
    };
  }

  /**
   * 删一个本地资产文件（孤儿清理；视频或封面都走这里）
   *
   * ⚠️ **被引用就 409**，而不是默默删掉让别人播放失败/封面裂图 ——
   * 报错里带上"谁在用"，想强删得显式 `?force=1`（按钮上也会写清后果）。
   */
  @Delete('assets')
  @ApiOperation({ summary: '删除资产文件（视频/封面；被引用时需 ?force=1）' })
  @ApiQuery({
    name: 'path',
    required: true,
    description: '相对路径，如 /uploads/curriculum/videos/x.mp4 或 /uploads/curriculum/covers/x.png',
  })
  @ApiQuery({ name: 'force', required: false, description: '被引用也删（force=1）' })
  @ApiQuery({
    name: 'ignoreVideoId',
    required: false,
    description: '对账时忽略这条视频记录（用于「删记录同时清文件」，避开文档保存的防抖窗口）',
  })
  async deleteAsset(
    @Query('path') path: string,
    @Query('force') force?: string,
    @Query('ignoreVideoId') ignoreVideoId?: string,
  ) {
    const rel = this.assets.toRelativeAssetPath(path || '');
    if (!rel) {
      throw new BadRequestException('缺少 path（要删的资产相对路径）。');
    }
    const refs = await this.curriculum.collectAssetRefs({ ignoreVideoId });
    const used = refs.videos.get(rel) || refs.covers.get(rel) || [];
    if (used.length > 0 && force !== '1') {
      throw new ConflictException(
        `该文件正被 ${used.length} 处引用（${used.map((r) => r.title).join('、')}），` +
          `删除后这些地方会播放失败或封面裂图。确认要删请加 ?force=1。`,
      );
    }
    return this.assets.deleteAsset(rel);
  }

  /**
   * 数据体检：把「引用了不存在的东西」全找出来
   *
   * C 端 `playable` 的语义只是「CMS 填过地址」，不是「地址可达」——
   * 一个被引用但文件已删的 `videoUrl` 会让小程序给出一个点不开的播放按钮。
   * 本接口用**文件系统存在性**（不是 HTTP 探测）给出准确、很快的答案，
   * 另外一并检查：悬空的 `videoIds` / `chordGroupIds` / 打点联动和弦 / 训练组里的和弦 /
   * `sourceLessonId`，以及孤儿文件汇总。
   */
  @Get('health')
  @ApiOperation({ summary: '数据体检：悬空引用 / 孤儿文件汇总' })
  health() {
    return this.curriculum.health();
  }
}
