/**
 * 转录复核工作台 —— 前端视图模型与纯函数
 * ======================================
 *
 * 后端返回的 `TabProject` 是**存储格式**（`offsetSec` 相对小节起点），
 * 而 ReviewPage 需要的是**时间轴格式**（绝对秒 + 小节归属），
 * 两者之间的转换集中放在这里，组件里不做任何数据变形。
 */

import type { ApiTabProject, ApiTranscriptionNote } from '../../services/api';

/** 复核用音符：在 TabProjectNote 基础上补齐「绝对秒 + 小节归属」 */
export interface ReviewNote {
  id: string;
  /** 1-6（1 = 最细的高音 E 弦，渲染在最上方） */
  string: number;
  fret: number;
  midi: number;
  /** 绝对秒（小节 startTime + offsetSec），用于整曲波形 / 时间轴定位 */
  startSec: number;
  /** 相对小节起点的秒数 */
  offsetSec: number;
  beat: number;
  durationSec: number;
  technique: string;
  /**
   * 左手指法：0 = 空弦（不按左手），1 = 食指，2 = 中指，3 = 无名指，4 = 小指。
   * 未指定时为 undefined（谱面不画标记）。
   */
  finger?: number;
  /**
   * 该音生效的手位（= 食指按第几品）。
   * 与小节把位不同 → **小节内换把**，谱面会在该处多印一个小号「N把位」标记。
   * 小程序弦线上的数字是手指号，必须靠它反推品位：`fret = position + finger − 1`。
   */
  position?: number;
  /** 0-1；< 0.6 会在 UI 里标红 */
  confidence: number;
  velocity?: number;
  /** 该音符所属的和弦名（源谱面标注；用于谱面上方和弦行） */
  chordName?: string;
  /** 归属小节 index（0 起） */
  measureIndex: number;
}

/** 小节内的和弦标记（谱面上方和弦名） */
export interface ReviewChord {
  id: string;
  name: string;
  /** 相对小节起点的秒数 */
  offsetSec: number;
  durationSec: number;
}

export interface ReviewMeasure {
  index: number;
  /** 1 起的显示序号 */
  displayIndex: number;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  beats: number;
  /** 本小节把位：P = 第 P 把位（食指按第 P 品）；undefined = 未指定 */
  position?: number;
  /** 推荐和弦（本小节的编配提示）：显式和弦标记优先，其次取音符上的 chordName */
  chord?: string;
  notes: ReviewNote[];
  /** 和弦标记（谱面上方和弦名） */
  chords: ReviewChord[];
  lowConfidenceCount: number;
}

/** 左手指法选项（0 = 空弦，1-4 = 食指…小指） */
export const FINGER_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '0 · 空弦（不按左手）' },
  { value: 1, label: '1 · 食指' },
  { value: 2, label: '2 · 中指' },
  { value: 3, label: '3 · 无名指' },
  { value: 4, label: '4 · 小指' },
];

/** 谱面标注用的短记号（与品位数区分：手指用“圈”或上标小字） */
export const FINGER_SHORT: string[] = ['○', '1', '2', '3', '4'];

/** 把位中文说明 */
export function positionLabel(position?: number | null): string {
  if (!position || position < 1) return '未指定';
  return position === 1 ? '第 1 把位（开放把位）' : `第 ${position} 把位`;
}

/** 手指中文说明 */
export function fingerLabel(finger?: number | null): string {
  if (finger === 0) return '空弦（不按左手）';
  if (finger === undefined || finger === null || finger < 1 || finger > 4) return '未指定';
  return FINGER_OPTIONS[finger].label.replace(/^\d+ · /, '');
}

/** 把位 → 罗马数字（传统谱面标记：1→Ⅰ、2→Ⅱ、5→Ⅴ、10→Ⅹ） */
export function toRoman(value: number): string {
  const table: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.min(24, Math.round(value)));
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/** 演奏技巧（kebab-case，发布时后端会映射为契约的 snake_case） */
export const REVIEW_TECHNIQUES: Array<{ value: string; label: string }> = [
  { value: 'normal', label: '正常拨弦' },
  { value: 'hammer-on', label: '击弦 hammer-on' },
  { value: 'pull-off', label: '勾弦 pull-off' },
  { value: 'slide', label: '滑音 slide' },
  { value: 'bend', label: '推弦 bend' },
  { value: 'vibrato', label: '揉弦 vibrato' },
  { value: 'palm-mute', label: '闷音 palm mute' },
  { value: 'harmonic', label: '泛音 harmonic' },
  { value: 'dead-note', label: '哑音 dead note' },
];

