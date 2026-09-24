import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { PythonRunnerService } from './python-runner.service';
import {
  AUDIO_EXTENSIONS,
  AUDIO_MAGIC,
  MAX_UPLOAD_BYTES,
  isDirectMediaUrl,
} from './transcription.types';

export interface StoredAudio {
  /** 落盘后的绝对路径 */
  absolutePath: string;
  /** 可直接下发给前端/ffmpeg 的 URL（基于 /uploads 静态目录） */
  url: string;
  /** 相对项目根目录的路径（便于存库与迁移） */
  relativePath: string;
  fileName: string;
  ext: string;
  sizeBytes: number;
  /** 魔数校验结果：false 表示扩展名与内容疑似不符（仅告警） */
  magicVerified: boolean;
}

export interface DownloadResult extends StoredAudio {
  /** yt-dlp / HTTP 得到的媒体标题 */
  title?: string;
  durationSec?: number;
  /** 是否走 yt-dlp（false = 直链 HTTP 下载） */
  viaYtDlp: boolean;
}

export interface AudioProbe {
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  format?: string;
}

/**
 * 音频上传 / URL 下载服务
 * ======================
 *
 * 两条入口，产出同一种「归一化后的本地音频」：
 *
 * ```
 * ① POST base64(MP3/WAV/FLAC) ─► 扩展名+魔数校验 ─► uploads/transcriptions/<id>/source.<ext>
 * ② POST { url }              ─► yt-dlp -x --audio-format wav ─┘
 *                                （yt-dlp 缺失时对直链音频走 HTTP 下载）
 * ```
 *
 * 为什么用 base64 而不是 multipart？
 * ----
 * 与既有 `POST /api/tab-import/parse`（.gpx / .musicxml 也是 base64）保持一致，
 * 而 `main.ts` 里已经把 body limit 提到 30mb；这样无需引入 `@types/multer`
 * 与额外的文件中间件，**不新增依赖**即可支持二进制上传。
 *
 * 目录约定（全部在既有 `uploads/` 静态目录之下，天然可被 /uploads 访问）：
 * ```
 * uploads/transcriptions/<projectId>/
 *   source.mp3        原始音频
 *   stems/guitar.wav  Demucs 分轨
 *   midi/guitar.mid   Basic Pitch MIDI
 *   tab/guitar.json   Tayuya TabProject
 * ```
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly python: PythonRunnerService) {}

  // ─────────────────────────────────────────
  // 路径工具
  // ─────────────────────────────────────────

  projectDir(projectId: string): string {
    return join(process.cwd(), 'uploads', 'transcriptions', projectId);
  }

  subDir(projectId: string, sub: 'stems' | 'midi' | 'tab' | 'measures'): string {
    const dir = join(this.projectDir(projectId), sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 绝对路径 → 可访问 URL（/uploads 已由 main.ts 挂载为静态目录） */
  toPublicUrl(absolutePath: string): string {
    const host = process.env.APP_URL || 'http://localhost:3000';
    const normalized = absolutePath.replace(/\\/g, '/');
    const marker = '/uploads/';
    const idx = normalized.toLowerCase().lastIndexOf(marker);
    if (idx >= 0) return `${host}${normalized.slice(idx)}`;
    return `${host}/uploads/transcriptions/${basename(absolutePath)}`;
  }

  /** 绝对路径 → 相对项目根的路径（存库用，换机器依然可解析） */
  toRelativePath(absolutePath: string): string {
    const cwd = process.cwd().replace(/\\/g, '/');
    const normalized = absolutePath.replace(/\\/g, '/');
    return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized;
  }

  // ─────────────────────────────────────────
  // ① 文件上传
  // ─────────────────────────────────────────

  /** 校验扩展名（MP3 / WAV / FLAC），返回小写扩展名 */
  assertSupportedExtension(fileName?: string): string {
    const ext = extname(fileName || '').toLowerCase();
    if (!ext) {
      throw new BadRequestException(
        `无法从文件名「${fileName || '(空)'}」判断音频格式，请提供带扩展名的文件名（${AUDIO_EXTENSIONS.join(' / ')}）。`,
      );
    }
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(
        `不支持的音频格式「${ext}」。仅支持 ${AUDIO_EXTENSIONS.join(' / ')}；` +
          `其它格式请先转换：ffmpeg -i input.xxx -ar 44100 output.wav`,
      );
    }
    return ext;
  }

  /** 魔数（文件头）校验：扩展名与内容是否一致 */
  verifyMagic(buffer: Buffer, ext: string): boolean {
    const rules = AUDIO_MAGIC[ext];
    if (!rules) return false;
    return rules.some((rule) =>
      rule.bytes.every((byte, i) => buffer.length > rule.offset + i && buffer[rule.offset + i] === byte),
    );
  }

  /**
   * 落盘一个 base64 上传的音频文件。
   * 参数与 `POST /api/tab-import/parse` 的 `base64` 字段保持一致的书写习惯。
   */
  async saveUpload(input: {
    projectId: string;
    fileName: string;
    base64?: string;
    /** 也允许直接传原始文本（不含 data: 前缀的纯 base64 之外的场景，例如调试） */
    sizeHint?: number;
  }): Promise<StoredAudio> {
    const ext = this.assertSupportedExtension(input.fileName);
    const raw = (input.base64 || '').trim();
    if (!raw) {
      throw new BadRequestException('缺少 base64 音频内容（字段名 `base64`）。');
    }
    // 容忍 `data:audio/mpeg;base64,xxxx` 形式
    const pure = raw.includes(';base64,') ? raw.slice(raw.indexOf(';base64,') + 8) : raw;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(pure, 'base64');
    } catch {
      throw new BadRequestException('base64 解码失败，请确认内容为合法 base64。');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('解码后的音频内容为空。');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `音频文件过大（${(buffer.length / 1024 / 1024).toFixed(1)}MB），上限 ` +
          `${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB。请压缩后重试或改用 URL 导入。`,
      );
    }

    const dir = this.projectDir(input.projectId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const target = join(dir, `source${ext}`);
    writeFileSync(target, buffer);

    const magicVerified = this.verifyMagic(buffer, ext);
    if (!magicVerified) {
      this.logger.warn(
        `扩展名与文件头不一致（${input.fileName} → ${ext}），仍按扩展名处理。` +
          `若不识别，请用 ffmpeg 统一转成 wav 后重试。`,
      );
    }

    this.logger.log(`已保存上传音频：${target}（${(buffer.length / 1024).toFixed(0)}KB, magic=${magicVerified}）`);

    return {
      absolutePath: target,
      url: this.toPublicUrl(target),
      relativePath: this.toRelativePath(target),
      fileName: `${basename(input.fileName, ext)}${ext}`,
      ext,
      sizeBytes: buffer.length,
      magicVerified,
    };
  }

  // ─────────────────────────────────────────
  // ② URL 下载（yt-dlp 优先）
  // ─────────────────────────────────────────

  /**
   * 从 URL 获取音频。
   *
   * 优先级：
   * 1. **yt-dlp**（支持 YouTube / Bilibili / SoundCloud / 网易云…），
   *    用 `-x --audio-format wav` 直接产出 44.1kHz WAV（正好是 Demucs / Basic Pitch 需要的格式）；
   * 2. yt-dlp 不可用时，若 URL 是**直链音频**（.mp3/.wav/.flac）→ HTTP 下载；
   * 3. 两者都不行 → 抛出可操作的错误信息（含安装命令）。
   */
  async downloadFromUrl(input: {
    projectId: string;
    url: string;
    /** 强制走 HTTP 直链下载（跳过 yt-dlp） */
    preferDirect?: boolean;
  }): Promise<DownloadResult> {
    const url = (input.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException(`URL 必须以 http:// 或 https:// 开头，收到：${url || '(空)'}`);
    }

    const caps = await this.python.probe();
    const dir = this.projectDir(input.projectId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (!input.preferDirect && caps.ytDlp.available) {
      const viaYtDlp = await this.downloadWithYtDlp(url, dir, caps.ytDlp.bin);
      if (viaYtDlp) return viaYtDlp;
      this.logger.warn(`yt-dlp 下载失败，尝试直链下载：${url}`);
    }

    if (isDirectMediaUrl(url)) {
      return await this.downloadDirect(url, dir, caps.ytDlp.available);
    }

    throw new BadRequestException(
      [
        `无法下载该 URL：${url}`,
        caps.ytDlp.available
          ? `yt-dlp 执行失败（详见服务端日志）。`
          : `未安装 yt-dlp（${caps.ytDlp.reason}），且该链接不是直链音频（.mp3/.wav/.flac）。`,
        ``,
        `可选方案：`,
        `  1. 安装 yt-dlp：pip install yt-dlp  然后重试；`,
        `  2. 直接把音频文件通过 POST /api/transcription/projects/upload 上传（base64）。`,
      ].join('\n'),
    );
  }

  private async downloadWithYtDlp(
    url: string,
    dir: string,
    ytDlpBin: string,
  ): Promise<DownloadResult | null> {
    const [bin, ...prefix] = ytDlpBin.split(/\s+/);
    const outputTemplate = join(dir, 'source.%(ext)s');
    const args = [
      ...prefix,
      '-x',
      '--audio-format',
      'wav',
      '--audio-quality',
      '0',
      '--no-playlist',
      '--restrict-filenames',
      '--no-warnings',
      '--newline',
      '--print-json',
      '-o',
      outputTemplate,
      url,
    ];
    if (ffmpegStatic) {
      args.splice(prefix.length, 0, '--ffmpeg-location', dirname(String(ffmpegStatic)));
    }

    const outcome = await this.python.run(bin, args, {
      cwd: dir,
      timeoutMs: Math.max(60_000, Number(process.env.YTDLP_TIMEOUT_MS) || 900_000),
    });

    const meta = extractLastJsonLine(outcome.stdout);
    const produced = this.findSourceFile(dir);

    if (!outcome.ok || !produced) {
      this.logger.warn(
        `yt-dlp 下载失败：${outcome.error || ''} ${(outcome.stderr || '').split('\n').slice(-3).join(' | ')}`,
      );
      return null;
    }

    const stat = statSync(produced);
    const ext = extname(produced).toLowerCase();
    const probe = await this.probeAudio(produced);
    const title = typeof meta?.title === 'string' ? meta.title : undefined;

    this.logger.log(
      `yt-dlp 下载完成：${produced}（${(stat.size / 1024 / 1024).toFixed(1)}MB，时长 ${probe.durationSec ?? '?'}s）`,
    );

    return {
      absolutePath: produced,
      url: this.toPublicUrl(produced),
      relativePath: this.toRelativePath(produced),
      fileName: basename(produced),
      ext,
      sizeBytes: stat.size,
      magicVerified: true,
      title,
      durationSec: probe.durationSec ?? (typeof meta?.duration === 'number' ? meta.duration : undefined),
      viaYtDlp: true,
    };
  }

  private async downloadDirect(
    url: string,
    dir: string,
    ytDlpAvailable: boolean,
  ): Promise<DownloadResult> {
    const ext = extname(url.split('?')[0]).toLowerCase() || '.mp3';
    const target = join(dir, `source${ext}`);
    const maxBytes = MAX_UPLOAD_BYTES * 2;

    this.logger.log(`直链下载：${url}`);
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'follow' });
    } catch (err: any) {
      throw new BadRequestException(`直链下载失败（网络错误）：${err?.message || err}\nURL: ${url}`);
    }
    if (!res.ok) {
      throw new BadRequestException(
        `直链下载失败（HTTP ${res.status}）${ytDlpAvailable ? '' : '；安装 yt-dlp 可支持更多站点：pip install yt-dlp'}\nURL: ${url}`,
      );
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
      throw new BadRequestException(
        `远端文件过大（${(contentLength / 1024 / 1024).toFixed(0)}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB）。`,
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new BadRequestException(`下载内容超出上限（${(buffer.length / 1024 / 1024).toFixed(0)}MB）。`);
    }
    writeFileSync(target, buffer);

    const probe = await this.probeAudio(target);
    return {
      absolutePath: target,
      url: this.toPublicUrl(target),
      relativePath: this.toRelativePath(target),
      fileName: basename(target),
      ext,
      sizeBytes: buffer.length,
      magicVerified: this.verifyMagic(buffer, ext),
      durationSec: probe.durationSec,
      viaYtDlp: false,
    };
  }

  /** 在项目目录里找到 `source.*`（yt-dlp 的扩展名可能随容器不同） */
  private findSourceFile(dir: string): string | null {
    if (!existsSync(dir)) return null;
    const entries = readdirSync(dir).filter((f) => f.toLowerCase().startsWith('source.'));
    if (entries.length === 0) return null;
    // 优先 wav（Demucs 输入格式最稳），否则取第一个
    const wav = entries.find((f) => f.toLowerCase().endsWith('.wav'));
    return join(dir, wav || entries[0]);
  }

  // ─────────────────────────────────────────
  // 元信息探测
  // ─────────────────────────────────────────

  /**
   * 用 ffmpeg 的 stderr 解析音频元信息。
   *
   * 为什么不引入 ffprobe？
   * ----
   * `ffmpeg-static` 只带 ffmpeg 可执行文件。`ffmpeg -i <file>` 虽然退出码为 1
   * （因为没有指定输出文件），但 stderr 里会打印完整的输入信息，足够解析出
   * 时长 / 采样率 / 声道，避免额外依赖 ffprobe。
   */
  async probeAudio(inputPath: string): Promise<AudioProbe> {
    if (!ffmpegStatic || !existsSync(inputPath)) return {};
    const stderr = await new Promise<string>((resolveOut) => {
      execFile(
        String(ffmpegStatic),
        ['-hide_banner', '-i', inputPath],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (_err, _stdout, stderrText) => resolveOut(String(stderrText || '')),
      );
    });

    const probe: AudioProbe = {};
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (durationMatch) {
      probe.durationSec = Number(
        (
          Number(durationMatch[1]) * 3600 +
          Number(durationMatch[2]) * 60 +
          Number(durationMatch[3])
        ).toFixed(3),
      );
    }
    const audioLine = stderr.match(/Audio:\s*([^,\n]+),\s*(\d+)\s*Hz,\s*([^,\n]+)/);
    if (audioLine) {
      probe.format = audioLine[1].trim();
      probe.sampleRate = Number(audioLine[2]);
      probe.channels = /stereo/i.test(audioLine[3])
        ? 2
        : /mono/i.test(audioLine[3])
          ? 1
          : undefined;
    }
    return probe;
  }

  /** 相对路径 / URL → 绝对路径（复用 AudioService 的解析习惯，但只处理本地文件） */
  resolveLocal(inputPath: string): string {
    const raw = (inputPath || '').trim().replace(/^file:\/\//i, '');
    if (!raw) return raw;
    const candidates = [
      raw,
      resolve(process.cwd(), raw),
      resolve(process.cwd(), 'uploads', raw.replace(/^[\\/]+/, '').replace(/^uploads[\\/]/i, '')),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return candidates[1];
  }
}

/** 从 stdout 里取出最后一个 JSON 对象（yt-dlp --print-json 的产物） */
function extractLastJsonLine(stdout: string): any | null {
  if (!stdout) return null;
  const lines = stdout.split(/\r?\n/).map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return null;
}
