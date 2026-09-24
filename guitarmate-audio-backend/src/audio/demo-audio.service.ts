import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/** 一个待发声的音符事件（绝对时间，秒） */
export interface DemoNoteEvent {
  atSec: number;
  /** 1-6 (1 = 最细高音 E 弦) */
  string: number;
  /** 品位 0-24 */
  fret: number;
  durationSec?: number;
  velocity?: number;
}

export interface RenderedDemoAudio {
  absolutePath: string;
  /** 相对项目根目录，可直接作为发布时的 trackAudioPath */
  relativePath: string;
  url: string;
  durationSec: number;
  noteCount: number;
  /** 前若干秒的波形峰值，供 CMS 直接绘制波形 */
  peaks: number[];
}

/**
 * 「原声（全轨混音）」伴奏合成参数。
 *
 * 关键：鼓/贝斯的节拍网格**取自小节窗口**（beatSec = 小节时长 / beatsPerBar），
 * 而不是取 BPM。这样即使 DB 里的 bpm 字段与实际标注网格不一致，
 * 鼓点也会与六线谱节点落在同一拍上。
 */
export interface DemoBandOptions {
  /** 每小节拍数（取 timeSignature 分子），默认 4 */
  beatsPerBar?: number;
  /** 小节窗口（绝对秒）—— 鼓/贝斯按此网格对齐到标注节点 */
  measures: Array<{ startTime: number; endTime: number }>;
  /** 贝斯音量系数，默认 1 */
  bassGain?: number;
  /** 鼓组音量系数，默认 1 */
  drumGain?: number;
}

const SAMPLE_RATE = 22050;
const PEAK_BUCKETS = 128;

/** 标准调弦各弦空弦频率 (String 1 = 高音 E4) */
const STRING_BASE_FREQ: Record<number, number> = {
  1: 329.63,
  2: 246.94,
  3: 196.0,
  4: 146.83,
  5: 110.0,
  6: 82.41,
};

const midiLikeFreq = (stringIndex: number, fret: number): number => {
  const base = STRING_BASE_FREQ[stringIndex] || STRING_BASE_FREQ[1];
  return base * Math.pow(2, fret / 12);
};

/**
 * 示范音频合成服务
 *
 * 依据「已发布小节的音符标注」合成一段与之**精确对齐**的吉他示范音频：
 * 每个音符在其 relativeTime 处拨响对应弦/品，音符之间没有声音，
 * 因此可以用于验证「音频 ↔ 六线谱节点 ↔ 播放游标」的时序一致性。
 *
 * 纯 Node 实现（无 ffmpeg 依赖），输出 22050Hz / 16bit / 单声道 WAV。
 */
@Injectable()
export class DemoAudioService {
  private readonly logger = new Logger(DemoAudioService.name);

  /**
   * 按音符事件渲染 WAV
   *
   * @param events 音符事件（绝对秒）
   * @param totalDurationSec 音频总时长（通常取最后一个 measure.endTime）
   * @param fileName 输出文件名（写入 ./uploads/demo/）
   * @param band 传入后额外叠加「贝斯 + 鼓」，得到一份与标注同一节拍网格的
   *             原声（全轨混音）示范音频，用于 C 端 Original 模式对比
   */
  renderFromNotes(
    events: DemoNoteEvent[],
    totalDurationSec: number,
    fileName: string,
    band?: DemoBandOptions,
  ): RenderedDemoAudio {
    const sorted = [...events].sort((a, b) => a.atSec - b.atSec);
    const lastEventEnd = sorted.reduce(
      (max, e) => Math.max(max, e.atSec + (e.durationSec ?? 0.8)),
      0,
    );
    // 末尾留 0.6s 让最后一个音自然衰减
    const duration = Math.max(totalDurationSec, lastEventEnd, 0.5) + 0.6;
    const totalSamples = Math.ceil(duration * SAMPLE_RATE);
    const buffer = new Float32Array(totalSamples);

    for (const e of sorted) {
      const stringIndex = Math.round(e.string);
      if (stringIndex < 1 || stringIndex > 6) continue;
      const fret = Number.isFinite(e.fret) ? e.fret : 0;
      if (fret < 0 || fret > 24) continue;

      const freq = midiLikeFreq(stringIndex, fret);
      // 低音弦留更长余韵，高音弦更短，接近真实吉他
      const ringSec = Math.min(2.6, Math.max(1.1, 1.9 - (6 - stringIndex) * 0.08));
      const gain = (e.velocity ?? 90) / 127;
      this.pluck(buffer, e.atSec, freq, gain, ringSec);
    }

    if (band && band.measures.length > 0) {
      this.addBackingBand(buffer, sorted, band);
    }

    // 归一化，避免削波
    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
      const a = Math.abs(buffer[i]);
      if (a > peak) peak = a;
    }
    const norm = peak > 0 ? 0.88 / peak : 1;

