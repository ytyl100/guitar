import React, { useState, useEffect, useRef } from 'react';
import { GuitarStringDef } from '../types';
import { audioEngine } from '../utils/audioSynth';
import headstockPhoto from '../assets/images/tuner_headstock_body_1789654486798.jpg';
import fenderSidePhoto from '../assets/images/fender_side_headstock_1789660481620.jpg';
import {
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';

interface TuningPreset {
  name: string;
  label: string;
  strings: { note: string; octave: number; targetFreq: number }[];
}

const TUNING_PRESETS: Record<string, TuningPreset> = {
  standard: {
    name: 'standard',
    label: 'Standard (E A D G B E)',
    strings: [
      { note: 'E', octave: 2, targetFreq: 82.41 },
      { note: 'A', octave: 2, targetFreq: 110.0 },
      { note: 'D', octave: 3, targetFreq: 146.83 },
      { note: 'G', octave: 3, targetFreq: 196.0 },
      { note: 'B', octave: 3, targetFreq: 246.94 },
      { note: 'E', octave: 4, targetFreq: 329.63 },
    ],
  },
  dropD: {
    name: 'dropD',
    label: 'Drop D (D A D G B E)',
    strings: [
      { note: 'D', octave: 2, targetFreq: 73.42 },
      { note: 'A', octave: 2, targetFreq: 110.0 },
      { note: 'D', octave: 3, targetFreq: 146.83 },
      { note: 'G', octave: 3, targetFreq: 196.0 },
      { note: 'B', octave: 3, targetFreq: 246.94 },
      { note: 'E', octave: 4, targetFreq: 329.63 },
    ],
  },
  halfStepDown: {
    name: 'halfStepDown',
    label: 'Half Step Down (Eb Ab Db Gb Bb Eb)',
    strings: [
      { note: 'D#', octave: 2, targetFreq: 77.78 },
      { note: 'G#', octave: 2, targetFreq: 103.83 },
      { note: 'C#', octave: 3, targetFreq: 138.59 },
      { note: 'F#', octave: 3, targetFreq: 185.0 },
      { note: 'A#', octave: 3, targetFreq: 233.08 },
      { note: 'D#', octave: 4, targetFreq: 311.13 },
    ],
  },
  openG: {
    name: 'openG',
    label: 'Open G (D G D G B D)',
    strings: [
      { note: 'D', octave: 2, targetFreq: 73.42 },
      { note: 'G', octave: 2, targetFreq: 98.0 },
      { note: 'D', octave: 3, targetFreq: 146.83 },
      { note: 'G', octave: 3, targetFreq: 196.0 },
      { note: 'B', octave: 3, targetFreq: 246.94 },
      { note: 'D', octave: 4, targetFreq: 293.66 },
    ],
  },
};

type HeadstockStyle = 'side' | 'vector' | 'photo';

export const GuitarHeadstockTuner: React.FC = () => {
  const [selectedPresetKey] = useState<string>('standard');
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  // Default to 1st string (E4) matching side.jpg screenshot when in side mode
  const [selectedStringNum, setSelectedStringNum] = useState<number>(1);

  // Headstock styles:
  // 'side': side.jpg 同款全部单边旋转旋钮 (6-in-line 电吉他把头)
  // 'photo': 写实原木把头 (adjust.jpg 附图同款原木把头)
  const [headstockStyle, setHeadstockStyle] = useState<HeadstockStyle>('side');
  const isAutoMode = true;

  // Sub-style for side mode: 'vector' or 'photo'
  const [sideRenderMode, setSideRenderMode] = useState<'vector' | 'photo'>('vector');

  const [detectedPitch, setDetectedPitch] = useState<{
    freq: number;
    note: string;
    cents: number;
    inTune: boolean;
    isPlucked: boolean;
  }>({
    freq: 329.63,
    note: 'E',
    cents: 0,
    inTune: false,
    isPlucked: false,
  });

  const lastInTuneChimeRef = useRef<number>(0);
  const currentPreset = TUNING_PRESETS[selectedPresetKey] || TUNING_PRESETS.standard;

  // Build active string definitions based on chosen preset
  // String 6 (lowest freq, bottom) to String 1 (highest freq, top)
  const activeStrings: GuitarStringDef[] = currentPreset.strings.map((s, idx) => ({
    stringNumber: 6 - idx, // 6, 5, 4, 3, 2, 1
    noteName: s.note,
    octave: s.octave,
    targetFreq: s.targetFreq,
  }));

  // Currently selected string
  const currentStringDef =
    activeStrings.find((s) => s.stringNumber === selectedStringNum) ||
    activeStrings.find((s) => s.stringNumber === 1) ||
    activeStrings[0];

  // Handle String Pluck / Selection
  const handleSelectString = (stringNum: number) => {
    setSelectedStringNum(stringNum);
    const target = activeStrings.find((s) => s.stringNumber === stringNum);
    if (target) {
      setDetectedPitch({
        freq: target.targetFreq,
        note: target.noteName,
        cents: 0,
        inTune: true,
        isPlucked: true,
      });
      // Play acoustic / electric guitar string tone
      audioEngine.playString(target.targetFreq, 2.6);
      setTimeout(() => {
        setDetectedPitch((prev) => ({ ...prev, isPlucked: false }));
      }, 1500);
    }
  };

  // Toggle Microphone Pitch Detection
  const toggleMic = async () => {
    if (isMicActive) {
      audioEngine.stopListening();
      setIsMicActive(false);
      setDetectedPitch((prev) => ({ ...prev, isPlucked: false }));
    } else {
      const ok = await audioEngine.startListening((info) => {
        if (isAutoMode) {
          // Find closest string in current preset
          const closest = activeStrings.reduce((prev, curr) =>
            Math.abs(curr.targetFreq - info.freq) < Math.abs(prev.targetFreq - info.freq)
              ? curr
              : prev
          );
          setSelectedStringNum(closest.stringNumber);

          const centsOffset = Math.round(1200 * Math.log2(info.freq / closest.targetFreq));
          const clampedCents = Math.max(-50, Math.min(50, centsOffset));
          const isInTune = Math.abs(clampedCents) <= 3;

          if (isInTune && Date.now() - lastInTuneChimeRef.current > 2500) {
            audioEngine.playTuneSuccessChime();
            lastInTuneChimeRef.current = Date.now();
          }

          setDetectedPitch({
            freq: info.freq,
            note: info.note,
            cents: clampedCents,
            inTune: isInTune,
            isPlucked: true,
          });
        } else {
          // Manual mode: compare strictly to current selected string
          const centsOffset = Math.round(1200 * Math.log2(info.freq / currentStringDef.targetFreq));
          const clampedCents = Math.max(-50, Math.min(50, centsOffset));
          const isInTune = Math.abs(clampedCents) <= 3;

          if (isInTune && Date.now() - lastInTuneChimeRef.current > 2500) {
            audioEngine.playTuneSuccessChime();
            lastInTuneChimeRef.current = Date.now();
          }

          setDetectedPitch({
            freq: info.freq,
            note: info.note,
            cents: clampedCents,
            inTune: isInTune,
            isPlucked: true,
          });
        }
      });

      setIsMicActive(ok);
      if (!ok) {
        alert('请允许浏览器使用麦克风权限以开启调音功能！');
      }
    }
  };

  useEffect(() => {
    return () => {
      audioEngine.stopListening();
    };
  }, []);

  // String lists for different headstock styles:
  // 1. Single-sided 6-in-line (side.jpg): All 6 notes on the left column from top (1E) to bottom (6E)
  const inlineStrings = [
    activeStrings.find((s) => s.stringNumber === 1)!, // High E
    activeStrings.find((s) => s.stringNumber === 2)!, // B
    activeStrings.find((s) => s.stringNumber === 3)!, // G
    activeStrings.find((s) => s.stringNumber === 4)!, // D
    activeStrings.find((s) => s.stringNumber === 5)!, // A
    activeStrings.find((s) => s.stringNumber === 6)!, // Low E
  ];

  // 2. Symmetric 3+3 (adjust.jpg / 3D vector): Left = 4D, 5A, 6E; Right = 3G, 2B, 1E
  const leftStrings = [
    activeStrings.find((s) => s.stringNumber === 4)!, // D
    activeStrings.find((s) => s.stringNumber === 5)!, // A
    activeStrings.find((s) => s.stringNumber === 6)!, // E
  ];

  const rightStrings = [
    activeStrings.find((s) => s.stringNumber === 3)!, // G
    activeStrings.find((s) => s.stringNumber === 2)!, // B
    activeStrings.find((s) => s.stringNumber === 1)!, // E
  ];

  // Deviation needle calculation: -50 to +50 cents mapping to -85px to +85px
  const needleOffsetPx = (detectedPitch.cents / 50) * 85;

  return (
    <div className="flex flex-col items-center px-4 pb-24 pt-2 select-none relative min-h-full">
      {/* Blueprint Grid Canvas Area (Pitch Gauge Area) */}
      <div
        className="w-full max-w-sm relative rounded-3xl pt-2.5 pb-4 flex flex-col items-center overflow-hidden border border-zinc-800/80 mb-2"
        style={{
          background: '#12151b',
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      >
        {/* Center vertical guide line */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-zinc-700/50 pointer-events-none" />

        {/* Headstock Style Selector Bar (Switch between side.jpg and adjust.jpg) */}
        <div className="w-full px-3 z-20 mb-2">
          <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800/90 p-1 rounded-2xl gap-1.5">
            {/* 1. side.jpg 单边旋钮 */}
            <button
              onClick={() => setHeadstockStyle('side')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                headstockStyle === 'side'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="单边旋钮琴头 (side.jpg 同款)"
            >
              <Sparkles size={13} className={headstockStyle === 'side' ? 'text-amber-400' : 'text-zinc-500'} />
              <span>单边旋钮</span>
            </button>

            {/* 2. 写实原木 (adjust.jpg) */}
            <button
              onClick={() => setHeadstockStyle('photo')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                headstockStyle === 'photo'
                  ? 'bg-blue-500/25 text-blue-300 border border-blue-500/50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="写实原木琴头 (adjust.jpg 同款)"
            >
              <ImageIcon size={13} className={headstockStyle === 'photo' ? 'text-blue-400' : 'text-zinc-500'} />
              <span>写实原木</span>
            </button>
          </div>
        </div>

        {/* Pitch Needle Scale Area (♭ on left, # on right, circular teardrop target in center) */}
        <div className="w-full px-6 flex items-center justify-between relative my-1 z-10">
          {/* Flat ♭ Symbol */}
          <span
            className={`font-serif text-3xl font-bold transition-colors select-none ${
              detectedPitch.isPlucked && detectedPitch.cents < -4
                ? 'text-amber-400 font-extrabold scale-110 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                : 'text-zinc-600'
            }`}
          >
            ♭
          </span>

          {/* Center Circular Teardrop Target matching reference image */}
          <div className="relative flex flex-col items-center">
            {/* Target Ring that smoothly shifts horizontally */}
            <div
              className="relative transition-transform duration-100 ease-out flex flex-col items-center"
              style={{
                transform: `translateX(${needleOffsetPx}px)`,
              }}
            >
              {/* Circular Target */}
              <div
                className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-200 ${
                  detectedPitch.inTune
                    ? 'border-emerald-400 bg-emerald-400 text-black shadow-[0_0_28px_rgba(52,211,153,0.9)] scale-110'
                    : detectedPitch.isPlucked
                    ? 'border-white bg-zinc-800 text-white shadow-lg'
                    : 'border-zinc-400 bg-transparent text-white'
                }`}
              >
                {detectedPitch.inTune ? (
                  <CheckCircle2 size={24} className="text-black stroke-[2.5]" />
                ) : (
                  <span className="text-xl font-mono font-black">
                    {detectedPitch.isPlucked ? detectedPitch.note : currentStringDef.noteName}
                  </span>
                )}
              </div>

              {/* Pointed downward tip of teardrop */}
              <div
                className={`w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[8px] -mt-[1px] transition-colors ${
                  detectedPitch.inTune
                    ? 'border-t-emerald-400'
                    : detectedPitch.isPlucked
                    ? 'border-t-white'
                    : 'border-t-zinc-400'
                }`}
              />
            </div>
          </div>

          {/* Sharp # Symbol */}
          <span
            className={`font-sans text-3xl font-bold transition-colors select-none ${
              detectedPitch.isPlucked && detectedPitch.cents > 4
                ? 'text-amber-400 font-extrabold scale-110 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                : 'text-zinc-600'
            }`}
          >
            #
          </span>
        </div>

        {/* Status Prompt Pill (matching 'Start tuning by playing any string') */}
        <div className="mt-2 z-10 px-4">
          <div className="bg-[#181d26]/90 border border-zinc-700/80 px-4 py-1.5 rounded-2xl shadow-md text-center backdrop-blur-md min-w-[240px]">
            {!isMicActive && !detectedPitch.isPlucked ? (
              <span className="text-xs text-zinc-300 font-medium flex items-center justify-center gap-1.5">
                <span>Start tuning by playing any string</span>
              </span>
            ) : detectedPitch.inTune ? (
              <span className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> 音准完美 (In Tune) · {detectedPitch.freq}Hz
              </span>
            ) : detectedPitch.cents < -3 ? (
              <span className="text-xs text-amber-300 font-semibold">
                偏低 ♭ 请顺时针调紧琴钮 (+{Math.abs(detectedPitch.cents)}¢)
              </span>
            ) : detectedPitch.cents > 3 ? (
              <span className="text-xs text-amber-300 font-semibold">
                偏高 ♯ 请逆时针松开琴钮 (-{detectedPitch.cents}¢)
              </span>
            ) : (
              <span className="text-xs text-zinc-300">
                请弹响吉他琴弦...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* GUITAR HEADSTOCK DISPLAY CONTAINER */}
      {/* ------------------------------------------------------------- */}
      <div className="w-full max-w-sm relative flex items-center justify-center my-1 h-[375px]">
        {/* ============================================================= */}
        {/* OPTION 1: side.jpg 全部单边旋转旋钮 (6-in-line 单边琴头) */}
        {/* ============================================================= */}
        {headstockStyle === 'side' && (
          <div className="relative w-full h-full flex items-center justify-between">
            {/* Left 6 Note Circles (E, B, G, D, A, E) stacked vertically matching side.jpg */}
            <div className="absolute left-2 inset-y-0 flex flex-col justify-between py-3 z-30">
              {inlineStrings.map((str) => {
                const isSelected = selectedStringNum === str.stringNumber;
                return (
                  <button
                    key={str.stringNumber}
                    onClick={() => handleSelectString(str.stringNumber)}
                    className={`w-11 h-11 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 shadow-xl ${
                      isSelected
                        ? 'bg-white text-zinc-950 font-black text-xl scale-110 ring-4 ring-emerald-400/80 shadow-[0_0_24px_rgba(255,255,255,0.9)]'
                        : 'bg-[#181c25]/90 border border-zinc-700/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#222734]'
                    }`}
                    title={`点击调音/试听 ${str.stringNumber}弦 (${str.noteName})`}
                  >
                    <span className={isSelected ? 'text-xl font-black' : 'text-base font-bold'}>
                      {str.noteName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sub-mode selector inside side view (Vector vs Photo) */}
            <div className="absolute top-1 right-2 z-30">
              <button
                onClick={() => setSideRenderMode(sideRenderMode === 'vector' ? 'photo' : 'vector')}
                className="text-[10px] bg-zinc-900/90 text-zinc-300 hover:text-white border border-zinc-700/80 px-2 py-0.5 rounded-lg shadow transition flex items-center gap-1"
                title="切换单边把头：3D精绘 / 写实照片"
              >
                <span>{sideRenderMode === 'vector' ? '3D精绘' : '照片'}</span>
              </button>
            </div>

            {/* Right side: 6-in-line Headstock */}
            <div className="w-full h-full flex items-center justify-end pr-1 pl-12 overflow-visible">
              {sideRenderMode === 'vector' ? (
                /* --------------------------------------------------------- */
                /* HIGH-PRECISION 3D VECTOR 6-IN-LINE HEADSTOCK (side.jpg)   */
                /* --------------------------------------------------------- */
                <svg
                  viewBox="0 0 280 380"
                  className="w-full h-full max-w-[270px] drop-shadow-2xl overflow-visible pointer-events-none"
                >
                  <defs>
                    {/* Blonde Amber Maple Wood Gradient (side.jpg exact tone) */}
                    <linearGradient id="sideMapleWood" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f3ca8c" />
                      <stop offset="25%" stopColor="#e5b169" />
                      <stop offset="65%" stopColor="#cf964a" />
                      <stop offset="100%" stopColor="#9a672c" />
                    </linearGradient>

                    {/* Maple Bevel Highlight */}
                    <linearGradient id="mapleBevel" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#fff2dc" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#8d561d" stopOpacity="0.3" />
                    </linearGradient>

                    {/* Metallic Chrome Key Gradient */}
                    <linearGradient id="chromeKeyGrad" x1="0%" y1="0%" x2="100%" y2="50%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="30%" stopColor="#cbd5e1" />
                      <stop offset="65%" stopColor="#64748b" />
                      <stop offset="90%" stopColor="#334155" />
                      <stop offset="100%" stopColor="#f8fafc" />
                    </linearGradient>

                    {/* Active Illuminated Peg Button Gradient (like top E in side.jpg) */}
                    <linearGradient id="activeSidePegGrad" x1="0%" y1="0%" x2="100%" y2="50%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#f8fafc" />
                      <stop offset="85%" stopColor="#e2e8f0" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>

                    {/* Chrome Post Gradient */}
                    <linearGradient id="sidePostGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#94a3b8" />
                      <stop offset="100%" stopColor="#334155" />
                    </linearGradient>

                    {/* Active Glow Filter */}
                    <filter id="pegGlowFilter" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="4.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 1. Rosewood Fretboard Neck (品格指板) extending downwards */}
                  <rect x="110" y="310" width="80" height="70" fill="#201108" />
                  {/* Nickel Frets */}
                  <line x1="110" y1="334" x2="190" y2="334" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="110" y1="362" x2="190" y2="362" stroke="#94a3b8" strokeWidth="2.5" />

                  {/* 2. ALL 6 TUNING MACHINE PEGS (On the left side pointing towards notes) */}
                  {[
                    { stringNum: 1, keyX: 30, cy: 56, postX: 96, postY: 56 },
                    { stringNum: 2, keyX: 34, cy: 106, postX: 100, postY: 106 },
                    { stringNum: 3, keyX: 38, cy: 156, postX: 104, postY: 156 },
                    { stringNum: 4, keyX: 42, cy: 206, postX: 108, postY: 206 },
                    { stringNum: 5, keyX: 46, cy: 256, postX: 112, postY: 256 },
                    { stringNum: 6, keyX: 50, cy: 306, postX: 116, postY: 306 },
                  ].map((peg) => {
                    const isSelected = selectedStringNum === peg.stringNum;
                    return (
                      <g key={peg.stringNum}>
                        {/* Chrome Key Shaft extending from edge of headstock */}
                        <rect
                          x={peg.keyX + 12}
                          y={peg.cy - 3}
                          width={peg.postX - peg.keyX - 16}
                          height="6"
                          rx="1.5"
                          fill="url(#chromeKeyGrad)"
                        />

                        {/* Tuning Machine Key Button (Rounded Rectangular/Oval Peg) */}
                        <ellipse
                          cx={peg.keyX}
                          cy={peg.cy}
                          rx={isSelected ? 16 : 14}
                          ry={isSelected ? 10.5 : 9}
                          fill={isSelected ? 'url(#activeSidePegGrad)' : 'url(#chromeKeyGrad)'}
                          stroke={isSelected ? '#ffffff' : '#cbd5e1'}
                          strokeWidth={isSelected ? 2.5 : 1}
                          filter={isSelected ? 'url(#pegGlowFilter)' : 'none'}
                        />
                      </g>
                    );
                  })}

                  {/* 3. FENDER STRATOCASTER HEADSTOCK WOODEN BODY */}
                  <path
                    d="
                      M 110 310
                      L 74 298
                      L 68 248
                      L 62 198
                      L 56 148
                      L 50 98
                      L 44 48
                      C 44 18, 76 10, 102 14
                      C 134 18, 150 44, 142 72
                      C 136 94, 126 112, 130 138
                      C 136 174, 140 240, 146 295
                      L 190 310
                      Z
                    "
                    fill="url(#sideMapleWood)"
                    stroke="#fce7c8"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />

                  {/* Headstock 3D Bevel Edge Reflection */}
                  <path
                    d="
                      M 110 308
                      L 76 296
                      L 70 246
                      L 64 196
                      L 58 146
                      L 52 96
                      L 46 48
                      C 46 22, 76 14, 100 17
                      C 130 20, 145 44, 138 70
                    "
                    fill="none"
                    stroke="url(#mapleBevel)"
                    strokeWidth="2"
                  />

                  {/* Subtle Natural Maple Grain Curvature */}
                  {[60, 75, 90, 105, 120, 135].map((gx) => (
                    <path
                      key={gx}
                      d={`M ${gx} 30 C ${gx + 12} 110, ${gx - 10} 210, ${gx + 8} 300`}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.08)"
                      strokeWidth="1.2"
                    />
                  ))}

                  {/* 4. Bone Nut (弦枕) at the base */}
                  <rect
                    x="108"
                    y="304"
                    width="84"
                    height="10"
                    rx="2"
                    fill="#fbf7ee"
                    stroke="#d4cebe"
                    strokeWidth="1"
                  />

                  {/* 5. STRING TREE (压弦扣/导弦扣) between 1E/2B strings, matching side.jpg */}
                  <g>
                    {/* Metal bracket */}
                    <rect x="127" y="112" width="10" height="7" rx="1.5" fill="url(#chromeKeyGrad)" stroke="#64748b" strokeWidth="0.8" />
                    {/* Center screw */}
                    <circle cx="132" cy="115.5" r="1.5" fill="#1e293b" />
                    <line x1="130.8" y1="115.5" x2="133.2" y2="115.5" stroke="#94a3b8" strokeWidth="0.6" />
                  </g>

                  {/* 6. TUNING POSTS (金属弦柱) ON THE FACE */}
                  {[
                    { stringNum: 1, cx: 96, cy: 56 },
                    { stringNum: 2, cx: 100, cy: 106 },
                    { stringNum: 3, cx: 104, cy: 156 },
                    { stringNum: 4, cx: 108, cy: 206 },
                    { stringNum: 5, cx: 112, cy: 256 },
                    { stringNum: 6, cx: 116, cy: 306 },
                  ].map((post) => (
                    <g key={post.stringNum}>
                      <circle cx={post.cx} cy={post.cy} r="6.5" fill="url(#sidePostGrad)" stroke="#f8fafc" strokeWidth="1.2" />
                      <circle cx={post.cx} cy={post.cy} r="2.8" fill="#0f172a" />
                    </g>
                  ))}

                  {/* 7. THE 6 GUITAR STRINGS (Running from fretboard/nut to posts) */}
                  {/* String 6 (Low E, 82.41Hz, wound bronze) */}
                  <g>
                    <line
                      x1="120"
                      y1="380"
                      x2="120"
                      y2="304"
                      stroke={selectedStringNum === 6 ? '#34d399' : '#d97706'}
                      strokeWidth={selectedStringNum === 6 ? 3.8 : 3.2}
                      filter={selectedStringNum === 6 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="120"
                      y1="304"
                      x2="116"
                      y2="306"
                      stroke={selectedStringNum === 6 ? '#34d399' : '#d97706'}
                      strokeWidth={selectedStringNum === 6 ? 3.8 : 3.2}
                      filter={selectedStringNum === 6 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>

                  {/* String 5 (A, 110.0Hz, wound bronze) */}
                  <g>
                    <line
                      x1="132"
                      y1="380"
                      x2="132"
                      y2="304"
                      stroke={selectedStringNum === 5 ? '#34d399' : '#f59e0b'}
                      strokeWidth={selectedStringNum === 5 ? 3.4 : 2.7}
                      filter={selectedStringNum === 5 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="132"
                      y1="304"
                      x2="112"
                      y2="256"
                      stroke={selectedStringNum === 5 ? '#34d399' : '#f59e0b'}
                      strokeWidth={selectedStringNum === 5 ? 3.4 : 2.7}
                      filter={selectedStringNum === 5 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>

                  {/* String 4 (D, 146.83Hz, wound bronze) */}
                  <g>
                    <line
                      x1="144"
                      y1="380"
                      x2="144"
                      y2="304"
                      stroke={selectedStringNum === 4 ? '#34d399' : '#fbbf24'}
                      strokeWidth={selectedStringNum === 4 ? 3.0 : 2.2}
                      filter={selectedStringNum === 4 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="144"
                      y1="304"
                      x2="108"
                      y2="206"
                      stroke={selectedStringNum === 4 ? '#34d399' : '#fbbf24'}
                      strokeWidth={selectedStringNum === 4 ? 3.0 : 2.2}
                      filter={selectedStringNum === 4 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>

                  {/* String 3 (G, 196.0Hz, plain steel) */}
                  <g>
                    <line
                      x1="156"
                      y1="380"
                      x2="156"
                      y2="304"
                      stroke={selectedStringNum === 3 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 3 ? 2.6 : 1.7}
                      filter={selectedStringNum === 3 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="156"
                      y1="304"
                      x2="104"
                      y2="156"
                      stroke={selectedStringNum === 3 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 3 ? 2.6 : 1.7}
                      filter={selectedStringNum === 3 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>

                  {/* String 2 (B, 246.94Hz, plain steel) -> passes through string tree */}
                  <g>
                    <line
                      x1="168"
                      y1="380"
                      x2="168"
                      y2="304"
                      stroke={selectedStringNum === 2 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 2 ? 2.3 : 1.4}
                      filter={selectedStringNum === 2 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="168"
                      y1="304"
                      x2="132"
                      y2="119"
                      stroke={selectedStringNum === 2 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 2 ? 2.3 : 1.4}
                      filter={selectedStringNum === 2 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="132"
                      y1="119"
                      x2="100"
                      y2="106"
                      stroke={selectedStringNum === 2 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 2 ? 2.3 : 1.4}
                      filter={selectedStringNum === 2 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>

                  {/* String 1 (High E, 329.63Hz, plain steel) -> passes through string tree */}
                  <g>
                    <line
                      x1="180"
                      y1="380"
                      x2="180"
                      y2="304"
                      stroke={selectedStringNum === 1 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 1 ? 2.2 : 1.1}
                      filter={selectedStringNum === 1 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="180"
                      y1="304"
                      x2="132"
                      y2="119"
                      stroke={selectedStringNum === 1 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 1 ? 2.2 : 1.1}
                      filter={selectedStringNum === 1 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                    <line
                      x1="132"
                      y1="119"
                      x2="96"
                      y2="56"
                      stroke={selectedStringNum === 1 ? '#ffffff' : '#e2e8f0'}
                      strokeWidth={selectedStringNum === 1 ? 2.2 : 1.1}
                      filter={selectedStringNum === 1 ? 'url(#pegGlowFilter)' : 'none'}
                    />
                  </g>
                </svg>
              ) : (
                /* --------------------------------------------------------- */
                /* PHOTOGRAPHIC ASSET 6-IN-LINE HEADSTOCK (with glow flares) */
                /* --------------------------------------------------------- */
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={fenderSidePhoto}
                    alt="6-in-line Fender Headstock"
                    className="h-[360px] max-w-[240px] object-contain drop-shadow-[0_15px_35px_rgba(0,0,0,0.9)] select-none pointer-events-none rounded-xl"
                    referrerPolicy="no-referrer"
                  />

                  {/* Interactive Glowing Flares on the active peg */}
                  {selectedStringNum === 1 && (
                    <div
                      className="absolute top-[48px] left-[55px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                  {selectedStringNum === 2 && (
                    <div
                      className="absolute top-[96px] left-[58px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                  {selectedStringNum === 3 && (
                    <div
                      className="absolute top-[146px] left-[62px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                  {selectedStringNum === 4 && (
                    <div
                      className="absolute top-[194px] left-[66px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                  {selectedStringNum === 5 && (
                    <div
                      className="absolute top-[242px] left-[70px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                  {selectedStringNum === 6 && (
                    <div
                      className="absolute top-[290px] left-[74px] w-8 h-8 rounded-full bg-white/50 blur-md pointer-events-none animate-pulse"
                      style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.9)' }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* OPTION 2: 3D立体精绘 (保留 原版 3+3 双侧对称精绘把头) */}
        {/* ============================================================= */}
        {headstockStyle === 'vector' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Left 3 Note Circles (D, A, E) */}
            <div className="absolute left-2 inset-y-0 flex flex-col justify-between py-6 z-30">
              {leftStrings.map((str) => {
                const isSelected = selectedStringNum === str.stringNumber;
                return (
                  <button
                    key={str.stringNumber}
                    onClick={() => handleSelectString(str.stringNumber)}
                    className={`w-13 h-13 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 shadow-2xl ${
                      isSelected
                        ? 'bg-white text-zinc-950 font-black text-2xl scale-110 ring-4 ring-emerald-400/80 shadow-[0_0_28px_rgba(255,255,255,0.75)]'
                        : 'bg-[#1b1e26]/90 border border-zinc-700/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#252a35]'
                    }`}
                    title={`点击调音/试听 ${str.stringNumber}弦 (${str.noteName})`}
                  >
                    <span className={isSelected ? 'text-2xl font-black' : 'text-lg font-bold'}>
                      {str.noteName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right 3 Note Circles (G, B, E) */}
            <div className="absolute right-2 inset-y-0 flex flex-col justify-between py-6 z-30">
              {rightStrings.map((str) => {
                const isSelected = selectedStringNum === str.stringNumber;
                return (
                  <button
                    key={str.stringNumber}
                    onClick={() => handleSelectString(str.stringNumber)}
                    className={`w-13 h-13 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 shadow-2xl ${
                      isSelected
                        ? 'bg-white text-zinc-950 font-black text-2xl scale-110 ring-4 ring-emerald-400/80 shadow-[0_0_28px_rgba(255,255,255,0.75)]'
                        : 'bg-[#1b1e26]/90 border border-zinc-700/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#252a35]'
                    }`}
                    title={`点击调音/试听 ${str.stringNumber}弦 (${str.noteName})`}
                  >
                    <span className={isSelected ? 'text-2xl font-black' : 'text-lg font-bold'}>
                      {str.noteName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 3D High-Precision Vector Symmetrical Headstock */}
            <svg
              viewBox="0 0 320 370"
              className="w-full h-full max-w-[290px] drop-shadow-2xl overflow-visible pointer-events-none"
            >
              <defs>
                {/* Acoustic Mahogany Wood Grain Gradient */}
                <linearGradient id="headstockWood" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7a3416" />
                  <stop offset="25%" stopColor="#5c260f" />
                  <stop offset="60%" stopColor="#3d1808" />
                  <stop offset="100%" stopColor="#240c03" />
                </linearGradient>

                {/* Chrome Metallic Peg Button Gradient */}
                <linearGradient id="chromePegGrad" x1="0%" y1="0%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="35%" stopColor="#cbd5e1" />
                  <stop offset="70%" stopColor="#64748b" />
                  <stop offset="90%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#e2e8f0" />
                </linearGradient>

                {/* Active Glowing Peg Button Gradient */}
                <linearGradient id="activeChromePegGrad" x1="0%" y1="0%" x2="100%" y2="60%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="40%" stopColor="#f1f5f9" />
                  <stop offset="80%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>

                {/* Tuning Post Gradient */}
                <linearGradient id="postGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="50%" stopColor="#94a3b8" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>

                {/* String Glow Filter */}
                <filter id="glowEffect" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* 1. Rosewood Fretboard Neck */}
              <rect x="112" y="302" width="96" height="68" fill="#1c0f08" />
              {/* Frets */}
              <line x1="112" y1="324" x2="208" y2="324" stroke="#94a3b8" strokeWidth="2.5" />
              <line x1="112" y1="352" x2="208" y2="352" stroke="#94a3b8" strokeWidth="2.5" />

              {/* 2. CHROME TUNING MACHINE KEYS (Left 3 & Right 3) */}
              {/* 4D Chrome Peg Button (Left Top, y=105) */}
              <g>
                <rect x="68" y="102" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="65"
                  cy="105"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 4 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#cbd5e1"
                  strokeWidth={selectedStringNum === 4 ? 2 : 1}
                  filter={selectedStringNum === 4 ? 'drop-shadow(0 0 10px rgba(255,255,255,0.8))' : 'none'}
                />
              </g>

              {/* 3G Chrome Peg Button (Right Top, y=105) */}
              <g>
                <rect x="230" y="102" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="255"
                  cy="105"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 3 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#ffffff"
                  strokeWidth={selectedStringNum === 3 ? 2.5 : 1}
                  filter={selectedStringNum === 3 ? 'drop-shadow(0 0 14px rgba(255,255,255,0.95))' : 'none'}
                />
              </g>

              {/* Level 2: 5A (Left Middle, y=175) & 2B (Right Middle, y=175) */}
              <g>
                <rect x="68" y="172" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="65"
                  cy="175"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 5 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#cbd5e1"
                  strokeWidth={selectedStringNum === 5 ? 2 : 1}
                  filter={selectedStringNum === 5 ? 'drop-shadow(0 0 10px rgba(255,255,255,0.8))' : 'none'}
                />
              </g>

              <g>
                <rect x="230" y="172" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="255"
                  cy="175"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 2 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#cbd5e1"
                  strokeWidth={selectedStringNum === 2 ? 2 : 1}
                  filter={selectedStringNum === 2 ? 'drop-shadow(0 0 10px rgba(255,255,255,0.8))' : 'none'}
                />
              </g>

              {/* Level 3: 6E (Left Bottom, y=245) & 1E (Right Bottom, y=245) */}
              <g>
                <rect x="68" y="242" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="65"
                  cy="245"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 6 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#cbd5e1"
                  strokeWidth={selectedStringNum === 6 ? 2 : 1}
                  filter={selectedStringNum === 6 ? 'drop-shadow(0 0 10px rgba(255,255,255,0.8))' : 'none'}
                />
              </g>

              <g>
                <rect x="230" y="242" width="22" height="6" rx="2" fill="url(#chromePegGrad)" />
                <ellipse
                  cx="255"
                  cy="245"
                  rx="18"
                  ry="12"
                  fill={selectedStringNum === 1 ? 'url(#activeChromePegGrad)' : 'url(#chromePegGrad)'}
                  stroke="#cbd5e1"
                  strokeWidth={selectedStringNum === 1 ? 2 : 1}
                  filter={selectedStringNum === 1 ? 'drop-shadow(0 0 10px rgba(255,255,255,0.8))' : 'none'}
                />
              </g>

              {/* 3. HEADSTOCK WOODEN BODY */}
              <path
                d="
                  M 112 305
                  L 88 115
                  C 88 68, 114 42, 142 56
                  C 152 61, 168 61, 178 56
                  C 206 42, 232 68, 232 115
                  L 208 305
                  Z
                "
                fill="url(#headstockWood)"
                stroke="#f5ede0"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />

              {/* Headstock Inner Dark Pinstripe Binding */}
              <path
                d="
                  M 114 303
                  L 91 116
                  C 91 71, 115 47, 141 60
                  C 151 64, 169 64, 179 60
                  C 205 47, 229 71, 229 116
                  L 206 303
                "
                fill="none"
                stroke="#200d05"
                strokeWidth="1.5"
              />

              {/* Wood Grain Lines */}
              {[105, 120, 135, 150, 165, 180, 195, 210].map((x) => (
                <line
                  key={x}
                  x1={x}
                  y1="75"
                  x2={x + (x > 160 ? -10 : 10)}
                  y2="295"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1.2"
                />
              ))}

              {/* 4. Ebony Truss Rod Cover */}
              <path
                d="M 152 288 C 152 265, 160 252, 160 252 C 160 252, 168 265, 168 288 Z"
                fill="#111827"
                stroke="#374151"
                strokeWidth="0.8"
              />
              <circle cx="160" cy="256" r="1.5" fill="#e2e8f0" />

              {/* 5. Bone Nut */}
              <rect
                x="110"
                y="298"
                width="100"
                height="11"
                rx="2.5"
                fill="#faf7f0"
                stroke="#d4cfc3"
                strokeWidth="1"
              />

              {/* 6. TUNING POSTS */}
              <circle cx="114" cy="105" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="114" cy="105" r="3.2" fill="#0f172a" />
              <circle cx="114" cy="175" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="114" cy="175" r="3.2" fill="#0f172a" />
              <circle cx="114" cy="245" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="114" cy="245" r="3.2" fill="#0f172a" />

              <circle cx="206" cy="105" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="206" cy="105" r="3.2" fill="#0f172a" />
              <circle cx="206" cy="175" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="206" cy="175" r="3.2" fill="#0f172a" />
              <circle cx="206" cy="245" r="7" fill="url(#postGrad)" stroke="#f8fafc" strokeWidth="1.2" />
              <circle cx="206" cy="245" r="3.2" fill="#0f172a" />

              {/* 7. THE 6 GUITAR STRINGS */}
              {/* String 6 (E) */}
              <g>
                <line
                  x1="124"
                  y1="370"
                  x2="124"
                  y2="298"
                  stroke={selectedStringNum === 6 ? '#34d399' : '#d97706'}
                  strokeWidth={selectedStringNum === 6 ? 3.6 : 3.0}
                  filter={selectedStringNum === 6 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="124"
                  y1="298"
                  x2="114"
                  y2="245"
                  stroke={selectedStringNum === 6 ? '#34d399' : '#d97706'}
                  strokeWidth={selectedStringNum === 6 ? 3.6 : 3.0}
                  filter={selectedStringNum === 6 ? 'url(#glowEffect)' : 'none'}
                />
              </g>

              {/* String 5 (A) */}
              <g>
                <line
                  x1="138"
                  y1="370"
                  x2="138"
                  y2="298"
                  stroke={selectedStringNum === 5 ? '#34d399' : '#f59e0b'}
                  strokeWidth={selectedStringNum === 5 ? 3.2 : 2.5}
                  filter={selectedStringNum === 5 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="138"
                  y1="298"
                  x2="114"
                  y2="175"
                  stroke={selectedStringNum === 5 ? '#34d399' : '#f59e0b'}
                  strokeWidth={selectedStringNum === 5 ? 3.2 : 2.5}
                  filter={selectedStringNum === 5 ? 'url(#glowEffect)' : 'none'}
                />
              </g>

              {/* String 4 (D) */}
              <g>
                <line
                  x1="152"
                  y1="370"
                  x2="152"
                  y2="298"
                  stroke={selectedStringNum === 4 ? '#34d399' : '#fbbf24'}
                  strokeWidth={selectedStringNum === 4 ? 2.8 : 2.0}
                  filter={selectedStringNum === 4 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="152"
                  y1="298"
                  x2="114"
                  y2="105"
                  stroke={selectedStringNum === 4 ? '#34d399' : '#fbbf24'}
                  strokeWidth={selectedStringNum === 4 ? 2.8 : 2.0}
                  filter={selectedStringNum === 4 ? 'url(#glowEffect)' : 'none'}
                />
              </g>

              {/* String 3 (G) */}
              <g>
                <line
                  x1="168"
                  y1="370"
                  x2="168"
                  y2="298"
                  stroke={selectedStringNum === 3 ? '#ffffff' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 3 ? 2.6 : 1.7}
                  filter={selectedStringNum === 3 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="168"
                  y1="298"
                  x2="206"
                  y2="105"
                  stroke={selectedStringNum === 3 ? '#ffffff' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 3 ? 2.6 : 1.7}
                  filter={selectedStringNum === 3 ? 'url(#glowEffect)' : 'none'}
                />
              </g>

              {/* String 2 (B) */}
              <g>
                <line
                  x1="182"
                  y1="370"
                  x2="182"
                  y2="298"
                  stroke={selectedStringNum === 2 ? '#34d399' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 2 ? 2.2 : 1.4}
                  filter={selectedStringNum === 2 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="182"
                  y1="298"
                  x2="206"
                  y2="175"
                  stroke={selectedStringNum === 2 ? '#34d399' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 2 ? 2.2 : 1.4}
                  filter={selectedStringNum === 2 ? 'url(#glowEffect)' : 'none'}
                />
              </g>

              {/* String 1 (E) */}
              <g>
                <line
                  x1="196"
                  y1="370"
                  x2="196"
                  y2="298"
                  stroke={selectedStringNum === 1 ? '#34d399' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 1 ? 2.0 : 1.1}
                  filter={selectedStringNum === 1 ? 'url(#glowEffect)' : 'none'}
                />
                <line
                  x1="196"
                  y1="298"
                  x2="206"
                  y2="245"
                  stroke={selectedStringNum === 1 ? '#34d399' : '#e2e8f0'}
                  strokeWidth={selectedStringNum === 1 ? 2.0 : 1.1}
                  filter={selectedStringNum === 1 ? 'url(#glowEffect)' : 'none'}
                />
              </g>
            </svg>
          </div>
        )}

        {/* ============================================================= */}
        {/* OPTION 3: 写实原木把头 (adjust.jpg 附图同款写实原木把头) */}
        {/* ============================================================= */}
        {headstockStyle === 'photo' && (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Left 3 Note Circles (D, A, E) */}
            <div className="absolute left-2 inset-y-0 flex flex-col justify-between py-6 z-30">
              {leftStrings.map((str) => {
                const isSelected = selectedStringNum === str.stringNumber;
                return (
                  <button
                    key={str.stringNumber}
                    onClick={() => handleSelectString(str.stringNumber)}
                    className={`w-13 h-13 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 shadow-2xl ${
                      isSelected
                        ? 'bg-white text-zinc-950 font-black text-2xl scale-110 ring-4 ring-emerald-400/80 shadow-[0_0_28px_rgba(255,255,255,0.75)]'
                        : 'bg-[#1b1e26]/90 border border-zinc-700/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#252a35]'
                    }`}
                    title={`点击调音/试听 ${str.stringNumber}弦 (${str.noteName})`}
                  >
                    <span className={isSelected ? 'text-2xl font-black' : 'text-lg font-bold'}>
                      {str.noteName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right 3 Note Circles (G, B, E) */}
            <div className="absolute right-2 inset-y-0 flex flex-col justify-between py-6 z-30">
              {rightStrings.map((str) => {
                const isSelected = selectedStringNum === str.stringNumber;
                return (
                  <button
                    key={str.stringNumber}
                    onClick={() => handleSelectString(str.stringNumber)}
                    className={`w-13 h-13 rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 shadow-2xl ${
                      isSelected
                        ? 'bg-white text-zinc-950 font-black text-2xl scale-110 ring-4 ring-emerald-400/80 shadow-[0_0_28px_rgba(255,255,255,0.75)]'
                        : 'bg-[#1b1e26]/90 border border-zinc-700/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#252a35]'
                    }`}
                    title={`点击调音/试听 ${str.stringNumber}弦 (${str.noteName})`}
                  >
                    <span className={isSelected ? 'text-2xl font-black' : 'text-lg font-bold'}>
                      {str.noteName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Real Wood Guitar Headstock Photo */}
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              <img
                src={headstockPhoto}
                alt="Acoustic Guitar Headstock"
                className="h-[350px] max-w-[250px] object-contain drop-shadow-[0_15px_35px_rgba(0,0,0,0.9)] select-none pointer-events-none rounded-xl"
                referrerPolicy="no-referrer"
              />

              {/* Glowing Active Peg Flare Overlay */}
              {selectedStringNum === 3 && (
                <div
                  className="absolute top-[82px] right-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
              {selectedStringNum === 2 && (
                <div
                  className="absolute top-[162px] right-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
              {selectedStringNum === 1 && (
                <div
                  className="absolute top-[238px] right-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
              {selectedStringNum === 4 && (
                <div
                  className="absolute top-[82px] left-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
              {selectedStringNum === 5 && (
                <div
                  className="absolute top-[162px] left-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
              {selectedStringNum === 6 && (
                <div
                  className="absolute top-[238px] left-[62px] w-9 h-9 rounded-full bg-white/40 blur-md pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 25px 8px rgba(255, 255, 255, 0.85)' }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tuner Bottom Action Bar */}
      <div className="w-full max-w-sm flex items-center justify-between gap-3 mt-1">
        {/* Toggle Live Microphone Listening */}
        <button
          onClick={toggleMic}
          className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
            isMicActive
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
              : 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-98'
          }`}
        >
          {isMicActive ? <MicOff size={16} /> : <Mic size={16} />}
          <span>{isMicActive ? '关闭麦克风调音' : '开启麦克风听弦调音'}</span>
        </button>

        {/* Play Current String Reference Tone */}
        <button
          onClick={() => handleSelectString(selectedStringNum)}
          title="播放当前弦的标准参考基准音"
          className="p-3 px-4 rounded-2xl bg-zinc-900 text-zinc-200 hover:text-white border border-zinc-700/80 hover:border-zinc-500 flex items-center gap-1.5 text-xs font-semibold shadow-md active:scale-95 transition"
        >
          <Volume2 size={16} className="text-emerald-400" />
          <span>标准音</span>
        </button>
      </div>
    </div>
  );
};
