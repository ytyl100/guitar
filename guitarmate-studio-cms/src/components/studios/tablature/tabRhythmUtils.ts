import { TabNote } from '../../../types';

export interface TabNoteColumn {
  id: string; // unique key for the vertical chord stack
  timestampSec: number;
  measureIndex: number;
  chordName?: string;
  barreMarker?: string;
  rhythmType: '1/4' | '1/8' | '1/16' | '1/32' | '1/2' | '1/1';
  notes: TabNote[];
  minString: number; // Highest string physically (1 = 1st string e)
  maxString: number; // Lowest string physically (6 = 6th string E)
}

export interface BeamGroup {
  id: string;
  measureIndex: number;
  startColId: string;
  endColId: string;
  startXPercent: number;
  endXPercent: number;
  beamType: '1/8' | '1/16' | '1/32';
  yOffset: number; // baseline Y offset for beam
}

/**
 * Infer standard rhythm type from timestamp delta or note duration
 */
export const inferRhythmType = (
  deltaSec: number,
  bpm: number = 80
): '1/4' | '1/8' | '1/16' | '1/32' | '1/2' | '1/1' => {
  const beatSec = 60 / bpm; // e.g. 0.75s for 80 bpm or 0.6s
  const ratio = deltaSec / beatSec;

  if (ratio >= 3.5) return '1/1'; // whole
  if (ratio >= 1.7) return '1/2'; // half
  if (ratio >= 0.75) return '1/4'; // quarter
  if (ratio >= 0.38) return '1/8'; // eighth
  if (ratio >= 0.18) return '1/16'; // sixteenth
  return '1/32';
};

/**
 * Groups notes within a small epsilon (~35ms) into simultaneous vertical chord stacks (columns)
 */
export const groupNotesIntoColumns = (
  notes: TabNote[],
  bpm: number = 80
): TabNoteColumn[] => {
  if (!notes || notes.length === 0) return [];

  // Sort by timestamp
  const sortedNotes = [...notes].sort((a, b) => a.timestampSec - b.timestampSec);

  const columns: TabNoteColumn[] = [];
  const epsilon = 0.035; // 35ms tolerance for simultaneous chord notes

  for (const note of sortedNotes) {
    // Check if there is an existing column close enough
    let col = columns.find(
      (c) =>
        c.measureIndex === note.measureIndex &&
        Math.abs(c.timestampSec - note.timestampSec) <= epsilon
    );

    if (col) {
      col.notes.push(note);
      if (note.chordName && !col.chordName) col.chordName = note.chordName;
      if (note.barreMarker && !col.barreMarker) col.barreMarker = note.barreMarker;
      if (note.rhythmType) col.rhythmType = note.rhythmType;
      if (note.stringIndex < col.minString) col.minString = note.stringIndex;
      if (note.stringIndex > col.maxString) col.maxString = note.stringIndex;
    } else {
      const explicitRhythm = note.rhythmType;
      columns.push({
        id: `col-${note.id}`,
        timestampSec: note.timestampSec,
        measureIndex: note.measureIndex,
        chordName: note.chordName,
        barreMarker: note.barreMarker,
        rhythmType: explicitRhythm || '1/4',
        notes: [note],
        minString: note.stringIndex,
        maxString: note.stringIndex,
      });
    }
  }

  // Calculate rhythm types for columns that don't have explicit rhythm
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const explicitNote = col.notes.find((n) => n.rhythmType);
    if (explicitNote?.rhythmType) {
      col.rhythmType = explicitNote.rhythmType;
    } else {
      const nextCol = columns[i + 1];
      const delta = nextCol && nextCol.measureIndex === col.measureIndex
        ? nextCol.timestampSec - col.timestampSec
        : col.notes[0]?.durationSec || 0.6;
      col.rhythmType = inferRhythmType(delta, bpm);
    }
  }

  return columns;
};

/**
 * Calculates horizontal rhythm beam connections for 1/8 and 1/16 notes within measures
 */
export const computeRhythmBeams = (
  columns: TabNoteColumn[],
  audioDurationSec: number
): BeamGroup[] => {
  const beams: BeamGroup[] = [];
  if (audioDurationSec <= 0) return beams;

  // Group columns by measureIndex
  const measureMap = new Map<number, TabNoteColumn[]>();
  for (const col of columns) {
    const list = measureMap.get(col.measureIndex) || [];
    list.push(col);
    measureMap.set(col.measureIndex, list);
  }

  measureMap.forEach((cols, mIdx) => {
    // Sort columns within measure
    cols.sort((a, b) => a.timestampSec - b.timestampSec);

    // Group adjacent eighth notes (1/8) or sixteenth notes (1/16)
    let currentBeamList: TabNoteColumn[] = [];

    const flushBeam = () => {
      if (currentBeamList.length >= 2) {
        const first = currentBeamList[0];
        const last = currentBeamList[currentBeamList.length - 1];
        const startXPercent = (first.timestampSec / audioDurationSec) * 100;
        const endXPercent = (last.timestampSec / audioDurationSec) * 100;

        const has16th = currentBeamList.some((c) => c.rhythmType === '1/16' || c.rhythmType === '1/32');

        // Primary 1/8 beam
        beams.push({
          id: `beam-p-${first.id}-${last.id}`,
          measureIndex: mIdx,
          startColId: first.id,
          endColId: last.id,
          startXPercent,
          endXPercent,
          beamType: '1/8',
          yOffset: 0,
        });

        // Secondary 1/16 beam if applicable
        if (has16th) {
          beams.push({
            id: `beam-s-${first.id}-${last.id}`,
            measureIndex: mIdx,
            startColId: first.id,
            endColId: last.id,
            startXPercent,
            endXPercent,
            beamType: '1/16',
            yOffset: -5,
          });
        }
      }
      currentBeamList = [];
    };

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const isSubdivision = col.rhythmType === '1/8' || col.rhythmType === '1/16' || col.rhythmType === '1/32';

      if (isSubdivision) {
        if (currentBeamList.length === 0) {
          currentBeamList.push(col);
        } else {
          // Check time gap: if gap is <= 0.8s, connect them
          const prev = currentBeamList[currentBeamList.length - 1];
          if (col.timestampSec - prev.timestampSec <= 0.85) {
            currentBeamList.push(col);
          } else {
            flushBeam();
            currentBeamList.push(col);
          }
        }
      } else {
        flushBeam();
      }
    }
    flushBeam();
  });

  return beams;
};

/**
 * Snap timestamp to musical grid within a measure
 */
export const snapTimestampToGrid = (
  rawTimeSec: number,
  measureStartSec: number,
  measureEndSec: number,
  snapMode: 'free' | '1/4' | '1/8' | '1/16',
  bpm: number = 80
): number => {
  // Clamp inside measure with 10ms safety buffer
  const clamped = Math.max(measureStartSec, Math.min(measureEndSec - 0.05, rawTimeSec));

  if (snapMode === 'free') {
    return Number(clamped.toFixed(3));
  }

  const beatSec = 60 / bpm; // e.g. 0.6s at 100bpm or 0.75s at 80bpm
  let stepSec = beatSec;

  if (snapMode === '1/8') {
    stepSec = beatSec / 2;
  } else if (snapMode === '1/16') {
    stepSec = beatSec / 4;
  }

  const offsetFromStart = clamped - measureStartSec;
  const snappedOffset = Math.round(offsetFromStart / stepSec) * stepSec;
  const result = measureStartSec + snappedOffset;

  return Number(Math.max(measureStartSec, Math.min(measureEndSec - 0.02, result)).toFixed(3));
};
