import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ScoresService } from './scores.service';

@ApiTags('Scores')
@Controller('api/scores')
export class ScoresController {
  constructor(private readonly scoresService: ScoresService) {}

  @Get()
  @ApiOperation({ summary: '获取全部曲目列表（包含草稿 draft 与已发布 published）' })
  async findAll() {
    return this.scoresService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单首曲目详情（包含分轨及所有小节数据）' })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  async findOne(@Param('id') id: string) {
    return this.scoresService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '创建新乐谱曲目 (草稿)' })
  async create(
    @Body()
    body: {
      title: string;
      artist?: string;
      bpm?: number;
      timeSignature?: string;
      originalAudio: string;
      coverUrl?: string;
      status?: string;
      /** 调性，例如 "Bm" */
      songKey?: string;
      /** 变调夹品位 */
      capo?: number;
      /** 调弦音名数组（由低到高） */
      tuning?: string[];
      /** public_domain | cc_by | authorized | user_uploaded */
      license?: string;
      /** 难度 1-5 */
      difficulty?: number;
    },
  ) {
    return this.scoresService.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '更新曲目元数据（调性 / 变调夹 / 调弦 / 授权状态 / 难度）',
    description:
      '这些字段会直接出现在 C 端 PracticePackage 的 `score.*` 与 `provenance.license` 中。' +
      '`tuning` 传数组（由低到高的音名，如 ["E2","A2","D3","G3","B3","E4"]）；传 null 表示清空。',
  })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  async updateMeta(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      artist?: string | null;
      bpm?: number | null;
      timeSignature?: string;
      originalAudio?: string;
      coverUrl?: string | null;
      songKey?: string | null;
      capo?: number | null;
      tuning?: string[] | null;
      license?: string | null;
      difficulty?: number | null;
    },
  ) {
    return this.scoresService.updateMeta(id, body);
  }

  @Post(':id/tracks')
  @ApiOperation({ summary: '为指定曲目添加分轨 (Track)' })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  async addTrack(
    @Param('id') id: string,
    @Body()
    body: {
      instrument: string;
      audioUrl: string;
      jsonUrl?: string;
    },
  ) {
    return this.scoresService.addTrack(id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新曲目发布状态 (draft / published)' })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'draft' | 'published' },
  ) {
    return this.scoresService.updateStatus(id, body.status);
  }

  @Post(':id/transcription')
  @ApiOperation({
    summary: '导入 SoloTrace / Basic Pitch 转录 JSON',
    description:
      '接收 Mac 工作站导出的转录 JSON（notes 数组），落盘保存到 ./uploads/transcriptions 并创建或更新对应的 Track，同时回写曲目 BPM 与拍号。',
  })
  @ApiParam({ name: 'id', description: '曲目 Score ID' })
  async importTranscription(
    @Param('id') id: string,
    @Body()
    body: {
      trackId?: string;
      instrument?: string;
      audioUrl?: string;
      fileName?: string;
      data: any;
    },
  ) {
    return this.scoresService.importTranscription(id, body);
  }
}
