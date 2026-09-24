import React, { useState, useEffect, useRef } from 'react';
import { audioEngine } from '../utils/audioSynth';
import { GuitarHeadstockTuner } from './GuitarHeadstockTuner';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Play,
  Pause,
  Plus,
  Minus,
  Hand,
  Clock,
} from 'lucide-react';

export const ToolsTab: React.FC = () => {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [activeTool, setActiveTool] = useState<'tuner' | 'metronome'>('tuner');

  return (
    <div
      className={`flex flex-col h-full select-none relative overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#101217] text-white' : 'bg-slate-50 text-zinc-900'
      }`}
    >
      {/* Top Segmented Tabs: Tuner vs Metronome */}
      <div
        className={`px-4 pt-3 pb-2 backdrop-blur-md border-b flex items-center justify-center ${
          isDark
            ? 'bg-[#101217]/90 border-zinc-800/60'
            : 'bg-white/90 border-zinc-200 shadow-xs'
        }`}
      >
        <div
          className={`flex p-1 rounded-2xl border w-full max-w-xs ${
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
          }`}
        >
          <button
            onClick={() => setActiveTool('tuner')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTool === 'tuner'
                ? 'bg-emerald-500 text-black shadow-md'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>{t('tune.tuner')}</span>
          </button>
          <button
            onClick={() => setActiveTool('metronome')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTool === 'metronome'
                ? 'bg-emerald-500 text-black shadow-md'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>{t('tune.metronome')}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTool === 'tuner' ? <GuitarHeadstockTuner /> : <MetronomeScreen isDark={isDark} />}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. METRONOME COMPONENT (metronome.jpg)
// -------------------------------------------------------------
const MetronomeScreen: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const [bpm, setBpm] = useState(116);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [timeSignature, setTimeSignature] = useState<'4/4' | '3/4' | '2/4' | '6/8'>('4/4');

  const timerRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  const beatsPerBar = parseInt(timeSignature.split('/')[0], 10);

  // Metronome audio pulse loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = (60 / bpm) * 1000;
      timerRef.current = window.setInterval(() => {
        setCurrentBeat((prev) => {
          const nextBeat = (prev + 1) % beatsPerBar;
          // Accented high click on beat 0
          audioEngine.playMetronomeClick(nextBeat === 0);
          return nextBeat;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, beatsPerBar]);

  // Tap Tempo calculation
  const handleTapTempo = () => {
    const now = Date.now();
    const taps = tapTimesRef.current;

    // Discard taps older than 2 seconds
    const recentTaps = taps.filter((t) => now - t < 2000);
    recentTaps.push(now);
    tapTimesRef.current = recentTaps;

    if (recentTaps.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < recentTaps.length; i++) {
        diffs.push(recentTaps[i] - recentTaps[i - 1]);
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const detectedBpm = Math.round(60000 / avgDiff);
      if (detectedBpm >= 30 && detectedBpm <= 240) {
        setBpm(detectedBpm);
      }
    }
  };

  return (
    <div className="flex flex-col items-center px-4 pb-28 pt-2 select-none">
      {/* Top BPM Display */}
      <div className="text-center my-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setBpm((b) => Math.max(30, b - 1))}
            className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 transition ${
              isDark
                ? 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:text-white'
                : 'bg-white border-zinc-200 text-zinc-700 hover:text-zinc-900 shadow-xs'
            }`}
          >
            <Minus size={18} />
          </button>
          <div>
            <span
              className={`text-5xl font-black font-mono tracking-tight ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {bpm}
            </span>
            <p
              className={`text-xs font-medium mt-0.5 ${
                isDark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
            >
              Beats per min (BPM)
            </p>
          </div>
          <button
            onClick={() => setBpm((b) => Math.min(240, b + 1))}
            className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 transition ${
              isDark
                ? 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:text-white'
                : 'bg-white border-zinc-200 text-zinc-700 hover:text-zinc-900 shadow-xs'
            }`}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Beat Dots Visualizer */}
      <div className="flex items-center gap-3 my-3">
        {Array.from({ length: beatsPerBar }).map((_, idx) => {
          const isActive = isPlaying && currentBeat === idx;
          const isAccent = idx === 0;
          return (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-75 ${
                isActive
                  ? isAccent
                    ? 'bg-emerald-400 scale-125 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                    : 'bg-emerald-500 scale-110'
                  : isDark
                  ? 'bg-zinc-800'
                  : 'bg-zinc-300'
              }`}
            />
          );
        })}
      </div>

      {/* Circular Tactile Dial matching metronome.jpg */}
      <div className="relative w-64 h-64 my-4 flex items-center justify-center">
        {/* Radial Tick markings SVG */}
        <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
          {Array.from({ length: 48 }).map((_, i) => {
            const angle = (i / 48) * 360;
            const rad = (angle * Math.PI) / 180;
            const r1 = 82;
            const r2 = i % 4 === 0 ? 94 : 88;
            const x1 = 100 + r1 * Math.cos(rad);
            const y1 = 100 + r1 * Math.sin(rad);
            const x2 = 100 + r2 * Math.cos(rad);
            const y2 = 100 + r2 * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i % 4 === 0 ? '#10b981' : isDark ? '#3f3f46' : '#cbd5e1'}
                strokeWidth={i % 4 === 0 ? 2 : 1}
              />
            );
          })}
        </svg>

        {/* Center Circular Play/Pause button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => {
              const next = !isPlaying;
              setIsPlaying(next);
              if (next) {
                audioEngine.playMetronomeClick(true);
              }
            }}
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all transform active:scale-95 ${
              isPlaying
                ? 'bg-emerald-400 text-black ring-4 ring-emerald-400/30'
                : 'bg-emerald-500 text-black hover:bg-emerald-400 ring-4 ring-emerald-500/20'
            }`}
          >
            {isPlaying ? (
              <Pause size={40} className="fill-black" />
            ) : (
              <Play size={40} className="fill-black ml-1.5" />
            )}
          </button>
        </div>
      </div>

      {/* BPM Slider bar */}
      <div className="w-full max-w-xs mb-5">
        <input
          type="range"
          min="30"
          max="240"
          value={bpm}
          onChange={(e) => setBpm(parseInt(e.target.value, 10))}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 ${
            isDark ? 'bg-zinc-800' : 'bg-zinc-300'
          }`}
        />
        <div
          className={`flex justify-between text-[10px] font-mono mt-1 ${
            isDark ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          <span>Largo (40)</span>
          <span>Andante (80)</span>
          <span>Moderato (110)</span>
          <span>Presto (180)</span>
        </div>
      </div>

      {/* Tap Tempo & Time Signature Controls matching screenshot */}
      <div className="w-full max-w-xs flex items-center justify-between gap-3">
        {/* Tap Tempo Button */}
        <button
          onClick={handleTapTempo}
          className={`flex-1 py-3 px-4 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition ${
            isDark
              ? 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700/80 text-zinc-200'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-xs'
          }`}
        >
          <Hand size={16} className="text-emerald-500" />
          <span>Tap 节奏测速</span>
        </button>

        {/* Time Signature Selector */}
        <div
          className={`flex border rounded-2xl p-1 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
          }`}
        >
          {(['4/4', '3/4', '2/4', '6/8'] as const).map((sig) => (
            <button
              key={sig}
              onClick={() => setTimeSignature(sig)}
              className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-xl transition ${
                timeSignature === sig
                  ? 'bg-emerald-500 text-black'
                  : isDark
                  ? 'text-zinc-400 hover:text-white'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {sig}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
