import Taro from '@tarojs/taro';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  centsFrom,
  frameRms,
  hzToNoteName,
  median,
  pcm16ToFloat,
  yinPitch,
} from '../utils/pitchDetect';

/**
 * 麦克风实时音高（调音器用）
 * ==========================
 *
 * ## 为什么不用 Web 版那套
 *
 * Web 版 `GuitarHeadstockTuner` 靠 Web Audio 的 `AnalyserNode.getFloatTimeDomainData()` 取帧，
 * 每帧都能拿到最新的一段波形。**小程序没有 Web Audio** ——
 * 只能 `Taro.getRecorderManager()` + `format: 'PCM'` + `onFrameRecorded`，
 * 由微信把录音**按帧（frameSize KB）回调**给逻辑层，我们再自己算音高（YIN，见 `utils/pitchDetect.ts`）。
 *
 * ## 采集参数的取舍
 *
 * - `sampleRate: 16000`：吉他最低音 E2 ≈ 82Hz，16k 采样下每个周期约 195 个样点，**绰绰有余**；
 *   低采样率还能让每帧涵盖更长时间、YIN 更稳，也更省电。
 * - `frameSize: 2`（KB）→ 16k/16bit/单声道下 = 1024 样点 = **64ms 一帧**。
 *   帧太短（<2 个周期）YIN 会跳八度，帧太长指针会顿；64ms 是这两者之间的合理点。
 * - ⚠️ `format` 必须是 `'PCM'`，否则拿到的是压缩数据、没法做自相关。
 *
 * ## 稳定性处理（调音器最怕"数字乱跳"）
 *
 * 1. **静音门限**：帧 RMS 低于 `RMS_GATE` 直接丢弃（不送 YIN，避免气流噪声被算出音高）；
 * 2. **连续两帧有效**才开始上报（抵消起振瞬间的滑音）；
 * 3. **中位数平滑**：最近 `SMOOTH_WINDOW` 个有效频率取中位数（平均会被离群值带偏）；
 * 4. **丢音超时**：`SILENT_TIMEOUT_MS` 内一帧有效都没有 → 读数清空，界面回到「请弹响琴弦」。
 */

/** 一个可调弦位的定义（标准调弦 6→1 弦） */
export interface TunerStringDef {
  /** 1 = 最细的高音 E */
  stringNumber: number;
  noteName: string;
  octave: number;
  targetFreq: number;
}

export interface TunerReading {
  /** 检测到的基频 */
  freq: number;
  /** 与目标弦（最近的那根）之间的音分偏差，已夹到 ±50 */
  cents: number;
  /** 音准（|cents| ≤ 3，与 Web 版同一阈值） */
  inTune: boolean;
  /** 匹配到的弦号（1-6） */
  stringNumber: number;
  /** 检测到的音名（含八度），用于显示 */
  note: string;
}

export interface UseMicPitchResult {
  /** 本次运行环境是否支持「PCM 分帧录音」（H5 不支持 → 界面要明确说明） */
  supported: boolean;
  listening: boolean;
  error: string;
  reading: TunerReading | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * 给外部消费的**帧读数**（AI 跟弹评测用）。
 * 与 `TunerReading` 的区别：`cents` 是相对**最近空弦**的，而评测要跟「谱面那个音」比，
 * 所以额外给出 `midi`（浮点）和 `at`（毫秒时间戳），由调用方自己对齐时间轴。
 */
export interface MicPitchFrame {
  /** `Date.now()`（调用方拿它减掉评测开始的时刻） */
  at: number;
  freq: number;
  /** 浮点 MIDI 音高号（69 = A4 = 440Hz） */
  midi: number;
  confidence: number;
}

/** 评测场景的采样参数：帧更密一点（跟弹时音符可能只有 0.15s） */
export interface MicPitchOptions {
  /** 每接受一帧就回调（内部已做过门限 / 置信度 / 平滑） */
  onFrame?: (frame: MicPitchFrame) => void;
}

/** 静音门限（16bit 归一化后的 RMS；实测拨弦约 0.05~0.3，环境噪声 <0.01） */
const RMS_GATE = 0.012;
/** YIN 置信度下限（低于它就是"没听清"，直接丢） */
const MIN_CONFIDENCE = 0.5;
/** 中位数平滑窗口（帧） */
const SMOOTH_WINDOW = 4;
/** 多久没有有效帧就认为"弦停了" */
const SILENT_TIMEOUT_MS = 700;
/** 音准阈值（音分）—— 与 Web 版一致 */
const IN_TUNE_CENTS = 3;

export function useMicPitch(strings: TunerStringDef[], options: MicPitchOptions = {}): UseMicPitchResult {
  /**
   * H5 端的 `getRecorderManager` 是 MediaRecorder（webm/opus），**没有 `onFrameRecorded`**，
   * 拿不到 PCM → 调音器在浏览器里根本工作不了。这不是 bug，是平台差异：
   * 所以这里显式暴露 `supported=false`，让界面说清楚「请在微信开发者工具/真机上试」。
   */
  const supported =
    typeof Taro.getRecorderManager === 'function' &&
    !process.env.TARO_ENV?.startsWith('h5');

  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState<TunerReading | null>(null);

  const recorderRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null);
  /** 最近若干帧的有效频率（平滑用） */
  const freqsRef = useRef<number[]>([]);
  /** 连续有效帧计数 */
  const validStreakRef = useRef(0);
  const lastValidAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 靶心弦定义（只读，放 ref 里避免重建录音监听） */
  const stringsRef = useRef(strings);
  stringsRef.current = strings;
  /** 帧回调也放 ref：换了新函数不该重建录音监听 */
  const onFrameRef = useRef(options.onFrame);
  onFrameRef.current = options.onFrame;

