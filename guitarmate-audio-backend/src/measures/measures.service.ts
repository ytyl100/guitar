import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateMeasureData {
  scoreId: string;
  trackId: string;
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  /** 本小节把位（第 P 把位）；为空则不写入 */
  position?: number;
  audioUrl: string;
  /** 练习声道标识，默认 guitar */
  channel?: string;
  /** 原声（全轨混音）同区间切片音频，Original 模式播放 */
  originalAudioUrl?: string | null;
  tabImageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  notes: string; // 已序列化的 JSON 字符串
  barres?: Array<{
    instrument?: string;
    fret: number;
    fromString: number;
    toString: number;
    startTime: number;
    duration: number;
    x: number;
    y: number;
  }>;
  chords?: Array<{
    instrument?: string;
    chordName: string;
    startTime: number;
    duration: number;
    x: number;
    y: number;
    /** 指法图（索引 0 = 六弦，-1 = 闷弦）；落库时序列化为 JSON 字符串 */
    voicing?: number[];
  }>;
}

@Injectable()
export class MeasuresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发布前校验 Score / Track 是否存在且对应，
   * 避免 Prisma 外键约束报出难以理解的原始错误。
   */
  async assertTargetsExist(scoreId: string, trackId: string): Promise<void> {
    const score = await this.prisma.score.findUnique({
      where: { id: scoreId },
      select: { id: true, title: true },
    });
    if (!score) {
      throw new BadRequestException(
        `找不到 Score (id=${scoreId})。请在发布弹窗点「从后端加载曲目」重新选择，或核对 Score ID。`,
      );
    }

    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, scoreId: true, instrument: true },
    });
    if (!track) {
      throw new BadRequestException(
        `找不到 Track (id=${trackId})。可在曲目《${score.title}》下通过 POST /api/scores/${scoreId}/tracks 创建分轨。`,
      );
    }
    if (track.scoreId !== scoreId) {
      throw new BadRequestException(
        `Track(${trackId} / ${track.instrument}) 不属于 Score(${scoreId})，请检查是否选错了曲目与分轨。`,
      );
    }
  }

  /**
   * 读取曲目上记录的原声（全轨混音）地址。
   * 管理员未在发布弹窗显式指定「原声路径」时，作为 Original 模式的默认音源。
   */
  async getScoreOriginalAudio(scoreId: string): Promise<string> {
    const score = await this.prisma.score.findUnique({
      where: { id: scoreId },
      select: { originalAudio: true },
    });
    return (score?.originalAudio || '').trim();
  }

  async create(data: CreateMeasureData) {
    return this.prisma.measure.create({
      data: {
        scoreId: data.scoreId,
        index: data.index,
        label: data.label,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        bpm: data.bpm,
        timeSignature: data.timeSignature,
        position:
          typeof data.position === 'number' && data.position >= 1
            ? Math.min(24, Math.round(data.position))
            : null,
        trackData: {
          create: {
            trackId: data.trackId,
            audioUrl: data.audioUrl,
            channel: data.channel || 'guitar',
            originalAudioUrl: data.originalAudioUrl || null,
            tabImageUrl: data.tabImageUrl,
            imageWidth: data.imageWidth ?? 1200,
            imageHeight: data.imageHeight ?? 300,
            notes: data.notes, // SQLite: 存序列化的 String
          },
        },
        barres: data.barres && data.barres.length > 0
          ? {
              create: data.barres.map((b) => ({
                instrument: b.instrument || 'guitar',
                fret: b.fret,
                fromString: b.fromString,
                toString: b.toString,
                startTime: b.startTime,
                duration: b.duration,
                x: b.x,
                y: b.y,
              })),
            }
          : undefined,
        chords: data.chords && data.chords.length > 0
          ? {
              create: data.chords.map((c) => ({
                instrument: c.instrument || 'guitar',
                chordName: c.chordName,
                startTime: c.startTime,
                duration: c.duration,
                x: c.x,
                y: c.y,
                /** SQLite 不支持 Json → 存序列化字符串，读取时在 PracticePackageService 里还原 */
                voicing: Array.isArray(c.voicing) ? JSON.stringify(c.voicing) : null,
              })),
            }
          : undefined,
      },
      include: {
        trackData: true,
        barres: true,
        chords: true,
      },
    });
  }

  async findByScore(scoreId: string) {
    const score = await this.prisma.score.findUnique({
      where: { id: scoreId },
    });

    if (!score) {
      throw new NotFoundException(`Score with ID '${scoreId}' not found`);
    }

    const measures = await this.prisma.measure.findMany({
      where: { scoreId },
      orderBy: { index: 'asc' },
      include: {
        trackData: true,
        barres: true,
        chords: true,
      },
    });

    // 反序列化 notes: String -> Note[]
    return measures.map((m) => ({
      ...m,
      trackData: m.trackData.map((t) => {
        let parsedNotes: any[] = [];
        try {
          parsedNotes = t.notes ? JSON.parse(t.notes) : [];
        } catch {
          parsedNotes = [];
        }
        return {
          ...t,
          notes: parsedNotes,
        };
      }),
    }));
  }

  /**
   * 清空指定曲目的全部已发布小节。
   * Barre / ChordMarker / MeasureTrack 由 Prisma onDelete: Cascade 一并删除。
   * 用于「重新发布」前清理旧的（可能是音频不可播放的）小节数据。
   */
  async deleteByScore(scoreId: string): Promise<number> {
    const result = await this.prisma.measure.deleteMany({ where: { scoreId } });
    return result.count;
  }
}
