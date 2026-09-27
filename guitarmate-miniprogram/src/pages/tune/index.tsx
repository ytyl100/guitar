import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStrumUrl, resolveUrl } from '../../services/api';
import { pageClass } from '../../utils/settings';
import { useMicPitch, type TunerStringDef } from '../../hooks/useMicPitch';
import BottomNav from '../../components/BottomNav';

/**
 * 调音器（「Tune 调音」tab）
 * ==========================
 *
 * 视觉与判定逻辑照 Web 版 `GuitarHeadstockTuner.tsx`：
 *
 * ```
 * ┌ 音准表盘（蓝图网格底）────────────────────────┐
 * │                 ┃（中心参考线）                │
 * │   ♭      ◯ 目标圆(随音分左右移动)      #      │
 * │                 ▼（水滴尖）                    │
 * │       ┌ 状态提示胶囊 ─────────────┐            │
 * │       │ 音准完美 / 偏低 / 偏高 … │            │
 * └──────────────────────────────────────────────┘
 * 六根弦的参考音按钮（点一下播放标准音并把表盘置为"准"）
 * [ 开启麦克风听弦调音 ]
 * ```
 *
 * ## 与 Web 版的关键差异（平台限制，不是省事）
 *
 * 1. **音高在端上算**：小程序没有 Web Audio/`AnalyserNode`，走 `getRecorderManager` 的
 *    PCM 分帧 + 端上 YIN（见 `hooks/useMicPitch.ts` / `utils/pitchDetect.ts`，算法与后端逐行一致）。
 * 2. **H5 跑不了麦克风**：浏览器的 `getRecorderManager` 是 MediaRecorder（webm/opus），
 *    没有 PCM 分帧回调 → 页面会明确提示「请在微信开发者工具/真机上使用」，
 *    而不是给一个点了没反应的按钮。
 * 3. **没有琴头插画**：Web 版有 3 套琴头渲染模式（单边旋钮矢量图 / 写实原木图 / 3D），
 *    这里只保留**六弦参考音按钮**这一种（Web 的 `inline` 模式同款）。琴头插画属于纯装饰，
 *    单独一轮再做更合适 —— 不画个假的糊弄。
 *
 * ⚠️ 指针映射与 Web 版一致：±50 音分 → ±85px（`needleOffsetPx`），音准阈值 ±3 音分。
 */
const STANDARD_TUNING: TunerStringDef[] = [
  { stringNumber: 6, noteName: 'E', octave: 2, targetFreq: 82.41 },
  { stringNumber: 5, noteName: 'A', octave: 2, targetFreq: 110.0 },
  { stringNumber: 4, noteName: 'D', octave: 3, targetFreq: 146.83 },
  { stringNumber: 3, noteName: 'G', octave: 3, targetFreq: 196.0 },
  { stringNumber: 2, noteName: 'B', octave: 3, targetFreq: 246.94 },
  { stringNumber: 1, noteName: 'E', octave: 4, targetFreq: 329.63 },
];

/** 音分 → 指针位移（与 Web 版同一条公式） */
const NEEDLE_MAX_PX = 85;

