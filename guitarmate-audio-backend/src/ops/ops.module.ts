import { Module } from '@nestjs/common';
import {
  CreditRecoveryController,
  EnterpriseLeadsController,
  NotificationsController,
  PricingPlansController,
} from './ops.controller';
import { NotificationsService } from './notifications.service';
import { EnterpriseLeadsService } from './enterprise-leads.service';
import { PricingPlansService } from './pricing-plans.service';
import { CreditRecoveryService } from './credit-recovery.service';
import { UsersModule } from '../users/users.module';

/**
 * 运营域模块 —— 需求 (4)
 * =====================
 *
 * 站内通知 / 积分恢复工单 / 企业版线索 / 定价方案。
 *
 * ⚠️ `imports: [UsersModule]` 是**真的需要**：积分恢复工单审批通过时要发积分、
 * 记流水，直接复用 `UsersService`（不要再发一次内部 HTTP —— 那样就丢掉了
 * 「置状态 + 发积分」放在同一个数据库事务里的能力，会出现「批准了但没到账」）。
 */
@Module({
  imports: [UsersModule],
  controllers: [
    NotificationsController,
    CreditRecoveryController,
    EnterpriseLeadsController,
    PricingPlansController,
  ],
  providers: [NotificationsService, CreditRecoveryService, EnterpriseLeadsService, PricingPlansService],
  exports: [NotificationsService, CreditRecoveryService, EnterpriseLeadsService, PricingPlansService],
})
export class OpsModule {}
