/**
 * 真实音频分析（纯函数，零依赖）
 * ==============================
 *
 * 目的：在没有 Demucs / Basic Pitch（重型 ML 依赖）的机器上，也能把**真实录音**
 * 转成可演奏的六线谱 —— 而不是退回「按节拍网格造音符」的模拟器。
 *
 * 四个纯函数：
 *
 * ```
 *  yinPitch()              基频检测（YIN 累积均值归一化差分）
 *  transcribeMonophonic()   单音旋律 → 音符序列（音高 / 起止 / 置信度）
 *  estimateTempo()          起音强度包络自相关 → BPM
 *  analyzeChords()          色度向量 + 和弦模板匹配 → 和弦时间线
 * ```
 *
 * 为什么能用（吉他 solo 场景）：solo 是**单音**线条，YIN 正是为单音基频设计的；
 * 和弦部分不靠 ML，而是把频谱能量折叠成 12 个音级（chroma）后与和弦模板做余弦匹配 ——
 * 这是 40 年前就成熟的 MIR 方法，算得动、看得懂、没有黑盒。
 *
 * ⚠️ 局限（写在这里以免误用）：
 * - 只支持**单音**旋律（复音/多声部要靠 Basic Pitch，见 `python-runner.service.ts`）；
 *   伴奏如果比 solo 还响，YIN 会跟到伴奏上 —— 采样时保持 solo 突出即可；
 * - 泛音丰富的和弦会被折成 12 音级，因此和弦只能给出「根音 + 品质」（Am / C / G7），
 *   转位/加音靠 `deriveChords()` 的和声分析兜底；
 * - 全部计算 O(样本数 × 滞后数)，30 秒音频在 Node 里约 1-3 秒（见 `node-transcriber.service.ts`）。
 */

// ─────────────────────────────────────────────
// 基础换算
// ─────────────────────────────────────────────

/** 12 音级名（吉他谱习惯用升号；降号可由调用方按调性改写） */
export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 音级（0 = C）→ 名字 */
export function pitchClassName(pitchClass: number): string {
  return PITCH_CLASS_NAMES[((Math.round(pitchClass) % 12) + 12) % 12];
}

export interface PcmAudio {
  sampleRate: number;
  samples: Float32Array;
}

// ─────────────────────────────────────────────
// ① YIN 基频检测
// ─────────────────────────────────────────────

export interface YinOptions {
  /** 最低基频（Hz）—— 标准调弦最低 E2 ≈ 82.4 */
  fMin?: number;
  /** 最高基频（Hz）—— 高把位 solo 到 E5 ≈ 659，留足余量取 1000 */
  fMax?: number;
  /** 绝对阈值：累积均值归一化差分低于它就认为是周期信号 */
  threshold?: number;
}

export interface YinResult {
  /** 基频（Hz）；<= 0 表示这一帧没有可用音高（噪声/静音/复音） */
  hz: number;
  /** 0-1，越小越不可信；渲染到 CMS 的置信度就是这个 */
  confidence: number;
  /** 最优滞后处的归一化差分值（越小越周期） */
  dip: number;
}

/**
 * YIN 基频检测（单帧）。
 *
 * 实现要点：
 * 1. 差分函数 `d(τ) = Σ (x[i] − x[i+τ])²`；
 * 2. 累积均值归一化 → 抵消「τ 越大 d 越大」的偏置；
 * 3. 取第一个低于阈值的局部极小（不是全局最小 —— 全局最小容易挑到 2 倍周期）；
 * 4. 抛物线插值修正滞后，避免整数滞后带来的音分误差（直接影响品位判定）。
 */
