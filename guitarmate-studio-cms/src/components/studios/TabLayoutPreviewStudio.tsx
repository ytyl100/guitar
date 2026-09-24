import React, { useMemo, useState } from 'react';
import { Music4, Ruler, Hand, ListMusic, Info } from 'lucide-react';
import { StandardTabSystemRenderer } from '../review/StandardTabSystemRenderer';
import { buildStandardTabSystemLayout } from '../review/standardTabLayout';
import {
  CANON_IN_D_BPM,
  CANON_IN_D_MEASURES,
  CANON_IN_D_MEASURE_SEC,
  CANON_IN_D_TIME_SIGNATURE,
  chunkCanonMeasures,
} from '../../data/canonInD';

/**
 * 六线谱排版预览工作台（Tab Layout Preview）
 * =========================================
 *
 * 把 `src/data/canonInD.ts` 的**卡农前 16 小节**按「一行 2-3 小节」铺开，
 * 用来肉眼验收排版规则 —— 排版引擎是纯函数，回归断言在
 * `npm run verify:tab-layout` 里；这个页面负责看**观感**：
 *
 * 1. **把位优先**：每小节左上角「N 把位」（阿拉伯数字），小节内换把再补小号标记；
 * 2. **推荐和弦**：每小节弦线上方的和弦名（D / A / Bm / F#m / G …）；
 * 3. **品位数字**：弦线上的数字是**品位**（复核纠错可切回手指号）；
 * 4. **节奏线**：弦线下方一整行 —— 符干 + 连接符（8 分 1 条 / 16 分 2 条）+ 拍点。
 *
 * 数据源与渲染器都来自正式模块（不是页面内造的数据），所以这里看到的
 * 就是复核工作台与小程序端会看到的谱面。
 */

/** 标准调弦（索引 0 = 一弦 / 高音 E） */
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];

type PerSystem = 1 | 2 | 3;

