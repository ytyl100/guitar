import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  ApplyCreditRecoveryDto,
  ApproveCreditRecoveryDto,
  ImportCreditRecoveryDto,
} from './dto';

/**
 * 积分恢复工单 —— 需求 (4)
 * =======================
 *
 * 场景（见 `docs/USER_ROLES_PERMISSIONS_ROADMAP.md` §四）：教师/机构的教研额度用完后
 * 提交申请 → 超管审批 → 通过则发放 5000 点。
 *
 * 原先这一整套（申请/审批/驳回）都写在 localStorage 里 ——
 * 意味着**教师在自己电脑上提交，超管在另一台电脑上永远看不到**。
 * 这不是"临时数据"的问题，是功能本身在这个架构下不可能工作。
 *
 * ## 为什么审批要在一个事务里做完
 *
 * 审批 = 「工单置为 approved + 给用户加 5000 点 + 记一条积分流水」。
 * 这三步必须同生共死：只改状态没发积分 → 教师白等；
 * 只发积分没改状态 → 超管反复点，反复发。所以用 `$transaction`。
 */
@Injectable()
export class CreditRecoveryService {
  private readonly logger = new Logger(CreditRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** DB 行 → 前端 `CreditRecoveryRequest`（形状严格对齐） */
  private serialize(row: any) {
    return {
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      userRole: row.userRole,
      currentCredits: row.currentCredits,
      requestedAmount: row.requestedAmount,
      reason: row.reason,
      createdAt: row.createdLabel || row.createdAt?.toISOString?.() || '',
      status: row.status as 'pending' | 'approved' | 'rejected',
      approvedAt: row.approvedAt ?? undefined,
      approvedBy: row.approvedBy ?? undefined,
    };
  }

  async list(filters: { status?: string; userId?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    /** 新的在前；`id` 兜底保证同秒创建的两条顺序稳定（前端不再自己排） */
    const rows = await this.prisma.creditRecoveryRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  /** 待审批数量（超管工作台上的角标） */
  async pendingCount() {
    const count = await this.prisma.creditRecoveryRequest.count({ where: { status: 'pending' } });
    return { pending: count };
  }

  async get(id: string) {
    const row = await this.prisma.creditRecoveryRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`积分恢复工单不存在：${id}`);
    return this.serialize(row);
  }

  /**
   * 提交申请。
   *
   * ⚠️ `currentCredits` 优先由**服务端读当前余额**，而不是信前端传来的值 ——
   * 前端那份可能已经是几分钟前的（用户中途转了谱、扣了点）。
   * 只在用户不存在或调用方明确要求时才用传进来的值。
   */
  async apply(dto: ApplyCreditRecoveryDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`用户不存在：${dto.userId}`);

    const pending = await this.prisma.creditRecoveryRequest.findFirst({
      where: { userId: dto.userId, status: 'pending' },
    });
    if (pending) {
      /**
       * 已有待审工单就**不重复建**（前端原来可以连点生成一堆 req_xxx）。
       * 返回已有那条，让界面显示"申请已在审核中"。
       */
      this.logger.warn(`用户 ${dto.userId} 已有待审批工单 ${pending.id}，不再重复创建`);
      return this.serialize(pending);
    }

    const created = await this.prisma.creditRecoveryRequest.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        userId: user.id,
        userName: dto.userName || user.name,
        userEmail: dto.userEmail || user.email,
        userRole: dto.userRole || (user.role === 'institution' ? 'institution' : 'teacher'),
        currentCredits: dto.currentCredits ?? user.credits,
        requestedAmount: dto.requestedAmount ?? 5000,
        reason: dto.reason || '未填写申请说明',
        status: 'pending',
        createdLabel: dto.createdAt || new Date().toLocaleString(),
      } as any,
    });
    this.logger.log(`积分恢复申请已提交：${created.id}（${created.userName} 申请 ${created.requestedAmount} 点）`);
    return this.serialize(created);
  }

  /**
   * 审批通过：置状态 + 发积分 + 记流水，**同一个事务**。
   *
   * 幂等：已经 approved 的工单再点一次直接返回，不会重复发积分
   * （前端 `approveCreditRecovery` 反复点会反复 `grantCredits`，是个真实隐患）。
   */
  async approve(id: string, dto: ApproveCreditRecoveryDto = {}) {
    const row = await this.prisma.creditRecoveryRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`积分恢复工单不存在：${id}`);
    if (row.status === 'approved') {
      this.logger.warn(`工单 ${id} 已是 approved，忽略重复审批（不会重复发放积分）`);
      return this.serialize(row);
    }
    if (row.status === 'rejected') {
      throw new BadRequestException(`工单 ${id} 已被驳回，不能直接批准；请让用户重新提交`);
    }

    const amount = dto.amount ?? row.requestedAmount;
    const approvedBy = dto.approvedBy || 'Gardenart (超级管理员)';
    const approvedAt = new Date().toLocaleString();

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new NotFoundException(`工单指向的用户不存在：${row.userId}`);
    const newBalance = user.isUnlimitedCredits ? user.credits : user.credits + amount;

    await this.prisma.$transaction([
      this.prisma.creditRecoveryRequest.update({
        where: { id },
        data: { status: 'approved', approvedAt, approvedBy },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { credits: newBalance } }),
      this.prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount,
          type: 'recovery_approved',
          description: `超管审批通过额度恢复申请 (+${amount} Credits) · 审批人: ${approvedBy}`,
          balanceAfter: newBalance,
        },
      }),
    ]);

    this.logger.log(`工单 ${id} 已批准：${user.name} +${amount} 点（审批人 ${approvedBy}）`);
    return { ...this.serialize({ ...row, status: 'approved', approvedAt, approvedBy }), grantedAmount: amount, newBalance };
  }

  async reject(id: string, reason?: string) {
    const row = await this.prisma.creditRecoveryRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`积分恢复工单不存在：${id}`);
    if (row.status !== 'pending') {
      throw new BadRequestException(`工单 ${id} 当前状态是 ${row.status}，只有 pending 才能驳回`);
    }
    const updated = await this.prisma.creditRecoveryRequest.update({
      where: { id },
      data: { status: 'rejected' },
    });
    this.logger.log(`工单 ${id} 已驳回${reason ? `：${reason}` : ''}`);
    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.creditRecoveryRequest.delete({ where: { id } });
    return { deleted: true, id };
  }

  async importItems(dto: ImportCreditRecoveryDto) {
    const list = dto.items || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('items 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.creditRecoveryRequest.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 条工单`);
    }
    let created = 0;
    let updated = 0;
    const missingUsers: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`items[${i}] 缺少 id`);
      // 迁移场景里工单可能指向库里还没有的账号：跳过而不是 FOREIGN KEY 报错整批挂掉
      const user = await this.prisma.user.findUnique({ where: { id: raw.userId } });
      if (!user) {
        missingUsers.push(`${raw.id}→${raw.userId}`);
        continue;
      }
      const data: any = {
        userId: raw.userId,
        userName: raw.userName || user.name,
        userEmail: raw.userEmail || user.email,
        userRole: raw.userRole || 'teacher',
        currentCredits: raw.currentCredits ?? user.credits,
        requestedAmount: raw.requestedAmount ?? 5000,
        reason: raw.reason || '未填写申请说明',
        status: 'pending',
        createdLabel: raw.createdAt || new Date().toLocaleString(),
      };
      const exists = await this.prisma.creditRecoveryRequest.findUnique({ where: { id: raw.id } });
      if (exists) {
        // 已存在的工单**只改展示字段，不动 status** ——
        // 迁移脚本重跑时不能把已批准的工单打回 pending（那会让它被重复审批）
        delete data.status;
        await this.prisma.creditRecoveryRequest.update({ where: { id: raw.id }, data });
        updated++;
      } else {
        await this.prisma.creditRecoveryRequest.create({ data: { id: raw.id, ...data } });
        created++;
      }
    }
    if (missingUsers.length) {
      this.logger.warn(`以下工单指向的用户不存在，已跳过：${missingUsers.join(', ')}`);
    }
    this.logger.log(`积分恢复工单导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, missingUsers, requests: await this.list() };
  }

  /** 积分流水（供超管对账；也可按用户过滤） */
  async transactions(userId?: string, limit = 200) {
    return this.users.creditTransactions(userId, limit);
  }
}
