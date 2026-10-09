import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseLeadDto, ImportEnterpriseLeadsDto, UpdateEnterpriseLeadDto } from './dto';

/**
 * 企业版线索 —— 需求 (4)
 * =====================
 *
 * 来源：定价页「联系我们」表单（`ContactUsModal.tsx`），原先存 localStorage
 * `guitarmate_backend_enterprise_leads_v1`。
 *
 * ⚠️ 这是**销售线索**：存在浏览器里等于「换个业务员打开后台就看不到这单」。
 * 落库之后 `/api/enterprise-leads` 也能被 CRM / 小程序里发给销售，
 * 这才是这个接口真正的价值。
 */
@Injectable()
export class EnterpriseLeadsService {
  private readonly logger = new Logger(EnterpriseLeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: any) {
    return {
      id: row.id,
      fullName: row.fullName,
      workEmail: row.workEmail,
      companyName: row.companyName,
      monthlyMinutes: row.monthlyMinutes,
      useCases: this.parseJson<string[]>(row.useCases, []),
      notes: row.notes ?? undefined,
      createdAt: row.createdLabel || row.createdAt?.toISOString?.() || '',
      status: row.status as 'new' | 'contacted' | 'negotiating' | 'closed',
    };
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private buildData(dto: UpdateEnterpriseLeadDto, isCreate: boolean) {
    const d: any = {};
    const put = (k: keyof UpdateEnterpriseLeadDto) => {
      if (dto[k] !== undefined) d[k as string] = dto[k];
    };
    put('fullName');
    put('workEmail');
    put('companyName');
    put('monthlyMinutes');
    put('notes');
    put('status');
    if (dto.useCases !== undefined) d.useCases = JSON.stringify(dto.useCases);
    if (dto.createdAt !== undefined) {
      d.createdLabel = dto.createdAt;
      const parsed = new Date(dto.createdAt);
      if (!Number.isNaN(parsed.getTime())) d.createdAt = parsed;
    }
    if (isCreate) {
      d.fullName = dto.fullName ?? '未填写';
      d.status = dto.status ?? 'new';
      if (d.useCases === undefined) d.useCases = '[]';
      if (d.createdLabel === undefined) {
        d.createdLabel = new Date().toISOString();
      }
    }
    return d;
  }

  async list(filters: { status?: string; q?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      where.OR = [
        { fullName: { contains: filters.q } },
        { companyName: { contains: filters.q } },
        { workEmail: { contains: filters.q } },
      ];
    }
    const rows = await this.prisma.enterpriseLead.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
    return rows.map((r) => this.serialize(r));
  }

  async get(id: string) {
    const row = await this.prisma.enterpriseLead.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`企业线索不存在：${id}`);
    return this.serialize(row);
  }

  /** 提交线索（前端表单用这个）。已存在同邮箱的**未关闭**线索时返回那条，避免重复录入。 */
  async create(dto: EnterpriseLeadDto) {
    const dup = await this.prisma.enterpriseLead.findFirst({
      where: { workEmail: dto.workEmail, status: { not: 'closed' } },
      orderBy: { createdAt: 'desc' },
    });
    if (dup) {
      this.logger.warn(`同一邮箱重复提交线索，返回已有记录：${dto.workEmail} (${dup.id})`);
      return this.serialize(dup);
    }
    const created = await this.prisma.enterpriseLead.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...(this.buildData(dto, true) as any) } as any,
    });
    this.logger.log(`企业线索已提交：${created.id} ${created.companyName}`);
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateEnterpriseLeadDto) {
    await this.get(id);
    const updated = await this.prisma.enterpriseLead.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.enterpriseLead.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** 按状态汇总（销售看板） */
  async stats() {
    const rows = await this.prisma.enterpriseLead.findMany({ select: { status: true } });
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return { total: rows.length, byStatus };
  }

  async importItems(dto: ImportEnterpriseLeadsDto) {
    const list = dto.items || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('items 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.enterpriseLead.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 条企业线索`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`items[${i}] 缺少 id`);
      const data = this.buildData(raw, true);
      const exists = await this.prisma.enterpriseLead.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.enterpriseLead.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        // 迁移/同步走 upsert，**不套用 create 的查重逻辑** ——
        // 否则同一批里两个同邮箱的条目会被静默合并，迁移就"丢数据"了。
        await this.prisma.enterpriseLead.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`企业线索导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, leads: await this.list() };
  }
}
