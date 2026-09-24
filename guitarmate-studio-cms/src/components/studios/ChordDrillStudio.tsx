import React, { useState } from 'react';
import {
  Layers,
  Volume2,
  Sliders,
  Sparkles,
  Zap,
  Mic,
  ChevronRight,
  TrendingUp,
  AlertOctagon,
  HelpCircle,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { ChordConfig, ChordPairConfig, LessonStep } from '../../types';
import { CHORD_LIBRARY } from '../../data/initialData';
import { audioEngine } from '../../utils/audioEngine';

interface ChordDrillStudioProps {
  lesson: LessonStep;
  onChangeLesson: (updated: LessonStep) => void;
  darkMode: boolean;
}

export const ChordDrillStudio: React.FC<ChordDrillStudioProps> = ({
  lesson,
  onChangeLesson,
  darkMode,
}) => {
  const [chords, setChords] = useState<Record<string, ChordConfig>>(CHORD_LIBRARY);
  const [selectedChordKey, setSelectedChordKey] = useState<string>('C');
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [drillRunning, setDrillRunning] = useState(false);
  const [currentTestBpm, setCurrentTestBpm] = useState<number>(40);

  const activeChord = chords[selectedChordKey] || chords['C'];
  const trainerData = lesson.trainerData;
  const activePair = trainerData.chordPairs[selectedPairIndex] || trainerData.chordPairs[0];

  // Strum active chord sound
  const handleStrumChord = () => {
    audioEngine.strumChord(activeChord.frets, activeChord.bassString, 'down');
  };

  // Toggle fret on interactive guitar fretboard
  // fretIndex: 0 (nut/open/mute), 1, 2, 3, 4, 5
  // stringIndex: 6 (Low E) to 1 (High E), mapped to array index 0..5
  const handleFretCellClick = (stringArrIdx: number, fretNum: number) => {
    const updatedFrets = [...activeChord.frets];
    const updatedFingers = [...activeChord.fingers];

    if (fretNum === 0) {
      // Toggle between open 'o' and mute 'x'
      updatedFrets[stringArrIdx] = updatedFrets[stringArrIdx] === 'o' ? 'x' : 'o';
      updatedFingers[stringArrIdx] = null;
    } else {
      if (updatedFrets[stringArrIdx] === fretNum) {
        // Clear back to open
        updatedFrets[stringArrIdx] = 'o';
        updatedFingers[stringArrIdx] = null;
      } else {
        updatedFrets[stringArrIdx] = fretNum;
        // Default finger heuristic
        const defaultFinger = Math.min(4, Math.max(1, fretNum));
        updatedFingers[stringArrIdx] = defaultFinger;
      }
    }

    const updatedChord: ChordConfig = {
      ...activeChord,
      frets: updatedFrets,
      fingers: updatedFingers,
    };

    setChords({
      ...chords,
      [selectedChordKey]: updatedChord,
    });
  };

  // Cycle finger assignment (1 -> 2 -> 3 -> 4 -> 1)
  const handleCycleFinger = (stringArrIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentFinger = activeChord.fingers[stringArrIdx];
    const nextFinger = currentFinger ? (currentFinger % 4) + 1 : 1;
    const updatedFingers = [...activeChord.fingers];
    updatedFingers[stringArrIdx] = nextFinger;

    const updatedChord: ChordConfig = {
      ...activeChord,
      fingers: updatedFingers,
    };

    setChords({
      ...chords,
      [selectedChordKey]: updatedChord,
    });
  };

  // Update Pitfalls or Tips in knowledge base
  const handleUpdatePitfall = (index: number, val: string) => {
    const updatedPitfalls = [...activeChord.pitfalls];
    updatedPitfalls[index] = val;
    setChords({
      ...chords,
      [selectedChordKey]: {
        ...activeChord,
        pitfalls: updatedPitfalls,
      },
    });
  };

  const handleUpdateTips = (val: string) => {
    setChords({
      ...chords,
      [selectedChordKey]: {
        ...activeChord,
        tips: val,
      },
    });
  };

  // Update Chord Pair BPM ladder
  const handleUpdatePair = (updated: Partial<ChordPairConfig>) => {
    const pairs = [...trainerData.chordPairs];
    pairs[selectedPairIndex] = {
      ...activePair,
      ...updated,
    };
    onChangeLesson({
      ...lesson,
      trainerData: {
        ...trainerData,
        chordPairs: pairs,
      },
    });
  };

  // Visual calculation of BPM ladder steps
  const ladderSteps = [];
  const startB = activePair.startBpm;
  const targetB = activePair.targetBpm;
  const stepB = activePair.stepBpm || 5;
  for (let b = startB; b <= targetB; b += stepB) {
    ladderSteps.push(b);
  }

  return (
    <div id="chord-drill-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner */}
      <div
        className={`px-6 py-3 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>和弦微练习与 BPM 阶梯配置器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Chord Drill & BPM Ladder
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              6 根琴弦手指分配录入、避坑防哑音指南录入、转换对 BPM 阶梯递进与 ±15 Cents 听音容差标定
            </p>
          </div>
        </div>

        {/* Global Sound Check & Tolerance Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>听音容差: ±{trainerData.toleranceCents} Cents</span>
          </div>

          <button
            id="btn-strum-chord"
            onClick={handleStrumChord}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
          >
            <Volume2 className="w-4 h-4" />
            <span>试听 {activeChord.name} 真实物理原声</span>
          </button>
        </div>
      </div>

      {/* Main Studio Viewport (Left: Fretboard & Knowledge Base 55%, Right: BPM Ladder Config 45%) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Interactive Fretboard & Finger Assignment */}
        <div className="w-7/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-r border-inherit space-y-5">
          {/* Chord Switcher Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {Object.keys(chords).map((chordKey) => {
              const isSelected = selectedChordKey === chordKey;
              return (
                <button
                  key={chordKey}
                  onClick={() => setSelectedChordKey(chordKey)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all border ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : darkMode
                      ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {chordKey} 和弦
                </button>
              );
            })}
          </div>

          {/* Interactive Guitar Fretboard (6 strings x 5 frets) */}
          <div
            className={`p-5 rounded-2xl border ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-emerald-400">
                  可视化品格与 6 根琴弦按弦手指分配器
                </span>
                <p className="text-[11px] text-slate-400">
                  点击品位设定按压点，点击圆圈切换手指 (1=食指, 2=中指, 3=无名指, 4=小指)
                </p>
              </div>

              {activeChord.barreFret && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  第 {activeChord.barreFret} 品大横按
                </span>
              )}
            </div>

            {/* Fretboard Graphic Simulation */}
            <div
              className={`p-4 rounded-xl border relative ${
                darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 text-slate-100 border-slate-700'
              }`}
            >
              {/* Nut (0 Fret) & Fret Column Headers */}
              <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-slate-400 mb-2">
                <div className="font-bold text-amber-400">空弦/静音</div>
                <div>琴枕 (Nut)</div>
                <div>1 品</div>
                <div>2 品</div>
                <div>3 品</div>
                <div>4 品</div>
                <div>5 品</div>
              </div>

              {/* 6 Strings Row */}
              <div className="space-y-3">
                {[
                  { name: '6弦 (低音E)', arrIdx: 0 },
                  { name: '5弦 (A)', arrIdx: 1 },
                  { name: '4弦 (D)', arrIdx: 2 },
                  { name: '3弦 (G)', arrIdx: 3 },
                  { name: '2弦 (B)', arrIdx: 4 },
                  { name: '1弦 (高音E)', arrIdx: 5 },
                ].map(({ name, arrIdx }) => {
                  const currentFretVal = activeChord.frets[arrIdx];
                  const currentFinger = activeChord.fingers[arrIdx];
                  const isBassString = activeChord.bassString === 6 - arrIdx;

                  return (
                    <div key={arrIdx} className="relative flex items-center">
                      {/* String label on left */}
                      <div className="w-20 text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                        <span>{name}</span>
                        {isBassString && (
                          <span className="text-[9px] px-1 rounded bg-amber-500 text-slate-950 font-black">
                            根音
                          </span>
                        )}
                      </div>

                      {/* 6 Grid cells: 0 (Open/Mute), 1, 2, 3, 4, 5 */}
                      <div className="flex-1 grid grid-cols-7 gap-1 relative items-center">
                        {/* String Line passing horizontally */}
                        <div
                          className="absolute left-0 right-0 h-[1.5px] bg-slate-600/80 -z-0"
                          style={{ height: `${Math.max(1, 3 - arrIdx * 0.4)}px` }}
                        />

                        {/* Cell 0: Open / Mute toggle */}
                        <button
                          onClick={() => handleFretCellClick(arrIdx, 0)}
                          className={`w-7 h-7 mx-auto rounded-full z-10 flex items-center justify-center font-mono text-xs font-bold border transition-colors ${
                            currentFretVal === 'x'
                              ? 'bg-rose-500/30 text-rose-400 border-rose-500'
                              : currentFretVal === 'o'
                              ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}
                        >
                          {currentFretVal === 'x' ? '×' : currentFretVal === 'o' ? '○' : '-'}
                        </button>

                        {/* Cells 1 to 5: Frets */}
                        {[1, 2, 3, 4, 5].map((fret) => {
                          const isPressed = currentFretVal === fret;
                          return (
                            <button
                              key={fret}
                              onClick={() => handleFretCellClick(arrIdx, fret)}
                              className={`w-7 h-7 mx-auto rounded-full z-10 flex items-center justify-center font-mono text-xs font-bold border transition-all ${
                                isPressed
                                  ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 shadow-md'
                                  : 'hover:bg-slate-800/80 text-transparent border-transparent'
                              }`}
                            >
                              {isPressed ? (
                                <span onClick={(e) => handleCycleFinger(arrIdx, e)}>
                                  {currentFinger ? `${currentFinger}指` : '按'}
                                </span>
                              ) : (
                                '+'
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pitfalls & Anti-Buzzing Knowledge Base Entry ("避坑指南与防哑音知识录入") */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" />
                <span>避坑指南与防哑音知识录入 (Anti-Buzz & Pitfall Knowledge)</span>
              </span>
              <span className="text-[11px] text-slate-400">
                录入数据直接同步注入学员端 AI 听音诊断卡
              </span>
            </div>

            {/* Anti-buzz core tip */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                防哑音发声要点 (Core Tone Guide)
              </label>
              <textarea
                rows={2}
                value={activeChord.tips}
                onChange={(e) => handleUpdateTips(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs leading-relaxed ${
                  darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>

            {/* Common Pitfalls List */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                常见错误动作与指关节塌陷避坑要点
              </label>
              <div className="space-y-2">
                {activeChord.pitfalls.map((pitfall, pIdx) => (
                  <div key={pIdx} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-rose-400 font-bold shrink-0">
                      坑 #{pIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={pitfall}
                      onChange={(e) => handleUpdatePitfall(pIdx, e.target.value)}
                      className={`flex-1 p-2 rounded-xl border text-xs ${
                        darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chord Pair Switching BPM Ladder Configurator */}
        <div className="w-5/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar space-y-5">
          {/* Card: Pair Switching Config */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                <span>转换对 (Pair Switching) 阶梯配置</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-300">
                {activePair.fromChord} ➔ {activePair.toChord}
              </span>
            </div>

            {/* Start BPM & Target BPM Slider Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">起始速度</span>
                  <span className="text-sm font-mono font-black text-amber-400">
                    {activePair.startBpm} BPM
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="80"
                  step="5"
                  value={activePair.startBpm}
                  onChange={(e) => handleUpdatePair({ startBpm: parseInt(e.target.value, 10) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">达标目标速度</span>
                  <span className="text-sm font-mono font-black text-emerald-400">
                    {activePair.targetBpm} BPM
                  </span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="120"
                  step="5"
                  value={activePair.targetBpm}
                  onChange={(e) => handleUpdatePair({ targetBpm: parseInt(e.target.value, 10) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Step Increment & Target Consecutive Bars */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">每次阶梯提速步长</label>
                <select
                  value={activePair.stepBpm || 5}
                  onChange={(e) => handleUpdatePair({ stepBpm: parseInt(e.target.value, 10) })}
                  className={`w-full p-2 rounded-xl border font-mono ${
                    darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <option value="3">+3 BPM (微阶梯平缓)</option>
                  <option value="5">+5 BPM (标准教学法)</option>
                  <option value="8">+8 BPM (激进爆发)</option>
                  <option value="10">+10 BPM (冲刺挑战)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">升级需连续准确小节数</label>
                <select
                  value={activePair.passBars || 8}
                  onChange={(e) => handleUpdatePair({ passBars: parseInt(e.target.value, 10) })}
                  className={`w-full p-2 rounded-xl border font-mono ${
                    darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <option value="4">4 小节 (速通)</option>
                  <option value="8">8 小节 (标准巩固)</option>
                  <option value="16">16 小节 (肌肉记忆极硬核)</option>
                </select>
              </div>
            </div>

            {/* Visual BPM Ladder Staircase */}
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                BPM 阶梯速度演进链 ({ladderSteps.length} 级阶梯):
              </span>
              <div className="flex items-end gap-1.5 h-20 p-2 rounded-xl border bg-slate-950 border-slate-800 overflow-x-auto custom-scrollbar">
                {ladderSteps.map((bpm, idx) => {
                  const heightPercent = ((bpm - 30) / 90) * 100;
                  const isCurrent = bpm === currentTestBpm;
                  return (
                    <div
                      key={bpm}
                      onClick={() => setCurrentTestBpm(bpm)}
                      className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                    >
                      <span className="text-[9px] font-mono text-slate-400 mb-1 group-hover:text-emerald-300">
                        {bpm}
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          isCurrent
                            ? 'bg-amber-400 shadow-md shadow-amber-400/50'
                            : 'bg-emerald-600/70 hover:bg-emerald-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card: Audio Microphone Tolerance Settings */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Mic className="w-4 h-4" />
                <span>麦克风听音容差与降噪门限标定</span>
              </span>
              <span className="text-xs font-mono font-bold text-cyan-400">
                ±{trainerData.toleranceCents} Cents
              </span>
            </div>

            {/* Tolerance Cents slider */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>音高判别容差范围 (Pitch Cents Tolerance)</span>
                <span className="font-mono text-slate-200">±{trainerData.toleranceCents} 音分</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={trainerData.toleranceCents}
                onChange={(e) =>
                  onChangeLesson({
                    ...lesson,
                    trainerData: {
                      ...trainerData,
                      toleranceCents: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>±5 (极度严苛 音乐学院标准)</span>
                <span>±15 (教研黄金基准)</span>
                <span>±30 (宽容新手)</span>
              </div>
            </div>

            {/* Noise Gate Slider */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>环境降噪门限 (Noise Gate Threshold)</span>
                <span className="font-mono text-slate-200">{trainerData.noiseGateDb} dB</span>
              </div>
              <input
                type="range"
                min="-60"
                max="-25"
                step="1"
                value={trainerData.noiseGateDb}
                onChange={(e) =>
                  onChangeLesson({
                    ...lesson,
                    trainerData: {
                      ...trainerData,
                      noiseGateDb: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>-60 dB (灵敏)</span>
                <span>-42 dB (室内常态)</span>
                <span>-25 dB (高噪环境过滤)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
