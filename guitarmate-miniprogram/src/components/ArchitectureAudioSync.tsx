import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Stepper } from './ArchitectureStudio';

/**
 * 架构方案 · 页签 3：音频上传与六线谱挂音乐进度条工作台
 * ======================================================
 *
 * 逐块照搬 Web 版 `ArchitectureModal.tsx` 的 `activeTab === 'audio-sync'` 分支：
 *
 * ```
 * 顶部横幅（标题 + 说明 + 「60 FPS 游标时钟联动」徽标）
 * 1. 伴奏音频直传与解析引擎（文件卡 + BPM/小节数/延迟三块 + 时钟补偿）
 * 2. 六线谱挂音乐总进度条（双向 Seek 联动模拟器）
 *    · 对齐模式：音符级毫秒 / 小节级
 *    · 波形（64 根柱）+ 小节标记 + 播放头
 *    · 六线谱 6 弦 + 音符 + 与音频同步的游标
 *    · 试听/暂停 · 重置到开头
 * 3. 音频上传挂载进度条核心实现四步闭环（Step 1-4 卡片，文案逐字一致）
 * ```
 *
 * ## 与 Web 版的三处平台适配（都不是漏做）
 *
 * 1. **内联 SVG → View 拼**：小程序不能内联 `<svg>`（谱面也是因此才走服务端 PNG）。
 *    这里的六线谱是 6 条横线 + 5 个音符点 + 1 条游标，用绝对定位的 View 画即可，
 *    不需要为一张演示图再去走渲染服务。
 * 2. **range 滑块 → −/＋ 步进器**（时钟补偿 −200~200ms / 步长 10）：见 `ArchitectureStudio`
 *    文件头那条 —— Taro 的 `<Slider>` 在 H5 下会抛异常。
 * 3. **「重新选择音频」**：小程序没有 `<input type=file>`。
 *    真机上用 `Taro.chooseMessageFile`（从会话里选文件，这是小程序唯一能给用户选任意文件的入口）；
 *    H5 预览没有这个能力 → **明确提示**，而不是装作选中了文件。
 *
 * ## 一处比 Web 更好的地方（如实说明）
 *
 * Web 版那个 mock 播放头是**死的**（点暂停/试听只切图标，时间不动）。这里接了 100ms 定时器
 * 真的推进 `currentSec`，所以波形、游标、当前小节徽标会**真的动**——演示才有意义。
 */

interface MockMeasure {
  bar: number;
  start: number;
  end: number;
  chord: string;
}

const MOCK_AUDIO_DURATION = 180; // 3 分钟（与 Web 的 mock 一致）
const MOCK_MEASURES: MockMeasure[] = [
  { bar: 1, start: 0, end: 4.2, chord: 'G' },
  { bar: 2, start: 4.2, end: 8.5, chord: 'Em' },
  { bar: 3, start: 8.5, end: 12.8, chord: 'C' },
  { bar: 4, start: 12.8, end: 17.0, chord: 'D' },
  { bar: 5, start: 17.0, end: 21.2, chord: 'G' },
];

/** 六线谱上那 5 个演示音符（x 为 viewBox 500 内的坐标，这里换算成百分比） */
const TAB_NOTES = [
  { x: 80, y: 45, fret: 0 },
  { x: 160, y: 35, fret: 2 },
  { x: 240, y: 25, fret: 3 },
  { x: 320, y: 15, fret: 2 },
  { x: 400, y: 25, fret: 3 },
];

