import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { isAbsolute, join, resolve as pathResolve } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync } from 'fs';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

export interface ResolvedAudioSource {
  ok: boolean;
  /** 可直接交给 ffmpeg 的路径或 URL */
  resolved: string;
  isRemote: boolean;
  reason: string;
}

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  /**
   * 把用户填写的「分轨音频路径 / URL」解析成 ffmpeg 可直接读取的形式。
   *
   * 支持（按优先级）：
   * 1. `http(s)://...` 公网/本地服务 URL
   * 2. 绝对路径，如 `D:\...\uploads\demo\demo_guitar.wav`
   * 3. 相对项目根目录的路径，如 `uploads/demo/demo_guitar.wav`
   * 4. `/uploads/...` 或 `demo/demo_guitar.wav` 等省略 uploads 前缀的写法
   *
   * 这样可以避免「必须填对当前机器绝对路径」的易错点。
   */
  resolveInput(input: string): ResolvedAudioSource {
    const raw = (input || '').trim();
    if (!raw) {
      return { ok: false, resolved: '', isRemote: false, reason: '分轨音频路径为空' };
    }

    // 1. 远程 URL
    if (/^https?:\/\//i.test(raw)) {
      return { ok: true, resolved: raw, isRemote: true, reason: '远程 URL' };
    }

    const normalize = (p: string) => p.replace(/^file:\/\//i, '');
    const cwd = process.cwd();
    const trimmed = normalize(raw);

    const candidates = new Set<string>();
    // 2. 原样（绝对路径）
    candidates.add(isAbsolute(trimmed) ? trimmed : pathResolve(cwd, trimmed));
    // 3. 相对项目根目录
    candidates.add(pathResolve(cwd, trimmed));
    // 4. 视为相对 uploads/ 目录
    const withoutUploadsPrefix = trimmed
      .replace(/^[\\/]+/, '')
      .replace(/^uploads[\\/]/i, '');
    candidates.add(pathResolve(cwd, 'uploads', withoutUploadsPrefix));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const note = candidate !== trimmed ? `（已解析为 ${candidate}）` : '';
        return { ok: true, resolved: candidate, isRemote: false, reason: `本地文件存在${note}` };
      }
    }

    return {
      ok: false,
      resolved: trimmed,
      isRemote: false,
      reason: `后端机器上找不到该文件：${trimmed}（可填绝对路径，或相对项目根目录的 uploads/xxx.wav）`,
    };
  }

  /**
   * 校验分轨音频来源是否可被后端读取。
   *
   * 发布小节前先做这一步，可以避免「发布成功但 C 端永远播放不了」的静默失败：
   * - 本地路径 → 文件是否存在
   * - http(s) URL → 是否可连通 (HEAD，失败回退 GET Range)
   */
  async checkSourceAccessible(
    inputPath: string,
  ): Promise<{ ok: boolean; reason: string; resolved: string }> {
    const parsed = this.resolveInput(inputPath);
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason, resolved: parsed.resolved };
    }
    if (!parsed.isRemote) {
      return { ok: true, reason: parsed.reason, resolved: parsed.resolved };
    }

    // 公网 / 本地服务 URL —— 探测是否可连通
    const source = parsed.resolved;
    const timeoutMs = 6000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res = await fetch(source, { method: 'HEAD', signal: controller.signal });
      // 部分 CDN/OSS 不支持 HEAD，回退为带 Range 的 GET
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        res = await fetch(source, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: controller.signal,
        });
      }
      if (!res.ok) {
        return {
          ok: false,
          reason: `音频 URL 不可访问（HTTP ${res.status}）：${source}`,
          resolved: source,
        };
      }
      return { ok: true, reason: '远程音频可访问', resolved: source };
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      return {
        ok: false,
        reason: aborted
          ? `音频 URL 连接超时（>${timeoutMs / 1000}s）：${source}`
          : `音频 URL 无法连接：${source}（${err?.message || 'network error'}）`,
        resolved: source,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async sliceAudio(
    inputPath: string,
    startTime: number,
    endTime: number,
  ): Promise<string> {
    // 解析「相对 uploads / 绝对路径 / URL」三种写法
    const source = this.resolveInput(inputPath);
    if (!source.ok) {
      throw new Error(source.reason);
    }
    const ffmpegInput = source.resolved;

    const duration = Math.max(0.01, endTime - startTime);
    const tempDir = join(tmpdir(), 'guitarmate-audio');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const outputPath = join(
      tempDir,
      `slice_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
    );

    this.logger.log(
      `Slicing audio from ${startTime.toFixed(3)}s to ${endTime.toFixed(3)}s (duration ${duration.toFixed(3)}s) for ${ffmpegInput}`,
    );

    // 计算淡出起始时间，淡入 5ms (0.005s), 淡出 5ms
    const fadeOutStart = Math.max(0.001, duration - 0.005);
    const audioFilter = `afade=t=in:d=0.005,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.005`;

    return new Promise<string>((resolve, reject) => {
      ffmpeg(ffmpegInput)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .outputOptions(['-af', audioFilter])
        .on('start', (cmdline) => {
          this.logger.debug(`FFmpeg command: ${cmdline}`);
        })
        .on('end', () => {
          this.logger.log(`Audio slice created successfully at: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`FFmpeg slice error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    });
  }
}
