import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserGroupsService } from './user-groups.service';
import { UsersController } from './users.controller';
import { UserGroupsController } from './user-groups.controller';

/**
 * 用户 / 用户组 / 权限 / 积分模块
 *
 * 只依赖全局 `PrismaModule`（`PrismaService` 是全局 provider），
 * 与 `CurriculumModule` 同一约定。
 *
 * `exports` 出两个 service —— 别的模块（课纲发布要扣 15 积分、录音转录要预检余额）
 * 需要直接注入它们，而不是绕一圈再发一次 HTTP。
 */
@Module({
  controllers: [UsersController, UserGroupsController],
  providers: [UsersService, UserGroupsService],
  exports: [UsersService, UserGroupsService],
})
export class UsersModule {}
