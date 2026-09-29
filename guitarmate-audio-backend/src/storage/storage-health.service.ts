import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 后端存储体检（uploads/ 下**课程以外**的那几个目录）
 * ==================================================
 *
 * ## 为什么单独一个 service
 *
 * 课程域（`uploads/curriculum/`）的资产对账在 `CurriculumService.health()` 里 —— 那边是**一份 JSON 文档**
 * 说了算，规则只有一条。这里的四个目录各自属于**不同的表**，归属口径完全不同，混进去会让那边变成一个
 * 「什么都知道」的上帝类：
 *
 * ```text
 * uploads/transcriptions/<projectId|scoreId>/…   Project.audioPath / TranscribeTrack.{stem,midi,tab}Path
 *                                               还有 scores.service 导入 JSON 时的 <scoreId>/….json
 * uploads/measures/<scoreId>/…                   MeasureTrack.{audioUrl,originalAudioUrl,tabImageUrl}
 * uploads/tab-projects/<scoreId>/…               Track.jsonUrl（外加「导入历史库」，见下）
 * uploads/demo/*.wav                             按需合成的**可重建缓存**（不属于任何记录）
 * ```
 *
 * ## 两个方向都要查（这才是「孤立数据」的全貌）
 *
 * 1. **文件 → 记录**：磁盘上有、但没有任何记录指它（孤儿）。典型来源：
 *    项目/曲目被删了，`uploadDir` 没跟着清（`transcribe.service` 有清理，但历史遗留 + 手动删库都会留下）；
 *    重新发布小节时旧切片没清干净。
 * 2. **记录 → 文件**：库里有路径、但文件不在（**悬空引用**）。这比孤儿更该早发现 ——
 *    C 端会拿着一个永远加载不出来的地址。
 *
 * ## 归属口径（这是最关键的判断，别图省事）
 *
 * 转录/小节/导入这三类都是「**一级目录名 = 主记录 id**」：
 *
 * - 目录名在记录集合里 → **整个目录都算它的**（项目中间产物、日志、多个版本都不该被当垃圾删）；
 * - 目录名不在记录集合里 → 那个目录才是孤儿；
 * - `measures/<在用的 scoreId>/` 里**多出来的切片**：同分轨重新发布会产生新文件而旧文件不被引用，
 *   它们确实是垃圾（`measures.controller` 自己在重新发布前也会 `removeLocalDir`），所以单独按文件判孤儿。
 * - `tab-projects/<在用的 scoreId>/` 里多出来的文件**不算垃圾**：那是 `GET /api/tab-import/projects`
 *   故意留的「导入历史」，用户能在后台看到并回灌 —— 删了就少了功能。
 * - `uploads/demo/` 是**可重建的音符合成缓存**（`DemoAudioService` 按需重算），不归任何记录所有，
 *   所以**只报告、不清理**。
 */

/** 一个目录的体检结果 */
export interface StorageDomainReport {
  domain: string;
  /** 相对 `uploads/` 的目录名 */
  dir: string;
  label: string;
  files: number;
  bytes: number;
  /** 没有归属的文件（可清理） */
  orphanFiles: number;
  orphanBytes: number;
  /** 库里指了路径、但文件不在 */
  missingRefs: number;
  orphanSample: Array<{ rel: string; bytes: number; reason: string }>;
  missingSample: Array<{ rel: string; owner: string; field: string }>;
  /** 结构性缺失（记录在、内容缺），例如「已发布但一个小节都没有」 */
  dataGaps: string[];
  /** 是否允许一键清理孤儿 */
  cleanable: boolean;
  note: string;
}

export interface StorageHealth {
  checkedAt: string;
  totals: {
    files: number;
    bytes: number;
    orphanFiles: number;
    orphanBytes: number;
    missingRefs: number;
    dataGaps: number;
  };
  domains: StorageDomainReport[];
}

export interface StorageCleanupResult {
  domain: string;
  dryRun: boolean;
  removedFiles: number;
  freedBytes: number;
  removedDirs: string[];
  sample: string[];
  /** 被跳过的（没归属判定的安全网命中） */
  skipped: string[];
}

