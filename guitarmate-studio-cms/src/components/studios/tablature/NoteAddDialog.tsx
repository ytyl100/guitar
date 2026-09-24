import React, { useEffect, useMemo, useState } from 'react';
import { Music, X, Volume2 } from 'lucide-react';
import { audioEngine } from '../../../utils/audioEngine';
import { FINGER_OPTIONS, midiToName } from '../../review/reviewTypes';

/**
 * 新增节点对话框（NoteAddDialog）
 * ==============================
 *
 * 从「音频与六线谱对齐」工作台抽出来的**可复用**弹窗：在播放头位置挂一个新音符。
 * 校正工作台与对齐工作台共用它，避免同一套「选弦 / 选品 / 选时值 / 选技巧」
 * 的交互出现两份实现（两份必然逐渐不一致）。
 *
 * 关键约定：
 * - 输入的是**品位**（把位优先：把位决定手指，`finger = fret − position + 1`）；
 * - 时间由调用方算好（`relativeSec` = 播放头 − 小节起点），本组件不做时间换算；
 * - 音名与试听频率由 `tuning + capo` 推出，和发布后的 `midi` 口径一致。
 */

/** 与 `reviewTypes.REVIEW_TECHNIQUES` 取值一致（kebab-case，发布时后端映射为 snake_case） */
export const ADD_NOTE_TECHNIQUES: Array<{ value: string; label: string }> = [
  { value: 'normal', label: '正常拨弦' },
  { value: 'hammer-on', label: '击弦 hammer-on' },
  { value: 'pull-off', label: '勾弦 pull-off' },
  { value: 'slide', label: '滑音 slide' },
  { value: 'bend', label: '推弦 bend' },
  { value: 'vibrato', label: '揉弦 vibrato' },
  { value: 'palm-mute', label: '闷音 palm-mute' },
  { value: 'harmonic', label: '泛音 harmonic' },
  { value: 'dead-note', label: '哑音 dead-note' },
];

export interface NewNoteSpec {
  /** 1-6，1 = 最细的高音 E 弦 */
  string: number;
  fret: number;
  durationSec: number;
  technique: string;
  /** 生效把位（食指按第几品），用于推导手指号 */
  position?: number;
  /** 左手手指号：0 = 空弦，1-4 = 食指…小指 */
  finger?: number;
}

export interface NoteAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (spec: NewNoteSpec) => void;
  isDark?: boolean;
  /** 播放头绝对秒数（只用于显示） */
  atSec: number;
  /** 相对小节起点的秒数（由调用方换算） */
  relativeSec: number;
  /** 该时间点所属小节的标题（如「第 3 小节」） */
  measureLabel?: string;
  /** 一拍秒数，用于生成时值预设 */
  beatSec: number;
  tuning: number[];
  capo?: number;
  /** 默认把位（通常是小节把位） */
  defaultPosition?: number;
  /** 该小节已有的弦号（默认帮用户挑一根还没用过的弦） */
  occupiedStrings?: number[];
  /** 最近一次使用的设置（连续录入时不用每次重选） */
  lastUsed?: Partial<NewNoteSpec>;
}

