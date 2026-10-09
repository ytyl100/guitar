import { ScrollView, Text, Video, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScoreData, ScoreMeasure, ScoreNote } from '../services/api';
import { CARD_PAD, PAGE_PAD, useWindowWidth } from '../hooks/useWindowWidth';

/**
 * 曲库曲谱的练习视图（**客户端渲染，单行行进**）
 * ==============================================
 *
 * ## 严格对齐 `play.png`（guitar-ai-audio 手机模式）：
 * 1. 【乐谱卡片】：
 *    - 纯白质感卡片 (`bg-white`)，浅灰蓝五线谱 + 六线谱细线；
 *    - 顶端小节号与和弦名；
 *    - 贯通五线谱与六线谱的青色播放光标（上下带亮环发光端点）；
 *    - 彻底隐藏原生系统滚动条（无任何白色横条遮挡！）；
 *    - 纵向留足底部安全高度（MEASURE_H = 240px），确保最低弦 E2 处的数字完好显示不被切！
 * 2. 【指板琴把】：
 *    - 支持「展开/收起琴把」切换；
 *    - 经典深色红木木纹背景 (`#26150d`)，白色 Nut 枕木，黄铜琴弦；
 *    - 品位标号 1..7（第 3、5、7 品格中带有真实珍珠母镶嵌圆点 Inlay dot）；
 *    - 左侧弦名 E4, B3, G3, D3, A2, E2，与上方六线谱 100% 同序！
 * 3. 【播放控制栏】：
 *    - **独立固定在底部主菜单（BottomNav）的上方**，占据专属视觉空间；
 *    - 墨绿色底条 (`bg-[#124d40]`)，shadow-2xl；
 *    - 包含：`[Transcribed][Original]` 药丸切换、`↺` 重置回开头、
 *      **大白圆核心播放键 `▶` / `❚❚`**、`‹ Bar n/12 ▾ ›` 步进器、`1x` 速度循环切换器。
 */

/* ── 谱面几何常量（CSS px）────────────────────────────────────── */
const MEASURE_H = 240;
/** 五线谱位置 */
const STAFF_TOP = 28;
const STAFF_LINE_GAP = 14;
const STAFF_H = STAFF_LINE_GAP * 4;
const STAFF_MID_Y = STAFF_TOP + STAFF_LINE_GAP * 2; // 中线 B4
const STEP_PX = 3.5;
const NOTE_CLAMP: [number, number] = [STAFF_TOP + 4, STAFF_TOP + STAFF_H + 4];

/** 六线谱位置 */
const TAB_TOP = 136;
const TAB_STRING_GAP = 15;
const TAB_H = TAB_STRING_GAP * 5;

/** 横向音符范围带：小节宽度的 8% ~ 92% */
const X_BAND_START = 8;
const X_BAND_SPAN = 84;
/** 左侧弦名槽宽度 */
const GUTTER = 26;

/** 弦名（1 弦 → 6 弦）—— 谱面与指板完全共享 */
const STRING_LABELS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER_INDEX = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

