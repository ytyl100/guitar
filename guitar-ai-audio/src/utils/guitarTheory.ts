import { GuitarString } from '../types/music';

// MIDI note numbers for standard guitar open strings (1: High E down to 6: Low E)
export const STANDARD_OPEN_STRINGS: Record<GuitarString, { note: string; midi: number }> = {
  1: { note: 'E4', midi: 64 },
  2: { note: 'B3', midi: 59 },
  3: { note: 'G3', midi: 55 },
  4: { note: 'D3', midi: 50 },
  5: { note: 'A2', midi: 45 },
  6: { note: 'E2', midi: 40 },
};

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Converts MIDI note to scientific pitch name e.g. 60 -> "C4"
 */
export function midiToNoteName(midi: number, preferFlat = true): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = preferFlat ? NOTE_NAMES_FLAT[noteIndex] : NOTE_NAMES_SHARP[noteIndex];
  return `${name}${octave}`;
}

/**
 * Calculates MIDI note and pitch name for a string and fret
 */
export function getNoteForFret(string: GuitarString, fret: number, preferFlat = true): { midi: number; pitch: string } {
  const baseMidi = STANDARD_OPEN_STRINGS[string].midi;
  const midi = baseMidi + fret;
  const pitch = midiToNoteName(midi, preferFlat);
  return { midi, pitch };
}

/**
 * Find other string positions that can produce the exact same pitch (for Alt+Up / Alt+Down)
 */
export function findAlternativeStringPositions(
  targetMidi: number,
  excludeString?: GuitarString
): Array<{ string: GuitarString; fret: number }> {
  const results: Array<{ string: GuitarString; fret: number }> = [];

  for (let s = 1 as GuitarString; s <= 6; s = (s + 1) as GuitarString) {
    if (excludeString && s === excludeString) continue;
    const baseMidi = STANDARD_OPEN_STRINGS[s].midi;
    const fret = targetMidi - baseMidi;
    if (fret >= 0 && fret <= 22) {
      results.push({ string: s, fret });
    }
  }

  return results;
}

/**
 * Common chord diagrams for guitar
 */
export interface ChordDiagramDef {
  name: string;
  baseFret: number;
  frets: (number | 'x')[]; // string 6 down to string 1 [lowE, A, D, G, B, highE]
  fingers?: number[];
  barre?: { fret: number; startString: number; endString: number };
}

export const COMMON_CHORDS: Record<string, ChordDiagramDef> = {
  'Cm': {
    name: 'Cm',
    baseFret: 3,
    frets: ['x', 3, 5, 5, 4, 3],
    barre: { fret: 3, startString: 5, endString: 1 }
  },
  'G7': {
    name: 'G7',
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 1]
  },
  'Ab': {
    name: 'Ab',
    baseFret: 4,
    frets: [4, 6, 6, 5, 4, 4],
    barre: { fret: 4, startString: 6, endString: 1 }
  },
  'Fm': {
    name: 'Fm',
    baseFret: 1,
    frets: [1, 3, 3, 1, 1, 1],
    barre: { fret: 1, startString: 6, endString: 1 }
  },
  'Bb': {
    name: 'Bb',
    baseFret: 1,
    frets: ['x', 1, 3, 3, 3, 1],
    barre: { fret: 1, startString: 5, endString: 1 }
  },
  'Eb': {
    name: 'Eb',
    baseFret: 6,
    frets: ['x', 6, 8, 8, 8, 6],
    barre: { fret: 6, startString: 5, endString: 1 }
  },
  'Am': {
    name: 'Am',
    baseFret: 1,
    frets: ['x', 0, 2, 2, 1, 0]
  },
  'C': {
    name: 'C',
    baseFret: 1,
    frets: ['x', 3, 2, 0, 1, 0]
  },
  'G': {
    name: 'G',
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 3]
  },
  'D': {
    name: 'D',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 3, 2]
  },
  'Em': {
    name: 'Em',
    baseFret: 1,
    frets: [0, 2, 2, 0, 0, 0]
  }
};

/**
 * Calculates treble staff step offset relative to middle C (C4 = step 0)
 * Note steps in diatonic scale: C=0, D=1, E=2, F=3, G=4, A=5, B=6
 */
const DIATONIC_STEP: Record<string, number> = {
  'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6
};

export function getStaffDiatonicStep(midi: number): number {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const naturalLetter = NOTE_NAMES_FLAT[noteIndex].charAt(0);
  const baseStep = DIATONIC_STEP[naturalLetter];
  // Middle C is C4 (octave 4, step 0). Each octave adds 7 diatonic steps.
  return (octave - 4) * 7 + baseStep;
}