type LocalRef = { rel: string; owner: string; field: string };

@Injectable()
export class StorageHealthService {
  private readonly logger = new Logger(StorageHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 路径工具 ────────────────────────────────────────────────

  /**
   * 任意写法 → `uploads/` 下的本地相对路径（正斜杠，不带前导斜杠）。
   *
   * `D:\x\uploads\a.mp3`、`uploads/a.mp3`、`http://localhost:3000/uploads/a.mp3#t=1,2`
   * 都要能归一到 `a.mp3`；**外链 CDN / OSS 返回 null**（不是本地文件，不该拿文件系统去判它）。
   */
  private toLocalRel(value?: string | null): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    /** 去掉媒体片段（`#t=start,end` 是切片降级时的写法，不属于文件名） */
    const noFragment = raw.split('#')[0];
    const unified = noFragment.replace(/\\/g, '/');
    if (/^https?:\/\//i.test(unified)) {
      const idx = unified.indexOf('/uploads/');
      if (idx < 0) return null;
      return unified.slice(idx + '/uploads/'.length);
    }
    if (/^[a-zA-Z]:\//.test(unified)) {
      const idx = unified.toLowerCase().indexOf('/uploads/');
      return idx >= 0 ? unified.slice(idx + '/uploads/'.length) : null;
    }
    const idx = unified.indexOf('/uploads/');
    if (idx >= 0) return unified.slice(idx + '/uploads/'.length).replace(/^\/+/, '');
    if (unified.startsWith('uploads/')) return unified.slice('uploads/'.length);
    return null;
  }

  /** `uploads/<dir>` 的绝对路径 */
  private uploadsAbs(dir: string): string {
    return join(process.cwd(), 'uploads', dir);
  }

  private absOf(rel: string): string {
    return join(process.cwd(), 'uploads', rel);
  }

  /** 目录下所有文件（相对 `uploads/` 的路径 + 大小），目录不存在则空 */
  private walk(dir: string): Array<{ rel: string; abs: string; bytes: number }> {
    const root = this.uploadsAbs(dir);
    const out: Array<{ rel: string; abs: string; bytes: number }> = [];
    if (!existsSync(root)) return out;
    const stack: string[] = [''];
    while (stack.length) {
      const sub = stack.pop() as string;
      const abs = sub ? join(root, sub) : root;
      let entries: string[];
      try {
        entries = readdirSync(abs);
      } catch {
        continue;
      }
      for (const name of entries) {
        const childAbs = join(abs, name);
        let st;
        try {
          st = statSync(childAbs);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          stack.push(sub ? `${sub}${sep}${name}` : name);
        } else if (st.isFile()) {
          const rel = `${dir}/${sub ? sub.split(sep).join('/') + '/' : ''}${name}`;
          out.push({ rel, abs: childAbs, bytes: st.size });
        }
      }
    }
    return out;
  }

  /** 相对路径的一级目录（归属判定用） */
  private ownerKeyOf(rel: string, dir: string): string {
    const rest = rel.startsWith(`${dir}/`) ? rel.slice(dir.length + 1) : rel;
    const idx = rest.indexOf('/');
    return idx < 0 ? '' : rest.slice(0, idx);
  }

  /**
   * 判定一个文件是否「无主」——**体检与清理都必须走这一个函数**（两边各写一份必然漂移）。
   *
   * ⚠️⚠️ 优先级：**先看直接引用，再看目录名**。这里踩过一次真实的坑：
   * 目录名是**转录项目 id**，而引用这个文件的却是从该项目回流出来的 **Score** —— 两个 id 不同，
   * 于是「目录名不在 id 集合里」就把**在用的文件**判成了孤儿，一清就把
   * `Score.originalAudio` / `Track.audioUrl` 指向的文件删了（悬空引用从 21 涨到 146）。
   * 教训：**目录名只是辅助规则，永远不能推翻“数据库里有字段指向它”这个事实。**
   */
  private isOrphan(
    rel: string,
    domain: string,
    ctx: { referenced: Set<string>; scoreIds: Set<string>; projectIds: Set<string> },
  ): boolean {
    const key = this.ownerKeyOf(rel, domain);
    /** ① 只要有任何一个 DB 字段指向它 → 不是孤儿（外链不算，已在归一化时被剔除） */
    if (ctx.referenced.has(rel.toLowerCase())) return false;

    /** ② tab-projects：在用曲目目录下的多版本是「导入历史库」，保留 */
    if (domain === 'tab-projects') return !!key && !ctx.scoreIds.has(key);

    /** ③ measures：曲目没了 → 整目录无主；在用曲目里没被引用的旧切片 → 无主 */
    if (domain === 'measures') return !key || !ctx.scoreIds.has(key);

    /** ④ transcriptions：目录名不是项目 id / 曲目 id → 无主（项目删除后的残留） */
    if (!key) return true;
    return !ctx.projectIds.has(key) && !ctx.scoreIds.has(key);
  }

