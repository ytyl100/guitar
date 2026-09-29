/**
 * Comprehensive Guitar Chord Database & Position Generator
 * Covers all 12 chromatic roots: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
 * And all 12 chord types: major, minor, 5, 7, maj7, m7, sus4, add9, sus2, 7sus4, 7#9, 9
 * Supporting multiple fingerings/positions for each chord, with finger colors, barres, and fret numbers.
 */

export interface BarreDef {
  fret: number;
  fromString: number; // 6 (Low E) to 1 (High E)
  toString: number;   // 6 (Low E) to 1 (High E)
  finger: number;     // 1: Index, 2: Middle, 3: Ring, 4: Pinky
}

export interface ChordPosition {
  frets: number[]; // 6 elements: string 6 down to string 1. -1 = muted (x), 0 = open (o), 1+ = fret number
  fingers: number[]; // 6 elements: 0 = none, 1 = index (orange), 2 = middle (pink), 3 = ring (blue), 4 = pinky (coral)
  barres?: BarreDef[];
  baseFret: number; // The top visible fret on the diagram (e.g. 1, 2, 3...)
  title?: string;
}

export const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const CHORD_TYPES = [
  'major',
  'minor',
  '5',
  '7',
  'maj7',
  'm7',
  'sus4',
  'add9',
  'sus2',
  '7sus4',
  '7#9',
  '9',
] as const;

export type ChordType = typeof CHORD_TYPES[number];

// Standard tuning open string frequencies (Hz) for string 6 to 1
export const STRING_OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]; // E2, A2, D3, G3, B3, E4

// Finger color scheme matching Yousician and reference screenshot:
// Finger 1 (Index): Orange / Amber (#fb923c / #f59e0b)
// Finger 2 (Middle): Pink / Magenta (#ec4899 / #d946ef)
// Finger 3 (Ring): Sky Blue / Cyan (#38bdf8 / #0ea5e9)
// Finger 4 (Pinky): Coral-Orange / Red-Orange (#f97316 / #ff6347)
export const FINGER_COLORS: Record<number, { bg: string; border: string; label: string; name: string }> = {
  1: { bg: '#f59e0b', border: '#fbbf24', label: '1', name: '食指 (Index)' },
  2: { bg: '#ec4899', border: '#f472b6', label: '2', name: '中指 (Middle)' },
  3: { bg: '#0ea5e9', border: '#38bdf8', label: '3', name: '无名指 (Ring)' },
  4: { bg: '#f97316', border: '#fb923c', label: '4', name: '小指 (Pinky)' },
  0: { bg: '#71717a', border: '#a1a1aa', label: 'T', name: '大拇指 (Thumb)' },
};

