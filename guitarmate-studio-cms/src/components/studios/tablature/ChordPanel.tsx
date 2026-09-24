import React, { useMemo, useState } from 'react';
import { Search, Music2, Plus, X } from 'lucide-react';

/** 常用和弦库（与文档 5.6 保持一致，并按流行/弹唱场景扩充） */
export const COMMON_CHORDS: string[] = [
  // 大三和弦
  'C', 'D', 'E', 'F', 'G', 'A', 'B',
  // 小三和弦
  'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm',
  // 属七
  'C7', 'D7', 'E7', 'F7', 'G7', 'A7', 'B7',
  // 流行扩展
  'F#', 'C#m', 'F#m', 'G#m',
  'Am7', 'Bm7', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'Gmaj7', 'Amaj7',
  'Cadd9', 'Dsus4', 'Asus2', 'Esus4', 'G/B', 'D/F#',
];

interface ChordPanelProps {
  /** 插入和弦回调：chordName + 当前游标时间（秒） */
  onInsert: (chordName: string, timeSec: number) => void;
  /** 当前播放游标时间（秒） */
  activeTime: number;
  darkMode?: boolean;
  /** 已标注和弦列表，支持删除 */
  chords?: Array<{ id: string; chordName: string; startTime: number }>;
  onRemoveChord?: (id: string) => void;
}

/**
 * 和弦标注面板
 *
 * 提供常用和弦快速按钮 + 搜索过滤，点击后调用 onInsert(chordName, activeTime)，
 * 由上层把和弦标记写入当前小节的 ChordMarker 列表。
 */
export const ChordPanel: React.FC<ChordPanelProps> = ({
  onInsert,
  activeTime,
  darkMode = true,
  chords = [],
  onRemoveChord,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COMMON_CHORDS;
    return COMMON_CHORDS.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="space-y-3 text-xs">
      {/* 搜索框 */}
      <div className="relative">
        <Search
          className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${
            darkMode ? 'text-slate-500' : 'text-slate-400'
          }`}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索和弦 (如 Am7 / F#)"
          className={`w-full pl-8 pr-3 py-2 rounded-lg border font-mono ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500'
              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
          }`}
        />
      </div>

      {/* 当前游标时间提示 */}
      <div
        className={`px-2.5 py-1.5 rounded-lg border font-mono flex items-center justify-between ${
          darkMode
            ? 'bg-slate-950/60 border-slate-800 text-slate-400'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        <span>插入位置 (当前游标)</span>
        <span className="text-amber-400 font-bold">{activeTime.toFixed(2)}s</span>
      </div>

      {/* 和弦按钮网格 */}
      <div className="grid grid-cols-5 gap-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-0.5">
        {filtered.map((c) => (
          <button
            key={c}
            onClick={() => onInsert(c, activeTime)}
            className={`py-1.5 rounded-lg font-mono font-bold border transition-colors ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400'
            }`}
            title={`在 ${activeTime.toFixed(2)}s 插入和弦 ${c}`}
          >
            {c}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-5 text-center py-4 text-slate-500">
            未匹配到和弦，可直接使用下方自定义输入
          </div>
        )}
      </div>

      {/* 自定义和弦输入 */}
      <CustomChordInput onInsert={onInsert} activeTime={activeTime} darkMode={darkMode} />

      {/* 已标注和弦列表 */}
      {chords.length > 0 && (
        <div
          className={`p-2 rounded-lg border space-y-1 max-h-36 overflow-y-auto custom-scrollbar ${
            darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-400 mb-1">
            <Music2 className="w-3 h-3" />
            <span>已标注和弦 ({chords.length})</span>
          </div>
          {chords.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-2 py-1 rounded font-mono border ${
                darkMode
                  ? 'bg-slate-800/40 border-slate-700/60 text-slate-300'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <span className="font-bold text-amber-400">{c.chordName}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{c.startTime.toFixed(2)}s</span>
                {onRemoveChord && (
                  <button
                    onClick={() => onRemoveChord(c.id)}
                    className="text-slate-500 hover:text-rose-400"
                    title="删除该和弦标记"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomChordInput: React.FC<{
  onInsert: (chordName: string, timeSec: number) => void;
  activeTime: number;
  darkMode: boolean;
}> = ({ onInsert, activeTime, darkMode }) => {
  const [value, setValue] = useState('');
  const submit = () => {
    const name = value.trim();
    if (!name) return;
    onInsert(name, activeTime);
    setValue('');
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="自定义和弦名称"
        className={`flex-1 px-2.5 py-2 rounded-lg border font-mono ${
          darkMode
            ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500'
            : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
        }`}
      />
      <button
        onClick={submit}
        className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-1"
        title="插入自定义和弦"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>插入</span>
      </button>
    </div>
  );
};

export default ChordPanel;