  /** 当前所有「本地引用」集合（小写，用于比对） */
  private async referencedSet(): Promise<Set<string>> {
    return new Set((await this.allLocalRefs()).map((r) => r.toLowerCase()));
  }

  // ── 体检 ────────────────────────────────────────────────────

  async audit(): Promise<StorageHealth> {
    /** 一次性把「谁引用了哪个文件」全查出来（量级：本项目几十~几千行，够快） */
    const [projects, transcribeTracks, scores, scoreTracks, measureTracks, packages] =
      await Promise.all([
        this.prisma.project.findMany({
          select: { id: true, title: true, status: true, audioPath: true, scoreId: true },
        }),
        this.prisma.transcribeTrack.findMany({
          select: {
            projectId: true,
            instrument: true,
            stemPath: true,
            midiPath: true,
            tabPath: true,
          },
        }),
        this.prisma.score.findMany({
          select: {
            id: true,
            title: true,
            status: true,
            originalAudio: true,
            coverUrl: true,
          },
        }),
        this.prisma.track.findMany({
          select: { id: true, scoreId: true, instrument: true, audioUrl: true, jsonUrl: true },
        }),
        this.prisma.measureTrack.findMany({
          select: {
            id: true,
            audioUrl: true,
            originalAudioUrl: true,
            tabImageUrl: true,
            notes: true,
            measure: { select: { scoreId: true, index: true } },
          },
        }),
        this.prisma.practicePackage.findMany({
          select: { id: true, projectId: true, scoreId: true },
        }),
      ]);

    const measureCounts = await this.prisma.measure.groupBy({
      by: ['scoreId'],
      _count: { _all: true },
    });
    const measureCountByScore = new Map(measureCounts.map((m) => [m.scoreId, m._count._all]));

    const scoreIds = new Set(scores.map((s) => s.id));
    const projectIds = new Set(projects.map((p) => p.id));

    /** 记录 → 文件（用于「悬空引用」） */
    const refs: LocalRef[] = [];
    for (const p of projects) {
      refs.push({ rel: this.toLocalRel(p.audioPath) || '', owner: `项目「${p.title}」`, field: 'audioPath' });
    }
    for (const t of transcribeTracks) {
      for (const [field, v] of [
        ['stemPath', t.stemPath],
        ['midiPath', t.midiPath],
        ['tabPath', t.tabPath],
      ] as const) {
        refs.push({
          rel: this.toLocalRel(v) || '',
          owner: `分轨 ${t.instrument}@${t.projectId}`,
          field,
        });
      }
    }
    for (const s of scores) {
      refs.push({ rel: this.toLocalRel(s.originalAudio) || '', owner: `曲目「${s.title}」`, field: 'originalAudio' });
      refs.push({ rel: this.toLocalRel(s.coverUrl) || '', owner: `曲目「${s.title}」`, field: 'coverUrl' });
    }
    for (const t of scoreTracks) {
      refs.push({
        rel: this.toLocalRel(t.audioUrl) || '',
        owner: `分轨 ${t.instrument}@${t.scoreId}`,
        field: 'audioUrl',
      });
      refs.push({
        rel: this.toLocalRel(t.jsonUrl) || '',
        owner: `分轨 ${t.instrument}@${t.scoreId}`,
        field: 'jsonUrl',
      });
    }
    for (const m of measureTracks) {
      for (const [field, v] of [
        ['audioUrl', m.audioUrl],
        ['originalAudioUrl', m.originalAudioUrl],
        ['tabImageUrl', m.tabImageUrl],
      ] as const) {
        refs.push({
          rel: this.toLocalRel(v) || '',
          owner: `小节 ${m.measure.scoreId}#${m.measure.index}`,
          field,
        });
      }
    }
    const localRefs = refs.filter((r) => r.rel);

    /** 只要本地文件被引用到，就记下来（按相对路径归一，大小写不敏感） */
    const referenced = new Map<string, LocalRef[]>();
    for (const r of localRefs) {
      const key = r.rel.toLowerCase();
      referenced.set(key, [...(referenced.get(key) || []), r]);
    }

    /** 悬空引用：库里有、盘上没有。
     *
     * ⚠️ 计数用**完整列表**，样本才截断 —— 之前按「样本前 20 条」再按前缀分组统计，
     * 结果全局说 21 条、分目录加起来只有 20 条（第 21 条既没显示也没归属，等于丢了一条）。
     * 报告宁可难看也不能少报：**计数与样本必须来自同一个集合，只是样本会截断**。
     */
    const missingAll: Array<{ rel: string; owner: string; field: string }> = [];
    for (const r of localRefs) {
      if (existsSync(this.absOf(r.rel))) continue;
      missingAll.push({ rel: r.rel, owner: r.owner, field: r.field });
    }
    const missingRefs = missingAll.length;
    const missingSample = missingAll.slice(0, 20);

    // ── ① transcriptions ─────────────────────────────────────
    const refCtx = {
      referenced: new Set(localRefs.map((r) => r.rel.toLowerCase())),
      scoreIds,
      projectIds,
    };
    const transcriptionFiles = this.walk('transcriptions');
    const transcriptionOrphans = transcriptionFiles.filter((f) =>
      this.isOrphan(f.rel, 'transcriptions', refCtx),
    );

    // ── ② measures ───────────────────────────────────────────
    const measureFiles = this.walk('measures');
    const measureOrphans = measureFiles.filter((f) => this.isOrphan(f.rel, 'measures', refCtx));

    // ── ③ tab-projects ───────────────────────────────────────
    const tabFiles = this.walk('tab-projects');
    const tabOrphans = tabFiles.filter((f) => this.isOrphan(f.rel, 'tab-projects', refCtx));

    // ── ④ demo（可重建缓存，只报告） ───────────────────────────
    const demoFiles = this.walk('demo');

    // ── 结构性缺失（数据缺失的另一半） ─────────────────────────
    const dataGaps = this.collectDataGaps({
      projects,
      packages,
      scores,
      scoreTracks,
      measureTracks,
      measureCountByScore,
    });

    const domainOf = (
      domain: string,
      label: string,
      files: Array<{ rel: string; bytes: number }>,
      orphans: Array<{ rel: string; bytes: number }>,
      orphanReason: string,
      cleanable: boolean,
      note: string,
    ): StorageDomainReport => ({
      domain,
      dir: domain,
      label,
      files: files.length,
      bytes: files.reduce((s, f) => s + f.bytes, 0),
      orphanFiles: orphans.length,
      orphanBytes: orphans.reduce((s, f) => s + f.bytes, 0),
      /** 计数来自完整列表，样本才是截断的（见 missingAll 注释） */
      missingRefs: missingAll.filter((m) => m.rel.startsWith(`${domain}/`)).length,
      orphanSample: orphans
        .slice(0, 20)
        .map((o) => ({ rel: o.rel, bytes: o.bytes, reason: orphanReason })),
      missingSample: missingSample.filter((m) => m.rel.startsWith(`${domain}/`)),
      dataGaps: dataGaps.filter((g) => g.domain === domain).map((g) => g.message),
      cleanable,
      note,
    });

    const domains: StorageDomainReport[] = [
      domainOf(
        'transcriptions',
        '转录项目文件（原始音频 / 分轨 / MIDI / 谱面 JSON）',
        transcriptionFiles,
        transcriptionOrphans,
        '一级目录名（项目 id / 曲目 id）在数据库里找不到对应记录',
        true,
        '目录名是主记录 id；只要记录还在，目录里的中间产物一律保留。',
      ),
      domainOf(
        'measures',
        '小节切片音频 / 谱面图',
        measureFiles,
        measureOrphans,
        '所属曲目已删除，或该切片已不被任何 MeasureTrack 引用（重新发布后的旧文件）',
        true,
        '在用曲目目录里的未引用切片也清 —— 重新发布会重新生成，控制器自己在重发前也会清目录。',
      ),
      domainOf(
        'tab-projects',
        '导入的六线谱工程 JSON',
        tabFiles,
        tabOrphans,
        '曲目已删除，目录无人认领',
        true,
        '在用曲目下的多版本是「导入历史库」（后台可浏览/回灌），不清理。',
      ),
      domainOf(
        'demo',
        '示范 / 节拍器 / 和弦试听 WAV',
        demoFiles,
        [],
        '',
        false,
        '按需合成的缓存（按标注重算即可得到同样文件），不属于任何记录 → 只报告，不清理。',
      ),
    ];

    const totals = {
      files: domains.reduce((s, d) => s + d.files, 0),
      bytes: domains.reduce((s, d) => s + d.bytes, 0),
      orphanFiles: domains.reduce((s, d) => s + d.orphanFiles, 0),
      orphanBytes: domains.reduce((s, d) => s + d.orphanBytes, 0),
      missingRefs,
      dataGaps: dataGaps.length,
    };
    this.logger.log(
      `存储体检：${totals.files} 个文件 / ${(totals.bytes / 1024 / 1024).toFixed(1)}MB，` +
        `孤儿 ${totals.orphanFiles} 个（${(totals.orphanBytes / 1024 / 1024).toFixed(2)}MB），` +
        `悬空引用 ${totals.missingRefs}，数据缺失 ${totals.dataGaps}`,
    );
    return { checkedAt: new Date().toISOString(), totals, domains };
  }