    const wav = this.encodeWav(buffer, totalSamples, norm);

    const dir = join(process.cwd(), 'uploads', 'demo');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const safeName = fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/\.wav$/i, '');
    const absolutePath = join(dir, `${safeName}.wav`);
    writeFileSync(absolutePath, wav);

    const host = process.env.APP_URL || 'http://localhost:3000';
    this.logger.log(
      `Rendered demo audio from ${sorted.length} notes → ${absolutePath} (${duration.toFixed(2)}s)`,
    );

    return {
      absolutePath,
      relativePath: `uploads/demo/${safeName}.wav`,
      url: `${host}/uploads/demo/${safeName}.wav`,
      durationSec: Number(duration.toFixed(2)),
      noteCount: sorted.length,
      peaks: this.computePeaks(buffer, totalSamples),
    };
  }

  /**
   * 叠加「贝斯 + 鼓」伴奏，得到一份原声（全轨混音）示范音频。
   *
   * 节拍网格**由小节窗口推导**：`beatSec = (measure.endTime - measure.startTime) / beatsPerBar`。
   * 不依赖 DB 里的 `bpm` 字段，因此即使 bpm 元数据与实际标注网格不一致，
   * 鼓点也永远与六线谱节点同拍 —— 这正是 C 端「Original 里吉他要落在节点上」的前提。
   */
  private addBackingBand(
    out: Float32Array,
    events: DemoNoteEvent[],
    band: DemoBandOptions,
  ): void {
    const beatsPerBar = Math.max(1, Math.round(band.beatsPerBar ?? 4));
    const bassGain = band.bassGain ?? 1;
    const drumGain = band.drumGain ?? 1;

    // 搜索「离当前拍最近的音符」的容差：不超过 1/3 拍
    let lastBassFreq = 0;
    let rnd = 0x2f6e2b1;

    for (const m of band.measures) {
      const barLen = m.endTime - m.startTime;
      if (!(barLen > 0)) continue;
      const beatSec = barLen / beatsPerBar;

      for (let b = 0; b < beatsPerBar; b++) {
        const at = m.startTime + b * beatSec;

        // ── 贝斯：跟随该拍最近的吉他音符，低一个八度 ──
        const hit = this.nearestEvent(events, at, beatSec * 0.34);
        if (hit) {
          lastBassFreq = midiLikeFreq(Math.round(hit.string), hit.fret) / 2;
        }
        // 每小节第 1 拍、以及有换音的音必定落贝斯；第 3 拍补一个稳定的根音
        if (lastBassFreq > 0 && (b === 0 || !!hit || b === Math.floor(beatsPerBar / 2))) {
          this.bassNote(out, at, lastBassFreq, 0.6 * bassGain, beatSec * 1.7);
        }

        // ── 鼓：底鼓 1/3 拍、军鼓 2/4 拍、踩镲八分音符 ──
        if (b % 2 === 0) this.kick(out, at, 0.9 * drumGain);
        else this.snare(out, at, 0.42 * drumGain, rnd);
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
        this.hihat(out, at, 0.16 * drumGain, rnd);
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
        this.hihat(out, at + beatSec / 2, 0.11 * drumGain, rnd);
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      }
    }
  }

  /** 在容差窗口内找离 atSec 最近的音符事件 */
  private nearestEvent(
    events: DemoNoteEvent[],
    atSec: number,
    toleranceSec: number,
  ): DemoNoteEvent | null {
    let best: DemoNoteEvent | null = null;
    let bestDelta = toleranceSec;
    for (const e of events) {
      const d = Math.abs(e.atSec - atSec);
      if (d <= bestDelta) {
        bestDelta = d;
        best = e;
      }
    }
    return best;
  }

  /** 贝斯音：正弦基频 + 二次谐波，衰减比吉他慢 */
  private bassNote(
    out: Float32Array,
    startSec: number,
    freq: number,
    gain: number,
    ringSec: number,
  ): void {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(Math.max(0.2, ringSec) * SAMPLE_RATE);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-1.6 * t) * (1 - Math.exp(-520 * t));
      const w = 2 * Math.PI * freq * t;
      out[idx] += (Math.sin(w) + 0.22 * Math.sin(2 * w)) * env * gain * 0.42;
    }
  }

  /** 底鼓：音高快速下滑的正弦 */
  private kick(out: Float32Array, startSec: number, gain: number): void {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(0.28 * SAMPLE_RATE);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-16 * t);
      const freq = 120 * Math.exp(-22 * t) + 45;
      out[idx] += Math.sin(2 * Math.PI * freq * t) * env * gain * 0.36;
    }
  }

  /** 军鼓：噪声 + 190Hz 鼓皮音 */
  private snare(out: Float32Array, startSec: number, gain: number, seed: number): void {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(0.22 * SAMPLE_RATE);
    let rnd = seed || 1;
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-22 * t);
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      const noise = (rnd / 0x3fffffff) - 1; // 确定性伪随机 -1..1
      out[idx] += (noise * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.5) * env * gain * 0.3;
    }
  }

  /** 踩镲：高频噪声短促衰减 */
  private hihat(out: Float32Array, startSec: number, gain: number, seed: number): void {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(0.06 * SAMPLE_RATE);
    let rnd = seed || 1;
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-70 * t);
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      const noise = (rnd / 0x3fffffff) - 1;
      out[idx] += noise * env * gain * 0.42;
    }
  }

  /** 拨弦音：快速起音 + 指数衰减 + 少量泛音，模拟钢弦吉他 */
  private pluck(
    out: Float32Array,
    startSec: number,
    freq: number,
    gain: number,
    ringSec: number,
  ): void {
    const start = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(ringSec * SAMPLE_RATE);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-3.6 * t) * (1 - Math.exp(-420 * t));
      const w = 2 * Math.PI * freq * t;
      const v =
        Math.sin(w) +
        0.34 * Math.sin(2 * w) +
        0.16 * Math.sin(3 * w) +
        0.08 * Math.sin(4 * w);
      out[idx] += v * env * gain * 0.34;
    }
  }

  /** 生成 128 段能量峰值（0-1），用于 CMS 波形条显示 */
  private computePeaks(samples: Float32Array, totalSamples: number): number[] {
    const bucket = Math.max(1, Math.floor(totalSamples / PEAK_BUCKETS));
    const peaks: number[] = [];
    let max = 0;
    for (let b = 0; b < PEAK_BUCKETS; b++) {
      let local = 0;
      const from = b * bucket;
      const to = Math.min(totalSamples, from + bucket);
      for (let i = from; i < to; i++) {
        const a = Math.abs(samples[i]);
        if (a > local) local = a;
      }
      peaks.push(local);
      if (local > max) max = local;
    }
    return peaks.map((p) => Number((max > 0 ? p / max : 0).toFixed(4)));
  }

  /** 编码 16bit 单声道 PCM WAV，并附加 0.25s 淡出 */
  private encodeWav(samples: Float32Array, totalSamples: number, norm: number): Buffer {
    const dataBytes = totalSamples * 2;
    const buf = Buffer.alloc(44 + dataBytes);

    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataBytes, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(SAMPLE_RATE, 24);
    buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataBytes, 40);

    const fadeStart = Math.max(0, totalSamples - Math.floor(SAMPLE_RATE * 0.25));
    for (let i = 0; i < totalSamples; i++) {
      let v = samples[i] * norm;
      if (i >= fadeStart) {
        v *= 1 - (i - fadeStart) / (totalSamples - fadeStart);
      }
      const clamped = Math.max(-1, Math.min(1, v));
      buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
    }
    return buf;
  }
}
