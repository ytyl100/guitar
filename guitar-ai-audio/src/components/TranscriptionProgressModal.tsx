import React, { useEffect, useState } from 'react';
import { 
  Sparkles, 
  Cpu, 
  Music, 
  Layers, 
  CheckCircle2, 
  Sliders,
  FileCheck2
} from 'lucide-react';
import { TranscriptionJobSettings } from '../types/music';

interface TranscriptionProgressModalProps {
  settings: TranscriptionJobSettings;
  onComplete: () => void;
}

interface StepInfo {
  id: number;
  title: string;
  desc: string;
  icon: React.ReactNode;
}

const STEPS: StepInfo[] = [
  {
    id: 1,
    title: 'FFmpeg Audio Slicing & Resampling',
    desc: 'Normalizing sample rate to 44.1kHz stereo, slicing transients for neural inference.',
    icon: <Cpu className="w-4 h-4" />,
  },
  {
    id: 2,
    title: 'Demucs v4 Hybrid Transformer Separation',
    desc: 'Extracting clean guitar stem by filtering out drums, bass, and ambient tracks.',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    id: 3,
    title: 'Spectral Onset & Pitch Estimation',
    desc: 'Detecting note attacks, polyphonic fundamental frequencies, and note durations.',
    icon: <Music className="w-4 h-4" />,
  },
  {
    id: 4,
    title: 'Guitar Biomechanics & Fretboard Mapping',
    desc: 'Solving optimal string/fret fingering positions (Standard EADGBE tuning).',
    icon: <Sliders className="w-4 h-4" />,
  },
  {
    id: 5,
    title: 'Dual Staff & 6-Line TAB Generation',
    desc: 'Generating synchronized Treble Clef and Tablature JSON schema with chord cues.',
    icon: <FileCheck2 className="w-4 h-4" />,
  },
];

export const TranscriptionProgressModal: React.FC<TranscriptionProgressModalProps> = ({
  settings,
  onComplete,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(12);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onComplete();
          }, 600);
          return 100;
        }
        const next = prev + Math.floor(Math.random() * 8) + 6;
        if (next > 25 && currentStepIndex < 1) setCurrentStepIndex(1);
        if (next > 50 && currentStepIndex < 2) setCurrentStepIndex(2);
        if (next > 75 && currentStepIndex < 3) setCurrentStepIndex(3);
        if (next > 92 && currentStepIndex < 4) setCurrentStepIndex(4);
        return Math.min(100, next);
      });
    }, 450);

    return () => clearInterval(interval);
  }, [currentStepIndex, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-sans">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 border border-gray-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Title */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
            <Sparkles className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">
              Transcribing to Guitar Tab...
            </h3>
            <p className="text-xs text-gray-500">
              Target: <span className="font-semibold text-emerald-900">{settings.instrument.replace('_', ' ').toUpperCase()}</span> • {settings.sourceName}
            </p>
          </div>
        </div>

        {/* Dynamic Waveform Animation */}
        <div className="h-14 bg-gray-900 rounded-xl mb-6 p-2 flex items-center justify-around overflow-hidden border border-gray-800">
          {Array.from({ length: 36 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-gradient-to-t from-emerald-500 to-teal-300 rounded-full transition-all duration-150"
              style={{
                height: `${15 + Math.sin((i + progressPercent * 0.4) * 0.5) * 22}px`,
                opacity: 0.6 + ((i % 5) / 10),
              }}
            />
          ))}
        </div>

        {/* Progress Bar & Percentage */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="text-gray-700">Demucs AI Processing Pipeline</span>
            <span className="text-emerald-700 font-mono text-sm">{progressPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Step by step pipeline tracking */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const isFinished = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <div
                key={step.id}
                className={`flex items-start space-x-3 p-2.5 rounded-xl border transition-all text-xs ${
                  isCurrent
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-2xs ring-1 ring-emerald-500'
                    : isFinished
                    ? 'border-gray-200 bg-gray-50/60 text-gray-500'
                    : 'border-transparent text-gray-400'
                }`}
              >
                <div className="mt-0.5">
                  {isFinished ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <div className={`p-1 rounded-md ${isCurrent ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {step.icon}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className={`font-semibold ${isCurrent ? 'text-emerald-950 font-bold' : isFinished ? 'text-gray-700' : 'text-gray-400'}`}>
                    {step.title}
                  </div>
                  <div className="text-[11px] text-gray-500 line-clamp-1">
                    {step.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