  /**
   * 结构性缺失：记录在、但关键内容没落下来（C 端会看到空数据）。
   *
   * ⚠️ **只报「已发布/已上架」的那一侧**：草稿项目没有 Score、草稿曲目缺音符标注都是**正常中间态**
   * （流水线就是分步跑的）。把它们也列进来，体检报告就会充满噪声，最后没人看 ——
   * 体检的价值在于「列出来的都是真要处理的」。
   */
  private collectDataGaps(input: {
    projects: Array<{ id: string; title: string; status: string; scoreId: string | null }>;
    packages: Array<{ projectId: string; scoreId: string | null }>;
    scores: Array<{ id: string; title: string; status: string }>;
    scoreTracks: Array<{ scoreId: string; instrument: string; audioUrl: string; jsonUrl: string | null }>;
    measureTracks: Array<{ id: string; notes: string; audioUrl: string; measure: { scoreId: string; index: number } }>;
    measureCountByScore: Map<string, number>;
  }): Array<{ domain: string; message: string }> {
    const gaps: Array<{ domain: string; message: string }> = [];
    const packagedProjects = new Set(input.packages.map((p) => p.projectId));
    const publishedScoreIds = new Set(
      input.scores.filter((s) => s.status === 'published').map((s) => s.id),
    );
    const scoreTitleOf = new Map(input.scores.map((s) => [s.id, s.title]));

    for (const p of input.projects) {
      /** 已发布的项目却没有练习包快照 → C 端拿不到内容，这才是缺失 */
      if (p.status === 'published' && !packagedProjects.has(p.id)) {
        gaps.push({
          domain: 'transcriptions',
          message: `项目「${p.title}」状态是 published，但没有任何 PracticePackage 快照（C 端拿不到练习包）。`,
        });
      }
    }

    for (const s of input.scores) {
      const count = input.measureCountByScore.get(s.id) || 0;
      if (s.status === 'published' && count === 0) {
        gaps.push({
          domain: 'measures',
          message: `曲目「${s.title}」已发布但没有一个小节（C 端练习页会是空的）。`,
        });
      }
    }

    for (const t of input.scoreTracks) {
      /** 只有已发布曲目的分轨缺 jsonUrl 才算缺失（草稿还在导入途中） */
      if (t.jsonUrl || !publishedScoreIds.has(t.scoreId)) continue;
      gaps.push({
        domain: 'tab-projects',
        message: `已发布曲目「${scoreTitleOf.get(t.scoreId) || t.scoreId}」的分轨 ${t.instrument} 没有 jsonUrl（谱面 JSON 未挂上，后台无法溯源/回灌）。`,
      });
    }

    for (const m of input.measureTracks) {
      if (!publishedScoreIds.has(m.measure.scoreId)) continue;
      const notes = (m.notes || '').trim();
      const title = scoreTitleOf.get(m.measure.scoreId) || m.measure.scoreId;
      if (!notes || notes === '[]') {
        gaps.push({
          domain: 'measures',
          message: `已发布曲目「${title}」第 ${m.measure.index} 小节的分轨没有音符标注（C 端六线谱节点会是空的）。`,
        });
      }
      if (!m.audioUrl) {
        gaps.push({
          domain: 'measures',
          message: `已发布曲目「${title}」第 ${m.measure.index} 小节的分轨没有音频地址（点了播不出声音）。`,
        });
      }
    }

    /** 同一条曲目重复报很多遍没意义，按 domain+message 去重并限量 */
    return [...new Map(gaps.map((g) => [`${g.domain}|${g.message}`, g])).values()].slice(0, 40);
  }