function beatsPerMeasureOf(timeSignature?: string): number {
  const m = (timeSignature || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? Number(m[1]) || 4 : 4;
}

/** 全音阶级数（对齐 guitar-ai-audio 的 getStaffDiatonicStep） */
function staffDiatonicStep(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return (octave - 4) * 7 + LETTER_INDEX[pc];
}

function noteNameOf(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function midiFromNoteName(name?: string): number | null {
  const m = (name || '').trim().match(/^([A-Ga-g])([#b]?)(-?\d+)?$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = m[3] === undefined ? 3 : Number(m[3]);
  const semitone = NOTE_NAMES.indexOf(letter);
  return semitone === -1 ? null : semitone + accidental + (octave + 1) * 12;
}

function midiOf(string: number, fret: number, tuning: string[]): number | null {
  const base = midiFromNoteName(tuning?.[string - 1]);
  return base === null ? null : base + (fret || 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function ScorePractice({ score }: { score: ScoreData }) {
  const winW = useWindowWidth();

  /** 实测卡片内部宽度 */
  const [innerW, setInnerW] = useState(0);
  useEffect(() => {
    const q = Taro.createSelectorQuery();
    q.select('#gm-score-probe')
      .boundingClientRect((rect) => {
        const w = rect && 'width' in rect ? Number(rect.width) : 0;
        if (w > 0) setInnerW(Math.round(w));
      })
      .exec();
  }, [winW, score.id]);

  const cardW = innerW > 0 ? innerW : Math.max(240, winW - PAGE_PAD * 2 - CARD_PAD * 2);
  const viewW = Math.max(180, cardW - GUTTER);
  /** 每个小节宽度：保持手机模式约 1.2 个小节在一屏视野内 */
  const measureW = clamp(viewW * 0.82, 220, 320);

  const measures: ScoreMeasure[] = useMemo(() => score.measures || [], [score.measures]);
  const beatsPerMeasure = useMemo(
    () => beatsPerMeasureOf(score.timeSignature),
    [score.timeSignature],
  );

  const [tempo, setTempo] = useState(score.tempo || 104);
  useEffect(() => setTempo(score.tempo || 104), [score.tempo]);

  const [playing, setPlaying] = useState(false);
  const [beatPos, setBeatPos] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  /** 音轨切换（参考 play.png 的 Transcribed / Original） */
  const [audioTrack, setAudioTrack] = useState<'transcribed' | 'original'>('transcribed');

  /** 速度倍率切换：0.75x, 1x, 1.25x */
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25];
    const idx = speeds.indexOf(speedMultiplier);
    setSpeedMultiplier(speeds[(idx + 1) % speeds.length]);
  };

  /** 琴把折叠状态：默认展开 */
  const [isFretboardOpen, setIsFretboardOpen] = useState(true);

  const startAtRef = useRef(0);
  const offsetRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalBeats = measures.length * beatsPerMeasure;
  const currentTempo = Math.round(tempo * speedMultiplier);

  /** 播放定时器驱动光标平滑推进 */
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    startAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const beat =
        offsetRef.current + (Date.now() - startAtRef.current) / (60000 / Math.max(20, currentTempo));
      if (beat >= totalBeats) {
        offsetRef.current = 0;
        setBeatPos(0);
        setPlaying(false);
        return;
      }
      setBeatPos(beat);
    }, 45);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, currentTempo, totalBeats]);

  const toggle = () => {
    if (playing) {
      offsetRef.current = beatPos;
      setPlaying(false);
      return;
    }
    offsetRef.current = beatPos >= totalBeats ? 0 : beatPos;
    setPlaying(true);
  };

  const jumpToMeasure = useCallback(
    (idx: number) => {
      const clamped = clamp(idx, 0, Math.max(0, measures.length - 1));
      const target = clamped * beatsPerMeasure;
      offsetRef.current = target;
      setBeatPos(target);
    },
    [beatsPerMeasure, measures.length],
  );

  const backToStart = useCallback(() => {
    offsetRef.current = 0;
    setBeatPos(0);
  }, []);

  const currentMeasureIdx = clamp(
    Math.floor(beatPos / beatsPerMeasure),
    0,
    Math.max(0, measures.length - 1),
  );
  const beatInMeasure = beatPos - currentMeasureIdx * beatsPerMeasure;

  /** 小节变更时自动将活动小节平滑滚动到中央视野 */
  useEffect(() => {
    const center = currentMeasureIdx * measureW - Math.max(0, (viewW - measureW) / 2);
    setScrollLeft(Math.max(0, center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeasureIdx, measureW, viewW]);

  /** 当前光标所在音符 */
  const activeNote: ScoreNote | null = useMemo(() => {
    const m = measures[currentMeasureIdx];
    if (!m?.notes?.length) return null;
    let hit: ScoreNote | null = null;
    m.notes.forEach((n) => {
      if ((n.beat || 0) <= beatInMeasure + 1e-6) hit = n;
    });
    return hit || m.notes[0];
  }, [measures, currentMeasureIdx, beatInMeasure]);

  /** 弹出小节选择器 */
  const pickMeasure = async () => {
    if (measures.length <= 1) return;
    try {
      const res = await Taro.showActionSheet({
        itemList: measures.map((_, i) => `Bar ${i + 1} (${measures[i]?.chord?.name || '—'})`),
      });
      jumpToMeasure(res.tapIndex);
    } catch {
      /* 取消 */
    }
  };

  /* ══ 单个小节（纯白底纸张质感，对齐 play.png）═════════════════════ */
  const xPercent = (beat: number) => X_BAND_START + ((beat || 0) / beatsPerMeasure) * X_BAND_SPAN;

  const renderMeasure = (m: ScoreMeasure, idx: number) => {
    const isActive = idx === currentMeasureIdx;
    const notes = m.notes || [];

    return (
      <View
        key={m.id || `m-${idx}`}
        className="relative bg-white"
        style={`width:${measureW}px;height:${MEASURE_H}px;flex-shrink:0;border-right:1px solid #cbd5e1;${
          isActive ? 'background:#f0fdfa;' : ''
        }`}
      >
        {/** 小节号与和弦标头 */}
        <View className="absolute left-2 top-1.5 flex items-center gap-1.5 z-20">
          <Text className="font-sans text-[11px] font-bold text-slate-400">
            {m.number ?? idx + 1}
          </Text>
          {!!m.chord?.name && (
            <Text className="font-sans text-[13px] font-black text-slate-900">
              {m.chord.name}
            </Text>
          )}
        </View>

        {/** 五线谱 5 条横线 (淡灰蓝 #cbd5e1) */}
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={`sl-${i}`}
            style={`position:absolute;left:0;top:${STAFF_TOP + i * STAFF_LINE_GAP}px;width:${measureW}px;height:1px;background:#cbd5e1;`}
          />
        ))}

        {/** 六线谱 6 条横线 (淡灰蓝 #cbd5e1) */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View
            key={`tl-${i}`}
            style={`position:absolute;left:0;top:${TAB_TOP + i * TAB_STRING_GAP}px;width:${measureW}px;height:1px;background:#cbd5e1;`}
          />
        ))}

        {/** 五线谱音符：黑色实体椭圆音符头 + 细长符干 */}
        {notes.map((n, ni) => {
          const midi = n.midi || midiOf(n.string, n.fret, score.tuning || []) || 60;
          const localY = STAFF_MID_Y - (staffDiatonicStep(midi) - 6) * STEP_PX;
          const y = clamp(localY, NOTE_CLAMP[0], NOTE_CLAMP[1]);
          const isNow = isActive && n === activeNote;
          const color = isNow ? '#0284c7' : '#0f172a';

          return (
            <View key={`sn-${n.id || ni}`}>
              {/* 椭圆音符头 */}
              <View
                style={`position:absolute;left:${xPercent(n.beat)}%;margin-left:-5px;top:${
                  y - 4
                }px;width:10px;height:8px;border-radius:50%;background:${color};transform:rotate(-20deg);z-index:10;`}
              />
              {/* 符干 */}
              <View
                style={`position:absolute;left:${xPercent(n.beat)}%;margin-left:4px;top:${
                  y - 20
                }px;width:1.2px;height:20px;background:${color};z-index:9;`}
              />
            </View>
          );
        })}

        {/** 六线谱品位数字：纯正黑色数字，白色遮挡小 chip */}
        {notes.map((n, ni) => {
          const y = TAB_TOP + (clamp(n.string, 1, 6) - 1) * TAB_STRING_GAP;
          const isNow = isActive && n === activeNote;
          return (
            <Text
              key={`tn-${n.id || ni}`}
              className="font-sans font-bold"
              style={`position:absolute;left:${xPercent(n.beat)}%;margin-left:-10px;top:${
                y - 8
              }px;width:20px;height:16px;line-height:16px;text-align:center;font-size:12px;color:${
                isNow ? '#0284c7' : '#0f172a'
              };background:#ffffff;z-index:15;`}
            >
              {n.isTied ? `(${n.fret})` : n.fret}
            </Text>
          );
        })}

        {/** 贯穿式青色高亮播放光标 (对齐 play.png) */}
        {isActive && (
          <View className="z-30 pointer-events-none">
            {/* 上部发光圆点 */}
            <View
              style={`position:absolute;left:${xPercent(
                beatInMeasure,
              )}%;margin-left:-5px;top:4px;width:10px;height:10px;border-radius:50%;background:#06b6d4;border:2px solid #ffffff;box-shadow:0 0 8px rgba(6,182,212,0.8);z-index:32;`}
            />
            {/* 贯通竖线 */}
            <View
              style={`position:absolute;left:${xPercent(
                beatInMeasure,
              )}%;margin-left:-1px;top:8px;width:2.5px;height:${
                MEASURE_H - 18
              }px;background:#06b6d4;box-shadow:0 0 6px rgba(6,182,212,0.6);z-index:30;`}
            />
            {/* 下部圆点 */}
            <View
              style={`position:absolute;left:${xPercent(
                beatInMeasure,
              )}%;margin-left:-4px;top:${
                MEASURE_H - 14
              }px;width:8px;height:8px;border-radius:50%;background:#06b6d4;border:1.5px solid #ffffff;z-index:32;`}
            />
          </View>
        )}
      </View>
    );
  };

  /* ══ 琴把指板（深棕红木纹，带 3/5/7 品镶嵌珍珠点，对齐 play.png）══ */
  const renderFretboard = () => {
    const currentString = activeNote?.string ?? 1;
    const currentFret = activeNote?.fret ?? 0;
    const fretCount = 7;
    const fromFret = currentFret > 7 ? currentFret - 3 : 1;
    const boardW = Math.max(160, cardW - GUTTER);
    const colW = boardW / fretCount;
    const boardH = TAB_STRING_GAP * 5;
    const dotX =
      currentFret === 0 ? GUTTER + 2 : GUTTER + (clamp(currentFret - fromFret, 0, fretCount - 1) + 0.5) * colW;
    const midi = midiOf(currentString, currentFret, score.tuning || []);

    return (
      <View className="mt-3 bg-[#18191c] rounded-2xl p-3 border border-zinc-800">
        {/* 顶部折叠标题行 */}
        <View className="flex items-center justify-between pb-2">
          <View className="flex items-center gap-1.5">
            <Text className="text-[13px] font-bold text-zinc-200">🎸 仿真指板</Text>
            {activeNote && (
              <Text className="text-[11px] text-zinc-400 font-mono">
                {currentFret === 0 ? '空弦' : `第 ${currentFret} 品`} · 第 {currentString} 弦
                {midi !== null ? ` (${noteNameOf(midi)})` : ''}
              </Text>
            )}
          </View>
          <View
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800/80 cursor-pointer"
            onClick={() => setIsFretboardOpen(!isFretboardOpen)}
          >
            <Text className="text-[10px] text-zinc-300">
              {isFretboardOpen ? '收起琴把 ▾' : '展开琴把 ▴'}
            </Text>
          </View>
        </View>

        {isFretboardOpen && (
          <View>
            {/* 品位号（3, 5, 7 品亮黄色标注，对齐 play.png） */}
            <View className="relative" style={`height:16px;width:${cardW}px`}>
              <Text
                className="font-mono"
                style={`position:absolute;left:0;top:0;width:${GUTTER}px;font-size:9px;color:#94a3b8;`}
              >
                Nut
              </Text>
              {Array.from({ length: fretCount }).map((_, i) => {
                const fNum = fromFret + i;
                const isDotFret = [3, 5, 7, 9, 12, 15].includes(fNum);
                return (
                  <Text
                    key={`fn-${i}`}
                    className="font-mono font-bold"
                    style={`position:absolute;left:${GUTTER + i * colW}px;top:0;width:${colW}px;text-align:center;font-size:9px;color:${
                      isDotFret ? '#f59e0b' : '#94a3b8'
                    };`}
                  >
                    {fNum}
                  </Text>
                );
              })}
            </View>

            {/* 指板本体 */}
            <View className="relative" style={`height:${boardH + 6}px;width:${cardW}px`}>
              {/* 红木木纹底板 */}
              <View
                style={`position:absolute;left:${GUTTER}px;top:0;width:${boardW}px;height:${boardH}px;background:#26150d;border-radius:4px;overflow:hidden;`}
              >
                {/* 3, 5, 7 品正中央的圆形珍珠母镶嵌标点 (Inlay Dots) */}
                {Array.from({ length: fretCount }).map((_, i) => {
                  const fNum = fromFret + i;
                  if (![3, 5, 7, 9, 15].includes(fNum)) return null;
                  return (
                    <View
                      key={`inlay-${fNum}`}
                      style={`position:absolute;left:${(i + 0.5) * colW - 4.5}px;top:${
                        boardH / 2 - 4.5
                      }px;width:9px;height:9px;border-radius:50%;background:#e2e8f0;opacity:0.65;box-shadow:inset 0 0 2px rgba(0,0,0,0.5);`}
                    />
                  );
                })}
              </View>

              {/* 左侧弦名胶囊 + 6 条黄铜色琴弦 */}
              {STRING_LABELS.map((label, i) => (
                <View key={`fs-${label}-${i}`}>
                  {/* 深灰胶囊弦名 */}
                  <View
                    style={`position:absolute;left:2px;top:${i * TAB_STRING_GAP - 5}px;width:${
                      GUTTER - 6
                    }px;height:12px;border-radius:3px;background:#1e293b;display:flex;align-items:center;justify-content:center;border:1px solid #334155;`}
                  >
                    <Text
                      className="font-mono font-bold"
                      style="font-size:8px;line-height:10px;color:#e2e8f0;"
                    >
                      {label}
                    </Text>
                  </View>
                  {/* 琴弦线 */}
                  <View
                    style={`position:absolute;left:${GUTTER}px;top:${i * TAB_STRING_GAP}px;width:${boardW}px;height:${
                      i >= 4 ? 2.2 : i >= 2 ? 1.6 : 1.2
                    }px;background:#d4a373;box-shadow:0 0.5px 1px rgba(0,0,0,0.4);`}
                  />
                </View>
              ))}

              {/* 金属品柱 (Nut 加粗银白色) */}
              {Array.from({ length: fretCount + 1 }).map((_, i) => (
                <View
                  key={`ff-${i}`}
                  style={`position:absolute;left:${GUTTER + i * colW}px;top:0;height:${boardH}px;width:${
                    i === 0 ? 4 : 1.5
                  }px;background:${i === 0 ? '#f8fafc' : '#78350f'};border-right:${
                    i === 0 ? '1px solid #cbd5e1' : 'none'
                  };`}
                />
              ))}

              {/* 当前按弦音点 (亮青蓝高光，带微阴影) */}
              {activeNote && (
                <View
                  style={`position:absolute;left:${dotX - 7}px;top:${
                    (clamp(currentString, 1, 6) - 1) * TAB_STRING_GAP - 7
                  }px;width:14px;height:14px;border-radius:50%;background:#06b6d4;border:2px solid #ffffff;box-shadow:0 0 10px rgba(6,182,212,0.9);z-index:25;`}
                />
              )}
            </View>

            {/* 底部辅助提示语 (对齐 play.png) */}
            <View className="flex items-center justify-between pt-2">
              <Text className="text-[10px] text-zinc-500 font-mono">
                String 1 (High E) ➔ String 6 (Low E)
              </Text>
              <Text className="text-[10px] text-zinc-500 italic">Touch fret to audition note</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  /* ══ 整体渲染 ═══════════════════════════════════════════════════ */
  return (
    <View className="mb-4">
      {/** 探针元素用于实测宽度 */}
      <View id="gm-score-probe" style="width:100%;height:0" />

      {/** ── 上部纯白乐谱卡片（对齐 play.png）── */}
      <View
        className="rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200"
        style={`padding:${CARD_PAD}px;`}
      >
        <View className="flex" style={`height:${MEASURE_H}px`}>
          {/** 左侧弦名栏（与指板严格对应） */}
          <View
            className="relative bg-slate-50 border-r border-slate-200 rounded-l-lg"
            style={`width:${GUTTER}px;height:${MEASURE_H}px;flex-shrink:0`}
          >
            {STRING_LABELS.map((label, i) => (
              <Text
                key={`gut-${label}-${i}`}
                className="font-mono font-bold text-center"
                style={`position:absolute;left:0;right:0;top:${
                  TAB_TOP + i * TAB_STRING_GAP - 5
                }px;font-size:9px;line-height:12px;color:#64748b;`}
              >
                {label}
              </Text>
            ))}
          </View>

          {/** 单行横向连续滚动小节区：彻底隐藏原生水平白横条！ */}
          <ScrollView
            scrollX
            scrollLeft={scrollLeft}
            showScrollbar={false}
            enhanced
            bounces={false}
            className="flex-1 min-w-0"
            style={`height:${MEASURE_H}px;background:#ffffff;scrollbar-width:none;-ms-overflow-style:none;overflow-y:hidden;`}
          >
            <View
              className="flex"
              style={`width:${measureW * Math.max(1, measures.length)}px;height:${MEASURE_H}px;`}
            >
              {measures.map((m, i) => renderMeasure(m, i))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/** ── 仿真琴把指板 ── */}
      {renderFretboard()}

      {/** ── 固定在底部导航栏（BottomNav）正上方的播放控制栏（对齐 play.png）── */}
      <View
        className="fixed left-0 right-0 z-40 bg-[#124d40] border-t border-[#0d3b32] shadow-2xl px-3 flex items-center justify-between select-none"
        style="bottom:calc(var(--gm-nav-h, 110rpx) + env(safe-area-inset-bottom));height:116rpx;"
      >
        {/* 左侧：Transcribed / Original 双轨药丸切换 */}
        <View className="flex items-center bg-[#0d3b32] p-0.5 rounded-lg border border-emerald-700/60 text-[10px]">
          <View
            onClick={() => setAudioTrack('transcribed')}
            className={`px-2 py-1 rounded transition-colors ${
              audioTrack === 'transcribed'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-emerald-300'
            }`}
          >
            <Text>Transcribed</Text>
          </View>
          <View
            onClick={() => setAudioTrack('original')}
            className={`px-2 py-1 rounded transition-colors ${
              audioTrack === 'original'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-emerald-300'
            }`}
          >
            <Text>Original</Text>
          </View>
        </View>

        {/* 核心播放动作组 */}
        <View className="flex items-center gap-2">
          {/* ↺ 回到开头按钮 */}
          <View
            className="w-8 h-8 rounded-full flex items-center justify-center text-emerald-200 active:scale-95 transition-transform"
            onClick={backToStart}
          >
            <Text className="text-[17px]">↺</Text>
          </View>

          {/* 大白圆播放按键 (带微阴影，对齐 play.png) */}
          <View
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            onClick={toggle}
          >
            <Text className="text-[16px] font-black text-[#124d40]">
              {playing ? '❚❚' : '▶'}
            </Text>
          </View>

          {/* 小节步进器 ‹ Bar 7/12 ▾ › */}
          <View className="flex items-center bg-[#0d3b32] px-1 py-1 rounded-lg border border-emerald-700/60 text-xs">
            <Text
              className="px-1 text-emerald-300 active:opacity-60 text-[13px]"
              onClick={() => jumpToMeasure(currentMeasureIdx - 1)}
            >
              ‹
            </Text>
            <View
              className="flex items-center gap-0.5 px-1 font-mono font-bold text-white text-[11px]"
              onClick={() => void pickMeasure()}
            >
              <Text>Bar {currentMeasureIdx + 1}</Text>
              <Text className="text-emerald-400 font-normal">/{measures.length}</Text>
              <Text className="text-[9px] text-emerald-400 ml-0.5">▾</Text>
            </View>
            <Text
              className="px-1 text-emerald-300 active:opacity-60 text-[13px]"
              onClick={() => jumpToMeasure(currentMeasureIdx + 1)}
            >
              ›
            </Text>
          </View>
        </View>

        {/* 右侧：速度倍率切换 (0.75x / 1x / 1.25x) */}
        <View
          onClick={cycleSpeed}
          className="px-2 py-1 rounded bg-[#0d3b32] border border-emerald-700/60 text-emerald-200 font-mono font-bold text-[11px] active:scale-95"
        >
          <Text>{speedMultiplier}x</Text>
        </View>
      </View>
    </View>
  );
}
