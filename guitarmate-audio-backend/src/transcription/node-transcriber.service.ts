import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { UploadService } from './upload.service';
import { writeSmfType0 } from './simulation.service';
import {
  analyzeChords,
  estimateTempo,
  transcribeMonophonic,
  type ChordSegment,
  type PcmAudio,
} from './pitch-analysis';
import {
  LOW_CONFIDENCE_THRESHOLD,
  round4,
  type TranscribeWorkerResult,
  type TranscribedNote,
} from './transcription.types';

/**
 * 内置真实转录器（NodeTranscriberService）
 * ======================================
 *
 * 当机器上**没有** Basic Pitch / Demucs（重型 ML 依赖）时，用它把真实录音转成六线谱 ——
 * 而不是退回「按节拍网格造音符」的模拟器。整条链路零新增依赖：
 *
 * ```
 *  ffmpeg（已在用）→ 22050Hz 单声道 PCM
 *        ↓ pitch-analysis.ts
 *  YIN 基频 → 单音音符序列        起音包络自相关 → BPM        色度+模板 → 和弦时间线
 *        ↓
 *  最低把位分配弦/品 → 真实 SMF（可拖进 DAW 核对）→ 交给既有 `midi_to_tab.py` 转 TabProject
 *        ↓
 *  和弦时间线写 `<instrument>.chords.json`，由 `handleConvert` 映射到小节上（覆盖启发式推定）
 * ```
 *
 * 为什么值得存在：
 * - **可离线复现**：不需要 pip / TensorFlow / 模型权重，CI 里也能跑真实音频；
 * - **诚实**：音频里是什么就转出什么（不像模拟器会「无中生有」），
 *   产物 `engine='node-yin'`、`simulated=false`，因此不会被打上「模拟」的嫌疑标签；
 * - **可解释**：每一步都是教科书算法，出问题能定位到帧、滞后、模板分。
 *
 * 局限（与 `pitch-analysis.ts` 头部一致）：只做**单音**旋律；复音/多声部仍需 Basic Pitch。
 */

export interface NodeTranscribeInput {
  projectId: string;
  instrument: string;
  /** 源音频（或分轨）路径 */
  audioPath: string;
  /** 已知 BPM；<= 0 时自动估计 */
  bpm: number;
  /** 调弦 MIDI（索引 0 = 一弦） */
  tuning: number[];
  /** 输出 MIDI 路径 */
  midiPath: string;
}

export interface NodeTranscribeOutput extends TranscribeWorkerResult {
  /** 和弦时间线（绝对秒），已落盘为 `<instrument>.chords.json` */
  chords: ChordSegment[];
  chordsPath?: string;
  /** 分析摘要，写进 TranscribeJob 便于排查 */
  analysis: {
    bpm: number;
    bpmEstimated: boolean;
    durationSec: number;
    voicedRatio: number;
    frameCount: number;
    peakRms: number;
    chordSegments: number;
  };
}

/** 吉他指板最大品位（24 品制 + 余量） */
const MAX_FRET = 19;

@Injectable()
export class NodeTranscriberService {
  private readonly logger = new Logger(NodeTranscriberService.name);

  constructor(private readonly upload: UploadService) {}

  /** 是否具备真实转录能力（需要 ffmpeg 解码） */
  canTranscribe(): boolean {
    return !!(ffmpegStatic && existsSync(String(ffmpegStatic)));
  }

  /** 和弦时间线落盘位置（`handleConvert` 用同一路径读回） */
  chordsPath(projectId: string, instrument: string): string {
    return join(this.upload.subDir(projectId, 'tab'), `${instrument}.chords.json`);
  }

