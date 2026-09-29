import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { CurriculumAssetsService } from './curriculum-assets.service';

/**
 * 课程视频转码（真实 ffmpeg 产物链）
 * ==================================
 *
 * ## 为什么是"同步请求"而不是任务队列
 *
 * 仓库里只有转录流水线那套（`TranscribeQueueService`，进程内 FIFO，为「下载→分轨→转录→转谱」设计的）。
 * 课程视频转码是**单步、可重试、量小**的活：一门课几个视频，720p 转一段几分钟的视频在这台机器上
 * 也就几十秒。为了让 CMS 端能看到真实进度/结果，这里做成**同步接口 + 超时保护**：
 *
 * - 同步的代价：请求会占住连接直到转完（所以给了 `TRANSCODE_TIMEOUT_MS`，默认 10 分钟）；
 * - 真要做成产品级，应当是一张 `transcode_jobs` 表 + 队列 + 轮询，那是另一轮工程。
 *   这一段注释留在代码里，免得下次有人以为"这就是终态"。
 *
 * ## 产物
 *
 * ```text
 * uploads/curriculum/videos/<sha1>.mp4                 直传的源文件
 * uploads/curriculum/videos/transcoded/<name>_720p.mp4 720p（H.264 + AAC，总能出）
 * uploads/curriculum/videos/transcoded/<name>_1080p.mp4 1080p（**仅当源≥1080p**才出，不放大）
 * ```
 *
 * ⚠️ **不放大**：小源文件硬转 1080p 只会变大变糊，所以 1080p 只在源高度 ≥1080 时才产出，
 * 返回值里会说明"为什么没有 1080p"，前端照实显示。
 *
 * ## 只接本地文件（外链先下载）
 *
 * `source` 可以是 `/uploads/...` 相对路径。**外链（http/https）暂不支持**：那需要先落盘再转
 * （还得考虑防盗链/超时），本节直接给出可操作的报错，而不是偷偷失败。
 */

/** 目标清晰度（从高到低）。源不够高就不产这个变体（不放大） */
const TARGET_HEIGHTS = [1080, 720];

const MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024; // 4GB：再大就别用这台机器转了

export interface TranscodedVariant {
  label: string;
  /** 相对路径（存进 `TeachingVideo.videoUrl` / `variants[].url` 用的就是这个） */
  path: string;
  /** 绝对 URL（仅供立刻预览） */
  url: string;
  height: number;
  sizeBytes: number;
}

export interface TranscodeResult {
  sourcePath: string;
  sourceResolution: { width: number; height: number } | null;
  durationSec: number | null;
  variants: TranscodedVariant[];
  elapsedMs: number;
  /** 如实说明"少了哪个变体、为什么" */
  notes: string[];
}

@Injectable()
export class CurriculumTranscodeService {
  private readonly logger = new Logger(CurriculumTranscodeService.name);

  constructor(private readonly assets: CurriculumAssetsService) {}

