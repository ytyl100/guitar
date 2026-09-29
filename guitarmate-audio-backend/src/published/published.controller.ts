import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MeasuresService } from '../measures/measures.service';
import { PracticePackageService } from './practice-package.service';
import { PublishedLibraryService } from './published-library.service';
import { TabRenderService } from './tab-render.service';
import { TAB_SVG_HEIGHT, TAB_SVG_WIDTH } from './tab-render/tab-svg';

@ApiTags('Published')
@Controller('api/published')
export class PublishedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measures: MeasuresService,
    private readonly practicePackage: PracticePackageService,
    private readonly library: PublishedLibraryService,
    private readonly tabRender: TabRenderService,
  ) {}

  @Get('library')
  @ApiOperation({
    summary: 'C 端统一曲库（旧 Score 链路 ∪ 转录 PracticePackage 链路）',
    description:
      '后端有两条发布链路，落库位置不同：\n' +
      '- 旧链路（CMS 发布小节 / 镜像）：`Score(status=published)`；\n' +
      '- 转录链路（复核页发布 PracticePackage）：`PracticePackage.payload`（默认不镜像，`Project.scoreId=null`）。\n\n' +
      '早期小程序只读 `/api/published/scores`，因此**转录链路发布的曲目（如 Macaroon 5 / Isolated）在 C 端完全看不到**。\n' +
      '本接口把两条链路合并成同一个列表，并按曲名去重（已镜像的 Score 优先，其次取最新），' +
      '小程序端只读这一个接口即可与 CMS 中「已发布」的内容保持一致。',
  })
  @ApiResponse({ status: 200, description: '成功返回统一曲库列表（按发布时间倒序）' })
  async listLibrary() {
    return this.library.list();
  }

  @Get('items/:id/package')
  @ApiOperation({
    summary: '统一取已发布 PracticePackage（id 可以是 Score id 或转录 Project id）',
    description:
      '先按 Score id 走既有组装逻辑（`PracticePackageService.build`），' +
      '找不到再按转录 Project id 取最新 revision 的快照 JSON。\n' +
      '两条链路返回结构完全一致（schemaVersion 1.0），小程序端无需区分来源。',
  })
  @ApiParam({ name: 'id', description: 'Score ID 或转录 Project ID' })
  @ApiResponse({ status: 200, description: '成功返回 PracticePackage' })
  @ApiResponse({ status: 404, description: '既不是已发布曲目也不是已发布转录项目' })
  async getItemPackage(@Param('id') id: string) {
    return this.library.getPackage(id);
  }

  @Get('items/:id/tab.json')
  @ApiOperation({
    summary: '六线谱排版坐标（与 tab.png 同一次排版，供小程序叠加高亮层）',
    description:
      '**为什么需要它**：契约里音符的 `x` 是「音符在小节内的归一化时间」（0-1），' +
      '而谱面上的 x 是 \`contentLeft + ratio × contentWidth\`（还要叠加小节的横向平移与谱号占位），' +
      '两者不等价 —— 直接用归一化 x 画高亮会整体错位。\n\n' +
      '这里返回**与 `tab.png` 完全相同的那一次排版**的坐标（坐标系 = PNG 的 viewBox），' +
      '客户端把图片按实际显示宽度等比缩放后，用同一比例缩放这些坐标即可像素级对齐。',
  })
  @ApiParam({ name: 'id', description: 'Score ID 或转录 Project ID' })
  @ApiQuery({ name: 'instrument', required: false })
  @ApiQuery({ name: 'from', required: false, description: '起始小节号（1 起），默认 1' })
  @ApiQuery({ name: 'count', required: false, description: '并排小节数 1-3，默认 2' })
  @ApiQuery({ name: 'theme', required: false, enum: ['dark', 'light'] })
  @ApiQuery({ name: 'width', required: false, description: `画布宽，默认 ${TAB_SVG_WIDTH}` })
  async getItemTabLayout(
    @Param('id') id: string,
    @Query('instrument') instrument?: string,
    @Query('from') from?: string,
    @Query('count') count?: string,
    @Query('theme') theme?: string,
    @Query('width') width?: string,
  ) {
    const parsedWidth = Math.max(320, Math.min(1600, Number(width) || TAB_SVG_WIDTH));
    return this.tabRender.renderSystemLayout(id, {
      instrument,
      from: Number(from) || 1,
      count: Number(count) || 2,
      dark: theme !== 'light',
      width: parsedWidth,
      height: Math.round((parsedWidth * TAB_SVG_HEIGHT) / TAB_SVG_WIDTH),
    });
  }

  @Get('items/:id/tab.png')
  @ApiOperation({
    summary: '渲染六线谱 PNG（供微信小程序 <Image> 直接显示）',
    description:
      '微信小程序**不支持 WXML 里的 `<svg>`**，所以谱面改由服务端渲染成 PNG：\n' +
      '- 排版数学与前端**完全同一套引擎**（`tab-render/tab-layout.ts` 是 `guitarmate-frontend/src/utils/standardTabLayout.ts` 的逐字节镜像），\n' +
      '  因此「后台看到的谱 = 学员练的谱」；\n' +
      '- 结果按 `publishedAt` 缓存，重新发布后自动失效。\n\n' +
      '小程序端拿到 PNG 后，再用 PracticePackage 里音符的归一化 `x`/`y` 叠加高亮层\n' +
      '（播放头 / 当前音符），不需要在客户端重画谱面。',
  })
  @ApiParam({ name: 'id', description: 'Score ID 或转录 Project ID' })
  @ApiQuery({ name: 'instrument', required: false, description: '乐器，缺省取吉他轨' })
  @ApiQuery({ name: 'from', required: false, description: '起始小节号（1 起），默认 1' })
  @ApiQuery({ name: 'count', required: false, description: '并排小节数 1-3，默认 2' })
  @ApiQuery({ name: 'theme', required: false, enum: ['dark', 'light'], description: '配色，默认 dark' })
  @ApiQuery({ name: 'width', required: false, description: `像素宽，默认 ${TAB_SVG_WIDTH}` })
  @ApiResponse({ status: 200, description: 'PNG 图片', content: { 'image/png': {} } })
  @ApiResponse({ status: 404, description: '曲目/小节不存在' })
  @Header('Cache-Control', 'public, max-age=604800')
  async getItemTabPng(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('instrument') instrument?: string,
    @Query('from') from?: string,
    @Query('count') count?: string,
    @Query('theme') theme?: string,
    @Query('width') width?: string,
  ) {
    const parsedWidth = Math.max(320, Math.min(1600, Number(width) || TAB_SVG_WIDTH));
    /** 画布是 600×142 的比例，宽度变化时高度等比缩放（否则谱面会被纵向拉伸） */
    const parsedHeight = Math.round((parsedWidth * TAB_SVG_HEIGHT) / TAB_SVG_WIDTH);
    const result = await this.tabRender.renderSystemPng(id, {
      instrument,
      from: Number(from) || 1,
      count: Number(count) || 2,
      dark: theme !== 'light',
      width: parsedWidth,
      height: parsedHeight,
    });

    /**
     * 把排版元信息放在响应头里：小程序端做「点谱面跳转」时要用每个小节的\n     * contentLeft / contentRight 把像素换算回「第几小节 + 小节内偏移」。
     */
    res.setHeader('X-Tab-Measure-Count', String(result.measureCount));
    res.setHeader('X-Tab-From', String(result.from));
    res.setHeader('X-Tab-Instrument', result.instrument);
    res.setHeader('Content-Type', 'image/png');
    res.end(result.png);
  }

  @Get('scores')
  @ApiOperation({
    summary: '获取已发布曲目列表 (面向小程序端)',
    description: '过滤 status="published" 的乐谱列表，附带小节总数和分轨总数。',
  })
  @ApiResponse({ status: 200, description: '成功返回已发布曲目列表' })
  async listScores() {
    const scores = await this.prisma.score.findMany({
      where: { status: 'published' },
      select: {
        id: true,
        title: true,
        artist: true,
        coverUrl: true,
        bpm: true,
        timeSignature: true,
        /** 原声（全轨混音）地址，C 端 Original 模式的服务端默认音源 */
        originalAudio: true,
        createdAt: true,
        _count: {
          select: {
            measures: true,
            tracks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return scores;
  }

  @Get('scores/:id/measures')
  @ApiOperation({
    summary: '获取指定曲目的所有小节与关联数据',
    description:
      '根据 scoreId 查询全部小节、分轨音频、指弹谱图、横按 Barre、和弦标记 ChordMarker，并将 SQLite 中的 notes 字符串反序列化为 Note[] 数组。',
  })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  @ApiResponse({ status: 200, description: '成功返回小节列表及反序列化音符' })
  @ApiResponse({ status: 404, description: '曲目不存在' })
  async getMeasures(@Param('id') id: string) {
    return this.measures.findByScore(id);
  }

  @Get('scores/:id/package')
  @ApiOperation({
    summary: '获取 PracticePackage（小程序端唯一数据契约，schemaVersion 1.0）',
    description:
      '把 Score / Track / Measure / 音符 / 横按 / 和弦 组装成统一 JSON：\n' +
      '- `schemaVersion`：版本白名单校验（当前 1.0）\n' +
      '- `score` / `tracks` / `measures` / `assets` / `provenance`\n' +
      '- **不含音频二进制**：只给 `audioUrl` / `originalAudioUrl`（CDN URL）+ 时间戳\n' +
      '- 小节没有可用音频时输出 `audioUrl: null` + `metronome` 配置，' +
      '小程序改用节拍器时钟驱动，渲染逻辑与有音频时完全一致\n' +
      '- 音符已按 `relativeTime` 升序、小节按 `index` 升序（小程序「当前节点」判定依赖该顺序）',
  })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  @ApiResponse({ status: 200, description: '成功返回 PracticePackage' })
  @ApiResponse({ status: 404, description: '曲目不存在' })
  async getPackage(@Param('id') id: string) {
    return this.practicePackage.build(id, 'published-api');
  }
}
