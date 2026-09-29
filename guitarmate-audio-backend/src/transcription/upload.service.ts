import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import {
  PythonRunnerService,
  describeYtDlpCookieStateLines as describeCookieStateLines,
  inspectYtDlpCookieState,
} from './python-runner.service';
import { buildYtDlpArgs } from './ytdlp-args';
import { probeYoutubeSession, type YoutubeSessionProbe } from './youtube-session';
import {
  AUDIO_EXTENSIONS,
  AUDIO_MAGIC,
  MAX_UPLOAD_BYTES,
  isDirectMediaUrl,
  type WorkerCapabilities,
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
 * ⚠️ YouTube 现在**必须带 cookies**，否则固定返回「Sign in to confirm you're not a bot」。
 * cookie 来源（见 `resolveYtDlpCookies`）：`YTDLP_COOKIES`（cookies.txt）→
 * `YTDLP_COOKIES_FROM_BROWSER`（推荐 firefox）→ 自动识别后端根目录的 `cookies.txt`。
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

    let ytDlpFailure: string | undefined;
    if (!input.preferDirect && caps.ytDlp.available) {
      const attempt = await this.downloadWithYtDlp(url, dir, caps.ytDlp.bin);
      if (attempt.result) return attempt.result;
      ytDlpFailure = attempt.error;
      this.logger.warn(`yt-dlp 下载失败，尝试直链下载：${url}（${ytDlpFailure || '未知原因'}）`);
    }

    if (isDirectMediaUrl(url)) {
      return await this.downloadDirect(url, dir, caps.ytDlp.available);
    }

    /**
     * 带上 cookies 实测一次 YouTube 的登录态，再决定怎么说。
     *
     * 必要性：yt-dlp 那句「cookies are no longer valid」只在**部分**失败分支上打印，
     * 同一份 cookies 连跑两次可能只剩 `Sign in to confirm you're not a bot`，
     * 于是「cookies 作废」会被误报成「IP 被风控」→ 用户白折腾节点。
     * 探测是有事实依据的（YouTube 自己返回的 LOGGED_IN），且只在本机代理上跑，2~3s。
     */
    const sessionProbe = await this.probeSessionForDiagnosis(url, ytDlpFailure);

    throw new BadRequestException(buildDownloadFailureMessage({ url, caps, ytDlpFailure, sessionProbe }));
  }

  /**
   * 只在「确实可能是登录/风控问题」时探测，避免给「链接不合法」这类错误附加多余的网络请求。
   * 探测失败一律不影响主流程（降级为 undefined → 文案回退到原有猜测逻辑）。
   */
  private async probeSessionForDiagnosis(url: string, ytDlpFailure: string | undefined): Promise<YoutubeSessionProbe | undefined> {
    const kind = classifyYtDlpFailure(ytDlpFailure);
    /**
     * `unknown` 只在 **YouTube 链接** 上才值得探测：
     * 否则一个「链接不合法/站点不支持」的错误会被探测结果改写成「cookies 失效」，反而误导。
     */
    const isYoutube = isYoutubeUrl(url);
    if (kind !== 'bot-check' && !(kind === 'unknown' && isYoutube)) return undefined;
    if (!inspectYtDlpCookieState().usable) return undefined;
    try {
      const probe = await probeYoutubeSession();
      this.logger.warn(
        `YouTube 登录态实测：${probe.state}（${probe.route}，${probe.cookieCount} 条 cookies，${probe.elapsedMs}ms）—— ${probe.detail}`,
      );
      return probe;
    } catch (error) {
      this.logger.warn(`YouTube 登录态探测失败（忽略）：${(error as Error)?.message}`);
      return undefined;
    }
  }

  private async downloadWithYtDlp(
    url: string,
    dir: string,
    ytDlpBin: string,
  ): Promise<{ result: DownloadResult | null; error?: string }> {
    const [bin, ...prefix] = ytDlpBin.split(/\s+/);
    const outputTemplate = join(dir, 'source.%(ext)s');
    // 参数组装走共享模块（与本机下载代理逐字一致，避免两边行为漂移）
    const args = [
      ...prefix,
      ...buildYtDlpArgs({
        url,
        outTemplate: outputTemplate,
        ffmpegDir: ffmpegStatic ? dirname(String(ffmpegStatic)) : null,
        audioFormat: 'wav',
        printJson: true,
      }),
    ];

    const outcome = await this.python.run(bin, args, {
      cwd: dir,
      timeoutMs: Math.max(60_000, Number(process.env.YTDLP_TIMEOUT_MS) || 900_000),
    });

    const meta = extractLastJsonLine(outcome.stdout);
    const produced = this.findSourceFile(dir);

    if (!outcome.ok || !produced) {
      // 注意：execFile 的 err.message 形如 `Command failed: <cmd>\n<stderr>`，
      // 已包含 stderr，两者同时拼接会出现整段重复 → 优先用 stderr，并去掉命令回显。
      const stderrTail = (outcome.stderr || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^Command failed:/i.test(l))
        /**
         * ⚠️ 保留 **12 行**而不是 3 行。
         *
         * 决定性信息往往**不在最后一行**：例如「cookies 被浏览器轮换」时，yt-dlp 先打
         * `WARNING: The provided YouTube account cookies are no longer valid...`，
         * **然后**才是 `ERROR: Sign in to confirm you're not a bot`。
         * 只留 3 行会把警告丢掉 → 分类退化成“疑似 IP 风控”，把用户引向错误的解法。
         * 12 行 ≈ 1~2KB，对日志与文案都无压力（展示端另有 truncate）。
         */
        .slice(-12)
        .join(' ／ ');
      const error = [
        outcome.timedOut
          ? `执行超时（${Math.round(outcome.durationMs / 1000)}s，可用 YTDLP_TIMEOUT_MS 调大）`
          : '',
        stderrTail || truncate(outcome.error || '', 300) || 'yt-dlp 未输出任何音频（原因未知）',
      ]
        .filter(Boolean)
        .join(' ／ ');
      /**
       * ⚠️ 判定必须同时看 **stdout**。
       *
       * 实测：`The provided YouTube account cookies are no longer valid ... rotated in the browser`
       * 这句决定性警告**不一定落在 stderr**（随 yt-dlp 版本/环境在流之间漂移），
       * 只看 stderr 就会把「cookies 被轮换」误分类成「IP 被风控」，把用户引向错误的解法。
       * 两个流拼起来喂给分类器，并把可疑的警告行补进 error 文本（便于用户复制报错）。
       */
      const merged = `${outcome.stdout || ''}\n${outcome.stderr || ''}`;
      const extraWarnings = merged
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^(WARNING|ERROR)/i.test(l) && !stderrTail.includes(l))
        .slice(-4);
      const errorForClassification = [error, ...extraWarnings].filter(Boolean).join(' ／ ');
      this.logger.warn(`yt-dlp 下载失败：${error}`);
      /** 带上补采的 stdout 警告行 → 分类器（buildDownloadFailureMessage）才能识别「cookies 被轮换」 */
      return { result: null, error: errorForClassification };
    }

    const stat = statSync(produced);
    const ext = extname(produced).toLowerCase();
    const probe = await this.probeAudio(produced);
    const title = typeof meta?.title === 'string' ? meta.title : undefined;

    this.logger.log(
      `yt-dlp 下载完成：${produced}（${(stat.size / 1024 / 1024).toFixed(1)}MB，时长 ${probe.durationSec ?? '?'}s）`,
    );

    return {
      result: {
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
      },
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

// ─────────────────────────────────────────────
// 下载失败 → 可自助排查的中文诊断
// ─────────────────────────────────────────────

type YtDlpFailureKind = 'bot-check' | 'cookie-rotated' | 'browser-cookies' | 'unsupported' | 'unknown';

/** 截断长文本（错误文案里混入完整命令行会把关键信息淹没） */
function truncate(text: string, max: number): string {
  const t = (text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 是不是 YouTube 链接（只有它对「登录态」敏感） */
function isYoutubeUrl(url: string): boolean {
  return /youtu\.?be(\/|\.com)/i.test(url) || /youtube\.com/i.test(url);
}

/** 实测登录态 → 一行中文结论（供错误文案/接口/CMS 直接展示） */
function probeLabel(probe: YoutubeSessionProbe): string {
  const where = probe.route === 'proxy' ? '经系统代理' : probe.route === 'direct' ? '直连' : '未连上';
  const map: Record<YoutubeSessionProbe['state'], string> = {
    'signed-in': '✅ 登录态有效',
    'signed-out': '❌ 登录态已失效（YouTube 判定为未登录）',
    'no-cookies': '⚠️ 未找到 cookies 文件',
    unreachable: '⚠️ 网络未通，无法判定',
    unknown: '⚠️ 无法判定',
  };
  return `${map[probe.state]}（${where}，${probe.cookieCount} 条 youtube cookies，${probe.elapsedMs}ms）`;
}

/**
 * 分类 yt-dlp 的失败原因。
 *
 * 为什么要分类：`Sign in to confirm you're not a bot`（YouTube 反机器人）
 * 与 `Failed to decrypt with DPAPI`（Chromium 127+ 的 App-Bound 加密）是最常见的两类，
 * 但解法完全不同；原来统一的「yt-dlp 执行失败（详见服务端日志）」让用户无法自助处理。
 */
function classifyYtDlpFailure(raw?: string): YtDlpFailureKind {
  const text = (raw || '').toLowerCase();
  if (!text) return 'unknown';
  /**
   * ⚠️ 必须放在 bot-check 之前：
   * cookies **被浏览器轮换**（YouTube 的安全措施）时，yt-dlp 报的仍然是
   * `Sign in to confirm you're not a bot`，但它另外带了一句关键警告
   * `The provided YouTube account cookies are no longer valid` ——
   * 此时把用户引向「换 IP」是**错的**，真正的解法是重新导出 cookies。
   */
  if (/no longer valid|rotated in the browser|account cookies/.test(text)) {
    return 'cookie-rotated';
  }
  if (/failed to decrypt with dpapi|app-bound|could not copy chrome cookie database|safe storage/.test(text)) {
    return 'browser-cookies';
  }
  if (/sign in to confirm|not a bot|confirm your age|age-restricted|login required|private video|members-only|this video is available to this channel/.test(text)) {
    return 'bot-check';
  }
  if (/unsupported url|no video formats found|unable to extract|not a valid url/.test(text)) {
    return 'unsupported';
  }
  return 'unknown';
}

const COOKIE_HELP: string[] = [
  '  方案 A（最省事，推荐）：在后端目录执行',
  '      npm run youtube:login',
  '    会弹出一个 Edge 窗口 → 用谷歌账号登录 YouTube（看到右上角是你的头像就算成功）→',
  '    脚本检测到登录 cookie 后自动写出 <后端>/cookies.txt 并关闭窗口。',
  '    （为什么它能行：用真实 Edge 读明文 cookie，绕开了 Chromium 的 App-Bound 加密；',
  '      登录态存在 %LOCALAPPDATA%\\GuitarMate\\youtube-login，下次免登录刷新。）',
  '  方案 B：手动导出 cookies.txt',
  '    1) 浏览器安装扩展「Get cookies.txt LOCALLY」（开源，纯本地导出）',
  '    2) ⚠️ **必须先在浏览器里登录 youtube.com**，否则导出的是访客 cookie（等于没配）',
  '    3) 放到后端根目录 guitarmate-audio-backend/cookies.txt（自动识别，无需配置）',
  '       —— 放好后**直接重试导入**即可：cookies 每次下载时实时读取；',
  '       只有改用环境变量 YTDLP_COOKIES 才需要重启后端。',
  '  方案 C：设置 YTDLP_COOKIES_FROM_BROWSER=firefox（Firefox 的 cookies 不加密）',
  '  ⚠️ Chrome / Edge 的 --cookies-from-browser chrome|edge 不可用',
  '     （App-Bound 加密 → Failed to decrypt with DPAPI）→ 请用方案 A / B。',
];

/** 组装「无法下载」时的完整错误文案（含分类诊断与可复制步骤） */
function buildDownloadFailureMessage(input: {
  url: string;
  caps: WorkerCapabilities;
  ytDlpFailure?: string;
  /** 实测的 YouTube 登录态 —— 确定性证据，优先于对 yt-dlp 文案的猜测 */
  sessionProbe?: YoutubeSessionProbe;
}): string {
  const { url, caps, ytDlpFailure, sessionProbe } = input;
  const lines: string[] = [`无法下载该 URL：${url}`, ''];
  const diagnostics = ytDlpFailure ? [`yt-dlp 诊断：${truncate(ytDlpFailure, 400)}`, ''] : [];

  if (!caps.ytDlp.available) {
    return [
      ...lines,
      `原因：未安装 yt-dlp（${caps.ytDlp.reason}），且该链接不是直链音频（.mp3/.wav/.flac）。`,
      '',
      '可选方案：',
      '  1. 安装 yt-dlp：pip install -U yt-dlp（或用 pip 所属解释器：<python> -m pip install -U yt-dlp）',
      '     ⚠️ 安装后必须重启后端：能力探测结果在进程内缓存。',
      '  2. 直接把音频文件通过 POST /api/transcription/projects/upload 上传（base64）。',
    ].join('\n');
  }

  const kind = classifyYtDlpFailure(ytDlpFailure);
  const cookieState = inspectYtDlpCookieState();
  const cookieLines = describeCookieStateLines(cookieState);

  /**
   * 「实测登录态」优先于「从日志猜」。
   *
   * 实测说 signed-out 时，无论 yt-dlp 报的是 bot-check 还是别的，真相都是
   * **cookies 已失效**（YouTube 自己都认不出这份 cookies），必须重新导出；
   * 反之实测说 signed-in，则问题确实更可能在出口 IP / PO token 上。
   */
  const probedStale = sessionProbe?.state === 'signed-out' && isYoutubeUrl(url);
  const probedAlive = sessionProbe?.state === 'signed-in';
  const effectiveKind: YtDlpFailureKind = probedStale ? 'cookie-rotated' : kind;
  const probeLines = sessionProbe
    ? [
        `登录态实测：${probeLabel(sessionProbe)}`,
        `      ${sessionProbe.detail}`,
        '',
      ]
    : [];

  /** cookies 被浏览器轮换 / 实测已失效 → 唯一正确解法是重新导出 */
  if (effectiveKind === 'cookie-rotated') {
    return [
      ...lines,
      '原因：**cookies 里的登录会话已失效** —— YouTube 出于安全考虑会在浏览器里',
      '      轮换会话 cookie，之前导出的 cookies.txt 就作废了。',
      '      ⚠️ 这跟「出口 IP 被风控」是两回事：换节点不会好，必须重新导出 cookies。',
      '',
      ...probeLines,
      ...cookieLines,
      ...diagnostics,
      '解决方案（一步即可）：',
      '  1. **完全退出**你日常那个已登录 YouTube 的浏览器（Edge / Chrome 全关）；',
      '  2. 后端目录执行：npm run youtube:cookies',
      '     （用真实 profile 自动读明文 cookie；脚本会拒绝弱导出，不会把好文件覆盖坏）',
      '  3. 校验：npm run youtube:verify —— 文件体检 + 联网实测 YouTube 认不认这份 cookies；',
      '  4. 回到 CMS 点「从失败阶段重试」即可 —— cookies 每次下载实时读取，无需重启后端。',
    ].join('\n');
  }

  if (kind === 'bot-check' && cookieState.usable && !cookieState.strongAuth) {
    const missing = [
      cookieState.hasLoginInfo ? '' : 'LOGIN_INFO',
      cookieState.strongAuth ? '' : '会话 cookie（SID/SSID/__Secure-*PSID 任一）',
    ].filter(Boolean).join(' 与 ');
    return [
      ...lines,
      `原因：cookies 文件存在，但**看不出登录态** —— 缺少 ${missing}，` +
        'YouTube 因此仍然把请求当作未登录。',
      '      （这跟「IP 被风控」是两回事：这种情况换节点也没用，必须先修 cookies。）',
      '',
      ...cookieLines,
      ...diagnostics,
      '解决方案：',
      '  1. 在**你日常那个已登录 YouTube 的浏览器**里重新导出 cookies.txt：',
      '     · 先完全退出该浏览器，再执行  npm run youtube:cookies   （自动导出）',
      '     · 或在该浏览器里用扩展「Get cookies.txt LOCALLY」导出，覆盖 <后端>/cookies.txt',
      '  2. 导出后校验：npm run youtube:cookies -- --check  （应显示「登录态可用」）',
    ].join('\n');
  }

  if (kind === 'bot-check' && cookieState.usable) {
    /** 实测说 cookies 好的 → 就别再暗示「可能 cookies 失效」，把矛头指向 IP / PO token */
    const reasonLines = probedAlive
      ? [
          '原因：站点要求登录 / 人机校验 —— 已实测确认这份 cookies **确实处于登录态**，',
          '      所以问题在出口 IP 被 YouTube 判定为高风险（代理/VPN 常见）或缺少 PO token，',
          '      而不是 cookies 失效。',
        ]
      : [
          '原因：站点要求登录 / 人机校验，且**本次已携带可用的登录态 cookies 仍被拦**。',
          '      其余情况多为出口 IP 被 YouTube 判定为高风险（代理/VPN 常见）。',
        ];
    return [
      ...lines,
      ...reasonLines,
      '',
      ...probeLines,
      ...cookieLines,
      ...diagnostics,
      '解决方案（按成功率排序）：',
      '  1. 换出口 IP：关掉代理直连，或切换到别的节点后重试；',
      '  2. 重新导出一次 cookies（会话可能刚好过期）；',
      '     ⚠️ 别猜：npm run youtube:check 会联网实测 YouTube 是否认这份 cookies。',
      '  3. 给 yt-dlp 装 PO token 插件（bgutil-ytdlp-pot-provider），这是 YouTube 近年新增的门槛；',
      '  4. 先用本机下载代理：npm run agent（住宅 IP + 真实会话，成功率最高）；',
      '  5. 或把音频下到本地，再走 POST /api/transcription/projects/upload（base64）绕过站点。',
    ].join('\n');
  }

  if (kind === 'bot-check') {
    return [
      ...lines,
      '原因：站点要求登录 / 人机校验。YouTube 在无 cookies 时固定返回',
      '      「Sign in to confirm you\'re not a bot」，此时 yt-dlp 版本再新也拿不到音频流。',
      '',
      ...cookieLines,
      ...diagnostics,
      '解决方案：',
      ...COOKIE_HELP,
    ].join('\n');
  }

  if (kind === 'browser-cookies') {
    return [
      ...lines,
      '原因：浏览器的 cookies 无法解密（Chromium 127+ App-Bound Encryption，yt-dlp 已知限制）。',
      '',
      ...cookieLines,
      ...diagnostics,
      '解决方案：',
      ...COOKIE_HELP,
    ].join('\n');
  }

  if (kind === 'unsupported') {
    return [
      ...lines,
      '原因：该站点不被 yt-dlp 支持，或链接不是可解析的媒体页（例如播放器内的 blob: 地址）。',
      '',
      ...cookieLines,
      ...diagnostics,
      '可选方案：',
      '  1. 换成该页面的「分享链接」（YouTube 用 watch?v=… 形式）；',
      '  2. 用 yt-dlp 在本地先把音频下下来，再通过',
      '     POST /api/transcription/projects/upload 上传（base64）。',
    ].join('\n');
  }

  return [
    ...lines,
    `原因：yt-dlp 执行失败（${caps.ytDlp.reason || 'yt-dlp 已安装'}）。`,
    '',
    ...cookieLines,
    ...diagnostics,
    '排查建议：',
    '  1. 先在本机终端跑一遍：yt-dlp -x --audio-format wav --no-playlist "<URL>"，看完整报错；',
    '  2. 若提示 Sign in to confirm you\'re not a bot → 需要 cookies（见下）；',
    '  3. 升级 yt-dlp：pip install -U yt-dlp（站点改版时旧版本常失效）；',
    '  4. 仍需 cookies 时：',
    ...COOKIE_HELP,
  ].join('\n');
}
