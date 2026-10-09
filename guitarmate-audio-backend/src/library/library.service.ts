import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportLibraryItemsDto, LibraryItemDto, UpdateLibraryItemDto } from './dto';

/**
 * 音频乐谱库 —— 需求 (3)
 * =====================
 *
 * 数据来源：`guitar-ai-audio/src/data/libraryData.ts` 的 `INITIAL_LIBRARY_ITEMS`
 * （原先只存在于前端源码里，切换浏览器/用户就看不到了）。
 *
 * ## 与既有 `Score` 链路的关系（**重要，别搞混**）
 *
 * 库里已有 `Score`（+`Track`/`Measure`/`PracticePackage`）这套「真实转录流水线」的产物，
 * 也有 `/api/published/library` 给小程序读。本模块**不替换**它，而是并存：
 *
 * | 谁 | 读什么 | 说明 |
 * |---|---|---|
 * | `guitar-ai-audio` 前端 | `GET /api/library`（本模块） | 返回条目的**完整 `ScoreData`**，一字不改 |
 * | 微信小程序 / C 端 | `GET /api/published/library` | 读已发布工程（小节级） |
 * | CMS | `/api/scores` | 管理端 |
 *
 * 为什么不把前端改成读 `Score`：**同名乐谱的内容并不相同** ——
 * 库里 `Macaroon 5` 是 86 小节/1371 音符，前端那份是 30 小节/86 音符；
 * `Laid Back Guitars` 库里 100 小节、前端 4 小节。
 * 真按曲名挂过去，用户点开练习的谱子会当场变样 —— 那是改变现有功能。
 * 所以前端那份 `ScoreData` 原样存进 `LibraryItem.scoreJson`，
 * 同时用可空的 `scoreId` 记下「对应哪份已发布乐谱」，供跨端引用与将来合并。
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `'2026-09-30'` → `Date`（无效值返回 undefined，绝不写进去一个 Invalid Date） */
  private parseDate(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /** DB 行 → 前端 `TranscriptionItem`（形状严格对齐，前端零改动） */
  private serialize(row: any, withScore = true) {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      artist: row.artist,
      coverUrl: row.coverUrl,
      instrument: row.instrument,
      category: row.category,
      /** ⚠️ 库里叫 accessType，前端叫 type —— 这里换回来 */
      type: row.accessType,
      badges: this.parseJson<string[]>(row.badges, []),
      tempo: row.tempo,
      keySignature: row.keySignature,
      capo: row.capo,
      durationSeconds: row.durationSeconds,
      createdAt: row.createdLabel || row.createdAt?.toISOString?.().split('T')[0] || '',
      isFavorite: row.isFavorite,
      ownerUserId: row.ownerUserId ?? undefined,
      /** 交叉引用（可空），前端不读，但别的端/将来的合并需要 */
      scoreId: row.scoreId ?? undefined,
      /**
       * 乐谱本体：整份 `ScoreData`。
       * `withScore=false` 时**字段不出现**（而不是给 null）——
       * 避免调用方误以为"这首没有乐谱"，它只是这次没要。
       */
      ...(withScore ? { score: this.parseJson<any>(row.scoreJson, undefined) } : {}),
    };
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** DTO → DB 数据（`undefined` 一律不覆盖，便于 PATCH） */
  private buildData(dto: UpdateLibraryItemDto, isCreate: boolean) {
    const d: any = {};
    const put = (key: keyof UpdateLibraryItemDto) => {
      if (dto[key] !== undefined) d[key as string] = dto[key];
    };
    put('title');
    put('subtitle');
    put('artist');
    put('coverUrl');
    put('instrument');
    put('category');
    put('badges');
    put('tempo');
    put('keySignature');
    put('capo');
    put('durationSeconds');
    put('isFavorite');
    put('ownerUserId');
    put('scoreId');

    // 前端字段名 → 库字段名
    if (dto.type !== undefined) d.accessType = dto.type;
    if (dto.badges !== undefined) d.badges = JSON.stringify(dto.badges);
    if (dto.score !== undefined) d.scoreJson = JSON.stringify(dto.score);
    if (dto.createdAt !== undefined) {
      d.createdLabel = dto.createdAt;
      const parsed = this.parseDate(dto.createdAt);
      if (parsed) d.createdAt = parsed;
    }

    if (isCreate) {
      d.title = dto.title ?? '未命名曲目';
      d.accessType = dto.type ?? 'unlocked';
      d.category = dto.category ?? 'user';
      d.instrument = dto.instrument ?? 'Acoustic Guitar';
      if (d.badges === undefined) d.badges = '[]';
      if (d.createdLabel === undefined) d.createdLabel = new Date().toISOString().split('T')[0];
    }
    return d;
  }

  async list(
    filters: { category?: string; instrument?: string; ownerUserId?: string; q?: string } = {},
    /**
     * ⚠️ 默认 `true`（连乐谱一起返回）—— **不能默认改成 false**：
     * 前端 `guitar-ai-audio` 的曲库列表/工作台是同步读 `item.score` 的，
     * 一改默认值就会变成「点开练习是空谱」。
     *
     * 但乐谱不小（实测约 **156 B/音符**：85 音符的曲子 = 13 KB），
     * 曲库涨到几百首后列表会越来越慢。所以留了这个**显式**开关：
     * 新客户端（小程序列表页、管理端表格）可以传 `?withScore=false` 只拿元数据，
     * 需要时再 `GET /api/library/:id` 取单条。
     */
    withScore = true,
  ) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.instrument) where.instrument = filters.instrument;
    if (filters.ownerUserId) where.ownerUserId = filters.ownerUserId;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q } },
        { subtitle: { contains: filters.q } },
        { artist: { contains: filters.q } },
        { keySignature: { contains: filters.q } },
      ];
    }
    /**
     * ⚠️ 排序必须是 `createdLabel desc`：前端的曲库列表默认按「最近」排序
     * （`TranscriptionListView` 里 `new Date(b.createdAt) - new Date(a.createdAt)`）。
     * 用 `createdAt desc` 也能排对，但 `createdLabel` 就是前端那个字段，
     * 语义更直白，也不会因为时区把日期挪一天。
     */
    const rows = await this.prisma.libraryItem.findMany({
      where,
      orderBy: [{ createdLabel: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.serialize(r, withScore));
  }

  async get(id: string) {
    const row = await this.prisma.libraryItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`曲库条目不存在：${id}`);
    return this.serialize(row);
  }

  async create(dto: LibraryItemDto) {
    const created = await this.prisma.libraryItem.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...(this.buildData(dto, true) as any) } as any,
    });
    this.logger.log(`曲库条目已创建：${created.id} ${created.title}`);
    return this.serialize(created);
  }

  /** 整份覆盖保存（前端 `saveSingleItem` 用；不存在则新建） */
  async upsert(id: string, dto: UpdateLibraryItemDto) {
    const existing = await this.prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) return this.create({ ...dto, id } as LibraryItemDto);
    const updated = await this.prisma.libraryItem.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async update(id: string, dto: UpdateLibraryItemDto) {
    await this.get(id);
    const updated = await this.prisma.libraryItem.update({ where: { id }, data: this.buildData(dto, false) as any });
    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.libraryItem.delete({ where: { id } });
    this.logger.log(`曲库条目已删除：${id}`);
    return { deleted: true, id };
  }

  /**
   * 批量导入（迁移脚本）。
   *
   * ⚠️ 传进来的条目如果带 `scoreId`，会先校验那份 `Score` 是否存在 ——
   * 直接写一个不存在的外键，SQLite 会整条插入失败，
   * 报出来的错还很难看懂（`FOREIGN KEY constraint failed`）。
   */
  async importItems(dto: ImportLibraryItemsDto) {
    const list = dto.items || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('items 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.libraryItem.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 条曲库条目`);
    }

    let created = 0;
    let updated = 0;
    const skippedScores: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`items[${i}] 缺少 id`);
      const data = this.buildData(raw, true);

      if (data.scoreId) {
        const exists = await this.prisma.score.findUnique({ where: { id: data.scoreId }, select: { id: true } });
        if (!exists) {
          skippedScores.push(`${raw.id}→${data.scoreId}`);
          delete data.scoreId; // 宁可不建这个引用，也不要让整批导入挂掉
        }
      }

      const exists = await this.prisma.libraryItem.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.libraryItem.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.libraryItem.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    if (skippedScores.length) {
      this.logger.warn(`以下 scoreId 在库里不存在，已忽略该引用：${skippedScores.join(', ')}`);
    }
    this.logger.log(`曲库导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, skippedScores, items: await this.list() };
  }

  /** 曲库统计（给管理端/小程序做分类徽标用） */
  async stats() {
    const rows = await this.prisma.libraryItem.findMany({
      select: { category: true, accessType: true, instrument: true, isFavorite: true, scoreId: true },
    });
    return {
      total: rows.length,
      system: rows.filter((r) => r.category === 'system').length,
      user: rows.filter((r) => r.category === 'user').length,
      favorites: rows.filter((r) => r.isFavorite).length,
      linkedToScore: rows.filter((r) => !!r.scoreId).length,
      byInstrument: rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.instrument] = (acc[r.instrument] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
