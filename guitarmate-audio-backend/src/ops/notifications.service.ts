import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportNotificationsDto, NotificationDto, UpdateNotificationDto } from './dto';

/**
 * 站内通知 —— 需求 (4)
 * ===================
 *
 * 原先存在 localStorage `guitarmate_notifications_list_v1`（见 `NotificationBell.tsx`），
 * 而「通知」这种东西**本来就不该按浏览器存在本机** —— 换台电脑就看不到自己的通知，
 * 而这正是通知功能存在的意义。现在落到库里。
 *
 * ⚠️ `timeAgo`（"2 小时前"）和 `timestamp`（"2026-10-04 14:30"）都是**字符串**，
 * 由前端生成后原样入库、原样返回。
 * 不要试图用 `createdAt` 去"算"出 `timeAgo`：那是把展示逻辑搬到服务端，
 * 前端一旦想改文案（"2 小时前" vs "2h ago"）就得改后端。
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** DB 行 → 前端 `AppNotification`（形状严格对齐） */
  private serialize(row: any) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      summary: row.summary,
      content: row.content,
      timeAgo: row.timeAgo,
      timestamp: row.timestamp,
      isRead: row.isRead,
      tag: row.tag ?? undefined,
      author: row.author ?? undefined,
      scoreId: row.scoreId ?? undefined,
      courseId: row.courseId ?? undefined,
    };
  }

  private buildData(dto: UpdateNotificationDto, isCreate: boolean) {
    const d: any = {};
    const put = (k: keyof UpdateNotificationDto) => {
      if (dto[k] !== undefined) d[k as string] = dto[k];
    };
    put('type');
    put('title');
    put('summary');
    put('content');
    put('tag');
    put('author');
    put('scoreId');
    put('courseId');
    put('isRead');
    put('timeAgo');
    put('timestamp');
    if (isCreate) {
      d.type = dto.type ?? 'system';
      d.title = dto.title ?? '未命名通知';
      d.summary = dto.summary ?? '';
      d.content = dto.content ?? '';
      d.timeAgo = dto.timeAgo ?? '刚刚';
      d.timestamp = dto.timestamp ?? new Date().toISOString();
    }
    return d;
  }

  async list(filters: { isRead?: boolean; type?: string; q?: string } = {}) {
    const where: any = {};
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.type) where.type = filters.type;
    if (filters.q) {
      where.OR = [{ title: { contains: filters.q } }, { summary: { contains: filters.q } }];
    }
    /** 新的在前 —— 前端通知面板就是这个顺序，保持一致才不会"读完刷新顺序变了" */
    const rows = await this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
    return rows.map((r) => this.serialize(r));
  }

  async get(id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`通知不存在：${id}`);
    return this.serialize(row);
  }

  /** 未读数（前端铃铛上的角标） */
  async unreadCount() {
    const count = await this.prisma.notification.count({ where: { isRead: false } });
    return { unread: count };
  }

  async create(dto: NotificationDto) {
    const created = await this.prisma.notification.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...(this.buildData(dto, true) as any) } as any,
    });
    return this.serialize(created);
  }

  async upsert(id: string, dto: UpdateNotificationDto) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) return this.create({ ...dto, id } as NotificationDto);
    const updated = await this.prisma.notification.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async update(id: string, dto: UpdateNotificationDto) {
    await this.get(id);
    const updated = await this.prisma.notification.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.notification.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** 全部标记已读（前端「一键已读」） */
  async markAllRead() {
    const res = await this.prisma.notification.updateMany({ data: { isRead: true } });
    this.logger.log(`通知全部标记已读：${res.count} 条`);
    return { updated: res.count, notifications: await this.list() };
  }

  async importItems(dto: ImportNotificationsDto) {
    const list = dto.items || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('items 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.notification.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 条通知`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`items[${i}] 缺少 id`);
      const data = this.buildData(raw, true);
      const exists = await this.prisma.notification.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.notification.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.notification.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`通知导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, notifications: await this.list() };
  }
}
