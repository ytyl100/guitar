import React, { useState, useEffect } from 'react';
import { TabNote, GuitarString, MeasureChord, NoteDuration } from '../types/music';
import { findAlternativeStringPositions, COMMON_CHORDS, getNoteForFret } from '../utils/guitarTheory';
import { guitarAudio } from '../audio/guitarSynth';
import { X, Check, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft, Trash2, Repeat } from 'lucide-react';

interface TabEditorHUDProps {
  selectedNote: TabNote | null;
  selectedChord: { measureId: string; chord: MeasureChord } | null;
  position: { x: number; y: number } | null;
  onUpdateNote: (updatedNote: Partial<TabNote>) => void;
  onDeleteNote: (noteId: string) => void;
  onNavigateNote: (direction: 'up' | 'down' | 'left' | 'right' | 'nextBeat' | 'prevBeat') => void;
  onUpdateChord: (measureId: string, chordName: string) => void;
  onClose: () => void;
}

export const TabEditorHUD: React.FC<TabEditorHUDProps> = ({
  selectedNote,
  selectedChord,
  position,
  onUpdateNote,
  onDeleteNote,
  onNavigateNote,
  onUpdateChord,
  onClose,
}) => {
  const [fretInput, setFretInput] = useState<string>(selectedNote ? String(selectedNote.fret) : '');
  const [chordNameInput, setChordNameInput] = useState<string>(selectedChord ? selectedChord.chord.name : '');

  useEffect(() => {
    if (selectedNote) {
      setFretInput(String(selectedNote.fret));
    }
  }, [selectedNote]);

  useEffect(() => {
    if (selectedChord) {
      setChordNameInput(selectedChord.chord.name);
    }
  }, [selectedChord]);

  // Handle global keyboard shortcuts while HUD is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedNote && !selectedChord) return;

      // Escape = cancel / close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Enter = finish
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedChord) {
          onUpdateChord(selectedChord.measureId, chordNameInput);
        }
        onClose();
        return;
      }

      // If editing chord, don't hijack typing
      if (selectedChord) return;

      if (!selectedNote) return;

      // 0-9 fret number input
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const newFret = parseInt(e.key, 10);
        const { midi, pitch } = getNoteForFret(selectedNote.string, newFret);
        onUpdateNote({ fret: newFret, midi, pitch });
        guitarAudio.playNote(midi, 0.8, 0.85);
        return;
      }

      // Alt + Up / Alt + Down: Same note, other string!
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const alternatives = findAlternativeStringPositions(selectedNote.midi, selectedNote.string);
        if (alternatives.length > 0) {
          // pick the next available alternative
          const target = alternatives[0];
          const { midi, pitch } = getNoteForFret(target.string, target.fret);
          onUpdateNote({ string: target.string, fret: target.fret, midi, pitch });
          guitarAudio.playNote(midi, 0.8, 0.85);
        }
        return;
      }

      // Standard Arrow Keys navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Move to higher string (lower string number 1..6)
        if (selectedNote.string > 1) {
          const nextStr = (selectedNote.string - 1) as GuitarString;
          const { midi, pitch } = getNoteForFret(nextStr, selectedNote.fret);
          onUpdateNote({ string: nextStr, midi, pitch });
          guitarAudio.playNote(midi, 0.8, 0.85);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Move to lower string (higher string number 1..6)
        if (selectedNote.string < 6) {
          const nextStr = (selectedNote.string + 1) as GuitarString;
          const { midi, pitch } = getNoteForFret(nextStr, selectedNote.fret);
          onUpdateNote({ string: nextStr, midi, pitch });
          guitarAudio.playNote(midi, 0.8, 0.85);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigateNote('left');
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigateNote('right');
        return;
      }

      // Space / Shift+Space: next/prev beat
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (e.shiftKey) {
          onNavigateNote('prevBeat');
        } else {
          onNavigateNote('nextBeat');
        }
        return;
      }

      // Delete / Backspace: remove note
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteNote(selectedNote.id);
        onClose();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNote, selectedChord, chordNameInput, onUpdateNote, onDeleteNote, onNavigateNote, onUpdateChord, onClose]);

  if (!selectedNote && !selectedChord) return null;

  // CHORD SYMBOLS EDITOR (Reference: transcription3.png)
  if (selectedChord) {
    const chordDef = COMMON_CHORDS[chordNameInput.trim()];

    return (
      <div 
        className="fixed z-50 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-sky-200 p-4 text-xs font-sans w-80 max-w-[94vw] animate-in fade-in zoom-in-95"
        style={{
          left: position ? `${Math.min(window.innerWidth - 300, Math.max(12, position.x - 140))}px` : '50%',
          top: position ? `${Math.min(window.innerHeight - 260, Math.max(10, position.y + 35))}px` : '30%',
        }}
      >
        <div className="flex items-center justify-between text-gray-500 font-medium mb-2">
          <span>Chord symbols</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Input box */}
        <div className="flex items-center space-x-3 mb-3">
          <input
            type="text"
            value={chordNameInput}
            onChange={(e) => setChordNameInput(e.target.value)}
            className="flex-1 text-base font-bold text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans"
            placeholder="e.g. Cm, G7, Ab"
            autoFocus
          />

          {/* Mini preview chord box */}
          {chordDef ? (
            <div className="w-12 h-14 bg-gray-50 border border-gray-200 rounded p-1 flex flex-col items-center justify-center text-[10px] text-gray-700 font-mono">
              <span className="font-bold text-sky-800">{chordDef.name}</span>
              <span className="text-[9px] text-gray-500">fr. {chordDef.baseFret}</span>
            </div>
          ) : (
            <div className="w-12 h-14 bg-gray-50 border border-gray-200 rounded flex items-center justify-center text-[10px] text-gray-400">
              Chord
            </div>
          )}
        </div>

        {/* Quick Chord Selector Pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {['Cm', 'G7', 'Ab', 'Fm', 'Bb', 'Eb', 'Am', 'C', 'G'].map((chord) => (
            <button
              key={chord}
              onClick={() => {
                setChordNameInput(chord);
                onUpdateChord(selectedChord.measureId, chord);
              }}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                chordNameInput === chord
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {chord}
            </button>
          ))}
        </div>

        {/* Keyboard shortcut legend (Matching transcription3.png) */}
        <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
          <div className="flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-700">Space</kbd>
            <span>next beat</span>
            <kbd className="ml-2 px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-700">Tab</kbd>
            <span>next bar</span>
          </div>
          <div className="flex items-center space-x-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-700">Enter</kbd>
            <span>finish</span>
            <kbd className="ml-2 px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-700">Esc</kbd>
            <span>cancel</span>
          </div>
        </div>
      </div>
    );
  }

  // TAB NOTE EDITOR (Reference: transcription4.png & transcription2.png)
  if (!selectedNote) return null;

  const durationOptions: Array<{ code: NoteDuration; label: string; beats: number }> = [
    { code: 'w', label: 'Whole', beats: 4.0 },
    { code: 'h', label: 'Half', beats: 2.0 },
    { code: 'q', label: 'Quarter', beats: 1.0 },
    { code: '8', label: '8th', beats: 0.5 },
    { code: '16', label: '16th', beats: 0.25 },
  ];

  return (
    <div 
      className="fixed z-50 bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-sky-300 p-3 sm:p-4 text-xs font-sans w-84 max-w-[94vw] animate-in fade-in zoom-in-95"
      style={{
        left: position ? `${Math.min(window.innerWidth - 320, Math.max(12, position.x - 140))}px` : '50%',
        top: position ? `${Math.min(window.innerHeight - 340, Math.max(10, position.y + 40))}px` : '30%',
      }}
    >
      {/* Top instruction (Matching transcription4.png) */}
      <div className="text-[12px] text-gray-700 font-medium leading-relaxed mb-3">
        Type a fret number. Arrows move between strings and beats.
      </div>

      {/* Direct Fret and String Controls */}
      <div className="flex items-center space-x-2 mb-3 bg-sky-50/70 p-2.5 rounded-xl border border-sky-100">
        <div className="flex-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Fret Number</label>
          <input
            type="number"
            min="0"
            max="24"
            value={fretInput}
            onChange={(e) => {
              const val = e.target.value;
              setFretInput(val);
              const num = parseInt(val, 10);
              if (!isNaN(num) && num >= 0 && num <= 24) {
                const { midi, pitch } = getNoteForFret(selectedNote.string, num);
                onUpdateNote({ fret: num, midi, pitch });
                guitarAudio.playNote(midi, 0.8, 0.85);
              }
            }}
            className="w-full text-base font-extrabold text-sky-950 bg-white border border-sky-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">String</label>
          <select
            value={selectedNote.string}
            onChange={(e) => {
              const str = parseInt(e.target.value, 10) as GuitarString;
              const { midi, pitch } = getNoteForFret(str, selectedNote.fret);
              onUpdateNote({ string: str, midi, pitch });
              guitarAudio.playNote(midi, 0.8, 0.85);
            }}
            className="w-full text-xs font-semibold text-gray-800 bg-white border border-sky-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="1">1 (High E)</option>
            <option value="2">2 (B)</option>
            <option value="3">3 (G)</option>
            <option value="4">4 (D)</option>
            <option value="5">5 (A)</option>
            <option value="6">6 (Low E)</option>
          </select>
        </div>

        {/* Pitch badge */}
        <div className="flex flex-col items-center justify-center px-2 py-1 bg-white rounded border border-sky-200">
          <span className="text-[9px] text-gray-400 uppercase font-semibold">Pitch</span>
          <span className="font-mono font-bold text-sky-800 text-sm">{selectedNote.pitch}</span>
        </div>
      </div>

      {/* Note Duration Selector */}
      <div className="mb-3">
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Duration</label>
        <div className="grid grid-cols-5 gap-1">
          {durationOptions.map((dur) => (
            <button
              key={dur.code}
              onClick={() => {
                onUpdateNote({ duration: dur.code, durationBeats: dur.beats });
              }}
              className={`py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                selectedNote.duration === dur.code
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {dur.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tied Note & Technique Toggles */}
      <div className="flex items-center space-x-2 mb-3">
        <button
          onClick={() => onUpdateNote({ isTied: !selectedNote.isTied })}
          className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
            selectedNote.isTied
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}
        >
          Tie ({selectedNote.fret})
        </button>

        <button
          onClick={() => {
            const nextTech = selectedNote.technique === 'hammer' ? 'pull' : selectedNote.technique === 'pull' ? 'slide' : selectedNote.technique === 'slide' ? 'none' : 'hammer';
            onUpdateNote({ technique: nextTech });
          }}
          className="px-2.5 py-1 rounded text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 cursor-pointer"
        >
          Artic: {selectedNote.technique || 'None'}
        </button>

        {/* Delete note button */}
        <button
          onClick={() => {
            onDeleteNote(selectedNote.id);
            onClose();
          }}
          className="ml-auto p-1.5 rounded text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
          title="Delete note"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Keyboard Shortcuts Reference List (Exact replica of transcription4.png) */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200 text-[11px] text-gray-600">
        <div className="flex items-center space-x-1.5">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">0–9</kbd>
          <span className="text-gray-500 mr-2">fret</span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">↑</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">↓</kbd>
          <span className="text-gray-500">string</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">→</kbd>
          <span className="text-gray-500 mr-1 text-[10px]">prev / next position</span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">Space</kbd>
          <span className="text-gray-500 text-[10px]">next beat</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">Alt+↑</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-medium text-gray-800">Alt+↓</kbd>
          <span className="text-emerald-700 font-medium text-[10px]">same note, other string</span>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
          <div className="flex space-x-2">
            <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-semibold text-gray-800">Enter</kbd>
            <span className="text-gray-500">finish</span>
          </div>
          <div className="flex space-x-2">
            <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-semibold text-gray-800">Esc</kbd>
            <span className="text-gray-500">cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
};
