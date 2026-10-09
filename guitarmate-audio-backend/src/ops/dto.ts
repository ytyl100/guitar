import { PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 运营域 DTO —— 需求 (4)
 * ====================
 *
 * 覆盖：站内通知 / 积分恢复工单 / 企业版线索 / 定价方案。
 *
 * ⚠️ 老规矩：全局 `ValidationPipe` 开了 `whitelist: true`，
 * **没在这里声明的字段会被静默丢掉**（不报错）。字段列表是照着
 * `guitar-ai-audio/src/types/pricing.ts`、`types/notification.ts` 逐个对出来的。
 */

// ─────────────────────────────────────────
// 站内通知（前端 `AppNotification`）
// ─────────────────────────────────────────

export class NotificationDto {
  @IsOptional() @IsString() id?: string;
  /** feedback | score_update | drill_award | system */
  @IsString() type!: string;
  @IsString() title!: string;
  @IsString() summary!: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsString() scoreId?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsBoolean() isRead?: boolean;
  /** 展示用相对时间（"2 小时前"）——前端直接显示，服务端不反推 */
  @IsOptional() @IsString() timeAgo?: string;
  /** 绝对时间字符串（前端原样用于排序） */
  @IsOptional() @IsString() timestamp?: string;
}
export class UpdateNotificationDto extends PartialType(NotificationDto) {}

export class ImportNotificationsDto {
  @IsArray() items!: NotificationDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

// ─────────────────────────────────────────
// 积分恢复工单（前端 `CreditRecoveryRequest`）
// ─────────────────────────────────────────

export class ApplyCreditRecoveryDto {
  /** 缺省由服务端生成（前端格式是 `req_${Date.now()}`） */
  @IsOptional() @IsString() id?: string;
  @IsString() userId!: string;
  @IsOptional() @IsString() userName?: string;
  @IsOptional() @IsString() userEmail?: string;
  /** teacher | institution（不传则按用户当前用户组推断） */
  @IsOptional() @IsString() userRole?: string;
  /** 不传则由服务端读用户当前余额（更准，避免拿着过期的余额去申请） */
  @IsOptional() @IsInt() @Min(0) currentCredits?: number;
  @IsOptional() @IsInt() @Min(1) requestedAmount?: number;
  @IsString() reason!: string;
  /** 展示原文，见 `CreditRecoveryRequest.createdLabel` */
  @IsOptional() @IsString() createdAt?: string;
}

export class ApproveCreditRecoveryDto {
  @IsOptional() @IsString() approvedBy?: string;
  /** 要发放的积分；缺省用工单上的 `requestedAmount` */
  @IsOptional() @IsInt() @Min(1) amount?: number;
}

export class ImportCreditRecoveryDto {
  @IsArray() items!: ApplyCreditRecoveryDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

// ─────────────────────────────────────────
// 企业版线索（前端 `EnterpriseLead`）
// ─────────────────────────────────────────

export class EnterpriseLeadDto {
  @IsOptional() @IsString() id?: string;
  @IsString() fullName!: string;
  @IsString() @IsEmail({}, { message: 'workEmail 必须是合法邮箱' }) workEmail!: string;
  @IsString() companyName!: string;
  @IsOptional() @IsString() monthlyMinutes?: string;
  /** JSON：`string[]` 使用场景 */
  @IsOptional() @IsArray() useCases?: any[];
  @IsOptional() @IsString() notes?: string;
  /** new | contacted | negotiating | closed */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() createdAt?: string;
}
export class UpdateEnterpriseLeadDto extends PartialType(EnterpriseLeadDto) {}

export class ImportEnterpriseLeadsDto {
  @IsArray() items!: EnterpriseLeadDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}

// ─────────────────────────────────────────
// 定价方案（前端 `PRICING_PLANS`）
// ─────────────────────────────────────────

export class PricingPlanDto {
  /** free | plus | pro | enterprise */
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() planTier?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsBoolean() isPopular?: boolean;
  @IsOptional() @IsString() priceMonthly?: string;
  @IsOptional() @IsString() priceYearly?: string;
  /** ⚠️ 小数（9.99）不是整数，用 IsNumber 不是 IsInt */
  @IsOptional() @IsNumber() priceMonthlyNum?: number;
  @IsOptional() @IsNumber() priceYearlyNum?: number;
  @IsOptional() @IsString() periodMonthly?: string;
  @IsOptional() @IsString() periodYearly?: string;
  @IsOptional() @IsString() savingsBadge?: string;
  @IsOptional() @IsString() maxSingleTranscriptionDuration?: string;
  @IsOptional() @IsString() monthlyCredits?: string;
  @IsOptional() @IsString() equivalentAudioMinutes?: string;
  @IsOptional() @IsString() exportFormats?: string;
  @IsOptional() @IsString() curriculumAccess?: string;
  @IsOptional() @IsString() aiModelTrainingPrivacy?: string;
  @IsOptional() @IsString() supportLevel?: string;
  @IsOptional() @IsString() ctaText?: string;
  /** secondary | primary | pro | enterprise */
  @IsOptional() @IsString() ctaVariant?: string;
  @IsOptional() @IsInt() orderIndex?: number;
}
export class UpdatePricingPlanDto extends PartialType(PricingPlanDto) {}

export class ImportPricingPlansDto {
  @IsArray() plans!: PricingPlanDto[];
  @IsOptional() @IsBoolean() replaceAll?: boolean;
}
