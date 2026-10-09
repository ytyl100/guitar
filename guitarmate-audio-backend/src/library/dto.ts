import { PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 曲库条目 DTO —— 需求 (3)
 *
 * ⚠️ 字段一个不能漏：全局 `ValidationPipe` 开了 `whitelist: true`，
 * 没声明的字段会被**静默丢弃**（不报错）。下面的字段列表照着
 * `guitar-ai-audio/src/data/libraryData.ts` 的 `TranscriptionItem` 对出来。
 *
 * 命名提醒：前端把「正式解锁/试听」叫 `type`，库里叫 `accessType`
 * （`type` 在数据库设计里太容易被占用）。序列化时由服务端做双向映射，
 * 前端拿到的仍然是 `type`。
 */
export class LibraryItemDto {
  /** 业务 id（如 `macaroon-5`）；不传则服务端生成 */
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() coverUrl?: string;
  /** Acoustic Guitar | Electric Guitar | Classical Guitar | Bass */
  @IsOptional() @IsString() instrument?: string;
  /** system = 平台曲库 | user = 用户上传 */
  @IsOptional() @IsString() category?: string;
  /** unlocked | trial（前端字段名就是 `type`） */
  @IsOptional() @IsString() type?: string;
  /** JSON：`string[]` */
  @IsOptional() @IsArray() badges?: any[];
  @IsOptional() @IsInt() @Min(0) tempo?: number;
  @IsOptional() @IsString() keySignature?: string;
  @IsOptional() @IsInt() @Min(0) capo?: number;
  @IsOptional() @IsNumber() durationSeconds?: number;
  @IsOptional() @IsBoolean() isFavorite?: boolean;
  /** 日期字符串（'2026-09-30'），前端按它排序 */
  @IsOptional() @IsString() createdAt?: string;
  /** 归属用户（用户上传的曲库条目） */
  @IsOptional() @IsString() ownerUserId?: string;
  /**
   * 交叉引用：对应的已发布 `Score` id（可空）。
   *
   * ⚠️ **不是数据来源**，见 `schema.prisma` 里 `LibraryItem.scoreId` 的说明：
   * 同名乐谱的转录内容可能不同，前端读的是 `score` 那份 JSON。
   */
  @IsOptional() @IsString() scoreId?: string;
  /**
   * **乐谱本体**（前端 `ScoreData` 的整份 JSON）。
   *
   * 类型写成 `any` 是刻意的：这份 JSON 的形状由前端 `types/music.ts` 保证，
   * 服务端只做不透明存取。加 `@ValidateNested` 反而会在前端新增字段时直接 400，
   * 让「保存一次乐谱」变成会失败的写操作。
   */
  @IsOptional() score?: any;
}

export class UpdateLibraryItemDto extends PartialType(LibraryItemDto) {}

export class ImportLibraryItemsDto {
  @IsArray() items!: LibraryItemDto[];
  /** ⚠️ 只给迁移脚本用：会清空整张表 */
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}
