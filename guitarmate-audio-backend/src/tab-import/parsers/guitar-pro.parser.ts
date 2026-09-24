/**
 * Guitar Pro 解析器
 * ==================
 *
 * 现实结论先说清楚：
 *
 * | 扩展名            | 内部格式                | 本解析器 |
 * |-------------------|-------------------------|----------|
 * | `.gpx`            | ZIP + `Content/score.gpif`（XML） | ✅ 直接解析（调弦 / 变调夹 / 时值 / 技巧） |
 * | `.gp3/.gp4/.gp5`  | 私有二进制               | ❌ 不做逆向；给出转换指令 |
 *
 * 二进制格式**不建议**自己写解析器（字段多、版本差异大、极易静默出错），
 * 工程上最稳的是先转成中间格式：
 *
 * ```bash
 * # 方案 A：MuseScore 打开 → 文件 → 导出 → MusicXML
 * # 方案 B：TuxGuitar 文件 → 导出 → MusicXML
 * # 方案 C：alphaTab（Node）ScoreLoader → 导出 MusicXML
 * ```
 *
 * 然后走 `POST /api/tab-import/parse`（format=musicxml）。
 */

import { inflateRawSync } from 'zlib';
import type {
  RightsStatus,
  TabInstrument,
  TabProject,
  TabProjectMeasure,
  TabProjectNote,
  TabProjectWarning,
} from '../tab-project.types';
import {
  PARSER_VERSION,
  STANDARD_TUNING,
  beatsPerMeasure,
  computeStats,
  fretToMidi,
  makeNote,
  makeWarning,
  parseTimeSignature,
} from '../tab-project.utils';

export class GuitarProParseError extends Error {}

export interface GuitarProParseOptions {
  fileName?: string;
  url?: string;
  site?: string;
  rights?: RightsStatus;
  rightsNote?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  instrument?: TabInstrument;
  /** 选择第几个「可弹奏声部」（0 起，默认自动挑第一把吉他） */
  trackIndex?: number;
}

// ─────────────────────────────────────────────
// 最小 ZIP 读取（.gpx 就是 ZIP，内含 Content/score.gpif）
// ─────────────────────────────────────────────

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();

  let eocd = -1;
  const minEocd = 22;
  const maxScan = Math.min(buffer.length, 22 + 65535 + 20);
  for (let i = buffer.length - minEocd; i >= buffer.length - maxScan && i >= 0; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new GuitarProParseError(
      '文件不是有效的 ZIP（找不到 EOCD 记录）。.gpx 本身就是一个 ZIP 包；若你上传的是 .gp3/.gp4/.gp5，请先转成 MusicXML。',
    );
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length) break;
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);

    if (localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === ZIP_LOCAL_HEADER) {
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const raw = buffer.subarray(dataStart, Math.min(buffer.length, dataStart + compressedSize));
      try {
        if (method === 8) out.set(name, inflateRawSync(raw));
        else if (method === 0) out.set(name, Buffer.from(raw));
        else if (uncompressedSize === 0) out.set(name, Buffer.alloc(0));
      } catch {
        /* 单个条目解压失败不影响整体 */
      }
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

/** 判定二进制 Guitar Pro 版本 */
export function detectGuitarProBinaryKind(buffer: Buffer): 'gp3' | 'gp4' | 'gp5' | null {
  const head = buffer.subarray(0, 32).toString('latin1');
  if (/^FICHIER GUITAR PRO v3/i.test(head)) return 'gp3';
  if (/^FICHIER GUITAR PRO v4/i.test(head)) return 'gp4';
  if (/^FICHIER GUITAR PRO/i.test(head)) return 'gp5';
  return null;
}

// ─────────────────────────────────────────────
// GPIF (XML) 解析
// ─────────────────────────────────────────────

/** GPIF `<NoteValue>` → 四分音符当量 */
const NOTE_VALUE_QUARTERS: Record<string, number> = {
  Long: 16,
  Breve: 8,
  Whole: 4,
  Half: 2,
  Quarter: 1,
  Eighth: 0.5,
  Sixteenth: 0.25,
  ThirtySecond: 0.125,
  SixtyFourth: 0.0625,
  OneHundredTwentyEighth: 0.03125,
};

const text = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
};

const blocks = (xml: string, tag: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
};

