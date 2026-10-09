import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 用户 / 用户组 DTO
 * =================
 *
 * ⚠️ 全部写成 **class** 而不是 interface：
 * 全局 `ValidationPipe({ whitelist: true })` 只对 class 生效
 * （见仓库既有坑：`BarreInputDto` 写成 interface 导致 `barres` 被静默剥掉）。
 *
 * 字段跟 `guitar-ai-audio/src/types/auth.ts#UserProfile` **一一对应**，
 * 这样前端切换数据源时不需要改任何业务代码。
 */

/** 与前端 `UserProfile` 同形。`id` 可由客户端指定（迁移时传前端原有 id，保证外键不断） */
export class UserProfileDto {
  /** 前端原有的业务 id（`DEMO_USERS` 的 key）；不传则后端生成 */
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isLoggedIn?: boolean;

  @IsOptional()
  @IsString()
  memberSince?: string;

  @IsOptional()
  @IsBoolean()
  trialActive?: boolean;

  @IsOptional()
  @IsString()
  trialExpiresAt?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  credits?: number;

  @IsOptional()
  @IsBoolean()
  isUnlimitedCredits?: boolean;

  @IsOptional()
  @IsInt()
  monthlyCreditQuota?: number;

  @IsOptional()
  @IsString()
  creditsCycleResetDate?: string;

  @IsOptional()
  @IsBoolean()
  optOutAiTraining?: boolean;

  @IsOptional()
  @IsString()
  institutionId?: string;

  @IsOptional()
  @IsString()
  institutionName?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsInt()
  completedLessonsCount?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  wechat?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}

/** 创建用户：必填项与 `UserProfileDto` 一致 */
export class CreateUserDto extends UserProfileDto {}

/** 局部更新：全部可选（前端 `updateUserProfile(userId, Partial<UserProfile>)`） */
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() isLoggedIn?: boolean;
  @IsOptional() @IsString() memberSince?: string;
  @IsOptional() @IsBoolean() trialActive?: boolean;
  @IsOptional() @IsString() trialExpiresAt?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsInt() credits?: number;
  @IsOptional() @IsBoolean() isUnlimitedCredits?: boolean;
  @IsOptional() @IsInt() monthlyCreditQuota?: number;
  @IsOptional() @IsString() creditsCycleResetDate?: string;
  @IsOptional() @IsBoolean() optOutAiTraining?: boolean;
  @IsOptional() @IsString() institutionId?: string;
  @IsOptional() @IsString() institutionName?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsInt() completedLessonsCount?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() wechat?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() bio?: string;
}

/**
 * 分配用户组（前端 `updateUserRole` + `assignUserGroup` 合并成一个接口）。
 *
 * 语义：换组 → 按新组的 `defaultCredits` / `creditsResetCycle` 重算积分与配额，
 * 并写入机构/教师归属。`institutionName`/`teacherName` 允许前端直接传（省一次查询）。
 */
export class AssignUserGroupDto {
  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsOptional() @IsString() institutionId?: string;
  @IsOptional() @IsString() institutionName?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() teacherName?: string;
  /** 换组时是否重算积分（默认 true） */
  @IsOptional() @IsBoolean() resetCredits?: boolean;
}

/** 学员绑定教师（前端 `bindStudentToTeacher`） */
export class BindTeacherDto {
  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsString() institutionId?: string;
  @IsOptional() @IsString() institutionName?: string;
}

/** 批量导入（把前端本地数据一次性搬进库；幂等 upsert） */
export class ImportUsersDto {
  @IsArray()
  users!: UserProfileDto[];

  /** true = 清空后重建（仅迁移工具用；默认 false 只 upsert） */
  @IsOptional()
  @IsBoolean()
  replaceAll?: boolean;
}

/** 用户组目录更新（超管调权限矩阵） */
export class UpdateUserGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() visibleGroupCodes?: string[];
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsInt() @Min(0) maxTranscriptionSeconds?: number;
  @IsOptional() @IsInt() @Min(0) lockedMeasures?: number;
  @IsOptional() @IsInt() @Min(0) cloudLibraryLimit?: number;
  @IsOptional() @IsArray() exportFormats?: string[];
  @IsOptional() @IsString() curriculumRights?: string;
  @IsOptional() @IsInt() @Min(0) curriculumPublishCost?: number;
  @IsOptional() @IsInt() @Min(0) defaultCredits?: number;
  @IsOptional() @IsString() creditsResetCycle?: string;
  @IsOptional() @IsBoolean() isUnlimitedCredits?: boolean;
  @IsOptional() @IsInt() @Min(0) creditRecoveryAmount?: number;
  @IsOptional() @IsObject() map?: Record<string, unknown>;
}
