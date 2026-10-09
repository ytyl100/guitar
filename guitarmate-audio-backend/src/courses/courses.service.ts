import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChordDrillDto,
  CourseDto,
  ImportCoursesDto,
  ImportDrillsDto,
  ImportVideosDto,
  PublishCourseDto,
  TeachingVideoDto,
  UpdateChordDrillDto,
  UpdateCourseDto,
  UpdateTeachingVideoDto,
} from './dto';

/**
 * 课纲 / 教学视频 / 和弦组合 —— 需求 (2)
 * ====================================
 *
 * 这三样在 `guitar-ai-audio` 里原本各是一个 localStorage 键
 * （`guitarmate_backend_courses_v1` / `_videos_v1` / `_drills_v1`），
 * 现在统一落到后端库，并且是**同一套接口供小程序/管理端复用**。
 *
 * ## 为什么 chapters / cuePoints / steps 存整块 JSON
 *
 * 理由与 `CurriculumService`、`PracticePackage.payload` 完全一致：
 * 前端的 `CurriculumStudioCMS.tsx`（3600+ 行）是**整门课程一起编辑**的
 * —— 章节排序、内容项拖拽、复制章节、级联清理引用 ——
 * 服务端拆表就得把这套逻辑重写一遍，必然两边算法漂移。
 * 所以：**结构化字段（查询/过滤要用的）单列，编辑用的树整块 JSON 存**。
 *
 * ## 与前端的两条「必须保持同款」的规则
 *
 * 1. **版本号自增**：`v1.0 → v1.1`（`parseFloat` 去掉 `v` 后 +0.1 再 `toFixed(1)`）。
 *    前端 `backendService.publishCourse` 就是这么算的；本模块的
 *    `POST /api/courses/:id/publish` 必须算出同样结果，否则
 *    「网页端发布」和「小程序发布」会得到两个不同版本号。
 * 2. **级联清理**：删视频要顺带把课纲里引用它的内容项摘掉；删和弦组同理。
 *    前端在 `deleteVideo`/`deleteDrill` 里做了，服务端也做（`cascade=true` 默认），
 *    这样小程序删视频不会留下一堆点不开的课纲条目。
 */

/** JSON 列的安全解析（库里存的是字符串；坏了就当空，不让一条脏数据 500 掉整个列表） */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** 版本号自增 —— ⚠️ 必须与前端 `backendService.publishCourse` 完全一致 */
function nextVersion(current: string): string {
  const n = parseFloat(String(current || 'v1.0').replace('v', ''));
  return `v${((Number.isFinite(n) ? n : 1) + 0.1).toFixed(1)}`;
}

