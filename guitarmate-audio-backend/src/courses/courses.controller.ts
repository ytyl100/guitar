import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import {
  ChordDrillDto,
  CourseDto,
  ImportCoursesDto,
  ImportDrillsDto,
  ImportVideosDto,
  PublishCourseDto,
  RollbackCourseDto,
  TeachingVideoDto,
  UpdateChordDrillDto,
  UpdateCourseDto,
  UpdateTeachingVideoDto,
} from './dto';

/**
 * 课纲 / 教学视频 / 和弦组合 API —— 需求 (2)
 * ========================================
 *
 * 三个资源放在同一个 controller 里（而不是拆成 3 个模块）是因为它们**互相引用**：
 * 课纲的章节内容项会挂 `videoId` / `chordDrillId`，删视频/删和弦组都要回头清理课纲。
 * 拆开就得跨模块注入，反而更绕。
 *
 * ⚠️ 路由声明顺序有讲究：**静态段必须写在 `:id` 之前**。
 * Nest 按声明顺序匹配，`POST /api/drills/publish-all` 如果写在 `POST /api/drills/:id` 后面，
 * 会被后者的正则先吃掉（`id = "publish-all"`），然后 404。
 *
 * 这套接口也是**给小程序/管理端复用**的：全部是标准 REST，无前端耦合。
 */
