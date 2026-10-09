export interface ChordFingering {
  name: string;
  displayName?: string;
  category?: string;
  baseFret: number;
  // String 6 (Low E) to String 1 (High E)
  frets: (number | 'x')[];
  // Finger numbers (0=open/none, 1=index, 2=middle, 3=ring, 4=pinky)
  fingers: number[];
  // Barred fret if applicable
  barre?: { fret: number; startString: number; endString: number };
  // Fundamental frequencies for audio analysis
  frequencies: number[];
  // Key pitch classes for spectral harmonic matching (e.g. ['D', 'F#', 'A'])
  notes: string[];
  // Coaching advice
  tip: string;
}

// Open strings standard tuning frequencies (E2, A2, D3, G3, B3, E4)
const OPEN_STRING_FREQ = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
const OPEN_STRING_MIDIS = [40, 45, 50, 55, 59, 64];

export function calculateChordFrequencies(frets: (number | 'x')[]): number[] {
  return frets
    .map((f, idx) => {
      if (typeof f === 'number') {
        const midi = OPEN_STRING_MIDIS[idx] + f;
        return 440 * Math.pow(2, (midi - 69) / 12);
      }
      return null;
    })
    .filter((f): f is number => f !== null);
}

export const CHORD_LIBRARY: Record<string, ChordFingering> = {
  'D': {
    name: 'D',
    displayName: 'D 大和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    notes: ['D', 'F#', 'A'],
    frequencies: calculateChordFrequencies(['x', 'x', 0, 2, 3, 2]),
    tip: '食指 3 弦 2 品、无名指 2 弦 3 品、中指 1 弦 2 品。避开 5、6 弦拨奏。',
  },
  'C': {
    name: 'C',
    displayName: 'C 大和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: ['x', 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    notes: ['C', 'E', 'G'],
    frequencies: calculateChordFrequencies(['x', 3, 2, 0, 1, 0]),
    tip: '无名指 5 弦 3 品、中指 4 弦 2 品、食指 2 弦 1 品。指尖立起，保持 1 弦空弦通透。',
  },
  'G': {
    name: 'G',
    displayName: 'G 大和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    notes: ['G', 'B', 'D'],
    frequencies: calculateChordFrequencies([3, 2, 0, 0, 0, 3]),
    tip: '中指 6 弦 3 品、食指 5 弦 2 品、无名指 1 弦 3 品。手腕自然下沉，避免触碰空弦。',
  },
  'Am': {
    name: 'Am',
    displayName: 'A 小调和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: ['x', 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
    notes: ['A', 'C', 'E'],
    frequencies: calculateChordFrequencies(['x', 0, 2, 2, 1, 0]),
    tip: '中指 4 弦 2 品、无名指 3 弦 2 品、食指 2 弦 1 品。与 C 和弦共用保留指快速转换。',
  },
  'Em': {
    name: 'Em',
    displayName: 'E 小调和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    notes: ['E', 'G', 'B'],
    frequencies: calculateChordFrequencies([0, 2, 2, 0, 0, 0]),
    tip: '中指 5 弦 2 品、无名指 4 弦 2 品。全琴弦扫响，低音浑厚。',
  },
  'F': {
    name: 'F',
    displayName: 'F 大横按和弦',
    category: '横按和弦',
    baseFret: 1,
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre: { fret: 1, startString: 6, endString: 1 },
    notes: ['F', 'A', 'C'],
    frequencies: calculateChordFrequencies([1, 3, 3, 2, 1, 1]),
    tip: '食指微向左倾侧面横按 1 品，无名指与小指分别按 5、4 弦 3 品，中指按 3 弦 2 品。',
  },
  'Dm': {
    name: 'Dm',
    displayName: 'D 小调和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    notes: ['D', 'F', 'A'],
    frequencies: calculateChordFrequencies(['x', 'x', 0, 2, 3, 1]),
    tip: '食指 1 弦 1 品、中指 3 弦 2 品、无名指 2 弦 3 品。右手从 4 弦向下扫奏。',
  },
  'Dsus4': {
    name: 'Dsus4',
    displayName: 'D 挂四和弦',
    category: '色彩和弦',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 3, 3],
    fingers: [0, 0, 0, 1, 2, 4],
    notes: ['D', 'G', 'A'],
    frequencies: calculateChordFrequencies(['x', 'x', 0, 2, 3, 3]),
    tip: '在 D 和弦基础上，小指按下 1 弦 3 品（G音），带出明亮开阔的摇滚色彩。',
  },
  'Dsus2': {
    name: 'Dsus2',
    displayName: 'D 挂二和弦',
    category: '色彩和弦',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 3, 0],
    fingers: [0, 0, 0, 1, 3, 0],
    notes: ['D', 'E', 'A'],
    frequencies: calculateChordFrequencies(['x', 'x', 0, 2, 3, 0]),
    tip: '抬起 1 弦手指露出空弦 E 音，音色柔美空灵。',
  },
  'G7': {
    name: 'G7',
    displayName: 'G 属七和弦',
    category: '七和弦',
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1],
    notes: ['G', 'B', 'D', 'F'],
    frequencies: calculateChordFrequencies([3, 2, 0, 0, 0, 1]),
    tip: '无名指 6 弦 3 品，中指 5 弦 2 品，食指 1 弦 1 品。具有强烈的倾向 C 和弦解决感。',
  },
  'Cmaj7': {
    name: 'Cmaj7',
    displayName: 'C 大七和弦',
    category: '爵士色彩和弦',
    baseFret: 1,
    frets: ['x', 3, 2, 0, 0, 0],
    fingers: [0, 3, 2, 0, 0, 0],
    notes: ['C', 'E', 'G', 'B'],
    frequencies: calculateChordFrequencies(['x', 3, 2, 0, 0, 0]),
    tip: '在 C 和弦上去掉 2 弦食指变为 B 空弦，带来梦幻舒缓的流行爵士色彩。',
  },
  'Dm7': {
    name: 'Dm7',
    displayName: 'D 小七和弦',
    category: '七和弦',
    baseFret: 1,
    frets: ['x', 'x', 0, 2, 1, 1],
    fingers: [0, 0, 0, 2, 1, 1],
    notes: ['D', 'F', 'A', 'C'],
    frequencies: calculateChordFrequencies(['x', 'x', 0, 2, 1, 1]),
    tip: '食指同时横按 1、2 弦 1 品，中指按 3 弦 2 品。',
  },
  'Am7': {
    name: 'Am7',
    displayName: 'A 小七和弦',
    category: '七和弦',
    baseFret: 1,
    frets: ['x', 0, 2, 0, 1, 0],
    fingers: [0, 0, 2, 0, 1, 0],
    notes: ['A', 'C', 'E', 'G'],
    frequencies: calculateChordFrequencies(['x', 0, 2, 0, 1, 0]),
    tip: '只需中指 4 弦 2 品与食指 2 弦 1 品，3 弦空出 G 音。',
  },
  'E': {
    name: 'E',
    displayName: 'E 大和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
    notes: ['E', 'G#', 'B'],
    frequencies: calculateChordFrequencies([0, 2, 2, 1, 0, 0]),
    tip: '中指 5 弦 2 品、无名指 4 弦 2 品、食指 3 弦 1 品。',
  },
  'A': {
    name: 'A',
    displayName: 'A 大和弦',
    category: '基础开放和弦',
    baseFret: 1,
    frets: ['x', 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    notes: ['A', 'C#', 'E'],
    frequencies: calculateChordFrequencies(['x', 0, 2, 2, 2, 0]),
    tip: '在 2 品同时挤入 4、3、2 弦，保持 1 弦高音 E 能够通畅振动。',
  },
  'B7': {
    name: 'B7',
    displayName: 'B 属七和弦',
    category: '七和弦',
    baseFret: 1,
    frets: ['x', 2, 1, 2, 0, 2],
    fingers: [0, 2, 1, 3, 0, 4],
    notes: ['B', 'D#', 'F#', 'A'],
    frequencies: calculateChordFrequencies(['x', 2, 1, 2, 0, 2]),
    tip: '中指 5 弦 2 品、食指 4 弦 1 品、无名指 3 弦 2 品、小指 1 弦 2 品。',
  },
  'Bm': {
    name: 'Bm',
    displayName: 'B 小调横按和弦',
    category: '横按和弦',
    baseFret: 2,
    frets: ['x', 2, 4, 4, 3, 2],
    fingers: [0, 1, 3, 4, 2, 1],
    barre: { fret: 2, startString: 5, endString: 1 },
    notes: ['B', 'D', 'F#'],
    frequencies: calculateChordFrequencies(['x', 2, 4, 4, 3, 2]),
    tip: '食指横按 2 品，类似 Am 指型移动到 2 把位。',
  },
};

/**
 * Normalizes chord name and returns chord fingering definition
 */
export function getChordDefinition(chordName: string): ChordFingering {
  const clean = (chordName || '').trim();
  if (CHORD_LIBRARY[clean]) return CHORD_LIBRARY[clean];

  // Try uppercase or title case
  const upper = clean.toUpperCase();
  if (CHORD_LIBRARY[upper]) return CHORD_LIBRARY[upper];

  // Fallback defaults
  const root = clean.charAt(0).toUpperCase();
  if (CHORD_LIBRARY[root]) return CHORD_LIBRARY[root];

  return CHORD_LIBRARY['C'];
}
