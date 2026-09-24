import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { tmpdir } from 'os';
import ffmpegStatic from 'ffmpeg-static';
import {
  WORKER_RESULT_PREFIX,
  type WorkerCapabilities,
  type WorkerResultBase,
} from './transcription.types';

export interface ExecOutcome {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

export interface WorkerOutcome<T extends WorkerResultBase> extends ExecOutcome {
  result: T | null;
}

/**
 * Python Worker 运行器
 * ===================
 *
 * 统一负责「找到解释器 → 调用 workers/*.py → 解析结构化结果」。
 *
 * 与 Python 的契约（非常简单，避免任何序列化框架）：
 * 1. Worker 以 CLI 参数接收输入（`--input` / `--output` / `--instrument` …）；
 * 2. 人类可读日志走 stderr；
 * 3. **最后一行**以 `GUITARMATE_RESULT ` 前缀输出 JSON —— Node 侧只解析这一行。
 *
 * 缺失依赖时的行为（关键，保证「不改动现有结构」与开箱可跑）：
 * - 找不到 Python / demucs / basic_pitch / tayuya → `probe()` 里如实报告，
 *   并把 `simulate` 置为 true；
 * - 模拟模式下由 `TranscribeService` 走 ffmpeg + 既有 `DemoAudioService` 的纯 Node 兜底，
 *   整条链路（上传 → 建项目 → 队列 → 发布 → PracticePackage）依然可端到端验证。
 *
 * 环境变量：
 * | 变量 | 默认 | 说明 |
 * |---|---|---|
 * | `PYTHON_BIN` | 自动探测 `python3` / `python` / `py -3` | 解释器 |
 * | `YTDLP_BIN` | 自动探测 `yt-dlp` / `python -m yt_dlp` | URL 下载 |
 * | `WORKERS_DIR` | `<后端>/workers` | worker 脚本目录 |
 * | `WORKER_TIMEOUT_MS` | `1800000`（30 分钟） | 单个 worker 超时 |
 */
@Injectable()
export class PythonRunnerService {
  private readonly logger = new Logger(PythonRunnerService.name);

  /** 进程内缓存：探测结果只在首次使用时计算，避免每个阶段都跑一遍 import 检查 */
  private capabilities: WorkerCapabilities | null = null;
  private probing: Promise<WorkerCapabilities> | null = null;

  readonly workersDir: string = this.resolveWorkersDir();
  private readonly timeoutMs = Math.max(10_000, Number(process.env.WORKER_TIMEOUT_MS) || 1_800_000);

  /** 是否允许模拟模式（Python 依赖缺失时不报错，走 ffmpeg 兜底） */
  get simulateEnabled(): boolean {
    if (process.env.TRANSCRIBE_SIMULATE === 'true') return true;
    if (process.env.TRANSCRIBE_SIMULATE === 'false') return false;
    return true; // 默认允许：开发机没有 Demucs 也能把链路跑通
  }

  /** 能力探测（带缓存） */
  async probe(force = false): Promise<WorkerCapabilities> {
    if (force) {
      this.capabilities = null;
      this.probing = null;
    }
    if (this.capabilities) return this.capabilities;
    if (!this.probing) this.probing = this.doProbe();
    return this.probing;
  }