const today = () => new Date().toISOString().split('T')[0];

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════
  // 课程
  // ══════════════════════════════════════════════════════════════

  /** DB 行 → 前端 `CourseCurriculum`（形状严格对齐，前端零改动） */
  private serializeCourse(row: any) {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      coverImage: row.coverImage,
      level: row.level,
      totalLessons: row.totalLessons,
      totalHours: row.totalHours,
      category: row.category,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
      institutionId: row.institutionId,
      institutionName: row.institutionName,
      isSystemBasic: row.isSystemBasic,
      isFree: row.isFree,
      status: row.status as 'published' | 'draft' | 'archived',
      version: row.version,
      versionHistory: parseJson<any[]>(row.versionHistory, []),
      orderIndex: row.orderIndex,
      chapters: parseJson<any[]>(row.chapters, []),
      updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  /** DTO → DB 数据（只写传进来的字段；`undefined` 一律不覆盖） */
  private courseData(dto: UpdateCourseDto, isCreate: boolean) {
    const d: any = {};
    const put = (key: keyof UpdateCourseDto, col: string = key) => {
      if (dto[key] !== undefined) d[col] = dto[key];
    };
    put('title');
    put('subtitle');
    put('description');
    put('coverImage');
    put('level');
    put('totalLessons');
    put('totalHours');
    put('category');
    put('teacherId');
    put('teacherName');
    put('institutionId');
    put('institutionName');
    put('isSystemBasic');
    put('isFree');
    put('status');
    put('version');
    put('orderIndex');
    if (dto.versionHistory !== undefined) d.versionHistory = JSON.stringify(dto.versionHistory);
    if (dto.chapters !== undefined) d.chapters = JSON.stringify(dto.chapters);
    if (isCreate) {
      // 新建时的默认值（与前端 `CourseCurriculum` 的默认语义一致）
      d.title = dto.title ?? '未命名课程';
      d.status = d.status ?? 'draft';
      d.version = d.version ?? 'v1.0';
      if (d.versionHistory === undefined) d.versionHistory = '[]';
      if (d.chapters === undefined) d.chapters = '[]';
    }
    return d;
  }

  async listCourses(filters: { status?: string; q?: string; teacherId?: string; institutionId?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.institutionId) where.institutionId = filters.institutionId;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q } },
        { subtitle: { contains: filters.q } },
        { teacherName: { contains: filters.q } },
        { category: { contains: filters.q } },
      ];
    }
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.serializeCourse(r));
  }

  async getCourse(id: string) {
    const row = await this.prisma.course.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`课程不存在：${id}`);
    return this.serializeCourse(row);
  }

  async createCourse(dto: CourseDto) {
    const data = this.courseData(dto, true);
    if (data.orderIndex === undefined) {
      // 前端 `saveSingleCourse` 是 **prepend**（新课在最前），
      // 所以这里取「当前最小值 - 1」，让新课程在库里也排在最前 —— 顺序与前端一致。
      const min = await this.prisma.course.aggregate({ _min: { orderIndex: true } });
      data.orderIndex = (min._min.orderIndex ?? 0) - 1;
    }
    const created = await this.prisma.course.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...data } as any,
    });
    this.logger.log(`课程已创建：${created.id} ${created.title}`);
    return this.serializeCourse(created);
  }

  /**
   * 整份覆盖（前端 `saveSingleCourse`：有就替换、没有就新增）。
   *
   * `baseUpdatedAt` 可选：传了并且与库里不一致 → 409，
   * 防止「本机旧快照」把别人刚改的内容整份盖回去。
   */
  async upsertCourse(id: string, dto: UpdateCourseDto, baseUpdatedAt?: string) {
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) return this.createCourse({ ...dto, id } as CourseDto);
    if (baseUpdatedAt && existing.updatedAt.toISOString() !== baseUpdatedAt) {
      throw new ConflictException(
        `课程 ${id} 已被其他人修改（库: ${existing.updatedAt.toISOString()} / 你的基准: ${baseUpdatedAt}），请刷新后重试`,
      );
    }
    const updated = await this.prisma.course.update({ where: { id }, data: this.courseData(dto, false) as any });
    return this.serializeCourse(updated);
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    await this.getCourse(id);
    const updated = await this.prisma.course.update({ where: { id }, data: this.courseData(dto, false) as any });
    return this.serializeCourse(updated);
  }

  async deleteCourse(id: string) {
    await this.getCourse(id);
    await this.prisma.course.delete({ where: { id } });
    this.logger.log(`课程已删除：${id}`);
    return { deleted: true, id };
  }

  /** 批量导入（迁移脚本 + 环境间同步）；数组顺序 = 展示顺序，故归一化 `orderIndex` */
  async importCourses(dto: ImportCoursesDto) {
    const list = dto.courses || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('courses 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.course.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 门课程`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`courses[${i}] 缺少 id（业务 id 必须由调用方给定，迁移后不能变）`);
      const data = this.courseData(raw, true);
      /**
       * 数组顺序 = 前端展示顺序（前端的课程列表**不按 orderIndex 排序**，
       * 就是数组顺序渲染）。所以这里把 `orderIndex` 归一化成数组下标，
       * 保证「库里读出来的顺序」= 「写进来的顺序」——
       * 否则「新建的课程」在写穿透后会被排到末尾，与前端不一致。
       */
      data.orderIndex = i;
      const exists = await this.prisma.course.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.course.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.course.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`课程导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, courses: await this.listCourses() };
  }

  /** 发布：升版本号 + 追加版本历史 + status=published（规则与前端一致） */
  async publishCourse(id: string, dto: PublishCourseDto) {
    const row = await this.prisma.course.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`课程不存在：${id}`);
    const version = nextVersion(row.version);
    const history = parseJson<any[]>(row.versionHistory, []);
    const entry = {
      version,
      date: today(),
      author: dto.author || '系统',
      note: dto.versionNote || '更新并正式发布课程大纲',
    };
    const updated = await this.prisma.course.update({
      where: { id },
      data: { status: 'published', version, versionHistory: JSON.stringify([entry, ...history]) },
    });
    return this.serializeCourse(updated);
  }

  async archiveCourse(id: string) {
    await this.getCourse(id);
    const updated = await this.prisma.course.update({ where: { id }, data: { status: 'archived' } });
    return this.serializeCourse(updated);
  }

  /** 回滚：只改「当前版本标记」并记一条历史（与前端一致，不还原章节内容） */
  async rollbackCourse(id: string, targetVersion: string) {
    const row = await this.prisma.course.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`课程不存在：${id}`);
    const history = parseJson<any[]>(row.versionHistory, []);
    const entry = {
      version: targetVersion,
      date: today(),
      author: '系统回滚',
      note: `回滚到历史版本 ${targetVersion}`,
    };
    const updated = await this.prisma.course.update({
      where: { id },
      data: { version: targetVersion, versionHistory: JSON.stringify([entry, ...history]) },
    });
    return this.serializeCourse(updated);
  }

  // ══════════════════════════════════════════════════════════════
  // 教学视频
  // ══════════════════════════════════════════════════════════════

  private serializeVideo(row: any) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      videoUrl: row.videoUrl,
      durationFormatted: row.durationFormatted,
      associatedCourseId: row.associatedCourseId ?? undefined,
      associatedCourseTitle: row.associatedCourseTitle ?? undefined,
      cuePoints: parseJson<any[]>(row.cuePoints, []),
      status: (row.status || 'published') as 'published' | 'draft',
      videoSourceType: (row.videoSourceType || 'link') as 'link' | 'upload',
      updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  private videoData(dto: UpdateTeachingVideoDto, isCreate: boolean) {
    const d: any = {};
    if (dto.title !== undefined) d.title = dto.title;
    if (dto.description !== undefined) d.description = dto.description;
    if (dto.category !== undefined) d.category = dto.category;
    if (dto.videoUrl !== undefined) d.videoUrl = dto.videoUrl;
    if (dto.durationFormatted !== undefined) d.durationFormatted = dto.durationFormatted;
    if (dto.associatedCourseId !== undefined) d.associatedCourseId = dto.associatedCourseId || null;
    if (dto.associatedCourseTitle !== undefined) d.associatedCourseTitle = dto.associatedCourseTitle || null;
    if (dto.cuePoints !== undefined) d.cuePoints = JSON.stringify(dto.cuePoints);
    if (dto.status !== undefined) d.status = dto.status;
    if (dto.videoSourceType !== undefined) d.videoSourceType = dto.videoSourceType;
    if (isCreate) {
      d.title = dto.title ?? '未命名视频';
      d.status = dto.status ?? 'published';
      d.videoSourceType = dto.videoSourceType ?? 'link';
      if (d.cuePoints === undefined) d.cuePoints = '[]';
    }
    return d;
  }

  async listVideos(filters: { status?: string; q?: string; associatedCourseId?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.associatedCourseId) where.associatedCourseId = filters.associatedCourseId;
    if (filters.q) {
      where.OR = [{ title: { contains: filters.q } }, { category: { contains: filters.q } }];
    }
    const rows = await this.prisma.teachingVideo.findMany({ where, orderBy: [{ createdAt: 'asc' }] });
    return rows.map((r) => this.serializeVideo(r));
  }

  async getVideo(id: string) {
    const row = await this.prisma.teachingVideo.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`教学视频不存在：${id}`);
    return this.serializeVideo(row);
  }

  async upsertVideo(id: string, dto: UpdateTeachingVideoDto) {
    const existing = await this.prisma.teachingVideo.findUnique({ where: { id } });
    if (existing) {
      const updated = await this.prisma.teachingVideo.update({ where: { id }, data: this.videoData(dto, false) as any });
      return this.serializeVideo(updated);
    }
    const created = await this.prisma.teachingVideo.create({
      data: { id, ...(this.videoData(dto, true) as any) } as any,
    });
    return this.serializeVideo(created);
  }

  async createVideo(dto: TeachingVideoDto) {
    const created = await this.prisma.teachingVideo.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...(this.videoData(dto, true) as any) } as any,
    });
    return this.serializeVideo(created);
  }

  /**
   * 删除视频。
   *
   * ⚠️ `cascade=true`（默认）时**顺带把课纲里引用它的内容项摘掉** ——
   * 与前端 `backendService.deleteVideo` 的行为一致。
   * 不做的话，小程序删掉视频后网页端课纲里会留下一堆点了没反应的空壳条目。
   */
  async deleteVideo(id: string, cascade = true) {
    await this.getVideo(id);
    await this.prisma.teachingVideo.delete({ where: { id } });
    let cleanedCourses = 0;
    if (cascade) {
      const courses = await this.prisma.course.findMany();
      for (const c of courses) {
        const chapters = parseJson<any[]>(c.chapters, []);
        let changed = false;
        const next = chapters.map((ch) => {
          const items = Array.isArray(ch?.items) ? ch.items : [];
          const kept = items.filter((it: any) => it?.videoId !== id);
          if (kept.length !== items.length) {
            changed = true;
            return { ...ch, items: kept };
          }
          return ch;
        });
        if (changed) {
          await this.prisma.course.update({ where: { id: c.id }, data: { chapters: JSON.stringify(next) } });
          cleanedCourses++;
        }
      }
    }
    this.logger.log(`教学视频已删除：${id}（级联清理 ${cleanedCourses} 门课程）`);
    return { deleted: true, id, cleanedCourses };
  }

  async importVideos(dto: ImportVideosDto) {
    const list = dto.videos || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('videos 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.teachingVideo.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 个教学视频`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`videos[${i}] 缺少 id`);
      const data = this.videoData(raw, true);
      const exists = await this.prisma.teachingVideo.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.teachingVideo.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.teachingVideo.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`教学视频导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, videos: await this.listVideos() };
  }

  // ══════════════════════════════════════════════════════════════
  // 和弦组合（BPM 阶梯）
  // ══════════════════════════════════════════════════════════════

  private serializeDrill(row: any) {
    return {
      id: row.id,
      title: row.title,
      chords: parseJson<string[]>(row.chords, []),
      bpmStart: row.bpmStart,
      bpmTarget: row.bpmTarget,
      steps: parseJson<number[]>(row.steps, []),
      description: row.description ?? undefined,
      createdAt: row.createdAt?.toISOString?.() ?? '',
      status: (row.status || 'draft') as 'published' | 'draft',
      updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  private drillData(dto: UpdateChordDrillDto, isCreate: boolean) {
    const d: any = {};
    if (dto.title !== undefined) d.title = dto.title;
    if (dto.chords !== undefined) d.chords = JSON.stringify(dto.chords);
    if (dto.bpmStart !== undefined) d.bpmStart = dto.bpmStart;
    if (dto.bpmTarget !== undefined) d.bpmTarget = dto.bpmTarget;
    if (dto.steps !== undefined) d.steps = JSON.stringify(dto.steps);
    if (dto.description !== undefined) d.description = dto.description || null;
    if (dto.status !== undefined) d.status = dto.status;
    // 前端自己生成 createdAt 字符串；给了就尊重它（迁移时才能保住原始创建时间）
    if (dto.createdAt !== undefined && !Number.isNaN(Date.parse(dto.createdAt))) {
      d.createdAt = new Date(dto.createdAt);
    }
    if (isCreate) {
      d.title = dto.title ?? '未命名和弦组合';
      d.status = dto.status ?? 'draft';
      if (d.chords === undefined) d.chords = '[]';
      if (d.steps === undefined) d.steps = '[]';
    }
    return d;
  }

  async listDrills(filters: { status?: string; q?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.q) where.OR = [{ title: { contains: filters.q } }, { chords: { contains: filters.q } }];
    const rows = await this.prisma.chordDrill.findMany({ where, orderBy: [{ createdAt: 'asc' }] });
    return rows.map((r) => this.serializeDrill(r));
  }

  async getDrill(id: string) {
    const row = await this.prisma.chordDrill.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`和弦组合不存在：${id}`);
    return this.serializeDrill(row);
  }

  async createDrill(dto: ChordDrillDto) {
    const created = await this.prisma.chordDrill.create({
      data: { ...(dto.id ? { id: dto.id } : {}), ...(this.drillData(dto, true) as any) } as any,
    });
    return this.serializeDrill(created);
  }

  async upsertDrill(id: string, dto: UpdateChordDrillDto) {
    const existing = await this.prisma.chordDrill.findUnique({ where: { id } });
    if (existing) {
      const updated = await this.prisma.chordDrill.update({ where: { id }, data: this.drillData(dto, false) as any });
      return this.serializeDrill(updated);
    }
    const created = await this.prisma.chordDrill.create({ data: { id, ...(this.drillData(dto, true) as any) } as any });
    return this.serializeDrill(created);
  }

  /** 删除和弦组合（`cascade=true` 时同样清理课纲里的引用项） */
  async deleteDrill(id: string, cascade = true) {
    await this.getDrill(id);
    await this.prisma.chordDrill.delete({ where: { id } });
    let cleanedCourses = 0;
    if (cascade) {
      const courses = await this.prisma.course.findMany();
      for (const c of courses) {
        const chapters = parseJson<any[]>(c.chapters, []);
        let changed = false;
        const next = chapters.map((ch) => {
          const items = Array.isArray(ch?.items) ? ch.items : [];
          const kept = items.filter((it: any) => it?.chordDrillId !== id);
          if (kept.length !== items.length) {
            changed = true;
            return { ...ch, items: kept };
          }
          return ch;
        });
        if (changed) {
          await this.prisma.course.update({ where: { id: c.id }, data: { chapters: JSON.stringify(next) } });
          cleanedCourses++;
        }
      }
    }
    this.logger.log(`和弦组合已删除：${id}（级联清理 ${cleanedCourses} 门课程）`);
    return { deleted: true, id, cleanedCourses };
  }

  /** 「一键全部发布」（前端 `publishAllDrills`） */
  async publishAllDrills() {
    const res = await this.prisma.chordDrill.updateMany({ data: { status: 'published' } });
    this.logger.log(`和弦组合全部发布：${res.count} 条`);
    return { updated: res.count, drills: await this.listDrills() };
  }

  async importDrills(dto: ImportDrillsDto) {
    const list = dto.drills || [];
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestException('drills 不能为空');
    if (dto.replaceAll) {
      const del = await this.prisma.chordDrill.deleteMany({});
      this.logger.warn(`⚠️ replaceAll=true：已清空 ${del.count} 个和弦组合`);
    }
    let created = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw.id) throw new BadRequestException(`drills[${i}] 缺少 id`);
      const data = this.drillData(raw, true);
      const exists = await this.prisma.chordDrill.findUnique({ where: { id: raw.id } });
      if (exists) {
        await this.prisma.chordDrill.update({ where: { id: raw.id }, data: data as any });
        updated++;
      } else {
        await this.prisma.chordDrill.create({ data: { id: raw.id, ...data } as any });
        created++;
      }
    }
    this.logger.log(`和弦组合导入完成：新增 ${created} / 更新 ${updated}（共 ${list.length}）`);
    return { created, updated, total: list.length, drills: await this.listDrills() };
  }
}
