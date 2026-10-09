/**
 * Music Notation & Tablature Data Structures
 */

export type GuitarString = 1 | 2 | 3 | 4 | 5 | 6; // 1 = High E, 6 = Low E

export type NoteDuration = 'w' | 'h' | 'q' | '8' | '16' | '32';

export interface TabNote {
  id: string;
  string: GuitarString;
  fret: number;
  duration: NoteDuration;
  beat: number; // Position within measure in quarter notes (0, 0.5, 1.0, 1.5, 2.0...)
  durationBeats: number; // Length in quarter notes (e.g. 1.0 for quarter, 0.5 for 8th)
  isTied?: boolean;
  technique?: 'none' | 'hammer' | 'pull' | 'slide' | 'bend' | 'vibrato' | 'harmonic' | 'mute';
  pitch: string; // Calculated note pitch name e.g. "C4", "G3", "Eb3"
  midi: number;  // Standard MIDI note number
}

export interface MeasureChord {
  name: string;
  fretPosition?: number;
  beat: number;
  diagramFret?: number;
}

export interface Measure {
  id: string;
  number: number;
  chord?: MeasureChord;
  notes: TabNote[];
  timeSignature?: { numerator: number; denominator: number };
}

export interface ScoreData {
  id: string;
  title: string;
  subtitle: string;
  tempo: number;
  timeSignature: string;
  keySignature: string;
  flatsCount?: number;
  sharpsCount?: number;
  tuning: string[]; // [High E, B, G, D, A, Low E]
  tuningName: string;
  capo: number;
  transcribedBy: string;
  measures: Measure[];
  totalDurationSeconds: number;
  sourceType?: 'youtube' | 'tiktok' | 'file' | 'audio';
  videoUrl?: string;
  videoTitle?: string;
  videoArtist?: string;
  videoThumbnail?: string;
}

export type ViewMode = 'page' | 'continuous' | 'vertical';

export interface TranscriptionJobSettings {
  instrument: string;
  timeSignature: string;
  keySignature: string;
  lyrics?: string;
  isOnlyOneInstrument: boolean;
  isOnlyGuitar: boolean;
  agreedCopyright: boolean;
  sourceType: 'upload' | 'url' | 'record';
  sourceName: string;
  audioUrl?: string;
}

export interface FretboardNoteHighlight {
  string: GuitarString;
  fret: number;
  noteName: string;
  midi: number;
  finger?: number;
  active: boolean;
}