  private async doProbe(): Promise<WorkerCapabilities> {
    const python = await this.detectPython();
    const ytDlp = await this.detectYtDlp(python.bin, python.available);

    let demucs = { available: false, reason: '未检测（Python 不可用）' };
    let basicPitch = { available: false, reason: '未检测（Python 不可用）' };
    let tayuyaModule = { available: false, reason: '未检测（Python 不可用）' };

    if (python.available) {
      const [d, b, t] = await Promise.all([
        this.pythonModuleAvailable(python.bin, 'demucs'),
        this.pythonModuleAvailable(python.bin, 'basic_pitch', 'basic_pitch.inference'),
        this.pythonModuleAvailable(python.bin, 'tayuya'),
      ]);
      demucs = { available: d.ok, reason: d.reason };
      basicPitch = { available: b.ok, reason: b.reason };
      tayuyaModule = { available: t.ok, reason: t.reason };
    }

    /**
     * Tayuya 阶段的两条路径：
     * - 内部实现 `workers/midi_to_tab.py` 是**纯标准库**的，只要脚本在就一定能跑；
     * - 若机器上还装了第三方 `tayuya` 包 / 设置了 `TAYUYA_BIN`，则由脚本内部优先调用它。
     * 因此「能力」= 脚本存在（而不是 pip 包存在）—— 否则会把可用的内置转换器误判为缺失。
     */
    const builtinConverter = existsSync(join(this.workersDir, 'midi_to_tab.py'));
    const externalTayuya = (process.env.TAYUYA_BIN || '').trim();
    const tayuya = builtinConverter
      ? {
          available: true,
          reason: externalTayuya
            ? `内置转换器 + 外部 Tayuya（${externalTayuya}）`
            : tayuyaModule.available
              ? '内置转换器（同时检测到 tayuya 包）'
              : '内置 Tayuya 兼容转换器（零依赖，无需 pip 包）',
        }
      : { available: false, reason: `未找到 workers/midi_to_tab.py（${this.workersDir}）` };

    const ffmpegOk = !!ffmpegStatic && existsSync(String(ffmpegStatic));

    const caps: WorkerCapabilities = {
      python,
      ytDlp,
      demucs,
      basicPitch,
      tayuya,
      ffmpeg: {
        available: ffmpegOk,
        reason: ffmpegOk ? 'ffmpeg-static 可用' : 'ffmpeg-static 不可用（音频切片会降级为 #t= 片段）',
      },
      workersDir: this.workersDir,
      simulate: this.simulateEnabled,
    };

    this.capabilities = caps;
    this.logger.log(
      `Worker 能力探测：python=${python.available ? python.bin : '缺失'} ` +
        `yt-dlp=${ytDlp.available ? 'OK' : '缺失'} demucs=${demucs.available} ` +
        `basic-pitch=${basicPitch.available} tayuya=${tayuya.available} ffmpeg=${ffmpegOk}`,
    );
    return caps;
  }

  // ─────────────────────────────────────────
  // 基础执行能力
  // ─────────────────────────────────────────

