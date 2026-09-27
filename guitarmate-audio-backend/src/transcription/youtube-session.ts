/**
 * YouTube 登录态**确定性**探测
 * =============================
 *
 * 为什么需要它（踩过的坑）：
 *   yt-dlp 只在**部分**失败路径上打印
 *     `WARNING: The provided YouTube account cookies are no longer valid.
 *      They have likely been rotated in the browser as a security measure.`
 *   同样的 cookies、同样的 IP，连续两次运行可能一次有这句、一次没有，
 *   只剩 `Sign in to confirm you're not a bot`。
 *   → 靠解析 yt-dlp 文案来判断「cookies 失效」是不可靠的，
 *     会把用户误导向「换 IP」（而真相是必须重新导出 cookies）。
 *
 * 本模块改用**可验证的事实**：带上 cookies 请求一次 youtube.com，
 * 读取 YouTube 自己写进页面 `ytcfg` 的 `"LOGGED_IN":true|false`。
 * 这是 YouTube 对「你是谁」的直接回答，不受 yt-dlp 版本与分支影响。
 *
 * 路由说明：
 *   Node 的 https 既**不读** WinINET 系统代理，也**不读** `HTTPS_PROXY` 之外的东西，
 *   而本机只在 Windows 系统设置里配了 Clash（127.0.0.1:7897，yt-dlp 走的就是它）。
 *   因此这里显式解析出口：环境变量 → Windows 注册表系统代理 → 直连，
 *   并在代理失败时**回退直连**（TUN 模式下直连同样被 Clash 接管）。
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { connect as netConnect } from 'net';
import { connect as tlsConnect } from 'tls';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'zlib';
import { resolveYtDlpCookies } from './ytdlp-args';

/** YouTube 对我们身份的定义：signed-in = cookies 仍然有效 */
export type YoutubeSessionState = 'signed-in' | 'signed-out' | 'no-cookies' | 'unreachable' | 'unknown';

export interface YoutubeSessionProbe {
  state: YoutubeSessionState;
  /** 人类可读的解释（直接进错误文案/CLI 输出） */
  detail: string;
  /** 实际使用的出口，便于排查「为什么 yt-dlp 行、探测不行」 */
  route: 'proxy' | 'direct' | 'none';
  cookieCount: number;
  elapsedMs: number;
}

const HOME_URL = 'https://www.youtube.com/';
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1_000_000;

/** 真实 Chrome UA：YouTube 对「明显非浏览器」的请求会直接给简化页（不含 ytcfg） */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────
// 出口路由解析
// ─────────────────────────────────────────────

interface ProxyRoute {
  host: string;
  port: number;
  authHeader?: string;
}

/** 解析 NO_PROXY（与 yt-dlp/curl 语义一致：`*` 全绕过，后缀匹配） */
function isBypassed(host: string): boolean {
  const raw = process.env.NO_PROXY || process.env.no_proxy || '';
  if (!raw.trim()) return false;
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry === '*') return true;
    const bare = entry.replace(/^\./, '');
    if (host === bare || host.endsWith(`.${bare}`)) return true;
  }
  return false;
}

function parseProxyValue(value: string): ProxyRoute | null {
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    const route: ProxyRoute = {
      host: parsed.hostname,
      port: Number(parsed.port) || 80,
    };
    if (parsed.username) {
      const cred = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
      route.authHeader = `Proxy-Authorization: Basic ${Buffer.from(cred).toString('base64')}\r\n`;
    }
    return route;
  } catch {
    return null;
  }
}

/**
 * Windows 系统代理（WinINET）。
 * yt-dlp 会自动读它，Node 不会 —— 这正是「yt-dlp 能跑、Node 直连失败」的根因。
 */
function readWindowsSystemProxy(): ProxyRoute | null {
  if (process.platform !== 'win32') return null;
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const query = (name: string): string => {
    try {
      const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'latin1', timeout: 4000 });
      const match = out.match(/REG_\w+\s+(.+)/);
      return match ? match[1].trim() : '';
    } catch {
      return '';
    }
  };
  if (query('ProxyEnable') !== '0x1') return null;
  const server = query('ProxyServer');
  if (!server) return null;
  /** 形如 `127.0.0.1:7897` 或 `http=host:port;https=host:port` */
  const perScheme = server.match(/(?:^|;)\s*https?=([^;]+)/i);
  return parseProxyValue(perScheme ? perScheme[1] : server);
}

