import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  PARSER_VERSION,
  STANDARD_TUNING,
  computeStats,
  makeNote,
  makeWarning,
} from '../tab-import/tab-project.utils';
import {
  TAB_PROJECT_FORMAT_ID,
  TAB_PROJECT_VERSION,
  type TabProject,
  type TabProjectNote,
  type TabProjectTrack,
} from '../tab-import/tab-project.types';
import {
  LOW_CONFIDENCE_THRESHOLD,
  midiToName,
  measureDurationSec,
  round4,
  type SeparateWorkerResult,
  type TranscribeWorkerResult,
  type TranscribedNote,
} from './transcription.types';

/**
 * 模拟转录（无 Python 依赖时的兜底实现）
 * ====================================
 *
 * 为什么需要它？
 * ----
 * 真实链路依赖 Demucs / Basic Pitch / Tayuya 三个 Python 生态，安装门槛高
 * （PyTorch ~2GB）。如果 `POST /projects/:id/start` 在没有 Python 的机器上必然失败，
 * 那么「上传 → 队列 → 审核 → 发布 → PracticePackage」这条链路的**任何一环都无法验证**，
 * 也没法给前端同学提供稳定的联调数据。
 *
 * 因此当 `PythonRunnerService.probe()` 报告依赖缺失时，自动走这里：
 *
 * | 真实阶段 | 模拟产物 | 说明 |
 * |---|---|---|
 * | Demucs 分离 | 源音频直接作为 `guitar` 分轨 | 不产生新音频，只是路径登记 |
 * | Basic Pitch 转录 | 按节拍网格生成的练习音符 + **真实可用的 SMF MIDI 文件** | 刻意混入低置信度音符，用于验证 ReviewPage 标红 |
 * | Tayuya 转谱 | 一个**结构化合法的 TabProject**（与 tab-import 同一结构） | 下游 `projectToPublishMeasures` 可直接消费 |
 *
 * ⚠️ 产物一律带 `simulated` 标记与 `warn` 级 warning，`provenance.humanReviewLevel` 会很低，
 * 绝不会被误当成真实转录结果上线。
 */
@Injectable()
export class TranscriptionSimulationService {
  private readonly logger = new Logger(TranscriptionSimulationService.name);

  /** 模拟分离：源音频即 guitar 分轨（保留 vocals/drums 的空登记以便 UI 展示完整 6 stem 语义） */
  buildStems(sourcePath: string, durationSec = 0): SeparateWorkerResult {
    this.logger.warn(`[模拟] Demucs 不可用 → 直接把源音频登记为 guitar 分轨：${sourcePath}`);
    return {
      ok: true,
      model: 'simulated (htdemucs_6s unavailable)',
      message: 'Demucs 不可用，已用源音频代替 guitar 分轨（模拟模式）。',
      stems: [{ instrument: 'guitar', path: sourcePath, durationSec }],
    };
  }

