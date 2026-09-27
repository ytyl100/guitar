/**
 * 极简静态服务器（零依赖）—— 仅用于本地验证 H5 产物
 *
 * 为什么不装 `serve`：本项目已经因为「手写配置漏了 peer 依赖」踩过一次坑，
 * 验证工具本身再引入依赖就又多一个变量。hash 路由下静态伺服足够。
 *
 * 用法：node scripts/serve-h5.mjs [dir] [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist-h5');
const port = Number(process.argv[3]) || 5199;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    /* 忽略坏 URL */
  }
  if (pathname === '/') pathname = '/index.html';

  let file = join(root, pathname);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    // hash 路由：未知路径回落 index.html
    file = join(root, 'index.html');
  }

  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(port, () => {
  console.log(`[serve-h5] ${root} → http://localhost:${port}`);
});
