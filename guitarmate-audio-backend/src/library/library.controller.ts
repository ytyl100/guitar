import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LibraryService } from './library.service';
import { ImportLibraryItemsDto, LibraryItemDto, UpdateLibraryItemDto } from './dto';

/**
 * 音频乐谱库 API —— 需求 (3)
 * =========================
 *
 * 与 `/api/published/library`（小程序读的「已发布练习题」）是**两套东西**：
 * 这里返回的是带完整 `score`（整份 `ScoreData`）的曲库条目，
 * `guitar-ai-audio` 的曲库页/练习台直接消费它。
 * 详见 `library.service.ts` 顶部那张对照表。
 *
 * ⚠️ 静态段路由（`/import`、`/stats`）必须声明在 `/:id` 之前 ——
 * Nest 按声明顺序匹配，否则 `stats` 会被当成 id。
 */
@ApiTags('library')
@Controller('api/library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({ summary: '曲库列表（含每条的完整乐谱 ScoreData）' })
  @ApiQuery({ name: 'category', required: false, description: 'system | user' })
  @ApiQuery({ name: 'instrument', required: false })
  @ApiQuery({ name: 'ownerUserId', required: false })
  @ApiQuery({ name: 'q', required: false, description: '标题/副标题/作者/调号 模糊匹配' })
  @ApiQuery({
    name: 'withScore',
    required: false,
    description: '默认 true（含完整乐谱）。传 false 只返回元数据（列表页省流量用），需要时再 GET /api/library/:id',
  })
  list(
    @Query('category') category?: string,
    @Query('instrument') instrument?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('q') q?: string,
    @Query('withScore') withScore?: string,
  ) {
    return this.library.list({ category, instrument, ownerUserId, q }, withScore !== 'false');
  }

  @Get('stats')
  @ApiOperation({ summary: '曲库统计（分类/乐器分布、已关联乐谱数）' })
  stats() {
    return this.library.stats();
  }

  @Post('import')
  @ApiOperation({
    summary: '批量导入曲库条目（迁移/环境同步）',
    description: '⚠️ replaceAll=true 会清空整张表；带 scoreId 但库里没有对应乐谱时会忽略该引用而不是整批失败',
  })
  importItems(@Body() dto: ImportLibraryItemsDto) {
    return this.library.importItems(dto);
  }

  @Post()
  @ApiOperation({ summary: '新建曲库条目' })
  create(@Body() dto: LibraryItemDto) {
    return this.library.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '单条曲库条目（含乐谱本体）' })
  @ApiParam({ name: 'id', description: '业务 id，如 macaroon-5' })
  get(@Param('id') id: string) {
    return this.library.get(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '整份覆盖保存（前端 saveSingleItem 用；不存在则新建）' })
  upsert(@Param('id') id: string, @Body() dto: UpdateLibraryItemDto) {
    return this.library.upsert(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '局部更新（例如只切换收藏 isFavorite）' })
  update(@Param('id') id: string, @Body() dto: UpdateLibraryItemDto) {
    return this.library.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除曲库条目' })
  remove(@Param('id') id: string) {
    return this.library.remove(id);
  }
}
