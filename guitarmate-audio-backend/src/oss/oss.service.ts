import { Injectable, Logger } from '@nestjs/common';
import OSS from 'ali-oss';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'fs';
import { basename, join } from 'path';

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private client: OSS | null = null;
  private readonly isConfigured: boolean;

  constructor() {
    const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const bucket = process.env.OSS_BUCKET || 'guitar-practice';

    if (accessKeyId && accessKeySecret && accessKeyId.trim().length > 3) {
      try {
        this.client = new OSS({
          region,
          accessKeyId,
          accessKeySecret,
          bucket,
        });
        this.isConfigured = true;
        this.logger.log(`Aliyun OSS initialized for bucket: ${bucket} in ${region}`);
      } catch (err: any) {
        this.logger.warn(`Failed to initialize Aliyun OSS client: ${err.message}. Falling back to local storage.`);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
      this.logger.log('OSS credentials not configured in environment. Using local dev storage fallback.');
    }
  }

  async upload(localPath: string, remoteDir: string): Promise<string> {
    const filename = basename(localPath);
    const objectKey = `${remoteDir}/${filename}`;

    if (this.isConfigured && this.client) {
      try {
        this.logger.log(`Uploading to Aliyun OSS: ${objectKey}`);
        await this.client.put(objectKey, createReadStream(localPath));
        const bucket = process.env.OSS_BUCKET || 'guitar-practice';
        const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
        const cdnUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
        this.logger.log(`Uploaded to OSS: ${cdnUrl}`);
        return cdnUrl;
      } catch (err: any) {
        this.logger.error(`OSS upload failed: ${err.message}. Saving to local fallback.`);
      }
    }

    // 本地开发 / 回退方案: 保存至 ./uploads 目录
    const localTargetDir = join(process.cwd(), 'uploads', remoteDir);
    if (!existsSync(localTargetDir)) {
      mkdirSync(localTargetDir, { recursive: true });
    }
    const targetFile = join(localTargetDir, filename);
    if (existsSync(localPath)) {
      copyFileSync(localPath, targetFile);
    }

    const host = process.env.APP_URL || 'http://localhost:3000';
    const fallbackUrl = `${host}/uploads/${remoteDir}/${filename}`;
    this.logger.log(`Local dev fallback upload URL: ${fallbackUrl}`);
    return fallbackUrl;
  }

  /**
   * 删除本地回退目录（例如重新发布前清理旧的音频切片）
   * 仅作用于 ./uploads 下的本地回退文件，不影响 OSS 上的对象。
   */
  removeLocalDir(remoteDir: string): void {
    const dir = join(process.cwd(), 'uploads', remoteDir);
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        this.logger.log(`Removed local upload dir: ${dir}`);
      } catch (err: any) {
        this.logger.warn(`Failed to remove local dir ${dir}: ${err.message}`);
      }
    }
  }

  /**
   * 音频切片失败时的降级方案。
   *
   * - 若源是公网 URL：直接返回 `URL#t=start,end`，由前端限制播放区间
   * - 若源是后端可访问的本地文件：复制到 ./uploads 静态目录并返回可播放 URL
   *   （否则把本地绝对路径返回给前端，浏览器永远无法加载 → 播放按钮"点了没反应"）
   * - 其它情况：原样返回并附加片段
   */
  async exposeOriginalAudio(
    sourcePath: string,
    remoteDir: string,
    startTime: number,
    endTime: number,
  ): Promise<string> {
    const fragment = `#t=${startTime.toFixed(3)},${endTime.toFixed(3)}`;
    const host = process.env.APP_URL || 'http://localhost:3000';

    // 1. 公网 URL：直接附加媒体片段
    if (/^https?:\/\//i.test(sourcePath)) {
      this.logger.warn(
        `Slicing unavailable, falling back to remote URL with media fragment: ${sourcePath}${fragment}`,
      );
      return `${sourcePath}${fragment}`;
    }

    // 2. 本地文件：复制到 uploads 静态目录，使其可被浏览器访问
    if (existsSync(sourcePath)) {
      try {
        const localTargetDir = join(process.cwd(), 'uploads', remoteDir);
        if (!existsSync(localTargetDir)) {
          mkdirSync(localTargetDir, { recursive: true });
        }
        const filename = `original_${basename(sourcePath)}`;
        const targetFile = join(localTargetDir, filename);
        if (!existsSync(targetFile)) {
          copyFileSync(sourcePath, targetFile);
        }
        const url = `${host}/uploads/${remoteDir}/${filename}${fragment}`;
        this.logger.warn(
          `Slicing unavailable, serving original audio locally: ${url}`,
        );
        return url;
      } catch (err: any) {
        this.logger.error(`Failed to expose original audio: ${err.message}`);
      }
    }

    // 3. 兜底：原样返回
    this.logger.warn(
      `Slicing unavailable and source is not accessible, keeping raw reference: ${sourcePath}${fragment}`,
    );
    return `${sourcePath}${fragment}`;
  }
}
