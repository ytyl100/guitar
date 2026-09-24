/**
 * MusicXML 解析器
 * ================
 *
 * MusicXML 是「有官方授权渠道」的一条关键路径：
 * - MuseScore.com（官方与版权方签约的曲库）→ 导出 MusicXML
 * - OpenScore / 公共领域古典吉他谱（CC0）→ 直接下载 .musicxml
 * - Guitar Pro / TuxGuitar → 导出 MusicXML
 *
 * 因此「Guitar Pro 文件」在工程上最稳的做法不是自己写二进制解析器，而是：
 * `.gp3/.gp4/.gp5` ──MuseScore / TuxGuitar / alphaTab──► `.musicxml` ──本解析器──► TabProject
 *
 * 本实现是**容错型**解析（不依赖第三方 XML 库），覆盖：
 * - `<attributes>`：divisions / time / staff-details（6 线、调弦、capo）
 * - `<note>`：pitch、duration、type、chord、rest、grace、tie、voice
 * - `<technical>`：string / fret / bend / hammer-on / pull-off / slide / harmonic
 * - `<direction><sound tempo>` / `<metronome><per-minute>`：速度
 * - `<harmony><root>`：和弦名（谱面内联和弦标记）
 *
 * 缺失 `<string>/<fret>` 时会自动推断最省力的低把位指法并写入 warning。
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
  beatsPerMeasure,
  buildTimeline,
  computeStats,
  fretToMidi,
  inferStringFret,
  makeChord,
  makeNote,
  makeWarning,
  midiToNoteName,
  noteNameToPitchClass,
} from '../tab-project.utils';

export class MusicXmlParseError extends Error {}

export interface MusicXmlParseOptions {
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
}

const unescapeXml = (raw: string): string =>
  raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();

const firstTag = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? unescapeXml(m[1]) : null;
};

const RHYTHM_BY_TYPE: Record<string, TabProjectNote['rhythm']> = {
  whole: '1/1',
  half: '1/2',
  quarter: '1/4',
  eighth: '1/8',
  '16th': '1/16',
  '32nd': '1/32',
};

interface XmlAttributes {
  divisions: number;
  beats: number;
  beatType: number;
  tuning: number[] | null;
  capo: number | null;
  staffLines: number | null;
}

function parseAttributes(inner: string, previous: XmlAttributes): XmlAttributes {
  const next: XmlAttributes = { ...previous };

  const divisions = firstTag(inner, 'divisions');
  if (divisions) {
    const d = parseFloat(divisions);
    if (Number.isFinite(d) && d > 0) next.divisions = d;
  }

  const timeMatch = inner.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i);
  if (timeMatch) {
    const beats = parseInt(firstTag(timeMatch[1], 'beats') || '', 10);
    const beatType = parseInt(firstTag(timeMatch[1], 'beat-type') || '', 10);
    if (Number.isFinite(beats) && Number.isFinite(beatType) && beats > 0 && beatType > 0) {
      next.beats = beats;
      next.beatType = beatType;
    }
  }

  const staffDetails = inner.match(/<staff-details\b[^>]*>([\s\S]*?)<\/staff-details>/i);
  if (staffDetails) {
    const lines = firstTag(staffDetails[1], 'staff-lines');
    if (lines) next.staffLines = parseInt(lines, 10) || null;

    const capo = firstTag(staffDetails[1], 'capo');
    if (capo) next.capo = parseInt(capo, 10) || 0;

    const tunings: Array<{ line: number; midi: number }> = [];
    const tuningRe = /<staff-tuning\b([^>]*)>([\s\S]*?)<\/staff-tuning>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tuningRe.exec(staffDetails[1])) !== null) {
      const line = parseInt((tm[1].match(/line="(\d+)"/) || [])[1] || '0', 10);
      const step = firstTag(tm[2], 'tuning-step') || '';
      const alterRaw = firstTag(tm[2], 'tuning-alter');
      const octaveRaw = firstTag(tm[2], 'tuning-octave');
      const pc = noteNameToPitchClass(step);
      if (pc === null || !octaveRaw || line < 1) continue;
      const alter = alterRaw ? parseInt(alterRaw, 10) || 0 : 0;
      const octave = parseInt(octaveRaw, 10);
      // MusicXML 的 line 1 = 最高音弦 = 我们的 string 1
      tunings.push({ line, midi: (octave + 1) * 12 + pc + alter });
    }
    if (tunings.length >= 4) {
      tunings.sort((a, b) => a.line - b.line);
      next.tuning = tunings.map((t) => t.midi);
    }
  }

  return next;
}

interface ParsedNote {
  onsetDiv: number;
  durationDiv: number;
  string: number | null;
  fret: number | null;
  midi: number | null;
  /** 源文件里真实的左手指法（<technical><fingering>）：0 = 空弦，1-4 = 食指…小指 */
  finger: number | null;
  rhythm?: TabProjectNote['rhythm'];
  technique: TabProjectNote['technique'];
  velocity: number;
  tieStop: boolean;
  grace: boolean;
}

