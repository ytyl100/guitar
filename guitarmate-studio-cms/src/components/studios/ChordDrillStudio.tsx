import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  Copy,
  Layers,
  Link2,
  ListChecks,
  Mic,
  Music4,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  TrendingUp,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { ChordConfig, ChordDrillStage, ChordGroup, ChordPairConfig, LessonStep } from '../../types';
import { countReferences, moveById, nextSequentialId, removeById, upsertById } from '../../utils/libraryOps';
import { createDrillStage, resolveStagesForPair } from '../../utils/curriculumOps';
import { audioEngine } from '../../utils/audioEngine';

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const DIFFICULTIES: ChordGroup['difficulty'][] = ['入门', '进阶', '挑战'];

/** 一个空白和弦模板（6 弦全开） */
function createEmptyChord(key: string): ChordConfig {
  return {
    id: `chord-${key.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    name: key,
    rootNote: key[0] || 'C',
    bassString: 6,
    frets: ['o', 'o', 'o', 'o', 'o', 'o'],
    fingers: [null, null, null, null, null, null],
    pitfalls: ['待填写：常见错误动作'],
    tips: '待填写：防哑音发声要点',
  };
}

export interface ChordDrillStudioProps {
  lesson: LessonStep;
  onChangeLesson: (updated: LessonStep) => void;
  darkMode: boolean;
  /** 和弦库（可在本页增删改） */
  chords: Record<string, ChordConfig>;
  onChangeChords: (next: Record<string, ChordConfig>) => void;
  /** 和弦练习组（一组和弦 + 多套 BPM 阶梯阶段） */
  chordGroups: ChordGroup[];
  onChangeChordGroups: (next: ChordGroup[]) => void;
  /** 删除和弦组时，从所有课时摘掉引用 */
  onDetachChordGroupFromLessons?: (groupId: string) => void;
  /** 课程体系里所有课时的「已关联和弦组 id」，用于删除前提示 */
  lessonOwners?: Array<{ name: string; ids: string[] }>;
  onGoToCurriculum?: () => void;
}

type RightTab = 'lesson' | 'groups';

export const ChordDrillStudio: React.FC<ChordDrillStudioProps> = ({
  lesson,
  onChangeLesson,
  darkMode,
  chords,
  onChangeChords,
  chordGroups,
  onChangeChordGroups,
  onDetachChordGroupFromLessons,
  lessonOwners = [],
  onGoToCurriculum,
}) => {
  const chordKeys = useMemo(() => Object.keys(chords), [chords]);
  const [selectedChordKey, setSelectedChordKey] = useState<string>(() => Object.keys(chords)[0] || 'C');
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [currentTestBpm, setCurrentTestBpm] = useState<number>(40);

  const [rightTab, setRightTab] = useState<RightTab>('lesson');
  const [isAddingChord, setIsAddingChord] = useState(false);
  const [newChordKey, setNewChordKey] = useState('');
  const [pendingDeleteChordKey, setPendingDeleteChordKey] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => chordGroups[0]?.id || '');
  const [stageTarget, setStageTarget] = useState<string>('group');
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);

  const trainerData = lesson.trainerData;
  const activeChord = chords[selectedChordKey] || chords[chordKeys[0]];
  const activePair: ChordPairConfig | undefined = trainerData.chordPairs[selectedPairIndex] || trainerData.chordPairs[0];

  const activeGroup = chordGroups.find((g) => g.id === selectedGroupId) || chordGroups[0] || null;
  const linkedGroupIds = lesson.chordGroupIds || [];

  // ─────────────────────────────────────────
  // 和弦库 CRUD
  // ─────────────────────────────────────────
  const writeChord = (key: string, chord: ChordConfig) => onChangeChords({ ...chords, [key]: chord });

  const handleAddChord = () => {
    const key = newChordKey.trim();
    if (!key) return;
    const safeKey = chords[key] ? nextSequentialId(key, chordKeys) : key;
    onChangeChords({ ...chords, [safeKey]: createEmptyChord(safeKey) });
    setSelectedChordKey(safeKey);
    setNewChordKey('');
    setIsAddingChord(false);
  };

  const handleDuplicateChord = () => {
    if (!activeChord) return;
    const copyKey = nextSequentialId(selectedChordKey, chordKeys);
    const copy: ChordConfig = {
      ...activeChord,
      id: `${activeChord.id}-copy-${Date.now().toString(36)}`,
      name: copyKey,
      frets: [...activeChord.frets],
      fingers: [...activeChord.fingers],
      pitfalls: [...activeChord.pitfalls],
    };
    onChangeChords({ ...chords, [copyKey]: copy });
    setSelectedChordKey(copyKey);
  };

  const chordUsage = (key: string) => chordGroups.filter((g) => g.chordKeys.includes(key));

  const handleDeleteChord = (key: string) => {
    if (chordUsage(key).length > 0) return;
    if (chordKeys.length <= 1) return;
    const next = { ...chords };
    delete next[key];
    onChangeChords(next);
    setSelectedChordKey(Object.keys(next)[0]);
    setPendingDeleteChordKey(null);
  };

  // ─────────────────────────────────────────
  // 和弦组的「当前阶段列表」定位
  // ─────────────────────────────────────────
  /** 可单独覆盖阶段的和弦对：成员的所有有序组合 */
  const pairOptions = useMemo(() => {
    if (!activeGroup) return [] as string[];
    const out: string[] = [];
    for (const from of activeGroup.chordKeys) {
      for (const to of activeGroup.chordKeys) {
        if (from !== to || activeGroup.chordKeys.length === 1) {
          if (from !== to) out.push(`${from}|${to}`);
        }
      }
    }
    return out;
  }, [activeGroup]);

  const resolvedStageTarget = stageTarget === 'group' || pairOptions.includes(stageTarget) ? stageTarget : 'group';
  const activeStages: ChordDrillStage[] =
    resolvedStageTarget === 'group'
      ? activeGroup?.stages || []
      : activeGroup?.pairStages?.[resolvedStageTarget] || [];
  const isOverrideTarget = resolvedStageTarget !== 'group';
  const [stageFrom, stageTo] =
    resolvedStageTarget === 'group'
      ? [activeGroup?.chordKeys[0] || '', activeGroup?.chordKeys[1] || '']
      : resolvedStageTarget.split('|');

  // ─────────────────────────────────────────
  // 和弦组 CRUD
  // ─────────────────────────────────────────
  const writeGroup = (group: ChordGroup) =>
    onChangeChordGroups(upsertById(chordGroups, { ...group, updatedAt: new Date().toISOString() }));

  const patchGroup = (patch: Partial<ChordGroup>) => {
    if (!activeGroup) return;
    writeGroup({ ...activeGroup, ...patch });
  };

  const handleAddGroup = () => {
    const now = new Date().toISOString();
    const created: ChordGroup = {
      id: nextSequentialId('group', chordGroups.map((g) => g.id)),
      name: '新和弦练习组',
      description: '待填写：这组和弦要解决的问题与适用曲目',
      chordKeys: activeChord ? [selectedChordKey] : [],
      difficulty: '入门',
      stages: [],
      createdAt: now,
      updatedAt: now,
    };
    onChangeChordGroups([...chordGroups, created]);
    setSelectedGroupId(created.id);
    setStageTarget('group');
  };

  const handleDuplicateGroup = () => {
    if (!activeGroup) return;
    const now = new Date().toISOString();
    const copy: ChordGroup = {
      ...activeGroup,
      id: nextSequentialId('group', chordGroups.map((g) => g.id)),
      name: `${activeGroup.name}（副本）`,
      stages: activeGroup.stages.map((s, i) => ({ ...s, id: `stage-copy-${Date.now().toString(36)}-${i}` })),
      pairStages: activeGroup.pairStages
        ? Object.fromEntries(
            Object.entries(activeGroup.pairStages).map(([pairKey, list]) => [
              pairKey,
              list.map((s, i) => ({ ...s, id: `stage-copy-${Date.now().toString(36)}-${pairKey}-${i}` })),
            ]),
          )
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
    onChangeChordGroups([...chordGroups, copy]);
    setSelectedGroupId(copy.id);
  };

  const confirmDeleteGroup = () => {
    if (!pendingDeleteGroupId) return;
    const next = removeById(chordGroups, pendingDeleteGroupId);
    onChangeChordGroups(next);
    onDetachChordGroupFromLessons?.(pendingDeleteGroupId);
    setSelectedGroupId(next[0]?.id || '');
    setPendingDeleteGroupId(null);
    setStageTarget('group');
  };

  const pendingGroup = chordGroups.find((g) => g.id === pendingDeleteGroupId) || null;
  const pendingGroupRefs = pendingDeleteGroupId ? countReferences(lessonOwners, pendingDeleteGroupId) : [];
  const pendingGroupRefTotal = pendingGroupRefs.reduce((sum, r) => sum + r.count, 0);

  // ─────────────────────────────────────────
  // 练习阶段列表 CRUD（组默认 / 单对覆盖）
  // ─────────────────────────────────────────
  const writeStages = (list: ChordDrillStage[]) => {
    if (!activeGroup) return;
    if (resolvedStageTarget === 'group') {
      patchGroup({ stages: list });
      return;
    }
    patchGroup({
      pairStages: { ...(activeGroup.pairStages || {}), [resolvedStageTarget]: list },
    });
  };

  const handleAddStage = () => {
    if (!activeGroup) return;
    const sorted = [...activeStages].sort((a, b) => a.order - b.order);
    const previous = sorted[sorted.length - 1];
    const created = createDrillStage(
      stageFrom || activeGroup.chordKeys[0] || '',
      stageTo || activeGroup.chordKeys[1] || '',
      sorted.length + 1,
      previous?.targetBpm,
    );
    writeStages([...activeStages, created]);
  };

  const handleUpdateStage = (id: string, patch: Partial<ChordDrillStage>) =>
    writeStages(activeStages.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleDeleteStage = (id: string) => {
    const next = activeStages
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, order: i + 1 }));
    writeStages(next);
  };

  const handleMoveStage = (id: string, delta: -1 | 1) => {
    const moved = moveById(activeStages, id, delta).map((s, i) => ({ ...s, order: i + 1 }));
    writeStages(moved);
  };

  const clearPairOverride = () => {
    if (!activeGroup?.pairStages || resolvedStageTarget === 'group') return;
    const nextPairStages = { ...activeGroup.pairStages };
    delete nextPairStages[resolvedStageTarget];
    patchGroup({ pairStages: Object.keys(nextPairStages).length ? nextPairStages : undefined });
    setStageTarget('group');
  };

  // ─────────────────────────────────────────
  // 品格编辑
  // ─────────────────────────────────────────
  const handleStrumChord = () => {
    if (!activeChord) return;
    audioEngine.strumChord(activeChord.frets, activeChord.bassString, 'down');
  };

  const handleFretCellClick = (stringArrIdx: number, fretNum: number) => {
    if (!activeChord) return;
    const updatedFrets = [...activeChord.frets];
    const updatedFingers = [...activeChord.fingers];

    if (fretNum === 0) {
      updatedFrets[stringArrIdx] = updatedFrets[stringArrIdx] === 'o' ? 'x' : 'o';
      updatedFingers[stringArrIdx] = null;
    } else if (updatedFrets[stringArrIdx] === fretNum) {
      updatedFrets[stringArrIdx] = 'o';
      updatedFingers[stringArrIdx] = null;
    } else {
      updatedFrets[stringArrIdx] = fretNum;
      updatedFingers[stringArrIdx] = Math.min(4, Math.max(1, fretNum));
    }

    writeChord(selectedChordKey, { ...activeChord, frets: updatedFrets, fingers: updatedFingers });
  };

  const handleCycleFinger = (stringArrIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeChord) return;
    const currentFinger = activeChord.fingers[stringArrIdx];
    const nextFinger = currentFinger ? (currentFinger % 4) + 1 : 1;
    const updatedFingers = [...activeChord.fingers];
    updatedFingers[stringArrIdx] = nextFinger;
    writeChord(selectedChordKey, { ...activeChord, fingers: updatedFingers });
  };

  const handleUpdatePitfall = (index: number, val: string) => {
    if (!activeChord) return;
    const updatedPitfalls = [...activeChord.pitfalls];
    updatedPitfalls[index] = val;
    writeChord(selectedChordKey, { ...activeChord, pitfalls: updatedPitfalls });
  };

  const handleAddPitfall = () => {
    if (!activeChord) return;
    writeChord(selectedChordKey, { ...activeChord, pitfalls: [...activeChord.pitfalls, '新增避坑要点'] });
  };

  const handleRemovePitfall = (index: number) => {
    if (!activeChord) return;
    writeChord(selectedChordKey, {
      ...activeChord,
      pitfalls: activeChord.pitfalls.filter((_, i) => i !== index),
    });
  };

  const handleUpdatePair = (updated: Partial<ChordPairConfig>) => {
    if (!activePair) return;
    const pairs = [...trainerData.chordPairs];
    pairs[selectedPairIndex] = { ...activePair, ...updated };
    onChangeLesson({ ...lesson, trainerData: { ...trainerData, chordPairs: pairs } });
  };

  const ladderSteps: number[] = [];
  if (activePair) {
    const step = activePair.stepBpm || 5;
    for (let b = activePair.startBpm; b <= activePair.targetBpm; b += step) ladderSteps.push(b);
  }

  // ── 样式 ──
  const cardClass = cn(
    'rounded-2xl border',
    darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
  );
  const fieldClass = cn(
    'w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none focus:ring-1 focus:ring-emerald-500/60',
    darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800',
  );
  const subtleBtn = cn(
    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1',
    darkMode
      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  );
  const primaryBtn =
    'px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition-colors';

  return (
    <div id="chord-drill-studio" className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* 顶部横幅 */}
      <div
        className={cn(
          'px-6 py-3 border-b flex items-center justify-between shrink-0 gap-4',
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <span>和弦微测 与 BPM 阶梯配置器</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Chord Library + Practice Stages
              </span>
            </h2>
            <p className="text-xs text-slate-400 truncate">
              和弦库增删改 · 和弦练习组增删改 · 每个和弦组合的 BPM 阶梯阶段可增删改查 · 课时多对多关联
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>听音容差: ±{trainerData.toleranceCents} Cents</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono border border-slate-700 bg-slate-800/60 text-slate-300">
            <Music4 className="w-3.5 h-3.5 text-amber-400" />
            <span>
              和弦库 {chordKeys.length} · 练习组 {chordGroups.length} · 本课时关联 {linkedGroupIds.length}
            </span>
          </div>
          <button type="button" onClick={handleStrumChord} className={primaryBtn} id="btn-strum-chord">
            <Volume2 className="w-4 h-4" />
            <span>试听 {activeChord?.name || '和弦'} 原声</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左：和弦库 + 品格 + 避坑知识 */}
        <div className="w-7/12 p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar border-r border-inherit space-y-5">
          {/* 和弦库工具条 */}
          <div className={cn(cardClass, 'p-3')}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold flex items-center gap-1.5 mr-1">
                <Music4 className="w-3.5 h-3.5 text-amber-400" />
                和弦库
              </span>
              {chordKeys.map((key) => {
                const isSelected = selectedChordKey === key;
                const usages = chordUsage(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedChordKey(key)}
                    title={usages.length ? `被 ${usages.length} 个练习组引用` : '未被引用'}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold font-mono border transition-all flex items-center gap-1',
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                        : darkMode
                        ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
                    )}
                  >
                    {key}
                    {usages.length > 0 && (
                      <span className="text-[9px] px-1 rounded bg-black/25">{usages.length}</span>
                    )}
                  </button>
                );
              })}

              {isAddingChord ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    placeholder="和弦名，如 Dm7"
                    value={newChordKey}
                    onChange={(e) => setNewChordKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChord()}
                    className={cn(fieldClass, 'w-28')}
                  />
                  <button type="button" onClick={handleAddChord} className={primaryBtn}>
                    创建
                  </button>
                  <button type="button" onClick={() => setIsAddingChord(false)} className={subtleBtn}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setIsAddingChord(true)} className={subtleBtn}>
                  <Plus className="w-3 h-3" /> 新增和弦
                </button>
              )}

              <span className="w-px h-5 bg-slate-700/60 mx-1" />

              <button type="button" onClick={handleDuplicateChord} className={subtleBtn}>
                <Copy className="w-3 h-3" /> 复制当前
              </button>

              {pendingDeleteChordKey === selectedChordKey ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteChord(selectedChordKey)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> 确认删除
                  </button>
                  <button type="button" onClick={() => setPendingDeleteChordKey(null)} className={subtleBtn}>
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={chordKeys.length <= 1 || chordUsage(selectedChordKey).length > 0}
                  onClick={() => setPendingDeleteChordKey(selectedChordKey)}
                  title={
                    chordUsage(selectedChordKey).length > 0
                      ? '该和弦被练习组引用，先从练习组里移除'
                      : chordKeys.length <= 1
                      ? '至少保留一个和弦'
                      : '删除当前和弦'
                  }
                  className={cn(
                    subtleBtn,
                    'hover:text-rose-400 hover:border-rose-500/40',
                    (chordKeys.length <= 1 || chordUsage(selectedChordKey).length > 0) &&
                      'opacity-40 cursor-not-allowed',
                  )}
                >
                  <Trash2 className="w-3 h-3" /> 删除当前
                </button>
              )}

              {chordUsage(selectedChordKey).length > 0 && (
                <span className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  被「{chordUsage(selectedChordKey).map((g) => g.name).join('」「')}」引用中
                </span>
              )}
            </div>
          </div>

          {/* 品格 */}
          <div className={cn(cardClass, 'p-5')}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-emerald-400">可视化品格与 6 根琴弦按弦手指分配器</span>
                <p className="text-[11px] text-slate-400">
                  点击品位设定按压点，点击圆圈切换手指（1=食指, 2=中指, 3=无名指, 4=小指）
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeChord?.barreFret && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    第 {activeChord.barreFret} 品大横按
                  </span>
                )}
                <label className="text-[11px] text-slate-400 flex items-center gap-1">
                  根音弦
                  <select
                    value={activeChord?.bassString ?? 6}
                    onChange={(e) =>
                      activeChord && writeChord(selectedChordKey, { ...activeChord, bassString: parseInt(e.target.value, 10) })
                    }
                    className={cn(fieldClass, 'w-16 py-0.5')}
                  >
                    {[6, 5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>
                        {s} 弦
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {activeChord ? (
              <div
                className={cn(
                  'p-4 rounded-xl border relative',
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 text-slate-100 border-slate-700',
                )}
              >
                <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-slate-400 mb-2">
                  <div className="font-bold text-amber-400">空弦/静音</div>
                  <div>琴枕 (Nut)</div>
                  <div>1 品</div>
                  <div>2 品</div>
                  <div>3 品</div>
                  <div>4 品</div>
                  <div>5 品</div>
                </div>

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
                        <div className="w-20 text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                          <span>{name}</span>
                          {isBassString && (
                            <span className="text-[9px] px-1 rounded bg-amber-500 text-slate-950 font-black">
                              根音
                            </span>
                          )}
                        </div>

                        <div className="flex-1 grid grid-cols-7 gap-1 relative items-center">
                          <div
                            className="absolute left-0 right-0 bg-slate-600/80 -z-0"
                            style={{ height: `${Math.max(1, 3 - arrIdx * 0.4)}px` }}
                          />

                          <button
                            type="button"
                            onClick={() => handleFretCellClick(arrIdx, 0)}
                            className={cn(
                              'w-7 h-7 mx-auto rounded-full z-10 flex items-center justify-center font-mono text-xs font-bold border transition-colors',
                              currentFretVal === 'x'
                                ? 'bg-rose-500/30 text-rose-400 border-rose-500'
                                : currentFretVal === 'o'
                                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                                : 'bg-slate-800 text-slate-500 border-slate-700',
                            )}
                          >
                            {currentFretVal === 'x' ? '×' : currentFretVal === 'o' ? '○' : '-'}
                          </button>

                          {[1, 2, 3, 4, 5].map((fret) => {
                            const isPressed = currentFretVal === fret;
                            return (
                              <button
                                key={fret}
                                type="button"
                                onClick={() => handleFretCellClick(arrIdx, fret)}
                                className={cn(
                                  'w-7 h-7 mx-auto rounded-full z-10 flex items-center justify-center font-mono text-xs font-bold border transition-all',
                                  isPressed
                                    ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 shadow-md'
                                    : 'hover:bg-slate-800/80 text-transparent border-transparent',
                                )}
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
            ) : (
              <p className="text-xs text-slate-500">和弦库为空，先新增一个和弦。</p>
            )}
          </div>

          {/* 避坑知识库 */}
          {activeChord && (
            <div className={cn(cardClass, 'p-5 space-y-4')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4" />
                  避坑指南与防哑音知识录入
                </span>
                <span className="text-[11px] text-slate-400">录入后同步注入学员端 AI 听音诊断卡</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  防哑音发声要点 (Core Tone Guide)
                </label>
                <textarea
                  rows={2}
                  value={activeChord.tips}
                  onChange={(e) => writeChord(selectedChordKey, { ...activeChord, tips: e.target.value })}
                  className={cn(
                    'w-full p-2.5 rounded-xl border text-xs leading-relaxed',
                    darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300',
                  )}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    常见错误动作与指关节塌陷避坑要点（{activeChord.pitfalls.length}）
                  </label>
                  <button type="button" onClick={handleAddPitfall} className={subtleBtn}>
                    <Plus className="w-3 h-3" /> 新增
                  </button>
                </div>
                <div className="space-y-2">
                  {activeChord.pitfalls.map((pitfall, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-rose-400 font-bold shrink-0">坑 #{pIdx + 1}</span>
                      <input
                        value={pitfall}
                        onChange={(e) => handleUpdatePitfall(pIdx, e.target.value)}
                        className={cn(
                          'flex-1 p-2 rounded-xl border text-xs',
                          darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePitfall(pIdx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {activeChord.pitfalls.length === 0 && (
                    <p className="text-[11px] text-slate-500">还没有避坑要点。</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右：课时阶梯 / 练习组与阶段 */}
        <div className="w-5/12 p-6 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-4 shrink-0">
            {(
              [
                { id: 'lesson' as RightTab, label: '课时转换阶梯', badge: trainerData.chordPairs.length },
                { id: 'groups' as RightTab, label: '练习组与阶段', badge: chordGroups.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5',
                  rightTab === tab.id
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : darkMode
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100',
                )}
              >
                {tab.label}
                <span className={cn('font-mono text-[10px] px-1.5 rounded', rightTab === tab.id ? 'bg-black/25' : 'bg-black/20')}>
                  {tab.badge}
                </span>
              </button>
            ))}
            {onGoToCurriculum && (
              <button type="button" onClick={onGoToCurriculum} className={cn(subtleBtn, 'ml-auto')}>
                <Link2 className="w-3 h-3" /> 回课程大纲
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 pr-1">
            {/* ── Tab：课时转换阶梯（沿用原设计） ── */}
            {rightTab === 'lesson' && (
              <>
                <div className={cn(cardClass, 'p-5 space-y-4')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4" />
                      转换对 (Pair Switching) 阶梯配置
                    </span>
                    {activePair && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedPairIndex}
                          onChange={(e) => setSelectedPairIndex(parseInt(e.target.value, 10))}
                          className={cn(fieldClass, 'w-40 py-1')}
                        >
                          {trainerData.chordPairs.map((pair, i) => (
                            <option key={pair.id} value={i}>
                              {pair.fromChord} ➔ {pair.toChord}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          {activePair.fromChord} ➔ {activePair.toChord}
                        </span>
                      </div>
                    )}
                  </div>

                  {!activePair ? (
                    <p className="text-xs text-slate-500">该课时还没有配置转换对。</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className={cn('p-3.5 rounded-xl border', darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-400">起始速度</span>
                            <span className="text-sm font-mono font-black text-amber-400">{activePair.startBpm} BPM</span>
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

                        <div className={cn('p-3.5 rounded-xl border', darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-400">达标目标速度</span>
                            <span className="text-sm font-mono font-black text-emerald-400">{activePair.targetBpm} BPM</span>
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

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1">每次阶梯提速步长</label>
                          <select
                            value={activePair.stepBpm || 5}
                            onChange={(e) => handleUpdatePair({ stepBpm: parseInt(e.target.value, 10) })}
                            className={cn(fieldClass, 'font-mono')}
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
                            className={cn(fieldClass, 'font-mono')}
                          >
                            <option value="4">4 小节 (速通)</option>
                            <option value="8">8 小节 (标准巩固)</option>
                            <option value="16">16 小节 (肌肉记忆极硬核)</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                          BPM 阶梯速度演进链（{ladderSteps.length} 级）
                        </span>
                        <div className="flex items-end gap-1.5 h-20 p-2 rounded-xl border bg-slate-950 border-slate-800 overflow-x-auto custom-scrollbar">
                          {ladderSteps.map((bpm) => {
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
                                  className={cn(
                                    'w-full rounded-t-md transition-all',
                                    isCurrent
                                      ? 'bg-amber-400 shadow-md shadow-amber-400/50'
                                      : 'bg-emerald-600/70 hover:bg-emerald-500',
                                  )}
                                  style={{ height: `${heightPercent}%` }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 麦克风容差 */}
                <div className={cn(cardClass, 'p-5 space-y-4')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <Mic className="w-4 h-4" />
                      麦克风听音容差与降噪门限标定
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-400">±{trainerData.toleranceCents} Cents</span>
                  </div>

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
                          trainerData: { ...trainerData, toleranceCents: parseInt(e.target.value, 10) },
                        })
                      }
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                      <span>±5 (音乐学院标准)</span>
                      <span>±15 (教研黄金基准)</span>
                      <span>±30 (宽容新手)</span>
                    </div>
                  </div>

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
                          trainerData: { ...trainerData, noiseGateDb: parseInt(e.target.value, 10) },
                        })
                      }
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                      <span>-60 dB (灵敏)</span>
                      <span>-42 dB (室内常态)</span>
                      <span>-25 dB (高噪过滤)</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab：练习组与 BPM 阶梯阶段 CRUD ── */}
            {rightTab === 'groups' && (
              <>
                {/* 组选择 */}
                <div className={cn(cardClass, 'p-4')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold flex items-center gap-1.5 mr-1">
                      <ListChecks className="w-3.5 h-3.5 text-amber-400" />
                      和弦练习组
                    </span>
                    {chordGroups.map((group) => {
                      const isSelected = activeGroup?.id === group.id;
                      const isLinked = linkedGroupIds.includes(group.id);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setStageTarget('group');
                          }}
                          className={cn(
                            'px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5',
                            isSelected
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                              : darkMode
                              ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
                          )}
                        >
                          {group.name}
                          {isLinked && <Link2 className="w-3 h-3" />}
                        </button>
                      );
                    })}
                    <button type="button" onClick={handleAddGroup} className={subtleBtn}>
                      <Plus className="w-3 h-3" /> 新建组
                    </button>
                    {activeGroup && (
                      <>
                        <button type="button" onClick={handleDuplicateGroup} className={subtleBtn}>
                          <Copy className="w-3 h-3" /> 复制
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteGroupId(activeGroup.id)}
                          className={cn(subtleBtn, 'hover:text-rose-400 hover:border-rose-500/40')}
                        >
                          <Trash2 className="w-3 h-3" /> 删除
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!activeGroup ? (
                  <p className="text-xs text-slate-500">还没有和弦练习组，点「新建组」开始。</p>
                ) : (
                  <>
                    {/* 组元信息 */}
                    <div className={cn(cardClass, 'p-4 space-y-3')}>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="col-span-2">
                          <label className="block text-slate-400 mb-1">组名</label>
                          <input
                            value={activeGroup.name}
                            onChange={(e) => patchGroup({ name: e.target.value })}
                            className={fieldClass}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-slate-400 mb-1">说明</label>
                          <textarea
                            rows={2}
                            value={activeGroup.description}
                            onChange={(e) => patchGroup({ description: e.target.value })}
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">难度</label>
                          <select
                            value={activeGroup.difficulty}
                            onChange={(e) => patchGroup({ difficulty: e.target.value as ChordGroup['difficulty'] })}
                            className={fieldClass}
                          >
                            {DIFFICULTIES.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={linkedGroupIds.includes(activeGroup.id)}
                              onChange={() => {
                                const next = linkedGroupIds.includes(activeGroup.id)
                                  ? linkedGroupIds.filter((id) => id !== activeGroup.id)
                                  : [...linkedGroupIds, activeGroup.id];
                                onChangeLesson({ ...lesson, chordGroupIds: next });
                              }}
                              className="accent-emerald-500"
                            />
                            <span>关联到课时「{lesson.title.slice(0, 10)}…」</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-400 text-xs mb-1">成员和弦（勾选即入组）</label>
                        <div className="flex flex-wrap gap-1.5">
                          {chordKeys.map((key) => {
                            const checked = activeGroup.chordKeys.includes(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  patchGroup({
                                    chordKeys: checked
                                      ? activeGroup.chordKeys.filter((k) => k !== key)
                                      : [...activeGroup.chordKeys, key],
                                  })
                                }
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors',
                                  checked
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                                    : darkMode
                                    ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                                    : 'border-slate-300 text-slate-500 hover:bg-slate-100',
                                )}
                              >
                                {checked && <Check className="w-3 h-3 inline mr-0.5" />}
                                {key}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 阶段列表 */}
                    <div className={cn(cardClass, 'p-4 space-y-3')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          BPM 阶梯阶段列表（{activeStages.length}）
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            value={resolvedStageTarget}
                            onChange={(e) => setStageTarget(e.target.value)}
                            className={cn(fieldClass, 'py-1 w-48')}
                          >
                            <option value="group">组默认阶段（全组成对共用）</option>
                            {pairOptions.map((pairKey) => (
                              <option key={pairKey} value={pairKey}>
                                单独覆盖：{pairKey.replace('|', ' → ')}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={handleAddStage} className={primaryBtn}>
                            <Plus className="w-3 h-3" /> 新增阶段
                          </button>
                        </div>
                      </div>

                      {isOverrideTarget && (
                        <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/40 text-indigo-300">
                          <span>
                            正在编辑「{resolvedStageTarget.replace('|', ' → ')}」的单独覆盖阶段（该和弦对不再使用组默认阶段）
                          </span>
                          <button type="button" onClick={clearPairOverride} className="hover:underline shrink-0 ml-2">
                            清除覆盖
                          </button>
                        </div>
                      )}

                      {activeStages.length === 0 && (
                        <p className="text-[11px] text-slate-500">
                          {isOverrideTarget
                            ? '该和弦对暂无覆盖，会回退使用组默认阶段。点「新增阶段」开始配置。'
                            : '还没有阶段，点「新增阶段」开始配置 BPM 阶梯。'}
                        </p>
                      )}

                      <div className="space-y-2">
                        {[...activeStages]
                          .sort((a, b) => a.order - b.order)
                          .map((stage, index) => {
                            const preview = resolveStagesForPair(activeGroup, stage.fromChord, stage.toChord);
                            return (
                              <div
                                key={stage.id}
                                className={cn(
                                  'p-3 rounded-xl border space-y-2',
                                  darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/25 shrink-0">
                                    #{index + 1}
                                  </span>
                                  <input
                                    value={stage.name}
                                    onChange={(e) => handleUpdateStage(stage.id, { name: e.target.value })}
                                    className={cn(fieldClass, 'flex-1')}
                                  />
                                  <button
                                    type="button"
                                    title="上移"
                                    disabled={index === 0}
                                    onClick={() => handleMoveStage(stage.id, -1)}
                                    className={cn('p-1', index === 0 ? 'opacity-30' : 'hover:text-emerald-400')}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    title="下移"
                                    disabled={index === activeStages.length - 1}
                                    onClick={() => handleMoveStage(stage.id, 1)}
                                    className={cn(
                                      'p-1',
                                      index === activeStages.length - 1 ? 'opacity-30' : 'hover:text-emerald-400',
                                    )}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    title="删除阶段"
                                    onClick={() => handleDeleteStage(stage.id)}
                                    className="p-1 text-slate-500 hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-4 gap-2 text-[11px]">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-slate-400">起始 BPM</span>
                                    <input
                                      type="number"
                                      min={20}
                                      max={240}
                                      value={stage.startBpm}
                                      onChange={(e) =>
                                        handleUpdateStage(stage.id, { startBpm: parseInt(e.target.value, 10) || 0 })
                                      }
                                      className={cn(fieldClass, 'font-mono py-1')}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-slate-400">目标 BPM</span>
                                    <input
                                      type="number"
                                      min={20}
                                      max={240}
                                      value={stage.targetBpm}
                                      onChange={(e) =>
                                        handleUpdateStage(stage.id, { targetBpm: parseInt(e.target.value, 10) || 0 })
                                      }
                                      className={cn(fieldClass, 'font-mono py-1')}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-slate-400">步长 BPM</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={30}
                                      value={stage.stepBpm}
                                      onChange={(e) =>
                                        handleUpdateStage(stage.id, { stepBpm: parseInt(e.target.value, 10) || 1 })
                                      }
                                      className={cn(fieldClass, 'font-mono py-1')}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-slate-400">连续小节</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={32}
                                      value={stage.passBars}
                                      onChange={(e) =>
                                        handleUpdateStage(stage.id, { passBars: parseInt(e.target.value, 10) || 1 })
                                      }
                                      className={cn(fieldClass, 'font-mono py-1')}
                                    />
                                  </label>
                                </div>

                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="text-slate-400">容差 ±{stage.toleranceCents} 音分</span>
                                  <input
                                    type="range"
                                    min={5}
                                    max={30}
                                    step={1}
                                    value={stage.toleranceCents}
                                    onChange={(e) =>
                                      handleUpdateStage(stage.id, {
                                        toleranceCents: parseInt(e.target.value, 10),
                                      })
                                    }
                                    className="flex-1 accent-cyan-400 cursor-pointer"
                                  />
                                  <span className="font-mono text-slate-500 shrink-0">
                                    {stage.fromChord} → {stage.toChord}
                                  </span>
                                  {resolvedStageTarget === 'group' && preview.overridden && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                                      该对已被单独覆盖
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 删除和弦组确认 ── */}
      {pendingGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={() => setPendingDeleteGroupId(null)}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border shadow-2xl',
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">删除和弦练习组「{pendingGroup.name}」</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {pendingGroupRefTotal > 0
                    ? `该练习组被 ${pendingGroupRefTotal} 个课时关联，删除后会自动解除关联。`
                    : '该练习组目前没有被任何课时关联。'}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2">
              {pendingGroupRefs.length > 0 && (
                <ul className="space-y-1">
                  {pendingGroupRefs.map((ref) => (
                    <li key={ref.name} className="text-[11px] text-rose-200/90 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rose-400" />
                      {ref.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">
                组内 {pendingGroup.stages.length} 个默认阶段
                {pendingGroup.pairStages ? ` + ${Object.keys(pendingGroup.pairStages).length} 组单对覆盖` : ''} 会一并删除。
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDeleteGroupId(null)} className={subtleBtn}>
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteGroup}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> 确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
