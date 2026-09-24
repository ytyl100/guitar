import type { TabNote } from '../types';
import { detectBarres, type DetectedBarre } from './barreDetector';

/**
 * SoloTrace (macOS 转录工作站) 导出的 JSON 结构
 *
 * ```json
 * {
 *   "version": "1.0",
 *   "bpm": 75,
 *   "timeSignature": "4/4",
 *   "notes": [{ "id": "n_001", "string": 1, "fret": 7, "pitch": 67,
 *               "audioTime": 12.345, "scoreTime": 12.345,
 *               "duration": 0.8, "confidence": 0.92 }],
 *   "beatMap": { "bpm": 75, "beats": [{ "time": 0, "measure": 1, "beatInMeasure": 1 }] }
 * }
 * ```
 */
export interface SoloTraceRawNote {
  id?: string;
  string: number;
  fret: number;
  pitch: number;
  audioTime: number;
  scoreTime?: number;
  duration: number;
  confidence?: number;
  x?: number;
  y?: number;
}

export interface SoloTraceRawJson {
  version?: string;
  bpm: number;
  timeSignature?: string;
  notes: SoloTraceRawNote[];
  beatMap?: {
    bpm: number;
    beats: Array<{ time: number; measure: number; beatInMeasure: number }>;
  };
}

export interface ImportedTranscription {
  fileName?: string;
  bpm: number;
  timeSignature: [number, number];
  timeSignatureLabel: string;
  audioDurationSec: number;
  measureTimestamps: number[];
  notes: TabNote[];
  barres: DetectedBarre[];
  /** 低置信度 (<0.6) 音符数量，用于提醒教研老师优先复核 */
  lowConfidenceCount: number;
}

export class SoloTraceParseError extends Error {}

const DEFAULT_BPM = 80;

const parseTimeSignature = (raw?: string): [number, number] => {
  if (!raw) return [4, 4];
  const m = String(raw).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return [4, 4];
  const beats = parseInt(m[1], 10);
  const beatValue = parseInt(m[2], 10);
  return [
    Number.isFinite(beats) && beats > 0 ? beats : 4,
    Number.isFinite(beatValue) && beatValue > 0 ? beatValue : 4,
  ];
};

/**
 * 解析并校验 SoloTrace JSON 文本
 */
export function parseSoloTraceJson(jsonText: string, fileName?: string): ImportedTranscription {
  let raw: SoloTraceRawJson;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new SoloTraceParseError('JSON 解析失败：文件不是合法的 JSON 格式');
  }

  if (!raw || !Array.isArray(raw.notes)) {
    throw new SoloTraceParseError('JSON 结构不合法：缺少 notes 数组 (请使用 SoloTrace 导出文件)');
  }

  const bpm = Number(raw.bpm) > 0 ? Number(raw.bpm) : raw.beatMap?.bpm || DEFAULT_BPM;
  const timeSignature = parseTimeSignature(raw.timeSignature);
  const beatDuration = 60 / bpm;
  const measureDuration = beatDuration * timeSignature[0] * (4 / timeSignature[1]);

  // 1. 计算全曲时长
  const audioDurationSec = Math.max(
    ...raw.notes.map((n) => (n.audioTime || 0) + (n.duration || 0)),
    0,
  );
  const safeDuration = Number.isFinite(audioDurationSec) && audioDurationSec > 0 ? audioDurationSec : 0;

  // 2. 由 beatMap 推导小节线，如缺失则按 BPM 与拍号自动生成
  let measureTimestamps: number[] = [];
  const beats = raw.beatMap?.beats;
  if (beats && beats.length > 0) {
    const downbeats = beats
      .filter((b) => b.beatInMeasure === 1)
      .map((b) => Number(b.time))
      .filter((t) => Number.isFinite(t) && t >= 0)
      .sort((a, b) => a - b);
    measureTimestamps = Array.from(new Set(downbeats));
  }

  if (measureTimestamps.length === 0 || measureTimestamps[0] > 0.001) {
    // 自动生成: 从 0 开始按小节时长等分
    const auto: number[] = [];
    const total = safeDuration || measureDuration;
    for (let t = 0; t < total + 1e-6; t += measureDuration) {
      auto.push(Number(t.toFixed(3)));
    }
    measureTimestamps = auto.length > 0 ? auto : [0];
  }

  // 3. 转换为 CMS 内部 TabNote 结构
  const findMeasureIndex = (time: number): number => {
    let idx = 0;
    for (let i = 0; i < measureTimestamps.length; i++) {
      if (time >= measureTimestamps[i]) idx = i;
      else break;
    }
    return idx;
  };

  const notes: TabNote[] = raw.notes
    .filter((n) => Number.isFinite(n.audioTime) && Number.isFinite(n.string) && n.string >= 1 && n.string <= 6)
    .map((n, i) => ({
      id: n.id || `st_${Date.now()}_${i}`,
      measureIndex: findMeasureIndex(n.audioTime),
      stringIndex: n.string,
      fret: n.fret,
      timestampSec: Number(n.audioTime.toFixed(3)),
      durationSec: Number((n.duration || 0.5).toFixed(3)),
      technique: 'normal' as const,
      velocity: 90,
      pitch: n.pitch,
      confidence: n.confidence ?? 1.0,
    }))
    .sort((a, b) => a.timestampSec - b.timestampSec);

  // 4. 立即执行一次横按自动检测（教研老师在界面中确认后发布）
  const barres = detectBarres(notes, {
    toleranceMs: 30,
    measureStartTime: 0,
    measureDuration: safeDuration,
  });

  const lowConfidenceCount = notes.filter((n) => (n.confidence ?? 1) < 0.6).length;

  return {
    fileName,
    bpm,
    timeSignature,
    timeSignatureLabel: `${timeSignature[0]}/${timeSignature[1]}`,
    audioDurationSec: Number(safeDuration.toFixed(2)),
    measureTimestamps,
    notes,
    barres,
    lowConfidenceCount,
  };
}

/**
 * 读取浏览器 File 对象并解析为导入结果
 */
export async function importSoloTraceFile(file: File): Promise<ImportedTranscription> {
  const text = await file.text();
  return parseSoloTraceJson(text, file.name);
}
