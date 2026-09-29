#!/usr/bin/env node
/**
 * 「登录 YouTube → 自动导出 cookies.txt」启动器
 * ==========================================
 *
 * 为什么不直接 `python scripts/youtube-login.py`？
 * 本机 PATH 上的 `python` 是 Python 3.8（且 `python3` 是 WindowsApps 存根），
 * 里面**没有 playwright**，直接跑会报 `No module named 'playwright'` 让人一头雾水。
 * 这里自动挑一个「装了 playwright 的解释器」，你只需要记住一条命令：
 *
 *     npm run youtube:login
 *
 * 参数会原样透传给 `scripts/youtube-login.py`
 * （`--probe` / `--timeout N` / `--out <path>` / `--purge`）。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'youtube-login.py');
const localAppData = process.env.LOCALAPPDATA || '';

/** 候选解释器（顺序即优先级）。WindowsApps 里的应用执行别名会被剔除。 */
const RAW_CANDIDATES = [
  process.env.PYTHON_BIN,
  join(localAppData, 'Python', 'bin', 'python.exe'),
  join(localAppData, 'Python', 'pythoncore-3.14-64', 'python.exe'),
  'python3.14',
  'python3',
  'python',
  'py -3',
].filter(Boolean);

function resolveCommand(spec) {
  const [bin, ...prefix] = spec.split(/\s+/);
  const isAbs = /[\\/]/.test(bin);
  let paths = [];
  if (isAbs) {
    paths = existsSync(bin) ? [bin] : [];
  } else {
    try {
      paths = execFileSync('where.exe', [bin], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      paths = [];
    }
  }
  // Python 商店存根会弹出 Store 窗口，且一定没有 playwright
  const usable = paths.filter((p) => !/\\WindowsApps\\/i.test(p));
  return usable.map((p) => ({ bin: p, prefix, label: [p, ...prefix].join(' ') }));
}

function hasPlaywright({ bin, prefix }) {
  const res = spawnSync(bin, [...prefix, '-c', 'import playwright'], { stdio: 'ignore' });
  return res.status === 0;
}

const found = [];
for (const spec of RAW_CANDIDATES) {
  for (const candidate of resolveCommand(spec)) {
    if (found.some((f) => f.label === candidate.label)) continue;
    if (hasPlaywright(candidate)) found.push(candidate);
  }
}

if (found.length === 0) {
  console.error('未找到安装了 playwright 的 Python 解释器。');
  console.error('');
  console.error('安装方式（用你平时能跑通的那个 python）：');
  console.error('  python -m pip install playwright');
  console.error('');
  console.error('若解释器不在 PATH，可用 PYTHON_BIN 指定后重试：');
  console.error('  $env:PYTHON_BIN="C:\\path\\to\\python.exe"; npm run youtube:login');
  console.error('');
  console.error('不需要执行 `playwright install`：本脚本用系统已安装的 Edge（channel=msedge）。');
  process.exit(2);
}

const chosen = found[0];
console.log(`[youtube:login] 使用解释器：${chosen.label}`);
const res = spawnSync(chosen.bin, [...chosen.prefix, script, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
