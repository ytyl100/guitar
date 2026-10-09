import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserGroupsService } from './user-groups.service';
import { UpdateUserGroupDto } from './dto';

/**
 * 用户组 / 权限矩阵 API
 * ====================
 *
 * 数据来自 `user-groups.catalog.ts`（首次访问自动播种 8 个内置组），
 * 权限矩阵逐条对齐 `docs/USER_ROLES_PERMISSIONS_ROADMAP.md` §六。
 *
 * | 方法 | 路径 | 说明 |
 * |---|---|---|
 * | GET | `/api/user-groups` | 全部用户组（含 permissions / 权益额度） |
 * | GET | `/api/user-groups/:code` | 单个用户组 |
 * | PUT | `/api/user-groups/:code` | 调整权限 / 额度（超管用；不做鉴权，见 controller 注释） |
 *
 * 其它端（小程序 / 新前端）可以直接用这份矩阵做 UI 门禁：
 * `permissions.includes('score:export')`、`maxTranscriptionSeconds`、`lockedMeasures`…
 */
@ApiTags('users')
@Controller('api/user-groups')
export class UserGroupsController {
  constructor(private readonly groups: UserGroupsService) {}

  @Get()
  @ApiOperation({ summary: '全部用户组（含权限清单与权益额度）' })
  list() {
    return this.groups.list();
  }

  @Get(':code')
  @ApiOperation({ summary: '单个用户组' })
  @ApiParam({ name: 'code', description: 'super_admin | institution | teacher | student | plus | trial_guest | registered | anonymous' })
  get(@Param('code') code: string) {
    return this.groups.get(code);
  }

  @Put(':code')
  @ApiOperation({ summary: '更新用户组（权限 / 可见范围 / 权益额度）' })
  update(@Param('code') code: string, @Body() dto: UpdateUserGroupDto) {
    return this.groups.update(code, dto);
  }
}