  const resetBuffers = () => {
    freqsRef.current = [];
    validStreakRef.current = 0;
    lastValidAtRef.current = 0;
    setReading(null);
  };

  const handleFrame = useCallback((frameBuffer: ArrayBuffer) => {
    const frame = pcm16ToFloat(frameBuffer);
    if (frame.length < 256) return;

    /** ① 静音门限：不响就不算，省 CPU 也避免噪声被"算出音高" */
    if (frameRms(frame) < RMS_GATE) return;

    /** ② YIN（与后端同一份算法、同一套参数） */
    const yin = yinPitch(frame, 16000, { fMin: 60, fMax: 520, threshold: 0.15 });
    if (yin.hz <= 0 || yin.confidence < MIN_CONFIDENCE) return;

    /** ③ 连续两帧有效再上报（抵消起振瞬间的音高滑动） */
    validStreakRef.current += 1;
    lastValidAtRef.current = Date.now();
    const window = freqsRef.current;
    window.push(yin.hz);
    if (window.length > SMOOTH_WINDOW) window.shift();
    if (validStreakRef.current < 2) return;

    /** ④ 中位数平滑 → 匹配最近的弦 → 算音分 */
    const hz = median(window);
    const list = stringsRef.current;
    if (list.length === 0) return;
    const target = list.reduce((prev, curr) =>
      Math.abs(curr.targetFreq - hz) < Math.abs(prev.targetFreq - hz) ? curr : prev,
    );
    const centsRaw = centsFrom(hz, target.targetFreq);
    const cents = Math.max(-50, Math.min(50, centsRaw));

    /** ④′ 顺带把这一帧交给外部（AI 跟弹评测）；帧级读数不参与调音器界面 */
    onFrameRef.current?.({
      at: Date.now(),
      freq: hz,
      midi: 69 + 12 * Math.log2(hz / 440),
      confidence: yin.confidence,
    });

    setReading({
      freq: Math.round(hz * 100) / 100,
      cents,
      inTune: Math.abs(centsRaw) <= IN_TUNE_CENTS,
      stringNumber: target.stringNumber,
      note: hzToNoteName(hz),
    });
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* 未在录音时会抛，忽略 */
    }
    setListening(false);
    resetBuffers();
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!supported) {
      setError('当前运行环境不支持 PCM 分帧录音（浏览器端无法做实时调音），请在微信开发者工具或真机上使用。');
      return;
    }
    try {
      /** 录音权限：先 authorize，被拒就引导到设置页（不给"点了没反应"的体验） */
      const auth = await Taro.authorize({ scope: 'scope.record' }).catch((e) => e);
      if (auth && auth.errMsg && !String(auth.errMsg).includes(':ok')) {
        const res = await Taro.showModal({
          title: '需要麦克风权限',
          content: '调音器需要录制声音来识别音高，请在设置里允许「录音」权限。',
          confirmText: '去设置',
        });
        if (res.confirm) await Taro.openSetting();
        return;
      }

      const recorder = Taro.getRecorderManager();
      recorderRef.current = recorder;

      recorder.onFrameRecorded((res: { frameBuffer?: ArrayBuffer }) => {
        if (res?.frameBuffer) handleFrame(res.frameBuffer);
      });
      recorder.onError((err: { errMsg?: string }) => {
        setError(`录音失败：${err?.errMsg || '未知错误'}`);
        setListening(false);
      });

      recorder.start({
        /** 一直听（微信要求给个上限，10 分钟够一次调音；界面停掉就 stop） */
        duration: 600000,
        sampleRate: 16000,
        numberOfChannels: 1,
        /** ⚠️ 必须 PCM，否则拿不到可做自相关的原始波形 */
        format: 'PCM',
        /** 2KB → 16k/16bit 下 = 1024 样点 = 64ms 一帧 */
        frameSize: 2,
        encodeBitRate: 48000,
      });

      resetBuffers();
      setListening(true);

      /** 丢音检测：一段时间没有任何有效帧 → 清读数（界面回到"请弹响琴弦"） */
      timerRef.current = setInterval(() => {
        if (Date.now() - lastValidAtRef.current > SILENT_TIMEOUT_MS) {
          freqsRef.current = [];
          validStreakRef.current = 0;
          setReading(null);
        }
      }, 200);
    } catch (err) {
      setError(`启动麦克风失败：${err instanceof Error ? err.message : String(err)}`);
      setListening(false);
    }
  }, [handleFrame, supported]);

  /** 页面卸载一定要停：否则录音会一直挂着（真机上用户会看到"正在录音"提示不消失） */
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported, listening, error, reading, start, stop };
}
