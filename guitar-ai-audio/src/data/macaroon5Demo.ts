import { ScoreData, Measure } from '../types/music';
import { getNoteForFret } from '../utils/guitarTheory';

// Helper to create a note with calculated pitch and MIDI
function createNote(
  id: string,
  string: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  beat: number,
  duration: 'w' | 'h' | 'q' | '8' | '16' = 'q',
  durationBeats = 1.0,
  isTied = false,
  technique: 'none' | 'hammer' | 'pull' | 'slide' | 'bend' | 'vibrato' | 'harmonic' | 'mute' = 'none'
) {
  const { midi, pitch } = getNoteForFret(string, fret);
  return {
    id,
    string,
    fret,
    beat,
    duration,
    durationBeats,
    isTied,
    technique,
    midi,
    pitch,
  };
}

export const MACAROON_5_SCORE: ScoreData = {
  id: 'macaroon-5',
  title: 'Macaroon 5 | YouTube Audio Library',
  subtitle: 'Original Transcription',
  tempo: 104,
  timeSignature: '4/4',
  keySignature: 'Eb/Cm',
  flatsCount: 3,
  sharpsCount: 0,
  tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
  tuningName: 'Standard tuning',
  capo: 3,
  transcribedBy: 'guitarmate',
  totalDurationSeconds: 30,
  sourceType: 'youtube',
  videoUrl: 'https://www.youtube.com/watch?v=kYJqA3a4C0g',
  videoTitle: 'Macaroon 5 - Acoustic Guitar Cover (Fingerstyle)',
  videoArtist: 'Takaharu Yasue',
  videoThumbnail: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=480&auto=format&fit=crop&q=80',
  measures: [
    // Measure 1 - Cm
    {
      id: 'm1',
      number: 1,
      chord: { name: 'Cm', fretPosition: 3, beat: 0, diagramFret: 3 },
      notes: [
        createNote('m1-n1', 2, 4, 0.0, 'q', 1.0),
        createNote('m1-n2', 3, 5, 0.0, 'q', 1.0),
        createNote('m1-n3', 6, 3, 2.0, 'h', 2.0),
      ],
    },
    // Measure 2 - G7
    {
      id: 'm2',
      number: 2,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m2-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m2-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m2-n3', 3, 5, 1.5, '8', 0.5),
        createNote('m2-n4', 2, 3, 2.0, '8', 0.5),
        createNote('m2-n5', 2, 6, 2.5, '8', 0.5),
        createNote('m2-n6', 6, 3, 3.0, '8', 0.5),
        createNote('m2-n7', 6, 3, 3.5, '8', 0.5, true), // (3)
      ],
    },
    // Measure 3 - Cm
    {
      id: 'm3',
      number: 3,
      chord: { name: 'Cm', fretPosition: 3, beat: 0 },
      notes: [
        createNote('m3-n1', 2, 4, 0.0, 'q', 1.0),
        createNote('m3-n2', 3, 5, 0.0, 'q', 1.0),
        createNote('m3-n3', 1, 6, 2.0, '16', 0.25),
        createNote('m3-n4', 1, 5, 2.25, '16', 0.25),
        createNote('m3-n5', 1, 3, 2.5, '8', 0.5),
        createNote('m3-n6', 2, 3, 3.0, 'q', 1.0),
      ],
    },
    // Measure 4 - G7
    {
      id: 'm4',
      number: 4,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m4-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m4-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m4-n3', 1, 3, 1.5, '8', 0.5),
        createNote('m4-n4', 1, 3, 2.0, '8', 0.5),
        createNote('m4-n5', 6, 1, 2.5, '16', 0.25),
        createNote('m4-n6', 6, 1, 2.75, '16', 0.25, true), // (1)
        createNote('m4-n7', 6, 3, 3.0, '16', 0.25),
        createNote('m4-n8', 6, 3, 3.25, '16', 0.25, true), // (3)
        createNote('m4-n9', 6, 3, 3.5, '8', 0.5),
      ],
    },
    // Measure 5 - Cm
    {
      id: 'm5',
      number: 5,
      chord: { name: 'Cm', fretPosition: 3, beat: 0 },
      notes: [
        createNote('m5-n1', 2, 4, 0.0, 'q', 1.0),
        createNote('m5-n2', 3, 5, 0.0, 'q', 1.0),
        createNote('m5-n3', 2, 4, 1.0, 'q', 1.0, true), // (4)
        createNote('m5-n4', 3, 5, 1.0, 'q', 1.0, true), // (5)
        createNote('m5-n5', 2, 4, 2.0, '8', 0.5),
        createNote('m5-n6', 3, 5, 2.0, '8', 0.5),
        createNote('m5-n7', 2, 4, 2.5, '8', 0.5),
        createNote('m5-n8', 3, 5, 2.5, '8', 0.5),
        createNote('m5-n9', 5, 3, 3.0, 'q', 1.0),
      ],
    },
    // Measure 6 - G7
    {
      id: 'm6',
      number: 6,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m6-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m6-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m6-n3', 2, 6, 1.5, '8', 0.5),
        createNote('m6-n4', 2, 4, 2.0, '8', 0.5),
        createNote('m6-n5', 2, 3, 2.5, '8', 0.5),
      ],
    },
    // Measure 7 - Cm
    {
      id: 'm7',
      number: 7,
      chord: { name: 'Cm', fretPosition: 3, beat: 0 },
      notes: [
        createNote('m7-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m7-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m7-n3', 2, 3, 1.0, '8', 0.5, true), // (3)
        createNote('m7-n4', 2, 6, 1.5, '8', 0.5),
        createNote('m7-n5', 2, 3, 2.0, '8', 0.5),
        createNote('m7-n6', 2, 6, 2.5, '8', 0.5),
        createNote('m7-n7', 6, 3, 3.0, '8', 0.5),
      ],
    },
    // Measure 8 - G7
    {
      id: 'm8',
      number: 8,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m8-n1', 2, 3, 0.0, '8', 0.5),
        createNote('m8-n2', 3, 3, 0.0, '8', 0.5),
        createNote('m8-n3', 6, 1, 1.0, '8', 0.5),
        createNote('m8-n4', 6, 3, 1.5, '8', 0.5),
        createNote('m8-n5', 2, 3, 2.0, 'q', 1.0),
        createNote('m8-n6', 3, 4, 2.0, 'q', 1.0),
        createNote('m8-n7', 2, 3, 3.0, 'q', 1.0),
        createNote('m8-n8', 3, 4, 3.0, 'q', 1.0),
      ],
    },
    // Measure 9 - Cm
    {
      id: 'm9',
      number: 9,
      chord: { name: 'Cm', fretPosition: 3, beat: 0 },
      notes: [
        createNote('m9-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m9-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m9-n3', 2, 3, 1.0, '16', 0.25, true), // (3)
        createNote('m9-n4', 3, 3, 1.0, '16', 0.25, true), // (3)
        createNote('m9-n5', 2, 3, 1.25, '16', 0.25),
        createNote('m9-n6', 2, 3, 1.5, '16', 0.25),
        createNote('m9-n7', 2, 3, 1.75, '16', 0.25),
        createNote('m9-n8', 6, 3, 2.5, '8', 0.5),
      ],
    },
    // Measure 10 - G7
    {
      id: 'm10',
      number: 10,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m10-n1', 2, 3, 0.0, '8', 0.5),
        createNote('m10-n2', 6, 3, 1.0, '8', 0.5),
        createNote('m10-n3', 2, 1, 2.0, '8', 0.5),
        createNote('m10-n4', 3, 4, 2.0, '8', 0.5),
        createNote('m10-n5', 2, 5, 3.0, '8', 0.5),
        createNote('m10-n6', 3, 3, 3.0, '8', 0.5),
      ],
    },
    // Measure 11 - Cm
    {
      id: 'm11',
      number: 11,
      chord: { name: 'Cm', fretPosition: 3, beat: 0 },
      notes: [
        createNote('m11-n1', 2, 3, 0.0, 'q', 1.0),
        createNote('m11-n2', 3, 3, 0.0, 'q', 1.0),
        createNote('m11-n3', 2, 3, 1.0, '16', 0.25, true), // (3)
        createNote('m11-n4', 3, 3, 1.0, '16', 0.25, true), // (3)
        createNote('m11-n5', 2, 3, 1.25, '16', 0.25),
        createNote('m11-n6', 2, 3, 1.5, '16', 0.25),
        createNote('m11-n7', 2, 3, 1.75, '16', 0.25),
        createNote('m11-n8', 6, 3, 2.5, '8', 0.5),
      ],
    },
    // Measure 12 - G7 then Ab
    {
      id: 'm12',
      number: 12,
      chord: { name: 'G7', fretPosition: 1, beat: 0 },
      notes: [
        createNote('m12-n1', 2, 3, 0.0, '8', 0.5),
        createNote('m12-n2', 2, 1, 1.0, '8', 0.5),
        createNote('m12-n3', 3, 4, 1.0, '8', 0.5),
        createNote('m12-n4', 2, 0, 2.0, '8', 0.5),
        createNote('m12-n5', 3, 3, 2.0, '8', 0.5),
        // Ab chord at beat 3
        createNote('m12-n6', 1, 4, 3.0, 'q', 1.0),
        createNote('m12-n7', 2, 4, 3.0, 'q', 1.0),
        createNote('m12-n8', 3, 5, 3.0, 'q', 1.0),
        createNote('m12-n9', 4, 5, 3.0, 'q', 1.0),
      ],
    },
  ],
};