/** 时值预设（以 60BPM 的拍为参照由调用方换算，这里只给常用秒值） */
export const DURATION_PRESETS: number[] = [0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75, 1, 1.5, 2];

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** 兜底元信息（草稿缺失时的最后一道防线，避免 UI 崩溃） */
export const DEFAULT_REVIEW_META = {
  /** 标准调弦（索引 0 = 一弦），与后端 STANDARD_TUNING_MIDI 一致 */
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  bpm: 100,
  timeSignature: '4/4',
};

export const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi: number): string {
  const n = Math.round(Number(midi));
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${MIDI_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#52c41a';
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return '#faad14';
  return '#ff4d4f';
}

/** TabProject → 复核视图模型（小节 + 绝对秒时间轴音符） */
export function tabProjectToReviewMeasures(tabProject: ApiTabProject | null): ReviewMeasure[] {
  const track = tabProject?.tracks?.[0];
  if (!track?.measures) return [];

  return track.measures.map((measure, index) => {
    const duration = Math.max(0.001, measure.endTime - measure.startTime);
    const notes: ReviewNote[] = (measure.notes || []).map((raw: any, noteIndex: number) => {
      const offsetSec = Number(raw.offsetSec || 0);
      return {
        id: String(raw.id || `m${measure.index}_n${noteIndex}`),
        string: Number(raw.string || 1),
        fret: Number(raw.fret ?? 0),
        midi: Number(raw.midi ?? 0),
        startSec: Number(measure.startTime || 0) + offsetSec,
        offsetSec,
        beat: Number(raw.beat ?? 0),
        durationSec: Number(raw.durationSec ?? 0.25),
        technique: String(raw.technique || 'normal'),
        finger: Number.isFinite(Number(raw.finger)) ? Number(raw.finger) : undefined,
        position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : undefined,
        chordName: raw.chordName ? String(raw.chordName) : undefined,
        confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 1,
        velocity: Number(raw.velocity ?? 90),
        measureIndex: index,
      };
    });
    notes.sort((a, b) => a.offsetSec - b.offsetSec || a.string - b.string);

    /**
     * 和弦行数据来源有两种，按优先级合并：
     * 1. `measure.chords` —— 源谱面明确标注的和弦（MusicXML `<harmony>` / 和弦表导入）；
     * 2. 音符上的 `chordName` —— 转录链路按把位音簇识别出来的和弦。
     */
    const chordMap = new Map<string, ReviewChord>();
    for (const [chordIndex, raw] of (measure.chords || []).entries()) {
      const name = String((raw as any)?.name || (raw as any)?.chordName || '').trim();
      if (!name) continue;
      const offsetSec = Number((raw as any)?.offsetSec ?? 0);
      chordMap.set(`${name}@${offsetSec.toFixed(3)}`, {
        id: String((raw as any)?.id || `chord_m${measure.index}_${chordIndex}`),
        name,
        offsetSec,
        durationSec: Number((raw as any)?.durationSec ?? 0),
      });
    }
    for (const note of notes) {
      if (!note.chordName) continue;
      if ([...chordMap.values()].some((c) => c.name === note.chordName)) continue;
      chordMap.set(`${note.chordName}@${note.offsetSec.toFixed(3)}`, {
        id: `chord_note_${note.id}`,
        name: note.chordName,
        offsetSec: note.offsetSec,
        durationSec: note.durationSec,
      });
    }
    const chords = [...chordMap.values()].sort((a, b) => a.offsetSec - b.offsetSec);

    return {
      index,
      displayIndex: Number(measure.index ?? index) + 1,
      label: measure.label || `第 ${index + 1} 小节`,
      startTime: Number(measure.startTime || 0),
      endTime: Number(measure.endTime || 0),
      duration,
      beats: Number(measure.beats) || 4,
      position: Number.isFinite(Number((measure as any).position))
        ? Number((measure as any).position)
        : undefined,
      /**
       * 推荐和弦：优先用显式 `<harmony>` / 和弦表给出的第一个和弦；
       * 没有显式和弦标记时，退回音符自带的 `chordName`（转录/导入时已推定）。
       * 刻意**不去数音反推**——那是导入流水线 `deriveChords()` 的职责。
       */
      chord: chords[0]?.name || notes.find((n) => !!n.chordName)?.chordName || undefined,
      notes,
      chords,
      lowConfidenceCount: notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length,
    };
  });
}

/**
 * 不可变地修改一个音符 → 返回新的 TabProject。
 *
 * 关键：**同步重算 `midi`**（`midi = 空弦音高 + fret + capo`）。
 * 只改 fret 而不改 midi 会让 C 端的音高与谱面不一致（听起来对不上）。
 */
export function applyNoteEdit(
  tabProject: ApiTabProject,
  measureIndex: number,
  noteId: string,
  patch: Partial<Pick<ReviewNote, 'string' | 'fret' | 'durationSec' | 'technique' | 'finger'>>,
): ApiTabProject {
  const tuning = tabProject.tuning || [];
  const capo = tabProject.capo || 0;

  return {
    ...tabProject,
    tracks: tabProject.tracks.map((track, trackIndex) =>
      trackIndex !== 0
        ? track
        : {
            ...track,
            measures: track.measures.map((measure, index) => {
              if (index !== measureIndex) return measure;
              return {
                ...measure,
                notes: measure.notes.map((raw: any, noteIndex: number) => {
                  const currentId = String(raw.id || `m${measure.index}_n${noteIndex}`);
                  if (currentId !== noteId) return raw;
                  const next = { ...raw, ...patch };
                  const openPitch = Number(tuning[Number(next.string) - 1] ?? 0);
                  next.midi = openPitch + Number(next.fret) + capo;
                  return next;
                }),
              };
            }),
          },
    ),
  };
}

/**
 * 在某小节**新增一个音符**（需求 2.2：校正时不只是删改，还要能加）。
 *
 * - `midi` 按 `空弦 + 品位 + 变调夹` 重算 —— 与 `applyNoteEdit` 同一口径，
 *   不重算会让 C 端音高与谱面对不上；
 * - 插入后**按 `offsetSec` 重排**：契约要求 `notes` 按 relativeTime 升序，
 *   发布时后端依赖这个顺序生成 `relativeTime`；
 * - 人工录入的音符 `confidence = 1`（不需要复核）。
 */
export function applyAddNote(
  tabProject: ApiTabProject,
  measureIndex: number,
  spec: {
    string: number;
    fret: number;
    /** 相对小节起点的秒数 */
    offsetSec: number;
    durationSec: number;
    technique?: string;
    position?: number;
    finger?: number;
  },
): ApiTabProject {
  const tuning = tabProject.tuning || [];
  const capo = tabProject.capo || 0;
  const string = Math.max(1, Math.min(tuning.length || 6, Math.round(spec.string)));
  const fret = Math.round(spec.fret);
  const offsetSec = Math.max(0, Number(spec.offsetSec) || 0);
  const durationSec = Math.max(0.02, Number(spec.durationSec) || 0.25);
  const beatsPerMeasure = Number((tabProject.tracks?.[0]?.measures?.[measureIndex] as any)?.beats) || 4;
  const measureDuration = (() => {
    const m = tabProject.tracks?.[0]?.measures?.[measureIndex] as any;
    const start = Number(m?.startTime) || 0;
    const end = Number(m?.endTime) || 0;
    return end > start ? end - start : 0;
  })();

  const newNote = {
    id: `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    string,
    fret,
    midi: Number(tuning[string - 1] ?? 0) + fret + capo,
    offsetSec: Number(offsetSec.toFixed(4)),
    beat: measureDuration > 0 ? Number((offsetSec / (measureDuration / beatsPerMeasure)).toFixed(4)) : 0,
    durationSec: Number(durationSec.toFixed(4)),
    technique: spec.technique || 'normal',
    finger: typeof spec.finger === 'number' ? spec.finger : undefined,
    position: typeof spec.position === 'number' ? spec.position : undefined,
    confidence: 1,
    velocity: 90,
  };

  return {
    ...tabProject,
    tracks: tabProject.tracks.map((track, trackIndex) =>
      trackIndex !== 0
        ? track
        : {
            ...track,
            measures: track.measures.map((measure, index) => {
              if (index !== measureIndex) return measure;
              const notes = [...measure.notes, newNote as any].sort(
                (a: any, b: any) => Number(a.offsetSec || 0) - Number(b.offsetSec || 0),
              );
              return { ...measure, notes };
            }),
          },
    ),
  };
}

/**
 * 修改小节把位（把位是**小节级**属性：一个小节内换把意味着手型整体平移）。
 * 传入 `undefined` 表示清除标记。
 */export function applyMeasurePosition(
  tabProject: ApiTabProject,
  measureIndex: number,
  position: number | undefined,
): ApiTabProject {
  return {
    ...tabProject,
    tracks: tabProject.tracks.map((track, trackIndex) =>
      trackIndex !== 0
        ? track
        : {
            ...track,
            measures: track.measures.map((measure, index) =>
              index !== measureIndex ? measure : ({ ...measure, position } as any),
            ),
          },
    ),
  };
}

/**
 * 按当前把位重算某小节**全部音符**的手指（管理员改把位后的一键同步）。
 *
 * 公式与后端 `fingering.ts` 一致：空弦 → 0；否则 `finger = fret - position + 1` 夹到 [1,4]。
 * 注意：这里**不做换把判断**（“按此把位重算”是人工强制指定），若某音符超出手指范围会夹到 4。
 */
export function applyMeasureRefinger(
  tabProject: ApiTabProject,
  measureIndex: number,
): ApiTabProject {
  return {
    ...tabProject,
    tracks: tabProject.tracks.map((track, trackIndex) =>
      trackIndex !== 0
        ? track
        : {
            ...track,
            measures: track.measures.map((measure, index) => {
              if (index !== measureIndex) return measure;
              const position = Number((measure as any).position);
              if (!Number.isFinite(position) || position < 1) return measure;
              return {
                ...measure,
                notes: measure.notes.map((raw: any) => {
                  const fret = Number(raw.fret);
                  if (!Number.isFinite(fret) || fret <= 0) return { ...raw, finger: 0 };
                  const finger = Math.min(4, Math.max(1, fret - position + 1));
                  return { ...raw, finger };
                }),
              };
            }),
          },
    ),
  };
}

/** 统计（顶栏展示） */
export function summarizeReview(measures: ReviewMeasure[]) {
  const notes = measures.flatMap((m) => m.notes);
  const low = notes.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD);
  const confidences = notes.map((n) => n.confidence);
  return {
    measureCount: measures.length,
    noteCount: notes.length,
    lowConfidenceCount: low.length,
    avgConfidence: confidences.length
      ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3))
      : 0,
    maxFret: notes.reduce((max, n) => Math.max(max, n.fret), 0),
    durationSec: measures.length ? measures[measures.length - 1].endTime : 0,
    /** 已标出手指的音符数（含空弦标记） */
    withFingerCount: notes.filter((n) => typeof n.finger === 'number').length,
    /** 已标出把位的小节数 */
    withPositionCount: measures.filter((m) => typeof m.position === 'number').length,
  };
}

/** 后端返回的转录音符（相对分轨起点）→ 时间轴音符（用于尚无 TabProject 时的预览） */
export function flatNotesToReviewMeasures(
  notes: ApiTranscriptionNote[],
  bpm: number,
  timeSignature: string,
  tuning: number[],
  capo: number,
): ReviewMeasure[] {
  const beats = parseInt(String(timeSignature).split('/')[0], 10) || 4;
  const denominator = parseInt(String(timeSignature).split('/')[1], 10) || 4;
  const measureSec = Math.max(0.1, (60 / (bpm > 0 ? bpm : 120)) * beats * (4 / denominator));
  if (!notes.length) return [];

  const totalSec = notes.reduce((max, n) => Math.max(max, n.startSec + n.durationSec), 0);
  const count = Math.max(1, Math.ceil(totalSec / measureSec - 1e-9));

  const measures: ReviewMeasure[] = [];
  for (let index = 0; index < count; index += 1) {
    const startTime = index * measureSec;
    const endTime = Math.min(totalSec, (index + 1) * measureSec) || startTime + measureSec;
    const inWindow = notes
      .filter((n) => n.startSec >= startTime - 1e-6 && n.startSec < endTime + 1e-6)
      .sort((a, b) => a.startSec - b.startSec || a.string - b.string)
      .map((n, i): ReviewNote => {
        const offsetSec = Number((n.startSec - startTime).toFixed(4));
        return {
          id: String(n.id || `m${index}_n${i}`),
          string: Number(n.string),
          fret: Number(n.fret),
          midi: Number(n.pitch ?? (tuning[n.string - 1] ?? 0) + n.fret + capo),
          startSec: Number(n.startSec.toFixed(4)),
          offsetSec,
          beat: Number((offsetSec / (60 / (bpm > 0 ? bpm : 120))).toFixed(4)),
          durationSec: Number(n.durationSec ?? 0.25),
          technique: String(n.technique || 'normal'),
          confidence: Number(n.confidence ?? 1),
          velocity: n.velocity,
          measureIndex: index,
        };
      });

    measures.push({
      index,
      displayIndex: index + 1,
      label: `第 ${index + 1} 小节`,
      startTime: Number(startTime.toFixed(4)),
      endTime: Number(endTime.toFixed(4)),
      duration: Number(measureSec.toFixed(4)),
      beats,
      notes: inWindow,
      /** 尚无 TabProject 时（只有扁平转录音符）没有和弦信息 */
      chords: [],
      lowConfidenceCount: inWindow.filter((n) => n.confidence < LOW_CONFIDENCE_THRESHOLD).length,
    });
  }
  return measures;
}

/** 该 TabProject 是否为模拟转录产物（未安装 Demucs / Basic Pitch） */
export function isSimulatedTabProject(tabProject: ApiTabProject | null): boolean {
  const codes = (tabProject?.warnings || []).map((w) => w.code);
  return codes.includes('simulated-transcription');
}

export function tabProjectWarnings(tabProject: ApiTabProject | null) {
  return (tabProject?.warnings || []).filter((w) => w.level !== 'info');
}
