import { ScoreData, TabNote } from '../types/music';
import { getNoteForFret } from '../utils/guitarTheory';
import { MACAROON_5_SCORE } from './macaroon5Demo';

export interface TranscriptionItem {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  coverUrl: string;
  instrument: 'Acoustic Guitar' | 'Electric Guitar' | 'Classical Guitar' | 'Bass';
  category: 'user' | 'system';
  type: 'unlocked' | 'trial';
  badges: string[];
  tempo: number;
  keySignature: string;
  capo: number;
  durationSeconds: number;
  createdAt: string;
  isFavorite?: boolean;
  score: ScoreData;
}

// Helper to create notes
function createNote(
  id: string,
  string: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  beat: number,
  duration: 'w' | 'h' | 'q' | '8' | '16' = 'q',
  durationBeats = 1.0,
  isTied = false
): TabNote {
  const { midi, pitch } = getNoteForFret(string, fret);
  return {
    id,
    string,
    fret,
    beat,
    duration,
    durationBeats,
    isTied,
    technique: 'none',
    midi,
    pitch,
  };
}

// 1. Laid Back Guitars Demo Score (G Major, 88 BPM)
export const LAID_BACK_GUITARS_SCORE: ScoreData = {
  id: 'laid-back-guitars',
  title: 'Laid Back Guitars | YouTube Audio Library',
  subtitle: 'Acoustic Fingerstyle',
  tempo: 88,
  timeSignature: '4/4',
  keySignature: 'G Major',
  sharpsCount: 1,
  flatsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 0,
  transcribedBy: 'guitarmate',
  totalDurationSeconds: 24,
  sourceType: 'youtube',
  videoUrl: 'https://www.youtube.com/watch?v=kYJqA3a4C0g',
  videoTitle: 'Laid Back Guitars - Acoustic Solo Session',
  videoArtist: 'YouTube Audio Library / Takaharu Yasue',
  videoThumbnail: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=480&auto=format&fit=crop&q=80',
  measures: [
    {
      id: 'lbg-m1',
      number: 1,
      chord: { name: 'G', fretPosition: 0, beat: 0, diagramFret: 0 },
      notes: [
        createNote('lbg-1', 6, 3, 0.0, 'q', 1.0),
        createNote('lbg-2', 4, 0, 1.0, 'q', 1.0),
        createNote('lbg-3', 3, 0, 2.0, 'q', 1.0),
        createNote('lbg-4', 2, 0, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'lbg-m2',
      number: 2,
      chord: { name: 'Em7', fretPosition: 0, beat: 0 },
      notes: [
        createNote('lbg-5', 6, 0, 0.0, 'q', 1.0),
        createNote('lbg-6', 4, 2, 1.0, 'q', 1.0),
        createNote('lbg-7', 3, 0, 2.0, 'q', 1.0),
        createNote('lbg-8', 2, 3, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'lbg-m3',
      number: 3,
      chord: { name: 'Cadd9', fretPosition: 0, beat: 0 },
      notes: [
        createNote('lbg-9', 5, 3, 0.0, 'q', 1.0),
        createNote('lbg-10', 4, 2, 1.0, 'q', 1.0),
        createNote('lbg-11', 3, 0, 2.0, 'q', 1.0),
        createNote('lbg-12', 2, 3, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'lbg-m4',
      number: 4,
      chord: { name: 'D', fretPosition: 0, beat: 0 },
      notes: [
        createNote('lbg-13', 4, 0, 0.0, 'q', 1.0),
        createNote('lbg-14', 3, 2, 1.0, 'q', 1.0),
        createNote('lbg-15', 2, 3, 2.0, 'q', 1.0),
        createNote('lbg-16', 1, 2, 3.0, 'q', 1.0),
      ],
    },
  ],
};

// 2. Isolated Demo Score (E Minor, 120 BPM)
export const ISOLATED_SCORE: ScoreData = {
  id: 'isolated-demo',
  title: 'Isolated | YouTube Audio Library',
  subtitle: 'Electric Blues Riff',
  tempo: 120,
  timeSignature: '4/4',
  keySignature: 'E Minor',
  sharpsCount: 1,
  flatsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 0,
  transcribedBy: 'guitarmate',
  totalDurationSeconds: 20,
  measures: [
    {
      id: 'iso-m1',
      number: 1,
      chord: { name: 'Em', fretPosition: 0, beat: 0 },
      notes: [
        createNote('iso-1', 6, 0, 0.0, '8', 0.5),
        createNote('iso-2', 6, 0, 0.5, '8', 0.5),
        createNote('iso-3', 5, 2, 1.0, 'q', 1.0),
        createNote('iso-4', 4, 2, 2.0, 'q', 1.0),
        createNote('iso-5', 3, 0, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'iso-m2',
      number: 2,
      chord: { name: 'Am', fretPosition: 0, beat: 0 },
      notes: [
        createNote('iso-6', 5, 0, 0.0, 'q', 1.0),
        createNote('iso-7', 4, 2, 1.0, 'q', 1.0),
        createNote('iso-8', 3, 2, 2.0, 'q', 1.0),
        createNote('iso-9', 2, 1, 3.0, 'q', 1.0),
      ],
    },
  ],
};

// 3. A Minor Etude (A Minor, 96 BPM)
export const A_MINOR_ETUDE_SCORE: ScoreData = {
  id: 'a-minor-etude',
  title: 'A 小调练习曲（solo + 和弦）',
  subtitle: 'GuitarMate 内置精选样品',
  tempo: 96,
  timeSignature: '4/4',
  keySignature: 'A Minor',
  sharpsCount: 0,
  flatsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 0,
  transcribedBy: 'guitarmate',
  totalDurationSeconds: 24,
  measures: [
    {
      id: 'am-m1',
      number: 1,
      chord: { name: 'Am', fretPosition: 0, beat: 0 },
      notes: [
        createNote('am-1', 5, 0, 0.0, 'q', 1.0),
        createNote('am-2', 3, 2, 1.0, '8', 0.5),
        createNote('am-3', 2, 1, 1.5, '8', 0.5),
        createNote('am-4', 1, 0, 2.0, 'q', 1.0),
        createNote('am-5', 2, 1, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'am-m2',
      number: 2,
      chord: { name: 'Dm', fretPosition: 0, beat: 0 },
      notes: [
        createNote('am-6', 4, 0, 0.0, 'q', 1.0),
        createNote('am-7', 3, 2, 1.0, '8', 0.5),
        createNote('am-8', 2, 3, 1.5, '8', 0.5),
        createNote('am-9', 1, 1, 2.0, 'q', 1.0),
        createNote('am-10', 2, 3, 3.0, 'q', 1.0),
      ],
    },
  ],
};

// 4. Canon in D (D Major, 72 BPM)
export const CANON_IN_D_SCORE: ScoreData = {
  id: 'canon-in-d',
  title: 'Canon in D',
  subtitle: 'Johann Pachelbel (吉他独奏改编)',
  tempo: 72,
  timeSignature: '4/4',
  keySignature: 'D Major',
  sharpsCount: 2,
  flatsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 2,
  transcribedBy: 'guitarmate',
  totalDurationSeconds: 32,
  measures: [
    {
      id: 'can-m1',
      number: 1,
      chord: { name: 'D', fretPosition: 0, beat: 0 },
      notes: [
        createNote('can-1', 4, 0, 0.0, 'q', 1.0),
        createNote('can-2', 3, 2, 1.0, 'q', 1.0),
        createNote('can-3', 2, 3, 2.0, 'q', 1.0),
        createNote('can-4', 1, 2, 3.0, 'q', 1.0),
      ],
    },
    {
      id: 'can-m2',
      number: 2,
      chord: { name: 'A', fretPosition: 0, beat: 0 },
      notes: [
        createNote('can-5', 5, 0, 0.0, 'q', 1.0),
        createNote('can-6', 4, 2, 1.0, 'q', 1.0),
        createNote('can-7', 3, 2, 2.0, 'q', 1.0),
        createNote('can-8', 2, 2, 3.0, 'q', 1.0),
      ],
    },
  ],
};

// Default initial library items
export const INITIAL_LIBRARY_ITEMS: TranscriptionItem[] = [
  // 1. System generated sample (The primary one)
  {
    id: 'macaroon-5',
    title: 'Macaroon 5 | YouTube Audio Library',
    subtitle: 'Original Transcription',
    artist: '未标注',
    coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=240&auto=format&fit=crop&q=80',
    instrument: 'Acoustic Guitar',
    category: 'system',
    type: 'unlocked',
    badges: ['TAB', '云端', '精选'],
    tempo: 104,
    keySignature: 'Eb/Cm',
    capo: 3,
    durationSeconds: 30,
    createdAt: '2026-09-28',
    isFavorite: true,
    score: MACAROON_5_SCORE,
  },
  {
    id: 'laid-back-guitars',
    title: 'Laid Back Guitars | YouTube Audio Library',
    subtitle: 'Acoustic Fingerstyle',
    artist: '未标注',
    coverUrl: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=240&auto=format&fit=crop&q=80',
    instrument: 'Acoustic Guitar',
    category: 'system',
    type: 'unlocked',
    badges: ['TAB', '云端'],
    tempo: 88,
    keySignature: 'G Major',
    capo: 0,
    durationSeconds: 24,
    createdAt: '2026-09-25',
    isFavorite: false,
    score: LAID_BACK_GUITARS_SCORE,
  },
  {
    id: 'isolated',
    title: 'Isolated | YouTube Audio Library',
    subtitle: 'Electric Blues Riff',
    artist: '未标注',
    coverUrl: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?w=240&auto=format&fit=crop&q=80',
    instrument: 'Electric Guitar',
    category: 'system',
    type: 'trial',
    badges: ['TAB', '云端'],
    tempo: 120,
    keySignature: 'E Minor',
    capo: 0,
    durationSeconds: 20,
    createdAt: '2026-09-20',
    isFavorite: false,
    score: ISOLATED_SCORE,
  },
  {
    id: 'a-minor-etude',
    title: 'A 小调练习曲（solo + 和弦）',
    subtitle: 'GuitarMate 内置样品',
    artist: 'GuitarMate 内置样品',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240&auto=format&fit=crop&q=80',
    instrument: 'Classical Guitar',
    category: 'system',
    type: 'unlocked',
    badges: ['TAB', '云端', '经典'],
    tempo: 96,
    keySignature: 'A Minor',
    capo: 0,
    durationSeconds: 24,
    createdAt: '2026-09-18',
    isFavorite: true,
    score: A_MINOR_ETUDE_SCORE,
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    subtitle: '卡农吉他独奏练习',
    artist: 'Johann Pachelbel',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=240&auto=format&fit=crop&q=80',
    instrument: 'Classical Guitar',
    category: 'system',
    type: 'unlocked',
    badges: ['TAB', '云端'],
    tempo: 72,
    keySignature: 'D Major',
    capo: 2,
    durationSeconds: 32,
    createdAt: '2026-09-10',
    isFavorite: false,
    score: CANON_IN_D_SCORE,
  },

  // 2. User generated transcriptions (用户自转谱)
  {
    id: 'user-rec-1',
    title: 'My Acoustic Jam_20260930.wav',
    subtitle: '用户自录音频 AI 高精转谱',
    artist: '我录制的吉他',
    coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=240&auto=format&fit=crop&q=80',
    instrument: 'Acoustic Guitar',
    category: 'user',
    type: 'unlocked',
    badges: ['TAB', '自转谱', 'AI生成'],
    tempo: 92,
    keySignature: 'G Major',
    capo: 0,
    durationSeconds: 24,
    createdAt: '2026-09-30',
    isFavorite: true,
    score: {
      ...LAID_BACK_GUITARS_SCORE,
      id: 'user-score-1',
      title: 'My Acoustic Jam_20260930.wav',
      subtitle: '用户自录音频 AI 转谱',
      transcribedBy: 'User (You)',
    },
  },
  {
    id: 'user-upload-2',
    title: 'Hotel California Solo Take.mp3',
    subtitle: 'MP3 文件转谱',
    artist: 'Eagles (Cover Solo)',
    coverUrl: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?w=240&auto=format&fit=crop&q=80',
    instrument: 'Electric Guitar',
    category: 'user',
    type: 'unlocked',
    badges: ['TAB', '自转谱', '高保真'],
    tempo: 76,
    keySignature: 'B Minor',
    capo: 0,
    durationSeconds: 28,
    createdAt: '2026-09-29',
    isFavorite: false,
    score: {
      ...ISOLATED_SCORE,
      id: 'user-score-2',
      title: 'Hotel California Solo Take.mp3',
      subtitle: 'Eagles (Cover Solo) - User Transcription',
      transcribedBy: 'User (You)',
    },
  },
];