export default function Tune() {
  /** 手动选中的弦（默认第 1 弦，与 Web 版一致） */
  const [selectedStringNum, setSelectedStringNum] = useState(1);
  /** 点弦试听后的"仪表盘读数"（Web 版也是这么做的：点一下屏上就显示该弦已准） */
  const [manual, setManual] = useState<{ freq: number; inTune: boolean } | null>(null);
  const [toast, setToast] = useState('');
  /** 试听读数的复位定时器（与 Web 版一样 1.5s 后回到中性态） */
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 卸载时清掉定时器 */
  useEffect(
    () => () => {
      if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    },
    [],
  );

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: 'Tune 调音' });
  });

  const { supported, listening, error, reading, start, stop } = useMicPitch(STANDARD_TUNING);

  const currentString = useMemo(
    () => STANDARD_TUNING.find((s) => s.stringNumber === selectedStringNum) || STANDARD_TUNING[5],
    [selectedStringNum],
  );

  /** 麦克风读数优先；没有麦克风时用手动选弦的读数 */
  const display = reading
    ? { cents: reading.cents, freq: reading.freq, inTune: reading.inTune, note: reading.note, live: true }
    : manual
      ? { cents: 0, freq: manual.freq, inTune: manual.inTune, note: currentString.noteName, live: false }
      : { cents: 0, freq: 0, inTune: false, note: '', live: false };

  /**
   * 「刚拨了一下」的状态。
   * ⚠️ Web 版这里是 `detectedPitch.isPlucked`，而状态胶囊的首个分支是
   * `!isMicActive && !isPlucked` —— 我一开始只看了 `live`，导致**点弦试听后圆环已显示 ✓、
   * 胶囊却还说「Start tuning」**（实测踩到）。所以拨弦/试听同样算 plucked。
   */
  const plucked = display.live || !!manual;

  const needlePx = (display.cents / 50) * NEEDLE_MAX_PX;

  /** 试听：复用后端拨弦合成（`GET /api/audio/strum`），只发一根弦 ✅ 和弦库也是这个端点 */
  const playRef = useCallback(async (stringNumber: number) => {
    const target = STANDARD_TUNING.find((s) => s.stringNumber === stringNumber);
    if (!target) return;
    setSelectedStringNum(stringNumber);
    setManual({ freq: target.targetFreq, inTune: true });
    /** 与 Web 版一致：1.5s 后回到中性态（否则会一直像"已准"） */
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    manualTimerRef.current = setTimeout(() => setManual(null), 1500);
    try {
      /** `frets` 下标 0 = 第 6 弦 → 第 N 弦 = 6 - N */
      const frets = [-1, -1, -1, -1, -1, -1];
      frets[6 - stringNumber] = 0;
      const url = await fetchStrumUrl(frets, 0);
      const ctx = Taro.createInnerAudioContext();
      try {
        ctx.obeyMuteSwitch = false;
      } catch {
        /* 平台不支持则忽略 */
      }
      ctx.src = resolveUrl(url);
      ctx.onEnded(() => ctx.destroy());
      ctx.play();
    } catch (err) {
      setToast(`参考音播放失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  /** 麦克风开关（Web 版同一个按钮的两态文案） */
  const toggleMic = async () => {
    if (listening) {
      stop();
      return;
    }
    setManual(null);
    await start();
  };

  const micHint = error || (supported ? '' : '此环境不支持实时调音（浏览器端没有 PCM 分帧录音）');

  return (
    <View className={pageClass('gm-tune-page')}>
      {/** ── 音准表盘 ───────────────────────────────────────────── */}
      <View className="gm-gauge">
        <View className="gm-gauge-grid" />
        <View className="gm-gauge-centerline" />

        <View className="gm-gauge-scale">
          <Text className={`gm-gauge-accidental${display.live && display.cents < -4 ? ' gm-gauge-accidental--hot' : ''}`}>
            ♭
          </Text>

          {/** 目标圆：随音分左右移动（限幅 ±50 音分 → ±85px） */}
          <View className="gm-gauge-target-wrap" style={`transform:translateX(${needlePx}px)`}>
            <View className={`gm-gauge-target${display.inTune ? ' gm-gauge-target--in' : ''}`}>
              {display.inTune ? (
                <Text className="gm-gauge-check">✓</Text>
              ) : (
                <Text className="gm-gauge-note">{display.live ? display.note : currentString.noteName}</Text>
              )}
            </View>
            <View className={`gm-gauge-tip${display.inTune ? ' gm-gauge-tip--in' : ''}`} />
          </View>

          <Text className={`gm-gauge-accidental${display.live && display.cents > 4 ? ' gm-gauge-accidental--hot' : ''}`}>
            #
          </Text>
        </View>

        {/** 状态提示胶囊（文案与 Web 版逐字一致） */}
        <View className="gm-gauge-pill">
          {!listening && !plucked ? (
            <Text>Start tuning by playing any string</Text>
          ) : display.inTune ? (
            <Text className="gm-gauge-in">✓ 音准完美 (In Tune) · {display.freq}Hz</Text>
          ) : display.cents < -3 ? (
            <Text className="gm-gauge-low">偏低 ♭ 请顺时针调紧琴钮 (+{Math.abs(display.cents)}¢)</Text>
          ) : display.cents > 3 ? (
            <Text className="gm-gauge-high">偏高 ♯ 请逆时针松开琴钮 (-{display.cents}¢)</Text>
          ) : (
            <Text>请弹响吉他琴弦...</Text>
          )}
        </View>
      </View>

      {/** ── 环境提示（H5 / 权限失败都要说清楚，不做"点了没反应"的按钮） ── */}
      {!!micHint && (
        <View className="gm-tune-warn">
          <Text>⚠ {micHint}</Text>
        </View>
      )}

      {/** ── 六根弦的参考音 ─────────────────────────────────────── */}
      <View className="gm-tune-strings">
        <Text className="gm-section-title">标准调弦 · 点弦试听参考音</Text>
        <View className="gm-tune-string-row">
          {[...STANDARD_TUNING].reverse().map((s) => (
            <View
              key={s.stringNumber}
              className={`gm-tune-string${selectedStringNum === s.stringNumber ? ' gm-tune-string--on' : ''}`}
              onClick={() => void playRef(s.stringNumber)}
            >
              <Text className="gm-tune-string-note">
                {s.noteName}
                {s.octave}
              </Text>
              <Text className="gm-tune-string-num">{s.stringNumber} 弦</Text>
              <Text className="gm-tune-string-freq">{s.targetFreq}Hz</Text>
            </View>
          ))}
        </View>
      </View>

      {/** ── 麦克风开关 ─────────────────────────────────────────── */}
      <View
        className={`gm-tune-mic${listening ? ' gm-tune-mic--on' : ''}${supported ? '' : ' gm-tune-mic--off'}`}
        onClick={() => void toggleMic()}
      >
        <Text>{listening ? '⏹ 关闭麦克风调音' : '🎤 开启麦克风听弦调音'}</Text>
      </View>
      {!!toast && <Text className="gm-meta" style="display:block;text-align:center;margin-top:16px">{toast}</Text>}

      <Text className="gm-meta" style="display:block;padding:24px 32px;opacity:0.6">
        音高检测在端上完成（YIN，与后端转录同一份算法）。每帧 64ms，最近 4 帧取中位数，
        音准阈值 ±3 音分。
      </Text>

      <BottomNav active="tune" />
    </View>
  );
}