function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function ArchitectureAudioSync() {
  const [audioName, setAudioName] = useState('Ed_Sheeran_Perfect_Original_Acoustic.mp3');
  const [currentSec, setCurrentSec] = useState(14.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpsDetect] = useState(63);
  const [latencyMs, setLatencyMs] = useState(0);
  const [gridMode, setGridMode] = useState<'note' | 'measure'>('note');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 试听：真的按 100ms 步进推进（见文件头「比 Web 更好的地方」） */
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentSec((prev) => (prev + 0.1 >= MOCK_AUDIO_DURATION ? 0 : Math.round((prev + 0.1) * 100) / 100));
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isPlaying]);

  /** 当前所在小节（按 mock 小节窗口判断） */
  const activeMeasure = useMemo(
    () => MOCK_MEASURES.find((m) => currentSec >= m.start && currentSec < m.end) || MOCK_MEASURES[0],
    [currentSec],
  );

  /** 小节内偏移比例（Web 用 `currentSec % 4.2` 近似；这里用小节真实窗口，更准） */
  const measureRatio = useMemo(() => {
    const span = activeMeasure.end - activeMeasure.start || 1;
    return Math.max(0, Math.min(1, (currentSec - activeMeasure.start) / span));
  }, [activeMeasure, currentSec]);

  /** 波形柱高（与 Web 同一公式，视觉一致） */
  const bars = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const h = 20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.8) * 20;
        return { h: Math.max(8, Math.min(56, h)), past: (i / 64) * MOCK_AUDIO_DURATION <= currentSec };
      }),
    [currentSec],
  );

  /** 点波形 Seek：先量出波形的实际位置与宽度，再按点击的 x 算比例 */
  const onWaveformTap = (e: { detail?: { x?: number }; touches?: Array<{ clientX?: number }> }) => {
    const x = e?.detail?.x ?? e?.touches?.[0]?.clientX;
    Taro.createSelectorQuery()
      .select('#gm-async-wave')
      .boundingClientRect((rect) => {
        const r = rect as { left?: number; width?: number } | null;
        if (!r?.width || typeof x !== 'number') return;
        const ratio = Math.max(0, Math.min(1, (x - (r.left || 0)) / r.width));
        setCurrentSec(Math.round(ratio * MOCK_AUDIO_DURATION * 100) / 100);
      })
      .exec();
  };

  /** 「重新选择音频」：真机走 chooseMessageFile，H5 明确说明不支持 */
  const pickAudio = async () => {
    const canPick = typeof (Taro as unknown as { chooseMessageFile?: unknown }).chooseMessageFile === 'function';
    if (!canPick || process.env.TARO_ENV?.startsWith('h5')) {
      Taro.showToast({
        title: '浏览器端不能选本地文件；真机上用「从会话选择文件」',
        icon: 'none',
        duration: 2600,
      });
      return;
    }
    try {
      const res = await Taro.chooseMessageFile({ count: 1, type: 'file' });
      const file = res?.tempFiles?.[0];
      if (file?.name) setAudioName(file.name);
    } catch {
      /* 用户取消选择 —— 不是错误，静默返回 */
    }
  };

  return (
    <View>
      {/** 顶部横幅 */}
      <View className="gm-card">
        <Text className="gm-studio-h">📻 音频上传与六线谱挂音乐进度条工作台</Text>
        <Text className="gm-meta" style="display:block;margin-top:6px;line-height:1.7">
          管理音频资产上传、声学波形解析、六线谱小节/音符毫秒级对齐与双向进度条挂载
        </Text>
        <View className="gm-studio-cloud">
          <Text>60 FPS 游标时钟联动</Text>
        </View>
      </View>

      {/** 1. 音频直传与解析 */}
      <View className="gm-card">
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-studio-section-title" style="flex:1;min-width:0">
            ⬆ 1. 伴奏音频直传与解析引擎
          </Text>
        </View>
        <Text className="gm-meta" style="display:block;margin-top:4px">
          支持 MP3 / WAV / FLAC / AAC
        </Text>

        <View className="gm-async-drop">
          <Text className="gm-async-drop-icon">🎵</Text>
          <Text className="gm-async-drop-name">{audioName}</Text>
          <Text className="gm-meta" style="display:block;margin-top:4px">
            44.1kHz / 320kbps / 3分00秒 (180s)
          </Text>
          <View className="gm-async-drop-btn" onClick={() => void pickAudio()}>
            <Text>重新选择音频</Text>
          </View>
        </View>

        <View className="gm-async-tiles">
          <View className="gm-async-tile">
            <Text className="gm-async-tile-label">自动探测 BPM</Text>
            <Text className="gm-async-tile-value" style="color:#10b981">
              {bpsDetect} BPM
            </Text>
            <Text className="gm-async-tile-sub">4/4 拍民谣节拍</Text>
          </View>
          <View className="gm-async-tile">
            <Text className="gm-async-tile-label">小节打点总数</Text>
            <Text className="gm-async-tile-value" style="color:#22d3ee">
              42 小节
            </Text>
            <Text className="gm-async-tile-sub">平均 4.25s / 小节</Text>
          </View>
          <View className="gm-async-tile">
            <Text className="gm-async-tile-label">蓝牙延迟微调</Text>
            <Text className="gm-async-tile-value" style="color:#fbbf24">
              {latencyMs} ms
            </Text>
            <Text className="gm-async-tile-sub">耳麦时钟补偿</Text>
          </View>
        </View>

        <View style="margin-top:16px">
          <View style="display:flex;align-items:center;justify-content:space-between">
            <Text className="gm-meta">时钟补偿:</Text>
            <Text className="gm-studio-strong">{latencyMs}ms</Text>
          </View>
          <Stepper value={latencyMs} min={-200} max={200} step={10} onChange={setLatencyMs} />
        </View>
      </View>

      {/** 2. 双向 Seek 联动模拟器 */}
      <View className="gm-card">
        <Text className="gm-studio-section-title">🎚 2. 六线谱挂音乐总进度条 (双向 Seek 联动模拟器)</Text>

        <View className="gm-studio-chips" style="margin-top:12px">
          <Text className="gm-meta" style="margin-right:12px;align-self:center">
            对齐模式:
          </Text>
          <Text
            className={`gm-studio-chip${gridMode === 'note' ? ' gm-studio-chip--on' : ''}`}
            style={gridMode === 'note' ? 'background-color:#10b981;color:#04231a' : ''}
            onClick={() => setGridMode('note')}
          >
            音符级毫秒
          </Text>
          <Text
            className={`gm-studio-chip${gridMode === 'measure' ? ' gm-studio-chip--on' : ''}`}
            style={gridMode === 'measure' ? 'background-color:#10b981;color:#04231a' : ''}
            onClick={() => setGridMode('measure')}
          >
            小节级
          </Text>
        </View>

        <View style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
          <Text className="gm-meta">🔊 音频声学振幅 (Waveform Peaks) 与游标</Text>
          <Text className="gm-async-clock">
            {formatClock(currentSec)} / 03:00
          </Text>
        </View>

        {/** 波形：点它即 Seek（Web 同行为） */}
        <View id="gm-async-wave" className="gm-async-wave" onClick={onWaveformTap}>
          <View className="gm-async-wave-bars">
            {bars.map((b, i) => (
              <View
                key={i}
                className="gm-async-wave-bar"
                style={`height:${b.h}px;background-color:${b.past ? '#34d399' : 'rgba(63,63,70,0.6)'}`}
              />
            ))}
          </View>
          {/** 播放头 */}
          <View className="gm-async-playhead" style={`left:${(currentSec / MOCK_AUDIO_DURATION) * 100}%`}>
            <View className="gm-async-playhead-dot" />
          </View>
          {/** 小节标记 */}
          {MOCK_MEASURES.map((m) => (
            <View
              key={m.bar}
              className="gm-async-marker"
              style={`left:${(m.start / MOCK_AUDIO_DURATION) * 100}%`}
            >
              <Text className="gm-async-marker-label">
                M{m.bar}:{m.chord}
              </Text>
            </View>
          ))}
        </View>

        {/** 六线谱（View 拼，见文件头第 1 条适配） */}
        <View className="gm-async-tab">
          <View style="display:flex;align-items:center;justify-content:space-between">
            <Text className="gm-async-tab-badge">
              当前小节挂载: Measure {activeMeasure.bar} ({activeMeasure.chord} Chord)
            </Text>
            <Text className="gm-async-tab-playhead">Playhead X: {Math.round(measureRatio * 100)}%</Text>
          </View>

          <View className="gm-async-staff">
            {['1E', '2B', '3G', '4D', '5A', '6E'].map((label, idx) => (
              <View key={label} className="gm-async-string" style={`top:${(idx + 1) * 12.5}%`}>
                <Text className="gm-async-string-label">{label}</Text>
              </View>
            ))}
            {TAB_NOTES.map((n) => (
              <View
                key={n.x}
                className="gm-async-note"
                style={`left:${(n.x / 500) * 100}%;top:${(n.y / 80) * 100}%`}
              >
                <Text className="gm-async-note-text">{n.fret}</Text>
              </View>
            ))}
            <View className="gm-async-tab-cursor" style={`left:${6 + measureRatio * 88}%`} />
          </View>
        </View>

        <View className="gm-async-controls">
          <View
            className={`gm-async-play${isPlaying ? ' gm-async-play--on' : ''}`}
            onClick={() => setIsPlaying((v) => !v)}
          >
            <Text>{isPlaying ? '⏸ 暂停音频' : '▶ 试听音频对拍'}</Text>
          </View>
          <View className="gm-async-reset" onClick={() => setCurrentSec(0)}>
            <Text>重置到开头</Text>
          </View>
        </View>

        {/** 点小节直接跳（Web 说"点六线谱任意小节即可 Seek"；小程序里给出明确的小节按钮） */}
        <View className="gm-studio-chips" style="margin-top:8px">
          {MOCK_MEASURES.map((m) => (
            <Text
              key={m.bar}
              className={`gm-studio-chip${activeMeasure.bar === m.bar ? ' gm-studio-chip--on' : ''}`}
              style={activeMeasure.bar === m.bar ? 'background-color:#10b981;color:#04231a' : ''}
              onClick={() => setCurrentSec(m.start)}
            >
              M{m.bar} {m.chord}
            </Text>
          ))}
        </View>
        <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.7">
          点波形图或上面任意小节按钮即可立即双向 Seek 跳转（当前对齐模式：
          {gridMode === 'note' ? '音符级毫秒' : '小节级'}）。
        </Text>
      </View>

      {/** 3. 四步闭环 */}
      <View className="gm-card">
        <Text className="gm-studio-section-title">✅ 3. 音频上传挂载进度条核心实现四步闭环</Text>
        <View className="gm-async-steps">
          {[
            {
              title: 'Step 1: 直传与提取',
              color: '#34d399',
              text: '前端上传 MP3 到云存储，Web Audio API 即刻解码采样提取 128 点波形峰值，计算音频时长。',
            },
            {
              title: 'Step 2: 小节/音符对齐',
              color: '#22d3ee',
              text: '后台打点器通过 Spacebar 节拍探测或拖拽小节线，将六线谱的每个小节与音符分配绝对时间秒数。',
            },
            {
              title: 'Step 3: 双向时钟挂载',
              color: '#c084fc',
              text: '音频播放主时钟驱动六线谱红线游标平滑滑动；点击六线谱小节反向快进/快退音频进度。',
            },
            {
              title: 'Step 4: 小程序端秒开',
              color: '#fbbf24',
              text: '使用微信 InnerAudioContext 边下边播，配备虚拟化六线谱渲染与蓝牙耳麦延迟补偿。',
            },
          ].map((s) => (
            <View key={s.title} className="gm-async-step">
              <Text className="gm-async-step-title" style={`color:${s.color}`}>
                {s.title}
              </Text>
              <Text className="gm-async-step-text">{s.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
