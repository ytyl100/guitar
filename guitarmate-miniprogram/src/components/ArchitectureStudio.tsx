import { Input, Text, View } from '@tarojs/components';
import { useMemo, useState } from 'react';

/**
 * 架构方案 · 页签 2：课程教务工作台（Course Studio CMS 原型演示）
 * =============================================================
 *
 * 逐块照搬 Web 版 `ArchitectureModal.tsx` 的 `activeTab === 'studio'` 分支：
 *
 * ```
 * 顶部说明条（标题 + 一句说明 + 「已连接教研云存储」徽标）
 * 左栏  课时结构树：CH1 破冰入门（How to hold & tune 5min）
 *                   CH2 首批和弦（How to play Em 6min / Em⇄D6/9 转换测试 4min）
 * 右栏  正在编排的课时 +
 *       1. 教学视频绑定与时间戳关键打点（打点列表 + 新增打点）
 *       2. 模块依赖流转与通关卡点设置（AI评分卡点 / 严格线性 / 全免解锁 + 达标分）
 *       3. 和弦练习模块与节拍器 BPM 阶梯（Em ⇄ D6/9，起始/目标 BPM）
 *       4. 单课 20 分钟时间进度切片分配（比例条 + 5 个切片）
 * ```
 *
 * ## 平台适配（都是"小程序没有对应控件"，不是设计偏离）
 *
 * - Web 的 `<input type="range">` → **−/＋ 步进器**（范围与步长与 Web 完全一致：
 *   达标分 60-100/步长 5、起始 BPM 30-80/步长 5、目标 BPM 50-120/步长 5）。
 *   ⚠️ 一开始用的是 Taro 的 `<Slider>`，但它在 H5 下会抛
 *   `Cannot read properties of undefined (reading 'value')`（组件内部 watchValue 的兼容问题，
 *   实测控制台报错，而真机原生 slider 没这个问题）——所以改成两端行为一致的步进器。
 * - Web 的 `<input type="text">` → `<Input>`；`hover:` 效果在小程序没有，去掉。
 * - **数据全在内存里 mock**：与 Web 版一样是原型演示，不写后端（这一点页面上有说明）。
 */

interface KeyPoint {
  time: string;
  title: string;
  chord: string;
}

/** 左侧课时树的三个步骤（文案与 Web 版逐字一致） */
const STUDIO_STEPS = [
  { id: 'step-1', chapter: 'CH 1: 破冰入门 (持琴与调音)', icon: '🎬', title: 'How to hold & tune', mins: 5 },
  { id: 'step-5', chapter: 'CH 2: 首批和弦 (Em 与 D6/9)', icon: '▶', title: 'How to play Em', mins: 6 },
  { id: 'step-6', chapter: 'CH 2: 首批和弦 (Em 与 D6/9)', icon: '🎤', title: 'Em ⇄ D6/9 转换测试', mins: 4 },
];

const UNLOCK_MODES = [
  { key: 'score' as const, label: 'AI评分卡点 (推荐)' },
  { key: 'strict' as const, label: '严格线性顺序' },
  { key: 'free' as const, label: '全免免试解锁' },
];

/** 数值步进器（替代 Web 的 `<input type="range">`，见文件头「平台适配」）
 * ⚠️ 导出给页签 3（音频挂进度条）复用：两边都是「范围 + 步长 + −/＋」的同一个东西。 */
export function Stepper({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <View className="gm-studio-stepper">
      <Text className="gm-studio-slice-btn" onClick={() => onChange(clamp(value - step))}>
        −
      </Text>
      <Text className="gm-studio-stepper-hint">
        {min}-{max} · 步长 {step}
      </Text>
      <Text className="gm-studio-slice-btn" onClick={() => onChange(clamp(value + step))}>
        ＋
      </Text>
    </View>
  );
}

interface Slice {
  key: string;
  label: string;
  color: string;
  initial: number;
}

/** 五段切片（与 Web 版初始值一致：3 + 6 + 4 + 4 + 3 = 20） */
const SLICES: Slice[] = [
  { key: 'warmup', label: '校音热身', color: '#fbbf24', initial: 3 },
  { key: 'video', label: '名师视频', color: '#3b82f6', initial: 6 },
  { key: 'chord', label: '和弦微测', color: '#10b981', initial: 4 },
  { key: 'switch', label: '转换冲刺', color: '#a855f7', initial: 4 },
  { key: 'jam', label: '曲目对拍', color: '#f43f5e', initial: 3 },
];

