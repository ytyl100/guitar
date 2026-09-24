/**
 * 转录 JSON 适配器（SoloTrace / Basic Pitch / 通用 {time, pitch} 列表）
 * =====================================================================
 *
 * 这是「AI 自动草稿」这条路：Demucs 分轨 → Basic Pitch / SoloTrace 转录 →
 * 带 `audioTime` 的音符列表。它天然与真实音频时间轴对齐（最大优势），
 * 但缺少人类制谱的节奏/技巧信息。
 *
 * 推荐流程：人工 tab 做 **ground truth**，AI 转录做 **草稿**，
 * 两者都在 TabProject 里统一，再由教研老师复核带 `confidence` 的弱拍音符。
 *
 * 三种输入都会被自动识别：
 * 1. SoloTrace：`{ bpm, timeSignature, notes: [{ string, fret, pitch, audioTime, duration, confidence }], beatMap }`
 * 2. Basic Pitch：`{ bpm, notes: [{ startTime, pitch, duration, confidence }] }`（无弦/品 → 自动推断）
 * 3. 通用：`{ notes: [{ time|audioTime|start, string?, fret?, midi|pitch }] }`
 * 4. 已是 TabProject：直接结构校验后返回
 */

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
  inferStringFret,
  makeNote,
  makeWarning,
  measureDurationSec,
  midiToNoteName,
} from '../tab-project.utils';

export class TranscriptionParseError extends Error {}

