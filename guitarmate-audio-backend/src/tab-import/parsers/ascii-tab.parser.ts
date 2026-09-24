/**
 * ASCII 六线谱解析器
 * ==================
 *
 * 目标格式（Ultimate Guitar / GuitarTabs / 论坛拷贝下来的纯文本）：
 *
 * ```text
 * Title: Greensleeves
 * Artist: Traditional
 * Tempo: 100
 * Time: 6/8
 * Tuning: E A D G B E
 * Capo: 0
 *
 * [Verse]
 *  Am      C        G        Am
 * e|-------0--------3--------0-------|
 * B|-----1----------0----------1-----|
 * G|---2------------0------------2---|
 * D|---------------------------------|
 * A|-0--------3----------------0-----|
 * E|---------------------------------|
 * ```
 *
 * 解析要点（也是 ASCII 谱的固有局限，必须如实告知教研老师）：
 *
 * 1. ASCII 谱 **没有时值信息**，只有列位置。本解析器把小节内每一列
 *    线性映射到拍网格（`beat = col / 列宽 × 小节拍数`），节奏是**近似值**，
 *    会写入 `warnings`（code=`ascii-rhythm-approximate`）。
 * 2. 多根弦在同一列 ⇒ 同一时刻 ⇒ 构成和弦/扫弦（这是 ASCII 谱唯一可靠的时序信息）。
 * 3. 弦序按「自上而下 = 一弦 → 六弦」判定；行首音名标签用于校验，
 *    标签顺序相反（低音 E 在最上）时自动翻转。
 * 4. 技巧符号 `h p b r / \ ~ x` 会被解析并映射到统一 technique 字段。
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
  TUNING_PRESETS,
  buildTimeline,
  computeStats,
  makeChord,
  makeNote,
  makeWarning,
  noteNameToPitchClass,
  parseTimeSignature,
} from '../tab-project.utils';

export class AsciiTabParseError extends Error {}

export interface AsciiTabParseOptions {
  fileName?: string;
  url?: string;
  site?: string;
  rights?: RightsStatus;
  rightsNote?: string;
  /** 覆盖文件头里的信息（后台手动纠正用） */
  title?: string;
  artist?: string;
  bpm?: number;
  timeSignature?: string;
  capo?: number;
  tuning?: number[];
  instrument?: TabInstrument;
}

/** 技巧符号 → 统一 technique */
const TECHNIQUE_MAP: Record<string, TabProjectNote['technique']> = {
  h: 'hammer-on',
  p: 'pull-off',
  b: 'bend',
  r: 'bend',
  '/': 'slide',
  '\\': 'slide',
  s: 'slide',
  '~': 'vibrato',
  v: 'vibrato',
  x: 'dead-note',
  X: 'dead-note',
  t: 'normal',
};

const TITLE_KEYS = ['title', 'song', 'song name', 'name'];
const ARTIST_KEYS = ['artist', 'band', 'author', 'composer'];
const TEMPO_KEYS = ['tempo', 'bpm', 'speed'];
const TIME_KEYS = ['time', 'time signature', 'timesig', 'meter', 'sig'];
const TUNING_KEYS = ['tuning', 'tune'];
const CAPO_KEYS = ['capo', 'capodaster'];
const KEY_KEYS = ['key'];
const STRUM_KEYS = ['strum', 'strumming', 'pattern', 'rhythm pattern'];
const TRANSCRIBER_KEYS = ['transcribed by', 'by', 'tabbed by', 'arranged by', 'transcriber'];

const normaliseKey = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ');

const stringLabelOf = (line: string): string | null => {
  const m = line.match(/^\s*([eEbBgGdDaA])?\s*[|:]/);
  return m && m[1] ? m[1] : null;
};

/** 是否是六线谱行 */
function isTabLine(line: string): boolean {
  if (!line) return false;
  if (/^\s*[eEbBgGdDaA]?\s*[|:][\s\-0-9hpbrsxX/\\~|<>*.]*$/.test(line)) {
    return (line.match(/[-0-9]/g) || []).length >= 3;
  }
  return false;
}

