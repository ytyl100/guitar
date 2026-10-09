import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserGroupsService, parseJsonArray, toJsonArray } from './user-groups.service';
import { isUserGroupCode, USER_GROUP_CODES } from './user-groups.catalog';
import type {
  AssignUserGroupDto,
  BindTeacherDto,
  ImportUsersDto,
  UpdateUserDto,
  UserProfileDto,
} from './dto';

/**
 * 用户 / 权限 / 积分服务
 * =====================
 *
 * 这一层是「① 所有用户组与对应的用户权限体系跟用户资料」的落点，
 * 顺带把与用户强耦合的 **积分账户**（流水 / 预检 / 扣减 / 发放）也放在这里 ——
 * 积分永远改的是用户行 + 一条流水，拆成两个模块只会让事务边界变模糊。
 *
 * 设计要点：
 * 1. **对外形状 = 前端 `UserProfile`**（`serialize()`），字段一个不多一个不少，
 *    前端切数据源时业务代码零改动；
 * 2. **主键用前端原有 id**（见 schema 注释），所以积分流水 / 任务进度 /
 *    学员绑定的外键在迁移后依然对得上；
 * 3. 权限判定一律问 `UserGroupsService`（组级规则只有一份实现）。
 */

/** 角色 → 套餐（前端 `PlanType`），用于 `assignGroup` 时同步 `plan` 字段 */
const ROLE_TO_PLAN: Record<string, string> = {
  super_admin: 'enterprise',
  institution: 'enterprise',
  teacher: 'pro',
  student: 'pro',
  plus: 'plus',
  trial_guest: 'trial',
  registered: 'free',
  anonymous: 'free',
};

/** 积分基准：10 积分 = 1 分钟音频；不足 1 分钟向上取整（规划文档 §四.2） */
export const CREDITS_PER_MINUTE = 10;
export const creditsForAudioSeconds = (seconds: number): number =>
  Math.max(0, Math.ceil(Math.max(0, seconds) / 60)) * CREDITS_PER_MINUTE;