export function yinPitch(frame: Float32Array, sampleRate: number, options: YinOptions = {}): YinResult {
  const fMin = options.fMin && options.fMin > 0 ? options.fMin : 70;
  const fMax = options.fMax && options.fMax > 0 ? options.fMax : 1000;
  const threshold = options.threshold && options.threshold > 0 ? options.threshold : 0.15;

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(Math.floor(sampleRate / fMin), frame.length >> 1);
  const n = frame.length;
  if (tauMax <= tauMin + 2) return { hz: 0, confidence: 0, dip: 1 };

  // 去直流，避免低频漂移污染差分函数
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += frame[i];
  mean /= n;

  const limit = n - tauMax; // 所有滞后都至少有 limit 个样点参与，保证公平比较
  const d = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let i = 0; i < limit; i += 1) {
      const diff = frame[i] - mean - (frame[i + tau] - mean);
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 累积均值归一化差分
  const cmnd = new Float64Array(tauMax + 1);
  let running = 0;
  cmnd[tauMin] = 1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * (tau - tauMin + 1)) / running : 1;
  }

  // 第一个低于阈值的局部极小
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t += 1) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    // 没找到阈值内的谷：退化为全局最小，但太浅就判定为「无音高」
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t += 1) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.55) return { hz: 0, confidence: 0, dip: cmnd[best] };
    tau = best;
  }

  // 抛物线插值
  const prev = tau > tauMin ? cmnd[tau - 1] : cmnd[tau];
  const next = tau < tauMax ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - prev - next);
  const refined = Math.abs(denom) > 1e-12 ? tau + (next - prev) / denom : tau;
  const hz = sampleRate / Math.max(1e-6, refined);

  const dip = cmnd[tau];
  const confidence = Math.max(0, Math.min(1, 1 - dip));
  if (!Number.isFinite(hz) || hz < fMin * 0.85 || hz > fMax * 1.15) {
    return { hz: 0, confidence: 0, dip };
  }
  return { hz, confidence, dip };
}

// ─────────────────────────────────────────────
// ② 单音转录
// ─────────────────────────────────────────────

export interface MonophonicNote {
  startSec: number;
  endSec: number;
  /** 平均音高（可能是小数，量化交给下游网格） */
  midi: number;
  /** 0-1 */
  confidence: number;
  /** 峰值振幅（用于判断是不是真的出声了） */
  amplitude: number;
}

export interface TranscribeOptions {
  /** 分析帧长（秒）；越小越跟得上快速乐句，但低频滞后数不够 */
  frameSec?: number;
  /** 帧移（秒） */
  hopSec?: number;
  fMin?: number;
  fMax?: number;
  yinThreshold?: number;
  /** 短于这个时长的音符会被丢弃（拨弦瞬态/噪声） */
  minNoteSec?: number;
  /** 允许的连续丢帧数（拨弦换音瞬间 YIN 会短暂失效） */
  maxGapFrames?: number;
  /** 音高变化超过多少个半音就切分成新音符 */
  pitchToleranceSemitone?: number;
  /**
   * 帧置信度下限：YIN 谷不够深说明「这一帧不是个干净的周期信号」
   * （典型场景：伴奏与 solo 同时响、或拨弦瞬态）。低于它的帧当静音处理。
   */
  minFrameConfidence?: number;
}

export interface TranscribeResult {
  notes: MonophonicNote[];
  /** 有音高的帧占比（0-1）—— 太低说明音频不是单音旋律 */
  voicedRatio: number;
  frameCount: number;
  peakRms: number;
  /** 是否走的起音引导切分（false = 退回逐帧归组） */
  onsetGuided?: boolean;
}