  // ── 清理 ────────────────────────────────────────────────────

  /**
   * 清理某个目录下的孤儿（**只删无主的**）。
   *
   * `dryRun: true` 时只算不删 —— 先给用户看一眼要删什么。
   * 判定**重新跑一遍**（不拿前端传来的列表去删），并且和体检共用 `isOrphan`，
   * 所以「体检里列出来的」与「清理会删的」永远一致。
   * 安全网：每个待删路径的绝对路径必须落在该 domain 根目录内。
   */
  async cleanup(domain: string, opts: { dryRun?: boolean } = {}): Promise<StorageCleanupResult> {
    const allowed = ['transcriptions', 'measures', 'tab-projects'];
    if (!allowed.includes(domain)) {
      throw new BadRequestException(
        `只支持清理 ${allowed.join(' / ')}（demo 是可重建缓存，不清理；curriculum 见课程资产接口）。`,
      );
    }

    const [referenced, scoreIds, projectIds] = await Promise.all([
      this.referencedSet(),
      this.prisma.score.findMany({ select: { id: true } }).then((r) => new Set(r.map((s) => s.id))),
      this.prisma.project.findMany({ select: { id: true } }).then((r) => new Set(r.map((p) => p.id))),
    ]);
    const ctx = { referenced, scoreIds, projectIds };

    /** 安全网：domain 必须是真的目录名（防 `../` 之类），且下面每个绝对路径都要落在它之内 */
    const root = this.uploadsAbs(domain);
    const targets = this.walk(domain).filter((f) => this.isOrphan(f.rel, domain, ctx));

    const result: StorageCleanupResult = {
      domain,
      dryRun: !!opts.dryRun,
      removedFiles: 0,
      freedBytes: 0,
      removedDirs: [],
      sample: [],
      skipped: [],
    };

    for (const f of targets) {
      /** 安全网：绝对路径必须在 domain 根目录里 */
      const abs = join(process.cwd(), 'uploads', f.rel);
      if (!abs.startsWith(root + sep)) {
        result.skipped.push(`${f.rel}（不在 ${domain} 目录内，跳过）`);
        continue;
      }
      if (opts.dryRun) {
        result.removedFiles += 1;
        result.freedBytes += f.bytes;
        if (result.sample.length < 30) result.sample.push(f.rel);
        continue;
      }
      try {
        rmSync(abs, { force: true });
        result.removedFiles += 1;
        result.freedBytes += f.bytes;
        if (result.sample.length < 30) result.sample.push(f.rel);
      } catch (err) {
        result.skipped.push(`${f.rel}（${(err as Error).message}）`);
      }
    }

    /** 删完文件后，顺手收掉空目录（只收本 domain 下变成空的目录） */
    if (!opts.dryRun) {
      result.removedDirs = this.pruneEmptyDirs(domain);
    }

    this.logger.log(
      `存储清理 ${domain}${opts.dryRun ? '（演练）' : ''}：文件 ${result.removedFiles} 个 / ` +
        `${(result.freedBytes / 1024 / 1024).toFixed(2)}MB，空目录 ${result.removedDirs.length} 个`,
    );
    return result;
  }