// Curated high-priority chords with exact fingerings matching reference images
const CURATED_CHORDS: Record<string, Record<string, ChordPosition[]>> = {
  E: {
    sus4: [
      {
        // Matches e-sus4.jpg screenshot exactly!
        frets: [0, 2, 2, 2, 0, 0],
        fingers: [0, 1, 2, 3, 0, 0],
        baseFret: 1,
        title: '开放把位 (Open Position)',
      },
      {
        frets: [-1, 7, 9, 9, 10, 7],
        fingers: [0, 1, 3, 3, 4, 1],
        barres: [{ fret: 7, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 7,
        title: '7品把位 (A-Shape)',
      },
      {
        frets: [12, 14, 14, 14, 12, 12],
        fingers: [1, 2, 3, 4, 1, 1],
        barres: [{ fret: 12, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 12,
        title: '12品八度把位 (Octave)',
      },
    ],
  },
  C: {
    '7sus4': [
      {
        // Matches chord_lib.jpg screenshot: fret 2/3 barre across strings 5 to 1
        frets: [-1, 3, 5, 3, 6, 3],
        fingers: [0, 1, 3, 1, 4, 1],
        barres: [{ fret: 3, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 2,
        title: '3品把位 (A-Shape Barre)',
      },
      {
        frets: [8, 10, 8, 10, 8, 8],
        fingers: [1, 3, 1, 4, 1, 1],
        barres: [{ fret: 8, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 8,
        title: '8品大横按 (E-Shape Barre)',
      },
      {
        frets: [-1, -1, 10, 12, 11, 13],
        fingers: [0, 0, 1, 3, 2, 4],
        baseFret: 10,
        title: '10品高把位 (D-Shape)',
      },
    ],
    major: [
      {
        frets: [-1, 3, 2, 0, 1, 0],
        fingers: [0, 3, 2, 0, 1, 0],
        baseFret: 1,
        title: '标准开放把位',
      },
      {
        frets: [8, 10, 10, 9, 8, 8],
        fingers: [1, 3, 4, 2, 1, 1],
        barres: [{ fret: 8, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 8,
        title: '8品大横按',
      },
      {
        frets: [-1, 3, 5, 5, 5, 3],
        fingers: [0, 1, 2, 3, 4, 1],
        barres: [{ fret: 3, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 3,
        title: '3品A指型横按',
      },
    ],
    minor: [
      {
        frets: [-1, 3, 5, 5, 4, 3],
        fingers: [0, 1, 3, 4, 2, 1],
        barres: [{ fret: 3, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 3,
        title: '3品小和弦横按',
      },
      {
        frets: [8, 10, 10, 8, 8, 8],
        fingers: [1, 3, 4, 1, 1, 1],
        barres: [{ fret: 8, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 8,
        title: '8品Em型横按',
      },
      {
        frets: [-1, -1, 10, 12, 13, 11],
        fingers: [0, 0, 1, 3, 4, 2],
        baseFret: 10,
        title: '10品把位',
      },
    ],
  },
  D: {
    major: [
      {
        frets: [-1, -1, 0, 2, 3, 2],
        fingers: [0, 0, 0, 1, 3, 2],
        baseFret: 1,
        title: '标准开放把位',
      },
      {
        frets: [-1, 5, 7, 7, 7, 5],
        fingers: [0, 1, 2, 3, 4, 1],
        barres: [{ fret: 5, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 5,
        title: '5品A型横按',
      },
      {
        frets: [10, 12, 12, 11, 10, 10],
        fingers: [1, 3, 4, 2, 1, 1],
        barres: [{ fret: 10, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 10,
        title: '10品E型横按',
      },
    ],
  },
  G: {
    major: [
      {
        frets: [3, 2, 0, 0, 0, 3],
        fingers: [2, 1, 0, 0, 0, 3],
        baseFret: 1,
        title: '标准开放把位',
      },
      {
        frets: [3, 2, 0, 0, 3, 3],
        fingers: [2, 1, 0, 0, 3, 4],
        baseFret: 1,
        title: '摇滚民谣双高音把位',
      },
      {
        frets: [3, 5, 5, 4, 3, 3],
        fingers: [1, 3, 4, 2, 1, 1],
        barres: [{ fret: 3, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 3,
        title: '3品大横按',
      },
    ],
  },
  A: {
    minor: [
      {
        frets: [-1, 0, 2, 2, 1, 0],
        fingers: [0, 0, 2, 3, 1, 0],
        baseFret: 1,
        title: '标准开放把位',
      },
      {
        frets: [5, 7, 7, 5, 5, 5],
        fingers: [1, 3, 4, 1, 1, 1],
        barres: [{ fret: 5, fromString: 6, toString: 1, finger: 1 }],
        baseFret: 5,
        title: '5品大横按',
      },
      {
        frets: [-1, 12, 14, 14, 13, 12],
        fingers: [0, 1, 3, 4, 2, 1],
        barres: [{ fret: 12, fromString: 5, toString: 1, finger: 1 }],
        baseFret: 12,
        title: '12品高把位',
      },
    ],
  },
};

// Semitone offset from C (0 to 11)
const ROOT_SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

// Base shapes for chord types (relative to root semitones):
// We construct 3 CAGED-based movable positions for each chord type.
interface MovableTemplate {
  rootString: 6 | 5 | 4;
  baseShapeSemitoneOffset: number; // Root position relative to 0-fret root
  fretsRel: (number | -1)[];
  fingers: number[];
  hasBarre?: boolean;
}

const MOVABLE_TEMPLATES: Record<ChordType, MovableTemplate[]> = {
  major: [
    // Position 1: E-shape (root on 6th string)
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], hasBarre: true },
    // Position 2: A-shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1], hasBarre: true },
    // Position 3: C/D-shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], hasBarre: false },
  ],
  minor: [
    // E-shape minor
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], hasBarre: true },
    // A-shape minor
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1], hasBarre: true },
    // D-shape minor
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], hasBarre: false },
  ],
  '5': [
    // Root on 6th string power chord
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 2, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0], hasBarre: false },
    // Root on 5th string power chord
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 2, -1, -1], fingers: [0, 1, 3, 4, 0, 0], hasBarre: false },
    // Extended power chord
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, -1, -1, -1, -1], fingers: [1, 3, 0, 0, 0, 0], hasBarre: false },
  ],
  '7': [
    // E7-shape (root on 6th string)
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], hasBarre: true },
    // A7-shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1], hasBarre: true },
    // D7-shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], hasBarre: false },
  ],
  maj7: [
    // E-maj7 shape
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 1, 1, 0, -1], fingers: [1, 3, 2, 2, 1, 0], hasBarre: false },
    // A-maj7 shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1], hasBarre: true },
    // C-maj7 shape
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], hasBarre: false },
  ],
  m7: [
    // Em7 shape
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], hasBarre: true },
    // Am7 shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1], hasBarre: true },
    // Dm7 shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], hasBarre: true },
  ],
  sus4: [
    // Esus4 shape (root on 6th string)
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], hasBarre: false },
    // Asus4 shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1], hasBarre: true },
    // Dsus4 shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], hasBarre: false },
  ],
  add9: [
    // Cadd9 shape
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0], hasBarre: false },
    // Eadd9 shape
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 4, 1, 0, 0], fingers: [0, 2, 4, 1, 0, 0], hasBarre: false },
    // Gadd9 shape
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [3, 2, 0, 2, 0, 3], fingers: [2, 1, 0, 3, 0, 4], hasBarre: false },
  ],
  sus2: [
    // Asus2 shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 2, 3, 0, 0], hasBarre: false },
    // Dsus2 shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], hasBarre: false },
    // Esus2 shape
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0], hasBarre: false },
  ],
  '7sus4': [
    // A7sus4 shape (root on 5th string) - Matches chord_lib.jpg
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 0, 3, 0], fingers: [0, 1, 3, 1, 4, 1], hasBarre: true },
    // E7sus4 shape (root on 6th string)
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 0, 2, 0, 0], fingers: [0, 2, 0, 3, 0, 0], hasBarre: false },
    // D7sus4 shape
    { rootString: 4, baseShapeSemitoneOffset: 0, fretsRel: [-1, -1, 0, 2, 1, 3], fingers: [0, 0, 0, 2, 1, 4], hasBarre: false },
  ],
  '7#9': [
    // Jimi Hendrix E7#9 shape
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 7, 6, 7, 8, -1], fingers: [0, 2, 1, 3, 4, 0], hasBarre: false },
    // Root on 6th string
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 0, 1, 3, 3], fingers: [0, 2, 0, 1, 3, 4], hasBarre: false },
    // Compact 7#9
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 3, 1, -1], fingers: [0, 0, 2, 3, 1, 0], hasBarre: false },
  ],
  '9': [
    // Dominant 9 shape (root on 5th string)
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, -1, 1, 2, 2], fingers: [0, 1, 0, 2, 3, 3], hasBarre: true },
    // Dominant 9 shape (root on 6th string)
    { rootString: 6, baseShapeSemitoneOffset: 0, fretsRel: [0, 2, 0, 1, 0, 2], fingers: [1, 3, 1, 2, 1, 4], hasBarre: true },
    // Standard jazz 9 shape
    { rootString: 5, baseShapeSemitoneOffset: 0, fretsRel: [-1, 0, 2, 1, 2, 2], fingers: [0, 2, 3, 1, 4, 4], hasBarre: true },
  ],
};

