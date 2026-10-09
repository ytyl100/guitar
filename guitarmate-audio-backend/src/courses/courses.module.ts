import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

/**
 * 课纲 / 教学视频 / 和弦组合模块（需求 (2)）
 *
 * 只依赖全局 `PrismaModule`（`PrismaService` 是全局 provider），
 * 与 `UsersModule` / `CurriculumModule` 同一约定。
 *
 * ⚠️ 与既有 `CurriculumModule` 是**两套不同的数据**，不要混：
 * - `curriculum` = CMS 那棵树（Stage→Course→Chapter→Lesson，`CurriculumDoc` 单例文档）
 * - `courses`    = `guitar-ai-audio` 原型前端的「我的课纲」（`Course` 表，章节树存 JSON）
 *
 * 用户明确要求「不改动整体系统结构」，所以没有把原型的数据并进 CMS 那棵树，
 * 而是新建独立资源；将来若要合并，只需在这层做一次映射，不动任何一个前端。
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
