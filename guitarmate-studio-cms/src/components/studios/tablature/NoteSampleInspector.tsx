import React, { useState, useMemo } from 'react';
import { TabNote } from '../../../types';
import {
  Volume2,
  Trash2,
  Edit3,
  Clock,
  Music,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  Plus,
} from 'lucide-react';

interface NoteSampleInspectorProps {
  notes: TabNote[];
  measureTimestamps: number[];
  audioDurationSec: number;
  selectedMeasureIndex: number | null;
  selectedNoteId: string | null;
  darkMode: boolean;
  onSelectMeasure: (mIdx: number | null) => void;
  onSelectNote: (note: TabNote) => void;
  onUpdateNote: (updatedNote: TabNote) => void;
  onDeleteNote: (noteId: string) => void;
  onPlayNoteSound: (stringIndex: number, fret: number | string) => void;
  onAddNewNoteAtTime: (timeSec: number, measureIndex: number) => void;
}

export const NoteSampleInspector: React.FC<NoteSampleInspectorProps> = ({
  notes,
  measureTimestamps,
  audioDurationSec,
  selectedMeasureIndex,
  selectedNoteId,
  darkMode,
  onSelectMeasure,
  onSelectNote,
  onUpdateNote,
  onDeleteNote,
  onPlayNoteSound,
  onAddNewNoteAtTime,
}) => {
  // Currently expanded note id for inline editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(selectedNoteId);

  // Sync editing note if selectedNoteId changes
  React.useEffect(() => {
    if (selectedNoteId) {
      setEditingNoteId(selectedNoteId);
    }
  }, [selectedNoteId]);

  // Filter notes by selected measure
  const filteredNotes = useMemo(() => {
    if (selectedMeasureIndex === null) {
      return [...notes].sort((a, b) => a.timestampSec - b.timestampSec);
    }
    return notes
      .filter((n) => n.measureIndex === selectedMeasureIndex)
      .sort((a, b) => a.timestampSec - b.timestampSec);
  }, [notes, selectedMeasureIndex]);

  // Selected measure details
  const currentMeasureInfo = useMemo(() => {
    if (selectedMeasureIndex === null) return null;
    const start = measureTimestamps[selectedMeasureIndex] ?? 0;
    const end = measureTimestamps[selectedMeasureIndex + 1] ?? audioDurationSec;
    return {
      index: selectedMeasureIndex,
      start,
      end,
      duration: end - start,
    };
  }, [selectedMeasureIndex, measureTimestamps, audioDurationSec]);

  // Update note field helper
  const handleFieldChange = (note: TabNote, field: keyof TabNote, value: any) => {
    let updated = { ...note, [field]: value };

    // If timestamp changed, automatically calculate the measureIndex it falls into
    if (field === 'timestampSec') {
      const newTime = Number(value);
      let foundMeasure = 0;
      for (let i = measureTimestamps.length - 1; i >= 0; i--) {
        if (newTime >= measureTimestamps[i]) {
          foundMeasure = i;
          break;
        }
      }
      updated.measureIndex = foundMeasure;
    }

    onUpdateNote(updated);
  };

  // Nudge timestamp helper (+/- delta)
  const handleNudgeTime = (note: TabNote, deltaSec: number) => {
    const newTime = Math.max(0, Math.min(audioDurationSec, Number((note.timestampSec + deltaSec).toFixed(2))));
    handleFieldChange(note, 'timestampSec', newTime);
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* Top Header & Measure Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 border-b border-inherit pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>音符采样明细与小节联动编辑器</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                实时双向同步
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              {currentMeasureInfo
                ? `当前定位: 第 ${currentMeasureInfo.index + 1} 小节 (${currentMeasureInfo.start.toFixed(
                    2
                  )}s ~ ${currentMeasureInfo.end.toFixed(2)}s) · 共 ${filteredNotes.length} 个音符采样点`
                : `全曲采样点总览 · 共 ${filteredNotes.length} 个音符采样点`}
            </p>
          </div>
        </div>

        {/* Quick Add Note in Current Measure */}
        <button
          onClick={() => {
            const time = currentMeasureInfo
              ? currentMeasureInfo.start + currentMeasureInfo.duration * 0.25
              : 0;
            onAddNewNoteAtTime(time, currentMeasureInfo ? currentMeasureInfo.index : 0);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>在当前小节加音符</span>
        </button>
      </div>

      {/* Measure Selector Tabs (根据所选择的节切切换) */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2.5 mb-3 text-xs">
        <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1">
          小节切片切换:
        </span>
        {/* All measures button */}
        <button
          onClick={() => onSelectMeasure(null)}
          className={`px-2.5 py-1 rounded-lg font-mono font-medium transition-colors shrink-0 border ${
            selectedMeasureIndex === null
              ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow-xs'
              : darkMode
              ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
          }`}
        >
          全部小节 ({notes.length})
        </button>

        {/* Individual Measure Tabs */}
        {measureTimestamps.map((mStart, idx) => {
          const mNotesCount = notes.filter((n) => n.measureIndex === idx).length;
          const isCurrent = selectedMeasureIndex === idx;

          return (
            <button
              key={idx}
              onClick={() => onSelectMeasure(idx)}
              className={`px-2.5 py-1 rounded-lg font-mono transition-colors shrink-0 border flex items-center gap-1.5 ${
                isCurrent
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : darkMode
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-amber-400/50'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400'
              }`}
            >
              <span>第 {idx + 1} 节</span>
              <span
                className={`text-[10px] px-1 rounded-full ${
                  isCurrent
                    ? 'bg-slate-950/20 text-slate-950 font-bold'
                    : 'bg-slate-700/50 text-slate-300'
                }`}
              >
                {mNotesCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Note Sample Details List */}
      <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
        {filteredNotes.length === 0 ? (
          <div
            className={`p-6 text-center rounded-xl border border-dashed text-xs ${
              darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-300 text-slate-400'
            }`}
          >
            当前小节暂无音符采样点，可在上方六线谱双击或点击“在当前小节加音符”进行录入对齐。
          </div>
        ) : (
          filteredNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;
            const isEditing = editingNoteId === note.id;

            return (
              <div
                key={note.id}
                className={`rounded-xl border transition-all ${
                  isEditing
                    ? 'bg-indigo-950/20 border-indigo-500/60 ring-1 ring-indigo-500/40 shadow-sm'
                    : isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-xs'
                    : darkMode
                    ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Note Row Summary Bar */}
                <div
                  onClick={() => {
                    onSelectNote(note);
                    setEditingNoteId(isEditing ? null : note.id);
                  }}
                  className="p-2.5 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {/* String & Fret Badge */}
                    <div className="flex items-center gap-1 font-mono font-bold text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black shadow-xs">
                        {note.stringIndex}弦
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          darkMode
                            ? 'bg-slate-800 text-amber-300 border-slate-700'
                            : 'bg-white text-slate-900 border-slate-300'
                        }`}
                      >
                        {note.fret}品
                      </span>
                    </div>

                    {/* Timestamp Badge (Updates live as user drags the node!) */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-800/40">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{note.timestampSec.toFixed(2)}s</span>
                    </div>

                    {/* Rhythm Type */}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                      {note.rhythmType || '1/4'}
                    </span>

                    {/* Chord Name if present */}
                    {note.chordName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                        和弦: {note.chordName}
                      </span>
                    )}

                    {/* Technique if present */}
                    {note.technique && note.technique !== 'normal' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                        {note.technique}
                      </span>
                    )}
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-1.5">
                    {/* Audition sound button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayNoteSound(note.stringIndex, note.fret);
                      }}
                      className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-colors"
                      title="试听琴弦发音"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete note */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="删除此音符"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Expand/Collapse Edit toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNoteId(isEditing ? null : note.id);
                      }}
                      className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-colors ${
                        isEditing
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : 'text-slate-400 hover:text-slate-200 border-inherit'
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditing ? '收起' : '修改参数'}</span>
                      {isEditing ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Inline Edit Panel: 修改音符采样参数，实时联动小节内节点位置 */}
                {isEditing && (
                  <div
                    className={`p-3.5 border-t text-xs space-y-3 ${
                      darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Field 1: String & Fret */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">琴弦与品位</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={note.stringIndex}
                            onChange={(e) =>
                              handleFieldChange(note, 'stringIndex', parseInt(e.target.value, 10))
                            }
                            className={`p-1.5 rounded-lg border font-mono font-bold ${
                              darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-100'
                                : 'bg-slate-100 border-slate-300'
                            }`}
                          >
                            {[1, 2, 3, 4, 5, 6].map((s) => (
                              <option key={s} value={s}>
                                {s}弦
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1 flex-1">
                            <input
                              type="number"
                              min={0}
                              max={24}
                              value={note.fret}
                              onChange={(e) =>
                                handleFieldChange(
                                  note,
                                  'fret',
                                  isNaN(parseInt(e.target.value, 10))
                                    ? 0
                                    : parseInt(e.target.value, 10)
                                )
                              }
                              className={`w-16 p-1.5 rounded-lg border font-mono text-center font-bold ${
                                darkMode
                                  ? 'bg-slate-800 border-slate-700 text-amber-300'
                                  : 'bg-slate-100 border-slate-300 text-slate-900'
                              }`}
                            />
                            <span className="text-slate-400 font-medium">品</span>
                          </div>
                        </div>
                      </div>

                      {/* Field 2: Timestamp with Nudge Buttons (修改直接导致小节内节点移动！) */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium flex items-center justify-between">
                          <span>时间戳秒数 (Timestamp)</span>
                          <span className="text-[10px] text-amber-400">微调直接移动节点</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step={0.01}
                            min={0}
                            max={audioDurationSec}
                            value={note.timestampSec}
                            onChange={(e) =>
                              handleFieldChange(note, 'timestampSec', parseFloat(e.target.value) || 0)
                            }
                            className={`w-20 p-1.5 rounded-lg border font-mono font-bold text-center ${
                              darkMode
                                ? 'bg-slate-800 border-slate-700 text-cyan-300'
                                : 'bg-slate-100 border-slate-300 text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleNudgeTime(note, -0.05)}
                            className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] border border-slate-700"
                            title="向前微调 50ms"
                          >
                            -50ms
                          </button>
                          <button
                            type="button"
                            onClick={() => handleNudgeTime(note, +0.05)}
                            className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] border border-slate-700"
                            title="向后微调 50ms"
                          >
                            +50ms
                          </button>
                        </div>
                      </div>

                      {/* Field 3: Rhythm Type */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">
                          节奏速率 (Rhythm Type)
                        </label>
                        <select
                          value={note.rhythmType || '1/4'}
                          onChange={(e) => handleFieldChange(note, 'rhythmType', e.target.value)}
                          className={`w-full p-1.5 rounded-lg border font-mono font-medium ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700 text-purple-300'
                              : 'bg-slate-100 border-slate-300 text-purple-700'
                          }`}
                        >
                          <option value="1/4">1/4 四分音符 (单竖符干)</option>
                          <option value="1/8">1/8 八分音符 (单横梁连线)</option>
                          <option value="1/16">1/16 十六分音符 (双横梁连线)</option>
                          <option value="1/32">1/32 三十二分音符 (三横梁)</option>
                          <option value="1/2">1/2 二分音符</option>
                          <option value="1/1">1/1 全音符 (空心无符干)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      {/* Field 4: Technique */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">演奏技巧</label>
                        <select
                          value={note.technique || 'normal'}
                          onChange={(e) => handleFieldChange(note, 'technique', e.target.value)}
                          className={`w-full p-1.5 rounded-lg border font-mono ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700 text-slate-200'
                              : 'bg-slate-100 border-slate-300'
                          }`}
                        >
                          <option value="normal">标准弹拨 (Normal)</option>
                          <option value="hammer-on">击弦 (Hammer-on / H)</option>
                          <option value="pull-off">勾弦 (Pull-off / P)</option>
                          <option value="slide">滑音 (Slide / S)</option>
                          <option value="vibrato">揉弦 (Vibrato / ~)</option>
                          <option value="harmonic">泛音 (Harmonic / ◇)</option>
                          <option value="palm-mute">闷音 (Palm Mute / PM)</option>
                          <option value="bend">推弦 (Bend / B)</option>
                        </select>
                      </div>

                      {/* Field 5: Chord Name */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">
                          对应和弦 (柱式对齐)
                        </label>
                        <input
                          type="text"
                          value={note.chordName || ''}
                          placeholder="例如 C, G, Am, F"
                          onChange={(e) => handleFieldChange(note, 'chordName', e.target.value)}
                          className={`w-full p-1.5 rounded-lg border font-mono ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700 text-amber-300'
                              : 'bg-slate-100 border-slate-300'
                          }`}
                        />
                      </div>

                      {/* Field 6: Barre Marker */}
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">横按标记</label>
                        <input
                          type="text"
                          value={note.barreMarker || ''}
                          placeholder="例如 B I, B III"
                          onChange={(e) => handleFieldChange(note, 'barreMarker', e.target.value)}
                          className={`w-full p-1.5 rounded-lg border font-mono ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700 text-cyan-300'
                              : 'bg-slate-100 border-slate-300'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