  /**
   * 真实音频 → 音符 + 和弦 + MIDI。
   *
   * 采样率固定 22050Hz：吉他最高音 E5 ≈ 659Hz，留到 11kHz 的奈奎斯特带宽完全够；
   * 采样率减半让 YIN 的差分函数快一倍，单声道是因为基频检测与声道数无关。
   */
  async transcribe(input: NodeTranscribeInput): Promise<NodeTranscribeOutput> {
    const startedAt = Date.now();
    const pcm = await this.decodeToPcm(input.audioPath);
    const durationSec = round4(pcm.samples.length / pcm.sampleRate);

    const knownBpm = Number.isFinite(input.bpm) && input.bpm > 0;
    const estimated = knownBpm ? 0 : estimateTempo(pcm);
    const bpm = knownBpm ? input.bpm : estimated > 0 ? estimated : 100;

    const monophonic = transcribeMonophonic(pcm, {
      // 帧长 46ms / 帧移 12ms：既能跟上八分音符乐句，又给低频留足 2 个周期
      frameSec: 0.046,
      hopSec: 0.012,
      fMin: 72, // 比最低空弦 E2（82.4Hz）再低一点，容忍走音
      fMax: 1100,
    });

    const notes = this.toTabNotes(monophonic.notes, input.tuning);
    const chords = analyzeChords(pcm, { windowSec: 0.5, hopSec: 0.25, minScore: 0.5 });

    // 真实 SMF：方便人工用任意 DAW 试听核对「转出来的音」与录音是否一致
    let midiPath = input.midiPath;
    try {
      if (!existsSync(dirname(midiPath))) mkdirSync(dirname(midiPath), { recursive: true });
      writeSmfType0(
        midiPath,
        notes.map((n) => ({
          pitch: n.pitch,
          startSec: n.startSec,
          durationSec: n.durationSec,
          velocity: n.velocity ?? 90,
        })),
        bpm,
      );
    } catch (err: any) {
      this.logger.warn(`写 MIDI 失败（不影响后续流程）：${err?.message || err}`);
      midiPath = '';
    }

    // 和弦时间线落盘：`handleConvert` 会把它映射到小节上（音频真实和声 > 启发式推定）
    let chordsPath = '';
    try {
      chordsPath = this.chordsPath(input.projectId, input.instrument);
      if (!existsSync(dirname(chordsPath))) mkdirSync(dirname(chordsPath), { recursive: true });
      writeFileSync(chordsPath, JSON.stringify(chords, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.warn(`写和弦时间线失败（不影响后续流程）：${err?.message || err}`);
      chordsPath = '';
    }

    const confidences = notes.map((n) => n.confidence);
    const confidenceAvg = confidences.length
      ? round4(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : 0;

    const lowConfidenceCount = notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length;

    this.logger.log(
      `[node-yin] ${input.instrument}：${durationSec.toFixed(1)}s → ${notes.length} 音符 / ` +
        `${chords.length} 个和弦段 · BPM ${bpm}${knownBpm ? '' : '（自动估计）'} · ` +
        `有音高帧占比 ${(monophonic.voicedRatio * 100).toFixed(1)}% · ${Date.now() - startedAt}ms`,
    );

    return {
      ok: true,
      message: knownBpm
        ? `内置 YIN 转录（真实音频，零依赖）：${notes.length} 个音符。`
        : `内置 YIN 转录（真实音频，零依赖）：${notes.length} 个音符；BPM 由起音包络自相关估计为 ${bpm}，请人工核对。`,
      instrument: input.instrument,
      midiPath,
      noteCount: notes.length,
      confidenceAvg,
      lowConfidenceCount,
      bpm,
      notes,
      chords,
      chordsPath,
      analysis: {
        bpm,
        bpmEstimated: !knownBpm,
        durationSec,
        voicedRatio: round4(monophonic.voicedRatio),
        frameCount: monophonic.frameCount,
        peakRms: round4(monophonic.peakRms),
        chordSegments: chords.length,
      },
    };
  }

  // ─────────────────────────────────────────
  // 内部
  // ─────────────────────────────────────────

  /**
   * ffmpeg → 单声道 22050Hz float32 PCM。
   *
   * 用 `-f f32le` 直接从 stdout 拿裸 PCM（不落临时文件、不依赖 wav 解析），
   * 这样 MP3 / WAV / FLAC / M4A 一视同仁 —— 与上传通道支持的格式一致。
   */
  async decodeToPcm(audioPath: string, sampleRate = 22050): Promise<PcmAudio> {
    const bin = ffmpegStatic ? String(ffmpegStatic) : 'ffmpeg';
    if (!existsSync(audioPath)) throw new Error(`待分析的音频不存在：${audioPath}`);

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      audioPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-f',
      'f32le',
      '-',
    ];

    const raw = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`ffmpeg 解码失败（code=${code}）：${stderr.trim().slice(0, 400)}`));
      });
    });

    // Buffer → Float32Array（注意 byteOffset 对齐，不能直接 new Float32Array(buffer.buffer)）
    const count = Math.floor(raw.length / 4);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i += 1) samples[i] = raw.readFloatLE(i * 4);
    if (count === 0) throw new Error('ffmpeg 解码得到 0 个采样点（音频为空或格式不支持）。');
    return { sampleRate, samples };
  }

  /**
   * 音高序列 → 六线谱音符（弦 / 品 / 音高）。
   *
   * 弦位分配规则与 `workers/midi_to_tab.py` 保持一致：**最低把位优先** ——
   * 挑一个「品位最小且不低于 0」的弦，同分时优先粗弦（低音弦），
   * 这与吉他手在低把位弹奏时的自然选择一致；实在放不下就钳到 0-19 品。
   */
  private toTabNotes(
    notes: Array<{ startSec: number; endSec: number; midi: number; confidence: number; amplitude: number }>,
    tuning: number[],
  ): TranscribedNote[] {
    const open = tuning.length >= 4 ? tuning : [64, 59, 55, 50, 45, 40];
    const out: TranscribedNote[] = [];

    notes.forEach((note, i) => {
      const midi = Math.round(note.midi);
      let bestString = open.length;
      let bestFret = Number.POSITIVE_INFINITY;

      for (let s = 0; s < open.length; s += 1) {
        const fret = midi - open[s];
        if (fret < 0 || fret > MAX_FRET) continue;
        // 同分时优先粗弦（索引更大）—— 低把位常用低音弦
        if (fret < bestFret || (fret === bestFret && s + 1 > bestString)) {
          bestFret = fret;
          bestString = s + 1;
        }
      }

      if (!Number.isFinite(bestFret)) {
        // 超出音域：取最接近的弦并把品位钳进 [0, MAX_FRET]
        let closest = 0;
        let smallest = Number.POSITIVE_INFINITY;
        for (let s = 0; s < open.length; s += 1) {
          const dist = Math.abs(midi - open[s]);
          if (dist < smallest) {
            smallest = dist;
            closest = s;
          }
        }
        bestString = closest + 1;
        bestFret = Math.max(0, Math.min(MAX_FRET, midi - open[closest]));
      }

      const pitch = open[bestString - 1] + bestFret;
      out.push({
        id: `yin_${i}`,
        string: bestString,
        fret: bestFret,
        pitch,
        startSec: round4(note.startSec),
        // 至少留 40ms，避免 YIN 在换音瞬间切出「零长音符」导致下游除零
        durationSec: round4(Math.max(0.04, note.endSec - note.startSec)),
        confidence: round4(Math.max(0.05, Math.min(0.99, note.confidence))),
        velocity: Math.round(Math.max(30, Math.min(127, 40 + note.amplitude * 400))),
        technique: 'normal' as const,
      });
    });

    return out;
  }
}