  /** 执行任意命令（不解析结果） */
  run(command: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecOutcome> {
    const started = Date.now();
    return new Promise<ExecOutcome>((resolveOutcome) => {
      const child = execFile(
        command,
        args,
        {
          cwd: opts?.cwd || this.workersDir,
          timeout: opts?.timeoutMs ?? this.timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        },
        (err: any, stdout, stderr) => {
          const durationMs = Date.now() - started;
          const timedOut = !!err && (err.killed === true || err.signal === 'SIGTERM');
          resolveOutcome({
            ok: !err,
            code: err?.code ?? 0,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            durationMs,
            timedOut,
            error: err ? err.message : undefined,
          });
        },
      );
      child.on('error', (err) => {
        resolveOutcome({
          ok: false,
          code: null,
          stdout: '',
          stderr: '',
          durationMs: Date.now() - started,
          timedOut: false,
          error: err.message,
        });
      });
    });
  }

  /**
   * 调用 `workers/<script>` 并解析 `GUITARMATE_RESULT` 行。
   * `extraArgs` 由调用方拼装（例如 `--input` / `--output` / `--instrument` / `--dry-run`）。
   */
  async runWorker<T extends WorkerResultBase>(
    script: string,
    args: string[],
    opts?: { timeoutMs?: number },
  ): Promise<WorkerOutcome<T>> {
    const scriptPath = join(this.workersDir, script);
    if (!existsSync(scriptPath)) {
      const outcome: WorkerOutcome<T> = {
        ok: false,
        code: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        timedOut: false,
        result: null,
        error: `找不到 worker 脚本：${scriptPath}`,
      };
      return outcome;
    }

    const python = await this.probe();
    if (!python.python.available) {
      return {
        ok: false,
        code: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        timedOut: false,
        result: null,
        error: `Python 解释器不可用：${python.python.reason || '未安装 Python 3'}`,
      };
    }

    const outcome = await this.run(python.python.bin, [scriptPath, ...args], opts);
    const result = this.parseWorkerResult<T>(outcome.stdout);
    if (!outcome.ok) {
      this.logger.warn(
        `worker ${script} 执行失败（code=${outcome.code}）：${lastLines(outcome.stderr, 6)}`,
      );
    }
    return { ...outcome, result };
  }

  /** 解析 stdout 里最后一行 `GUITARMATE_RESULT {json}` */
  parseWorkerResult<T extends WorkerResultBase>(stdout: string): T | null {
    if (!stdout) return null;
    const lines = stdout.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line.startsWith(WORKER_RESULT_PREFIX)) continue;
      const payload = line.slice(WORKER_RESULT_PREFIX.length);
      try {
        return JSON.parse(payload) as T;
      } catch (err: any) {
        this.logger.warn(`worker 结果 JSON 解析失败：${err?.message || err}`);
        return null;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────
  // 探测细节
  // ─────────────────────────────────────────

  private async detectPython(): Promise<WorkerCapabilities['python']> {
    const explicit = (process.env.PYTHON_BIN || '').trim();
    const candidates: string[][] = explicit
      ? [[explicit]]
      : [
          ['python3'],
          ['python'],
          ['py', '-3'],
        ];

    const failures: string[] = [];
    for (const [bin, ...prefixArgs] of candidates) {
      const res = await this.run(bin, [...prefixArgs, '-c', 'import sys;print(sys.version.split()[0])'], {
        cwd: process.cwd(),
        timeoutMs: 20_000,
      });
      if (res.ok) {
        const version = (res.stdout || '').trim().split(/\s+/).pop();
        return { available: true, bin, version };
      }
      failures.push(`${bin}: ${res.error || res.stderr || 'not found'}`);
    }
    return {
      available: false,
      bin: explicit || 'python3',
      reason: `未找到可用的 Python 3 解释器（尝试：${candidates
        .map((c) => c[0])
        .join(', ')}）。可通过 PYTHON_BIN 指定路径。`,
    };
  }

  private async detectYtDlp(
    pythonBin: string,
    pythonAvailable: boolean,
  ): Promise<WorkerCapabilities['ytDlp']> {
    const explicit = (process.env.YTDLP_BIN || '').trim();
    if (explicit) {
      const res = await this.run(explicit, ['--version'], { cwd: process.cwd(), timeoutMs: 30_000 });
      return {
        available: res.ok,
        bin: explicit,
        reason: res.ok ? `yt-dlp ${res.stdout.trim()}` : `YTDLP_BIN 不可执行：${res.error || res.stderr}`,
      };
    }

    // 1. 独立可执行文件
    const direct = await this.run('yt-dlp', ['--version'], { cwd: process.cwd(), timeoutMs: 30_000 });
    if (direct.ok) {
      return { available: true, bin: 'yt-dlp', reason: `yt-dlp ${direct.stdout.trim()}` };
    }

    // 2. 作为 Python 模块（pip install yt-dlp 后常见形态）
    if (pythonAvailable) {
      const mod = await this.run(pythonBin, ['-m', 'yt_dlp', '--version'], {
        cwd: process.cwd(),
        timeoutMs: 30_000,
      });
      if (mod.ok) {
        return {
          available: true,
          bin: `${pythonBin} -m yt_dlp`,
          reason: `yt-dlp ${mod.stdout.trim()}（Python 模块）`,
        };
      }
    }

    return {
      available: false,
      bin: explicit || 'yt-dlp',
      reason:
        '未找到 yt-dlp。安装方式：pip install yt-dlp（或 npm i -g yt-dlp 对应的独立二进制）。' +
        '未安装时，URL 导入只支持「直链音频」（.mp3/.wav/.flac）。',
    };
  }

  private async pythonModuleAvailable(
    pythonBin: string,
    mod: string,
    importName?: string,
  ): Promise<{ ok: boolean; reason: string }> {
    const code =
      'import importlib.util as u,sys;' +
      `sys.exit(0 if u.find_spec(${JSON.stringify(importName || mod)}) else 3)`;
    const res = await this.run(pythonBin, ['-c', code], { cwd: process.cwd(), timeoutMs: 45_000 });
    if (res.ok) return { ok: true, reason: `已安装 ${mod}` };
    return {
      ok: false,
      reason: `未安装 Python 包 ${mod}（pip install ${mod === 'basic_pitch' ? 'basic-pitch' : mod}）`,
    };
  }

  // ─────────────────────────────────────────
  // 目录解析
  // ─────────────────────────────────────────

  private resolveWorkersDir(): string {
    const envDir = (process.env.WORKERS_DIR || '').trim();
    const candidates = [
      envDir,
      resolve(process.cwd(), 'workers'),
      resolve(process.cwd(), '..', 'workers'),
      resolve(__dirname, '..', '..', '..', 'workers'),
      resolve(__dirname, '..', '..', 'workers'),
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
      if (isAbsolute(dir) && existsSync(dir)) return dir;
    }
    // 默认返回项目内的 workers/（可能有，但内容未就绪；错误信息里会带出完整路径）
    return candidates[1] || join(tmpdir(), 'workers');
  }
}

function lastLines(text: string, count: number): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(-count).join(' | ');
}
