/**
 * PracticePackage —— 小程序端唯一数据契约（schemaVersion 1.0）与校验层
 * ==================================================================
 *
 * 核心原则：**数据与资源分离**
 * JSON 只描述「什么时间、什么位置、显示什么、播放什么」，
 * 音频 / 图片资源用 URL 指向 CDN，不进入 JSON 本体。
 *
 * 本文件提供三件事：
 * 1. `PracticePackage` 类型定义（与后端 `src/published/practice-package.types.ts` 一一对应）
 * 2. `validatePracticePackage()` —— 零依赖校验（版本白名单 + 必需字段 + 结构完整性）
 * 3. `normalizeToPracticePackage()` —— 兼容层：把旧的 `/measures` 数组响应包装成契约结构
 *
 * ⚠️ 为什么不用 zod：
 * 小程序包体积敏感，且当前工程没有 zod 依赖。这里手写校验器（约 120 行）
 * 覆盖「版本白名单 / 必需字段 / 数组元素结构 / 数值类型」四类问题。
 * 若后续引入 zod，只需替换 `validatePracticePackage` 的实现，
 * 上层（api.ts / 组件）无需改动。
 */

/** 与后端 / 渲染器约定：snake_case */
export type NoteTechnique =
  | 'normal'
  | 'hammer_on'
  | 'pull_off'
  | 'slide'
  | 'bend'
  | 'vibrato'
  | 'harmonic'
  | 'palm_mute'
  | 'mute'
  | 'tap';

export type InstrumentType =
  | 'guitar_lead'
  | 'guitar_rhythm'
  | 'guitar_acoustic'
  | 'bass'
  | 'piano'
  | 'drums'
  | 'other';

export interface ScoreMeta {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  bpm: number;
  timeSignature: string;
  key?: string;
  capo?: number;
  /** 由低到高：["E2","A2","D3","G3","B3","E4"] */
  tuning: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
  coverUrl?: string;
}

export interface TrackMeta {
  id: string;
  instrument: InstrumentType;
  label: string;
  tuning: string[];
  capo?: number;
  fullAudioUrl?: string;
}

export interface PracticeNote {
  id: string;
  /** 1-6，1 = 最细弦 */
  string: number;
  /** 0-24；-1 表示不弹 */
  fret: number;
  pitch: number;
  /** 相对小节起始（秒） */
  relativeTime: number;
  duration: number;
  /** 归一化坐标 0-1（叠加到谱面图片时使用） */
  x: number;
  y: number;
  technique?: NoteTechnique;
  /**
   * 左手指法：0 = 空弦（不按左手），1 = 食指，2 = 中指，3 = 无名指，4 = 小指。
   *
   * 真实六线谱都会在品位数旁标出手指示意图（教材 / Guitar Pro / 官方谱尤其如此），
   * 否则学员只能看到「第 3 品」而不知道用哪根手指按。
   * 音频转录的指法由后端按「最低把位优先」推定，人工可在 CMS 复核时改写。
   * 为 undefined 时渲染层不画标记（旧数据保持原样，不做强校验）。
   */
  finger?: number;
  /**
   * 该音符生效的**手位**（= 食指按第几品）。
   *
   * 谱面弦线上写的是手指号，品位靠 `fret = position + finger − 1` 反推；
   * 与小节把位不同时表示**小节内换把**，谱面会在该处补一个小号「N把位」标记。
   * 为 undefined 时回退到小节把位；两者都没有则不展示把位信息。
   */
  position?: number;
  confidence: number;
}

export interface PracticeChordMarker {
  id: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  /** 指法图，-1 = 闷弦 */
  voicing?: number[];
}