  /**
   * 所有本地引用（清理时用完整集合，不用 audit 的样本）。
   *
   * ⚠️ 除了「一个字段一个路径」的那些，还必须扫 **JSON 里嵌着的 URL**：
   * `PracticePackage.payload`（下发给 C 端的契约快照）与 `TranscribeJob.input/output`
   * 里都写着 `/uploads/...` 的音频地址。漏了它们，就会把**已发布快照正在用的切片**当孤儿删掉
   * （C 端播放会 404）—— 这类字段最容易被「按字段名找路径」的写法漏掉。
   */
  private async allLocalRefs(): Promise<string[]> {
    const [projects, transcribeTracks, scores, scoreTracks, measureTracks, packages, jobs] =
      await Promise.all([
        this.prisma.project.findMany({ select: { audioPath: true } }),
        this.prisma.transcribeTrack.findMany({
          select: { stemPath: true, midiPath: true, tabPath: true },
        }),
        this.prisma.score.findMany({ select: { originalAudio: true, coverUrl: true } }),
        this.prisma.track.findMany({ select: { audioUrl: true, jsonUrl: true } }),
        this.prisma.measureTrack.findMany({
          select: { audioUrl: true, originalAudioUrl: true, tabImageUrl: true },
        }),
        this.prisma.practicePackage.findMany({ select: { payload: true } }),
        this.prisma.transcribeJob.findMany({ select: { input: true, output: true } }),
      ]);
    const raw: Array<string | null> = [
      ...projects.map((p) => p.audioPath),
      ...transcribeTracks.flatMap((t) => [t.stemPath, t.midiPath, t.tabPath]),
      ...scores.flatMap((s) => [s.originalAudio, s.coverUrl]),
      ...scoreTracks.flatMap((t) => [t.audioUrl, t.jsonUrl]),
      ...measureTracks.flatMap((m) => [m.audioUrl, m.originalAudioUrl, m.tabImageUrl]),
    ];

    /** JSON 里嵌的 `/uploads/...`（契约快照 / 任务入参出参） */
    for (const text of [
      ...packages.map((p) => p.payload),
      ...jobs.flatMap((j) => [j.input, j.output]),
    ]) {
      if (!text) continue;
      for (const m of text.matchAll(/\/uploads\/[A-Za-z0-9_\-./%]+/g)) {
        raw.push(m[0]);
      }
    }

    return raw.map((v) => this.toLocalRel(v)).filter((v): v is string => !!v);
  }