/** 单帧 RMS */
function frameRms(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(samples.length, start + length);
  if (end <= start) return 0;
  for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/**
 * 单音转录：逐帧 YIN → 合并同音高的连续帧 → 音符序列。
 *
 * 分段规则（刻意保守，宁可多切也不要粘连）：
 * - 音高变化 > 容差 → 新音符；
 * - 静音超过 `maxGapFrames` → 结束当前音符；
 * - 短于 `minNoteSec` 的碎片直接丢弃。
 */
export function transcribeMonophonic(pcm: PcmAudio, options: TranscribeOptions = {}): TranscribeResult {
  const sr = pcm.sampleRate;
  const frameLen = Math.max(256, Math.round((options.frameSec ?? 0.046) * sr));
  const hopLen = Math.max(64, Math.round((options.hopSec ?? 0.012) * sr));
  const minNoteSec = options.minNoteSec ?? 0.09;
  const maxGapFrames = options.maxGapFrames ?? 2;
  const tolerance = options.pitchToleranceSemitone ?? 0.6;
  const minConfidence = options.minFrameConfidence ?? 0.45;

  const frame = new Float32Array(frameLen);
  const frames: Array<{ t: number; midi: number; conf: number; amp: number }> = [];
  let peakRms = 0;

  for (let start = 0; start + frameLen <= pcm.samples.length; start += hopLen) {
    frame.set(pcm.samples.subarray(start, start + frameLen));
    const amp = frameRms(pcm.samples, start, frameLen);
    if (amp > peakRms) peakRms = amp;
    const yin = yinPitch(frame, sr, { fMin: options.fMin, fMax: options.fMax, threshold: options.yinThreshold });
    frames.push({
      t: start / sr,
      midi: yin.hz > 0 ? hzToMidi(yin.hz) : -1,
      conf: yin.confidence,
      amp,
    });
  }

  const silence = Math.max(1e-4, peakRms * 0.03);

  /**
   * 音高轨迹中值滤波（窗 5）。
   * YIN 在换音瞬间、或伴奏压过 solo 的那几帧会跳到邻近八度/邻音，
   * 单帧的毛刺会让「同音高的连续帧」判断不停断裂 —— 中值滤波能滤掉毛刺
   * 而保留真实的音高跳进（真实演奏的音高跳变会持续好几帧）。
   */
  const voicedFlags = frames.map((f) => f.midi > 0 && f.amp >= silence && f.conf >= minConfidence);
  const filtered = frames.map((f, i) => {
    if (!voicedFlags[i]) return f.midi;
    const window: number[] = [];
    for (let k = -2; k <= 2; k += 1) {
      const j = i + k;
      if (j >= 0 && j < frames.length && voicedFlags[j]) window.push(frames[j].midi);
    }
    if (window.length < 3) return f.midi;
    window.sort((a, b) => a - b);
    return window[window.length >> 1];
  });

  const hopSec = hopLen / sr;
  const voicedCount = voicedFlags.filter(Boolean).length;

  /**
   * 起音引导切分（拨弦乐器的正确模型：**一次拨弦 = 一个音**）。
   *
   * 为什么不能只靠「音高相同的连续帧」：吉他拨弦后前一个音的延音还在
   * （伴奏尤其明显），一个分析窗里同时存在两个音的频率时，YIN 会锁到它们的
   * 公共次谐波（常见是低一个八度甚至两个八度），于是同一个音被切成好几段、
   * 并且多出一堆低音假音符。
   *
   * 起音点则不受此影响 —— 拨弦瞬间能量陡增，是**物理上确定的事件**。
   * 所以：先在振幅包络上找起音，再在每个起音之后的几帧内估计音高
   * （此时新音最响、旧尾音最弱），一直保持到下一个起音或静音。
   */
  const onsets = detectOnsets(
    frames.map((f) => f.amp),
    hopSec,
    options.minNoteSec ?? minNoteSec,
  );

  if (onsets.length >= 2) {
    const notes: MonophonicNote[] = [];
    for (let k = 0; k < onsets.length; k += 1) {
      const startIdx = onsets[k];
      const nextIdx = k + 1 < onsets.length ? onsets[k + 1] : frames.length;

      // 起音后的前几帧：新音刚起、旧音尾最弱，音高估计最干净
      const probe: number[] = [];
      for (let j = startIdx; j < Math.min(startIdx + 5, nextIdx, frames.length); j += 1) {
        if (voicedFlags[j]) probe.push(j);
      }
      if (probe.length === 0) continue;

      // 加权中值（权重 = 置信度 × 振幅）：抗单帧毛刺，又不会被逐渐衰减的尾音拉走
      const weighted = probe
        .map((j) => ({ midi: filtered[j], w: Math.max(1e-3, frames[j].conf * frames[j].amp) }))
        .sort((a, b) => a.midi - b.midi);
      const totalWeight = weighted.reduce((sum, x) => sum + x.w, 0);
      let acc = 0;
      let midi = weighted[0].midi;
      for (const item of weighted) {
        acc += item.w;
        if (acc >= totalWeight / 2) {
          midi = item.midi;
          break;
        }
      }

      // 结束时间：下一个起音前最后一个有声帧（尾音静下来就算结束）
      let endIdx = startIdx;
      for (let j = startIdx; j < nextIdx && j < frames.length; j += 1) {
        if (voicedFlags[j]) endIdx = j;
      }
      const startSec = startIdx * hopSec;
      const endSec = (endIdx + 1) * hopSec;
      if (endSec - startSec < minNoteSec) continue;

      const confSum = probe.reduce((sum, j) => sum + frames[j].conf, 0);
      const ampMax = probe.reduce((max, j) => Math.max(max, frames[j].amp), 0);
      notes.push({
        startSec: Math.round(startSec * 10000) / 10000,
        endSec: Math.round(endSec * 10000) / 10000,
        midi,
        confidence: Math.max(0.05, Math.min(0.99, confSum / probe.length)),
        amplitude: ampMax,
      });
    }

    return {
      notes,
      voicedRatio: frames.length ? voicedCount / frames.length : 0,
      frameCount: frames.length,
      peakRms,
      onsetGuided: true,
    };
  }

  // 起音不明显（连奏 / 复音 / 无打击感）→ 退回逐帧归组
  const notes = segmentByFrames(frames, filtered, voicedFlags, hopSec, {
    minNoteSec,
    maxGapFrames,
    tolerance,
  });
  return {
    notes,
    voicedRatio: frames.length ? voicedCount / frames.length : 0,
    frameCount: frames.length,
    peakRms,
    onsetGuided: false,
  };
}

/**
 * 振幅包络上的起音检测。
 *
 * 判据：上一帧到这一帧的**上升量**超过局部峰值的一定比例（默认 30%），
 * 且距上一次起音超过最小音符时长（拨弦后立刻又来一次 = 同一次拨弦的抖动）。
 * 不是自适应阈值那套复杂的谱通量 —— 拨弦的上升沿非常陡，简单判据就够稳。
 */
export function detectOnsets(amps: number[], hopSec: number, minNoteSec = 0.09, ratio = 0.22): number[] {
  const onsets: number[] = [];
  const minGapFrames = Math.max(1, Math.round(minNoteSec / Math.max(1e-6, hopSec)));
  let lastOnset = -minGapFrames * 2;

  for (let i = 1; i < amps.length; i += 1) {
    const rise = amps[i] - amps[i - 1];
    if (rise <= 0) continue;
    // 局部峰值（±6 帧 ≈ ±70ms）：避免弱拍上的小抖动被当成起音
    let localMax = 0;
    for (let k = -6; k <= 6; k += 1) {
      const j = i + k;
      if (j >= 0 && j < amps.length) localMax = Math.max(localMax, amps[j]);
    }
    if (localMax <= 0) continue;
    if (rise < localMax * ratio) continue;
    if (i - lastOnset < minGapFrames) continue;
    onsets.push(i);
    lastOnset = i;
  }
  return onsets;
}

/** 逐帧归组（起音引导不可用时的兑底路径） */
function segmentByFrames(
  frames: Array<{ t: number; midi: number; conf: number; amp: number }>,
  filtered: number[],
  voicedFlags: boolean[],
  hopSec: number,
  options: { minNoteSec: number; maxGapFrames: number; tolerance: number },
): MonophonicNote[] {
  const notes: MonophonicNote[] = [];
  let current: {
    midiSum: number;
    weight: number;
    confSum: number;
    count: number;
    startFrames: number;
    endFrame: number;
    amp: number;
  } | null = null;

  const flush = (endFrame: number) => {
    if (!current) return;
    const startSec = current.startFrames * hopSec;
    const endSec = (endFrame + 1) * hopSec;
    if (endSec - startSec >= options.minNoteSec) {
      notes.push({
        startSec: Math.round(startSec * 10000) / 10000,
        endSec: Math.round(endSec * 10000) / 10000,
        midi: current.midiSum / Math.max(1e-6, current.weight),
        confidence: Math.max(0.05, Math.min(0.99, current.confSum / Math.max(1, current.count))),
        amplitude: current.amp,
      });
    }
    current = null;
  };

  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    if (!voicedFlags[i]) {
      if (current && i - current.endFrame > options.maxGapFrames) flush(current.endFrame);
      continue;
    }
    const midi = filtered[i];
    if (current) {
      const center = current.midiSum / current.weight;
      const samePitch = Math.abs(midi - center) <= options.tolerance;
      const gapOk = i - current.endFrame <= options.maxGapFrames;
      /**
       * 八度误判修正：音高刚好跳一个八度、但**振幅在衰减** ——
       * 这是 YIN 把逐渐变弱的基频跟丢、锁到二阶谐波的典型特征，不是真实跳进。
       */
      const octaveSlip =
        Math.abs(Math.abs(midi - center) - 12) <= 0.8 && current.amp > 0 && f.amp < current.amp * 0.9;
      if ((samePitch || octaveSlip) && gapOk) {
        const w = Math.max(1e-3, f.conf * f.amp);
        if (!octaveSlip) current.midiSum += midi * w;
        current.weight += w;
        current.confSum += f.conf;
        current.count += 1;
        current.endFrame = i;
        current.amp = Math.max(current.amp * (octaveSlip ? 0.92 : 1), f.amp);
        continue;
      }
      flush(current.endFrame);
    }
    const w = Math.max(1e-3, f.conf * f.amp);
    current = {
      midiSum: midi * w,
      weight: w,
      confSum: f.conf,
      count: 1,
      startFrames: i,
      endFrame: i,
      amp: f.amp,
    };
  }
  flush(frames.length - 1);
  return notes;
}