/** 顺序扫描 `<measure>` 子元素，维护 `<backup>` / `<forward>` 游标 */
function parseMeasure(
  inner: string,
  ctx: XmlAttributes,
): { notes: Array<{ note: ParsedNote; chordGroup: number }>; harmonies: Array<{ name: string; onsetDiv: number }> } {
  const out: Array<{ note: ParsedNote; chordGroup: number }> = [];
  const harmonies: Array<{ name: string; onsetDiv: number }> = [];

  const elementRe = /<(backup|forward|note|harmony)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/gi;
  let cursor = 0;
  let chordGroup = 0;
  let lastNoteWasChord = false;
  let m: RegExpExecArray | null;

  while ((m = elementRe.exec(inner)) !== null) {
    const tag = m[1].toLowerCase();
    const body = m[4] || '';
    const selfClosing = m[3] === '/>';

    if (tag === 'backup' || tag === 'forward') {
      const d = parseFloat(firstTag(body, 'duration') || '0');
      cursor += tag === 'backup' ? -d : d;
      if (cursor < 0) cursor = 0;
      lastNoteWasChord = false;
      continue;
    }

    if (tag === 'harmony') {
      const rootStep = firstTag(body, 'root-step') || '';
      const rootAlter = firstTag(body, 'root-alter');
      const kind = (firstTag(body, 'kind') || '').toLowerCase();
      const bassStep = firstTag(body, 'bass-step');
      const pc = noteNameToPitchClass(rootStep);
      if (pc === null) continue;
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const alter = rootAlter ? parseInt(rootAlter, 10) || 0 : 0;
      const root = names[(((pc + alter) % 12) + 12) % 12];
      const qualityMap: Record<string, string> = {
        major: '',
        minor: 'm',
        dominant: '7',
        'major-seventh': 'maj7',
        'minor-seventh': 'm7',
        diminished: 'dim',
        augmented: 'aug',
        'suspended-fourth': 'sus4',
        'suspended-second': 'sus2',
        'major-sixth': '6',
        'minor-sixth': 'm6',
        'half-diminished': 'm7b5',
        power: '5',
      };
      const suffix = qualityMap[kind] !== undefined ? qualityMap[kind] : '';
      harmonies.push({ name: `${root}${suffix}${bassStep ? `/${bassStep}` : ''}`, onsetDiv: cursor });
      continue;
    }

    // ── note ──
    if (selfClosing) {
      lastNoteWasChord = false;
      continue;
    }
    const isChord = /<chord\b/i.test(body);
    const isRest = /<rest\b/i.test(body);
    const isGrace = /<grace\b/i.test(body);
    const durationDiv = parseFloat(firstTag(body, 'duration') || '0') || 0;

    const onsets = isChord && lastNoteWasChord ? out[out.length - 1]?.note.onsetDiv ?? cursor : cursor;

    const typeRaw = (firstTag(body, 'type') || '').toLowerCase();
    const rhythm = RHYTHM_BY_TYPE[typeRaw];

    const technicalMatch = body.match(/<technical\b[^>]*>([\s\S]*?)<\/technical>/i);
    const technical = technicalMatch ? technicalMatch[1] : '';
    const stringRaw = technical ? firstTag(technical, 'string') : null;
    const fretRaw = technical ? firstTag(technical, 'fret') : null;
    /**
     * `<fingering>` 是 MusicXML 里**真实的左手手指标注**（吉他：1-4 = 食指…小指，0 = 空弦）。
     * 以前这里只读了 string/fret 而把 fingering 丢掉了，导致导入的谱面全都没有指法标注。
     * 非数字写法（T = 拇指，p/i/m/a = 右手拨弦）不映射到左手手指，保持 undefined。
     */
    const fingeringRaw = technical ? firstTag(technical, 'fingering') : null;
    const fingerValue = fingeringRaw !== null ? parseInt(fingeringRaw, 10) : NaN;
    const finger =
      Number.isFinite(fingerValue) && fingerValue >= 0 && fingerValue <= 4 ? fingerValue : null;

    let technique: TabProjectNote['technique'] = 'normal';
    if (/<hammer-on\b/i.test(technical)) technique = 'hammer-on';
    else if (/<pull-off\b/i.test(technical)) technique = 'pull-off';
    else if (/<slide\b/i.test(technical)) technique = 'slide';
    else if (/<bend\b/i.test(technical)) technique = 'bend';
    else if (/<harmonic\b/i.test(technical)) technique = 'harmonic';
    else if (/<vibrato\b/i.test(technical)) technique = 'vibrato';

    let midi: number | null = null;
    const pitchMatch = body.match(/<pitch\b[^>]*>([\s\S]*?)<\/pitch>/i);
    if (pitchMatch) {
      const step = firstTag(pitchMatch[1], 'step') || '';
      const alter = parseInt(firstTag(pitchMatch[1], 'alter') || '0', 10) || 0;
      const octave = parseInt(firstTag(pitchMatch[1], 'octave') || '', 10);
      const pc = noteNameToPitchClass(step);
      if (pc !== null && Number.isFinite(octave)) midi = (octave + 1) * 12 + pc + alter;
    }

    const tieStop = /<tie\b[^>]*type="stop"/i.test(body);
    const velocity = parseFloat(firstTag(body, 'velocity') || '');

    out.push({
      note: {
        onsetDiv: isChord ? onsets : cursor,
        durationDiv,
        string: stringRaw ? parseInt(stringRaw, 10) : null,
        fret: fretRaw !== null ? parseInt(fretRaw, 10) : null,
        midi,
        finger,
        rhythm,
        technique,
        velocity: Number.isFinite(velocity) && velocity > 0 ? Math.min(127, Math.round(velocity)) : 90,
        tieStop,
        grace: isGrace,
      },
      chordGroup: isChord && lastNoteWasChord ? chordGroup : out.length,
    });

    if (!isRest) chordGroup = out[out.length - 1].chordGroup;
    lastNoteWasChord = !isRest;

    // 和弦音不推进游标
    if (!isChord) cursor += durationDiv;
  }

  return { notes: out, harmonies };
}

