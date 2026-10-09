import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UsersService, creditsForAudioSeconds } from './users.service';
import {
  AssignUserGroupDto,
  BindTeacherDto,
  CreateUserDto,
  ImportUsersDto,
  UpdateUserDto,
} from './dto';

/** 积分预检 / 扣减 / 发放的小 DTO（写成本地 class，whitelist 才会生效） */
class CreditsCheckDto {
  @IsOptional() @IsInt() @Min(0) requiredCredits?: number;
  /** 也可以直接给音频时长（秒），服务端按 10 积分/分钟换算 */
  @IsOptional() @IsInt() @Min(0) audioSeconds?: number;
}
class CreditsAmountDto {
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsInt() @Min(0) audioSeconds?: number;
  @IsString() description!: string;
  @IsOptional() @IsString() type?: string;
}
class TaskProgressDto {
  @IsString() itemId!: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}

/**
 * 追加积分流水（幂等）。前端 `saveCreditTransaction` 用。
 * `id` 由调用方给（`tx_xxx`），同一个 id 重试不会造出重复流水。
 */
class RecordTransactionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() userId!: string;
  @IsInt() amount!: number;
  @IsString() type!: string;
  @IsString() description!: string;
  @IsInt() balanceAfter!: number;
  @IsOptional() @IsString() createdAt?: string;
}

/**
 * 用户 / 用户组 / 积分 API
 * =======================
 *
 * 这是「需求 (1) 用户组与权限体系 + 用户资料」的对外接口，
 * 也是**可复用**的：`guitar-ai-audio`、微信小程序、将来的管理端都用这一套。
 *
 * | 方法 | 路径 | 说明 |
 * |---|---|---|
 * | GET    | `/api/users` | 列表（`?role=&status=&q=`） |
 * | GET    | `/api/users/visible?asUserId=` | **按组层级可见的用户范围**（规划文档 §八.3） |
 * | GET    | `/api/users/search?q=&role=` | 关键字 + 角色筛选（超管找人再分配组） |
 * | GET    | `/api/users/:id` | 单个（id 或 email 都接受） |
 * | POST   | `/api/users` | 新建 |
 * | PATCH  | `/api/users/:id` | 局部更新（含机构资料/地址/联系方式） |
 * | PATCH  | `/api/users/:id/role` | **分配用户组**（换组并按新组重算积分/配额） |
 * | POST   | `/api/users/:id/bind-teacher` | 学员绑定教师 |
 * | POST   | `/api/users/import` | **批量导入**（迁移工具用，幂等 upsert） |
 * | GET    | `/api/users/:id/task-progress` | 任务完成状态 `Record<itemId, boolean>` |
 * | POST   | `/api/users/:id/task-progress` | 标记某个课时完成 |
 * | GET    | `/api/user-groups` | 用户组 + 权限矩阵 + 权益额度 |
 * | PUT    | `/api/user-groups/:code` | 调整组的权限/额度（超管） |
 * | POST   | `/api/users/:id/credits/{check,deduct,grant}` | 积分预检 / 扣减 / 发放 |
 *
 * ⚠️ 本期**不做登录校验**（决策 A，与后端其它接口一致：CORS `*`、无守卫）。
 * 因此 `visible` 需要显式传 `asUserId` —— 等接入鉴权后应改为从会话取。
 *
 * ⚠️ 路由顺序：`/visible`、`/search`、`/import` 这类**静态段**必须声明在 `/:id` 之前，
 * 否则会被 `:id` 抢先匹配（Nest 按声明顺序注册）。
 */