@ApiTags('courses')
@Controller('api')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // ══════════════════════════════════════════════════════════════
  // 课程
  // ══════════════════════════════════════════════════════════════

  @Get('courses')
  @ApiOperation({ summary: '课程列表', description: '支持 status/q/teacherId/institutionId 过滤；返回顺序即前端展示顺序' })
  @ApiQuery({ name: 'status', required: false, description: 'published | draft | archived' })
  @ApiQuery({ name: 'q', required: false, description: '标题/副标题/讲师/分类 模糊匹配' })
  listCourses(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('teacherId') teacherId?: string,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.courses.listCourses({ status, q, teacherId, institutionId });
  }

  @Post('courses/import')
  @ApiOperation({
    summary: '批量导入课程（迁移/环境同步）',
    description: '⚠️ replaceAll=true 会先清空整张表；日常同步请用默认的 upsert。可传 baseUpdatedAt 做乐观锁。',
  })
  importCourses(@Body() dto: ImportCoursesDto) {
    return this.courses.importCourses(dto);
  }

  @Post('courses')
  @ApiOperation({ summary: '新建课程', description: '不传 id 时由服务端生成；新课程排在最前（与前端 prepend 语义一致）' })
  createCourse(@Body() dto: CourseDto) {
    return this.courses.createCourse(dto);
  }

  @Get('courses/:id')
  @ApiOperation({ summary: '单门课程（含整棵章节树）' })
  @ApiParam({ name: 'id', description: '业务 id，如 course_001' })
  getCourse(@Param('id') id: string) {
    return this.courses.getCourse(id);
  }

  @Put('courses/:id')
  @ApiOperation({ summary: '整份覆盖保存（前端 saveSingleCourse 用）', description: '不存在则新建' })
  @ApiQuery({ name: 'baseUpdatedAt', required: false, description: '乐观锁基准；与库里不一致返回 409' })
  upsertCourse(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @Query('baseUpdatedAt') baseUpdatedAt?: string,
  ) {
    return this.courses.upsertCourse(id, dto, baseUpdatedAt);
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: '局部更新' })
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  @ApiOperation({ summary: '删除课程' })
  deleteCourse(@Param('id') id: string) {
    return this.courses.deleteCourse(id);
  }

  @Post('courses/:id/publish')
  @ApiOperation({ summary: '发布课程', description: '版本号 +0.1 并追加版本历史（规则与前端 publishCourse 一致）' })
  publishCourse(@Param('id') id: string, @Body() dto: PublishCourseDto) {
    return this.courses.publishCourse(id, dto);
  }

  @Post('courses/:id/archive')
  @ApiOperation({ summary: '归档课程' })
  archiveCourse(@Param('id') id: string) {
    return this.courses.archiveCourse(id);
  }

  @Post('courses/:id/rollback')
  @ApiOperation({ summary: '回滚到指定版本', description: '只改当前版本标记并记历史，不还原章节内容（与前端一致）' })
  rollbackCourse(@Param('id') id: string, @Body() dto: RollbackCourseDto) {
    return this.courses.rollbackCourse(id, dto.targetVersion);
  }

  // ══════════════════════════════════════════════════════════════
  // 教学视频
  // ══════════════════════════════════════════════════════════════

  @Get('videos')
  @ApiOperation({ summary: '教学视频列表（含打点 cuePoints）' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'associatedCourseId', required: false })
  listVideos(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('associatedCourseId') associatedCourseId?: string,
  ) {
    return this.courses.listVideos({ status, q, associatedCourseId });
  }

  @Post('videos/import')
  @ApiOperation({ summary: '批量导入教学视频' })
  importVideos(@Body() dto: ImportVideosDto) {
    return this.courses.importVideos(dto);
  }

  @Post('videos')
  @ApiOperation({ summary: '新建教学视频' })
  createVideo(@Body() dto: TeachingVideoDto) {
    return this.courses.createVideo(dto);
  }

  @Get('videos/:id')
  @ApiOperation({ summary: '单个教学视频' })
  getVideo(@Param('id') id: string) {
    return this.courses.getVideo(id);
  }

  @Put('videos/:id')
  @ApiOperation({ summary: '整份覆盖保存（不存在则新建）' })
  upsertVideo(@Param('id') id: string, @Body() dto: UpdateTeachingVideoDto) {
    return this.courses.upsertVideo(id, dto);
  }

  @Delete('videos/:id')
  @ApiOperation({
    summary: '删除教学视频',
    description: '默认级联清理课纲里引用该视频的内容项（cascade=false 可关闭）',
  })
  @ApiQuery({ name: 'cascade', required: false, description: '默认 true' })
  deleteVideo(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.courses.deleteVideo(id, cascade !== 'false');
  }

  // ══════════════════════════════════════════════════════════════
  // 和弦组合
  // ══════════════════════════════════════════════════════════════

  @Get('drills')
  @ApiOperation({ summary: '和弦组合列表（含 BPM 阶梯）' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'q', required: false })
  listDrills(@Query('status') status?: string, @Query('q') q?: string) {
    return this.courses.listDrills({ status, q });
  }

  @Post('drills/import')
  @ApiOperation({ summary: '批量导入和弦组合' })
  importDrills(@Body() dto: ImportDrillsDto) {
    return this.courses.importDrills(dto);
  }

  @Post('drills/publish-all')
  @ApiOperation({ summary: '一键全部发布（前端 publishAllDrills）' })
  publishAllDrills() {
    return this.courses.publishAllDrills();
  }

  @Post('drills')
  @ApiOperation({ summary: '新建和弦组合' })
  createDrill(@Body() dto: ChordDrillDto) {
    return this.courses.createDrill(dto);
  }

  @Get('drills/:id')
  @ApiOperation({ summary: '单个和弦组合' })
  getDrill(@Param('id') id: string) {
    return this.courses.getDrill(id);
  }

  @Put('drills/:id')
  @ApiOperation({ summary: '整份覆盖保存（不存在则新建）' })
  upsertDrill(@Param('id') id: string, @Body() dto: UpdateChordDrillDto) {
    return this.courses.upsertDrill(id, dto);
  }

  @Delete('drills/:id')
  @ApiOperation({
    summary: '删除和弦组合',
    description: '默认级联清理课纲里引用该组合的内容项（cascade=false 可关闭）',
  })
  @ApiQuery({ name: 'cascade', required: false, description: '默认 true' })
  deleteDrill(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.courses.deleteDrill(id, cascade !== 'false');
  }
}
