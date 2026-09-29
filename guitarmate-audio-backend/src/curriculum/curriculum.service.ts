import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CurriculumAssetsService } from './curriculum-assets.service';

/**
 * 课程大纲（curriculum）—— 后端唯一数据源
 * ======================================
 *
 * ## 为什么是「一个文档」而不是逐实体建表
 *
 * 课程大纲在 CMS 里是**整棵树一起编辑**的：阶段(Stage) → 课程(Course) → 章节(Chapter) → 课时(Lesson)，
 * 外加两个可复用的资源库（教学视频 TeachingVideo / 和弦练习组 ChordGroup）。
 * CMS 侧已经有一套 892 行、57/57 通过回归的纯函数（`curriculumOps.ts`）在做增删改，
 * 它的输入输出都是「整棵树」。
 *
 * 若为了「看起来更像 API」而把树拆成 `Stage/Course/Chapter/Lesson` 四张表，
 * 就得把那 892 行逻辑**在服务端重写一遍**（还要处理级联删除、排序、复制子树、引用计数…），
 * 风险远大于收益，而且必然出现「CMS 端算的和后端算的不一样」。
 * 所以这里采用仓库里已经有的文档式先例（`PracticePackage.payload` 同样是整块 JSON）：
 *
 * - `GET  /api/curriculum`        → 整棵树（CMS 管理端用，含草稿状态）
 * - `PUT  /api/curriculum`        → 整棵树整体保存（写入前做结构校验 + 乐观锁）
 * - `GET  /api/curriculum/learn`  → **C 端投影**（只给展示需要的字段，不含管理字段）
 *
 * 将来若真的需要「按阶段/按课程单独取」，再在这份文档之上加投影端点即可，
 * 不需要动 CMS 那套已验证的逻辑。
 */

/** CMS 的四个 slice —— 与 `App.tsx` 里四个 state 一一对应 */
export interface CurriculumData {
  stages: unknown[];
  videoLibrary: unknown[];
  chords: Record<string, unknown>;
  chordGroups: unknown[];
}

export interface CurriculumDocView {
  revision: number;
  updatedAt: string;
  /** 数据来源：`db` = 数据库里已有的；`seed` = 这次首次访问由内置种子落库 */
  source: 'db' | 'seed';
  data: CurriculumData;
}

/** 单次保存的体积上限（防止误传二进制/整个数据库把表撑爆） */
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/** 「谁在引用这个文件」里的一条引用 */
export interface AssetRef {
  /** `video` = 视频库记录；`lesson` = 课时内联副本；`course` = 课程封面 */
  kind: 'video' | 'lesson' | 'course';
  id: string;
  title: string;
}

/** 数据体检里的一条问题 */
export interface CurriculumHealthIssue {
  /** `error` = C 端会真坏（点了播不出来）；`warn` = 有东西会缺失/静默失效；`info` = 只是提示 */
  level: 'error' | 'warn' | 'info';
  code: string;
  /** 定位串（课时 id / 路径 / `id:timeSec`） */
  target: string;
  message: string;
  fixHint: string;
}