// ─────────────────────────────────────────────
// ③ 速度估计
// ─────────────────────────────────────────────

/**
 * 起音强度包络自相关 → BPM。
 *
 * 只用到 50% 的「音乐常识」：把能量上升沿（起音）当脉冲串，对它做自相关，
 * 0.3s–1.2s（即 50–200 BPM）区间内的最大峰值就是拍长；若结果超过 180 就减半
 * （自相关很容易锁到 2 倍拍长，这是最常见的失败模式）。
 */
export function estimateTempo(pcm: PcmAudio, options: { minBpm?: number; maxBpm?: number } = {}): number {
  const sr = pcm.sampleRate;
  const minBpm = options.minBpm ?? 50;
  const maxBpm = options.maxBpm ?? 200;
  const hop = Math.max(32, Math.round(sr * 0.01)); // 10ms 一格
  const frameLen = Math.round(sr * 0.03);
  const env: number[] = [];
  for (let start = 0; start + frameLen <= pcm.samples.length; start += hop) {
    env.push(frameRms(pcm.samples, start, frameLen));
  }
  if (env.length < 40) return 0;

  // 半波整流的一阶差分 = 起音强度
  const flux = env.map((v, i) => (i === 0 ? 0 : Math.max(0, v - env[i - 1])));
  const meanFlux = flux.reduce((a, b) => a + b, 0) / flux.length;
  if (meanFlux <= 1e-6) return 0;
  const centered = flux.map((v) => v - meanFlux);

  const lagMin = Math.max(2, Math.round((60 / maxBpm) / 0.01));
  const lagMax = Math.min(centered.length - 2, Math.round((60 / minBpm) / 0.01));
  let bestLag = -1;
  let bestScore = 0;
  for (let lag = lagMin; lag <= lagMax; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < centered.length; i += 1) sum += centered[i] * centered[i + lag];
    const score = sum / (centered.length - lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return 0;

  let bpm = 60 / (bestLag * 0.01);
  if (bpm > 180) bpm /= 2;
  if (bpm < 55) bpm *= 2;
  return Math.round(bpm * 10) / 10;
}

// ─────────────────────────────────────────────
// ④ FFT / 色度 / 和弦
// ─────────────────────────────────────────────

/** 原地 radix-2 FFT（长度必须是 2 的幂） */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k += 1) {
        const ur = re[i + k];
        const ui = im[i + k];
        const xr = re[i + k + half];
        const xi = im[i + k + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** 汉宁窗 + FFT → 幅度谱（只返回前一半 bin） */
export function magnitudeSpectrum(frame: Float32Array): Float64Array {
  const n = frame.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    // 汉宁窗，抑制频谱泄漏（否则强泛音会污染色度）
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = frame[i] * w;
  }
  fftInPlace(re, im);
  const half = n >> 1;
  const mags = new Float64Array(half);
  for (let i = 0; i < half; i += 1) mags[i] = Math.hypot(re[i], im[i]);
  return mags;
}

export interface ChromaOptions {
  /** 参与统计的最低频率（低于它的噪音/嗡声不参与） */
  fMin?: number;
  /** 最高频率（再往上是几乎无能量的高频泛音） */
  fMax?: number;
}

/**
 * 幅度谱 → 12 维色度向量（音级能量分布）。
 * 每个 bin 按频率折到最近的音级；用 `mag^1.5` 加权以压制宽带噪声。
 */
export function chromaFromMagnitudes(
  mags: Float64Array,
  sampleRate: number,
  fftSize: number,
  options: ChromaOptions = {},
): Float64Array {
  const fMin = options.fMin ?? 55; // A1
  const fMax = options.fMax ?? 2000;
  const chroma = new Float64Array(12);
  for (let bin = 1; bin < mags.length; bin += 1) {
    const freq = (bin * sampleRate) / fftSize;
    if (freq < fMin || freq > fMax) continue;
    const midi = hzToMidi(freq);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += Math.pow(mags[bin], 1.5);
  }
  let max = 0;
  for (let i = 0; i < 12; i += 1) if (chroma[i] > max) max = chroma[i];
  if (max > 0) for (let i = 0; i < 12; i += 1) chroma[i] /= max;
  return chroma;
}

export interface ChordTemplate {
  suffix: string;
  intervals: number[];
  /** 模板权重：同分时优先选更简单的和弦（Am 优于 Am7 优于 Am7b5） */
  weight: number;
}

/** 和弦模板库（吉他伴奏常见品质；越靠前越优先） */
export const CHORD_TEMPLATES: ChordTemplate[] = [
  { suffix: '', intervals: [0, 4, 7], weight: 1.0 },
  { suffix: 'm', intervals: [0, 3, 7], weight: 1.0 },
  { suffix: '7', intervals: [0, 4, 7, 10], weight: 0.86 },
  { suffix: 'm7', intervals: [0, 3, 7, 10], weight: 0.86 },
  { suffix: 'maj7', intervals: [0, 4, 7, 11], weight: 0.82 },
  { suffix: 'sus4', intervals: [0, 5, 7], weight: 0.8 },
  { suffix: 'sus2', intervals: [0, 2, 7], weight: 0.78 },
  { suffix: '5', intervals: [0, 7], weight: 0.6 },
  { suffix: 'm6', intervals: [0, 3, 7, 9], weight: 0.72 },
  { suffix: '6', intervals: [0, 4, 7, 9], weight: 0.72 },
  { suffix: 'dim', intervals: [0, 3, 6], weight: 0.66 },
  { suffix: 'add9', intervals: [0, 2, 4, 7], weight: 0.74 },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10], weight: 0.6 },
];