/** 计算下一次积分重置日期（ISO 日期字符串，前端 `creditsCycleResetDate` 用的就是它） */
function nextResetDate(cycle: string): string | undefined {
  const now = new Date();
  if (cycle === 'monthly_1st') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return next.toISOString().split('T')[0];
  }
  if (cycle === 'once') {
    // 14 天试用
    const next = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    return next.toISOString().split('T')[0];
  }
  if (cycle === 'renewal') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));
    return next.toISOString().split('T')[0];
  }
  return undefined;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: UserGroupsService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // 序列化 / 查询
  // ─────────────────────────────────────────────────────────────

  /** DB 行 → 前端 `UserProfile`（形状严格对齐，前端零改动） */
  private serialize(row: any) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isLoggedIn: row.isLoggedIn,
      memberSince: row.memberSince || '',
      plan: row.plan,
      trialActive: row.trialActive,
      trialExpiresAt: row.trialExpiresAt ?? undefined,
      language: row.language,
      credits: row.credits,
      isUnlimitedCredits: row.isUnlimitedCredits,
      monthlyCreditQuota: row.monthlyCreditQuota ?? undefined,
      creditsCycleResetDate: row.creditsCycleResetDate ?? undefined,
      optOutAiTraining: row.optOutAiTraining,
      institutionId: row.institutionId ?? undefined,
      institutionName: row.institutionName ?? undefined,
      teacherId: row.teacherId ?? undefined,
      teacherName: row.teacherName ?? undefined,
      completedLessonsCount: row.completedLessonsCount ?? 0,
      status: row.status,
      phone: row.phone ?? undefined,
      wechat: row.wechat ?? undefined,
      address: row.address ?? undefined,
      bio: row.bio ?? undefined,
    };
  }

  /** 按主键 **或** email 取用户（两个都常被当成「id」传进来） */
  private async resolveRow(idOrEmail: string) {
    const row =
      (await this.prisma.user.findUnique({ where: { id: idOrEmail } })) ||
      (await this.prisma.user.findUnique({ where: { email: idOrEmail } }));
    if (!row) throw new NotFoundException(`用户不存在：${idOrEmail}`);
    return row;
  }

  async list(filters: { role?: string; status?: string; q?: string } = {}) {
    await this.groups.ensureSeeded();
    const where: any = {};
    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      const q = filters.q.trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { institutionName: { contains: q } },
        { teacherName: { contains: q } },
      ];
    }
    const rows = await this.prisma.user.findMany({ where, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.serialize(r));
  }

  async get(id: string) {
    await this.groups.ensureSeeded();
    return this.serialize(await this.resolveRow(id));
  }

  // ─────────────────────────────────────────────────────────────
  // 写入
  // ─────────────────────────────────────────────────────────────

  /** 把 DTO 转成 Prisma 写入数据（含按组补默认权益） */
  private async buildData(dto: UserProfileDto | (UpdateUserDto & { role?: string }), isCreate: boolean) {
    const data: Record<string, unknown> = {};
    const assign = (key: string, value: unknown) => {
      if (value !== undefined) data[key] = value;
    };

    assign('name', dto.name);
    assign('email', dto.email);
    assign('role', dto.role);
    assign('plan', dto.plan);
    assign('status', dto.status);
    assign('isLoggedIn', (dto as UserProfileDto).isLoggedIn);
    assign('memberSince', (dto as UserProfileDto).memberSince);
    assign('trialActive', (dto as UserProfileDto).trialActive);
    assign('trialExpiresAt', (dto as UserProfileDto).trialExpiresAt);
    assign('language', (dto as UserProfileDto).language);
    assign('credits', (dto as UserProfileDto).credits);
    assign('isUnlimitedCredits', (dto as UserProfileDto).isUnlimitedCredits);
    assign('monthlyCreditQuota', (dto as UserProfileDto).monthlyCreditQuota);
    assign('creditsCycleResetDate', (dto as UserProfileDto).creditsCycleResetDate);
    assign('optOutAiTraining', (dto as UserProfileDto).optOutAiTraining);
    assign('institutionId', (dto as UserProfileDto).institutionId);
    assign('institutionName', (dto as UserProfileDto).institutionName);
    assign('teacherId', (dto as UserProfileDto).teacherId);
    assign('teacherName', (dto as UserProfileDto).teacherName);
    assign('completedLessonsCount', (dto as UserProfileDto).completedLessonsCount);
    assign('phone', (dto as UserProfileDto).phone);
    assign('wechat', (dto as UserProfileDto).wechat);
    assign('address', (dto as UserProfileDto).address);
    assign('bio', (dto as UserProfileDto).bio);

    if (dto.role !== undefined) {
      if (!isUserGroupCode(dto.role)) {
        throw new BadRequestException(`未知用户组：${dto.role}（合法值：${USER_GROUP_CODES.join('/')}）`);
      }
      data.groupCode = dto.role;
      const group = await this.groups.get(dto.role);
      if (group) {
        // 只在调用方**没显式传**时才补组默认值，避免覆盖前端的显式设置
        if ((dto as UserProfileDto).plan === undefined) data.plan = ROLE_TO_PLAN[dto.role] ?? 'free';
        if (isCreate && (dto as UserProfileDto).credits === undefined) {
          data.credits = group.isUnlimitedCredits ? 0 : group.defaultCredits;
        }
        if (isCreate && (dto as UserProfileDto).isUnlimitedCredits === undefined) {
          data.isUnlimitedCredits = group.isUnlimitedCredits;
        }
        if (isCreate && (dto as UserProfileDto).monthlyCreditQuota === undefined) {
          data.monthlyCreditQuota = group.isUnlimitedCredits ? undefined : group.defaultCredits;
        }
        if (isCreate && (dto as UserProfileDto).creditsCycleResetDate === undefined) {
          data.creditsCycleResetDate = nextResetDate(group.creditsResetCycle);
        }
      }
    }
    return data;
  }

  async create(dto: UserProfileDto) {
    await this.groups.ensureSeeded();
    const data = await this.buildData(dto, true);
    const id = dto.id || undefined;
    const row = await this.prisma.user.create({
      data: {
        ...(id ? { id } : {}),
        name: String(data.name ?? dto.name),
        email: String(data.email ?? dto.email),
        role: String(data.role ?? dto.role),
        ...data,
      } as any,
    });
    return this.serialize(row);
  }

  /** 局部更新（前端 `updateUserProfile`） */
  async update(id: string, dto: UpdateUserDto) {
    const current = await this.resolveRow(id);
    const data = await this.buildData(dto, false);
    if (Object.keys(data).length === 0) return this.serialize(current);
    const row = await this.prisma.user.update({ where: { id: current.id }, data: data as any });
    return this.serialize(row);
  }

  /**
   * 分配用户组（前端 `updateUserRole` + `assignUserGroup` 合一）。
   *
   * 语义与前端一致：**换组即按新组重算积分/配额**，否则一个注册用户被提为教师后
   * 还是 0 积分，根本没法发布课纲（前端原来的 `updateUserRole` 就是这么重置的）。
   */
  async assignGroup(id: string, dto: AssignUserGroupDto) {
    await this.groups.ensureSeeded();
    const current = await this.resolveRow(id);
    if (!isUserGroupCode(dto.role)) {
      throw new BadRequestException(`未知用户组：${dto.role}`);
    }
    const group = await this.groups.get(dto.role);
    const reset = dto.resetCredits !== false;

    const data: Record<string, unknown> = {
      role: dto.role,
      groupCode: dto.role,
      plan: ROLE_TO_PLAN[dto.role] ?? current.plan,
    };
    if (dto.institutionId !== undefined) data.institutionId = dto.institutionId;
    if (dto.institutionName !== undefined) data.institutionName = dto.institutionName;
    if (dto.teacherId !== undefined) data.teacherId = dto.teacherId;
    if (dto.teacherName !== undefined) data.teacherName = dto.teacherName;

    if (reset && group) {
      data.credits = group.isUnlimitedCredits ? 0 : group.defaultCredits;
      data.isUnlimitedCredits = group.isUnlimitedCredits;
      data.monthlyCreditQuota = group.isUnlimitedCredits ? null : group.defaultCredits;
      data.creditsCycleResetDate = nextResetDate(group.creditsResetCycle) ?? null;
      data.trialActive = dto.role === 'trial_guest';
    }

    const row = await this.prisma.user.update({ where: { id: current.id }, data: data as any });
    this.logger.log(
      `用户组已更新：${row.name}(${row.id}) ${current.role} → ${dto.role}` + (reset ? '（积分已按新组重置）' : ''),
    );
    return this.serialize(row);
  }

  /** 学员绑定教师（前端 `bindStudentToTeacher`） */
  async bindTeacher(studentId: string, dto: BindTeacherDto) {
    const student = await this.resolveRow(studentId);
    const teacher = await this.resolveRow(dto.teacherId);
    const data: Record<string, unknown> = {
      teacherId: teacher.id,
      teacherName: dto.teacherName || teacher.name,
    };
    if (dto.institutionId !== undefined) data.institutionId = dto.institutionId;
    else if (teacher.institutionId) data.institutionId = teacher.institutionId;
    if (dto.institutionName !== undefined) data.institutionName = dto.institutionName;
    else if (teacher.institutionName) data.institutionName = teacher.institutionName;

    const row = await this.prisma.user.update({ where: { id: student.id }, data: data as any });
    return this.serialize(row);
  }

  // ─────────────────────────────────────────────────────────────
  // 可见性（规划文档 §八.3：不同组别看到不同用户信息）
  // ─────────────────────────────────────────────────────────────

  /**
   * 「以某人的身份能看到哪些用户」：
   * - 超管 → 全部
   * - 机构 → 自己 + 旗下教师 + 旗下学员（按 institutionId 归属）
   * - 教师 → 自己 + 名下学员（student.teacherId = 教师 id）
   * - 学员 → 自己 + 挂靠教师
   * - 其余（plus / 试用 / 注册 / 匿名）→ 只有自己
   *
   * ⚠️ 这是**服务端**实现的同一套规则（前端 `getVisibleUsers` 也有），
   * 两边必须一致；将来只保留服务端这一份即可。
   */
  async visible(asUserId: string) {
    await this.groups.ensureSeeded();
    const me = await this.resolveRow(asUserId);
    const group = await this.groups.get(me.role);
    const level = group?.level ?? 99;

    let where: any;
    if (level <= 1) {
      where = {};
    } else if (me.role === 'institution') {
      where = {
        OR: [
          { id: me.id },
          { role: 'teacher', ...(me.institutionId ? { institutionId: me.institutionId } : {}) },
          { role: 'student', ...(me.institutionId ? { institutionId: me.institutionId } : {}) },
        ],
      };
    } else if (me.role === 'teacher') {
      where = { OR: [{ id: me.id }, { role: 'student', teacherId: me.id }] };
    } else if (me.role === 'student') {
      where = me.teacherId ? { OR: [{ id: me.id }, { id: me.teacherId }] } : { id: me.id };
    } else {
      where = { id: me.id };
    }

    const rows = await this.prisma.user.findMany({ where, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return {
      asUser: this.serialize(me),
      asGroup: group,
      total: rows.length,
      users: rows.map((r) => this.serialize(r)),
    };
  }

  /** 关键字 + 角色筛选（前端 `searchUsers`；超管用它找人再分配用户组） */
  async search(q: string, roleFilter?: string) {
    return this.list({ q, role: roleFilter });
  }

  // ─────────────────────────────────────────────────────────────
  // 批量导入（迁移工具用）
  // ─────────────────────────────────────────────────────────────

  /**
   * 幂等批量 upsert。
   *
   * ⚠️ `replaceAll` 只在**迁移脚本**里用（清空重建）；日常调用一律 upsert，
   * 否则一次误传就会把线上用户连带流水一起删掉（`onDelete: Cascade`）。
   */
  async importUsers(dto: ImportUsersDto) {
    await this.groups.ensureSeeded();
    const list = dto.users || [];
    if (!Array.isArray(list) || list.length === 0) {
      throw new BadRequestException('users 不能为空');
    }
    if (dto.replaceAll) {
      const deleted = await this.prisma.user.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${deleted.count} 个用户（含级联流水/进度）`);
    }

    let created = 0;
    let updated = 0;
    for (const raw of list) {
      const data = await this.buildData(raw, true);
      const id = raw.id || undefined;
      const existing = id
        ? await this.prisma.user.findUnique({ where: { id } })
        : await this.prisma.user.findUnique({ where: { email: raw.email } });
      if (existing) {
        // 已存在：只覆盖传进来的字段（不重置积分等运行期数据，除非 DTO 里带上了）
        await this.prisma.user.update({ where: { id: existing.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.user.create({
          data: {
            ...(id ? { id } : {}),
            name: raw.name,
            email: raw.email,
            role: raw.role,
            ...data,
          } as any,
        });
        created++;
      }
    }
    this.logger.log(`用户导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, users: await this.list() };
  }

  // ─────────────────────────────────────────────────────────────
  // 积分账户（与用户强耦合，故同模块）
  // ─────────────────────────────────────────────────────────────

  /** 预检：余额是否够本次消耗（规划文档 §四.3 的门禁） */
  async checkCredits(userId: string, requiredCredits: number) {
    const row = await this.resolveRow(userId);
    if (row.isUnlimitedCredits) {
      return { hasEnough: true, currentCredits: row.credits, shortage: 0, unlimited: true };
    }
    const shortage = Math.max(0, requiredCredits - row.credits);
    return { hasEnough: shortage === 0, currentCredits: row.credits, shortage, unlimited: false };
  }

  /** 扣减 + 记流水（在同一事务里，保证「余额」与「流水」永远对得上） */
  async deductCredits(userId: string, amount: number, description: string, type = 'transcription') {
    const row = await this.resolveRow(userId);
    if (amount <= 0) throw new BadRequestException('扣减积分必须为正数');
    if (row.isUnlimitedCredits) {
      return { success: true, newBalance: row.credits, unlimited: true };
    }
    if (row.credits < amount) {
      return {
        success: false,
        newBalance: row.credits,
        shortage: amount - row.credits,
        unlimited: false,
      };
    }
    const newBalance = row.credits - amount;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.id }, data: { credits: newBalance } }),
      this.prisma.creditTransaction.create({
        data: { userId: row.id, amount: -amount, type, description, balanceAfter: newBalance },
      }),
    ]);
    return { success: true, newBalance, unlimited: false };
  }

  /** 发放 + 记流水 */
  async grantCredits(userId: string, amount: number, description: string, type = 'admin_grant') {
    const row = await this.resolveRow(userId);
    if (amount <= 0) throw new BadRequestException('发放积分必须为正数');
    const newBalance = row.isUnlimitedCredits ? row.credits : row.credits + amount;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.id }, data: { credits: newBalance } }),
      this.prisma.creditTransaction.create({
        data: { userId: row.id, amount, type, description, balanceAfter: newBalance },
      }),
    ]);
    return { success: true, newBalance, unlimited: row.isUnlimitedCredits };
  }

  /**
   * 追加一条积分流水（幂等，按 `id` upsert）。
   *
   * 为什么需要这个端点：`guitar-ai-audio` 的 `deductCredits`/`grantCredits` 是**同步**方法
   * （调用点拿着返回值立刻渲染），余额已经通过 `POST /api/users/import` 写进库了，
   * 但那条**流水**原来只落在 localStorage 里 —— 于是「余额对、账本空」。
   * 这里按前端生成的 `tx_xxx` id 幂等写入，重试不会造出重复流水。
   */
  async recordTransaction(dto: {
    id?: string;
    userId: string;
    amount: number;
    type: string;
    description: string;
    balanceAfter: number;
    createdAt?: string;
  }) {
    const row = await this.resolveRow(dto.userId);
    const created = dto.createdAt ? new Date(dto.createdAt) : undefined;
    const data = {
      userId: row.id,
      amount: dto.amount,
      type: dto.type,
      description: dto.description,
      balanceAfter: dto.balanceAfter,
      ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created } : {}),
    };

    const saved = dto.id
      ? await this.prisma.creditTransaction.upsert({
          where: { id: dto.id },
          create: { id: dto.id, ...data },
          update: data,
        })
      : await this.prisma.creditTransaction.create({ data });

    return {
      id: saved.id,
      userId: saved.userId,
      amount: saved.amount,
      type: saved.type,
      description: saved.description,
      balanceAfter: saved.balanceAfter,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /** 积分流水（可按用户过滤；不再像前端那样截断到 100 条） */
  async creditTransactions(userId?: string, limit = 200) {
    const rows = await this.prisma.creditTransaction.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(1000, Math.max(1, limit)),
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: r.amount,
      type: r.type,
      description: r.description,
      balanceAfter: r.balanceAfter,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** 学员任务进度（`Record<itemId, boolean>`，与前端同形） */
  async taskProgress(userId: string): Promise<Record<string, boolean>> {
    const row = await this.resolveRow(userId);
    const rows = await this.prisma.userTaskProgress.findMany({ where: { userId: row.id } });
    return rows.reduce<Record<string, boolean>>((acc, r) => {
      acc[r.itemId] = r.completed;
      return acc;
    }, {});
  }

  async setTaskCompleted(userId: string, itemId: string, completed = true) {
    const row = await this.resolveRow(userId);
    await this.prisma.userTaskProgress.upsert({
      where: { userId_itemId: { userId: row.id, itemId } },
      create: { userId: row.id, itemId, completed },
      update: { completed },
    });
    return this.taskProgress(row.id);
  }

  /** 暴露给其它模块的权限判断 */
  async hasPermission(userId: string, permission: string) {
    const row = await this.resolveRow(userId);
    const overrides = parseJsonArray(row.permissionOverrides);
    if (overrides.includes(permission) || overrides.includes('*')) return true;
    return this.groups.hasPermission(row.role, permission);
  }

  /** 权限覆盖（预留的单用户例外） */
  async setPermissionOverrides(userId: string, permissions: string[]) {
    const row = await this.resolveRow(userId);
    await this.prisma.user.update({
      where: { id: row.id },
      data: { permissionOverrides: toJsonArray(permissions) },
    });
    return this.get(row.id);
  }
}
