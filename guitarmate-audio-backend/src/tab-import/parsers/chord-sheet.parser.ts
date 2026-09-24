/**
 * 「和弦 + 扫弦模式」解析器
 * ==========================
 *
 * 这是**最适合做种子数据**的一类谱面：节奏吉他只需要「和弦名 + 把位 + 扫弦模式」，
 * 而这些信息人工制谱已经校准过，比 AI 从音频里扒节奏吉他准得多。
 *
 * 输入示例：
 *
 * ```text
 * Title: Demo Progression
 * Tempo: 90
 * Time: 4/4
 * Capo: 0
 * Strum: D D U U D U
 *
 * [Intro]
 * Bm | F#7 | A | E7
 * ```
 *
 * 输出：**真实的六线谱音符**（不是一个和弦名了事）——
 * 每个扫弦槽位都会把该把位上所有发声音弦写成音符，
 * 因此 C 端能正常显示节点、高亮、逐音拨响。
 *
 * 约定：
 * - `|` 分组的每组 = 1 个小节；组内多个和弦按拍均分。
 * - 没有 `|` 时，一行里每个和弦 = 1 个小节。
 * - `%` = 重复上一小节的和弦；`N.C.` = 无和弦（保留时长但无音符）。
 * - `(x2)` / `x2` = 该行重复两遍。
 */

import type {
  RightsStatus,
  TabInstrument,
  TabProject,
  TabProjectChord,
  TabProjectMeasure,
  TabProjectNote,
  TabProjectWarning,
} from '../tab-project.types';
import {
  PARSER_VERSION,
  STANDARD_TUNING,
  barreFromVoicing,
  beatsPerMeasure,
  buildTimeline,
  computeStats,
  lookupVoicing,
  makeChord,
  makeNote,
  makeWarning,
  parseTimeSignature,
  voicingToNotes,
} from '../tab-project.utils';

export class ChordSheetParseError extends Error {}

export interface ChordSheetParseOptions {
  fileName?: string;
  url?: string;
  site?: string;
  rights?: RightsStatus;
  rightsNote?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  timeSignature?: string;
  capo?: number;
  tuning?: number[];
  instrument?: TabInstrument;
  /** 覆盖文件头里的扫弦模式，例如 'D D U U D U' */
  strumPattern?: string;
  /** 每小节和弦数（谱面没写 `|` 时决定一行切几小节），默认 1 */
  chordsPerBar?: number;
}

const TITLE_KEYS = ['title', 'song', 'name'];
const ARTIST_KEYS = ['artist', 'band', 'author', 'composer'];
const TEMPO_KEYS = ['tempo', 'bpm', 'speed'];
const TIME_KEYS = ['time', 'time signature', 'meter'];
const CAPO_KEYS = ['capo'];
const STRUM_KEYS = ['strum', 'strumming', 'pattern', 'rhythm', '节奏', '扫弦'];
const KEY_KEYS = ['key'];

type StrumSlot = 'D' | 'U' | 'x' | '-';

const DEFAULT_STRUM_PATTERN = 'D D U U D U';

/** 解析扫弦模式字符串 */
export function parseStrumPattern(raw?: string): StrumSlot[] {
  const source = (raw || DEFAULT_STRUM_PATTERN).trim();
  const slots = source
    .split(/[\s,|]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token[0].toUpperCase())
    .map((ch): StrumSlot => {
      if (ch === 'D' || ch === '↓' || ch === 'V') return 'D';
      if (ch === 'U' || ch === '↑' || ch === '^') return 'U';
      if (ch === 'X' || ch === 'M') return 'x';
      return '-';
    });
  return slots.length > 0 ? slots : ['D', 'D', 'U', 'U', 'D', 'U'];
}

/** 是否是「只有和弦」的行 */
function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\w+\s*[:：]/.test(trimmed)) return false;
  const cleaned = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bx\s?\d+\b/gi, ' ')
    .replace(/[|:]/g, ' ')
    .replace(/\bN\.?C\.?\b/gi, ' N.C. ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(
    (t) =>
      t === '%' ||
      /^N\.?C\.?$/i.test(t) ||
      /^[A-G][#b]?(maj|min|m|M|dim|aug|sus|add|°|ø|\+|-|\d|#|b)*(\/[A-G][#b]?)?$/.test(t),
  );
}

