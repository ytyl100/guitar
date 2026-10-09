import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { USER_GROUP_SEEDS, USER_GROUP_CODES, type UserGroupSeed } from './user-groups.catalog';
import type { UpdateUserGroupDto } from './dto';

/**
 * 用户组服务（角色 / 权限 / 权益额度）
 * ===================================
 *
 * 职责：
 * 1. **播种**：首次启动时把 `USER_GROUP_SEEDS` 写进库（幂等，且**不覆盖**已有记录 ——
 *    超管在线改过权限矩阵后，重启不能把它冲回默认值）；
 * 2. 读写：列表 / 单个 / 更新（JSON 字段的序列化集中在这里）。
 */

/** 组对外形状：JSON 字段已解析成数组（前端可直接用） */
export interface UserGroupView extends Omit<UserGroupSeed, 'visibleGroupCodes' | 'permissions' | 'exportFormats'> {
  visibleGroupCodes: string[];
  permissions: string[];
  exportFormats: string[];
}

/** JSON 字符串 → 数组（容错：脏数据不抛异常，返回 []） */
export const parseJsonArray = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
};

/** 数组 → JSON 字符串 */
export const toJsonArray = (value: unknown): string => JSON.stringify(Array.isArray(value) ? value : []);

@Injectable()
export class UserGroupsService {
  private readonly logger = new Logger(UserGroupsService.name);
  private seeded = false;

  constructor(private readonly prisma: PrismaService) {}

  /** 幂等播种：缺失的组补上；已存在的**不动**（保留超管的在线修改） */
  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    let created = 0;
    for (const seed of USER_GROUP_SEEDS) {
      const existing = await this.prisma.userGroup.findUnique({ where: { code: seed.code } });
      if (existing) continue;
      await this.prisma.userGroup.create({
        data: {
          code: seed.code,
          name: seed.name,
          level: seed.level,
          description: seed.description,
          visibleGroupCodes: toJsonArray(seed.visibleGroupCodes),
          permissions: toJsonArray(seed.permissions),
          maxTranscriptionSeconds: seed.maxTranscriptionSeconds,
          lockedMeasures: seed.lockedMeasures,
          cloudLibraryLimit: seed.cloudLibraryLimit,
          exportFormats: toJsonArray(seed.exportFormats),
          curriculumRights: seed.curriculumRights,
          curriculumPublishCost: seed.curriculumPublishCost,
          defaultCredits: seed.defaultCredits,
          creditsResetCycle: seed.creditsResetCycle,
          isUnlimitedCredits: seed.isUnlimitedCredits,
          creditRecoveryAmount: seed.creditRecoveryAmount,
          isSystem: true,
          orderIndex: seed.orderIndex,
        },
      });
      created++;
    }
    this.seeded = true;
    if (created > 0) this.logger.log(`用户组已播种：新增 ${created} 个（共 ${USER_GROUP_SEEDS.length} 个内置组）`);
  }

  private toView(row: any): UserGroupView {
    return {
      code: row.code,
      name: row.name,
      level: row.level,
      description: row.description || '',
      visibleGroupCodes: parseJsonArray(row.visibleGroupCodes),
      permissions: parseJsonArray(row.permissions),
      maxTranscriptionSeconds: row.maxTranscriptionSeconds,
      lockedMeasures: row.lockedMeasures,
      cloudLibraryLimit: row.cloudLibraryLimit,
      exportFormats: parseJsonArray(row.exportFormats),
      curriculumRights: row.curriculumRights,
      curriculumPublishCost: row.curriculumPublishCost,
      defaultCredits: row.defaultCredits,
      creditsResetCycle: row.creditsResetCycle,
      isUnlimitedCredits: row.isUnlimitedCredits,
      creditRecoveryAmount: row.creditRecoveryAmount,
      orderIndex: row.orderIndex,
    } as UserGroupView;
  }

  async list(): Promise<UserGroupView[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.userGroup.findMany({ orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }] });
    return rows.map((r) => this.toView(r));
  }

  /** 取组（找不到时返回内置目录里的那一份，保证「未知 role」也有兜底权益） */
  async get(code: string): Promise<UserGroupView | null> {
    await this.ensureSeeded();
    const row = await this.prisma.userGroup.findUnique({ where: { code } });
    if (row) return this.toView(row);
    const fallback = USER_GROUP_SEEDS.find((s) => s.code === code);
    return fallback ? ({ ...fallback } as UserGroupView) : null;
  }

  /** 组 code → level（可见性比较用）；未知组返回 99（最低） */
  async levelOf(code: string): Promise<number> {
    const group = await this.get(code);
    return group?.level ?? 99;
  }

  async update(code: string, patch: UpdateUserGroupDto): Promise<UserGroupView> {
    await this.ensureSeeded();
    if (!(USER_GROUP_CODES as readonly string[]).includes(code)) {
      throw new BadRequestException(`未知用户组 code：${code}`);
    }
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.level !== undefined) data.level = patch.level;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.visibleGroupCodes !== undefined) data.visibleGroupCodes = toJsonArray(patch.visibleGroupCodes);
    if (patch.permissions !== undefined) data.permissions = toJsonArray(patch.permissions);
    if (patch.maxTranscriptionSeconds !== undefined) data.maxTranscriptionSeconds = patch.maxTranscriptionSeconds;
    if (patch.lockedMeasures !== undefined) data.lockedMeasures = patch.lockedMeasures;
    if (patch.cloudLibraryLimit !== undefined) data.cloudLibraryLimit = patch.cloudLibraryLimit;
    if (patch.exportFormats !== undefined) data.exportFormats = toJsonArray(patch.exportFormats);
    if (patch.curriculumRights !== undefined) data.curriculumRights = patch.curriculumRights;
    if (patch.curriculumPublishCost !== undefined) data.curriculumPublishCost = patch.curriculumPublishCost;
    if (patch.defaultCredits !== undefined) data.defaultCredits = patch.defaultCredits;
    if (patch.creditsResetCycle !== undefined) data.creditsResetCycle = patch.creditsResetCycle;
    if (patch.isUnlimitedCredits !== undefined) data.isUnlimitedCredits = patch.isUnlimitedCredits;
    if (patch.creditRecoveryAmount !== undefined) data.creditRecoveryAmount = patch.creditRecoveryAmount;

    if (Object.keys(data).length === 0) {
      const current = await this.get(code);
      if (!current) throw new BadRequestException(`未知用户组 code：${code}`);
      return current;
    }
    const row = await this.prisma.userGroup.update({ where: { code }, data });
    return this.toView(row);
  }

  /** 权限判断（供其它模块复用）：`hasPermission(role, 'curriculum:publish')` */
  async hasPermission(code: string, permission: string): Promise<boolean> {
    const group = await this.get(code);
    if (!group) return false;
    return group.permissions.includes('*') || group.permissions.includes(permission);
  }
}
