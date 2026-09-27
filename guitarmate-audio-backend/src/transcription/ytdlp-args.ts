import { copyFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, isAbsolute, join, resolve } from 'path';
import type { YtDlpCookieSource } from './transcription.types';

/**
 * yt-dlp 参数组装（**唯一来源**）
 * ==============================
 *
 * 为什么单独成模块：同一套参数现在有两个执行方 ——
 * 1. 服务端 `UploadService.downloadWithYtDlp`（服务器能访问 YouTube 时用）；
 * 2. 本机下载代理 `scripts/download-agent.mjs`（国内 / 服务器无法访问 YouTube 时用）。
 *
 * 两边必须**逐字一致**，否则会出现「服务端能下、代理不能下」这种极难排查的差异
 * （例如漏了 `--js-runtimes` 就会伪装成 `Video unavailable`）。
 *
 * 参数语义（每条都有踩坑记录）：
 * - `--cookies`                       → YouTube 的「Sign in to confirm you're not a bot」只能靠**受信任会话**过；
 * - `--js-runtimes node`              → 解 `n`/签名挑战必需，缺它报 `Video unavailable`；
 * - `--remote-components ejs:github`  → JS 挑战求解器脚本（缺它有 `[jsc] ... skipped` 警告 / 格式缺失）；
 * - `--no-playlist`                   → 用户给的是带 list= 的单曲链接时不要整列表下载。
 */

/** yt-dlp cookie 来源解析（顺序即优先级） */
export function resolveYtDlpCookies(): YtDlpCookieSource | null {
  const explicit = (process.env.YTDLP_COOKIES || '').trim();
  if (explicit) {
    const abs = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
    return { mode: 'file', value: existsSync(abs) ? abs : explicit };
  }

  const browser = (process.env.YTDLP_COOKIES_FROM_BROWSER || '').trim();
  if (browser) return { mode: 'browser', value: browser };

  const auto = join(process.cwd(), 'cookies.txt');
  if (existsSync(auto)) return { mode: 'file', value: auto };

  return null;
}

/**
 * yt-dlp 子进程环境变量（**唯一来源**）。
 *
 * 关键点：把 loopback 加进 `NO_PROXY`。用户开着 Clash / V2Ray 等系统代理时，
 * 代理会把 **127.0.0.1 也转发出去**，于是下载本机音频（或内网测试源）会莫名报
 * `HTTP Error 502 Bad Gateway`，而不是“连不上”。其它域名仍然走用户原本的代理
 * （国内访问 YouTube 本来就依赖它）。
 */
export function ytDlpEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const existing = [process.env.NO_PROXY, process.env.no_proxy].filter(Boolean).join(',');
  const noProxy = [existing, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
  return {
    ...process.env,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    PYTHONIOENCODING: 'utf-8',
    ...(extra || {}),
  };
}

/** 在 PATH 上找一个可执行文件（用于自动挑选 yt-dlp 所需的 JS 运行时） */
export function findOnPath(name: string): string | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    try {
      if (existsSync(join(dir, exe))) return join(dir, exe);
    } catch {
      continue;
    }
  }
  return null;
}

/** cookies 参数：YouTube 不带 cookies 基本必定被人机校验拦截 */
export function cookieArgs(): string[] {
  const source = resolveYtDlpCookies();
  if (!source) return [];
  if (source.mode === 'browser') return ['--cookies-from-browser', source.value];

  const abs = existsSync(source.value) ? source.value : resolve(process.cwd(), source.value);
  if (!existsSync(abs)) return [];

  /**
   * ⚠️ 关键：**必须传副本，不能把 --cookies 指向真实文件**。
   *
   * yt-dlp 在**每次运行结束时都会 `save_cookies()`**，把内存里的 cookiejar
   * **写回 `--cookies` 指定的那个文件**。直接指向 cookies.txt 的后果：
   * - 它会丢掉自己判定无效 / 会话型 / 不认识的 cookie（实测一次失败尝试后
   *   `LOGIN_INFO` 就没了），于是**下一次运行真的就没登录态了** ——
   *   表现为反复「上次能用、这次突然被拦」；
   * - 文件还会被重写成 35/36 条，把健康判据、fail-safe、CMS 提示全部带偏。
   *
   * 所以这里把真实文件复制到临时目录再传给 yt-dlp：原文件永远只读，
   * 服务端与「本机下载代理」都走这条路径（它们共用本模块）。
   */
  const tmp = join(tmpdir(), 'guitarmate-ytdlp-cookies.txt');
  try {
    copyFileSync(abs, tmp);
    return ['--cookies', tmp];
  } catch {
    // 复制失败时退回原文件：功能不能因此中断
    return ['--cookies', abs];
  }
}

/**
 * JS 运行时（YouTube 解挑战必需）。自动探测 PATH 上的 node / deno / bun，
 * 可用 `YTDLP_JS_RUNTIME` 覆盖（例如 `YTDLP_JS_RUNTIME=deno`）。
 */
export function jsRuntimeArgs(): string[] {
  const explicit = (process.env.YTDLP_JS_RUNTIME || '').trim();
  if (explicit) return ['--js-runtimes', explicit];
  for (const name of ['node', 'deno', 'bun']) {
    if (findOnPath(name)) return ['--js-runtimes', name];
  }
  return [];
}

/**
 * 远程组件（解 JS 挑战的求解器脚本，默认从 GitHub 取）。
 * 无外网环境可设 `YTDLP_REMOTE_COMPONENTS=off`。
 */
export function remoteComponentsArgs(): string[] {
  const raw = (process.env.YTDLP_REMOTE_COMPONENTS ?? 'ejs:github').trim();
  if (!raw || /^(off|none|0|false|no)$/i.test(raw)) return [];
  return ['--remote-components', raw];
}

/** 高级透传：`YTDLP_EXTRA_ARGS="--extractor-args youtube:player_client=web_safari"` */
export function extraArgs(): string[] {
  const raw = (process.env.YTDLP_EXTRA_ARGS || '').trim();
  if (!raw) return [];
  return raw.match(/(?:[^\s"]+|\"[^\"]*\")+/g)?.map((s) => s.replace(/^"|"$/g, '')) || [];
}

export interface YtDlpArgOptions {
  url: string;
  /** 输出模板，需含 `%(ext)s`（yt-dlp 会按实际容器替换扩展名） */
  outTemplate: string;
  /** ffmpeg 所在目录（`-x` 转码必需） */
  ffmpegDir?: string | null;
  /** wav = 服务端直接喂转录器；mp3 = 代理回传用（体积小，走 base64 上传不超限） */
  audioFormat?: 'wav' | 'mp3';
  /** 打印 JSON 元数据（服务端需要视频标题/时长） */
  printJson?: boolean;
}

/** 组装完整参数（**URL 永远放最后**，yt-dlp 的位置参数只能有一个） */
export function buildYtDlpArgs(options: YtDlpArgOptions): string[] {
  const { url, outTemplate, ffmpegDir, audioFormat = 'wav', printJson = false } = options;
  const args: string[] = [
    '-x',
    '--audio-format',
    audioFormat,
    '--audio-quality',
    audioFormat === 'mp3' ? '4' : '0',
    '--no-playlist',
    '--restrict-filenames',
    '--no-warnings',
    '--newline',
  ];
  if (printJson) args.push('--print-json');
  if (ffmpegDir) args.push('--ffmpeg-location', ffmpegDir);
  args.push(...cookieArgs(), ...jsRuntimeArgs(), ...remoteComponentsArgs(), ...extraArgs());
  args.push('-o', outTemplate, url);
  return args;
}
