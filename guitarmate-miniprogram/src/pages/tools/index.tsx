import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHORD_TYPES,
  FLAT_ROOTS,
  FINGER_COLORS,
  SHARP_ROOTS,
  getChordPositions,
  type ChordPosition,
  type ChordType,
} from '../../utils/chordLibraryData';
import { fetchStrumUrl, resolveUrl } from '../../services/api';
import { pageClass } from '../../utils/settings';
import ChordFretboard from '../../components/ChordFretboard';
import BottomNav from '../../components/BottomNav';

/**
 * 和弦库（「Tools 工具」tab）
 * ==========================
 *
 * 逐块对齐 Web 版 `guitarmate-frontend/src/components/ChordLibraryTab.tsx`：
 *
 * ```
 * 1. 顶部        ♭/♯ 记号切换（Web 那行还有返回键+标题，小程序由原生导航栏承担）
 * 2. 根音行      横向滚动，选中项放大加粗变白
 * 3. 和弦类型行  横向滚动（maj / m / 7 / sus4 …）
 * 4. 指法图      标题 + 和弦图（左右滑动换把位、点弦试听）
 * 5. 底部条      🔊 扫弦试听 · 把位圆点 · ✋ 指法颜色对照
 * ```
 *
 * ## 两处平台差异（都不是设计漂移）
 * 1. **和弦图不用 SVG**：小程序不支持 WXML 里的 `<svg>` → 用绝对定位的 View 重画，
 *    几何数值与原 SVG 逐值一致（见 `ChordFretboard.tsx` 注释）。
 * 2. **试听走后端合成**：小程序没有 Web Audio（`InnerAudioContext` 只能播文件）→
 *    调 `GET /api/audio/strum` 让后端合成 WAV（后端本来就有拨弦合成器）。
 *    ⚠️ 代价是**第一次点某个和弦要多一次网络往返**（本地几十毫秒，真机取决于服务器）；
 *    同一个和弦之后会命中同名文件 + 长缓存。这一点 Web 版是即时出声，无法完全对齐。
 */