export interface TranscriptionParseOptions {
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

interface RawNote {
  string?: number;
  fret?: number;
  pitch?: number;
  midi?: number;
  audioTime?: number;
  scoreTime?: number;
  startTime?: number;
  start?: number;
  time?: number;
  duration?: number;
  confidence?: number;
  velocity?: number;
}

export function parseTranscriptionJson(
  data: any,
  options: TranscriptionParseOptions = {},
): TabProject {
  if (!data || typeof data !== 'object') {
    throw new TranscriptionParseError('转录 JSON 必须是对象。');
  }
  if (data.format === 'guitarmate-tab-project') {
    return validateTabProject(data, options);
  }

  const rawNotes: RawNote[] = Array.isArray(data.notes)
    ? data.notes
    : Array.isArray(data.events)
      ? data.events
      : [];
  if (rawNotes.length === 0) {
    throw new TranscriptionParseError(
      '转录 JSON 里没有 notes 数组。SoloTrace 导出应为 { bpm, timeSignature, notes: [{ string, fret, pitch, audioTime, duration }] }。',
    );
  }

  const warnings: TabProjectWarning[] = [];
  const tuning = options.tuning || data.tuning || STANDARD_TUNING;
  const capo = options.capo ?? data.capo ?? 0;
  const bpm = options.bpm || Number(data.bpm) || Number(data.beatMap?.bpm) || 90;
  const timeSignature = options.timeSignature || data.timeSignature || '4/4';

  if (!data.bpm && !data.beatMap?.bpm && !options.bpm) {
    warnings.push(
      makeWarning(
        'warn',
        'transcription-tempo-missing',
        '转录 JSON 里没有 BPM，已按 90BPM 估算；小节切分与 `#t=` 音频片段都会因此偏移，请务必核对。',
      ),
    );
  }

  // 1. 归一化音符
  const cleanNotes: Array<{
    audioTime: number;
    duration: number;
    string: number;
    fret: number;
    midi: number;
    confidence: number;
    velocity: number;
  }> = [];
  let inferredCount = 0;
  let outOfRangeCount = 0;

  for (const n of rawNotes) {
    const midi = Number(n.midi ?? n.pitch);
    if (!Number.isFinite(midi)) continue;

    let string = Number.isFinite(n.string as number) ? (n.string as number) : null;
    let fret = Number.isFinite(n.fret as number) ? (n.fret as number) : null;

    if (string === null || fret === null) {
      const inferred = inferStringFret(midi, tuning, capo);
      const playable = midi - tuning[inferred.string - 1] - capo;
      if (playable < 0 || playable > 24) outOfRangeCount++;
      string = inferred.string;
      fret = inferred.fret;
      inferredCount++;
    } else if (fretToMidi(string, fret, tuning, capo) !== midi) {
      outOfRangeCount++;
    }

    const audioTime = Number(n.audioTime ?? n.scoreTime ?? n.startTime ?? n.start ?? n.time ?? 0);
    if (!Number.isFinite(audioTime) || audioTime < 0) continue;

    cleanNotes.push({
      audioTime,
      duration: Number.isFinite(n.duration as number) ? Math.max(0.05, n.duration as number) : 0.5,
      string,
      fret,
      midi,
      confidence: Number.isFinite(n.confidence as number) ? (n.confidence as number) : 0.9,
      velocity: Number.isFinite(n.velocity as number) ? (n.velocity as number) : 90,
    });
  }

  if (cleanNotes.length === 0) {
    throw new TranscriptionParseError('转录 JSON 里没有有效的音符（需要 pitch/midi 与时间字段）。');
  }
  cleanNotes.sort((a, b) => a.audioTime - b.audioTime);

  if (inferredCount > 0) {
    warnings.push(
      makeWarning(
        'warn',
        'transcription-inferred-fingering',
        `${inferredCount}/${cleanNotes.length} 个音符没有弦/品信息，已按音高推断最低把位。转录结果建议先在 CMS 里核对指法再发布。`,
      ),
    );
  }
  if (outOfRangeCount > 0) {
    warnings.push(
      makeWarning(
        'warn',
        'transcription-out-of-range',
        `${outOfRangeCount} 个音符超出当前调弦的可弹音域（或弦/品与音高不一致），已被夹到最接近的位置。` +
          '若原曲使用特殊调弦（Drop D / DADGAD / 降半音），请在字段里指定 tuning。',
      ),
    );
  }

  // 2. 小节边界：优先 beatMap 强拍，其次按 BPM 网格
  const lastEnd = Math.max(...cleanNotes.map((n) => n.audioTime + n.duration), 0);
  const measureSec = measureDurationSec(bpm, timeSignature);
  const beatsInMeasure = beatsPerMeasure(timeSignature);

  let boundaries: number[] = [];
  const beats = data.beatMap?.beats;
  if (Array.isArray(beats) && beats.length > 0) {
    boundaries = Array.from(
      new Set(
        beats
          .filter((b: any) => Number(b?.beatInMeasure) === 1)
          .map((b: any) => Number(b.time))
          .filter((t: number) => Number.isFinite(t) && t >= 0),
      ),
    ).sort((a, b) => a - b) as number[];
  }
  if (boundaries.length === 0 || boundaries[0] > 0.001) {
    const auto: number[] = [];
    for (let t = 0; t < lastEnd + measureSec; t += measureSec) auto.push(Number(t.toFixed(3)));
    if (boundaries.length === 0) {
      warnings.push(
        makeWarning(
          'info',
          'transcription-measure-grid-synthetic',
          `转录 JSON 没有 beatMap，已按 ${bpm}BPM / ${timeSignature} 等分出 ${auto.length} 个小节。` +
            '若原曲有变速或弱起，小节线会偏移，请在小节切分器里手动校正。',
        ),
      );
    }
    boundaries = auto;
  }

  const measureIndexOf = (time: number): number => {
    let idx = 0;
    for (let i = 0; i < boundaries.length; i++) {
      if (time >= boundaries[i] - 1e-6) idx = i;
      else break;
    }
    return idx;
  };

  // 3. 组装小节
  const buckets = new Map<number, TabProjectMeasure>();
  const secPerQuarter = 60 / bpm;

  for (const n of cleanNotes) {
    const idx = measureIndexOf(n.audioTime);
    const start = boundaries[idx] ?? 0;
    const end = boundaries[idx + 1] ?? start + measureSec;
    if (!buckets.has(idx)) {
      buckets.set(idx, {
        index: idx,
        label: `第 ${idx + 1} 小节`,
        timeSignature,
        bpm,
        startTime: Number(start.toFixed(4)),
        endTime: Number(end.toFixed(4)),
        beats: beatsInMeasure,
        notes: [],
      });
    }
    const measure = buckets.get(idx)!;
    const offsetSec = Math.max(0, n.audioTime - start);
    measure.notes.push(
      makeNote({
        id: `tr_m${idx}_${measure.notes.length}`,
        string: n.string,
        fret: n.fret,
        offsetSec,
        beat: offsetSec / secPerQuarter,
        durationSec: n.duration,
        tuning,
        capo,
        technique: 'normal',
        velocity: n.velocity,
        confidence: n.confidence,
      }),
    );
  }

  const maxIndex = Math.max(...Array.from(buckets.keys()), 0);
  const measures: TabProjectMeasure[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    const existing = buckets.get(i);
    const start = boundaries[i] ?? measures[measures.length - 1]?.endTime ?? 0;
    const end = boundaries[i + 1] ?? start + measureSec;
    measures.push(
      existing || {
        index: i,
        label: `第 ${i + 1} 小节`,
        timeSignature,
        bpm,
        startTime: Number(start.toFixed(4)),
        endTime: Number(end.toFixed(4)),
        beats: beatsInMeasure,
        notes: [],
      },
    );
  }

  const lowConfidence = cleanNotes.filter((n) => n.confidence < 0.6).length;
  if (lowConfidence > 0) {
    warnings.push(
      makeWarning(
        'warn',
        'transcription-low-confidence',
        `${lowConfidence}/${cleanNotes.length} 个音符置信度低于 0.6，建议优先人工复核。`,
      ),
    );
  }

  const lowestNote = cleanNotes.reduce((min, n) => (n.midi < min ? n.midi : min), 127);
  if (lowestNote < tuning[tuning.length - 1]) {
    warnings.push(
      makeWarning(
        'info',
        'transcription-below-range',
        `检测到低于 ${midiToNoteName(tuning[tuning.length - 1])} 的音（最低 ${midiToNoteName(lowestNote)}），` +
          '原曲可能使用降弦 / 七弦吉他或贝斯，请核对调弦设置。',
      ),
    );
  }

  const instrument: TabInstrument = options.instrument || 'guitar_lead';
  const project: Omit<TabProject, 'stats'> = {
    format: 'guitarmate-tab-project',
    version: '1.0',
    meta: {
      title:
        options.title || data.title || options.fileName?.replace(/\.[a-z0-9]+$/i, '') || '转录草稿',
      artist: options.artist || data.artist,
      bpm,
      timeSignature,
      instrument,
      capo,
    },
    tuning,
    capo,
    tracks: [
      { id: 'track_1', name: 'transcription', instrument, tuning, capo, measures },
    ],
    source: {
      kind: 'solo-trace',
      fileName: options.fileName,
      url: options.url,
      site: options.site || data.sourceTool || 'SoloTrace / Basic Pitch',
      rights: options.rights || 'unknown',
      rightsNote: options.rightsNote,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...project, stats: computeStats(project) };
}

/** 校验并（必要时）修补一个 TabProject（CMS 保存过再读回来的场景） */
export function validateTabProject(data: any, options: TranscriptionParseOptions = {}): TabProject {
  if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
    throw new TranscriptionParseError('TabProject 缺少 tracks 数组。');
  }
  const warnings: TabProjectWarning[] = Array.isArray(data.warnings) ? [...data.warnings] : [];

  const tracks = data.tracks.map((t: any, ti: number) => {
    const tuning = Array.isArray(t.tuning) && t.tuning.length >= 4 ? t.tuning : STANDARD_TUNING;
    const capo = Number.isFinite(t.capo) ? t.capo : 0;
    const measures: TabProjectMeasure[] = (t.measures || []).map((m: any, mi: number) => {
      const timeSignature = m.timeSignature || data.meta?.timeSignature || '4/4';
      const bpm = Number.isFinite(m.bpm) && m.bpm > 0 ? m.bpm : data.meta?.bpm || 90;
      const start = Number.isFinite(m.startTime) ? m.startTime : 0;
      const end =
        Number.isFinite(m.endTime) && m.endTime > start
          ? m.endTime
          : start + measureDurationSec(bpm, timeSignature);
      const secPerQuarter = 60 / bpm;

      const notes: TabProjectNote[] = (m.notes || []).map((n: any, ni: number) => {
        const offsetSec = Number.isFinite(n.offsetSec)
          ? n.offsetSec
          : Number.isFinite(n.audioTime)
            ? Math.max(0, n.audioTime - start)
            : 0;
        return makeNote({
          id: n.id || `tp_m${mi}_${ni}`,
          string: Number.isFinite(n.string) ? n.string : 1,
          fret: Number.isFinite(n.fret) ? Number(n.fret) : 0,
          offsetSec,
          beat: Number.isFinite(n.beat) ? n.beat : offsetSec / secPerQuarter,
          durationSec: Number.isFinite(n.durationSec)
            ? n.durationSec
            : Number.isFinite(n.duration)
              ? n.duration
              : 0.5,
          tuning,
          capo,
          technique: n.technique,
          velocity: n.velocity,
          confidence: n.confidence,
          chordName: n.chordName,
          rhythm: n.rhythm,
        });
      });

      return {
        index: Number.isFinite(m.index) ? m.index : mi,
        label: m.label || `第 ${mi + 1} 小节`,
        timeSignature,
        bpm,
        startTime: Number(start.toFixed(4)),
        endTime: Number(end.toFixed(4)),
        beats: Number.isFinite(m.beats) ? m.beats : beatsPerMeasure(timeSignature),
        notes: notes.sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string),
        chords: m.chords,
        rawText: m.rawText,
        sourceRef: m.sourceRef,
      };
    });

    return {
      id: t.id || `track_${ti + 1}`,
      name: t.name || `track ${ti + 1}`,
      instrument: (t.instrument || data.meta?.instrument || 'guitar') as TabInstrument,
      tuning,
      capo,
      measures,
    };
  });

  const totalMeasures = tracks.reduce((sum: number, t: any) => sum + t.measures.length, 0);
  if (totalMeasures === 0) throw new TranscriptionParseError('TabProject 里没有任何小节。');

  const normalized: Omit<TabProject, 'stats'> = {
    format: 'guitarmate-tab-project',
    version: '1.0',
    meta: {
      title: data.meta?.title || options.title || '未命名曲目',
      artist: data.meta?.artist || options.artist,
      bpm: Number(data.meta?.bpm) || 90,
      timeSignature: data.meta?.timeSignature || '4/4',
      key: data.meta?.key,
      instrument: (data.meta?.instrument || 'guitar') as TabInstrument,
      capo: Number(data.meta?.capo) || 0,
      transcriber: data.meta?.transcriber,
    },
    tuning: Array.isArray(data.tuning) ? data.tuning : tracks[0].tuning,
    capo: Number.isFinite(data.capo) ? data.capo : tracks[0].capo,
    tracks,
    source: data.source || {
      kind: 'tab-project',
      rights: options.rights || 'unknown',
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    warnings,
  };

  return { ...normalized, stats: computeStats(normalized) };
}
