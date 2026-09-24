import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MeasuresService } from '../measures/measures.service';
import { PracticePackageService } from './practice-package.service';

@ApiTags('Published')
@Controller('api/published')
export class PublishedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measures: MeasuresService,
    private readonly practicePackage: PracticePackageService,
  ) {}

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