/** 取出 `<Property name="X">` 的 `<Number>` / `<Boolean>` / 文本值 */
function propertyValue(xml: string, name: string): string | null {
  const re = new RegExp(`<Property name="${name}"[^>]*>([\\s\\S]*?)</Property>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  if (new RegExp(`<Property name="${name}"[^>]*/>`, 'i').test(xml)) return 'true';
  const number = text(m[1], 'Number');
  if (number !== null) return number;
  const bool = text(m[1], 'Boolean');
  if (bool !== null) return bool;
  const value = text(m[1], 'Value');
  return value !== null ? value : m[1].replace(/<[^>]+>/g, '').trim() || 'true';
}

const firstNumberIn = (value: string | null): number | null => {
  if (!value) return null;
  const m = value.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

export function parseGpxXml(gpifXml: string, options: GuitarProParseOptions = {}): TabProject {
  const warnings: TabProjectWarning[] = [];

  const scoreMatch = gpifXml.match(/<Score\b[^>]*>([\s\S]*)<\/Score>/i);
  const score = scoreMatch ? scoreMatch[1] : gpifXml;

  const title =
    options.title ||
    text(score, 'Title') ||
    options.fileName?.replace(/\.[a-z0-9]+$/i, '') ||
    '未命名曲目';
  const artist = options.artist || text(score, 'Artist') || text(score, 'Words') || undefined;
  const transcriber = text(score, 'Tab') || text(score, 'Transcriber') || undefined;
  const album = text(score, 'Album') || undefined;

  // 速度
  let bpm = options.bpm || 0;
  const masterTrack = score.match(/<MasterTrack\b[^>]*>([\s\S]*?)<\/MasterTrack>/i);
  const automationSource = (masterTrack ? masterTrack[1] : score).match(
    /<Automations\b[^>]*>([\s\S]*?)<\/Automations>/i,
  );
  if (!bpm && automationSource) {
    for (const automation of blocks(automationSource[1], 'Automation')) {
      if (/<Type>\s*Tempo\s*<\/Type>/i.test(automation)) {
        const value = firstNumberIn(text(automation, 'Value'));
        if (value && value > 0) {
          bpm = Math.round(value);
          break;
        }
      }
    }
  }
  if (!bpm) {
    const mbTempo = score.match(/<Tempo>([\d.]+)<\/Tempo>/i);
    if (mbTempo) bpm = Math.round(parseFloat(mbTempo[1]));
  }
  if (!bpm) {
    bpm = 120;
    warnings.push(
      makeWarning('info', 'gpx-tempo-default', 'GPIF 里没有 Tempo 自动化，已按 120BPM 处理，请在后台核对。'),
    );
  }

  // MasterBars（段落 / 拍号）
  const masterBarsBlock = score.match(/<MasterBars\b[^>]*>([\s\S]*?)<\/MasterBars>/i);
  const masterBars = masterBarsBlock ? blocks(masterBarsBlock[1], 'MasterBar') : [];
  const masterInfo = masterBars.map((mb) => ({
    timeSignature: text(mb, 'Time') || '4/4',
    section:
      text(mb.match(/<Section\b[^>]*>([\s\S]*?)<\/Section>/i)?.[1] || '', 'Text') || null,
  }));

  // 节奏表：必须连同标签属性一起捕获（id 在属性里），且限定在 <Rhythms> 段内，
  // 避免误吞自闭合的 `<Rhythm ref=".."/>`
  const rhythmQuarters = new Map<string, number>();
  const rhythmsBlock = score.match(/<Rhythms\b[^>]*>([\s\S]*?)<\/Rhythms>/i);
  if (rhythmsBlock) {
    const rhythmRe = /<Rhythm\b([^>]*)>([\s\S]*?)<\/Rhythm>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rhythmRe.exec(rhythmsBlock[1])) !== null) {
      const id = (rm[1].match(/id="([^"]*)"/i) || [])[1];
      if (!id) continue;
      const body = rm[2];
      const base = NOTE_VALUE_QUARTERS[text(body, 'NoteValue') || ''] ?? 1;
      const dotsRaw = text(body, 'Dots');
      const dots = dotsRaw ? parseInt(dotsRaw, 10) || 0 : /<Dots\b[^>]*\/>/.test(body) ? 1 : 0;
      const dotted = dots > 0 ? 1.5 : 1;
      const tupletMatch = body.match(/<PrimaryTuplet\b[^>]*num="(\d+)"[^>]*den="(\d+)"/i);
      const tuplet = tupletMatch ? parseInt(tupletMatch[2], 10) / parseInt(tupletMatch[1], 10) : 1;
      rhythmQuarters.set(id, base * dotted * tuplet);
    }
  }

  // 选择声部
  interface TrackInfo {
    index: number;
    id: string;
    name: string;
    tuning: number[];
    capo: number;
    staffBars: string[];
  }

  const trackInfos: TrackInfo[] = [];
  const tracksBlock = score.match(/<Tracks\b[^>]*>([\s\S]*?)<\/Tracks>/i);
  const trackBlocks = tracksBlock ? blocks(tracksBlock[1], 'Track') : [];

  trackBlocks.forEach((trackXml, index) => {
    const id = (trackXml.match(/<Track\b[^>]*id="([^"]*)"/i) || [])[1] || `track_${index}`;
    const name = text(trackXml, 'Name') || `声部 ${index + 1}`;
    const staffBlock = trackXml.match(/<Staff\b[^>]*>([\s\S]*?)<\/Staff>/i);
    const staffXml = staffBlock ? staffBlock[1] : trackXml;

    const pitchList =
      (propertyValue(staffXml, 'Tuning') || '').match(/-?\d+/g)?.map((v) => parseInt(v, 10)) || [];
    const capo = firstNumberIn(propertyValue(staffXml, 'Capo')) ?? 0;

    const barsBlock = staffXml.match(/<Bars\b[^>]*>([\s\S]*?)<\/Bars>/i);
    const barXmls = barsBlock ? blocks(barsBlock[1], 'Bar') : [];

    trackInfos.push({
      index,
      id,
      name,
      tuning: pitchList.length >= 4 ? pitchList : STANDARD_TUNING,
      capo,
      staffBars: barXmls,
    });
  });

  if (trackInfos.length === 0) throw new GuitarProParseError('GPIF 里没有找到 <Tracks> 声部信息。');

  const playable = trackInfos.filter((t) => t.staffBars.some((b) => /<Voices\b/i.test(b)));
  const track =
    playable[options.trackIndex ?? 0] ||
    playable.find((t) => !/bass|drum|percussion|鼓|贝斯/i.test(t.name)) ||
    trackInfos[0];

  if (trackInfos.length > 1) {
    warnings.push(
      makeWarning(
        'info',
        'gpx-track-selected',
        `文件里有 ${trackInfos.length} 个声部，已选择「${track.name}」。如需其它声部，请传 trackIndex 指定。`,
      ),
    );
  }

  // 逐小节解析
  const measures: TabProjectMeasure[] = [];
  let cursorSec = 0;
  let currentSection: string | null = null;

  for (let barIdx = 0; barIdx < track.staffBars.length; barIdx++) {
    const barXml = track.staffBars[barIdx];
    const master = masterInfo[barIdx] ||
      masterInfo[masterInfo.length - 1] || { timeSignature: '4/4', section: null };
    if (master.section) currentSection = master.section;

    const { beats: tsBeats, beatValue } = parseTimeSignature(master.timeSignature);
    const beatsInMeasure = tsBeats * (4 / beatValue);
    const secPerQuarter = 60 / bpm;
    const measureSec = beatsInMeasure * secPerQuarter;

    const notes: TabProjectNote[] = [];
    const voices = blocks(barXml, 'Voice');
    const voiceXml = voices.length > 0 ? voices[0] : '';
    const beatsXml = voiceXml ? blocks(voiceXml, 'Beat') : [];

    let beatCursor = 0;
    let previousOnset = 0;

    for (const beatXml of beatsXml) {
      const rhythmRef = (beatXml.match(/<Rhythm\b[^>]*ref="([^"]*)"/i) || [])[1];
      const quarters = rhythmRef ? rhythmQuarters.get(rhythmRef) ?? 1 : 1;
      const isChord = /<Chord\s*\/>|<Chord\b[^>]*\/>/i.test(beatXml);
      const isGrace = /<GraceNotes\b/i.test(beatXml);

      const onset = isChord ? previousOnset : beatCursor;
      if (!isChord && !isGrace) {
        previousOnset = onset;
        beatCursor += quarters;
      }

      const offsetSec = onset * secPerQuarter;
      const durationSec = Math.max(0.05, quarters * secPerQuarter);

      for (const noteXml of blocks(beatXml, 'Note')) {
        const string = firstNumberIn(propertyValue(noteXml, 'String'));
        const fret = firstNumberIn(propertyValue(noteXml, 'Fret'));
        if (string === null || fret === null) continue;
        if (string < 1 || string > track.tuning.length) continue;

        let technique: TabProjectNote['technique'] = 'normal';
        if (/true/i.test(propertyValue(noteXml, 'Vibrato') || '')) technique = 'vibrato';
        const slide = propertyValue(noteXml, 'Slide');
        if (slide && !/none/i.test(slide)) technique = 'slide';
        if (propertyValue(noteXml, 'Bend')) technique = 'bend';
        if (/true/i.test(propertyValue(noteXml, 'Harmonic') || '')) technique = 'harmonic';
        if (/true/i.test(propertyValue(noteXml, 'PalmMuted') || '')) technique = 'palm-mute';
        const hammer = propertyValue(noteXml, 'HammerOn');
        const pull = propertyValue(noteXml, 'PullOff');
        if (hammer && /true/i.test(hammer)) technique = 'hammer-on';
        if (pull && /true/i.test(pull)) technique = 'pull-off';
        if (/true/i.test(propertyValue(noteXml, 'Muted') || '')) technique = 'dead-note';

        notes.push(
          makeNote({
            id: `gpx_m${barIdx}_b${beatsXml.indexOf(beatXml)}_s${string}`,
            string,
            fret,
            offsetSec,
            beat: onset,
            durationSec,
            tuning: track.tuning,
            capo: track.capo,
            technique,
            velocity: /true/i.test(propertyValue(beatXml, 'Brush') || '') ? 88 : 96,
            confidence: 1,
          }),
        );
      }
    }

    notes.sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string);

    measures.push({
      index: barIdx,
      label: `${currentSection ? currentSection + ' ' : ''}第 ${barIdx + 1} 小节`.trim(),
      timeSignature: master.timeSignature,
      bpm,
      startTime: Number(cursorSec.toFixed(4)),
      endTime: Number((cursorSec + measureSec).toFixed(4)),
      beats: beatsInMeasure,
      notes,
      sourceRef: `masterBar ${barIdx}`,
    });
    cursorSec += measureSec;
  }

  const emptyMeasures = measures.filter((m) => m.notes.length === 0).length;
  if (measures.length > 0 && emptyMeasures === measures.length) {
    throw new GuitarProParseError(
      `声部「${track.name}」里没有解析到音符（可能是鼓轨或空轨）。可用 trackIndex 指定其它声部。`,
    );
  }
  if (emptyMeasures > 0) {
    warnings.push(
      makeWarning(
        'info',
        'gpx-empty-measures',
        `${emptyMeasures} 个小节在当前声部没有音符（可能是休止或其它声部演奏）。`,
      ),
    );
  }
  warnings.push(
    makeWarning(
      'info',
      'gpx-best-effort',
      'GPX 解析为「尽力而为」实现（已覆盖调弦 / 变调夹 / 时值 / 常见技巧）。发布前请在 CMS 中与小节音频对齐复核。',
    ),
  );

  const instrument: TabInstrument =
    options.instrument || (/bass|贝斯/i.test(track.name) ? 'bass' : 'guitar');
  const project: Omit<TabProject, 'stats'> = {
    format: 'guitarmate-tab-project',
    version: '1.0',
    meta: {
      title,
      artist,
      album,
      bpm,
      timeSignature: masterInfo[0]?.timeSignature || '4/4',
      instrument,
      capo: track.capo,
      transcriber,
    },
    tuning: track.tuning,
    capo: track.capo,
    tracks: [
      {
        id: track.id,
        name: track.name,
        instrument,
        tuning: track.tuning,
        capo: track.capo,
        measures,
      },
    ],
    source: {
      kind: 'gpx',
      fileName: options.fileName,
      url: options.url,
      site: options.site || 'Guitar Pro (.gpx)',
      rights: options.rights || 'unknown',
      rightsNote: options.rightsNote,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...project, stats: computeStats(project) };
}

/** 从 .gpx 二进制（ZIP）解析 */
export function parseGpx(buffer: Buffer, options: GuitarProParseOptions = {}): TabProject {
  const binaryKind = detectGuitarProBinaryKind(buffer);
  if (binaryKind) {
    throw new GuitarProParseError(
      `这是 Guitar Pro 的**二进制**格式（${binaryKind}）。本项目不解析私有二进制谱面，请先转换：\n` +
        '  · MuseScore：打开文件 → 文件 → 导出 → MusicXML（.musicxml）\n' +
        '  · TuxGuitar：文件 → 导出 → MusicXML\n' +
        '  · alphaTab（Node）：`npm i @coderline/alphatab` 后用 ScoreLoader 导出 MusicXML\n' +
        '然后把导出的 .musicxml 用 format=musicxml 重新导入。',
    );
  }

  const entries = readZipEntries(buffer);
  const gpifEntry =
    entries.get('Content/score.gpif') ||
    Array.from(entries.entries()).find(([name]) => /score\.gpif$/i.test(name))?.[1];
  const xmlEntry =
    gpifEntry ||
    Array.from(entries.values()).find((buf) => {
      const head = buf.subarray(0, 200).toString('utf8');
      return /<\?xml|GPIF/i.test(head);
    });

  if (!xmlEntry) {
    throw new GuitarProParseError(
      `GPX 包里没有找到 Content/score.gpif（包含 ${entries.size} 个条目：${Array.from(entries.keys())
        .slice(0, 8)
        .join(', ')}）。请确认文件未损坏。`,
    );
  }

  return parseGpxXml(xmlEntry.toString('utf8'), options);
}
