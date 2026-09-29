import { View, Text, type ITouchEvent } from '@tarojs/components';
import { useRef } from 'react';
import { FINGER_COLORS, type ChordPosition } from '../utils/chordLibraryData';

/**
 * 和弦指法图（View 版）
 * ====================
 *
 * ⚠️ **几何数值与 Web 版 `ChordFretboard.tsx` 逐值一致**（原文件是 SVG viewBox 0 0 260 330，
 * 页面里也正好按 260×330 px 显示，所以这些坐标可以**直接当 CSS px 用**，不需要换算）。
 * 差别只在于：小程序不支持 WXML 里的 `<svg>`，所以 `<rect>/<line>/<circle>/<text>`
 * 分别换成绝对定位的 `<View>`（矩形/细长条/圆角块）与 `<Text>`。
 *
 * 逐值对照表（左 = SVG 属性，右 = 这里怎么画）：
 * - 琴颈底块      x=52 y=52 w=184 h=258 rx=12 → 同样的 left/top/width/height/border-radius
 * - 品位数字      x=38(居中) y=基线         → left 24 / width 28 居中，top 用「基线 − 字号×0.6」近似
 * - 品丝横线      x1=56 → x2=232           → left 56 / width 176 / height 2~2.5
 * - 上弦枕        x=56 y=48 w=192 h=8      → 同值（白色圆角块）
 * - 六根弦线      x=64+32i, y=52→310       → 细长 View，越细的弦越细（3.2 → 1.2）
 * - o / x 标记    y=30                     → top 18（约等于基线 30 减字号）
 * - 大横按胶囊    w=20 h=20 rx=10          → height 20 / border-radius 10
 * - 实心指位点    r=14 光晕 + r=11.5 实心   → 28px / 23px 的圆（含 1.5px 描边）
 *
 * ⚠️⚠️ **几何一律写在行内 `style` 里**（class 上只留 `position:absolute`）。
 * 原因：`app.scss` 里的 `px` 会被 Taro 当成「设计 px」再缩放一半（详见项目单位规则），
 * 而这些数值**本身就是 CSS px**（原 SVG 的 viewBox 就是按 260×330 px 渲染的）——
 * 实测把它们写进 app.scss 后，琴颈与品丝被缩成一半、而行内定位的点/弦没缩 → **整图错位**
 * （表现为：弦线伸到琴颈外面、品位数字与格子对不上）。
 * 行内 `px` 不参与转换，所以这里全部内联 —— 一套坐标系、一个来源。
 */
