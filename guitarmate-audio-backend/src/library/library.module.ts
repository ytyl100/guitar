import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';

/**
 * 音频乐谱库模块（需求 (3)）
 *
 * 与 `PublishedModule`（`/api/published/library`，小程序读的已发布练习题）
 * 和 `ScoresModule`（`/api/scores`，CMS 管理端）并存，各管一段：
 * 本模块给 `guitar-ai-audio` 的曲库页提供「带完整乐谱的曲库条目」。
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