export interface CurriculumHealth {
  revision: number;
  checkedAt: string;
  counts: { error: number; warn: number; info: number };
  /** 没有 error/warn（info 级只是提示，不算不健康） */
  healthy: boolean;
  issues: CurriculumHealthIssue[];
  summary: {
    videos: number;
    covers: number;
    orphanVideos: number;
    orphanCovers: number;
    orphanBytes: number;
    lessons: number;
  };
}

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private readonly prisma: PrismaService,
    /** 封面图等静态资源（把库里存的相对路径翻成可访问 URL） */
    private readonly assets: CurriculumAssetsService,
  ) {}

  private get docId(): string {
    /** 单例文档：整个系统只有一份课程大纲 */
    return 'default';
  }

  /** 内置种子（由 CMS 的 `scripts/export-curriculum-seed.ts` 从 INITIAL_* 导出） */
  private readSeed(): CurriculumData {
    const path = join(process.cwd(), 'prisma', 'curriculum.seed.json');
    if (!existsSync(path)) {
      this.logger.warn(`内置课程种子不存在：${path}（首次访问会返回空文档）`);
      return { stages: [], videoLibrary: [], chords: {}, chordGroups: [] };
    }
    return JSON.parse(readFileSync(path, 'utf8')) as CurriculumData;
  }

  /** 取整份课程大纲；库里还没有就先把内置种子落库（CMS 一打开就有熟悉的数据，不会看到空白） */
  async get(): Promise<CurriculumDocView> {
    const row = await this.prisma.curriculumDoc.findUnique({ where: { id: this.docId } });
    if (row) {
      return {
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
        source: 'db',
        data: this.parse(row.payload),
      };
    }

    const seed = this.readSeed();
    const created = await this.prisma.curriculumDoc.create({
      data: { id: this.docId, revision: 1, payload: JSON.stringify(seed) },
    });
    this.logger.log(
      `课程大纲首次初始化：stages=${seed.stages.length} videos=${seed.videoLibrary.length} chordGroups=${seed.chordGroups.length}`,
    );
    return {
      revision: created.revision,
      updatedAt: created.updatedAt.toISOString(),
      source: 'seed',
      data: seed,
    };
  }

  /**
   * 整体保存
   *
   * @param data 整棵树（缺字段会按空值补齐，方便前端只传变动的那部分 slice）
   * @param baseRevision 客户端「读到的版本号」；与库内不一致 → 409（避免两个标签页互相覆盖）
   */
  async put(data: Partial<CurriculumData>, baseRevision?: number) {
    const normalized: CurriculumData = {
      stages: Array.isArray(data?.stages) ? data.stages : [],
      videoLibrary: Array.isArray(data?.videoLibrary) ? data.videoLibrary : [],
      chords:
        data?.chords && typeof data.chords === 'object' && !Array.isArray(data.chords)
          ? (data.chords as Record<string, unknown>)
          : {},
      chordGroups: Array.isArray(data?.chordGroups) ? data.chordGroups : [],
    };

    const payload = JSON.stringify(normalized);
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException(
        `课程大纲体积超限（> ${Math.round(MAX_PAYLOAD_BYTES / 1024 / 1024)}MB）`,
      );
    }
    if (normalized.stages.length === 0 && normalized.videoLibrary.length === 0) {
      throw new BadRequestException('stages 与 videoLibrary 不能同时为空（疑似误传空数据）');
    }

    const current = await this.prisma.curriculumDoc.findUnique({ where: { id: this.docId } });
    if (current && Number.isFinite(baseRevision) && baseRevision !== current.revision) {
      throw new ConflictException(
        `课程大纲已被他人修改（当前 revision=${current.revision}，你基于 ${baseRevision}）。请刷新后重试。`,
      );
    }

    const saved = current
      ? await this.prisma.curriculumDoc.update({
          where: { id: this.docId },
          data: { payload, revision: current.revision + 1 },
        })
      : await this.prisma.curriculumDoc.create({
          data: { id: this.docId, revision: 1, payload },
        });

    this.logger.log(
      `课程大纲已保存：revision=${saved.revision} stages=${normalized.stages.length} videos=${normalized.videoLibrary.length} chordGroups=${normalized.chordGroups.length}`,
    );
    return {
      revision: saved.revision,
      updatedAt: saved.updatedAt.toISOString(),
      counts: {
        stages: normalized.stages.length,
        videoLibrary: normalized.videoLibrary.length,
        chords: Object.keys(normalized.chords).length,
        chordGroups: normalized.chordGroups.length,
      },
    };
  }

  /**
   * 收集「磁盘上的视频文件」被哪些记录引用（统一资产库的「孤儿」判定要用）。
   *
   * key 归一化成**相对路径**（`/uploads/curriculum/videos/x.mp4`）：
   * 库里两种写法都有（CMS 直传存相对、老种子存 `https://cdn...` 绝对），
   * 外链（OSS/CDN）不是本地文件，直接不参与对账（返回 null 丢掉）。
   */
  async collectVideoAssetRefs(): Promise<Map<string, AssetRef[]>> {
    const { videos } = await this.collectAssetRefs();
    return videos;
  }

  /**
   * 资产引用总表：**磁盘文件 → 谁在引用它**（视频 + 封面各一张表）。
   *
   * 归一化口径统一走 `CurriculumAssetsService.toRelativeAssetPath`（不要在两边各写一份，
   * 否则「孤儿」的判定会出现两个答案）。外链（OSS/CDN）不是本地文件，不参与对账。
   *
   * @param opts.ignoreVideoId 对账时**忽略这条视频记录**（它正在被删除）。
   *   为什么需要：CMS 删记录后立即删文件，而它的文档保存是**防抖**的 ——
   *   库里还留着那条记录，于是“还被引用”把自己拦成了 409（实测就是这么发生的）。
   *   带上这个参数，只要**别的**引用都没了，文件就能干净地删掉。
   */
  async collectAssetRefs(opts: { ignoreVideoId?: string } = {}): Promise<{
    videos: Map<string, AssetRef[]>;
    covers: Map<string, AssetRef[]>;
  }> {
    const view = await this.get();
    const data = view.data as CurriculumData;
    const videos = new Map<string, AssetRef[]>();
    const covers = new Map<string, AssetRef[]>();

    const put = (
      target: Map<string, AssetRef[]>,
      value: unknown,
      ref: AssetRef,
    ) => {
      const key = this.assets.toRelativeAssetPath(value);
      if (!key) return;
      const list = target.get(key) || [];
      /** 同一个文件被同一条记录引两次（videoUrl + variants）只算一次 */
      if (!list.some((r) => r.kind === ref.kind && r.id === ref.id)) list.push(ref);
      target.set(key, list);
    };

    for (const video of (data.videoLibrary || []) as Array<{
      id?: string;
      title?: string;
      videoUrl?: string;
      variants?: Array<{ url?: string }>;
    }>) {
      /** 正在被删的那条记录不参与对账（见 opts.ignoreVideoId 注释） */
      if (opts.ignoreVideoId && video.id === opts.ignoreVideoId) continue;
      const ref: AssetRef = {
        kind: 'video',
        id: video.id || '',
        title: video.title || '(未命名)',
      };
      put(videos, video.videoUrl, ref);
      for (const v of video.variants || []) put(videos, v.url, ref);
    }

    for (const stage of (data.stages || []) as CurriculumStageLike[]) {
      for (const course of stage.courses || []) {
        const courseRef: AssetRef = {
          kind: 'course',
          id: course.id || '',
          title: course.title || course.id || '(未命名课程)',
        };
        put(covers, course.coverImage, courseRef);
        for (const chapter of course.chapters || []) {
          for (const lesson of chapter.lessons || []) {
            /**
             * 老链路的内联副本也要算：C 端在视频库记录被删、或课时只填了 `videoData.videoUrl`
             * 时会回退到它 —— 漏掉这一处，就会把「其实还在用」的文件当孤儿删掉。
             */
            if (!lesson.videoData?.videoUrl) continue;
            put(videos, lesson.videoData.videoUrl, {
              kind: 'lesson',
              id: lesson.id || '',
              title: `课时内联：${lesson.title || lesson.id || '(未命名)'}`,
            });
          }
        }
      }
    }

    return { videos, covers };
  }

  /**
   * 数据体检：把「引用了不存在的东西」全找出来。
   *
   * ## 为什么必须有这个
   *
   * 之前 C 端 `playable` 的语义只是「**CMS 填过地址**」，不是「地址可达」——
   * 所以一个被引用了但文件已被删（或从来没传上去）的 `videoUrl`，
   * 会让小程序给出一个点了播不出来的播放按钮。同理
   * `chordGroupIds` / `linkedChordName` / `chordKeys` 都可能指向不存在的目标，
   * 在 C 端直接变成空白或静默失效。
   *
   * 这里做的是**文件系统级的可达性**（不是 HTTP 探测，所以不慢、也不会因为
   * 域名解析/网络抖动误报）：`videoUrl` 指向本地 `/uploads/...` 时查文件在不在。
   */
  async health(): Promise<CurriculumHealth> {
    const view = await this.get();
    const data = view.data as CurriculumData;
    const videoLibrary = (data.videoLibrary || []) as CurriculumVideoLike[];
    const chordGroups = (data.chordGroups || []) as Array<{
      id?: string;
      name?: string;
      chordKeys?: string[];
    }>;
    const chords = data.chords || {};
    const issues: CurriculumHealthIssue[] = [];
    const push = (issue: CurriculumHealthIssue) => issues.push(issue);

    /** ── 1. 视频文件：引用存在但文件不在（悬空） / 文件在但没人用（孤儿） ── */
    const { videos: videoRefs, covers: coverRefs } = await this.collectAssetRefs();
    const videoFiles = new Map(this.assets.listVideos().map((v) => [v.relativePath, v]));
    const coverFiles = new Map(this.assets.listCovers().map((c) => [c.relativePath, c]));

    for (const [path, refs] of videoRefs) {
      if (!this.assets.isLocalAssetPath(path)) continue;
      if (videoFiles.has(path)) continue;
      push({
        level: 'error',
        code: 'missing-video-file',
        target: path,
        message: `视频文件不存在，但被 ${refs.length} 处引用（${refs.map((r) => r.title).join('、')}）—— C 端会给出一个点不开的播放按钮。`,
        fixHint: '重新上传/转码这个视频，或把这些记录的 videoUrl 改成存在的文件。',
      });
    }
    for (const [path, refs] of coverRefs) {
      if (!this.assets.isLocalAssetPath(path)) continue;
      if (coverFiles.has(path)) continue;
      push({
        level: 'warn',
        code: 'missing-cover-file',
        target: path,
        message: `封面文件不存在，但被 ${refs.length} 门课程使用（${refs.map((r) => r.title).join('、')}）—— C 端课程卡会退回渐变色底。`,
        fixHint: '重新上传封面图，或把课程的 coverImage 清空。',
      });
    }
    const orphanVideoBytes = [...videoFiles.values()]
      .filter((f) => !videoRefs.has(f.relativePath))
      .reduce((sum, f) => sum + f.sizeBytes, 0);
    const orphanVideos = [...videoFiles.keys()].filter((p) => !videoRefs.has(p));
    const orphanCovers = [...coverFiles.keys()].filter((p) => !coverRefs.has(p));
    if (orphanVideos.length || orphanCovers.length) {
      push({
        level: 'info',
        code: 'orphan-assets',
        target: 'uploads/curriculum',
        message:
          `磁盘上有 ${orphanVideos.length} 个视频文件 + ${orphanCovers.length} 张封面图未被任何记录引用` +
          `（视频部分约 ${(orphanVideoBytes / 1024 / 1024).toFixed(1)}MB）。`,
        fixHint: '在「视频资产」页签里用「清理孤儿文件」一次删掉。',
      });
    }

    /** ── 2. 课时 ↔ 视频库：引用了不存在的视频记录 ── */
    const videoIds = new Set(videoLibrary.map((v) => v.id).filter(Boolean));
    const groupIds = new Set(chordGroups.map((g) => g.id).filter(Boolean));
    const chordKeys = new Set(Object.keys(chords));
    const lessonIds = new Set<string>();

    for (const stage of (data.stages || []) as CurriculumStageLike[]) {
      for (const course of stage.courses || []) {
        for (const chapter of course.chapters || []) {
          for (const lesson of chapter.lessons || []) {
            if (lesson.id) lessonIds.add(lesson.id);
          }
        }
      }
    }

    for (const stage of (data.stages || []) as CurriculumStageLike[]) {
      for (const course of stage.courses || []) {
        for (const chapter of course.chapters || []) {
          for (const lesson of chapter.lessons || []) {
            const where = `${course.title || course.id} / ${lesson.title || lesson.id}`;
            for (const id of lesson.videoIds || []) {
              if (videoIds.has(id)) continue;
              push({
                level: 'warn',
                code: 'dangling-video-id',
                target: `${lesson.id}:${id}`,
                message: `课时「${where}」关联的教学视频 ${id} 在视频库里不存在（视频库可能在别处被删过）。`,
                fixHint: '在课时里重新勾选要关联的视频，或把这条悬空 id 去掉。',
              });
            }
            for (const id of lesson.chordGroupIds || []) {
              if (groupIds.has(id)) continue;
              push({
                level: 'warn',
                code: 'dangling-chord-group-id',
                target: `${lesson.id}:${id}`,
                message: `课时「${where}」关联的和弦训练组 ${id} 不存在。`,
                fixHint: '在「和弦训练」工作台里重新勾选训练组。',
              });
            }
            /** 内联副本的 videoId 指向不存在的记录（老链路遗留） */
            const inlineId = (lesson.videoData as { videoId?: string } | undefined)?.videoId;
            if (inlineId && !videoIds.has(inlineId)) {
              push({
                level: 'info',
                code: 'dangling-inline-video-id',
                target: `${lesson.id}:${inlineId}`,
                message: `课时「${where}」的内联视频副本指向已不存在的视频记录 ${inlineId}（C 端会回退用它）。`,
                fixHint: '在这个课时上重新绑定视频（会自动刷新内联副本）。',
              });
            }
          }
        }
      }
    }

    /** ── 3. 打点联动的和弦 / 和弦组引用的和弦 ── */
    for (const video of videoLibrary) {
      for (const kp of video.keyPoints || []) {
        if (!kp.linkedChordName || chordKeys.has(kp.linkedChordName)) continue;
        push({
          level: 'warn',
          code: 'dangling-keypoint-chord',
          target: `${video.id}:${kp.timestampSec ?? 0}`,
          message: `视频「${video.title || video.id}」的打点「${kp.title || '(无标题)'}」联动的和弦 ${kp.linkedChordName} 在和弦库里不存在。`,
          fixHint: '在和弦库补上这个和弦，或把打点的联动和弦改掉。',
        });
      }
    }
    for (const group of chordGroups) {
      for (const key of group.chordKeys || []) {
        if (chordKeys.has(key)) continue;
        push({
          level: 'warn',
          code: 'dangling-group-chord',
          target: `${group.id}:${key}`,
          message: `和弦训练组「${group.name || group.id}」里的和弦 ${key} 在和弦库里不存在。`,
          fixHint: '在和弦库补上这个和弦，或从训练组里移除它。',
        });
      }
    }

    /** ── 4. 溯源字段：视频记录指向已删除的课时 ── */
    for (const video of videoLibrary) {
      const src = (video as { sourceLessonId?: string }).sourceLessonId;
      if (!src || lessonIds.has(src)) continue;
      push({
        level: 'info',
        code: 'dangling-source-lesson',
        target: `${video.id}:${src}`,
        message: `视频「${video.title || video.id}」记录的来源课时 ${src} 已被删除（只是溯源信息，不影响播放）。`,
        fixHint: '可以忽略；需要清就把 sourceLessonId 去掉。',
      });
    }

    const counts = {
      error: issues.filter((i) => i.level === 'error').length,
      warn: issues.filter((i) => i.level === 'warn').length,
      info: issues.filter((i) => i.level === 'info').length,
    };
    return {
      revision: view.revision,
      checkedAt: new Date().toISOString(),
      counts,
      /** 体检通过 = 没有 error/warn（info 级只是提示） */
      healthy: counts.error === 0 && counts.warn === 0,
      issues,
      summary: {
        videos: videoFiles.size,
        covers: coverFiles.size,
        orphanVideos: orphanVideos.length,
        orphanCovers: orphanCovers.length,
        orphanBytes:
          orphanVideoBytes +
          [...coverFiles.values()]
            .filter((f) => !coverRefs.has(f.relativePath))
            .reduce((sum, f) => sum + f.sizeBytes, 0),
        lessons: lessonIds.size,
      },
    };
  }

  /**
   * C 端投影：只暴露「学员要看/要练」的字段
   *
   * ⚠️ 管理字段（prerequisite 阈值、transcodeStatus、videoUrl 原始地址、updatedAt…
   * 这些既涉及后端转码状态又涉及链接安全）**不进投影** —— C 端不该拿到它们。
   * 小程序 Learn 页只消费这里返回的形状。
   */
  async getLearnView() {
    const view = await this.get();
    const stages = (view.data.stages as CurriculumStageLike[]) || [];
    const videoLibrary = (view.data.videoLibrary as CurriculumVideoLike[]) || [];

    /**
     * 课时的视频：**优先从视频库实体取**（那里才有 `videoUrl` 与打点），
     * 库里的主视频是 `videoIds[0]`；库里找不到才回退到课时自带的 `videoData`（老链路的内联副本）。
     *
     * ⚠️ `url` 是**真的能播的地址**，`playable` 也就因此是「有地址」而不是
     * 相信 CMS 里那个写死的 `transcodeStatus: 'READY'` —— 之前 C 端拿它当已就绪，
     * 实际根本没有视频可放（这就是「课时播放」一直做不出来的真正卡点）。
     */
    const resolveVideo = (lesson: CurriculumLessonLike) => {
      const fromLibrary = videoLibrary.find((v) => (lesson.videoIds || []).includes(v.id));
      const inline = lesson.videoData;
      if (!fromLibrary && !inline) return null;

      const keyPoints = (fromLibrary?.keyPoints || []).map((k) => ({
        timeSec: k.timestampSec ?? 0,
        title: k.title ?? '',
        description: k.description ?? '',
        chordName: k.linkedChordName ?? undefined,
      }));
      const url = this.assets.toAbsoluteUrl(fromLibrary?.videoUrl) || '';
      const inlineKeyPoints = (inline?.keyPoints || []).map((k) => ({
        timeSec: k.timeSec ?? k.timestampSec ?? 0,
        title: k.title ?? '',
        description: '',
        chordName: undefined,
      }));

      return {
        id: fromLibrary?.id ?? '',
        title: fromLibrary?.title ?? inline?.title ?? '',
        instructor: fromLibrary?.instructor ?? inline?.instructor ?? '',
        durationSec: fromLibrary?.durationSec ?? inline?.durationSec ?? 0,
        resolution: fromLibrary?.resolution ?? inline?.resolution ?? '',
        /** 真的能播的地址（箱内直传得到的 `/uploads/...` 已拼成绝对 URL） */
        url,
        /**
         * C 端据此决定要不要给「播放」按钮（不给假按钮）。
         *
         * ⚠️ 语义是「**CMS 填过地址**」，**不是「地址可达」**：投影是同步的、一次要算整棵树，
         * 逐条 HEAD 探测会把 /learn 拖慢（种子里的 `https://cdn.guitarmate.dev/...` 就是占位地址，
         * 根本不存在）。真要严格，得跟 `AudioService.checkSourceAccessible` 那样做**异步、带缓存**的探测。
         */
        playable: url.length > 0,
        keyPoints: keyPoints.length ? keyPoints : inlineKeyPoints,
      };
    };

    return {
      revision: view.revision,
      updatedAt: view.updatedAt,
      stages: stages.map((stage) => ({
        id: stage.id,
        stageCode: stage.stageCode,
        name: stage.name,
        focus: stage.focus,
        order: stage.order ?? 0,
        courses: (stage.courses || []).map((course) => ({
          id: course.id,
          title: course.title,
          subtitle: course.subtitle,
          /** CMS 里存的是 Tailwind 色的 hex，C 端拿来做卡片底色 */
          coverColor: course.coverColor,
          /**
           * 课程封面图（CMS 上传得到 `/uploads/curriculum/covers/...`）。
           *
           * ⚠️ 库里存的是**相对路径**（换域名不用重编课程），投影时才拼成绝对 URL。
           * C 端拿到的是**绝对**地址，小程序 `<Image src>` 与 Web `<img src>` 都能直接用。
           */
          coverImage: this.assets.toAbsoluteUrl(course.coverImage),
          targetLevel: course.targetLevel,
          chapters: (course.chapters || []).map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            description: chapter.description,
            order: chapter.order ?? 0,
            lessons: (chapter.lessons || []).map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              type: lesson.type,
              /** 黄金 20 分钟的时间配比（5 个固定维度） */
              timeAllocation: lesson.timeAllocation ?? null,
              video: resolveVideo(lesson),
              chordGroupIds: lesson.chordGroupIds ?? [],
              song: lesson.songBinding ?? null,
            })),
          })),
        })),
      })),
    };
  }

  private parse(payload: string): CurriculumData {
    try {
      return JSON.parse(payload) as CurriculumData;
    } catch (err) {
      this.logger.error(`课程大纲 JSON 解析失败：${(err as Error).message}`);
      return { stages: [], videoLibrary: [], chords: {}, chordGroups: [] };
    }
  }
}