function sectionNameOf(line: string): string | null {
  const trimmed = line.trim();
  const bracket = trimmed.match(/^\[([^\]]{1,40})\]$/);
  if (bracket) return bracket[1].trim();
  const label = trimmed.match(
    /^(intro|verse|chorus|bridge|solo|outro|pre-?chorus|interlude|riff|coda|ending|主歌|副歌|前奏|间奏|尾奏|华彩|独奏)\s*\d*\s*[:：]?$/i,
  );
  return label ? trimmed.replace(/[:：]$/, '').trim() : null;
}

/** 从一行抽出和弦 token，保留 `|` 分组结构 */
function extractBarGroups(line: string): string[][] {
  const hasPipe = line.includes('|');
  const body = line.replace(/\([^)]*\)/g, ' ');
  if (!hasPipe) {
    return body
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => /^[A-G]/.test(t) || /^N\.?C\.?$/i.test(t))
      .map((t) => [t]);
  }
  return body
    .split('|')
    .map((group) =>
      group
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => /^[A-G]/.test(t) || /^N\.?C\.?$/i.test(t) || t === '%'),
    )
    .filter((g, idx, arr) => g.length > 0 || (idx > 0 && idx < arr.length - 1));
}

export function parseChordSheet(text: string, options: ChordSheetParseOptions = {}): TabProject {
  const warnings: TabProjectWarning[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const headers = new Map<string, string>();
  const bodyStart = lines.findIndex((l) => sectionNameOf(l) !== null || isChordLine(l));
  const headerEnd = bodyStart === -1 ? lines.length : bodyStart;
  for (let i = 0; i < Math.min(headerEnd, 40); i++) {
    const m = lines[i].match(
      /^\s*([A-Za-z\u4e00-\u9fa5][A-Za-z\u4e00-\u9fa5 /_-]{0,20})\s*[:：]\s*(.+?)\s*$/,
    );
    if (m) headers.set(m[1].trim().toLowerCase(), m[2]);
  }
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) for (const [hk, hv] of headers) if (hk === k) return hv;
    return undefined;
  };

  const title =
    options.title ||
    pick(TITLE_KEYS) ||
    options.fileName?.replace(/\.[a-z0-9]+$/i, '') ||
    '未命名曲目';
  const artist = options.artist || pick(ARTIST_KEYS);
  const rawTempo = parseFloat((pick(TEMPO_KEYS) || '').match(/\d+(\.\d+)?/)?.[0] || '');
  const bpm = options.bpm || (Number.isFinite(rawTempo) && rawTempo > 0 ? Math.round(rawTempo) : 90);
  const timeSignatureRaw = options.timeSignature || pick(TIME_KEYS) || '4/4';
  const timeSignature = /^\d+\s*\/\s*\d+$/.test(timeSignatureRaw.trim())
    ? timeSignatureRaw.trim().replace(/\s+/g, '')
    : '4/4';
  const capoRaw = parseInt((pick(CAPO_KEYS) || '').match(/\d+/)?.[0] || '0', 10);
  const capo = options.capo ?? (Number.isFinite(capoRaw) ? capoRaw : 0);
  const tuning = options.tuning || [...STANDARD_TUNING];
  const key = pick(KEY_KEYS);
  const strumPattern = (options.strumPattern || pick(STRUM_KEYS) || DEFAULT_STRUM_PATTERN).trim();
  const slots = parseStrumPattern(strumPattern);

  const { beats: tsBeats, beatValue } = parseTimeSignature(timeSignature);
  const beatsInMeasure = tsBeats * (4 / beatValue);
  const secPerBeat = 60 / bpm;
  const measureSec = beatsInMeasure * secPerBeat;
  const slotSec = measureSec / slots.length;
  /** 同一扫弦内相邻弦的起音错位，模拟真实扫弦（总跨度 ≤ 60ms） */
  const stringSpreadSec = Math.min(0.012, 0.06 / 6);

  const measures: TabProjectMeasure[] = [];
  const unknownChords = new Set<string>();
  const generatedVoicings = new Set<string>();

  let currentSection: string | null = null;
  let lastChordName: string | null = null;

  const pushMeasureFromChords = (chordNames: string[]): void => {
    const measureIndex = measures.length;
    const notes: TabProjectNote[] = [];
    const chords: TabProjectChord[] = [];

    const perChordSec = measureSec / Math.max(1, chordNames.length);
    const perChordBeats = beatsInMeasure / Math.max(1, chordNames.length);
    let anySounding = false;

    chordNames.forEach((rawName, chordIdx) => {
      const isNoChord = /^N\.?C\.?$/i.test(rawName);
      const chordName = rawName === '%' ? lastChordName || '' : rawName;
      if (!chordName || isNoChord) {
        if (chordName) lastChordName = chordName;
        return;
      }
      lastChordName = chordName;

      const lookup = lookupVoicing(chordName);
      if (!lookup.frets) {
        unknownChords.add(chordName);
        return;
      }
      if (lookup.source === 'generated') generatedVoicings.add(chordName);

      const voicing = lookup.frets;
      const chordStartSec = chordIdx * perChordSec;
      const chordStartBeat = chordIdx * perChordBeats;

      chords.push(
        makeChord({
          name: chordName,
          offsetSec: chordStartSec,
          beat: chordStartBeat,
          durationSec: perChordSec,
          frets: voicing,
          strumPattern,
        }),
      );

      const sounding = voicingToNotes(voicing, tuning, capo).sort((a, b) => b.string - a.string);
      if (sounding.length === 0) return;

      for (let s = 0; s < slots.length; s++) {
        const slot = slots[s];
        const slotBeat = (s / slots.length) * beatsInMeasure;
        if (slotBeat < chordStartBeat - 1e-6) continue;
        if (chordIdx < chordNames.length - 1 && slotBeat >= chordStartBeat + perChordBeats - 1e-6) {
          continue;
        }
        if (slot === '-') continue;

        const isUp = slot === 'U';
        // 上扫只扫高音弦（真实演奏习惯）；下扫全扫；闷扫 = 闷音
        const target = isUp
          ? sounding.filter((n) => n.string <= 4).sort((a, b) => a.string - b.string)
          : sounding;
        const accent = s % 2 === 0;

        target.forEach((n, idx) => {
          const at = slotBeat * secPerBeat + idx * stringSpreadSec;
          notes.push(
            makeNote({
              id: `cs_m${measureIndex}_c${chordIdx}_s${s}_str${n.string}`,
              string: n.string,
              fret: n.fret,
              offsetSec: at,
              beat: slotBeat,
              durationSec: Math.min(slotSec * 2, Math.max(0.12, slotSec * 1.6)),
              tuning,
              capo,
              technique: slot === 'x' ? 'palm-mute' : 'normal',
              velocity: isUp ? (accent ? 82 : 72) : accent ? 104 : 90,
              confidence: 1,
              chordName,
            }),
          );
        });
        anySounding = true;
      }
    });

    measures.push({
      index: measureIndex,
      label: `${currentSection ? currentSection + ' ' : ''}第 ${measureIndex + 1} 小节`.trim(),
      timeSignature,
      bpm,
      startTime: 0,
      endTime: 0,
      beats: beatsInMeasure,
      notes,
      chords: chords.length > 0 ? chords : undefined,
      rawText: chordNames.join(' | '),
      sourceRef: `和弦表 第 ${measureIndex + 1} 小节`,
    });

    if (!anySounding && chordNames.some((c) => !/^N\.?C\.?$/i.test(c))) {
      warnings.push(
        makeWarning(
          'warn',
          'chord-no-notes',
          `第 ${measureIndex + 1} 小节没有生成任何音符（和弦无法识别或为空小节）。`,
          measureIndex,
        ),
      );
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const section = sectionNameOf(trimmed);
    if (section) {
      currentSection = section;
      continue;
    }
    if (!isChordLine(trimmed)) continue;

    const repeatMatch = trimmed.match(/\(?\s*[xX×]\s*(\d+)\s*\)?/);
    const repeat = repeatMatch ? Math.min(8, Math.max(1, parseInt(repeatMatch[1], 10))) : 1;

    const groups = extractBarGroups(trimmed);
    if (groups.length === 0) continue;

    const chordsPerBar = Math.max(1, options.chordsPerBar ?? 1);
    for (let r = 0; r < repeat; r++) {
      for (const group of groups) {
        if (group.length === 0) continue;
        if (group.length <= chordsPerBar) {
          pushMeasureFromChords(group);
        } else {
          for (let i = 0; i < group.length; i += chordsPerBar) {
            pushMeasureFromChords(group.slice(i, i + chordsPerBar));
          }
        }
      }
    }
  }

  if (measures.length === 0) {
    throw new ChordSheetParseError(
      '没有解析到任何和弦行。请提供形如 `Bm | F#7 | A | E7` 的和弦进行（可带 `Strum: D D U U D U` 扫弦模式）。',
    );
  }

  if (unknownChords.size > 0) {
    warnings.push(
      makeWarning(
        'warn',
        'chord-unknown-voicing',
        `以下和弦没有内置把位，已跳过（可在 tab-project.utils.ts 的 CHORD_VOICINGS 里补充）：${Array.from(
          unknownChords,
        ).join(', ')}`,
      ),
    );
  }
  if (generatedVoicings.size > 0) {
    warnings.push(
      makeWarning(
        'info',
        'chord-voicing-generated',
        `以下和弦使用「移动式横按模板」自动生成把位，请人工确认是否好听：${Array.from(
          generatedVoicings,
        ).join(', ')}`,
      ),
    );
  }
  warnings.push(
    makeWarning(
      'info',
      'chord-sheet-rhythm-synthetic',
      `节奏吉他的音符是按扫弦模式「${strumPattern}」合成的（每个槽位把把位上所有发声音弦写成音符），` +
        '并非真实演奏的精确时值。适合教学演示与练习骨架，如需 1:1 还原请导入 Guitar Pro / MusicXML。',
    ),
  );

  const timeline = buildTimeline(measures, bpm, timeSignature);
  const instrument: TabInstrument = options.instrument || 'guitar_rhythm';
  const project: Omit<TabProject, 'stats'> = {
    format: 'guitarmate-tab-project',
    version: '1.0',
    meta: {
      title,
      artist,
      bpm,
      timeSignature,
      key,
      instrument,
      capo,
      sections: buildSections(timeline),
    },
    tuning,
    capo,
    tracks: [
      { id: 'track_1', name: title, instrument, tuning, capo, measures: timeline },
    ],
    source: {
      kind: 'chord-sheet',
      fileName: options.fileName,
      url: options.url,
      site: options.site || 'Chord sheet',
      rights: options.rights || 'unknown',
      rightsNote: options.rightsNote,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...project, stats: computeStats(project) };
}

function buildSections(
  measures: TabProjectMeasure[],
): Array<{ name: string; fromMeasure: number; toMeasure: number }> {
  const out: Array<{ name: string; fromMeasure: number; toMeasure: number }> = [];
  let current: { name: string; fromMeasure: number; toMeasure: number } | null = null;
  measures.forEach((m, idx) => {
    const label = (m.label || '').replace(/第 \d+ 小节$/, '').trim() || '主歌';
    if (!current || current.name !== label) {
      if (current) out.push(current);
      current = { name: label, fromMeasure: idx, toMeasure: idx };
    } else {
      current.toMeasure = idx;
    }
  });
  if (current) out.push(current);
  return out;
}

/** 供其它模块复用：取和弦的横按信息 */
export function voicingBarre(
  chordName: string,
): { fret: number; fromString: number; toString: number } | null {
  const lookup = lookupVoicing(chordName);
  return lookup.frets ? barreFromVoicing(lookup.frets) : null;
}
