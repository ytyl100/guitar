import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportPricingPlansDto, PricingPlanDto, UpdatePricingPlanDto } from './dto';

/**
 * 定价方案 —— 需求 (4)
 * ===================
 *
 * 原先硬编码在前端 `types/pricing.ts` 的 `PRICING_PLANS`。
 *
 * ⚠️ 这份数据**早就该在库里**：改一次价格要发一次前端版本，
 * 而且「套餐权益」跟后端 `UserGroup` 里的权益矩阵（`maxTranscriptionSeconds` /
 * `cloudLibraryLimit` / `exportFormats` …，见 `user-groups.catalog.ts`）必须对得上。
 * 现在两个都进库了，谁也不能再各改各的 —— 运营改价格/权益时，
 * **定价页（本模块）与用户组权益（`/api/user-groups`）要一起改**，
 * 否则会出现「页面写着导出 MIDI，实际账号没这个权限」。
 */
@Injectable()
export class PricingPlansService {
  private readonly logger = new Logger(PricingPlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** DB 行 → 前端 `PricingPlan`（形状严格对齐） */
  private serialize(row: any) {
    return {
      id: row.id,
      planTier: row.planTier,
      title: row.title,
      subtitle: row.subtitle,
      badge: row.badge ?? undefined,
      isPopular: row.isPopular,
      priceMonthly: row.priceMonthly,
      priceYearly: row.priceYearly,
      priceMonthlyNum: row.priceMonthlyNum,
      priceYearlyNum: row.priceYearlyNum,
      periodMonthly: row.periodMonthly,
      periodYearly: row.periodYearly,
      savingsBadge: row.savingsBadge ?? undefined,
      maxSingleTranscriptionDuration: row.maxSingleTranscriptionDuration,
      monthlyCredits: row.monthlyCredits,
      equivalentAudioMinutes: row.equivalentAudioMinutes,
      exportFormats: row.exportFormats,
      curriculumAccess: row.curriculumAccess,
      aiModelTrainingPrivacy: row.aiModelTrainingPrivacy,
      supportLevel: row.supportLevel,
      ctaText: row.ctaText,
      ctaVariant: row.ctaVariant,
      orderIndex: row.orderIndex,
    };
  }

  private buildData(dto: UpdatePricingPlanDto, isCreate: boolean) {
    const d: any = {};
    const put = (k: keyof UpdatePricingPlanDto) => {
      if (dto[k] !== undefined) d[k as string] = dto[k];
    };
    put('planTier');
    put('title');
    put('subtitle');
    put('badge');
    put('isPopular');
    put('priceMonthly');
    put('priceYearly');
    put('priceMonthlyNum');
    put('priceYearlyNum');
    put('periodMonthly');
    put('periodYearly');
    put('savingsBadge');
    put('maxSingleTranscriptionDuration');
    put('monthlyCredits');
    put('equivalentAudioMinutes');
    put('exportFormats');
    put('curriculumAccess');
    put('aiModelTrainingPrivacy');
    put('supportLevel');
    put('ctaText');
    put('ctaVariant');
    put('orderIndex');
    if (isCreate) {
      d.title = dto.title ?? '未命名套餐';
      d.planTier = dto.planTier ?? '';
      d.ctaVariant = dto.ctaVariant ?? 'secondary';
    }
    return d;
  }

  /** 按 `orderIndex` 升序 —— 定价页从上到下的顺序就是它 */
  async list() {
    const rows = await this.prisma.pricingPlan.findMany({ orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }] });
    return rows.map((r) => this.serialize(r));
  }

  async get(id: string) {
    const row = await this.prisma.pricingPlan.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`定价方案不存在：${id}`);
    return this.serialize(row);
  }

  async create(dto: PricingPlanDto) {
    if (!dto.id) throw new BadRequestException('定价方案必须给 id（free/plus/pro/enterprise 之一）');
    const created = await this.prisma.pricingPlan.create({
      data: { id: dto.id, ...(this.buildData(dto, true) as any) } as any,
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdatePricingPlanDto) {
    await this.get(id);
    const updated = await this.prisma.pricingPlan.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.pricingPlan.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** 批量导入（迁移脚本）。数组顺序 = 定价页顺序，故归一化 `orderIndex`。 */
  async importPlans(dto: ImportPricingPlansDto) {
    const list = dto.plans || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('plans 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.pricingPlan.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 个定价方案`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`plans[${i}] 缺少 id`);
      const data = this.buildData(raw, true);
      data.orderIndex = raw.orderIndex ?? i;
      const exists = await this.prisma.pricingPlan.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.pricingPlan.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.pricingPlan.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`定价方案导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, plans: await this.list() };
  }
}