/* ------------------------------------------------------------------ *
 * 下面这些只是**读取用的宽松类型**：文档里的内容由 CMS 保证形状，
 * 后端不重复声明一遍完整 schema（否则又变成两处定义、必然漂移）。
 * ------------------------------------------------------------------ */
interface CurriculumStageLike {
  id: string;
  stageCode?: string;
  name?: string;
  focus?: string;
  order?: number;
  courses?: CurriculumCourseLike[];
}
interface CurriculumCourseLike {
  id: string;
  title?: string;
  subtitle?: string;
  coverColor?: string;
  /** 课程封面图：相对路径（`/uploads/curriculum/covers/x.png`）或外链 */
  coverImage?: string;
  targetLevel?: string;
  chapters?: CurriculumChapterLike[];
}
interface CurriculumChapterLike {
  id: string;
  title?: string;
  description?: string;
  order?: number;
  lessons?: CurriculumLessonLike[];
}
interface CurriculumLessonLike {
  id: string;
  title?: string;
  type?: string;
  timeAllocation?: Record<string, number>;
  /** 关联的教学视频（多对多，第一个 = 主视频） */
  videoIds?: string[];
  videoData?: {
    title?: string;
    instructor?: string;
    durationSec?: number;
    resolution?: string;
    /** 老链路的内联视频源（CMS 镜像下来的那份）；资产库对账也要算上它 */
    videoUrl?: string;
    /** ⚠️ 内联副本的打点字段名不统一（实测种子里是 `timestampSec`）→ 两种都收 */
    keyPoints?: Array<{ timeSec?: number; timestampSec?: number; title?: string }>;
  };
  chordGroupIds?: string[];
  songBinding?: Record<string, unknown>;
}

/** 教学视频库实体（CMS 的 `TeachingVideo`，只是读取用的宽松类型） */
interface CurriculumVideoLike {
  id: string;
  title?: string;
  instructor?: string;
  /** 视频源：OSS/CDN 地址，或本服务上传得到的 `/uploads/curriculum/videos/...` */
  videoUrl?: string;
  coverUrl?: string;
  durationSec?: number;
  resolution?: string;
  transcodeStatus?: string;
  keyPoints?: Array<{
    timestampSec?: number;
    title?: string;
    description?: string;
    linkedChordName?: string;
  }>;
}