export default function ArchitectureStudio() {
  const [activeStepId, setActiveStepId] = useState('step-5');
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([
    { time: '00:35', title: '左手食指与中指下弦顺序', chord: 'Em' },
    { time: '01:20', title: '手腕自然旋转，防触第1弦', chord: 'Em' },
    { time: '02:15', title: '常见哑音自查方法', chord: 'Em' },
  ]);
  const [newTime, setNewTime] = useState('03:10');
  const [newTitle, setNewTitle] = useState('双手对拍节拍器试练');
  const [unlockMode, setUnlockMode] = useState<'score' | 'strict' | 'free'>('score');
  const [passScore, setPassScore] = useState(80);
  const [startBpm, setStartBpm] = useState(40);
  const [targetBpm, setTargetBpm] = useState(70);
  const [alloc, setAlloc] = useState<Record<string, number>>(() =>
    SLICES.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.key]: s.initial }), {}),
  );

  const totalMins = useMemo(
    () => SLICES.reduce((sum, s) => sum + (alloc[s.key] || 0), 0),
    [alloc],
  );

  const step = STUDIO_STEPS.find((s) => s.id === activeStepId) || STUDIO_STEPS[1];

  /**
   * 「添加打点」：与 Web 的 `handleAddKeyPoint` 同规则 ——
   * 时间/标题任一为空就忽略；新打点的高亮和弦取当前课时（这里固定 Em，与 Web 的 mock 一致）。
   */
  const addKeyPoint = () => {
    const time = newTime.trim();
    const title = newTitle.trim();
    if (!time || !title) return;
    setKeyPoints((prev) => [...prev, { time, title, chord: 'Em' }]);
    setNewTime('');
    setNewTitle('');
  };

  /** 调整某一段切片：夹在 0-20 且保证整数（Web 的滑块同理） */
  const bumpSlice = (key: string, delta: number) =>
    setAlloc((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(20, (prev[key] || 0) + delta)),
    }));

  return (
    <View>
      {/** 顶部说明条 */}
      <View className="gm-card">
        <View style="display:flex;align-items:flex-start;justify-content:space-between">
          <View style="min-width:0;flex:1">
            <Text className="gm-studio-h">🎛 课程教务工作台 (Course Studio CMS 原型演示)</Text>
            <Text className="gm-meta" style="display:block;margin-top:6px;line-height:1.7">
              实时模拟吉他教研团队对视频打点、前后依赖规则、和弦练习参数与时间切片的配置
            </Text>
          </View>
        </View>
        <View className="gm-studio-cloud">
          <Text>已连接教研云存储</Text>
        </View>
      </View>

      {/** 左栏：课时结构树 */}
      <View className="gm-card">
        <Text className="gm-studio-kicker">课程课时结构树</Text>
        {['CH 1: 破冰入门 (持琴与调音)', 'CH 2: 首批和弦 (Em 与 D6/9)'].map((chapter) => (
          <View key={chapter} style="margin-top:16px">
            <Text className="gm-studio-chapter">{chapter}</Text>
            {STUDIO_STEPS.filter((s) => s.chapter === chapter).map((s) => (
              <View
                key={s.id}
                className={`gm-studio-step${s.id === activeStepId ? ' gm-studio-step--on' : ''}`}
                onClick={() => setActiveStepId(s.id)}
              >
                <Text className="gm-studio-step-title">
                  {s.icon} {s.title}
                </Text>
                <Text className="gm-studio-step-mins">{s.mins} min</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/** 右栏：课时配置检查器 */}
      <View className="gm-card">
        <Text className="gm-studio-kicker">正在编排课时 ID: {activeStepId}</Text>
        <Text className="gm-studio-step-head">
          {activeStepId === 'step-5'
            ? 'How to play Em (单和弦突破与转换冲刺)'
            : activeStepId === 'step-6'
              ? 'Em ⇄ D6/9 转换测试'
              : 'How to hold and tune your guitar'}
        </Text>
        <View className="gm-studio-type-badge">
          <Text>类型: VIDEO + TRAINER</Text>
        </View>

        {/** A. 教学视频打点 */}
        <View className="gm-studio-section">
          <Text className="gm-studio-section-title">🎬 1. 教学视频绑定与时间戳关键打点 (Timestamp Key-Points)</Text>
          <View className="gm-studio-panel">
            <Text className="gm-meta" style="display:block">
              主讲老师: Mark Robertson (伯克利吉他客座讲师)
            </Text>
            <Text className="gm-meta" style="display:block;color:#34d399;margin-top:4px">
              CDN: 1080P 自适应就绪
            </Text>

            {keyPoints.map((kp) => (
              <View key={`${kp.time}-${kp.title}`} className="gm-studio-kp">
                <View style="min-width:0;flex:1">
                  <Text className="gm-studio-kp-time">{kp.time}</Text>
                  <Text className="gm-studio-kp-title">{kp.title}</Text>
                </View>
                <Text className="gm-studio-kp-chord">高亮和弦: {kp.chord}</Text>
              </View>
            ))}

            <View className="gm-studio-addrow">
              <Input
                className="gm-studio-input gm-studio-input--time"
                value={newTime}
                placeholder="00:00"
                onInput={(e) => setNewTime(String(e.detail.value ?? ''))}
              />
              <Input
                className="gm-studio-input"
                value={newTitle}
                placeholder="输入关键动作知识点描述..."
                onInput={(e) => setNewTitle(String(e.detail.value ?? ''))}
              />
              <View className="gm-studio-addbtn" onClick={addKeyPoint}>
                <Text>添加打点</Text>
              </View>
            </View>
          </View>
        </View>

        {/** B. 依赖与解锁 */}
        <View className="gm-studio-section">
          <Text className="gm-studio-section-title">🔒 2. 模块依赖流转与通关卡点设置 (Prerequisite & Unlock Gating)</Text>
          <View className="gm-studio-panel">
            <Text className="gm-meta" style="display:block">解锁策略选择:</Text>
            <View className="gm-studio-chips">
              {UNLOCK_MODES.map((m) => (
                <Text
                  key={m.key}
                  className={`gm-studio-chip${unlockMode === m.key ? ' gm-studio-chip--on' : ''}`}
                  onClick={() => setUnlockMode(m.key)}
                >
                  {m.label}
                </Text>
              ))}
            </View>

            {unlockMode === 'score' && (
              <View style="margin-top:16px">
                <View style="display:flex;align-items:center;justify-content:space-between">
                  <Text className="gm-meta">
                    麦克风 AI 听音达标门槛: <Text className="gm-studio-strong">{passScore} 分</Text>
                  </Text>
                </View>
                <Stepper value={passScore} min={60} max={100} step={5} onChange={setPassScore} />
              </View>
            )}
          </View>
        </View>

        {/** C. 和弦练习参数 */}
        <View className="gm-studio-section">
          <Text className="gm-studio-section-title">🎵 3. 和弦练习模块与节拍器 BPM 阶梯配置</Text>
          <View className="gm-studio-panel">
            <View style="display:flex;align-items:center;justify-content:space-between">
              <Text className="gm-meta">目标转换对:</Text>
              <Text className="gm-studio-pair">Em ⇄ D6/9</Text>
            </View>

            <View style="margin-top:16px">
              <View style="display:flex;align-items:center;justify-content:space-between">
                <Text className="gm-meta">起始速度:</Text>
                <Text className="gm-studio-strong">{startBpm} BPM</Text>
              </View>
              <Stepper value={startBpm} min={30} max={80} step={5} onChange={setStartBpm} />
            </View>

            <View style="margin-top:16px">
              <View style="display:flex;align-items:center;justify-content:space-between">
                <Text className="gm-meta">通关目标速度:</Text>
                <Text className="gm-studio-strong">{targetBpm} BPM</Text>
              </View>
              <Stepper value={targetBpm} min={50} max={120} step={5} onChange={setTargetBpm} />
            </View>
          </View>
        </View>

        {/** D. 黄金 20 分钟切片 */}
        <View className="gm-studio-section">
          <View style="display:flex;align-items:center;justify-content:space-between">
            <Text className="gm-studio-section-title" style="flex:1;min-width:0">
              ⏱ 4. 单课 20 分钟时间进度切片分配 (Time Allocation)
            </Text>
            <Text
              className={`gm-studio-total${totalMins === 20 ? ' gm-studio-total--ok' : ''}`}
            >
              合计: {totalMins} / 20 分钟
            </Text>
          </View>

          {/** 比例条：各段宽度按占比（与 Web 同算法） */}
          <View className="gm-studio-bar">
            {SLICES.map((s) => (
              <View
                key={s.key}
                className="gm-studio-bar-seg"
                style={`width:${totalMins ? ((alloc[s.key] || 0) / totalMins) * 100 : 0}%;background-color:${s.color}`}
              />
            ))}
          </View>

          {/** 五段切片：点 −/+ 调整（Web 是滑块；小程序给等价的加减，步长 1 分钟） */}
          <View className="gm-studio-slices">
            {SLICES.map((s) => (
              <View key={s.key} className="gm-studio-slice" style={`border-color:${s.color}55`}>
                <Text className="gm-studio-slice-label" style={`color:${s.color}`}>
                  {s.label}
                </Text>
                <Text className="gm-studio-slice-value">{alloc[s.key]} min</Text>
                <View className="gm-studio-slice-btns">
                  <Text className="gm-studio-slice-btn" onClick={() => bumpSlice(s.key, -1)}>
                    −
                  </Text>
                  <Text className="gm-studio-slice-btn" onClick={() => bumpSlice(s.key, 1)}>
                    ＋
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