export interface ChordMatch {
  name: string;
  root: number;
  suffix: string;
  /** 余弦相似度 × 权重，越大越好 */
  score: number;
}

/** 归一化色度（单位向量），用于余弦相似度 */
function normalizeChroma(chroma: Float64Array): Float64Array {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += chroma[i] * chroma[i];
  const norm = Math.sqrt(sum);
  const out = new Float64Array(12);
  if (norm <= 1e-12) return out;
  for (let i = 0; i < 12; i += 1) out[i] = chroma[i] / norm;
  return out;
}

/**
 * 色度 → 和弦名（12 个根音 × 模板，取余弦相似度最高者）。
 *
 * 评分组成（每一项都对应一个真实听感现象）：
 * 1. **模板内音级覆盖度**（余弦）—— 主体；
 * 2. **模板外能量惩罚** —— 否则 C（C E G）会因为共享音而输给 Am7（A C E G）；
 * 3. **低音根音加分** —— 和弦的听感根音通常是低音区最响的那个音级
 *    （`bass` 由 `analyzeChords` 在 65-260Hz 区间单独统计，不是从全频段猜）。
 */
export function chordFromChroma(chroma: Float64Array, bass?: Float64Array | null): ChordMatch | null {
  const unit = normalizeChroma(chroma);
  const energy = chroma.reduce((a, b) => a + b, 0);
  if (energy <= 1e-9) return null;

  let best: ChordMatch | null = null;
  for (let root = 0; root < 12; root += 1) {
    for (const template of CHORD_TEMPLATES) {
      let inEnergy = 0;
      let outEnergy = 0;
      const set = new Set(template.intervals.map((i) => (root + i) % 12));
      for (let pc = 0; pc < 12; pc += 1) {
        if (set.has(pc)) inEnergy += unit[pc] * unit[pc];
        else outEnergy += unit[pc] * unit[pc];
      }
      const coverage = Math.sqrt(inEnergy);
      // 低音根音加分：低音区最强音级 = 根音是听感上最稳的解
      const bassBonus = bass && bass[root] >= 0.999 ? 0.12 : 0;
      const score = coverage * template.weight - outEnergy * 0.45 + bassBonus;
      if (!best || score > best.score) {
        best = {
          name: `${pitchClassName(root)}${template.suffix}`,
          root,
          suffix: template.suffix,
          score: Math.round(score * 10000) / 10000,
        };
      }
    }
  }
  return best;
}

