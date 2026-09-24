import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TabImportService } from './tab-import.service';
import { ParseTabDto, SaveTabProjectDto } from './dto/tab-import.dto';
import { SUPPORTED_FORMATS, TabParseError } from './parsers';
import { TAB_SAMPLES, findSample } from './tab-samples';
import type { TabSourceFormat } from './tab-project.types';

/**
 * 六线谱导入（Tab Import）
 * ========================
 *
 * 解决的核心问题：网上拿到的谱子是**人工制谱的各种格式**
 * （ASCII tab / MusicXML / Guitar Pro / 转录 JSON），本项目需要把它们统一成
 * 「可发布到小程序的六线谱 JSON」。
 *
 * 完整链路：
 * ```
 * GET  /api/tab-import/sources         ← 先看清「从哪里拿谱子」以及版权边界
 * GET  /api/tab-import/formats         ← 支持哪些格式、节奏精度如何
 * POST /api/tab-import/parse           ← 任意格式 → TabProject + 发布就绪小节（预览，不落库）
 * POST /api/tab-import/save            ← 落到曲目工程（自动建 Score / Track，并写入谱面元数据）
 * POST /api/measures/publish           ← 补上音频路径后发布 → C 端小程序
 * ```
 */
@ApiTags('TabImport')
@Controller('api/tab-import')
export class TabImportController {
  constructor(private readonly service: TabImportService) {}

  @Get('formats')
  @ApiOperation({ summary: '支持的谱面格式清单（含节奏精度说明）' })
  getFormats() {
    return { success: true, formats: SUPPORTED_FORMATS };
  }

  @Get('sources')
  @ApiOperation({
    summary: '谱面数据源目录 + 版权等级 + 公有领域曲目建议',
    description:
      '明确回答「热门曲目的六线谱 JSON 从哪来」：没有一个公开的、模型产出的数据集；' +
      '可行路线是人工制谱（ASCII / MusicXML / Guitar Pro）做 ground truth，AI 转录做草稿，统一成 TabProject。' +
      '但流行曲目仍在版权保护期，对外发布必须走公有领域 / 官方授权 / 自有编配三条合规路径。',
  })
  getSources() {
    return { success: true, ...this.service.getCatalog() };
  }

  @Get('copyright')
  @ApiQuery({ name: 'title', required: false, description: '曲名', example: 'Hotel California' })
  @ApiOperation({ summary: '按曲名判断版权状态与发布风险' })
  getCopyright(@Query('title') title?: string) {
    return { success: true, title, ...this.service.getCopyrightHint(title) };
  }

  @Get('samples')
  @ApiOperation({
    summary: '内置示例谱面（自有编配 / 公有领域，可安全用于演示与回归测试）',
  })
  getSamples() {
    return { success: true, samples: TAB_SAMPLES };
  }

  @Post('samples/:id/parse')
  @ApiParam({ name: 'id', description: '示例 ID', example: 'ascii-study' })
  @ApiOperation({ summary: '直接解析某个内置示例（免去手动粘贴）' })
  parseSample(@Param('id') id: string) {
    const sample = findSample(id);
    if (!sample) {
      throw new BadRequestException(
        `找不到示例「${id}」。可用示例：${TAB_SAMPLES.map((s) => s.id).join(', ')}`,
      );
    }
    return this.service.parseToPreview({
      content: sample.content,
      format: sample.format,
      fileName: `${sample.id}.txt`,
      site: 'GuitarMate 内置示例',
      rights: sample.rights,
      rightsNote: sample.rightsNote,
    });
  }

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '解析谱面（ASCII tab / MusicXML / .gpx / 和弦表 / 转录 JSON）→ 统一 TabProject',
    description:
      '**不写数据库**，只做解析 + 校验 + 预览，返回：\n' +
      '- `project`：统一中间格式 TabProject（可落盘、可回灌、可再编辑）\n' +
      '- `measures`：发布就绪的小节（`audioTime` 为绝对秒，可直接进 POST /api/measures/publish）\n' +
      '- `diagnostics`：小节数 / 音符数 / 近似节奏小节数 / 警告\n' +
      '- `copyright`：版权判定与是否允许对外发布\n' +
      '- `asciiPreview`：前 3 小节的 ASCII 回显，方便肉眼校对',
  })
  @ApiResponse({ status: 200, description: '解析成功，返回预览结果' })
  @ApiResponse({ status: 400, description: '格式无法识别 / 内容不合法' })
  parse(@Body() dto: ParseTabDto) {
    try {
      const buffer = dto.base64 ? Buffer.from(dto.base64, 'base64') : undefined;
      return this.service.parseToPreview({
        content: dto.content,
        data: dto.data,
        buffer,
        format: (dto.format as TabSourceFormat) || undefined,
        fileName: dto.fileName,
        url: dto.url,
        site: dto.site,
        title: dto.title,
        artist: dto.artist,
        bpm: dto.bpm,
        timeSignature: dto.timeSignature,
        capo: dto.capo,
        instrument: dto.instrument,
        rights: dto.rights,
        rightsNote: dto.rightsNote,
        chordsPerBar: dto.chordsPerBar,
        strumPattern: dto.strumPattern,
        trackIndex: dto.trackIndex,
      });
    } catch (err: any) {
      if (err instanceof TabParseError || err?.name?.endsWith('ParseError')) {
        throw new BadRequestException({
          message: err.message,
          hint: '请检查源格式，或用 format 字段显式指定。',
        });
      }
      throw new BadRequestException(`解析失败：${err?.message || err}`);
    }
  }

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '把解析好的 TabProject 存入曲目工程（自动创建 Score / Track + 写入谱面元数据）',
    description:
      '落盘位置：`uploads/tab-projects/{scoreId}/*.tabproject.json`，并写入 `Track.jsonUrl` 便于溯源与回灌。\n' +
      '同时把谱面元数据写入 Score：调性（songKey）/ 变调夹（capo）/ 调弦（tuning）/ 授权状态（license），' +
      '这些字段会直接出现在 C 端 PracticePackage 的 `score.*` 与 `provenance.license`。\n' +
      '返回的 `publishPayloadTemplate` 就是可直接 POST /api/measures/publish 的请求体（音频字段留空）。',
  })
  async save(@Body() dto: SaveTabProjectDto) {
    try {
      return await this.service.saveProject({
        scoreId: dto.scoreId,
        newScore: dto.newScore,
        project: dto.project,
        fileName: dto.fileName,
        updateTrackId: dto.updateTrackId,
      });
    } catch (err: any) {
      if (err?.status) throw err;
      throw new BadRequestException(`保存失败：${err?.message || err}`);
    }
  }

  @Get('projects')
  @ApiQuery({ name: 'scoreId', required: false, description: '只列出该曲目的 TabProject' })
  @ApiOperation({ summary: '列出已保存的 TabProject 文件' })
  listProjects(@Query('scoreId') scoreId?: string) {
    const projects = this.service.listProjects(scoreId);
    return { success: true, count: projects.length, projects };
  }

  @Get('projects/:scoreId/:fileName')
  @ApiParam({ name: 'scoreId', description: '曲目 ID' })
  @ApiParam({ name: 'fileName', description: 'TabProject 文件名（含 .json）' })
  @ApiOperation({ summary: '读回已保存的 TabProject（回灌到 CMS 继续编辑）' })
  loadProject(@Param('scoreId') scoreId: string, @Param('fileName') fileName: string) {
    return { success: true, project: this.service.loadProject(scoreId, fileName) };
  }
}
