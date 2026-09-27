import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageHealthService } from './storage-health.service';

/**
 * 后端存储体检（`uploads/` 下课程以外的目录）
 *
 * 为什么要单独一个模块：这里的归属规则来自 `Project / TranscribeTrack / Score / Track / MeasureTrack`
 * **多张表**，跟课程域（一份 JSON 文档说了算）完全不是一回事；塞进任何一个已有 service 都会让它变成上帝类。
 * 依赖只有 `PrismaService`（全局模块）与文件系统。
 */
@Module({
  controllers: [StorageController],
  providers: [StorageHealthService],
  exports: [StorageHealthService],
})
export class StorageModule {}
