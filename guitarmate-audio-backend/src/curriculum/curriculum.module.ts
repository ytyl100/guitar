import { Module } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumAssetsService } from './curriculum-assets.service';
import { CurriculumTranscodeService } from './curriculum-transcode.service';

/**
 * 课程大纲模块
 *
 * 只依赖全局 `PrismaModule`（`app.module.ts` 里已 import，且 PrismaService 是全局 provider），
 * 因此这里不需要再 exports 什么给别的模块用。
 */
@Module({
  controllers: [CurriculumController],
  providers: [CurriculumService, CurriculumAssetsService, CurriculumTranscodeService],
  exports: [CurriculumService, CurriculumAssetsService],
})
export class CurriculumModule {}
