import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { EnterpriseLeadsService } from './enterprise-leads.service';
import { PricingPlansService } from './pricing-plans.service';
import { CreditRecoveryService } from './credit-recovery.service';
import {
  ApplyCreditRecoveryDto,
  ApproveCreditRecoveryDto,
  EnterpriseLeadDto,
  ImportCreditRecoveryDto,
  ImportEnterpriseLeadsDto,
  ImportNotificationsDto,
  ImportPricingPlansDto,
  NotificationDto,
  PricingPlanDto,
  UpdateEnterpriseLeadDto,
  UpdateNotificationDto,
  UpdatePricingPlanDto,
} from './dto';

/**
 * 运营域 API —— 需求 (4)
 * =====================
 *
 * 四个资源合成一个模块（而不是四个模块）：它们都是「展示/运营内容」，
 * 共用一个 Prisma 依赖，拆成四个模块只会多出四份样板。
 *
 * ⚠️ **静态段路由（`import` / `unread-count` / `mark-all-read` / `pending-count` / `stats`）
 * 必须写在 `:id` 之前** —— Nest 按声明顺序匹配，否则会被当成 id。
 */

// ══════════════════════════════════════════════════════════════
// 站内通知
// ══════════════════════════════════════════════════════════════

@ApiTags('notifications')
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '通知列表（新的在前）' })
  @ApiQuery({ name: 'isRead', required: false, description: 'true/false 只看已读/未读' })
  @ApiQuery({ name: 'type', required: false, description: 'feedback | score_update | drill_award | system' })
  @ApiQuery({ name: 'q', required: false })
  list(@Query('isRead') isRead?: string, @Query('type') type?: string, @Query('q') q?: string) {
    return this.service.list({ isRead: isRead === undefined ? undefined : isRead === 'true', type, q });
  }

  @Get('unread-count')
  @ApiOperation({ summary: '未读数（铃铛角标）' })
  unreadCount() {
    return this.service.unreadCount();
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入通知（迁移/环境同步）' })
  importItems(@Body() dto: ImportNotificationsDto) {
    return this.service.importItems(dto);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: '全部标记已读' })
  markAllRead() {
    return this.service.markAllRead();
  }

  @Post()
  @ApiOperation({ summary: '新建通知' })
  create(@Body() dto: NotificationDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '单条通知' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '整份覆盖保存（不存在则新建）' })
  upsert(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.service.upsert(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '局部更新（例如标记已读 isRead）' })
  update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ══════════════════════════════════════════════════════════════
// 积分恢复工单
// ══════════════════════════════════════════════════════════════

@ApiTags('credit-recovery')
@Controller('api/credit-recovery-requests')
export class CreditRecoveryController {
  constructor(private readonly service: CreditRecoveryService) {}

  @Get()
  @ApiOperation({ summary: '工单列表', description: '教师/机构查自己的，超管查全部' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | approved | rejected' })
  @ApiQuery({ name: 'userId', required: false })
  list(@Query('status') status?: string, @Query('userId') userId?: string) {
    return this.service.list({ status, userId });
  }

  @Get('pending-count')
  @ApiOperation({ summary: '待审批数量（超管工作台角标）' })
  pendingCount() {
    return this.service.pendingCount();
  }

  @Get('transactions')
  @ApiOperation({ summary: '积分流水（对账用；也可用 /api/users/:id/credits/transactions）' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  transactions(@Query('userId') userId?: string, @Query('limit') limit?: string) {
    return this.service.transactions(userId, limit ? Number(limit) : undefined);
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入工单（迁移；不会把已批准的工单打回 pending）' })
  importItems(@Body() dto: ImportCreditRecoveryDto) {
    return this.service.importItems(dto);
  }

  @Post()
  @ApiOperation({ summary: '提交额度恢复申请', description: '同一用户已有待审工单时返回那条已有工单，不重复创建' })
  apply(@Body() dto: ApplyCreditRecoveryDto) {
    return this.service.apply(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '单条工单' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '审批通过（置状态 + 发积分 + 记流水，同一事务；重复调用不会重复发放）' })
  approve(@Param('id') id: string, @Body() dto: ApproveCreditRecoveryDto) {
    return this.service.approve(id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回（只有 pending 可以驳回）' })
  reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.reject(id, body?.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除工单' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ══════════════════════════════════════════════════════════════
// 企业版线索
// ══════════════════════════════════════════════════════════════

@ApiTags('enterprise-leads')
@Controller('api/enterprise-leads')
export class EnterpriseLeadsController {
  constructor(private readonly service: EnterpriseLeadsService) {}

  @Get()
  @ApiOperation({ summary: '线索列表（销售后台用）' })
  @ApiQuery({ name: 'status', required: false, description: 'new | contacted | negotiating | closed' })
  @ApiQuery({ name: 'q', required: false })
  list(@Query('status') status?: string, @Query('q') q?: string) {
    return this.service.list({ status, q });
  }

  @Get('stats')
  @ApiOperation({ summary: '按状态汇总' })
  stats() {
    return this.service.stats();
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入线索（迁移；不套用查重逻辑，避免同批次被静默合并）' })
  importItems(@Body() dto: ImportEnterpriseLeadsDto) {
    return this.service.importItems(dto);
  }

  @Post()
  @ApiOperation({ summary: '提交线索（定价页表单）', description: '同邮箱已有未关闭线索时返回那条，避免重复录入' })
  create(@Body() dto: EnterpriseLeadDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '单条线索' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新线索（改状态/补备注）' })
  update(@Param('id') id: string, @Body() dto: UpdateEnterpriseLeadDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除线索' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ══════════════════════════════════════════════════════════════
// 定价方案
// ══════════════════════════════════════════════════════════════

@ApiTags('pricing-plans')
@Controller('api/pricing-plans')
export class PricingPlansController {
  constructor(private readonly service: PricingPlansService) {}

  @Get()
  @ApiOperation({ summary: '定价方案列表（按 orderIndex 升序 = 定价页从上到下）' })
  list() {
    return this.service.list();
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入定价方案（迁移；数组顺序 = 展示顺序）' })
  importPlans(@Body() dto: ImportPricingPlansDto) {
    return this.service.importPlans(dto);
  }

  @Post()
  @ApiOperation({ summary: '新建定价方案' })
  create(@Body() dto: PricingPlanDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '单个定价方案' })
  @ApiParam({ name: 'id', description: 'free | plus | pro | enterprise' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '更新定价方案',
    description: '⚠️ 改这里的权益时，记得同步 /api/user-groups 里的权益矩阵，否则页面与账号权限会不一致',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePricingPlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除定价方案' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