export interface ChordSegment {
  startSec: number;
  endSec: number;
  name: string;
  score: number;
}

export interface AnalyzeChordsOptions {
  /** 分析窗长（秒）—— 一个窗内假定只有一个和弦 */
  windowSec?: number;
  /** 窗移（秒） */
  hopSec?: number;
  fftSize?: number;
  /** 低于这个匹配分数就不标和弦（宁缺勿滥） */
  minScore?: number;
  /** 短于这个时长的和弦段会被丢掉（换和弦瞬间的误判） */
  minSegmentSec?: number;
  /**
   * 参与和弦判定的频段。
   * 默认 **65–520Hz**（吉他伴奏的低中音区）：
   * solo 旋律常在高音区（E4 以上），把它排掉能显著降低「旋律把和弦带跑」的问题，
   * 这也是和弦识别里标准的「低中频带」做法。
   */
  fMin?: number;
  fMax?: number;
  /** 低音区（默认 65–260Hz）内用于判定根音的音级上限频率 */
  bassMaxHz?: number;
}

/**
 * 和弦时间线：滑窗色度 → 模板匹配 → 合并同名相邻段。
 *
 * 输出的是**与音频真实对应的和弦**（不是从旋律反推的），
 * 下游 `handleConvert` 会把这些段映射到小节上，覆盖启发式推定结果。
 */