function resolveRoutes(): ProxyRoute[] {
  const routes: ProxyRoute[] = [];
  const envValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (envValue && !isBypassed('www.youtube.com')) {
    const envRoute = parseProxyValue(envValue);
    if (envRoute) routes.push(envRoute);
  }
  if (!routes.length) {
    const winRoute = readWindowsSystemProxy();
    if (winRoute && !isBypassed('www.youtube.com')) routes.push(winRoute);
  }
  /** 直连兜底：Clash 等 TUN 模式会透明接管，无需显式代理 */
  return routes;
}

// ─────────────────────────────────────────────
// Cookies
// ─────────────────────────────────────────────

interface NetscapeCookie {
  domain: string;
  name: string;
  value: string;
  expires: number;
}

/**
 * 解析 Netscape 格式 cookies（`#HttpOnly_` 前缀要剥掉，否则整行会被当注释丢弃 ——
 * 而 `__Secure-*PSID` 这类会话 cookie 恰好常带 HttpOnly 标记）。
 */
export function parseNetscapeCookies(text: string): NetscapeCookie[] {
  const out: NetscapeCookie[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^#HttpOnly_/i, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    /** 标准是 tab 分隔；有些导出工具用空白分隔 → 用 `\s+` 兼容（值里不含空白） */
    const parts = line.split('\t');
    const fields = parts.length >= 7 ? parts : line.split(/\s+/);
    if (fields.length < 7) continue;
    const [domain, , , , expires, name, ...rest] = fields;
    if (!name) continue;
    out.push({
      domain,
      name,
      /** 值里可能含 `=`，只按第一个 `=` 切分已经由 Netscape 列结构保证 */
      value: rest.join('\t'),
      expires: Number(expires) || 0,
    });
  }
  return out;
}

function youtubeCookieHeader(): { header: string; count: number } {
  const resolved = resolveYtDlpCookies();
  const path = resolved?.value ?? '';
  if (!path || !existsSync(path)) return { header: '', count: 0 };
  let cookies: NetscapeCookie[] = [];
  try {
    cookies = parseNetscapeCookies(readFileSync(path, 'utf8'));
  } catch {
    return { header: '', count: 0 };
  }
  const now = Date.now() / 1000;
  const relevant = cookies.filter(
    (c) =>
      /(^|\.)youtube\.com$/i.test(c.domain.replace(/^\./, '')) &&
      c.name &&
      c.value &&
      (c.expires === 0 || c.expires > now),
  );
  const header = relevant.map((c) => `${c.name}=${c.value}`).join('; ');
  return { header, count: relevant.length };
}

// ─────────────────────────────────────────────
// 极简 HTTP 客户端（支持 CONNECT 代理隧道）
// ─────────────────────────────────────────────

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function openTunnel(proxy: ProxyRoute, host: string, port: number, timeoutMs: number): Promise<import('net').Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: proxy.host, port: proxy.port });
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('代理连接超时')), timeoutMs);
    socket.once('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    socket.once('connect', () => {
      socket.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${proxy.authHeader || ''}Connection: keep-alive\r\n\r\n`,
      );
      let head = '';
      const onData = (chunk: Buffer) => {
        head += chunk.toString('latin1');
        if (!head.includes('\r\n\r\n')) return;
        socket.off('data', onData);
        clearTimeout(timer);
        const status = Number(head.split(' ')[1]);
        if (status !== 200) {
          fail(new Error(`代理 CONNECT 返回 ${status}`));
          return;
        }
        resolve(socket);
      };
      socket.on('data', onData);
    });
  });
}

function decodeBody(buffer: Buffer, encoding: string): string {
  try {
    if (/gzip/i.test(encoding)) return gunzipSync(buffer).toString('utf8');
    if (/deflate/i.test(encoding)) return inflateSync(buffer).toString('utf8');
    if (/br/i.test(encoding)) return brotliDecompressSync(buffer).toString('utf8');
  } catch {
    /* 解码失败就按原文看，反正只需要搜一个标记 */
  }
  return buffer.toString('utf8');
}

/** 解 chunked 传输编码（YouTube 首页必然 chunked） */
function dechunk(buffer: Buffer): Buffer {
  const parts: Buffer[] = [];  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd < 0) break;
    const size = parseInt(buffer.subarray(offset, lineEnd).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    parts.push(buffer.subarray(start, Math.min(start + size, buffer.length)));
    offset = start + size + 2;
  }
  return parts.length ? Buffer.concat(parts) : buffer;
}

function httpGet(host: string, path: string, headers: Record<string, string>, route: ProxyRoute | null, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err: Error | null, res?: RawResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(res!);
    };
    const timer = setTimeout(() => done(new Error('请求超时')), timeoutMs);

    const start = (socket: import('net').Socket) => {
      const requestLines = [
        `GET ${path} HTTP/1.1`,
        `Host: ${host}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        'Connection: close',
        '',
        '',
      ].join('\r\n');
      let received = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.length > MAX_BODY_BYTES + 65_536) socket.destroy();
      });
      socket.on('error', (e) => done(e));
      socket.on('close', () => {
        try {
          const headEnd = received.indexOf('\r\n\r\n');
          if (headEnd < 0) return done(new Error('响应头不完整'));
          const headText = received.subarray(0, headEnd).toString('latin1');
          const [statusLine, ...headerLines] = headText.split('\r\n');
          const status = Number(statusLine.split(' ')[1]);
          const parsed: Record<string, string> = {};
          for (const line of headerLines) {
            const idx = line.indexOf(':');
            if (idx > 0) parsed[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
          }
          let body: Buffer = received.subarray(headEnd + 4);
          if (/chunked/i.test(parsed['transfer-encoding'] || '')) body = dechunk(body);
          done(null, { status, headers: parsed, body: decodeBody(body, parsed['content-encoding'] || '') });
        } catch (e) {
          done(e as Error);
        }
      });
      socket.write(requestLines);
    };

    if (!route) {
      const direct = tlsConnect({ host, port: 443, servername: host });
      direct.once('secureConnect', () => start(direct));
      direct.once('error', (e) => done(e));
      return;
    }
    openTunnel(route, host, 443, timeoutMs).then(
      (tunnel) => {
        const tls = tlsConnect({ socket: tunnel, servername: host });
        tls.once('secureConnect', () => start(tls));
        tls.once('error', (e) => done(e as Error));
      },
      (err) => done(err as Error),
    );
  });
}

