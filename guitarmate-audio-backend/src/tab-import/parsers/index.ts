/**
 * 格式自动识别 + 统一入口
 * =========================
 *
 * 前端 / CMS 只需要把「文本 / 二进制 / JSON」丢进来，不用自己判断格式：
 * 这是 ASCII tab？MusicXML？GPX？还是已经转好的 TabProject？
 */

import type { TabProject, TabSourceFormat } from '../tab-project.types';
import { AsciiTabParseError, parseAsciiTab, type AsciiTabParseOptions } from './ascii-tab.parser';
import { ChordSheetParseError, parseChordSheet, type ChordSheetParseOptions } from './chord-sheet.parser';
import { MusicXmlParseError, parseMusicXml, type MusicXmlParseOptions } from './musicxml.parser';
import {
  GuitarProParseError,
  detectGuitarProBinaryKind,
  parseGpx,
  parseGpxXml,
  type GuitarProParseOptions,
} from './guitar-pro.parser';
import {
  TranscriptionParseError,
  parseTranscriptionJson,
  validateTabProject,
} from './transcription.parser';

export * from './ascii-tab.parser';
export * from './chord-sheet.parser';
export * from './musicxml.parser';
export * from './guitar-pro.parser';
export * from './transcription.parser';

export interface ParseTabInput {
  /** 文本内容（ASCII tab / 和弦表 / MusicXML / JSON 字符串） */
  content?: string;
  /** 已解析的 JSON 对象（SoloTrace / TabProject） */
  data?: unknown;
  /** 二进制内容（.gpx / .gp5） */
  buffer?: Buffer;
  /** 指定格式；省略时自动识别 */
  format?: TabSourceFormat;
  fileName?: string;
  url?: string;
  site?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  timeSignature?: string;
  capo?: number;
  instrument?: AsciiTabParseOptions['instrument'];
  tuning?: number[];
  rights?: AsciiTabParseOptions['rights'];
  rightsNote?: string;
  /** 和弦表：每小节和弦数 */
  chordsPerBar?: number;
  /** 和弦表：扫弦模式覆盖 */
  strumPattern?: string;
  /** GPX：选择第几个声部 */
  trackIndex?: number;
}

export class TabParseError extends Error {}

/** 自动识别文本格式 */
export function detectTextFormat(content: string): TabSourceFormat {
  const head = content.slice(0, 4000);

  if (/"format"\s*:\s*"guitarmate-tab-project"/.test(head)) return 'tab-project';

  if (/<score-partwise\b/i.test(head) || /<score-timewise\b/i.test(head)) return 'musicxml';
  if (/<\?xml\b/i.test(head) && /<score-|<part-list\b/i.test(head)) return 'musicxml';
  if (/<GPIF\b/i.test(head)) return 'gpx';

  const lines = head.split('\n').slice(0, 200);
  const tabLike = lines.filter(
    (l) => /^\s*[eEbBgGdDaA]?\s*[|:][\s\-0-9hpbrsxX/\\~|<>*.]*$/.test(l) && /[-0-9]/.test(l),
  );
  if (tabLike.length >= 3) return 'ascii-tab';

  const trimmed = head.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(content);
      return 'solo-trace';
    } catch {
      /* 落到和弦表处理 */
    }
  }

  return 'chord-sheet';
}

/** 自动识别二进制格式 */
export function detectBufferFormat(buffer: Buffer): TabSourceFormat {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return 'gpx'; // 'PK'
  const kind = detectGuitarProBinaryKind(buffer);
  if (kind) return kind;
  return 'gpx';
}

