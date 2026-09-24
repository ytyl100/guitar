import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SoloTraceJson } from '../shared/types';

/** SQLite 里 tuning 存的是 JSON 字符串（例如 `["E2","A2",...]`）→ 反序列化为数组 */
function parseTuningArray(raw?: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed;
  } catch {
    const tokens = String(raw).match(/[A-Ga-g][#b]?\d/g);
    if (tokens && tokens.length >= 4) return tokens.map((t) => t.toUpperCase());
  }
  return null;
}

@Injectable()
export class ScoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const scores = await this.prisma.score.findMany({
      include: {
        tracks: true,
        _count: {
          select: {
            measures: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // tuning 在 SQLite 里是 JSON 字符串，直接返回给前端不好用 → 反序列化成数组
    return scores.map((s) => ({ ...s, tuning: parseTuningArray(s.tuning) }));
  }

  async findOne(id: string) {
    const score = await this.prisma.score.findUnique({
      where: { id },
      include: {
        tracks: true,
        measures: {
          orderBy: { index: 'asc' },
          include: {
            trackData: true,
            barres: true,
            chords: true,
          },
        },
      },
    });

    if (!score) {
      throw new NotFoundException(`Score with ID '${id}' not found`);
    }

    return {
      ...score,
      tuning: parseTuningArray(score.tuning),
      measures: score.measures.map((m) => ({
        ...m,
        trackData: m.trackData.map((t) => ({
          ...t,
          notes: t.notes ? JSON.parse(t.notes) : [],
        })),
      })),
    };
  }

  async create(data: {
    title: string;
    artist?: string;
    bpm?: number;
    timeSignature?: string;
    originalAudio: string;
    coverUrl?: string;
    status?: string;
    /** 调性，例如 "Bm" */
    songKey?: string;
    /** 变调夹品位 */
    capo?: number;
    /** 调弦（由低到高的音名数组）；落库时会序列化为 JSON 字符串 */
    tuning?: string[];
    /** 版权/授权状态：public_domain | cc_by | authorized | user_uploaded */
    license?: string;
    /** 难度 1-5 */
    difficulty?: number;
  }) {
    return this.prisma.score.create({
      data: {
        title: data.title,
        artist: data.artist,
        bpm: data.bpm,
        timeSignature: data.timeSignature || '4/4',
        originalAudio: data.originalAudio,
        coverUrl: data.coverUrl,
        status: data.status || 'draft',
        songKey: data.songKey,
        capo: data.capo,
        tuning: data.tuning ? JSON.stringify(data.tuning) : undefined,
        license: data.license,
        difficulty: data.difficulty,
      },
    });
  }

  /**
   * 更新曲目元数据（不含分轨与小节）。
   *
   * 关键：`tuning` 传数组会序列化成 JSON 字符串（SQLite 无 Json 类型），
   * 传 `null` 表示清空该字段；未传的字段保持不变。
   */
  async updateMeta(
    id: string,
    data: {
      title?: string;
      artist?: string | null;
      bpm?: number | null;
      timeSignature?: string;
      originalAudio?: string;
      coverUrl?: string | null;
      songKey?: string | null;
      capo?: number | null;
      tuning?: string[] | null;
      license?: string | null;
      difficulty?: number | null;
    },
  ) {
    const score = await this.prisma.score.findUnique({ where: { id } });
    if (!score) {
      throw new NotFoundException(`Score with ID '${id}' not found`);
    }

    return this.prisma.score.update({
      where: { id },
      data: {
        title: data.title ?? undefined,
        artist: data.artist === undefined ? undefined : data.artist,
        bpm: data.bpm === undefined ? undefined : data.bpm,
        timeSignature: data.timeSignature ?? undefined,
        originalAudio: data.originalAudio ?? undefined,
        coverUrl: data.coverUrl === undefined ? undefined : data.coverUrl,
        songKey: data.songKey === undefined ? undefined : data.songKey,
        capo: data.capo === undefined ? undefined : data.capo,
        tuning:
          data.tuning === undefined
            ? undefined
            : data.tuning === null
              ? null
              : JSON.stringify(data.tuning),
        license: data.license === undefined ? undefined : data.license,
        difficulty: data.difficulty === undefined ? undefined : data.difficulty,
      },
    });
  }

  async addTrack(
    scoreId: string,
    data: {
      instrument: string;
      audioUrl: string;
      jsonUrl?: string;
    },
  ) {
    return this.prisma.track.create({
      data: {
        scoreId,
        instrument: data.instrument,
        audioUrl: data.audioUrl,
        jsonUrl: data.jsonUrl,
      },
    });
  }

  async updateStatus(id: string, status: 'draft' | 'published') {
    return this.prisma.score.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * 导入 Mac 工作站 (SoloTrace / Basic Pitch) 导出的转录 JSON。
   * - 将原始 JSON 落盘到 ./uploads/transcriptions/{scoreId}/ 便于后台溯源
   * - 创建或更新对应的 Track (instrument + jsonUrl)
   * - 若 JSON 内含 bpm / timeSignature，同步回写 Score
   */
  async importTranscription(
    scoreId: string,
    payload: {
      trackId?: string;
      instrument?: string;
      audioUrl?: string;
      fileName?: string;
      data: SoloTraceJson;
    },
  ) {
    const score = await this.prisma.score.findUnique({ where: { id: scoreId } });
    if (!score) {
      throw new NotFoundException(`Score with ID '${scoreId}' not found`);
    }

    const data = payload.data;
    if (!data || !Array.isArray(data.notes)) {
      throw new BadRequestException(
        'Invalid transcription payload: expect SoloTrace JSON with a notes array',
      );
    }

    // 1. 落盘保存转录 JSON
    const dir = join(process.cwd(), 'uploads', 'transcriptions', scoreId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const safeName = (payload.fileName || `transcription_${Date.now()}`)
      .replace(/[^a-zA-Z0-9_\-.]/g, '_')
      .replace(/\.json$/i, '');
    const absPath = join(dir, `${safeName}.json`);
    writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');

    const host = process.env.APP_URL || 'http://localhost:3000';
    const jsonUrl = `${host}/uploads/transcriptions/${scoreId}/${safeName}.json`;

    // 2. 创建 / 更新 Track
    const instrument = payload.instrument || 'guitar';
    let track = payload.trackId
      ? await this.prisma.track.findUnique({ where: { id: payload.trackId } })
      : null;

    if (track && track.scoreId !== scoreId) {
      track = null;
    }

    if (track) {
      track = await this.prisma.track.update({
        where: { id: track.id },
        data: {
          jsonUrl,
          instrument: payload.instrument || track.instrument,
          audioUrl: payload.audioUrl || track.audioUrl,
        },
      });
    } else {
      track = await this.prisma.track.create({
        data: {
          scoreId,
          instrument,
          audioUrl: payload.audioUrl || score.originalAudio,
          jsonUrl,
        },
      });
    }

    // 3. 回写 BPM / 拍号
    if (data.bpm || data.timeSignature) {
      await this.prisma.score.update({
        where: { id: scoreId },
        data: {
          bpm: data.bpm ? Math.round(data.bpm) : undefined,
          timeSignature: data.timeSignature || undefined,
        },
      });
    }

    return {
      success: true,
      scoreId,
      trackId: track.id,
      jsonUrl,
      bpm: data.bpm,
      timeSignature: data.timeSignature || '4/4',
      noteCount: data.notes.length,
    };
  }
}
