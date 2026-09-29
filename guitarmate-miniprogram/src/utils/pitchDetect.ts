/**
 * 音高检测（YIN）—— 小程序端
 * ==========================
 *
 * ⚠️ **逐行移植自后端 `guitarmate-audio-backend/src/transcription/pitch-analysis.ts#yinPitch`**。
 * 为什么要在端上再实现一遍：小程序**没有 Web Audio / `AnalyserNode`**，麦克风只能走
 * `getRecorderManager()` 拿原始 PCM 帧，所以音高必须**在端上算**（才可能实时）。
 * 而算法必须与后端一致 —— 否则"调音器说准了、后端转录说跑调"这种事根本没法排查。
 * 改这里就要同步改后端那份（两份的关系与 `standardTabLayout.ts` 两端镜像同理）。
 *
 * YIN 实现要点（与后端逐条对应）：
 * 1. 差分函数 `d(τ) = Σ (x[i] − x[i+τ])²`；
 * 2. 累积均值归一化 → 抵消「τ 越大 d 越大」的偏置；
 * 3. 取**第一个**低于阈值的局部极小（不是全局最小 —— 全局最小容易挑到 2 倍周期）；
 * 4. 抛物线插值修正滞后，避免整数滞后带来的音分误差（直接影响音准判定）。
 */

export interface YinOptions {
  /** 最低基频（Hz）—— 标准调弦最低 E2 ≈ 82.4，留余量到 60 以便识别"松得很厉害"的弦 */
  fMin?: number;
  fMax?: number;
  /** 绝对阈值：累积均值归一化差分低于它就认为是周期信号 */
  threshold?: number;
}

export interface YinResult {
  /** 基频（Hz）；<= 0 表示这一帧没有可用音高（噪声/静音/复音） */
  hz: number;
  /** 0-1，越小越不可信 */
  confidence: number;
  /** 最优滞后处的归一化差分值（越小越周期） */
  dip: number;
}

export function yinPitch(frame: Float32Array, sampleRate: number, options: YinOptions = {}): YinResult {
  const fMin = options.fMin && options.fMin > 0 ? options.fMin : 60;
  const fMax = options.fMax && options.fMax > 0 ? options.fMax : 520;
  const threshold = options.threshold && options.threshold > 0 ? options.threshold : 0.15;

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(Math.floor(sampleRate / fMin), frame.length >> 1);
  const n = frame.length;
  if (tauMax <= tauMin + 2) return { hz: 0, confidence: 0, dip: 1 };

  /** 去直流，避免低频漂移污染差分函数 */
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += frame[i];
  mean /= n;

  /** 所有滞后都至少有 limit 个样点参与，保证公平比较 */
  const limit = n - tauMax;
  const d = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let i = 0; i < limit; i += 1) {
      const diff = frame[i] - mean - (frame[i + tau] - mean);
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  const cmnd = new Float64Array(tauMax + 1);
  let running = 0;
  cmnd[tauMin] = 1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * (tau - tauMin + 1)) / running : 1;
  }

  let tau = -1;
  for (let t = tauMin; t <= tauMax; t += 1) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    /** 没找到阈值内的谷：退化为全局最小，但太浅就判定为「无音高」 */
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t += 1) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.55) return { hz: 0, confidence: 0, dip: cmnd[best] };
    tau = best;
  }

  /** 抛物线插值 */
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

/** 帧的均方根（用来判断"这一帧有没有在响"；静音帧不必送进 YIN） */
export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 频率 → 音名（含八度），如 329.63 → `E4`；与后端 `hzToMidi` + `pitchClassName` 同口径 */
export function hzToNoteName(hz: number): string {
  if (!hz || hz <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${PITCH_CLASSES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** 相对目标频率的音分偏差（正 = 偏高）；±50 之外没有意义，调用方会夹取 */
export function centsFrom(hz: number, targetHz: number): number {
  if (!hz || !targetHz) return 0;
  return Math.round(1200 * Math.log2(hz / targetHz));
}

/** Int16 小端 PCM → Float32（-1..1） */
export function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const count = Math.floor(buffer.byteLength / 2);
  const view = new DataView(buffer);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/** 取中位数（多帧平滑用；比平均值抗离群） */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