export default function Tools() {
  const [isFlat, setIsFlat] = useState(false);
  /** 默认 E sus4（与 Web 版一致） */
  const [selectedRoot, setSelectedRoot] = useState('E');
  const [selectedType, setSelectedType] = useState<ChordType>('sus4');
  const [posIdx, setPosIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const rootsList = isFlat ? FLAT_ROOTS : SHARP_ROOTS;
  const positions = useMemo(
    () => getChordPositions(selectedRoot, selectedType),
    [selectedRoot, selectedType],
  );
  const currentPosition: ChordPosition | undefined = positions[posIdx] || positions[0];

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: 'Chord library' });
  });

  /** 换和弦后把位下标可能越界 → 回 0（对齐 Web 版的 useEffect） */
  useEffect(() => {
    if (posIdx >= positions.length) setPosIdx(0);
  }, [positions.length, posIdx]);

  /**
   * 复用一个 InnerAudioContext：**与练习播放器同一个理由** ——
   * iOS 只对「用户手势解锁过的那个实例」放行程序化播放，每次新建会出现「只有第一次有声音」。
   */
  const ctxRef = useRef<Taro.InnerAudioContext | null>(null);
  const ensureCtx = () => {
    if (!ctxRef.current) {
      const ctx = Taro.createInnerAudioContext();
      try {
        /** iOS 静音键下也要出声（练琴时手机常常是静音的） */
        ctx.obeyMuteSwitch = false;
      } catch {
        /* 平台不支持则忽略 */
      }
      ctxRef.current = ctx;
    }
    return ctxRef.current;
  };
  useEffect(
    () => () => {
      ctxRef.current?.destroy();
      ctxRef.current = null;
    },
    [],
  );

  /** 请后端合成后播放；`delayMs` = 35 为扫弦，0 为拨单弦 */
  const playFrets = async (frets: number[], delayMs: number) => {
    try {
      const url = await fetchStrumUrl(frets, delayMs);
      const ctx = ensureCtx();
      ctx.stop();
      ctx.src = resolveUrl(url);
      setIsPlaying(true);
      /** 只做按钮的一个短暂高亮（Web 版是 500ms 后复位） */
      setTimeout(() => setIsPlaying(false), 500);
      try {
        const ret = ctx.play() as unknown;
        if (ret && typeof (ret as Promise<void>).catch === 'function') {
          (ret as Promise<void>).catch(() => {
            /* H5 自动播放策略：忽略（真机无此限制） */
          });
        }
      } catch {
        /* 同上 */
      }
    } catch (err) {
      Taro.showToast({
        title: `试听失败：${err instanceof Error ? err.message : String(err)}`,
        icon: 'none',
      });
      setIsPlaying(false);
    }
  };

  /** 扫弦（第 6 弦 → 第 1 弦，每弦 35ms） */
  const playStrum = () => {
    if (!currentPosition) return;
    playFrets(currentPosition.frets, 35);
  };

  /** 拨单弦：其余弦全部置 -1（后端会跳过），间隔 0 */
  const playOneString = (strIdx: number, fret: number) => {
    if (fret < 0) return;
    const frets = [-1, -1, -1, -1, -1, -1];
    frets[strIdx] = fret;
    playFrets(frets, 0);
  };

  const shiftRoot = (toFlat: boolean) => {
    setIsFlat(toFlat);
    /** 换记号时把当前根音也翻译过去（C# ↔ Db），否则选中项会"凭空消失" */
    const from = toFlat ? SHARP_ROOTS : FLAT_ROOTS;
    const to = toFlat ? FLAT_ROOTS : SHARP_ROOTS;
    const idx = from.indexOf(selectedRoot);
    if (idx !== -1) setSelectedRoot(to[idx]);
  };

  return (
    <View className={pageClass('gm-tools-page')}>
      {/** ── 顶部：♭/♯ 记号切换（Web 版这一行还有返回键与标题，小程序由原生导航栏承担） ── */}
      <View className="gm-tools-head">
        <Text className="gm-meta">和弦指法库</Text>
        <View style="display:flex;align-items:center">
          <View
            className={`gm-accidental${!isFlat ? ' gm-accidental--on' : ''}`}
            onClick={() => shiftRoot(false)}
          >
            <Text>♯</Text>
          </View>
          <View
            className={`gm-accidental${isFlat ? ' gm-accidental--on' : ''}`}
            style="margin-left:8px"
            onClick={() => shiftRoot(true)}
          >
            <Text>♭</Text>
          </View>
        </View>
      </View>

      {/** ── 根音行（横向滚动） ── */}
      <View className="gm-picker-row">
        <ScrollView scrollX className="gm-picker-scroll">
          {rootsList.map((root) => (
            <Text
              key={root}
              className={`gm-root${selectedRoot === root ? ' gm-root--on' : ''}`}
              onClick={() => {
                setSelectedRoot(root);
                setPosIdx(0);
              }}
            >
              {root}
            </Text>
          ))}
        </ScrollView>
      </View>

      {/** ── 和弦类型行（横向滚动） ── */}
      <View className="gm-picker-row gm-picker-row--types">
        <ScrollView scrollX className="gm-picker-scroll">
          {CHORD_TYPES.map((type) => (
            <Text
              key={type}
              className={`gm-chordtype${selectedType === type ? ' gm-chordtype--on' : ''}`}
              onClick={() => {
                setSelectedType(type);
                setPosIdx(0);
              }}
            >
              {type}
            </Text>
          ))}
        </ScrollView>
      </View>

      {/** ── 指法图 ── */}
      <View className="gm-fb-area">
        <Text className="gm-fb-title">
          {currentPosition?.title || `${selectedRoot}${selectedType} 和弦指法`}
        </Text>
        {currentPosition && (
          <ChordFretboard
            position={currentPosition}
            onPlayString={playOneString}
            onSwipeLeft={() => setPosIdx((p) => (p < positions.length - 1 ? p + 1 : 0))}
            onSwipeRight={() => setPosIdx((p) => (p > 0 ? p - 1 : positions.length - 1))}
          />
        )}
      </View>

      {/** ── 底部条：扫弦试听 · 把位圆点 · 指法颜色对照 ── */}
      <View className="gm-tools-bar">
        <View className={`gm-sound-btn${isPlaying ? ' gm-sound-btn--on' : ''}`} onClick={playStrum}>
          <Text>🔊</Text>
        </View>

        <View style="display:flex;align-items:center">
          {positions.map((_, idx) => (
            <View
              key={`pos-dot-${idx}`}
              className={`gm-pos-dot${posIdx === idx ? ' gm-pos-dot--on' : ''}`}
              onClick={() => setPosIdx(idx)}
            />
          ))}
        </View>

        <View className="gm-hand-btn" onClick={() => setShowGuide(true)}>
          <Text>✋</Text>
        </View>
      </View>

      {/** ── 指法颜色对照表（点 ✋ 弹出） ── */}
      {showGuide && (
        <View className="gm-modal-mask" onClick={() => setShowGuide(false)}>
          <View className="gm-modal-card" onClick={(e) => e.stopPropagation()}>
            <View className="gm-modal-head">
              <Text className="gm-modal-title">✋ 指法颜色对照表</Text>
              <Text className="gm-modal-close" onClick={() => setShowGuide(false)}>
                ✕
              </Text>
            </View>
            <View style="margin-top:24px">
              {[1, 2, 3, 4].map((finger) => {
                const cfg = FINGER_COLORS[finger];
                return (
                  <View key={finger} className="gm-finger-row">
                    <View style="display:flex;align-items:center">
                      <View
                        className="gm-finger-dot"
                        style={`background-color:${cfg.bg}`}
                      >
                        <Text>{cfg.label}</Text>
                      </View>
                      <Text className="gm-finger-name">{cfg.name}</Text>
                    </View>
                    <Text className="gm-finger-color" style={`color:${cfg.border}`}>
                      {['橙色', '粉色', '蓝色', '珊瑚橙'][finger - 1]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      <BottomNav active="tools" />
    </View>
  );
}