// Calculate fret offset for a given root on a specific string
function getFretForRootOnString(targetSemitone: number, stringNum: 6 | 5 | 4): number {
  // Open string semitones: E=4, A=9, D=2
  const openSemitones: Record<6 | 5 | 4, number> = { 6: 4, 5: 9, 4: 2 };
  const openSt = openSemitones[stringNum];
  let fret = (targetSemitone - openSt + 12) % 12;
  return fret;
}

/**
 * Retrieve all positions for a specific chord (root + type).
 * Prioritizes curated authentic positions, falls back to CAGED movable shapes.
 */
export function getChordPositions(root: string, type: ChordType): ChordPosition[] {
  // Check curated list first
  const normalizedRoot = root.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#');
  
  if (CURATED_CHORDS[normalizedRoot] && CURATED_CHORDS[normalizedRoot][type]) {
    return CURATED_CHORDS[normalizedRoot][type];
  }

  // Derive using movable templates
  const targetSemitone = ROOT_SEMITONES[root] ?? 0;
  const templates = MOVABLE_TEMPLATES[type] || MOVABLE_TEMPLATES['major'];

  const positions: ChordPosition[] = [];

  templates.forEach((tmpl, idx) => {
    let fretShift = getFretForRootOnString(targetSemitone, tmpl.rootString);
    if (fretShift === 0 && tmpl.hasBarre && idx > 0) {
      fretShift = 12; // Octave position if open
    }

    const frets: number[] = [];
    const fingers: number[] = [...tmpl.fingers];
    let minFret = 99;
    let maxFret = 0;

    for (let i = 0; i < 6; i++) {
      const rel = tmpl.fretsRel[i];
      if (rel === -1) {
        frets.push(-1);
      } else {
        const actualFret = fretShift === 0 ? rel : rel + fretShift;
        frets.push(actualFret);
        if (actualFret > 0) {
          minFret = Math.min(minFret, actualFret);
          maxFret = Math.max(maxFret, actualFret);
        }
      }
    }

    // Determine diagram base fret
    let baseFret = 1;
    if (minFret > 2 && minFret < 90) {
      baseFret = minFret;
    }

    // Build barres if applicable
    const barres: BarreDef[] = [];
    if (tmpl.hasBarre && fretShift > 0) {
      const fromStr = tmpl.rootString;
      barres.push({
        fret: fretShift,
        fromString: fromStr,
        toString: 1,
        finger: 1,
      });
    }

    // Special title
    let title = `把位 ${idx + 1}`;
    if (baseFret === 1) title = '开放把位';
    else if (baseFret > 1) title = `${baseFret}品把位`;

    positions.push({
      frets,
      fingers,
      barres: barres.length > 0 ? barres : undefined,
      baseFret,
      title,
    });
  });

  return positions;
}
