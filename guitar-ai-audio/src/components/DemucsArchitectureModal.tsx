import React, { useState } from 'react';
import { 
  X, 
  Cpu, 
  Layers, 
  Music, 
  Code2, 
  Terminal, 
  Workflow, 
  CheckCircle2, 
  Copy, 
  Check, 
  Sparkles,
  Server
} from 'lucide-react';

interface DemucsArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DemucsArchitectureModal: React.FC<DemucsArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'jsonSchema' | 'backendCode'>('pipeline');
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const pythonServiceSnippet = `# demucs_transcription_service.py
import torch
import torchaudio
import demucs.separate
import numpy as np
from basic_pitch.inference import predict
import json

class GuitarTranscriptionPipeline:
    def __init__(self, device="cuda" if torch.cuda.is_available() else "cpu"):
        self.device = device
        print(f"Initialized Demucs v4 on device: {self.device}")

    def separate_guitar_stem(self, input_audio_path: str, output_dir: str) -> str:
        """
        Runs Hybrid Transformer Demucs (HTDemucs) stem separation.
        Extracts pure guitar/instrumental stem while discarding vocal/drum transients.
        """
        demucs.separate.main([
            "--two-stems", "other",  # or 6s model with guitar stem
            "-n", "htdemucs_6s",
            "-o", output_dir,
            input_audio_path
        ])
        return f"{output_dir}/htdemucs_6s/guitar.wav"

    def slice_and_transcribe(self, guitar_stem_path: str, bpm: int = 104):
        """
        Uses spectral onset detection + polyphonic pitch tracking +
        Guitar Fretboard Biomechanical Viterbi Solver.
        """
        model_output, midi_data, note_events = predict(guitar_stem_path)
        
        # Biomechanical string/fret constraint optimization
        tab_measures = self.map_notes_to_guitar_tab(note_events, bpm)
        return tab_measures

    def map_notes_to_guitar_tab(self, note_events, bpm):
        # Solves minimum hand transition distance across frets (0-22)
        # Returns standard Tab JSON schema
        pass
`;

  const sampleJsonSchema = `{
  "$schema": "https://guitarmate.ai/schemas/tab-v1.json",
  "track": {
    "title": "Macaroon 5 | YouTube Audio Library",
    "tempo": 104,
    "timeSignature": "4/4",
    "keySignature": "Eb/Cm",
    "tuning": ["E4", "B3", "G3", "D3", "A2", "E2"],
    "capo": 3
  },
  "measures": [
    {
      "measureNumber": 1,
      "chord": { "name": "Cm", "beat": 0.0, "diagramFret": 3 },
      "notes": [
        {
          "id": "m1-n1",
          "string": 2,
          "fret": 4,
          "beat": 0.0,
          "duration": "q",
          "durationBeats": 1.0,
          "pitch": "Eb4",
          "midi": 63,
          "technique": "none"
        },
        {
          "id": "m1-n2",
          "string": 3,
          "fret": 5,
          "beat": 0.0,
          "duration": "q",
          "durationBeats": 1.0,
          "pitch": "C4",
          "midi": 60,
          "technique": "none"
        }
      ]
    }
  ]
}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900">
                Demucs v4 AI &amp; FFmpeg Audio Transcription Architecture
              </h3>
              <p className="text-xs text-gray-500">
                System specification for stem separation, pitch tracking, and Guitar Tab JSON schema
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 border-b border-gray-200 flex space-x-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'pipeline'
                ? 'border-emerald-700 text-emerald-800 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Pipeline Architecture
          </button>
          <button
            onClick={() => setActiveTab('jsonSchema')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'jsonSchema'
                ? 'border-emerald-700 text-emerald-800 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Standard Tab JSON Schema
          </button>
          <button
            onClick={() => setActiveTab('backendCode')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'backendCode'
                ? 'border-emerald-700 text-emerald-800 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Python AI Service Code
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs text-gray-700 space-y-4">
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-900 mb-1 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                    <span>FFmpeg Slicing</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Input stream is sliced into aligned tempo blocks, normalized to 44.1kHz 16-bit Float PCM.
                  </p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-900 mb-1 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
                    <span>Demucs v4 (6-Stem)</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Hybrid Transformer isolates clean acoustic/electric guitar stem, rejecting drums/vocals.
                  </p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-900 mb-1 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                    <span>Spectral Pitch &amp; Onset</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Multi-resolution CNN tracks fundamental frequencies ($f_0$) and onset attack timestamps.
                  </p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-900 mb-1 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">4</span>
                    <span>Biomechanics Solver</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Viterbi trellis chooses the most natural guitar fretboard hand positions &amp; fingerings.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <h4 className="font-bold text-emerald-950 mb-1">
                  Biomechanical Hand Distance Cost Function:
                </h4>
                <p className="text-[11px] text-emerald-800 font-mono">
                  Cost(Fret_t, Fret_{'{t-1}'}) = λ_1 · |Fret_t - Fret_{'{t-1}'}| + λ_2 · FretHandStretch(Chord) + λ_3 · OpenStringBonus
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Ensures transcribed guitar tabs are physically comfortable and realistic to play on real acoustic or electric instruments.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'jsonSchema' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">Standard Guitar Tab JSON Format:</span>
                <button
                  onClick={() => copyToClipboard(sampleJsonSchema)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Schema'}</span>
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-emerald-300 font-mono text-[11px] rounded-xl overflow-x-auto max-h-80 leading-relaxed">
                {sampleJsonSchema}
              </pre>
            </div>
          )}

          {activeTab === 'backendCode' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">Python Backend Worker (`demucs_service.py`):</span>
                <button
                  onClick={() => copyToClipboard(pythonServiceSnippet)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-gray-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-80 leading-relaxed">
                {pythonServiceSnippet}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