export const NoteAddDialog: React.FC<NoteAddDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isDark = true,
  atSec,
  relativeSec,
  measureLabel,
  beatSec,
  tuning,
  capo = 0,
  defaultPosition = 1,
  occupiedStrings = [],
  lastUsed,
}) => {
  const [string, setString] = useState(1);
  const [fret, setFret] = useState(0);
  const [durationSec, setDurationSec] = useState(beatSec);
  const [technique, setTechnique] = useState('normal');
  const [position, setPosition] = useState(defaultPosition);
  const [finger, setFinger] = useState(0);

  /** 每次打开时重置为「推荐值」：优先上一音、其次未占用的弦 */
  useEffect(() => {
    if (!isOpen) return;
    const preferred = lastUsed?.string ?? [1, 2, 3, 4, 5, 6].find((s) => !occupiedStrings.includes(s)) ?? 1;
    setString(preferred);
    setFret(lastUsed?.fret ?? 0);
    setDurationSec(lastUsed?.durationSec ?? beatSec);
    setTechnique(lastUsed?.technique ?? 'normal');
    setPosition(lastUsed?.position ?? defaultPosition);
    setFinger(lastUsed?.finger ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** 品位 / 把位 → 推荐手指号（把位优先：把位定了，手指就唯一） */
  const derivedFinger = fret <= 0 ? 0 : Math.min(4, Math.max(1, fret - position + 1));

  /** 时值预设（按当前 BPM 换算成秒） */
  const durationPresets = useMemo(
    () => [
      { label: '全音符', beats: 4 },
      { label: '二分', beats: 2 },
      { label: '四分附点', beats: 1.5 },
      { label: '四分', beats: 1 },
      { label: '八分', beats: 0.5 },
      { label: '十六分', beats: 0.25 },
    ],
    [],
  );

  const midi = (tuning[string - 1] ?? 0) + fret + capo;
  const noteName = fret < 0 ? '—' : midiToName(midi);

  const handlePreview = () => {
    const freq = audioEngine.getGuitarFrequency(string, fret);
    audioEngine.pluckString(freq, Math.max(0.2, durationSec), 0.85);
  };

  const handleSubmit = () => {
    onSubmit({
      string,
      fret,
      durationSec,
      technique,
      position,
      finger: fret <= 0 ? 0 : finger || derivedFinger,
    });
  };

  if (!isOpen) return null;

  const inputClass = `w-full p-2 rounded-lg border font-mono text-xs ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200'
      : 'bg-slate-100 border-slate-300 text-slate-800'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Music className="w-4 h-4 text-amber-500" />
            在播放头新增节点
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300">
            <X size={14} />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 font-mono">
          {measureLabel ? `${measureLabel} · ` : ''}
          绝对 {atSec.toFixed(2)}s · 小节内 {relativeSec.toFixed(2)}s · {noteName}
        </div>

        <div className="space-y-4 text-xs">
          {/* 弦 */}
          <div>
            <label className="block font-medium mb-1.5 text-slate-400">
              琴弦（1 = 高音 E … 6 = 低音 E）
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setString(s)}
                  className={`py-2 rounded-lg font-mono font-bold border text-[11px] ${
                    string === s
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                  title={`${s} 弦 · 空弦 ${midiToName((tuning[s - 1] ?? 0) + capo)}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* 品位 */}
          <div>
            <label className="block font-medium mb-1.5 text-slate-400">品位（0 = 空弦，1-24）</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={24}
                value={fret}
                onChange={(e) => setFret(parseInt(e.target.value, 10))}
                className="flex-1 accent-amber-500"
              />
              <input
                type="number"
                min={0}
                max={24}
                value={fret}
                onChange={(e) => setFret(Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0)))}
                className="w-16 p-1.5 rounded-lg border font-mono text-center bg-transparent border-slate-600"
              />
            </div>
          </div>

          {/* 把位 + 手指 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1.5 text-slate-400">把位（把位优先）</label>
              <input
                type="number"
                min={1}
                max={24}
                value={position}
                onChange={(e) => setPosition(Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 1)))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-medium mb-1.5 text-slate-400">
                手指（留空按把位推导 = {derivedFinger || '○'}）
              </label>
              <select
                value={fret <= 0 ? 0 : finger || derivedFinger}
                onChange={(e) => setFinger(parseInt(e.target.value, 10))}
                disabled={fret <= 0}
                className={`${inputClass} disabled:opacity-50`}
              >
                {FINGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 时值 */}
          <div>
            <label className="block font-medium mb-1.5 text-slate-400">
              时值（按当前 {beatSec > 0 ? (60 / beatSec).toFixed(0) : '—'} BPM 换算）
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {durationPresets.map((preset) => {
                const sec = Number((beatSec * preset.beats).toFixed(3));
                const active = Math.abs(sec - durationSec) < 0.01;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDurationSec(sec)}
                    className={`py-1.5 rounded-lg border font-mono text-[11px] ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                    title={`${sec}s`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 技巧 */}
          <div>
            <label className="block font-medium mb-1.5 text-slate-400">演奏技巧</label>
            <select value={technique} onChange={(e) => setTechnique(e.target.value)} className={inputClass}>
              {ADD_NOTE_TECHNIQUES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePreview}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
              isDark ? 'border-slate-700 text-slate-300 hover:border-slate-500' : 'border-slate-300 text-slate-600'
            }`}
          >
            <Volume2 size={12} /> 试听
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border px-3 py-2 text-xs ${
                isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'
              }`}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
            >
              新增节点
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteAddDialog;