export const TabLayoutPreviewStudio: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const [perSystem, setPerSystem] = useState<PerSystem>(2);
  const [noteLabel, setNoteLabel] = useState<'fret' | 'finger'>('fret');
  /** 手指上标默认关闭：谱面上只留「把位 + 品位」，与参考练习谱一致 */
  const [showFinger, setShowFinger] = useState(false);

  const systems = useMemo(() => chunkCanonMeasures(perSystem), [perSystem]);

  const surface = darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200';
  const subtle = darkMode ? 'bg-slate-800/50 text-slate-300' : 'bg-slate-100 text-slate-700';
  const titleColor = darkMode ? 'text-slate-100' : 'text-slate-900';
  const dim = darkMode ? 'text-slate-400' : 'text-slate-500';

  /** 汇总：把位分布 / 和弦走向 / 节奏线数量（纯函数输出，顺手当数据自检） */
  const summary = useMemo(() => {
    const positions = Array.from(new Set(CANON_IN_D_MEASURES.map((m) => m.position))).sort((a, b) => a - b);
    const chords = CANON_IN_D_MEASURES.map((m) => m.chord);
    const noteCount = CANON_IN_D_MEASURES.reduce((sum, m) => sum + m.notes.length, 0);
    /** 把 16 小节全部过一遍排版引擎，统计节奏线 —— 与页面渲染走的是同一条路径 */
    const layouts = chunkCanonMeasures(2).map((group) =>
      buildStandardTabSystemLayout({
        measures: group.map((m) => ({
          index: m.index,
          notes: m.notes,
          chord: m.chord,
          position: m.position,
          duration: m.duration,
        })),
        bpm: CANON_IN_D_BPM,
        timeSignature: CANON_IN_D_TIME_SIGNATURE,
        tuning: STANDARD_TUNING,
        width: 1080,
        height: 168,
        showClef: true,
      }),
    );
    return {
      positions,
      chords,
      noteCount,
      stems: layouts.reduce((sum, l) => sum + l.stems.length, 0),
      beams: layouts.reduce((sum, l) => sum + l.beams.length, 0),
      strums: layouts.reduce((sum, l) => sum + l.strums.length, 0),
      measureCount: CANON_IN_D_MEASURES.length,
    };
  }, []);

  const chipBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
      active
        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
        : darkMode
          ? 'border-slate-700 text-slate-400 hover:border-slate-500'
          : 'border-slate-300 text-slate-600 hover:border-slate-400'
    }`;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── 头部 ── */}
      <header className={`px-6 py-4 border-b shrink-0 ${surface}`}>
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-amber-400" />
          <h1 className={`text-base font-bold ${titleColor}`}>六线谱排版预览 · 卡农前 16 小节</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            把位优先
          </span>
        </div>
        <p className={`mt-1 text-[11px] ${dim}`}>
          数据源 <code>src/data/canonInD.ts</code>（公有领域 Pachelbel 和声骨架 + 自编琶音织体）·
          {` ♩ = ${CANON_IN_D_BPM} · ${CANON_IN_D_TIME_SIGNATURE} · 一小节 ${CANON_IN_D_MEASURE_SEC}s · `}
          与复核工作台、小程序端共用同一套排版引擎。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Ruler size={13} className={dim} />
            <span className={`text-[11px] ${dim}`}>每行小节数</span>
            {([1, 2, 3] as PerSystem[]).map((n) => (
              <button key={n} type="button" className={chipBtn(perSystem === n)} onClick={() => setPerSystem(n)}>
                {n} 小节
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Hand size={13} className={dim} />
            <span className={`text-[11px] ${dim}`}>弦线数字</span>
            <button type="button" className={chipBtn(noteLabel === 'fret')} onClick={() => setNoteLabel('fret')}>
              品位（默认）
            </button>
            <button type="button" className={chipBtn(noteLabel === 'finger')} onClick={() => setNoteLabel('finger')}>
              手指号（复核）
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Hand size={13} className={dim} />
            <span className={`text-[11px] ${dim}`}>手指上标</span>
            <button type="button" className={chipBtn(showFinger)} onClick={() => setShowFinger((v) => !v)}>
              {showFinger ? '显示 1/2/3/4' : '隐藏（推荐）'}
            </button>
          </div>
        </div>
      </header>

      {/* ── 谱面 ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* 数据摘要 */}
        <div className={`rounded-2xl border px-4 py-3 ${surface}`}>
          <div className="flex items-center gap-2 mb-2">
            <Info size={13} className="text-sky-400" />
            <span className={`text-xs font-semibold ${titleColor}`}>本节测试数据覆盖的渲染要点</span>
          </div>
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono ${dim}`}>
            <div>
              小节 {summary.measureCount} · 音符 {summary.noteCount}
            </div>
            <div>
              把位 {summary.positions.map((p) => `${p}`).join(' / ')}（换把 {summary.positions.length - 1} 次）
            </div>
            <div>
              节奏线 符干 {summary.stems} · 连接符 {summary.beams}
            </div>
            <div>
              扫弦箭头 {summary.strums}（第 16 小节 6 音和弦收尾）
            </div>
          </div>
          <div className={`mt-2 text-[11px] ${dim}`}>
            和弦走向：{summary.chords.join(' → ')}
          </div>
        </div>

        {/* 谱行列表 */}
        {systems.map((group, i) => {
          const first = group[0]?.index ?? 0;
          const last = group[group.length - 1]?.index ?? 0;
          return (
            <section key={first} className={`rounded-2xl border overflow-hidden ${surface}`}>
              <header className={`flex items-center justify-between px-4 py-2 ${subtle}`}>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Music4 size={13} className="text-amber-400" />
                  编辑段落 {i + 1}
                  <span className={`text-[10px] font-normal ${dim}`}>
                    第 {first}
                    {last !== first ? `–${last}` : ''} 小节 · {group.length} 小节/行
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {group.map((m) => (
                    <span
                      key={m.index}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300"
                      title={`推荐和弦 ${m.chord} · ${m.position} 把位`}
                    >
                      {m.chord} · {m.position}把位
                    </span>
                  ))}
                </div>
              </header>
              <div className="px-4 py-3">
                <StandardTabSystemRenderer
                  measures={group.map((m) => ({
                    index: m.index,
                    label: `第 ${m.index} 小节`,
                    notes: m.notes,
                    chord: m.chord,
                    position: m.position,
                    duration: m.duration,
                  }))}
                  bpm={CANON_IN_D_BPM}
                  timeSignature={CANON_IN_D_TIME_SIGNATURE}
                  tuning={STANDARD_TUNING}
                  measureDuration={CANON_IN_D_MEASURE_SEC}
                  isDark={darkMode}
                  showClef
                  showTempo={i === 0}
                  isLastSystem={i === systems.length - 1}
                  noteLabel={noteLabel}
                  showFinger={showFinger}
                  showConfidence={false}
                />
              </div>
            </section>
          );
        })}

        {/* 逐步位数据表（人工核对用） */}
        <div className={`rounded-2xl border overflow-hidden ${surface}`}>
          <header className={`px-4 py-2 text-xs font-semibold ${subtle} ${titleColor}`}>
            小节数据表（推荐和弦 / 把位 / 织体）
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className={dim}>
                <tr>
                  {['小节', '推荐和弦', '把位', '音符数', '节奏', '音型（弦/品）'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={dim}>
                {CANON_IN_D_MEASURES.map((m) => {
                  const levels = new Set(m.notes.map((n) => n.durationSec.toFixed(4)));
                  const rhythm =
                    levels.size === 1
                      ? `8 分音符 × ${m.notes.length}`
                      : `${levels.size} 种时值（含 16 分）`;
                  return (
                    <tr key={m.index} className={darkMode ? 'border-t border-slate-800' : 'border-t border-slate-200'}>
                      <td className="px-4 py-1.5">{m.index}</td>
                      <td className="px-4 py-1.5 text-amber-400">{m.chord}</td>
                      <td className="px-4 py-1.5">{m.position}</td>
                      <td className="px-4 py-1.5">{m.notes.length}</td>
                      <td className="px-4 py-1.5">{rhythm}</td>
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        {m.notes
                          .slice(0, 8)
                          .map((n) => `${n.string}/${n.fret}`)
                          .join(' ')}
                        {m.notes.length > 8 ? ' …' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabLayoutPreviewStudio;