  /** 删掉空目录（自下而上） */
  private pruneEmptyDirs(domain: string): string[] {
    const root = this.uploadsAbs(domain);
    const removed: string[] = [];
    const visit = (abs: string, rel: string): boolean => {
      if (!existsSync(abs) || !statSync(abs).isDirectory()) return false;
      let entries: string[];
      try {
        entries = readdirSync(abs);
      } catch {
        return false;
      }
      let empty = true;
      for (const name of entries) {
        const childAbs = join(abs, name);
        const childRel = `${rel}/${name}`;
        if (statSync(childAbs).isDirectory()) {
          const childEmpty = visit(childAbs, childRel);
          if (!childEmpty) empty = false;
        } else {
          empty = false;
        }
      }
      if (empty && abs !== root) {
        try {
          rmSync(abs, { recursive: true, force: true });
          removed.push(childRelToUploads(domain, rel));
        } catch {
          /* 占用中就算了 */
        }
      }
      return empty;
    };
    visit(root, '');
    return removed;
  }
}

/** `pruneEmptyDirs` 里把相对路径拼回 `uploads/...` 的写法（保持与体检输出一致） */
function childRelToUploads(domain: string, rel: string): string {
  const clean = rel.replace(/^\/+/, '');
  return clean ? `${domain}/${clean}` : domain;
}