export function parseMusicXml(xml: string, options: MusicXmlParseOptions = {}): TabProject {
  const warnings: TabProjectWarning[] = [];

  if (/<score-timewise\b/i.test(xml)) {
    throw new MusicXmlParseError(
      '这是 time-wise 版 MusicXML（较少见）。请用 MuseScore / Finale 另存为 part-wise MusicXML 后再导入。',
    );
  }
  if (!/<score-partwise\b/i.test(xml)) {
    throw new MusicXmlParseError(
      '不是有效的 MusicXML（缺少 <score-partwise> 根节点）。若这是 .gp3/.gp4/.gp5 二进制文件，请先用 MuseScore「文件 → 导出 → MusicXML」转换。',
    );
  }

  const workTitle = firstTag(xml, 'work-title');
  const movementTitle = firstTag(xml, 'movement-title');
  const composer = (xml.match(/<creator\b[^>]*type="composer"[^>]*>([\s\S]*?)<\/creator>/i) || [])[1];
  const title =
    options.title ||
    workTitle ||
    movementTitle ||
    options.fileName?.replace(/\.[a-z0-9]+$/i, '') ||
    '未命名曲目';
  const artist = options.artist || (composer ? unescapeXml(composer) : undefined);

  // 全局速度
  let bpm = options.bpm || 0;
  if (!bpm) {
    const soundTempo = xml.match(/<sound\b[^>]*tempo="([\d.]+)"/i);
    const perMinute = firstTag(xml, 'per-minute');
    const candidate = soundTempo ? parseFloat(soundTempo[1]) : perMinute ? parseFloat(perMinute) : NaN;
    bpm = Number.isFinite(candidate) && candidate > 0 ? Math.round(candidate) : 0;
  }
  if (!bpm) {
    bpm = 120; // MusicXML 规范默认 120
    warnings.push(
      makeWarning('info', 'musicxml-tempo-default', '文件内没有速度标记，按 MusicXML 默认 120BPM 处理，请在后台核对。'),
    );
  }

  // 选择声部（优先 6 线吉他声部）
  const partBlocks: Array<{ id: string; name: string; body: string }> = [];
  const partRe = /<part\b([^>]*)>([\s\S]*?)<\/part>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = partRe.exec(xml)) !== null) {
    const id = (pm[1].match(/id="([^"]*)"/) || [])[1] || `P${partBlocks.length + 1}`;
    partBlocks.push({ id, name: '', body: pm[2] });
  }
  const partNames: string[] = [];
  const partListMatch = xml.match(/<part-list\b[^>]*>([\s\S]*?)<\/part-list>/i);
  if (partListMatch) {
    const nameRe = /<part-name\b[^>]*>([\s\S]*?)<\/part-name>/gi;
    let nm: RegExpExecArray | null;
    while ((nm = nameRe.exec(partListMatch[1])) !== null) partNames.push(unescapeXml(nm[1]));
  }
  partBlocks.forEach((p, i) => {
    p.name = partNames[i] || p.id;
  });

  if (partBlocks.length === 0) throw new MusicXmlParseError('MusicXML 里没有找到任何 <part> 声部。');

  const chosen =
    partBlocks.find((p) => /<staff-lines>\s*6\s*<\/staff-lines>/i.test(p.body)) ||
    partBlocks.find((p) => /<technical\b[\s\S]*?<string>/i.test(p.body)) ||
    partBlocks[0];
  if (chosen !== partBlocks[0]) {
    warnings.push(
      makeWarning(
        'info',
        'musicxml-part-selected',
        `文件里有 ${partBlocks.length} 个声部，已选择六线谱声部「${chosen.name}」。`,
      ),
    );
  }

  // 逐小节解析
  let attrs: XmlAttributes = {
    divisions: 1,
    beats: 4,
    beatType: 4,
    tuning: options.tuning || null,
    capo: options.capo ?? null,
    staffLines: null,
  };

  const measures: TabProjectMeasure[] = [];
  const measureRe = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
  let mm: RegExpExecArray | null;
  let inferredPositionCount = 0;

  while ((mm = measureRe.exec(chosen.body)) !== null) {
    const measureInner = mm[2];
    const numberRaw = (mm[1].match(/number="([^"]*)"/) || [])[1];

    const attrMatch = measureInner.match(/<attributes\b[^>]*>([\s\S]*?)<\/attributes>/i);
    if (attrMatch) attrs = parseAttributes(attrMatch[1], attrs);

    const tuning = attrs.tuning || options.tuning || STANDARD_TUNING;
    const capo = attrs.capo ?? options.capo ?? 0;
    const timeSignature = `${attrs.beats}/${attrs.beatType}`;
    const beatsInMeasure = beatsPerMeasure(timeSignature);
    const secPerQuarter = 60 / bpm;

    const { notes: parsed, harmonies } = parseMeasure(measureInner, attrs);

    const notes: TabProjectNote[] = [];
    const seen = new Set<string>();
    const chordNameAt = new Map<number, string>();
    for (const h of harmonies) {
      const beatIdx = Math.round((h.onsetDiv / Math.max(1, attrs.divisions)) * 1000);
      if (!chordNameAt.has(beatIdx)) chordNameAt.set(beatIdx, h.name);
    }

    for (const { note } of parsed) {
      if (note.tieStop) continue; // 延音后半段，避免同一音出现两次

      const beat = note.onsetDiv / Math.max(1, attrs.divisions);
      const offsetSec = beat * secPerQuarter;
      const durationSec = Math.max(
        0.08,
        (note.durationDiv / Math.max(1, attrs.divisions)) * secPerQuarter,
      );

      let string = note.string;
      let fret = note.fret;
      if ((string === null || fret === null) && note.midi !== null) {
        const inferred = inferStringFret(note.midi, tuning, capo);
        string = inferred.string;
        fret = inferred.fret;
        inferredPositionCount++;
      }
      if (string === null || fret === null) continue;

      const key = `${string}_${fret}_${beat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      notes.push(
        makeNote({
          id: `xml_m${measures.length}_${key}`,
          string,
          fret,
          offsetSec,
          beat,
          durationSec,
          tuning,
          capo,
          technique: note.technique,
          velocity: note.velocity,
          confidence: 1,
          chordName: chordNameAt.get(Math.round(beat * 1000)),
          rhythm: note.rhythm,
          /** 源文件里带 <fingering> 的手指标注（0 = 空弦，1-4 = 食指…小指），缺失时留给 fingering.ts 推定 */
          finger: note.finger ?? undefined,
        }),
      );
    }

    notes.sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string);

    const chords: TabProjectChord[] = [];
    for (const [beatIdx, name] of chordNameAt) {
      const beat = beatIdx / 1000;
      chords.push(
        makeChord({
          name,
          offsetSec: beat * secPerQuarter,
          beat,
          durationSec: beatsInMeasure * secPerQuarter,
        }),
      );
    }

    measures.push({
      index: measures.length,
      label: `第 ${numberRaw || measures.length + 1} 小节`,
      timeSignature,
      bpm,
      startTime: 0,
      endTime: 0,
      beats: beatsInMeasure,
      notes,
      chords: chords.length > 0 ? chords : undefined,
      sourceRef: `measure ${numberRaw ?? measures.length + 1}`,
    });
  }

  if (measures.length === 0) throw new MusicXmlParseError('MusicXML 中没有解析到任何小节。');
  if (inferredPositionCount > 0) {
    warnings.push(
      makeWarning(
        'info',
        'musicxml-inferred-fingering',
        `${inferredPositionCount} 个音符没有 <technical><string>/<fret>（指位）信息，已按调弦自动推断最省力的低把位指法，请人工核对。`,
      ),
    );
  }
  if (attrs.staffLines && attrs.staffLines !== 6) {
    warnings.push(
      makeWarning(
        'warn',
        'musicxml-not-tab',
        `该声部是 ${attrs.staffLines} 线谱（不是六线谱），音符的弦/品为自动推断结果。`,
      ),
    );
  }

  const tuning = attrs.tuning || options.tuning || STANDARD_TUNING;
  const capo = attrs.capo ?? options.capo ?? 0;
  const timeline = buildTimeline(measures, bpm, `${attrs.beats}/${attrs.beatType}`);

  // 校验音高与弦/品是否自洽（人工制谱常见错误），以弦/品为准
  const mismatches = timeline
    .flatMap((m) => m.notes)
    .filter((n) => fretToMidi(n.string, n.fret, tuning, capo) !== n.midi);
  if (mismatches.length > 0) {
    for (const m of timeline) {
      for (const n of m.notes) n.midi = fretToMidi(n.string, n.fret, tuning, capo);
    }
    warnings.push(
      makeWarning(
        'info',
        'musicxml-pitch-reconciled',
        `${mismatches.length} 个音符的 <pitch> 与 <string>/<fret> 不一致，已以弦/品为准重算音高（例：${midiToNoteName(
          mismatches[0].midi,
        )} → ${midiToNoteName(fretToMidi(mismatches[0].string, mismatches[0].fret, tuning, capo))}）。`,
      ),
    );
  }

  const instrument: TabInstrument = options.instrument || 'guitar';
  const project: Omit<TabProject, 'stats'> = {
    format: 'guitarmate-tab-project',
    version: '1.0',
    meta: {
      title,
      artist,
      bpm,
      timeSignature: `${attrs.beats}/${attrs.beatType}`,
      instrument,
      capo,
    },
    tuning,
    capo,
    tracks: [
      {
        id: chosen.id || 'track_1',
        name: chosen.name || title,
        instrument,
        tuning,
        capo,
        measures: timeline,
      },
    ],
    source: {
      kind: 'musicxml',
      fileName: options.fileName,
      url: options.url,
      site: options.site || 'MusicXML',
      rights: options.rights || 'unknown',
      rightsNote: options.rightsNote,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...project, stats: computeStats(project) };
}