/** 是否是「只有和弦名」的行，例如 `Bm  F#7   A` */
function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (!/[A-G]/.test(trimmed)) return false;
  const cleaned = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b[xX]\s?\d+\b/g, ' ')
    .replace(/[-–—|:]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) =>
    /^[A-G][#b]?(m|min|maj|M|dim|aug|sus|add|°|ø|\+|-|\d|#|b|\/|[A-G])*$/.test(t),
  );
}

/** 段落标记 `[Verse]` / `Verse 1:` */
function sectionNameOf(line: string): string | null {
  const trimmed = line.trim();
  const bracket = trimmed.match(/^\[([^\]]{1,40})\]$/);
  if (bracket) return bracket[1].trim();
  const label = trimmed.match(
    /^(intro|verse|chorus|bridge|solo|outro|pre-?chorus|interlude|riff|coda|ending|主歌|副歌|前奏|间奏|尾奏|华彩|独奏)\s*\d*\s*[:：]?$/i,
  );
  return label ? trimmed.replace(/[:：]$/, '').trim() : null;
}

/** `Tuning: E A D G B E` / `Tuning: EADGBE` / `Tuning: Drop D` */
function parseTuning(raw: string): number[] | null {
  const value = raw.trim();
  const presetKey = Object.keys(TUNING_PRESETS).find(
    (k) => k.toLowerCase() === value.toLowerCase().replace(/[\s_-]/g, ''),
  );
  if (presetKey) return [...TUNING_PRESETS[presetKey]];

  const presetLoose: Record<string, number[]> = {
    dropd: TUNING_PRESETS.dropD,
    dadgad: TUNING_PRESETS.dadgad,
    halfstepdown: TUNING_PRESETS.halfStepDown,
    eb: TUNING_PRESETS.halfStepDown,
    fullstepdown: TUNING_PRESETS.fullStepDown,
  };
  const looseKey = value.toLowerCase().replace(/[\s_-]/g, '');
  if (presetLoose[looseKey]) return [...presetLoose[looseKey]];

  const tokens = value.match(/[A-Ga-g][#b]?/g);
  if (!tokens || tokens.length < 4 || tokens.length > 8) return null;

  // 音名无法唯一确定八度 → 以标准调弦为基准按最近音程补齐
  const baseReversed = [...STANDARD_TUNING].reverse(); // 六弦 → 一弦
  const pitches: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const pc = noteNameToPitchClass(tokens[i]);
    if (pc === null) return null;
    const reference = baseReversed[i] ?? baseReversed[baseReversed.length - 1];
    const refPc = ((reference % 12) + 12) % 12;
    if (refPc === pc) {
      pitches.push(reference);
      continue;
    }
    let diff = pc - refPc;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    pitches.push(reference + diff);
  }
  if (pitches.length !== 6) return null;
  return pitches.reverse(); // 一弦在前
}

interface ChordToken {
  name: string;
  column: number;
}

export function parseAsciiTab(text: string, options: AsciiTabParseOptions = {}): TabProject {
  const warnings: TabProjectWarning[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  // ── 1. 文件头 ──────────────────────────────
  const headers = new Map<string, string>();
  let firstTabLine = lines.findIndex((l) => isTabLine(l));
  if (firstTabLine === -1) firstTabLine = lines.length;
  for (let i = 0; i < Math.min(firstTabLine, 40); i++) {
    const m = lines[i].match(/^\s*([A-Za-z][A-Za-z /_-]{1,28})\s*[:：]\s*(.+?)\s*$/);
    if (m) headers.set(normaliseKey(m[1]), m[2]);
  }
  const pickHeader = (keys: string[]): string | undefined => {
    for (const k of keys) {
      for (const [hk, hv] of headers) if (hk === k || hk.startsWith(k)) return hv;
    }
    return undefined;
  };

  const title =
    options.title ||
    pickHeader(TITLE_KEYS) ||
    options.fileName?.replace(/\.[a-z0-9]+$/i, '') ||
    '未命名曲目';
  const artist = options.artist || pickHeader(ARTIST_KEYS);
  const transcriber = pickHeader(TRANSCRIBER_KEYS);
  const rawTempo = parseFloat((pickHeader(TEMPO_KEYS) || '').match(/\d+(\.\d+)?/)?.[0] || '');
  const bpm = options.bpm || (Number.isFinite(rawTempo) && rawTempo > 0 ? Math.round(rawTempo) : 90);
  const timeSignatureRaw = options.timeSignature || pickHeader(TIME_KEYS) || '4/4';
  const timeSignature = /^\d+\s*\/\s*\d+$/.test(timeSignatureRaw.trim())
    ? timeSignatureRaw.trim().replace(/\s+/g, '')
    : '4/4';
  if (timeSignatureRaw.trim() !== timeSignature) {
    warnings.push(
      makeWarning('info', 'ascii-time-signature-fallback', `拍号「${timeSignatureRaw}」无法识别，已按 4/4 处理。`),
    );
  }
  const capoRaw = parseInt((pickHeader(CAPO_KEYS) || '').match(/\d+/)?.[0] || '0', 10);
  const capo = options.capo ?? (Number.isFinite(capoRaw) ? capoRaw : 0);
  const tuning = options.tuning || parseTuning(pickHeader(TUNING_KEYS) || '') || [...STANDARD_TUNING];
  const key = pickHeader(KEY_KEYS);
  const strumHeader = pickHeader(STRUM_KEYS);

  if (!options.bpm && !pickHeader(TEMPO_KEYS)) {
    warnings.push(
      makeWarning(
        'warn',
        'ascii-tempo-default',
        '文件里没有 Tempo 信息，已按 90BPM 估算 —— 请在后台改为歌曲真实速度，否则小节时长会整体偏移。',
      ),
    );
  }

  // ── 2. 行扫描聚合为「谱块」 ────────────────
  interface System {
    startLine: number;
    stringLines: Array<{ line: string; label: string | null }>;
    chordLine: string | null;
    section: string | null;
  }

  const systems: System[] = [];
  let pendingChords: { text: string } | null = null;
  let currentSection: string | null = null;
  let buffer: System | null = null;

  const flush = () => {
    if (buffer && buffer.stringLines.length > 0) systems.push(buffer);
    buffer = null;
  };

  for (const line of lines) {
    if (isTabLine(line)) {
      if (!buffer) {
        buffer = {
          startLine: lines.indexOf(line),
          stringLines: [],
          chordLine: pendingChords?.text ?? null,
          section: currentSection,
        };
        pendingChords = null;
      }
      buffer.stringLines.push({ line, label: stringLabelOf(line) });
      continue;
    }

    flush();

    if (!line.trim()) {
      pendingChords = null;
      continue;
    }
    const section = sectionNameOf(line);
    if (section) {
      currentSection = section;
      pendingChords = null;
      continue;
    }
    if (isChordLine(line)) {
      pendingChords = { text: line };
      continue;
    }
    pendingChords = null;
  }
  flush();

  if (systems.length === 0) {
    throw new AsciiTabParseError(
      '没有识别到任何六线谱行。请确认粘贴内容包含形如 `e|---0---|`、`B|---1---|` 的六行谱面（Ultimate Guitar 的 "TAB" 视图原文，而不是和弦图）。',
    );
  }

  // ── 3. 逐谱块解析 ──────────────────────────
  const maxStringCount = tuning.length <= 5 ? tuning.length : 6;
  const measures: TabProjectMeasure[] = [];
  const { beats: tsBeats, beatValue } = parseTimeSignature(timeSignature);
  const beatsInMeasure = tsBeats * (4 / beatValue);
  const secPerBeat = 60 / bpm;

  for (const system of systems) {
    const rows = system.stringLines.slice(0, maxStringCount);
    if (system.stringLines.length !== maxStringCount) {
      warnings.push(
        makeWarning(
          'warn',
          'ascii-string-count',
          `第 ${system.startLine + 1} 行开始的谱块有 ${system.stringLines.length} 行（期望 ${maxStringCount} 行），已按前 ${maxStringCount} 行解析。`,
        ),
      );
    }

    // 弦序：默认自上而下 = 一弦 → 六弦；标签完整且无冲突时以标签为准
    let stringOrder = rows.map((_, idx) => idx + 1);
    const labelMap: Record<string, number> = { e: 1, B: 2, G: 3, D: 4, A: 5, E: 6 };
    const explicit = rows.map((r) =>
      r.label && labelMap[r.label] !== undefined ? labelMap[r.label] : null,
    );
    const resolved = explicit.filter((v): v is number => v !== null);
    if (resolved.length === rows.length && new Set(resolved).size === rows.length) {
      stringOrder = resolved;
    } else if (resolved.length >= 2 && new Set(resolved).size !== resolved.length) {
      warnings.push(
        makeWarning(
          'warn',
          'ascii-string-order',
          `第 ${system.startLine + 1} 行开始的谱块弦名标签有歧义，已按「自上而下一弦→六弦」的通用约定解析。`,
        ),
      );
    }

    const segmentsPerRow: string[][] = rows.map((row) => {
      let content = row.line;
      const pipeIdx = content.indexOf('|');
      if (pipeIdx >= 0) content = content.slice(pipeIdx + 1);
      else content = content.replace(/^\s*[eEbBgGdDaA]\s*[|:]/, '');
      content = content.replace(/\|\s*$/, '');
      return content.split('|').map((s) => s.replace(/[<>*.]/g, ''));
    });

    const barCount = Math.max(...segmentsPerRow.map((s) => s.length), 1);
    if (new Set(segmentsPerRow.map((s) => s.length)).size > 1) {
      warnings.push(
        makeWarning(
          'warn',
          'ascii-unaligned-bars',
          `第 ${system.startLine + 1} 行开始的谱块各弦的小节数不一致（${segmentsPerRow
            .map((s) => s.length)
            .join('/')}），已按最多的 ${barCount} 个小节处理，空位视为无音符。`,
        ),
      );
    }

    // 和弦行：列位置 → 小节/拍
    let chordTokens: ChordToken[] = [];
    let contentStart = 2;
    if (system.chordLine) {
      const firstRow = rows[0]?.line || '';
      contentStart = firstRow.indexOf('|') + 1;
      if (contentStart <= 0) contentStart = 2;
      chordTokens = extractChordTokens(system.chordLine);
    }

    const systemBarChars = Array.from({ length: barCount }, (_, bar) =>
      Math.max(...segmentsPerRow.map((s) => (s[bar] ?? '').length), 8),
    );

    for (let bar = 0; bar < barCount; bar++) {
      const measureIndex = measures.length;
      const segments = segmentsPerRow.map((row) => row[bar] ?? '');
      const gridWidth = Math.max(...segments.map((s) => s.length), 1);
      const sectionLabel = system.section ? `${system.section} ` : '';

      const notes: TabProjectNote[] = [];
      for (let r = 0; r < segments.length; r++) {
        const stringIndex = stringOrder[r] ?? r + 1;
        for (const ev of extractStringEvents(segments[r])) {
          const beat = (ev.column / gridWidth) * beatsInMeasure;
          notes.push(
            makeNote({
              id: `ascii_m${measureIndex}_s${stringIndex}_c${ev.column}`,
              string: stringIndex,
              fret: ev.fret,
              offsetSec: beat * secPerBeat,
              beat,
              durationSec: 0.6 * secPerBeat, // 下面按相邻事件间距修正
              tuning,
              capo,
              technique: ev.technique,
              velocity: ev.accent ? 105 : 90,
              confidence: 1,
              sourceColumn: ev.column,
            }),
          );
        }
      }

      // 时值修正：取到下一个全局事件的间距，上限 2 拍
      const sortedBeats = Array.from(new Set(notes.map((n) => n.beat))).sort((a, b) => a - b);
      for (const n of notes) {
        const nextIdx = sortedBeats.findIndex((b) => b > n.beat + 1e-6);
        const nextBeat = nextIdx === -1 ? beatsInMeasure : sortedBeats[nextIdx];
        const gap = Math.max(0.25, nextBeat - n.beat);
        n.durationSec = Number((Math.min(2, gap) * secPerBeat).toFixed(4));
      }

      // 和弦标记
      const chords: TabProjectChord[] = [];
      if (chordTokens.length > 0) {
        const barChars = systemBarChars[bar] || gridWidth;
        const barStartChar = systemBarChars.slice(0, bar).reduce((a, b) => a + b + 1, 0);
        for (const token of chordTokens) {
          const rel = token.column - contentStart - barStartChar;
          if (rel < 0 || rel > barChars + 8) continue;
          const beat = (Math.max(0, rel) / Math.max(1, barChars)) * beatsInMeasure;
          chords.push(
            makeChord({
              name: token.name,
              offsetSec: beat * secPerBeat,
              beat,
              durationSec: beatsInMeasure * secPerBeat,
              strumPattern: strumHeader,
            }),
          );
          const nearest = notes.reduce<TabProjectNote | null>(
            (best, n) => (!best || Math.abs(n.beat - beat) < Math.abs(best.beat - beat) ? n : best),
            null,
          );
          if (nearest && Math.abs(nearest.beat - beat) <= beatsInMeasure * 0.34) {
            nearest.chordName = token.name;
          }
        }
      }

      measures.push({
        index: measureIndex,
        label: `${sectionLabel}第 ${measureIndex + 1} 小节`.trim(),
        timeSignature,
        bpm,
        startTime: 0,
        endTime: 0,
        beats: beatsInMeasure,
        notes,
        chords: chords.length > 0 ? chords : undefined,
        rawText: rows.map((r) => r.line).join('\n'),
        sourceRef: `行 ${system.startLine + 1} 小节 ${bar + 1}`,
      });
    }
  }

  const emptyMeasures = measures.filter((m) => m.notes.length === 0).length;
  if (emptyMeasures > 0) {
    warnings.push(
      makeWarning('info', 'ascii-empty-measures', `${emptyMeasures} 个小节没有解析到音符（可能是空小节或纯休止）。`),
    );
  }
  if (measures.every((m) => m.notes.length === 0)) {
    throw new AsciiTabParseError(
      '识别到六线谱行，但没有解析出任何品格数字。请确认谱面用的是数字品位（如 `-2-3-`），而不是 `---` 占位或和弦图。',
    );
  }
  warnings.push(
    makeWarning(
      'warn',
      'ascii-rhythm-approximate',
      'ASCII 六线谱没有时值信息，节奏是按列位置线性映射到拍网格得到的**近似值**。' +
        '请在后台上核对齐（或改用 MusicXML / Guitar Pro 源）后再发布到小程序。',
    ),
  );

  const timeline = buildTimeline(measures, bpm, timeSignature);
  const instrument: TabInstrument =
    options.instrument || (maxStringCount <= 5 ? 'bass' : 'guitar_rhythm');
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
      transcriber,
    },
    tuning,
    capo,
    tracks: [
      { id: 'track_1', name: title, instrument, tuning, capo, measures: timeline },
    ],
    source: {
      kind: 'ascii-tab',
      fileName: options.fileName,
      url: options.url,
      site: options.site || 'ASCII tab',
      rights: options.rights || 'unknown',
      rightsNote: options.rightsNote,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...project, stats: computeStats(project) };
}

interface StringEvent {
  column: number;
  fret: number;
  text: string;
  technique: TabProjectNote['technique'];
  accent: boolean;
}

/**
 * 解析单根弦的一小节片段，例如 `--7h9--10-12--x--`
 * - `7h9` → 音符 9（品位 9，技巧 hammer-on）
 * - `12`  → 两位数品位
 * - `x`   → 闷音/打板（fret 0，技巧 dead-note）
 */
export function extractStringEvents(segment: string): StringEvent[] {
  const events: StringEvent[] = [];
  const tokenRe = /(\d{1,2})|([xX])/g;
  let match: RegExpExecArray | null;
  let prevEnd = 0;

  while ((match = tokenRe.exec(segment)) !== null) {
    const between = segment.slice(prevEnd, match.index);
    let technique: TabProjectNote['technique'] = 'normal';
    let accent = false;
    for (const ch of between) if (TECHNIQUE_MAP[ch]) technique = TECHNIQUE_MAP[ch];
    if (between.includes('PM')) technique = 'palm-mute';
    if (between.includes('>')) accent = true;

    const isMute = match[2] !== undefined;
    const text = match[0];
    events.push({
      column: match.index,
      fret: isMute ? 0 : parseInt(text, 10),
      text,
      technique: isMute ? 'dead-note' : technique,
      accent,
    });
    prevEnd = match.index + text.length;
  }

  return events;
}

/** 从 `Bm   F#7     A  E7` 抽出和弦名 + 字符列 */
export function extractChordTokens(line: string): ChordToken[] {
  const out: ChordToken[] = [];
  const re = /([A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-|\d|#|b|\([^)]*\))*(?:\/[A-G][#b]?)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) out.push({ name: m[1], column: m.index });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}