  /**
   * 模拟 Basic Pitch 转录：
   * 在 8 分音符网格上生成一条 I-IV-V-I 式的单音练习（一弦起，逐步下移到三弦），
   * 并刻意让约 1/5 的音符置信度低于 0.6（ReviewPage 会标红）。
   */
  buildTranscription(input: {
    instrument: string;
    durationSec: number;
    bpm: number;
    tuning?: number[];
    midiPath: string;
    seed?: number;
  }): TranscribeWorkerResult {
    const tuning = input.tuning?.length ? input.tuning : [...STANDARD_TUNING];
    const bpm = input.bpm > 0 ? input.bpm : 100;
    const eighth = (60 / bpm) / 2;
    const measureSec = measureDurationSec(bpm, '4/4');

    const totalSec = input.durationSec > 0 ? input.durationSec : measureSec * 4;
    const maxNotes = Math.min(512, Math.max(8, Math.floor(totalSec / eighth)));

    // 一个有音高走向的练习乐句：弦 1/2/3 上的自然音阶片段
    const pattern: Array<{ string: number; fret: number }> = [
      { string: 1, fret: 0 },
      { string: 1, fret: 2 },
      { string: 1, fret: 3 },
      { string: 2, fret: 0 },
      { string: 2, fret: 2 },
      { string: 2, fret: 3 },
      { string: 3, fret: 0 },
      { string: 3, fret: 2 },
    ];

    const seed = input.seed ?? 7;
    const notes: TranscribedNote[] = [];
    for (let i = 0; i < maxNotes; i += 1) {
      const slot = pattern[(i + seed) % pattern.length];
      const startSec = round4(i * eighth);
      // 每隔 5 个音符塞一个低置信度音符（模拟 Basic Pitch 在快速乐句上的漏检）
      const low = i % 5 === 3;
      const confidence = low ? round4(0.31 + ((i * 7) % 11) / 100) : round4(0.74 + ((i * 13) % 23) / 100);
      notes.push({
        id: `sim_${i}`,
        string: slot.string,
        fret: slot.fret,
        pitch: tuning[slot.string - 1] + slot.fret,
        startSec,
        durationSec: round4(eighth * 0.9),
        confidence: Math.min(0.99, confidence),
        velocity: low ? 64 : 92,
        technique: 'normal',
      });
    }

    // 写一个真实可用的 SMF（Type 0）MIDI 文件，方便人工用任意 DAW 试听核对
    try {
      if (!existsSync(dirname(input.midiPath))) mkdirSync(dirname(input.midiPath), { recursive: true });
      writeSmfType0(
        input.midiPath,
        notes.map((n) => ({
          pitch: n.pitch,
          startSec: n.startSec,
          durationSec: n.durationSec,
          velocity: n.velocity ?? 90,
        })),
        bpm,
      );
    } catch (err: any) {
      this.logger.warn(`[模拟] 写 MIDI 失败（不影响后续流程）：${err?.message || err}`);
    }

    const confidences = notes.map((n) => n.confidence);
    const confidenceAvg = confidences.length
      ? round4(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : 0;

    return {
      ok: true,
      message: `Basic Pitch 不可用，已生成 ${notes.length} 个模拟音符（模拟模式）。`,
      instrument: input.instrument,
      midiPath: input.midiPath,
      noteCount: notes.length,
      confidenceAvg,
      lowConfidenceCount: notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length,
      bpm,
      notes,
    };
  }

  /**
   * 模拟 Tayuya：把转录音符装配成标准 TabProject。
   * 结构与 `tab-import` 完全一致 → 下游可直接复用 `projectToPublishMeasures`，
   * 从而保证 `midi = 空弦 + fret + capo`、`x = offsetSec/小节时长`、
   * `y = (string-1)/5` 这些不变式与人工导入路径完全一致。
   */
  buildTabProject(input: {
    instrument: string;
    notes: TranscribedNote[];
    bpm: number;
    timeSignature: string;
    tuning?: number[];
    capo?: number;
    title?: string;
    artist?: string;
    reason?: string;
  }): TabProject {
    const tuning = input.tuning?.length ? input.tuning : [...STANDARD_TUNING];
    const bpm = input.bpm > 0 ? input.bpm : 100;
    const timeSignature = input.timeSignature || '4/4';
    const capo = input.capo ?? 0;
    const measureSec = measureDurationSec(bpm, timeSignature);

    const sorted = [...input.notes].sort((a, b) => a.startSec - b.startSec);
    const durationSec = sorted.length
      ? round4(Math.max(...sorted.map((n) => n.startSec + n.durationSec)))
      : measureSec * 4;

    // 按小节的绝对窗口分桶（与 ffmpeg 切片用的窗口完全一致）
    const measureCount = Math.max(1, Math.ceil(durationSec / measureSec));
    const measures: TabProjectTrack['measures'] = [];
    for (let m = 0; m < measureCount; m += 1) {
      const startTime = round4(m * measureSec);
      const endTime = round4(Math.min(durationSec, (m + 1) * measureSec));
      const inWindow = sorted.filter((n) => n.startSec >= startTime - 1e-6 && n.startSec < endTime + 1e-6);

      const notes: TabProjectNote[] = inWindow.map((n, i) =>
        makeNote({
          id: `${input.instrument}_m${m}_n${i}`,
          string: n.string,
          fret: n.fret,
          offsetSec: round4(n.startSec - startTime),
          beat: round4((n.startSec - startTime) / (60 / bpm)),
          durationSec: n.durationSec,
          tuning,
          capo,
          confidence: n.confidence,
          technique: 'normal',
        }),
      );

      measures.push({
        index: m,
        label: `第 ${m + 1} 小节`,
        startTime,
        endTime: endTime > startTime ? endTime : round4(startTime + measureSec),
        beats: parseInt(timeSignature.split('/')[0], 10) || 4,
        notes,
      });
    }

    const tabMeta: TabProject['meta'] = {
      title: input.title || '转录草稿（模拟）',
      artist: input.artist,
      bpm,
      timeSignature,
      instrument: (input.instrument === 'bass' ? 'bass' : 'guitar') as TabProject['meta']['instrument'],
      capo,
    };

    const project: TabProject = {
      format: TAB_PROJECT_FORMAT_ID as 'guitarmate-tab-project',
      version: TAB_PROJECT_VERSION as '1.0',
      meta: tabMeta,
      tuning,
      capo,
      tracks: [
        {
          id: `${input.instrument}-1`,
          name: input.instrument === 'bass' ? '贝斯轨' : '吉他轨',
          instrument: (input.instrument === 'bass' ? 'bass' : 'guitar') as TabProjectTrack['instrument'],
          tuning,
          capo,
          measures,
        },
      ],
      source: {
        kind: 'solo-trace',
        fileName: 'simulated-transcription.json',
        site: 'GuitarMate 模拟转录',
        rights: 'user-submission',
        rightsNote: '模拟数据，仅用于链路联调；不可作为教学内容发布。',
        parsedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
      },
      warnings: [
        makeWarning(
          'warn',
          'simulated-transcription',
          input.reason ||
            '本谱面由「模拟转录」生成（未安装 Demucs / Basic Pitch / Tayuya）。' +
              '音符为按节拍网格生成的练习乐句，不代表真实音频内容，必须人工替换。',
        ),
        makeWarning(
          'warn',
          'tuning-assumed',
          `调弦按标准调弦处理：${tuning.map(midiToName).join(' ')}（索引 0 = 一弦）。`,
        ),
      ],
      stats: computeStats({
        tracks: [{ measures }],
        meta: { bpm: tabMeta.bpm, timeSignature: tabMeta.timeSignature },
      }),
    };

    return project;
  }
}

/**
 * 最小 SMF（Standard MIDI File, Type 0）写入器
 * -------------------------------------------
 * 只写必要事件：tempo / time signature / note on-off / end of track。
 * 不依赖任何 MIDI 库（保持零新增依赖）。
 */
export function writeSmfType0(
  filePath: string,
  notes: Array<{ pitch: number; startSec: number; durationSec: number; velocity: number }>,
  bpm: number,
  ticksPerQuarter = 480,
): void {
  const ticksPerSec = (ticksPerQuarter * (bpm > 0 ? bpm : 120)) / 60;
  const toTicks = (sec: number) => Math.max(0, Math.round(sec * ticksPerSec));

  interface Ev {
    tick: number;
    bytes: number[];
    /** note-off 事件需要在 note-on 之后排序，用 order 保证同一 tick 下 on 在前 */
    order: number;
  }
  const events: Ev[] = [];

  // tempo: 500000 µs/quarter = 120bpm；此处按 bpm 换算
  const microsPerQuarter = Math.round(60_000_000 / (bpm > 0 ? bpm : 120));
  events.push({
    tick: 0,
    order: 0,
    bytes: [0xff, 0x51, 0x03, (microsPerQuarter >> 16) & 0xff, (microsPerQuarter >> 8) & 0xff, microsPerQuarter & 0xff],
  });
  // time signature 4/4
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] });

  for (const n of notes) {
    const on = toTicks(n.startSec);
    const off = Math.max(on + 1, toTicks(n.startSec + Math.max(0.02, n.durationSec)));
    const velocity = Math.min(127, Math.max(1, Math.round(n.velocity || 90)));
    events.push({ tick: on, order: 1, bytes: [0x90, n.pitch & 0x7f, velocity] });
    events.push({ tick: off, order: 2, bytes: [0x80, n.pitch & 0x7f, 0x40] });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const trackBytes: number[] = [];
  let lastTick = 0;
  for (const ev of events) {
    trackBytes.push(...vlq(ev.tick - lastTick), ...ev.bytes);
    lastTick = ev.tick;
  }
  trackBytes.push(...vlq(0), 0xff, 0x2f, 0x00); // End of Track

  const header = [
    ...ascii('MThd'),
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, // format 0
    0x00, 0x01, // 1 track
    (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff,
  ];
  const trackHeader = [...ascii('MTrk'), ...u32(trackBytes.length)];

  writeFileSync(filePath, Buffer.from([...header, ...trackHeader, ...trackBytes]));
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** MIDI 变长数量（Variable Length Quantity） */
function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

export function isSmf(buffer: Buffer): boolean {
  return buffer.length > 14 && buffer.slice(0, 4).toString('ascii') === 'MThd';
}