export function analyzeChords(pcm: PcmAudio, options: AnalyzeChordsOptions = {}): ChordSegment[] {
  const sr = pcm.sampleRate;
  const fftSize = options.fftSize ?? 2048;
  const windowSec = options.windowSec ?? 1.0;
  const hopSec = options.hopSec ?? 0.25;
  const minScore = options.minScore ?? 0.5;
  const minSegmentSec = options.minSegmentSec ?? 0.35;
  const fMin = options.fMin ?? 65;
  const fMax = options.fMax ?? 520;
  const bassMaxHz = options.bassMaxHz ?? 260;

  const frame = new Float32Array(fftSize);
  const fftHop = Math.max(1, Math.round(fftSize / 2));
  const frameChromas: Array<{ t: number; chroma: Float64Array; bass: Float64Array }> = [];
  for (let start = 0; start + fftSize <= pcm.samples.length; start += fftHop) {
    frame.set(pcm.samples.subarray(start, start + fftSize));
    const mags = magnitudeSpectrum(frame);
    frameChromas.push({
      t: (start + fftSize / 2) / sr,
      chroma: chromaFromMagnitudes(mags, sr, fftSize, { fMin, fMax }),
      bass: chromaFromMagnitudes(mags, sr, fftSize, { fMin, fMax: bassMaxHz }),
    });
  }
  if (frameChromas.length === 0) return [];

  const durationSec = pcm.samples.length / sr;
  const windowHop = Math.max(0.05, hopSec);
  /** 低音根音先验：窗口内低音区最响的音级（归一化后 ×1.02 作为标记，便于比较） */
  const bassPrior = (sum: Float64Array): Float64Array => {
    const out = new Float64Array(12);
    let max = 0;
    let best = -1;
    for (let i = 0; i < 12; i += 1) {
      if (sum[i] > max) {
        max = sum[i];
        best = i;
      }
    }
    if (best >= 0) out[best] = 1;
    return out;
  };

  const raw: Array<{ startSec: number; endSec: number; match: ChordMatch | null }> = [];
  for (let t = 0; t < durationSec; t += windowHop) {
    const from = t;
    const to = Math.min(durationSec, t + windowSec);
    const sum = new Float64Array(12);
    const bassSum = new Float64Array(12);
    let count = 0;
    for (const fc of frameChromas) {
      if (fc.t >= from && fc.t < to) {
        for (let i = 0; i < 12; i += 1) {
          sum[i] += fc.chroma[i];
          bassSum[i] += fc.bass[i];
        }
        count += 1;
      }
    }
    if (count === 0) continue;
    for (let i = 0; i < 12; i += 1) sum[i] /= count;
    const match = chordFromChroma(sum, bassPrior(bassSum));
    raw.push({ startSec: t, endSec: to, match: match && match.score >= minScore ? match : null });
  }

  // 合并同名相邻窗 + 丢弃过短段
  const merged: ChordSegment[] = [];
  for (const item of raw) {
    const last = merged[merged.length - 1];
    if (item.match && last && last.name === item.match.name && item.startSec - last.endSec <= windowHop * 1.5) {
      last.endSec = item.endSec;
      last.score = Math.round(((last.score + item.match.score) / 2) * 10000) / 10000;
      continue;
    }
    if (!item.match) {
      if (last && item.startSec - last.endSec <= windowHop * 1.5) last.endSec = item.endSec;
      continue;
    }
    merged.push({
      startSec: Math.round(item.startSec * 10000) / 10000,
      endSec: Math.round(item.endSec * 10000) / 10000,
      name: item.match.name,
      score: item.match.score,
    });
  }
  return merged.filter((segment) => segment.endSec - segment.startSec >= minSegmentSec);
}