/** 统一解析入口 —— 任何格式进，TabProject 出 */
export function parseTabInput(input: ParseTabInput): TabProject {
  const format =
    input.format ||
    (input.buffer
      ? detectBufferFormat(input.buffer)
      : input.content
        ? detectTextFormat(input.content)
        : undefined);

  if (!format) {
    throw new TabParseError('无法判断格式：请提供 content（文本）、data（JSON 对象）或 buffer（二进制）。');
  }

  const common = {
    fileName: input.fileName,
    url: input.url,
    site: input.site,
    title: input.title,
    artist: input.artist,
    bpm: input.bpm,
    timeSignature: input.timeSignature,
    capo: input.capo,
    tuning: input.tuning,
    rights: input.rights,
    rightsNote: input.rightsNote,
    instrument: input.instrument,
  };

  try {
    switch (format) {
      case 'tab-project':
        return validateTabProject(input.data ?? safeJsonParse(input.content), common);

      case 'solo-trace':
        return parseTranscriptionJson(input.data ?? safeJsonParse(input.content), common);

      case 'musicxml':
        return parseMusicXml(
          input.content || input.buffer?.toString('utf8') || '',
          common as MusicXmlParseOptions,
        );

      case 'gpx': {
        if (input.buffer) return parseGpx(input.buffer, { ...common, trackIndex: input.trackIndex });
        if (/<GPIF\b/i.test(input.content || '')) {
          return parseGpxXml(input.content as string, { ...common, trackIndex: input.trackIndex });
        }
        throw new TabParseError(
          '.gpx 是二进制（ZIP）文件，请以 base64 上传二进制内容（本接口也支持直接传已解压的 score.gpif 文本）。',
        );
      }

      case 'gp3':
      case 'gp4':
      case 'gp5': {
        if (input.buffer) return parseGpx(input.buffer, common as GuitarProParseOptions);
        throw new TabParseError(
          `${format.toUpperCase()} 是私有二进制格式，本项目不做逆向解析。请先用 MuseScore / TuxGuitar / alphaTab 导出 MusicXML，再用 format=musicxml 导入。`,
        );
      }

      case 'ascii-tab':
        return parseAsciiTab(input.content || '', common as AsciiTabParseOptions);

      case 'chord-sheet':
        return parseChordSheet(input.content || '', {
          ...common,
          chordsPerBar: input.chordsPerBar,
          strumPattern: input.strumPattern,
        } as ChordSheetParseOptions);

      default:
        throw new TabParseError(`不支持的格式：${format}`);
    }
  } catch (err: any) {
    if (
      err instanceof TabParseError ||
      err instanceof AsciiTabParseError ||
      err instanceof ChordSheetParseError ||
      err instanceof MusicXmlParseError ||
      err instanceof GuitarProParseError ||
      err instanceof TranscriptionParseError
    ) {
      throw err;
    }
    throw new TabParseError(`解析失败（format=${format}）：${err?.message || err}`);
  }
}

function safeJsonParse(content?: string): unknown {
  if (!content) throw new TabParseError('缺少 JSON 内容。');
  try {
    return JSON.parse(content);
  } catch (err: any) {
    throw new TabParseError(`JSON 解析失败：${err?.message || err}`);
  }
}

/** 解析器能力清单（供 CMS 展示「支持哪些格式」） */
export const SUPPORTED_FORMATS: Array<{
  format: TabSourceFormat;
  label: string;
  extensions: string[];
  rhythmAccuracy: 'exact' | 'approximate' | 'synthetic';
  note: string;
}> = [
  {
    format: 'gpx',
    label: 'Guitar Pro (.gpx)',
    extensions: ['.gpx'],
    rhythmAccuracy: 'exact',
    note: '含调弦 / 变调夹 / 时值 / 技巧。人工精修谱，质量最高。',
  },
  {
    format: 'musicxml',
    label: 'MusicXML',
    extensions: ['.musicxml', '.xml', '.mxl'],
    rhythmAccuracy: 'exact',
    note: 'MuseScore / OpenScore / 版权方官方导出，时值精确。',
  },
  {
    format: 'tab-project',
    label: 'GuitarMate TabProject',
    extensions: ['.json'],
    rhythmAccuracy: 'exact',
    note: '本项目的统一中间格式，可反复编辑与回灌。',
  },
  {
    format: 'solo-trace',
    label: '转录 JSON (SoloTrace / Basic Pitch)',
    extensions: ['.json'],
    rhythmAccuracy: 'exact',
    note: '与真实音频时间轴对齐，但指法/技巧需人工复核（看 confidence）。',
  },
  {
    format: 'ascii-tab',
    label: 'ASCII 六线谱',
    extensions: ['.txt', '.tab', '.ascii'],
    rhythmAccuracy: 'approximate',
    note: 'Ultimate Guitar / GuitarTabs 的文字谱。**没有时值**，节奏按列位置近似映射。',
  },
  {
    format: 'chord-sheet',
    label: '和弦表 + 扫弦模式',
    extensions: ['.txt', '.chords'],
    rhythmAccuracy: 'synthetic',
    note: '和弦名 + 把位 + 扫弦模式自动展开成六线谱音符，适合节奏吉他种子数据。',
  },
  {
    format: 'gp5',
    label: 'Guitar Pro (.gp3/.gp4/.gp5)',
    extensions: ['.gp3', '.gp4', '.gp5'],
    rhythmAccuracy: 'exact',
    note: '私有二进制格式 —— 请先转成 MusicXML 再导入（接口会给出转换指令）。',
  },
];