@ApiTags('users')
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: '用户列表（可按角色 / 状态 / 关键字过滤）' })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'q', required: false })
  list(@Query('role') role?: string, @Query('status') status?: string, @Query('q') q?: string) {
    return this.users.list({ role, status, q });
  }

  @Get('visible')
  @ApiOperation({ summary: '按用户组层级可见的用户范围（超管看全部 → 机构看旗下 → 教师看学员 → 学员看教师）' })
  @ApiQuery({ name: 'asUserId', required: true, description: '以谁的身份查看（接入鉴权后改为从会话取）' })
  visible(@Query('asUserId') asUserId: string) {
    return this.users.visible(asUserId);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索用户（关键字 + 角色）' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'role', required: false })
  search(@Query('q') q: string, @Query('role') role?: string) {
    return this.users.search(q || '', role);
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入用户（迁移工具用；幂等 upsert，replaceAll 会清空重建）' })
  import(@Body() dto: ImportUsersDto) {
    return this.users.importUsers(dto);
  }

  @Get('credits/transactions')
  @ApiOperation({ summary: '积分流水（全部，可按 ?userId= 过滤）' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  allTransactions(@Query('userId') userId?: string, @Query('limit') limit?: string) {
    return this.users.creditTransactions(userId, limit ? Number(limit) : undefined);
  }

  @Post('credits/transactions')
  @ApiOperation({
    summary: '追加一条积分流水（幂等，按 id upsert）',
    description:
      '给「前端自己算余额、再写穿透」的调用方用：余额走 POST /api/users/import，' +
      '流水走这里，两边都不会重复。缺 id 时由服务端生成。',
  })
  recordTransaction(@Body() dto: RecordTransactionDto) {
    return this.users.recordTransaction(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情（id 或 email）' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @ApiOperation({ summary: '新建用户' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: '分配用户组（换组并按新组重算积分 / 配额 / 套餐）' })
  assignRole(@Param('id') id: string, @Body() dto: AssignUserGroupDto) {
    return this.users.assignGroup(id, dto);
  }

  @Post(':id/bind-teacher')
  @ApiOperation({ summary: '学员绑定教师（可选带机构归属）' })
  bindTeacher(@Param('id') id: string, @Body() dto: BindTeacherDto) {
    return this.users.bindTeacher(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '局部更新用户资料' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Get(':id/task-progress')
  @ApiOperation({ summary: '学员任务完成状态' })
  taskProgress(@Param('id') id: string) {
    return this.users.taskProgress(id);
  }

  @Post(':id/task-progress')
  @ApiOperation({ summary: '标记课时完成状态，返回最新进度' })
  setTaskProgress(@Param('id') id: string, @Body() dto: TaskProgressDto) {
    return this.users.setTaskCompleted(id, dto.itemId, dto.completed !== false);
  }

  @Get(':id/credits/transactions')
  @ApiOperation({ summary: '积分流水（按用户；可选 limit）' })
  transactions(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.users.creditTransactions(id, limit ? Number(limit) : undefined);
  }

  @Post(':id/credits/check')
  @ApiOperation({ summary: '积分预检（规划文档 §四.3 门禁）' })
  @ApiBody({ type: CreditsCheckDto })
  checkCredits(@Param('id') id: string, @Body() dto: CreditsCheckDto) {
    const required = dto.requiredCredits ?? creditsForAudioSeconds(dto.audioSeconds ?? 0);
    return this.users.checkCredits(id, required);
  }

  @Post(':id/credits/deduct')
  @ApiOperation({ summary: '扣减积分并记流水（余额不足返回 success:false + shortage）' })
  @ApiBody({ type: CreditsAmountDto })
  deduct(@Param('id') id: string, @Body() dto: CreditsAmountDto) {
    const amount = dto.amount ?? creditsForAudioSeconds(dto.audioSeconds ?? 0);
    return this.users.deductCredits(id, amount, dto.description, dto.type || 'transcription');
  }

  @Post(':id/credits/grant')
  @ApiOperation({ summary: '发放积分并记流水' })
  @ApiBody({ type: CreditsAmountDto })
  grant(@Param('id') id: string, @Body() dto: CreditsAmountDto) {
    const amount = dto.amount ?? creditsForAudioSeconds(dto.audioSeconds ?? 0);
    return this.users.grantCredits(id, amount, dto.description, dto.type || 'admin_grant');
  }
}
