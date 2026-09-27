import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

/**
 * 课程大纲的**静态资源**（目前只有课程封面图）
 * ==========================================
 *
 * ## 为什么单独一个 service
 *
 * `CurriculumService` 管的是「那份 JSON 文档」；封面图是**二进制**，落盘方式、校验规则、
 * 缓存策略都跟文档不是一回事，混在一起会让那个文件的职责变糊。
 *
 * ## 设计要点
 *
 * 1. **base64 而不是 multipart**：与仓库既有做法一致（`POST /api/transcription/upload`、
 *    `/api/tab-import/parse` 都是 base64），`main.ts` 的 body limit 已是 30mb，
 *    这样不必引入 `@types/multer` / 文件中间件，**不新增任何依赖**。
 * 2. **内容寻址文件名**（`cover_<sha1前12位>.<ext>`）：同一张图重复上传 = 同一个文件，
 *    不会堆垃圾；文件名自带内容指纹 → 可以放心长缓存（与音频切片同一个理由）。
 * 3. **按 magic 判类型，不信扩展名**：扩展名由客户端给，magic 是文件自己说的。
 *    判不出来直接 400，而不是"按扩展名蒙一个"（否则会存下一堆打不开的"封面"）。
 * 4. **落 `uploads/curriculum/covers/`**：在已挂载的 `/uploads/` 静态目录之下，
 *    与既有音频资源同一套访问方式（CORS / 缓存头都已配好）。
 * 5. **返回相对路径 + 绝对 URL 两个值**：库里存**相对**（换域名不用重编课程），
 *    绝对 URL 只用于"刚上传完马上预览"。
 */

/** 允许的图片类型：magic → 扩展名 + MIME */
const IMAGE_TYPES: { ext: string; mime: string; match: (b: Buffer) => boolean }[] = [  {
    ext: '.png',
    mime: 'image/png',
    match: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: '.jpg',
    mime: 'image/jpeg',
    match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: '.webp',
    mime: 'image/webp',
    match: (b) =>
      b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    ext: '.gif',
    mime: 'image/gif',
    match: (b) => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8',
  },
];

/** 单张封面体积上限（封面图不需要很大；小程序端也确实要省流量） */
const MAX_COVER_BYTES = 4 * 1024 * 1024;

