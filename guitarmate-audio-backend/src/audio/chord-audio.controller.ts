import { BadRequestException, Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DemoAudioService, type DemoNoteEvent } from './demo-audio.service';

/**
 * 拨弦 / 扫弦试听合成（给小程序「和弦库」用）
 * ==========================================
 *
 * ## 为什么要有这个端点
 *
 * Web 版的和弦试听是**客户端现场合成**的（`utils/audioSynth.ts` 用 Web Audio 的振荡器）。
 * 小程序**没有 Web Audio API** —— `Taro.createInnerAudioContext()` 只能播一个音频文件，
 * 拿不到振荡器。于是只有两条路：
 * 1. 把试听按钮做成假的（我最不想干的事）；
 * 2. 让后端合成一段 WAV 给客户端播 —— 后端本来就有纯 Node 的拨弦合成器
 *    （`DemoAudioService.pluck`：衰减正弦 + 指数包络，用来生成「与标注对齐的示范音频」）。
 *
 * 选 2。
 *
 * ## 为什么接口是「无业务语义」的
 *
 * 它只认「第几弦第几品 + 每弦间隔多少毫秒」，**不认识"和弦"这个概念**。
 * 和弦指法数据（`chordLibraryData.ts`，420 行）因此只存在于客户端一份 ——
 * 若让后端也认识 `E/sus4`，就要把那 420 行复制到后端，两边一定会漂移。
 *
 * ## 输出
 *
 * 返回一个**静态 URL**（`uploads/demo/<确定性文件名>.wav`）而不是字节流：
 * 文件名由参数决定 → 同一个和弦永远同一个文件，配合 `uploads/` 的长缓存头（7d immutable）
 * 客户端可以直接缓存，也不会不断堆积新文件。
 */
@ApiTags('audio')
@Controller('api/audio')
export class ChordAudioController {
  private readonly logger = new Logger(ChordAudioController.name);

  constructor(private readonly demoAudio: DemoAudioService) {}

  /** 单个音最长留声时长（秒），与 Web 版 `playString(freq, 2.2, 0)` 对齐 */
  private static readonly RING_SEC = 2.2;

  /**
   * 扫弦 / 拨单弦
   *
   * @param frets 6 个逗号分隔的品位，**顺序 = 第 6 弦 → 第 1 弦**（与 `chordLibraryData` 一致）。
   *              `-1` 表示闷弦/不弹（跳过），`0` = 空弦。
   * @param delay 每根弦之间的间隔毫秒（扫弦的"琶音感"）。Web 版是 35ms；拨单弦传 0。
   */
  @Get('strum')
  @ApiOperation({ summary: '按品位拨弦/扫弦合成一段 WAV（给小程序和弦库试听）' })
  @ApiQuery({ name: 'frets', description: '6 个品位，逗号分隔，顺序为第 6 弦→第 1 弦；-1 = 不弹' })
  @ApiQuery({ name: 'delay', required: false, description: '每弦间隔毫秒，默认 35' })
  strum(@Query('frets') frets?: string, @Query('delay') delay?: string) {
    const parsed = String(frets ?? '')
      .split(',')
      .map((s) => Number(s.trim()));

    if (parsed.length !== 6 || parsed.some((n) => !Number.isFinite(n))) {
      throw new BadRequestException('frets 必须是 6 个逗号分隔的数字（如 0,2,2,1,0,0）');
    }
    if (parsed.some((n) => n < -1 || n > 24)) {
      throw new BadRequestException('品位必须在 -1(不弹) ~ 24 之间');
    }

    const delayMs = Math.min(200, Math.max(0, Number(delay) || 35));

    /**
     * 拼事件：`chordLibraryData` 的下标 0 = 第 6 弦（低音 E），
     * 而 `DemoNoteEvent.string` 是 1-6、**1 = 最细的高音 E**（与 `STRING_BASE_FREQ` 一致）→ 6 - idx。
     */
    const events: DemoNoteEvent[] = [];
    let atSec = 0;
    for (let idx = 0; idx < 6; idx += 1) {
      const fret = parsed[idx];
      if (fret < 0) continue;
      events.push({ atSec, string: 6 - idx, fret, durationSec: ChordAudioController.RING_SEC });
      atSec += delayMs / 1000;
    }

    if (events.length === 0) {
      throw new BadRequestException('至少要有 1 根弦可弹（frets 不能全是 -1）');
    }

    /** 确定性文件名：同参数 → 同文件（避免每次点试听都生成一份新的） */
    const fileName = `strum_${parsed.map((n) => String(n).replace('-', 'm')).join('_')}_${delayMs}`;
    const rendered = this.demoAudio.renderFromNotes(
      events,
      atSec + ChordAudioController.RING_SEC,
      fileName,
    );

    this.logger.log(
      `strum frets=[${parsed.join(',')}] delay=${delayMs}ms → ${rendered.relativePath} (${rendered.durationSec}s)`,
    );

    return {
      url: rendered.url,
      relativePath: rendered.relativePath,
      durationSec: rendered.durationSec,
      noteCount: rendered.noteCount,
    };
  }
}