export interface ChordFretboardProps {
  position: ChordPosition;
  /** 点某根弦试听（stringIdx: 0 = 第 6 弦；fret: -1 表示闷弦不可弹） */
  onPlayString?: (stringIdx: number, fret: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/** 布局常量（= 原 SVG 的 viewBox 常量，不要随意改，否则和 Web 版对不上） */
const SVG_W = 260;
const SVG_H = 330;
const TOP_MARKER_Y = 30;
const BOARD_TOP_Y = 52;
const BOARD_BOTTOM_Y = 310;
const BOARD_LEFT_X = 64;
const BOARD_RIGHT_X = 224;
const NUM_FRETS = 4;
const STRING_WIDTH = (BOARD_RIGHT_X - BOARD_LEFT_X) / 5; // 32
const FRET_HEIGHT = (BOARD_BOTTOM_Y - BOARD_TOP_Y) / NUM_FRETS; // 64.5
/** 0 = 第 6 弦（低音 E）… 5 = 第 1 弦（高音 E） */
const STRING_POSITIONS = [0, 1, 2, 3, 4, 5].map((i) => BOARD_LEFT_X + i * STRING_WIDTH);

export default function ChordFretboard({
  position,
  onPlayString,
  onSwipeLeft,
  onSwipeRight,
}: ChordFretboardProps) {
  const { frets, fingers, barres, baseFret } = position;
  const touchStartX = useRef<number | null>(null);

  /** 品位 → 该品丝格中心的 y；不在可视 4 格内返回 null */
  const fretCenterY = (fret: number): number | null => {
    const slotIdx = fret - baseFret;
    if (slotIdx < 0 || slotIdx >= NUM_FRETS) return null;
    return BOARD_TOP_Y + slotIdx * FRET_HEIGHT + FRET_HEIGHT / 2;
  };

  return (
    <View
      className="gm-fretboard"
      style={`width:${SVG_W}px;height:${SVG_H}px`}
      onTouchStart={(e) => {
        /** ⚠️ Taro 把 onTouchStart 的形参标成 `BaseEventOrig<any>`，要自己断言成 ITouchEvent 才能拿到 touches */
        const ev = e as unknown as ITouchEvent;
        touchStartX.current = Number(ev.touches?.[0]?.clientX ?? 0);
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const ev = e as unknown as ITouchEvent;
        const diffX = Number(ev.changedTouches?.[0]?.clientX ?? 0) - touchStartX.current;
        if (diffX > 40) onSwipeRight?.();
        else if (diffX < -40) onSwipeLeft?.();
        touchStartX.current = null;
      }}
    >
      {/** 1. 琴颈底块 */}
      <View
        className="gm-fb-abs"
        style={`left:${BOARD_LEFT_X - 12}px;top:${BOARD_TOP_Y}px;width:${BOARD_RIGHT_X - BOARD_LEFT_X + 24}px;height:${BOARD_BOTTOM_Y - BOARD_TOP_Y}px;border-radius:12px;background-color:#232730;border:1.5px solid #323742;box-sizing:border-box`}
      />

      {/** 2. 左侧品位数字（对齐每一格中心） */}
      {[0, 1, 2, 3].map((slotIdx) => (
        <Text
          key={`fret-num-${slotIdx}`}
          className="gm-fb-abs"
          style={`left:${BOARD_LEFT_X - 40}px;width:28px;text-align:center;font-size:14px;font-weight:600;color:#94a3b8;top:${BOARD_TOP_Y + slotIdx * FRET_HEIGHT + FRET_HEIGHT / 2 - 9}px`}
        >
          {baseFret + slotIdx}
        </Text>
      ))}

      {/** 3. 品丝横线（baseFret === 1 时最上面那条是上弦枕，单独画） */}
      {[0, 1, 2, 3, 4].map((idx) => {
        if (idx === 0 && baseFret === 1) return null;
        const y = BOARD_TOP_Y + idx * FRET_HEIGHT;
        const isFirst = idx === 0;
        const h = isFirst ? 2.5 : 2;
        return (
          <View
            key={`fret-line-${idx}`}
            className="gm-fb-abs"
            style={`left:${BOARD_LEFT_X - 8}px;width:${BOARD_RIGHT_X - BOARD_LEFT_X + 16}px;top:${y - h / 2}px;height:${h}px;background-color:${isFirst ? '#64748b' : '#3d4452'}`}
          />
        );
      })}

      {/** 4. 上弦枕（白色骨头，仅开放把位） */}
      {baseFret === 1 && (
        <View
          className="gm-fb-abs"
          style={`left:${BOARD_LEFT_X - 8}px;top:${BOARD_TOP_Y - 4}px;width:${BOARD_RIGHT_X - BOARD_LEFT_X + 16}px;height:8px;border-radius:4px;background-color:#f8fafc`}
        />
      )}

      {/** 5. 六根弦线（0 = 第 6 弦最粗） */}
      {STRING_POSITIONS.map((x, strIdx) => {
        const isMuted = frets[strIdx] === -1;
        const width = 3.2 - strIdx * 0.4;
        return (
          <View
            key={`string-${strIdx}`}
            className="gm-fb-abs"
            style={`left:${x - width / 2}px;top:${BOARD_TOP_Y}px;height:${BOARD_BOTTOM_Y - BOARD_TOP_Y}px;width:${width}px;border-radius:2px;background-color:${isMuted ? '#ef4444' : '#94a3b8'};opacity:${isMuted ? 0.75 : 0.85}`}
          />
        );
      })}

      {/** 6. 每根弦的点击热区（点一下试听这根弦） */}
      {STRING_POSITIONS.map((x, strIdx) => (
        <View
          key={`hit-${strIdx}`}
          className="gm-fb-abs"
          style={`left:${x - 14}px;top:${BOARD_TOP_Y}px;width:28px;height:${BOARD_BOTTOM_Y - BOARD_TOP_Y}px`}
          onClick={() => {
            if (frets[strIdx] >= 0) onPlayString?.(strIdx, frets[strIdx]);
          }}
        />
      ))}

      {/** 7. 上方的 x（闷弦）/ o（空弦）标记 */}
      {frets.map((fret, strIdx) => {
        if (fret !== -1 && fret !== 0) return null;
        return (
          <Text
            key={`top-marker-${strIdx}`}
            className="gm-fb-abs"
            style={`left:${STRING_POSITIONS[strIdx] - 12}px;top:${TOP_MARKER_Y - 15}px;width:24px;text-align:center;font-size:${fret === -1 ? 15 : 16}px;font-weight:${fret === -1 ? 700 : 600};color:${fret === -1 ? '#cbd5e1' : '#f8fafc'}`}
          >
            {fret === -1 ? 'x' : 'o'}
          </Text>
        );
      })}

      {/** 8. 大横按（长胶囊） */}
      {(barres || []).map((barre, bIdx) => {
        const centerY = fretCenterY(barre.fret);
        if (centerY === null) return null;
        const fromIdx = 6 - barre.fromString;
        const toIdx = 6 - barre.toString;
        const startX = STRING_POSITIONS[fromIdx] - 10;
        const endX = STRING_POSITIONS[toIdx] + 10;
        return (
          <View
            key={`barre-${bIdx}`}
            className="gm-fb-abs"
            style={`left:${startX}px;top:${centerY - 10}px;width:${endX - startX}px;height:20px;border-radius:10px;background-color:${FINGER_COLORS[barre.finger]?.bg || '#f59e0b'}`}
          />
        );
      })}

      {/** 9. 实心指位点（被同指横按盖住的不重复画） */}
      {frets.map((fret, strIdx) => {
        if (fret <= 0) return null;
        const centerY = fretCenterY(fret);
        if (centerY === null) return null;
        const finger = fingers[strIdx] || 1;
        const color = FINGER_COLORS[finger]?.bg || FINGER_COLORS[1].bg;
        const coveredByBarre = (barres || []).some(
          (b) =>
            b.fret === fret &&
            b.finger === finger &&
            strIdx >= 6 - b.fromString &&
            strIdx <= 6 - b.toString,
        );
        if (coveredByBarre) return null;
        const cx = STRING_POSITIONS[strIdx];
        return (
          <View key={`dot-${strIdx}`}>
            {/** 光晕 */}
            <View
              style={`position:absolute;left:${cx - 14}px;top:${centerY - 14}px;width:28px;height:28px;border-radius:999px;background-color:${color};opacity:0.3`}
            />
            {/** 实心点（点它也能试听该弦） */}
            <View
              style={`position:absolute;left:${cx - 11.5}px;top:${centerY - 11.5}px;width:23px;height:23px;border-radius:999px;background-color:${color};border:1.5px solid #18181b`}
              onClick={() => onPlayString?.(strIdx, fret)}
            />
          </View>
        );
      })}
    </View>
  );
}
