import { PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 课纲 / 教学视频 / 和弦组合 的请求 DTO
 * ===================================
 *
 * ⚠️ **第一原则：字段一个都不能漏。**
 * 全局 `ValidationPipe` 开了 `whitelist: true` —— **没有在 DTO 里声明过的字段会被静默剥掉**，
 * 不报错、不警告。所以迁移类接口一旦漏写一个字段，表现就是「保存成功但封面/章节全没了」。
 * 下面的字段列表是照着 `guitar-ai-audio/src/types/curriculum.ts` 逐个对出来的。
 *
 * ⚠️ `chapters` / `cuePoints` / `versionHistory` 这类**整块 JSON 不递归校验**：
 * 它们的形状由前端 `CourseChapter[]` 等类型保证，服务端只当不透明 JSON 存取。
 * 递归校验（`@ValidateNested` + `@Type`）看着更严格，实际会在前端新增一个字段时
 * 直接 400 拒绝保存 —— 那是比丢字段更难受的故障模式。
 */

/** 课程（前端 `CourseCurriculum`） */
export class CourseDto {
  /** 业务 id（如 `course_001`）；不传则由服务端生成 */
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsInt() @Min(0) totalLessons?: number;
  @IsOptional() @IsString() totalHours?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsString() institutionId?: string;
  @IsOptional() @IsString() institutionName?: string;
  @IsOptional() @IsBoolean() isSystemBasic?: boolean;
  @IsOptional() @IsBoolean() isFree?: boolean;
  /** published | draft | archived */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() version?: string;
  /** JSON：`CourseVersionHistory[]` */
  @IsOptional() @IsArray() versionHistory?: any[];
  @IsOptional() @IsInt() orderIndex?: number;
  /** JSON：`CourseChapter[]`（含 `items`） */
  @IsOptional() @IsArray() chapters?: any[];
}

/** PATCH 用：全部字段可选（`PartialType` 会保留上面的校验装饰器） */
export class UpdateCourseDto extends PartialType(CourseDto) {}

/** 教学视频（前端 `TeachingVideo`） */
export class TeachingVideoDto {
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsString() durationFormatted?: string;
  @IsOptional() @IsString() associatedCourseId?: string;
  @IsOptional() @IsString() associatedCourseTitle?: string;
  /** JSON：`VideoCuePoint[]` */
  @IsOptional() @IsArray() cuePoints?: any[];
  /** published | draft */
  @IsOptional() @IsString() status?: string;
  /** link | upload */
  @IsOptional() @IsString() videoSourceType?: string;
}
export class UpdateTeachingVideoDto extends PartialType(TeachingVideoDto) {}

/** 和弦组合（前端 `ChordDrillCombination`） */
export class ChordDrillDto {
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  /** JSON：`string[]`，如 `["C","G","Am","F"]` */
  @IsOptional() @IsArray() chords?: any[];
  @IsOptional() @IsInt() @Min(1) bpmStart?: number;
  @IsOptional() @IsInt() @Min(1) bpmTarget?: number;
  /** JSON：`number[]` BPM 阶梯，如 `[60,80,100,120]` */
  @IsOptional() @IsArray() steps?: any[];
  @IsOptional() @IsString() description?: string;
  /** published | draft */
  @IsOptional() @IsString() status?: string;
  /**
   * 前端是 ISO 字符串（`new Date().toISOString()`）。
   * 库里是 `DateTime`，故「写进去」和「读出来」各转一次；这里收下以防 whitelist 剥掉。
   */
  @IsOptional() @IsString() createdAt?: string;
}
export class UpdateChordDrillDto extends PartialType(ChordDrillDto) {}

/**
 * 批量导入（迁移脚本 + 「把另一套环境的数据推过来」两用）。
 *
 * `replaceAll` **只给迁移脚本用**：它会清空整张表。
 * 日常同步一律 upsert —— 否则一次误传就能把线上课纲抹掉。
 */
export class ImportCoursesDto {
  @IsArray() courses!: CourseDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
  /**
   * 乐观锁（可选）：`{ [courseId]: "2026-10-05T..." }`。
   * 传了才校验 —— 库里该记录的 `updatedAt` 与它不一致就 409，
   * 防止「本机旧快照整份覆盖」把别人的改动冲掉（典型 last-write-wins 事故）。
   */
  @IsOptional() baseUpdatedAt?: Record<string, string>;
}

export class ImportVideosDto {
  @IsArray() videos!: TeachingVideoDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

export class ImportDrillsDto {
  @IsArray() drills!: ChordDrillDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

/** 发布课程：版本号规则由服务端统一（见 `nextVersion()`） */
export class PublishCourseDto {
  @IsOptional() @IsString() versionNote?: string;
  @IsOptional() @IsString() author?: string;
}

export class RollbackCourseDto {
  @IsString() targetVersion!: string;
}
