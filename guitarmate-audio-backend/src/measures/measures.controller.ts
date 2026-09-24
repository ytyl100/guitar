import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MeasuresService } from './measures.service';
import { AudioService } from '../audio/audio.service';
import { DemoAudioService, type DemoNoteEvent } from '../audio/demo-audio.service';
import { OssService } from '../oss/oss.service';
import { PublishMeasuresDto } from './dto/publish-measures.dto';

@ApiTags('Measures')
@Controller('api/measures')
export class MeasuresController {
  private readonly logger = new Logger(MeasuresController.name);

  constructor(
    private readonly measures: MeasuresService,
    private readonly audio: AudioService,
    private readonly demoAudio: DemoAudioService,
    private readonly oss: OssService,
  ) {}

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '发布曲目小节数据 (音频切片 + OSS 上传 + 计算相对时间 + 写入 SQLite)',
    description:
      '接收乐谱小节列表与原始分轨音频，依次切片对应区间音频、上传至 OSS CDN，将音符绝对时间转换为相对当前小节起始时间的 relativeTime，最后以 JSON 序列化形式存入 SQLite 数据库。',
  })
  @ApiResponse({ status: 200, description: '小节数据发布与入库成功' })
  @ApiResponse({ status: 400, description: '参数校验失败 / 音频来源不可访问' })
  async publish(@Body() dto: PublishMeasuresDto, @Req() req: any) {
    if (!dto.measures || dto.measures.length === 0) {
      throw new BadRequestException('measures array cannot be empty');
    }

    // 0. 发布前校验目标曲目/分轨与分轨音频来源，
    //    避免「发布成功但 C 端永远播不出声」以及难懂的外键报错
    await this.measures.assertTargetsExist(dto.scoreId, dto.trackId);

    const accessibility = await this.audio.checkSourceAccessible(
      dto.trackAudioPath,
    );
    if (!accessibility.ok && !dto.allowMissingAudio) {
      this.logger.error(
        `Publish aborted: audio source unreachable. ${accessibility.reason}`,
      );
      throw new BadRequestException(
        [
          `分轨音频来源不可用，已终止发布（未写入任何数据）。`,
          `原因：${accessibility.reason}`,
          ``,
          `请把「分轨音频路径 / URL」改为下面之一后重试：`,
          `  · 后端服务器上可读取的音频文件绝对路径（推荐）`,
          `    可先执行 \`npm run demo:audio\` 生成示例音频 uploads/demo/demo_guitar.wav`,
          `  · 公网可直接下载的音频 URL（不要使用 cdn.example.com 之类的占位地址）`,
          ``,
          `如果只想先入库谱面标注（不含音频，C 端无法播放），请在请求体加上 "allowMissingAudio": true。`,
        ].join('\n'),
      );
    }
    if (!accessibility.ok) {
      this.logger.warn(
        `Publishing without playable audio (allowMissingAudio=true). ${accessibility.reason}`,
      );
    }

    // 统一使用解析后的来源（相对路径 → 绝对路径），保证切片与降级回退一致
    const resolvedAudioPath = accessibility.resolved || dto.trackAudioPath;

    // 练习声道（C 端 Simplified 模式）与原始声道（C 端 Original 模式）
    // 声道仅记录在 MeasureTrack.channel 上，不改变已存在的 Track.instrument，
    // 避免同一条分轨被不同管理员的多次发布互相覆盖。
    const channel = (dto.channel || 'guitar').trim() || 'guitar';

    // 原声来源：发布弹窗显式指定 > Score.originalAudio
    const explicitOriginal = (dto.originalAudioPath || '').trim();
    const originalSource =
      explicitOriginal || (await this.measures.getScoreOriginalAudio(dto.scoreId));

    let resolvedOriginalPath = '';
    const originalWarnings: string[] = [];
    if (originalSource) {
      const originalAccess = await this.audio.checkSourceAccessible(originalSource);
      if (originalAccess.ok) {
        resolvedOriginalPath = originalAccess.resolved || originalSource;
      } else {
        // 原声不可用不阻断发布（练习声道与谱面仍可用），只降级 + 告警
        originalWarnings.push(
          `原声（Original 模式）音源不可用：${originalSource}\n原因：${originalAccess.reason}\n` +
            `C 端切到 Original 时将自动回退到 Simplified 的练习声道音频。`,
        );
        this.logger.warn(
          `Original audio unreachable, publishing without it. ${originalAccess.reason}`,
        );
      }
    } else {
      originalWarnings.push(
        `未提供原声路径，且曲目《${dto.scoreId}》的 originalAudio 为空。` +
          `C 端 Original 模式将回退到 Simplified 的练习声道音频。`,
      );
    }

    // 原声与练习声道指向同一文件时无需重复切片
    const originalIsSameAsChannel =
      !!resolvedOriginalPath && resolvedOriginalPath === resolvedAudioPath;

    try {
      const results = [];
      const rawMeasures = req?.body?.measures || [];
      let degradedCount = 0;
      let metronomeCount = 0;

      /**
       * 切片失败时的降级策略：
       * - `metronome`：为每个小节现场合成「节拍器 + 鼓」占位音频。
       *   纯谱面导入（ASCII tab / MusicXML / 和弦表，没有音频）时使用，
       *   C 端仍能正常播放 + 高亮节点，做无声练习。
       * - `source`（默认，保持旧行为）：返回「原始音频 + #t=start,end」。
       */
      const useMetronomeFallback = (dto.audioFallback || 'source') === 'metronome';
      const beatsPerBar = Math.max(
        1,
        parseInt((dto.timeSignature || '4/4').split('/')[0], 10) || 4,
      );

      for (let mIndex = 0; mIndex < dto.measures.length; mIndex++) {
        const m = dto.measures[mIndex];
        const rawM = rawMeasures[mIndex] || {};
        let audioUrl = '';

        // 1. 切音频 & 2. 上传 OSS
        try {
          const localPath = await this.audio.sliceAudio(
            resolvedAudioPath,
            m.startTime,
            m.endTime,
          );
          audioUrl = await this.oss.upload(localPath, `measures/${dto.scoreId}`);
        } catch (err: any) {
          if (useMetronomeFallback) {
            const measureSec = Math.max(0.25, m.endTime - m.startTime);
            const rendered = this.demoAudio.renderFromNotes(
              [],
              measureSec,
              `metro_${dto.scoreId}_m${m.index}`,
              { measures: [{ startTime: 0, endTime: measureSec }], beatsPerBar },
            );
            audioUrl = await this.oss.upload(rendered.absolutePath, `measures/${dto.scoreId}`);
            metronomeCount += 1;
            this.logger.warn(
              `Measure ${m.index}: no usable audio, generated metronome placeholder (${measureSec.toFixed(2)}s).`,
            );
          } else {
            this.logger.warn(
              `Audio slicing/uploading failed for measure ${m.index}: ${err.message}. Falling back to a playable original-audio reference.`,
            );
            // 降级: 暴露原始音频并把播放区间交给前端 (#t=start,end 媒体片段)
            degradedCount += 1;
            audioUrl = await this.oss.exposeOriginalAudio(
              resolvedAudioPath,
              `measures/${dto.scoreId}`,
              m.startTime,
              m.endTime,
            );
          }
        }

        // 2b. 切原声（C 端 Original 模式音源）
        let originalAudioUrl: string | null = null;
        if (originalIsSameAsChannel) {
          // 原声 === 练习声道，直接复用，省一次 ffmpeg 切片
          originalAudioUrl = audioUrl;
        } else if (resolvedOriginalPath) {
          try {
            const localOriginal = await this.audio.sliceAudio(
              resolvedOriginalPath,
              m.startTime,
              m.endTime,
            );
            originalAudioUrl = await this.oss.upload(
              localOriginal,
              `measures/${dto.scoreId}/original`,
            );
          } catch (err: any) {
            this.logger.warn(
              `Original-audio slicing failed for measure ${m.index}: ${err.message}. Falling back to #t= window on the original source.`,
            );
            try {
              originalAudioUrl = await this.oss.exposeOriginalAudio(
                resolvedOriginalPath,
                `measures/${dto.scoreId}/original`,
                m.startTime,
                m.endTime,
              );
            } catch (fallbackErr: any) {
              this.logger.warn(
                `Original-audio fallback failed for measure ${m.index}: ${fallbackErr.message}`,
              );
              originalAudioUrl = null;
            }
          }
        }

        // 3. 计算音符相对时间 (relativeTime = audioTime - startTime)
        const notes = (m.notes || []).map((n, noteIndex) => ({
          id: n.id || `n_${m.index}_${noteIndex}`,
          string: n.string,
          fret: n.fret,
          pitch: n.pitch,
          relativeTime: Number((n.audioTime - m.startTime).toFixed(4)),
          duration: n.duration,
          confidence: n.confidence ?? 1.0,
          x: n.x ?? 0,
          y: n.y ?? 0,
          /**
           * 左手指法（0 = 空弦，1-4 = 食指…小指）。
           * 以前这一步没拷贝 finger，所以即使上游算了指法，
           * 存进去的 notes JSON 里也丢掉了 → C 端永远看不到手指标注。
           */
          finger: typeof n.finger === 'number' ? n.finger : undefined,
          /** 该音生效的手位（可与小节把位不同：小节内换把） */
          position: typeof n.position === 'number' ? n.position : undefined,
        }));

        // 提取横按数据并安全处理 toString (避免 JavaScript Object.prototype.toString 函数冲突)
        const rawBarres = rawM.barres || m.barres || [];
        const sanitizedBarres = (rawBarres || []).map((b: any) => {
          let toStringVal = 6;
          if (typeof b.toString === 'number') {
            toStringVal = b.toString;
          } else if (typeof b.endString === 'number') {
            toStringVal = b.endString;
          } else if (typeof b.fromString === 'number') {
            toStringVal = b.fromString;
          }
          return {
            instrument: b.instrument || 'guitar',
            fret: b.fret,
            fromString: b.fromString,
            toString: toStringVal,
            startTime: b.startTime,
            duration: b.duration,
            x: b.x,
            y: b.y,
          };
        });

        // 4. 写库 (SQLite: notes 存储为 JSON 序列化后的 String)
        const measure = await this.measures.create({
          scoreId: dto.scoreId,
          trackId: dto.trackId,
          startTime: m.startTime,
          endTime: m.endTime,
          duration: Number((m.endTime - m.startTime).toFixed(4)),
          bpm: dto.bpm,
          timeSignature: dto.timeSignature,
          /** 小节把位（第 P 把位）—— 由上游 TabProject.fingering 推定或人工指定 */
          position: typeof m.position === 'number' ? m.position : undefined,
          label: m.label,
          index: m.index,
          audioUrl,
          channel,
          originalAudioUrl,
          tabImageUrl: m.tabImageUrl,
          imageWidth: 1200,
          imageHeight: 300,
          notes: JSON.stringify(notes), // ← SQLite: String
          barres: sanitizedBarres,
          chords: m.chords,
        });

        results.push(measure);
      }

      return {
        success: true,
        message: `Successfully published ${results.length} measures`,
        scoreId: dto.scoreId,
        trackId: dto.trackId,
        /** 练习声道（C 端 Simplified 模式） */
        channel,
        /** 原声（C 端 Original 模式）；false 表示已降级为回退到练习声道 */
        hasOriginalAudio: !!resolvedOriginalPath,
        measures: results,
        /** 音频切片失败、降级为「原始音频 + #t=start,end」的小节数量 */
        degradedAudioCount: degradedCount,
        /** 没有可用音频、改用「节拍器占位音频」的小节数量（纯谱面发布） */
        metronomeFallbackCount: metronomeCount,
        warnings: [
          ...(metronomeCount > 0
            ? [
                `${metronomeCount}/${results.length} 个小节没有可用音频，已合成「节拍器占位音频」（纯 Node 合成，无需 ffmpeg）。`,
                `C 端仍可正常播放、高亮六线谱节点，做无声练习；后续拿到真实分轨音频后重新发布即可替换。`,
                `如果想听到与标注**精确对齐**的示范音频，请先发布一次，再调用 POST /api/measures/render-audio（withBand=true 可加鼓/贝斯）生成，然后在发布弹窗里把它填为分轨音频路径。`,
              ]
            : []),
          ...(degradedCount > 0
            ? [
                `${degradedCount}/${results.length} 个小节的音频切片失败，已降级为「原始音频 + 时间片段」。`,
                `音频来源：${resolvedAudioPath}`,
                `C 端播放要求该来源本身可访问；若使用占位地址（如 cdn.example.com）将无法播放。`,
              ]
            : []),
          ...originalWarnings,
        ],
      };
    } catch (err: any) {
      this.logger.error(`Publish error: ${err.message}`, err.stack);
      throw new BadRequestException(`Publish error: ${err.message}`);
    }
  }

  @Post('render-audio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '根据小节音符标注合成「与之精确对齐」的示范音频',
    description:
      '读取该曲目已发布小节的音符标注（弦/品/relativeTime），逐音拨响合成一段与标注完全对齐的 WAV 并写入 uploads/demo/。用于验证「音频 ↔ 六线谱节点 ↔ 播放游标」的时序一致性（没有标注的时间点不会有声音）。传 withBand=true 时会额外叠加贝斯 + 鼓，得到一份与标注同一节拍网格的「原声（全轨混音）」，用于 C 端 Original 模式对比。',
  })
  @ApiResponse({ status: 200, description: '返回可直接用于发布的音频路径与波形峰值' })
  @ApiResponse({ status: 400, description: '曲目无已发布小节 / 无音符标注' })
  async renderAudio(
    @Body()
    body: {
      scoreId: string;
      fileName?: string;
      /** true → 叠加贝斯 + 鼓，得到「原声（全轨混音）」，填到 Original 原声路径 */
      withBand?: boolean;
      /** 每小节拍数，默认取 timeSignature 分子 (4) */
      beatsPerBar?: number;
    },
  ) {
    const scoreId = (body?.scoreId || '').trim();
    if (!scoreId) {
      throw new BadRequestException('scoreId is required');
    }

    const measures = await this.measures.findByScore(scoreId);
    if (measures.length === 0) {
      throw new BadRequestException(
        `曲目 ${scoreId} 还没有已发布的小节，请先「发布小节至后端」。`,
      );
    }

    const events: DemoNoteEvent[] = [];
    let totalDuration = 0;

    for (const m of measures) {
      totalDuration = Math.max(totalDuration, m.endTime);
      for (const track of m.trackData) {
        for (const n of track.notes as any[]) {
          const rawFret = n.fret;
          const fret =
            typeof rawFret === 'number'
              ? rawFret
              : parseInt(String(rawFret ?? '').replace(/\D/g, ''), 10) || 0;
          events.push({
            atSec: Number((m.startTime + (n.relativeTime ?? 0)).toFixed(4)),
            string: n.string,
            fret,
            durationSec: n.duration ?? 0.6,
            velocity: 96,
          });
        }
      }
    }

    if (events.length === 0) {
      throw new BadRequestException('该曲目的小节里没有音符标注，无法合成示范音频。');
    }

    // 「原声（全轨混音）」伴奏参数：节拍网格取自小节窗口，
    // 因此即使 DB 上的 bpm 元数据与实际标注网格不一致，鼓/贝斯也会落在节点上
    const withBand = !!body.withBand;
    // 注意：不能用 `Math.max(1, x) || fallback` —— 那样 0 会被夹成 1，永远走不到 fallback
    const requestedBeats = Number(body.beatsPerBar);
    const beatsPerBar =
      Number.isFinite(requestedBeats) && requestedBeats > 0
        ? Math.round(requestedBeats)
        : parseInt(String(measures[0].timeSignature || '4/4').split('/')[0], 10) || 4;

    const rendered = this.demoAudio.renderFromNotes(
      events,
      totalDuration,
      body.fileName || (withBand ? `render_band_${scoreId}` : `render_${scoreId}`),
      withBand
        ? {
            beatsPerBar,
            measures: measures.map((m) => ({
              startTime: m.startTime,
              endTime: m.endTime,
            })),
          }
        : undefined,
    );

    return {
      success: true,
      scoreId,
      withBand,
      beatsPerBar: withBand ? beatsPerBar : undefined,
      measureCount: measures.length,
      /** 可直接填入「分轨音频路径 / URL」（withBand=true 时填到「Original 原声路径」） */
      suggestedPath: rendered.relativePath,
      absolutePath: rendered.absolutePath,
      url: rendered.url,
      durationSec: rendered.durationSec,
      noteCount: rendered.noteCount,
      peaks: rendered.peaks,
      message: withBand
        ? `已根据 ${rendered.noteCount} 个音符标注合成 ${rendered.durationSec}s 原声（吉他 + 贝斯 + 鼓，与节点同节拍网格）。`
        : `已根据 ${rendered.noteCount} 个音符标注合成 ${rendered.durationSec}s 对齐示范音频。`,
    };
  }

  @Get('demo-audio')
  @ApiOperation({
    summary: '获取内置示例音频信息（联调用）',
    description:
      '返回 uploads/demo/demo_guitar.wav 的可用状态与推荐填写值，供管理后台「发布小节至后端」弹窗一键填入分轨音频路径。',
  })
  getDemoAudioInfo() {
    const suggestedPath = 'uploads/demo/demo_guitar.wav';
    const parsed = this.audio.resolveInput(suggestedPath);
    const host = process.env.APP_URL || 'http://localhost:3000';

    return {
      available: parsed.ok,
      suggestedPath,
      absolutePath: parsed.resolved,
      url: `${host}/uploads/demo/demo_guitar.wav`,
      hint: parsed.ok
        ? undefined
        : '示例音频不存在，请在后端目录执行 `npm run demo:audio` 生成。',
    };
  }

  @Delete('score/:scoreId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '清空指定曲目的全部已发布小节',    description:
      '删除该曲目下所有 Measure（Barre / ChordMarker / MeasureTrack 级联删除），并清理本地 ./uploads/measures/{scoreId} 切片目录。用于重新发布前清理旧的、音频不可播放的小节数据。',
  })
  @ApiParam({ name: 'scoreId', description: '曲目 Score ID' })
  @ApiResponse({ status: 200, description: '已清空并返回删除数量' })
  async clearByScore(@Param('scoreId') scoreId: string) {
    const deleted = await this.measures.deleteByScore(scoreId);
    this.oss.removeLocalDir(`measures/${scoreId}`);
    this.logger.log(`Cleared ${deleted} measures for score ${scoreId}`);
    return {
      success: true,
      scoreId,
      deleted,
      message: `已清空 ${deleted} 个小节，可在管理后台重新发布。`,
    };
  }
}
