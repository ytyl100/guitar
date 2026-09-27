import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PracticePackageService } from './practice-package.service';
import type { PracticePackage } from './practice-package.types';

/**
 * C 端曲库统一视图（PublishedLibraryService）
 * ==========================================
 *
 * ## 为什么需要它
 *
 * 后端有**两条发布链路**，落库位置完全不同：
 *
 * | 链路 | 落库 | C 端可读性 |
 * |---|---|---|
 * | 旧链路（CMS「发布小节至后端」/ 镜像） | `Score` + `Measure` + `MeasureTrack` | ✅ `/api/published/scores` |
 * | 转录链路（复核页「发布 PracticePackage」） | `PracticePackage.payload`（JSON 快照） | ❌ 之前无人读 |
 *
 * 转录链路**默认不镜像**（`mirrorToScorePipeline=false` → `Project.scoreId=null`），
 * 于是这类曲目在 CMS 音乐库里显示「已发布」，小程序曲库里却完全看不到 ——
 * 实测 Macaroon 5 / Isolated 就是这样（`scoreId: null`、89/25 小节）。
 *
 * 本服务把两条链路的产物合并成**一个列表**，小程序端只读这一个接口即可与
 * 「CMS 里已发布的内容」保持一致；取详情时也只需一个 id（Score id 或 Project id）。
 *
 * ## 去重策略：同曲名只保留一条
 * - 优先级：已镜像的 `Score` > 转录 `PracticePackage`；同类取最新。
 * - 归一化：小写 + 去掉所有非字母数字/汉字 → `Macaroon 5 | YouTube Audio Library`
 *   与 `Macaroon 5 (YouTube Audio Library)` 视为同一首（实测库里真有这两条）。
 * - 也顺带干掉「同一曲目被发布多次」产生的历史残留条目（A 小调练习曲 r1/r3）。
 */
@Injectable()
export class PublishedLibraryService {
  private readonly logger = new Logger(PublishedLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly packages: PracticePackageService,
  ) {}

  /** 归一化曲名：只留字母 / 数字 / 汉字，去空白与小写 */
  private normalizeTitle(title?: string | null): string {
    return String(title || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  /**
   * 统一曲库列表（旧链路 published Score ∪ 转录 published PracticePackage）。
   * 按发布时间倒序返回；同曲名只保留优先级最高的一条。
   */
  async list() {
    const [scores, packageRows] = await Promise.all([
      this.prisma.score.findMany({
        where: { status: 'published' },
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          bpm: true,
          timeSignature: true,
          originalAudio: true,
          createdAt: true,
          _count: { select: { measures: true, tracks: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.practicePackage.findMany({
        select: {
          id: true,
          projectId: true,
          scoreId: true,
          revision: true,
          measureCount: true,
          noteCount: true,
          createdAt: true,
          publishedBy: true,
          project: {
            select: { id: true, title: true, artist: true, bpm: true, timeSignature: true },
          },
        },
        orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    /** 同一项目可能有多个发布版本 → 只取 revision 最大的一条 */
    const latestByProject = new Map<string, (typeof packageRows)[number]>();
    for (const row of packageRows) {
      if (!latestByProject.has(row.projectId)) latestByProject.set(row.projectId, row);
    }

    const items: Array<{
      id: string;
      source: 'score' | 'transcription';
      title: string;
      artist: string | null;
      coverUrl: string | null;
      bpm: number | null;
      timeSignature: string;
      originalAudio: string | null;
      measureCount: number;
      noteCount: number | null;
      createdAt: string;
      /** 兼容旧字段：小程序端按 `_count.measures` 估算时长 */
      _count: { measures: number };
    }> = [];

    /**
     * ⚠️ `Score._count.measures` 会把**重复发布**产生的重复小节也算进去
     * （Canon in D 实测 16 条 = 8 个 index ×2 → 时长估算会翻倍，
     * 小程序底部播放计时器就会多播一遍）。这里按 `index` 去重后计数，
     * 与小程序端 `dedupeMeasuresByIndex()` 同一口径。
     */
    const distinctIndexes = scores.length
      ? await this.prisma.measure.findMany({
          where: { scoreId: { in: scores.map((s) => s.id) } },
          select: { scoreId: true, index: true },
          distinct: ['scoreId', 'index'],
        })
      : [];
    const uniqueMeasureCount = new Map<string, number>();
    for (const row of distinctIndexes) {
      uniqueMeasureCount.set(row.scoreId, (uniqueMeasureCount.get(row.scoreId) ?? 0) + 1);
    }

    for (const score of scores) {
      const measureCount = uniqueMeasureCount.get(score.id) ?? score._count?.measures ?? 0;
      items.push({
        id: score.id,
        source: 'score',
        title: score.title,
        artist: score.artist,
        coverUrl: score.coverUrl,
        bpm: score.bpm,
        timeSignature: score.timeSignature || '4/4',
        originalAudio: score.originalAudio,
        measureCount,
        noteCount: null,
        createdAt: (score.createdAt instanceof Date ? score.createdAt : new Date(0)).toISOString(),
        _count: { measures: measureCount },
      });
    }

    for (const row of latestByProject.values()) {
      // 已镜像到 Score 链路的，上面那段已经收录 → 跳过，避免同一曲目出现两次
      if (row.scoreId) continue;
      const measureCount = row.measureCount ?? 0;
      if (measureCount <= 0) continue; // 没有任何小节的空发布没有练习价值
      items.push({
        id: row.projectId,
        source: 'transcription',
        title: row.project?.title || '未命名曲目',
        artist: row.project?.artist || null,
        coverUrl: null,
        bpm: row.project?.bpm ?? null,
        timeSignature: row.project?.timeSignature || '4/4',
        originalAudio: null,
        measureCount,
        noteCount: row.noteCount ?? null,
        createdAt: (
          row.createdAt instanceof Date ? row.createdAt : new Date(0)
        ).toISOString(),
        _count: { measures: measureCount },
      });
    }

    // 同曲名去重：Score 优先，其次发布时间更晚的
    const byTitle = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = this.normalizeTitle(item.title) || item.id;
      const existing = byTitle.get(key);
      if (!existing) {
        byTitle.set(key, item);
        continue;
      }
      const betterSource = item.source === 'score' && existing.source !== 'score';
      const newerSameSource =
        item.source === existing.source && item.createdAt > existing.createdAt;
      if (betterSource || newerSameSource) {
        this.logger.debug(
          `同曲名去重：保留 ${item.source}/${item.id}（${item.title}），丢弃 ${existing.source}/${existing.id}`,
        );
        byTitle.set(key, item);
      }
    }

    return [...byTitle.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /**
   * 按 id 取已发布契约：先当 Score id 试，再当转录 Project id 试。
   * 两条链路返回的都是同一份 `PracticePackage`（schemaVersion 1.0），
   * 因此小程序端 `validatePracticePackage` 无需区分来源。
   */
  async getPackage(id: string): Promise<PracticePackage> {
    const score = await this.prisma.score.findUnique({ where: { id }, select: { id: true } });
    if (score) {
      return this.packages.build(id, 'published-api');
    }

    const row = await this.prisma.practicePackage.findFirst({
      where: { projectId: id },
      orderBy: { revision: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(`未找到已发布的曲目或转录项目：${id}`);
    }

    try {
      return JSON.parse(row.payload) as PracticePackage;
    } catch {
      throw new NotFoundException(`转录项目 ${id} 的 PracticePackage 快照已损坏，无法解析`);
    }
  }
}