  /** ffmpeg / ffprobe 可执行文件（都是本仓库已有的 npm 依赖，无系统依赖） */
  private ffmpegPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static') as string | null;
    if (!ffmpegStatic || !existsSync(ffmpegStatic)) {
      throw new ServiceUnavailableException('服务器未安装 ffmpeg（ffmpeg-static 不可用），无法转码。');
    }
    return ffmpegStatic;
  }

  private ffprobePath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffprobeStatic = require('ffprobe-static') as { path?: string } | null;
    const p = ffprobeStatic?.path;
    if (!p || !existsSync(p)) {
      throw new ServiceUnavailableException('服务器未安装 ffprobe（ffprobe-static 不可用），无法探测视频信息。');
    }
    return p;
  }

  /** 相对路径/绝对路径 → 本地绝对路径（只允许 uploads 下的文件） */
  private resolveLocal(source: string): string {
    const raw = (source || '').trim();
    if (!raw) throw new BadRequestException('缺少 source（视频路径）。');
    if (/^https?:\/\//i.test(raw)) {
      throw new BadRequestException(
        '暂不支持直接转码外部链接：请先把视频放到 OSS/CDN 直接用（C 端能播），' +
          '或下到本机后经 `POST /api/curriculum/assets/video` 直传再转码。',
      );
    }
    const rel = raw.replace(/^\/+/, '');
    const abs = join(process.cwd(), rel.startsWith('uploads/') ? rel : join('uploads', rel));
    if (!existsSync(abs)) {
      throw new BadRequestException(`找不到源文件：${abs}`);
    }
    const size = statSync(abs).size;
    if (size > MAX_SOURCE_BYTES) {
      throw new BadRequestException(`源文件过大（${(size / 1024 / 1024 / 1024).toFixed(1)}GB），请先压缩。`);
    }
    return abs;
  }

  /** 跑一条命令并收集输出（不写 shell，避免拼接注入） */
  private run(bin: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`转码超时（> ${Math.round(timeoutMs / 1000)}s），已中止。`));
      }, timeoutMs);
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => (err += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error((err || out).split('\n').slice(-6).join(' ').slice(0, 800)));
      });
    });
  }

  /**
   * ffprobe 读时长与分辨率（读不到就返回 null，不因此失败）。
   *
   * 公开给 controller 用：统一资产库要标出每个文件「真的多长、多少像素」——
   * 人工填的 `durationSec` 与真文件不一致是实测过的真问题（3.0s 的文件填了 360s）。
   * `quiet` 用于列表批量探测：读不到就罢了，不必刷一排 warning。
   */
  async probeFile(
    abs: string,
    opts: { quiet?: boolean } = {},
  ): Promise<{ width: number; height: number; durationSec: number } | null> {
    try {
      const out = await this.run(
        this.ffprobePath(),
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height',
          '-show_entries',
          'format=duration',
          '-of',
          'json',
          abs,
        ],
        30_000,
      );
      const json = JSON.parse(out) as {
        streams?: Array<{ width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const s = json.streams?.[0];
      return {
        width: Number(s?.width) || 0,
        height: Number(s?.height) || 0,
        durationSec: Number(json.format?.duration) || 0,
      };
    } catch (err) {
      if (!opts.quiet) {
        this.logger.warn(`ffprobe 读取失败（继续转码）：${(err as Error).message}`);
      }
      return null;
    }
  }

  /** 转码：出 720p（必出）与 1080p（源足够高才出） */
  async transcode(input: { source: string }): Promise<TranscodeResult> {
    const startedAt = Date.now();
    const timeoutMs = Number(process.env.TRANSCODE_TIMEOUT_MS || 10 * 60 * 1000);
    const abs = this.resolveLocal(input.source);
    const probe = await this.probeFile(abs);

    const outDir = join(process.cwd(), 'uploads', 'curriculum', 'videos', 'transcoded');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const base = basename(abs, extname(abs));
    const notes: string[] = [];
    const variants: TranscodedVariant[] = [];

    /**
     * 要产出哪些变体：只出**源够高**的目标；若一个都不够（源 < 720p，或 ffprobe 读不到分辨率），
     * 就退而产出**一份源分辨率的重编码版**。
     *
     * ⚠️ 改这里的原因（用户实测反馈）：以前源 < 720p 时直接抛 400「没有产出任何变体」，
     * CMS 上显示成 **❌ 转码失败** —— 但这根本不是失败，是「没什么可缩小的」。
     * 对小于 720p 的源，重编码到 mp4/H.264 + `+faststart` 仍然是有意义的产物
     * （能跟进度条流畅拖拽 + 统一容器），所以现在改成出一份这个，并把原因写进 `notes`。
     */
    const sourceHeight = probe?.height ?? 0;
    const plan = TARGET_HEIGHTS.filter((h) => sourceHeight >= h).map((h) => ({
      label: `${h}p`,
      height: h,
      scale: true,
    }));
    if (!plan.length) {
      const label = sourceHeight ? `${sourceHeight}p` : 'source';
      plan.push({ label, height: sourceHeight, scale: false });
      notes.push(
        sourceHeight
          ? `源视频高度 ${sourceHeight}p 低于 720p：不做放大转码，改为产出「源分辨率 + faststart」的版本`
          : '读不到源分辨率：不做缩放，直接重编码一份（容器统一为 mp4 + faststart）',
      );
    }

    for (const v of plan) {
      const target = join(outDir, `${base}_${v.label}.mp4`);
      this.logger.log(`开始转码 ${v.label}：${abs} → ${target}`);
      await this.run(
        this.ffmpegPath(),
        [
          '-y',
          '-i',
          abs,
          /** scale=-2:高度：宽按比例自动取偶数（libx264 要求）；不缩放时省略这个 filter */
          ...(v.scale ? (['-vf', `scale=-2:${v.height}`] as string[]) : []),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          /** 前端拖动进度条要能秒 seek：关键帧间隔固定 */
          '-g',
          '48',
          '-movflags',
          '+faststart',
          target,
        ],
        timeoutMs,
      );

      const rel = `/uploads/curriculum/videos/transcoded/${basename(target)}`;
      variants.push({
        label: v.label,
        path: rel,
        url: this.assets.toAbsoluteUrl(rel) as string,
        height: v.height,
        sizeBytes: statSync(target).size,
      });
    }

    if (!variants.length) {
      /** 走到这里只可能是 plan 为空（保底分支必出一个）—— 真出了就是代码 bug，说清楚 */
      throw new BadRequestException(
        `没有产出任何变体（plan=${plan.length}）：${notes.join('；') || '未知原因'}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `转码完成：${variants.map((v) => v.label).join(' / ')}，耗时 ${(elapsedMs / 1000).toFixed(1)}s`,
    );

    return {
      sourcePath: `/uploads/${abs.replace(/\\/g, '/').split('/uploads/')[1]}`,
      sourceResolution: probe ? { width: probe.width, height: probe.height } : null,
      durationSec: probe?.durationSec ?? null,
      variants,
      elapsedMs,
      notes,
    };
  }
}