export interface PracticeBarreMarker {
  id: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface MetronomeConfig {
  enabled: boolean;
  bpm: number;
  beatsPerMeasure: number;
  accentFirstBeat: boolean;
}

export interface MeasureTrackData {
  trackId: string;
  instrument: InstrumentType;
  /** 为 null 时用 metronome 驱动时钟 */
  audioUrl: string | null;
  /** Original 模式音源；为空回退到 audioUrl */
  originalAudioUrl?: string | null;
  metronome?: MetronomeConfig;
  /** 为空字符串时走矢量渲染 */
  tabImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  notes: PracticeNote[];
}

export interface PracticeMeasure {
  id: string;
  /** 从 1 开始 */
  index: number;
  label: string;
  section?: string;
  startTime: number;
  endTime: number;
  duration: number;
  bpm: number;
  timeSignature: string;
  /**
   * 本小节把位：`P` = 第 P 把位（食指按第 P 品）。
   * 谱面上传统写法是罗马数字（Ⅰ / Ⅱ / Ⅲ …），渲染在谱面开头；
   * 为 undefined 时不画（旧数据兼容）。
   */
  position?: number;
  trackData: MeasureTrackData[];
  chords: PracticeChordMarker[];
  barres: PracticeBarreMarker[];
  tips?: string[];
}

export interface AssetManifest {
  cdnBase: string;
  originalAudioUrl?: string;
  audioFormat: 'mp3' | 'wav' | 'm4a';
  audioBitrate?: number;
}

export interface Provenance {
  source: 'solotrace' | 'ascii_tab' | 'guitar_pro' | 'musicxml' | 'chord_sheet' | 'manual' | 'mixed';
  sourceDetail?: string;
  copyright?: string;
  license: 'public_domain' | 'cc_by' | 'authorized' | 'user_uploaded';
  humanReviewLevel: number;
}

export interface PracticePackage {
  schemaVersion: '1.0';
  score: ScoreMeta;
  tracks: TrackMeta[];
  measures: PracticeMeasure[];
  assets: AssetManifest;
  provenance: Provenance;
  publishedAt: string;
  publishedBy: string;
}

/** 版本白名单：不在列表中的结构直接提示用户升级小程序 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0'];

/** 左手指法名称：0 = 空弦，1-4 = 食指…小指 */
export const FINGER_LABEL: Record<number, string> = {
  0: '空弦',
  1: '食指',
  2: '中指',
  3: '无名指',
  4: '小指',
};

/** 手指标注的短记号（谱面上标注用；0 用「○」表示空弦） */
export function fingerMark(finger?: number): string {
  if (finger === 0) return '○';
  if (typeof finger !== 'number' || finger < 1 || finger > 4) return '';
  return String(finger);
}

export function fingerLabel(finger?: number): string {
  if (finger === 0) return '空弦（不按左手）';
  if (typeof finger !== 'number' || finger < 1 || finger > 4) return '未标注指法';
  return `${FINGER_LABEL[finger]}（${finger}）`;
}

/** 把位 → 罗马数字（传统谱面标记：1→Ⅰ、4→Ⅳ、10→Ⅹ） */
export function toRomanPosition(value: number): string {
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

/** 把位说明：P = 第 P 把位（食指按第 P 品） */
export function positionLabel(position?: number): string {
  if (!position || position < 1) return '未标注把位';
  return position === 1 ? '第 1 把位（开放把位）' : `第 ${position} 把位`;
}

/** 契约里的 technique → 谱面渲染用的中文/图标标记（可选展示） */
export const TECHNIQUE_LABEL: Record<NoteTechnique, string> = {  normal: '',
  hammer_on: 'H',
  pull_off: 'P',
  slide: '/',
  bend: 'B',
  vibrato: '~',
  harmonic: '◇',
  palm_mute: 'PM',
  mute: 'X',
  tap: 'T',
};

export class PracticePackageError extends Error {
  constructor(
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'PracticePackageError';
  }
}

export interface ValidationResult {
  ok: boolean;
  /** 致命问题（无法渲染） */
  errors: string[];
  /** 可降级的问题（仍可渲染，例如缺 x/y） */
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * 校验 PracticePackage。
 *
 * 分级处理：
 * - **errors**：版本不支持 / 缺 score / measures 不是数组 → 无法渲染，必须抛错
 * - **warnings**：个别小节缺 trackData / 音符缺坐标 / 时长为 0 → 仍可降级渲染
 */
export function validatePracticePackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObj(input)) {
    return { ok: false, errors: ['响应不是 JSON 对象'], warnings };
  }

  // ── 版本 ──
  if (!isStr(input.schemaVersion)) {
    errors.push('缺少 schemaVersion 字段');
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(input.schemaVersion)) {
    errors.push(
      `不支持的协议版本 ${input.schemaVersion}（本版本支持 ${SUPPORTED_SCHEMA_VERSIONS.join(' / ')}），请更新小程序`,
    );
  }

  // ── 必需字段 ──
  for (const key of ['score', 'measures', 'assets', 'tracks', 'provenance']) {
    if (input[key] === undefined || input[key] === null) errors.push(`缺少必需字段 ${key}`);
  }

  if (isObj(input.score)) {
    if (!isStr(input.score.id)) errors.push('score.id 缺失或类型错误');
    if (!isStr(input.score.title)) errors.push('score.title 缺失或类型错误');
    if (!isNum(input.score.bpm)) warnings.push('score.bpm 非法，将按 80BPM 兜底');
  }

  if (input.measures !== undefined && !Array.isArray(input.measures)) {
    errors.push('measures 必须是数组');
  }

  if (Array.isArray(input.measures)) {
    if (input.measures.length === 0) {
      warnings.push('该曲目还没有已发布小节');
    }
    input.measures.forEach((m: unknown, i: number) => {
      if (!isObj(m)) {
        errors.push(`measures[${i}] 不是对象`);
        return;
      }
      if (!Array.isArray(m.trackData)) {
        errors.push(`measures[${i}].trackData 必须是数组`);
        return;
      }
      if (m.trackData.length === 0) warnings.push(`measures[${i}] 没有分轨数据`);
      if (!isNum(m.duration) || m.duration <= 0) {
        warnings.push(`measures[${i}] 时长非法（${m.duration}），将按 endTime-startTime 兜底`);
      }
      m.trackData.forEach((td: unknown, j: number) => {
        if (!isObj(td)) {
          errors.push(`measures[${i}].trackData[${j}] 不是对象`);
          return;
        }
        if (!Array.isArray(td.notes)) {
          errors.push(`measures[${i}].trackData[${j}].notes 必须是数组`);
          return;
        }
        const hasAudio = isStr(td.audioUrl) && td.audioUrl.length > 0;
        const hasMetronome = isObj(td.metronome) && td.metronome.enabled === true;
        if (!hasAudio && !hasMetronome) {
          warnings.push(
            `measures[${i}].trackData[${j}] 既没有 audioUrl 也没有 metronome，将按静音处理`,
          );
        }
        td.notes.forEach((n: unknown, k: number) => {
          if (!isObj(n)) {
            errors.push(`measures[${i}].trackData[${j}].notes[${k}] 不是对象`);
            return;
          }
          if (!isNum(n.string) || n.string < 1 || n.string > 7) {
            warnings.push(`measure ${i} note ${k} 的 string 非法（${n.string}）`);
          }
          if (!isNum(n.relativeTime)) {
            errors.push(`measures[${i}].trackData[${j}].notes[${k}].relativeTime 缺失或非法`);
          }
          if (!isNum(n.x) || !isNum(n.y)) {
            warnings.push(`measure ${i} note ${k} 缺少归一化坐标 x/y，矢量渲染仍可用`);
          }
        });
      });
    });
  }

  if (input.assets !== undefined && !isObj(input.assets)) {
    errors.push('assets 必须是对象');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 兼容层：把**旧的** `GET /api/published/scores/:id/measures` 数组响应
 * 包装成 PracticePackage 结构。
 *
 * 作用：后端灰度上线期间，小程序端不需要区分新旧接口 —— 本函数保证
 * 拿到的永远是同一套结构，渲染层只写一遍。
 */
export function normalizeToPracticePackage(
  payload: unknown,
  context: { scoreId: string; title?: string; artist?: string } = { scoreId: '' },
): PracticePackage {
  // 1. 已经是契约结构 → 只做字段兜底
  if (isObj(payload) && isStr(payload.schemaVersion) && Array.isArray(payload.measures)) {
    return withFallbacks(payload as unknown as PracticePackage, context);
  }

  // 2. 旧结构：Measure[]
  const legacy = Array.isArray(payload) ? payload : [];
  const measures: PracticeMeasure[] = legacy.map((m: any, i: number) => ({
    id: String(m?.id ?? `m_${i + 1}`),
    index: Number(m?.index) > 0 ? Number(m.index) : i + 1,
    label: String(m?.label ?? `第 ${i + 1} 小节`),
    section: undefined,
    startTime: Number(m?.startTime ?? 0),
    endTime: Number(m?.endTime ?? 0),
    duration: Number(m?.duration ?? Math.max(0, Number(m?.endTime ?? 0) - Number(m?.startTime ?? 0))),
    bpm: Number(m?.bpm ?? 80),
    timeSignature: String(m?.timeSignature ?? '4/4'),
    trackData: (Array.isArray(m?.trackData) ? m.trackData : []).map((td: any) => {
      const audioUrl = isStr(td?.audioUrl) && td.audioUrl.length > 0 ? td.audioUrl : null;
      const beatsPerMeasure =
        parseInt(String(m?.timeSignature ?? '4/4').split('/')[0], 10) || 4;
      return {
        trackId: String(td?.trackId ?? ''),
        instrument: mapLegacyChannel(td?.channel),
        audioUrl,
        originalAudioUrl:
          isStr(td?.originalAudioUrl) && td.originalAudioUrl.length > 0 ? td.originalAudioUrl : null,
        metronome: audioUrl
          ? undefined
          : {
              enabled: true,
              bpm: Number(m?.bpm ?? 80),
              beatsPerMeasure,
              accentFirstBeat: true,
            },
        tabImageUrl: isStr(td?.tabImageUrl) ? td.tabImageUrl : '',
        imageWidth: Number(td?.imageWidth ?? 1200),
        imageHeight: Number(td?.imageHeight ?? 300),
        notes: (Array.isArray(td?.notes) ? td.notes : []).map(normalizeLegacyNote),      } as MeasureTrackData;
    }),
    chords: (Array.isArray(m?.chords) ? m.chords : []).map((c: any, ci: number) => ({
      id: String(c?.id ?? `chord_${i}_${ci}`),
      chordName: String(c?.chordName ?? ''),
      startTime: Number(c?.startTime ?? 0),
      duration: Number(c?.duration ?? 0),
      x: Number(c?.x ?? 0),
      y: Number(c?.y ?? 0),
      voicing: Array.isArray(c?.voicing) ? c.voicing.map(Number) : undefined,
    })),
    barres: (Array.isArray(m?.barres) ? m.barres : []).map((b: any, bi: number) => ({
      id: String(b?.id ?? `barre_${i}_${bi}`),
      fret: Number(b?.fret ?? 0),
      fromString: Number(b?.fromString ?? 1),
      toString: Number(b?.toString ?? 6),
      startTime: Number(b?.startTime ?? 0),
      duration: Number(b?.duration ?? 0),
      x: Number(b?.x ?? 0),
      y: Number(b?.y ?? 0),
    })),
    tips: undefined,
  }));

  const bpm = measures[0]?.bpm || 80;
  const wrapped: PracticePackage = {
    schemaVersion: '1.0',
    score: {
      id: context.scoreId,
      title: context.title || '未命名曲目',
      artist: context.artist,
      bpm,
      timeSignature: measures[0]?.timeSignature || '4/4',
      tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
      capo: 0,
    },
    tracks: [],
    measures,
    assets: {
      cdnBase: '',
      audioFormat: 'mp3',
    },
    provenance: {
      source: 'manual',
      license: 'user_uploaded',
      humanReviewLevel: 1,
    },
    publishedAt: new Date().toISOString(),
    publishedBy: 'legacy-api',
  };

  return withFallbacks(wrapped, context);
}

/** DB channel → 契约 InstrumentType */
function mapLegacyChannel(raw?: unknown): InstrumentType {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'guitar_lead') return 'guitar_lead';
  if (v === 'guitar_rhythm') return 'guitar_rhythm';
  if (v === 'bass') return 'bass';
  if (v === 'piano') return 'piano';
  if (v === 'guitar' || v === 'guitar_acoustic') return 'guitar_acoustic';
  return 'other';
}

const TECHNIQUE_MAP: Record<string, NoteTechnique> = {
  normal: 'normal',
  'hammer-on': 'hammer_on',
  hammer_on: 'hammer_on',
  'pull-off': 'pull_off',
  pull_off: 'pull_off',
  slide: 'slide',
  bend: 'bend',
  vibrato: 'vibrato',
  harmonic: 'harmonic',
  'palm-mute': 'palm_mute',
  palm_mute: 'palm_mute',
  mute: 'mute',
  'dead-note': 'mute',
  dead_note: 'mute',
  tap: 'tap',
};

function normalizeLegacyNote(n: any, i: number): PracticeNote {
  const stringIndex = Number(n?.string ?? 1);
  const relativeTime = Number(n?.relativeTime ?? 0);
  const duration = Number(n?.duration ?? 0.5);
  return {
    id: String(n?.id ?? `n_${i}`),
    string: Number.isFinite(stringIndex) ? stringIndex : 1,
    fret: Number.isFinite(Number(n?.fret)) ? Number(n.fret) : -1,
    pitch: Number(n?.pitch ?? 0),
    relativeTime: Number.isFinite(relativeTime) ? relativeTime : 0,
    duration: Number.isFinite(duration) ? duration : 0.5,
    // 旧接口没给 x/y 时，用 relativeTime 与弦序兜底推算
    x: Number.isFinite(Number(n?.x)) && Number(n.x) > 0 ? Number(n.x) : 0,
    y:
      Number.isFinite(Number(n?.y)) && Number(n.y) > 0
        ? Number(n.y)
        : Number(((stringIndex - 1) / 5).toFixed(4)),
    technique: TECHNIQUE_MAP[String(n?.technique ?? 'normal').toLowerCase()] || 'normal',
    // 手指标记：只在 0-4 范围内认（0 = 空弦）；缺失/非法一律 undefined，渲染层不画
    finger:
      Number.isFinite(Number(n?.finger)) && Number(n.finger) >= 0 && Number(n.finger) <= 4
        ? Math.round(Number(n.finger))
        : undefined,
    // 音符级手位：1-24；缺失则渲染层回退到小节把位
    position:
      Number.isFinite(Number(n?.position)) && Number(n.position) >= 1 && Number(n.position) <= 24
        ? Math.round(Number(n.position))
        : undefined,
    confidence: Number.isFinite(Number(n?.confidence)) ? Number(n.confidence) : 1,
  };
}

/** 字段兜底：版本 / 数组 / 数值缺失时补默认值，保证渲染层不用写防御代码 */
function withFallbacks(
  pkg: PracticePackage,
  context: { scoreId: string; title?: string; artist?: string },
): PracticePackage {
  const measures = (Array.isArray(pkg.measures) ? pkg.measures : [])
    .map((m, i) => {
      const duration =
        Number(m.duration) > 0
          ? Number(m.duration)
          : Math.max(0.001, Number(m.endTime ?? 0) - Number(m.startTime ?? 0));
      return {
        ...m,
        id: m.id || `m_${i + 1}`,
        index: Number(m.index) > 0 ? Number(m.index) : i + 1,
        label: m.label || `第 ${i + 1} 小节`,
        duration,
        bpm: Number(m.bpm) > 0 ? Number(m.bpm) : Number(pkg.score?.bpm) || 80,
        timeSignature: m.timeSignature || pkg.score?.timeSignature || '4/4',
        trackData: (Array.isArray(m.trackData) ? m.trackData : []).map((td) => ({
          ...td,
          audioUrl: typeof td.audioUrl === 'string' && td.audioUrl.length > 0 ? td.audioUrl : null,
          tabImageUrl: typeof td.tabImageUrl === 'string' ? td.tabImageUrl : '',
          imageWidth: Number(td.imageWidth) || 1200,
          imageHeight: Number(td.imageHeight) || 300,
          notes: (Array.isArray(td.notes) ? td.notes : [])
            .map(normalizeLegacyNote)
            .sort((a, b) => a.relativeTime - b.relativeTime || a.string - b.string),
        })),
        chords: Array.isArray(m.chords) ? m.chords : [],
        barres: Array.isArray(m.barres) ? m.barres : [],
      } as PracticeMeasure;
    })
    .sort((a, b) => a.index - b.index);

  return {
    schemaVersion: '1.0',
    score: {
      ...(pkg.score || ({} as ScoreMeta)),
      id: pkg.score?.id || context.scoreId,
      title: pkg.score?.title || context.title || '未命名曲目',
      artist: pkg.score?.artist || context.artist,
      bpm: Number(pkg.score?.bpm) > 0 ? Number(pkg.score.bpm) : 80,
      timeSignature: pkg.score?.timeSignature || '4/4',
      tuning: Array.isArray(pkg.score?.tuning) && pkg.score.tuning.length > 0
        ? pkg.score.tuning
        : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
      capo: Number(pkg.score?.capo) || 0,
    },
    tracks: Array.isArray(pkg.tracks) ? pkg.tracks : [],
    measures,
    assets: {
      cdnBase: pkg.assets?.cdnBase || '',
      originalAudioUrl: pkg.assets?.originalAudioUrl,
      audioFormat: pkg.assets?.audioFormat || 'mp3',
      audioBitrate: pkg.assets?.audioBitrate,
    },
    provenance: {
      source: pkg.provenance?.source || 'manual',
      sourceDetail: pkg.provenance?.sourceDetail,
      copyright: pkg.provenance?.copyright,
      license: pkg.provenance?.license || 'user_uploaded',
      humanReviewLevel:
        Number.isFinite(Number(pkg.provenance?.humanReviewLevel))
          ? Number(pkg.provenance.humanReviewLevel)
          : 1,
    },
    publishedAt: pkg.publishedAt || new Date().toISOString(),
    publishedBy: pkg.publishedBy || 'unknown',
  };
}

/**
 * 解析 `#t=start,end` 媒体片段语法。
 *
 * 后端在小节音频切片失败时会降级返回 `原始音频路径#t=<start>,<end>`，
 * 此时必须由前端把播放区间限制在小节窗口内（否则会播整首歌）。
 */
export function parseMediaFragment(url: string): { baseUrl: string; start: number; end: number | null } {
  const hashIdx = url.indexOf('#t=');
  if (hashIdx === -1) return { baseUrl: url, start: 0, end: null };
  const baseUrl = url.slice(0, hashIdx);
  const [startRaw, endRaw] = url
    .slice(hashIdx + 3)
    .split(',')
    .map((v) => parseFloat(v));
  return {
    baseUrl,
    start: Number.isFinite(startRaw) ? startRaw : 0,
    end: Number.isFinite(endRaw) ? (endRaw as number) : null,
  };
}

/** 从 measure.label 推断段落（后端已给 section，这里作为兜底） */
export function inferSection(label?: string): string | undefined {
  const text = label || '';
  const table: Array<[RegExp, string]> = [
    [/前奏|intro/i, 'intro'],
    [/主歌|verse/i, 'verse'],
    [/(预)?副歌|pre-?chorus|chorus/i, 'chorus'],
    [/间奏|过门|bridge|interlude|riff/i, 'bridge'],
    [/独奏|solo|华彩/i, 'solo'],
    [/尾奏|结束|outro|ending|coda/i, 'outro'],
  ];
  for (const [test, value] of table) if (test.test(text)) return value;
  return undefined;
}
