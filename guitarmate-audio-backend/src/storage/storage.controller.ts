import { Controller, Delete, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StorageHealthService } from './storage-health.service';

/**
 * 后端存储体检 / 清理（`uploads/` 下**课程以外**的目录）
 *
 * | 方法 | 路径 | 说明 |
 * |---|---|---|
 * | GET | `/api/storage/health` | 逐目录体检：孤儿文件（无主） + 悬空引用（有主无文件） + 结构性数据缺失 |
 * | DELETE | `/api/storage/orphans?domain=&dryRun=` | 清理某个目录的孤儿（`dryRun=1` 只算不删） |
 *
 * 与课程资产（`/api/curriculum/assets`）是同一套思路的第二个实现：
 * **引用对账（两个方向）→ 体检报告 → 一键清理**，只是这里的「主记录」来自多张表。
 *
 * ⚠️ 清理**只删无主的**：目录名还是某个记录 id 时，目录里的中间产物一律保留；
 * `uploads/demo/`（可按需重算的合成缓存）只报告不删。
 */
@ApiTags('storage')
@Controller('api/storage')
export class StorageController {
  constructor(private readonly storage: StorageHealthService) {}

  @Get('health')
  @ApiOperation({ summary: '存储体检：孤儿文件 / 悬空引用 / 结构性数据缺失' })
  health() {
    return this.storage.audit();
  }

  @Delete('orphans')
  @ApiOperation({ summary: '按目录清理孤儿文件（dryRun=1 只算不删）' })
  @ApiQuery({
    name: 'domain',
    required: true,
    description: 'transcriptions | measures | tab-projects',
  })
  @ApiQuery({ name: 'dryRun', required: false, description: '只统计不删除（dryRun=1）' })
  cleanup(@Query('domain') domain: string, @Query('dryRun') dryRun?: string) {
    return this.storage.cleanup(domain || '', { dryRun: dryRun === '1' });
  }
}
