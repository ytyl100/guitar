import { CHORD_DATABASE } from '../data/mockData';
import { LyricLine, TabData, TabNote } from '../types';

// Standard guitar open frequencies (String 1 to String 6)
export const TAB_STRING_FREQS: Record<number, number> = {
  1: 329.63, // High E (E4)
  2: 246.94, // B (B3)
  3: 196.0,  // G (G3)
  4: 146.83, // D (D3)
  5: 110.0,  // A (A2)
  6: 82.41,  // Low E (E2)
};

export const TAB_STRING_NAMES: Record<number, string> = {
  1: 'e',
  2: 'B',
  3: 'G',
  4: 'D',
  5: 'A',
  6: 'E',
};

/**
 * Calculates audio pitch for a tab note
 */
export function getTabNoteFrequency(stringNum: number, fretVal: number | string): number {
  const baseFreq = TAB_STRING_FREQS[stringNum] || 329.63;
  let numFret = 0;
  if (typeof fretVal === 'number') {
    numFret = fretVal;
  } else {
    const match = String(fretVal).match(/\d+/);
    numFret = match ? parseInt(match[0], 10) : 0;
  }
  return baseFreq * Math.pow(2, numFret / 12);
}

/**
 * Returns authentic 6-line tablature data for a lyric line.
 * If the line already defines tabData, uses it.
 * Otherwise, generates an authentic fingerpicking/strum tab pattern from the chords.
 */
export function getLineTabData(
  line: LyricLine,
  lineDuration?: number,
  lineStartSec?: number
): TabData {
  if (line.tabData && line.tabData.notes.length > 0) {
    return line.tabData;
  }

  // Generate pattern based on chords in the line
  const chords = line.chords;
  if (!chords || chords.length === 0) {
    return {
      measureCount: 2,
      notes: [],
    };
  }

  const notes: TabNote[] = [];
  const chordCount = chords.length;

  chords.forEach((c, idx) => {
    let startPct: number;
    let slotWidth: number;

    if (
      c.timeSec !== undefined &&
      lineDuration !== undefined &&
      lineStartSec !== undefined &&
      lineDuration > 0
    ) {
      startPct = Math.max(0, Math.min(88, ((c.timeSec - lineStartSec) / lineDuration) * 100));
      const nextChord = chords[idx + 1];
      const nextTime =
        nextChord?.timeSec !== undefined
          ? nextChord.timeSec
          : lineStartSec + lineDuration;
      const durationToNext = Math.max(0.2, nextTime - c.timeSec);
      slotWidth = Math.max(10, Math.min(100 - startPct, (durationToNext / lineDuration) * 100));
    } else {
      startPct = (idx / chordCount) * 100;
      slotWidth = 100 / chordCount;
    }

    const chordDef = CHORD_DATABASE[c.chord];

    // Find bass string for chord (lowest non-x string)
    let bassString = 6;
    let frets: (number | 'x')[] = [0, 0, 0, 0, 0, 0];

    if (chordDef) {
      frets = chordDef.frets;
      // string 6 is idx 0, string 1 is idx 5
      for (let s = 0; s < 6; s++) {
        if (frets[s] !== 'x') {
          bassString = 6 - s;
          break;
        }
      }
    } else {
      // Common bass fallback
      if (['C', 'A', 'Am'].includes(c.chord)) bassString = 5;
      else if (['D', 'Dm'].includes(c.chord)) bassString = 4;
      else bassString = 6;
    }

    const getFretForString = (strNum: number): number => {
      const idxInFrets = 6 - strNum;
      const f = frets[idxInFrets];
      return typeof f === 'number' ? f : 0;
    };

    // 4-beat arpeggio pattern per chord:
    // Beat 1: Bass string with Chord Name annotated
    notes.push({
      string: bassString,
      fret: getFretForString(bassString),
      timePct: Math.round(startPct + slotWidth * 0.05),
      chord: c.chord,
      durationPct: slotWidth * 0.22,
    });

    // Beat 2: 4th or 3rd string
    const s2 = bassString <= 4 ? 3 : 4;
    notes.push({
      string: s2,
      fret: getFretForString(s2),
      timePct: Math.round(startPct + slotWidth * 0.28),
      durationPct: slotWidth * 0.22,
    });

    // Beat 3: 2nd string
    notes.push({
      string: 2,
      fret: getFretForString(2),
      timePct: Math.round(startPct + slotWidth * 0.52),
      durationPct: slotWidth * 0.22,
    });

    // Beat 4: 1st string
    notes.push({
      string: 1,
      fret: getFretForString(1),
      timePct: Math.round(startPct + slotWidth * 0.76),
      durationPct: slotWidth * 0.22,
    });
  });

  return {
    measureCount: Math.max(2, chordCount),
    notes,
  };
}