/**
 * 课程视频（教学视频）能直传多大。
 *
 * ⚠️ 这是**硬限制**，不是随手写的数字：`main.ts` 的 body limit 是 30mb，而 base64 会膨胀 4/3，
 * 所以 20MB 是能塞进去又有余量的上限。**真正的课程视频应该放 OSS/CDN 后把地址填进 CMS**
 * （`TeachingVideo.videoUrl` 本来就是这么设计的）；直传只适合短视频片段/本地演示。
 */
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** 允许的视频类型：magic → 扩展名 + MIME */
const VIDEO_TYPES: { ext: string; mime: string; match: (b: Buffer) => boolean }[] = [
  {
    ext: '.mp4',
    /** 'ftyp' 在偏移 4 处（前面是 4 字节 box 长度） */
    mime: 'video/mp4',
    match: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp',
  },
  {
    ext: '.webm',
    mime: 'video/webm',
    match: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
];

export interface StoredCover {
  /** 相对路径（**存库用**）：`/uploads/curriculum/covers/cover_ab12cd34ef56.png` */
  path: string;
  /** 绝对 URL（仅供"上传后立刻预览"） */
  url: string;
  mime: string;
  sizeBytes: number;
}

/**
 * 视频资产库里的一个**文件**（不是 `TeachingVideo` 那条元数据）。
 *
 * ⚠️ 两者必须先分清，否则会出现「上传了新视频，却不知道去哪儿找」：
 * - `TeachingVideo` = 课程文档里的**记录**（标题/讲师/打点/videoUrl）；
 * - 这里的 entry = 磁盘上 `uploads/curriculum/videos/` 里的**字节**（直传源文件 + 转码产物）。
 * 一条记录可以指向某个文件，也可以暂时不指向任何人（那就是「孤儿文件」）。
 */
export interface VideoAssetEntry {
  fileName: string;
  /** 相对路径（与 `TeachingVideo.videoUrl` 同一套写法） */
  relativePath: string;
  /** 绝对 URL（预览用） */
  url: string;
  /** `source` = CMS 直传上来的源文件；`transcoded` = ffmpeg 转码产物 */
  folder: 'source' | 'transcoded';
  sizeBytes: number;
  mtimeMs: number;
}

/** 封面图资产（与视频同一套口径，只是没有 transcoded 分层） */
export interface CoverAssetEntry {
  fileName: string;
  relativePath: string;
  url: string;
  sizeBytes: number;
  mtimeMs: number;
}

/** 本地资产的两类目录 */
export type AssetKind = 'video' | 'cover';

@Injectable()
export class CurriculumAssetsService {
  private readonly logger = new Logger(CurriculumAssetsService.name);

  /** `uploads/curriculum/covers/`（不存在则创建） */
  private coversDir(): string {
    const dir = join(process.cwd(), 'uploads', 'curriculum', 'covers');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 相对路径/绝对 URL → 可访问的绝对 URL（外链原样返回） */
  toAbsoluteUrl(value?: string): string | undefined {
    const raw = (value || '').trim();
    if (!raw) return undefined;
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    const host = process.env.APP_URL || 'http://localhost:3000';
    return `${host}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  // ── 资产路径归一 / 分类（引用对账的**唯一**口径，别在别处再写一份） ──────────

  /**
   * 任意写法 → 本地相对路径（`/uploads/curriculum/...`）。
   *
   * - 绝对 URL（含 `http://localhost:3000/uploads/...` 与 `https://cdn...`）→ 截到 `/uploads/` 之后；
   * - 外链（没有 `/uploads/`）与 `data:` → **null**（不是本地文件，不参与对账）；
   * - 相对路径 → 补前导斜杠。
   */
  toRelativeAssetPath(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || raw.startsWith('data:')) return null;
    if (/^https?:\/\//i.test(raw)) {
      const idx = raw.indexOf('/uploads/');
      return idx >= 0 ? raw.slice(idx) : null;
    }
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  /** 是不是「本地资产路径」——只有它为真时才能谈「文件在不在」 */
  isLocalAssetPath(value: unknown): boolean {
    const rel = this.toRelativeAssetPath(value);
    return !!rel && /^\/uploads\/curriculum\/(covers|videos)\//.test(rel);
  }

  /** 按路径判断属于哪类资产（删/定位都要先知道是哪一类） */
  assetKindOf(value: unknown): AssetKind | null {
    const rel = this.toRelativeAssetPath(value);
    if (!rel) return null;
    if (rel.startsWith('/uploads/curriculum/covers/')) return 'cover';
    if (rel.startsWith('/uploads/curriculum/videos/')) return 'video';
    return null;
  }

  /**
   * 本地相对路径 → 绝对路径（带**目录穿越防护**）。
   *
   * ⚠️ `value` 可能直接来自客户端（`?path=`），`../../.env` 这种必须拦住：
   * 先归一成相对路径，再用 `resolve` 归一化，最后确认真的落在目标目录里
   * （只比字符串前缀是拦不住的）。
   */
  resolveAssetPath(value: unknown): { kind: AssetKind; abs: string } {
    const kind = this.assetKindOf(value);
    const rel = this.toRelativeAssetPath(value);
    if (!kind || !rel) {
      throw new BadRequestException('path 必须指向 uploads/curriculum/{covers,videos}/ 下的文件。');
    }
    const root = kind === 'cover' ? this.coversDir() : this.videosDir();
    const sub = rel.slice(`/uploads/curriculum/${kind === 'cover' ? 'covers' : 'videos'}/`.length);
    const abs = resolve(root, sub);
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new BadRequestException('path 必须指向 uploads/curriculum/{covers,videos}/ 下的文件。');
    }
    return { kind, abs };
  }

  /** 本地文件是否真的存在（外链/非资产路径一律 false，调用方需先问 `isLocalAssetPath`） */
  assetExists(value: unknown): boolean {
    if (!this.isLocalAssetPath(value)) return false;
    try {
      const { abs } = this.resolveAssetPath(value);
      return existsSync(abs) && statSync(abs).isFile();
    } catch {
      return false;
    }
  }

  /** 保存一张封面（base64）→ 返回相对路径 + 绝对 URL */
  saveCover(input: { base64?: string; fileName?: string }): StoredCover {
    const raw = (input.base64 || '').trim();
    if (!raw) {
      throw new BadRequestException('缺少 base64 图片内容（字段名 `base64`）。');
    }
    /** 容忍 `data:image/png;base64,xxxx` 形式（前端 <input type=file> 读出来就是这个） */
    const pure = raw.includes(';base64,') ? raw.slice(raw.indexOf(';base64,') + 8) : raw;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(pure, 'base64');
    } catch {
      throw new BadRequestException('base64 解码失败，请确认内容是合法 base64。');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('解码后的图片内容为空。');
    }
    if (buffer.length > MAX_COVER_BYTES) {
      throw new BadRequestException(
        `封面图过大（${(buffer.length / 1024 / 1024).toFixed(1)}MB），上限 ` +
          `${(MAX_COVER_BYTES / 1024 / 1024).toFixed(0)}MB。建议压到 1600px 宽以内。`,
      );
    }

    const type = IMAGE_TYPES.find((t) => t.match(buffer));
    if (!type) {
      throw new BadRequestException(
        `无法识别图片格式（文件名「${input.fileName || '(空)'}」）。仅支持 PNG / JPG / WEBP / GIF；` +
          `请确认选的是图片文件（不是 .heic / .svg / 重命名的其它文件）。`,
      );
    }

    const digest = createHash('sha1').update(buffer).digest('hex').slice(0, 12);
    const fileName = `cover_${digest}${type.ext}`;
    const absolutePath = join(this.coversDir(), fileName);
    /** 同名 = 同内容，无需重写（避免无意义地刷 mtime） */
    if (!existsSync(absolutePath)) {
      writeFileSync(absolutePath, buffer);
      this.logger.log(`已保存课程封面：${fileName}（${(buffer.length / 1024).toFixed(0)}KB, ${type.mime}）`);
    }

    const relative = `/uploads/curriculum/covers/${fileName}`;
    return {
      path: relative,
      url: this.toAbsoluteUrl(relative) as string,
      mime: type.mime,
      sizeBytes: buffer.length,
    };
  }

  /** `uploads/curriculum/videos/`（不存在则创建） */
  private videosDir(): string {
    const dir = join(process.cwd(), 'uploads', 'curriculum', 'videos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * 保存一段课程视频（base64 直传，≤20MB）。
   *
   * ⚠️ **不做转码**：ffmpeg 转码是多分辨率产物链，属于另一个量级的工程（且小机器上跑不动）。
   * 这里只做「校验 + 落盘 + 给个能播的 URL」，**大视频请用 OSS/CDN 地址**。
   * 前端会拿到 `mime`，可以据此提示"直传的是源文件、未转码"。
   */
  saveVideo(input: { base64?: string; fileName?: string }): StoredCover {
    const raw = (input.base64 || '').trim();
    if (!raw) {
      throw new BadRequestException('缺少 base64 视频内容（字段名 `base64`）。');
    }
    const pure = raw.includes(';base64,') ? raw.slice(raw.indexOf(';base64,') + 8) : raw;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(pure, 'base64');
    } catch {
      throw new BadRequestException('base64 解码失败，请确认内容是合法 base64。');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('解码后的视频内容为空。');
    }
    if (buffer.length > MAX_VIDEO_BYTES) {
      throw new BadRequestException(
        `视频过大（${(buffer.length / 1024 / 1024).toFixed(1)}MB），直传上限 ` +
          `${(MAX_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB。请把大视频放到 OSS/CDN 后填地址，` +
          `或先切成短视频片段。`,
      );
    }

    const type = VIDEO_TYPES.find((t) => t.match(buffer));
    if (!type) {
      throw new BadRequestException(
        `无法识别视频格式（文件名「${input.fileName || '(空)'}」）。仅支持 MP4 / WEBM；` +
          `其它格式（.mov / .mkv / .avi 等）请先用 ffmpeg 转成 mp4。`,
      );
    }

    const digest = createHash('sha1').update(buffer).digest('hex').slice(0, 12);
    const fileName = `video_${digest}${type.ext}`;
    const absolutePath = join(this.videosDir(), fileName);
    if (!existsSync(absolutePath)) {
      writeFileSync(absolutePath, buffer);
      this.logger.log(`已保存课程视频：${fileName}（${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${type.mime}）`);
    }

    const relative = `/uploads/curriculum/videos/${fileName}`;
    return {
      path: relative,
      url: this.toAbsoluteUrl(relative) as string,
      mime: type.mime,
      sizeBytes: buffer.length,
    };
  }

  // ── 统一资产库：列 / 定位 / 删（都是"文件"层面的操作，不碰课程文档） ──────────

  /**
   * 列出 `uploads/curriculum/videos/` 下的所有视频文件（含 `transcoded/`）。
   *
   * 按 mtime 倒序（刚上传的在最上面）。**不做 ffprobe**：那是 `CurriculumTranscodeService` 的活，
   * 由 controller 把两者拼起来（避免两个 service 互相依赖）。
   */
  listVideos(): VideoAssetEntry[] {
    const dir = this.videosDir();
    const out: VideoAssetEntry[] = [];
    const push = (abs: string, folder: VideoAssetEntry['folder']) => {
      const st = statSync(abs);
      if (!st.isFile()) return;
      const fileName = basename(abs);
      const relativePath =
        folder === 'transcoded'
          ? `/uploads/curriculum/videos/transcoded/${fileName}`
          : `/uploads/curriculum/videos/${fileName}`;
      out.push({
        fileName,
        relativePath,
        url: this.toAbsoluteUrl(relativePath) as string,
        folder,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    };

    for (const name of readdirSync(dir)) {
      /** `transcoded/` 单独走一遍，保持「源文件 / 产物」两类可区分 */
      if (name === 'transcoded') continue;
      try {
        push(join(dir, name), 'source');
      } catch {
        /** 扫描过程中被删掉/占用：跳过即可，不该让整个列表失败 */
      }
    }
    const transcodeDir = join(dir, 'transcoded');
    if (existsSync(transcodeDir)) {
      for (const name of readdirSync(transcodeDir)) {
        try {
          push(join(transcodeDir, name), 'transcoded');
        } catch {
          /* 同上 */
        }
      }
    }

    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  /**
   * 列出 `uploads/curriculum/covers/` 下的所有封面图。
   *
   * ⚠️ 封面跟视频一样会变成**孤儿**：CMS 里换一张封面（或清空 `coverImage`）
   * 只是把文档里的字段改掉，旧文件会一直留在磁盘上。
   */
  listCovers(): CoverAssetEntry[] {
    const dir = this.coversDir();
    const out: CoverAssetEntry[] = [];
    for (const name of readdirSync(dir)) {
      try {
        const abs = join(dir, name);
        const st = statSync(abs);
        if (!st.isFile()) continue;
        const relativePath = `/uploads/curriculum/covers/${name}`;
        out.push({
          fileName: name,
          relativePath,
          url: this.toAbsoluteUrl(relativePath) as string,
          sizeBytes: st.size,
          mtimeMs: st.mtimeMs,
        });
      } catch {
        /** 扫描中被删/被占用：跳过，不让整个列表失败 */
      }
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  /** 只针对视频的相对路径 → 绝对路径（转码/ffprobe 要的是绝对路径） */
  resolveVideoPath(value: string): string {
    const { kind, abs } = this.resolveAssetPath(value);
    if (kind !== 'video') {
      throw new BadRequestException('这个路径不是视频资产（应在 uploads/curriculum/videos/ 下）。');
    }
    return abs;
  }

  /**
   * 删一个本地资产文件（视频或封面）。
   *
   * 只删字节 —— **引用关系由 controller 先查课程文档再决定拦不拦**（409），
   * 因为 service 这一层不该知道课程文档的形状。
   */
  deleteAsset(value: string): { kind: AssetKind; relativePath: string; sizeBytes: number } {
    const rel = this.toRelativeAssetPath(value);
    const { kind, abs } = this.resolveAssetPath(value);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new NotFoundException(`文件不存在（可能已被删除）：${rel}`);
    }
    const sizeBytes = statSync(abs).size;
    unlinkSync(abs);
    this.logger.log(
      `已删除课程${kind === 'cover' ? '封面' : '视频'}资产：${basename(abs)}（${(sizeBytes / 1024).toFixed(0)}KB）`,
    );
    return { kind, relativePath: rel as string, sizeBytes };
  }
}