/**
 * 探测 YouTube 是否认这份 cookies。
 *
 * 返回 `signed-out` 就是**铁证**：cookies 已失效/被轮换，重新导出是唯一解法，换 IP 无用。
 * `unreachable` 表示网络层没通（别拿它当「cookies 坏了」的证据）。
 */
export async function probeYoutubeSession(opts: { timeoutMs?: number } = {}): Promise<YoutubeSessionProbe> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { header, count } = youtubeCookieHeader();

  const attempt = async (route: ProxyRoute | null): Promise<RawResponse> =>
    httpGet('www.youtube.com', '/', {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      ...(header ? { Cookie: header } : {}),
    }, route, timeoutMs);

  const routes = resolveRoutes();
  let response: RawResponse | null = null;
  let usedRoute: 'proxy' | 'direct' | 'none' = 'none';
  let lastError = '';
  for (const candidate of [...routes.map((r) => ({ route: r as ProxyRoute | null, name: 'proxy' as const })), { route: null, name: 'direct' as const }]) {
    try {
      response = await attempt(candidate.route);
      usedRoute = candidate.name;
      break;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  const elapsedMs = Date.now() - started;
  if (!response) {
    return {
      state: count ? 'unreachable' : 'no-cookies',
      detail: `网络层未通（${lastError || '未知错误'}）→ 无法据此判断 cookies 是否失效`,
      route: 'none',
      cookieCount: count,
      elapsedMs,
    };
  }
  if (!count) {
    return {
      state: 'no-cookies',
      detail: '未找到 youtube.com 的 cookies 文件',
      route: usedRoute,
      cookieCount: 0,
      elapsedMs,
    };
  }

  /** YouTube 把登录态写进页面里的 ytcfg；这是它自己的回答，比任何日志都可靠 */
  const signedIn = /"LOGGED_IN"\s*:\s*true/i.test(response.body);
  const signedOut = /"LOGGED_IN"\s*:\s*false/i.test(response.body);
  if (signedIn) {
    return {
      state: 'signed-in',
      detail: 'YouTube 确认这份 cookies 处于登录态（问题多半在出口 IP / PO token，而不是 cookies）',
      route: usedRoute,
      cookieCount: count,
      elapsedMs,
    };
  }
  if (signedOut) {
    return {
      state: 'signed-out',
      detail: `YouTube 用这份 cookies 仍然判定为「未登录」（HTTP ${response.status}）→ cookies 已失效或被浏览器轮换，必须重新导出`,
      route: usedRoute,
      cookieCount: count,
      elapsedMs,
    };
  }
  return {
    state: 'unknown',
    detail: `页面里没有 ytcfg 登录标记（HTTP ${response.status}）→ 无法判定`,
    route: usedRoute,
    cookieCount: count,
    elapsedMs,
  };
}
