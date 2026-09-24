/**
 * GuitarMate「六线谱统一中间格式」—— TabProject v1
 * =================================================
 *
 * 为什么需要它？
 * ------------------------------------------------------------------
 * 网上能拿到的六线谱并不是统一的 JSON，而是五花八门的**人工制谱**格式：
 *
 * | 来源                        | 格式            | 能否直接喂给后端 |
 * |-----------------------------|-----------------|------------------|
 * | Ultimate Guitar / GuitarTabs| ASCII tab 文本  | ❌ 需解析        |
 * | Songsterr                   | 私有 JSON       | ❌ 版权 + 私有   |
 * | AlphaTab / MuseScore        | Guitar Pro / GPX| ⚠️ 可转          |
 * | MuseScore / OpenScore       | MusicXML        | ⚠️ 可转          |
 * | SoloTrace (macOS)           | 转录 JSON       | ✅ 但需字段归一  |
 * | 「和弦 + 扫弦模式」手写谱    | 纯文本          | ❌ 需解析        |
 *
 * 因此本项目引入一层 **TabProject**：
 *
 * ```
 *   ASCII tab ─┐
 *   MusicXML  ─┤
 *   Guitar Pro─┼─► [ parser ] ─► TabProject ─► measures/notes ─► POST /api/measures/publish ─► 小程序
 *   和弦表     ─┤                  (统一中间格式)        (绝对秒 + 弦/品/MIDI)
 *   SoloTrace ─┘
 * ```
 *
 * 所有 parser 只负责「源格式 → TabProject」，所有下游（CMS 预览、发布、C 端）
 * 只消费 TabProject 派生出来的 measures。
 *
 * 约定（务必与 CMS / C 端保持一致）
 * ------------------------------------------------------------------
 * - `string`: 1 = 最细的高音 E 弦（一弦），6 = 最粗的低音 E 弦（六弦）。
 * - `midi`: 标准 MIDI 音高（A4 = 69）。`midi = 空弦音高 + fret + capo`。
 * - `tuning`: 6 个元素的 MIDI 数组，**索引 0 = 一弦**；默认标准调弦 EADGBE。
 * - 时间：音符既带 `offsetSec`（小节内秒数）又带 `beat`（小节内拍位置）。
 * - 和弦把位 `frets`: 6 个元素，**索引 0 = 六弦（低音 E）**，`'x'` 表示闷弦。
 */

/** 支持的源格式 */
export type TabSourceFormat =
  | 'ascii-tab'
  | 'chord-sheet'
  | 'musicxml'
  | 'gpx'
  | 'gp3'
  | 'gp4'
  | 'gp5'
  | 'solo-trace'
  | 'tab-project';

/** 版权状态 —— 决定该谱子能否对外发布到 C 端 */
export type RightsStatus =
  | 'public-domain'
  | 'original-arrangement'
  | 'licensed'
  | 'user-submission'
  | 'copyrighted'
  | 'unknown';

/** 演奏技巧（kebab-case；发布时由契约层映射为 snake_case） */
export type TabTechnique =
  | 'normal'
  | 'hammer-on'
  | 'pull-off'
  | 'slide'
  | 'vibrato'
  | 'bend'
  | 'palm-mute'
  | 'harmonic'
  | 'dead-note';

/** 时值记号 */
export type TabRhythm = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32';

export type TabInstrument =
  | 'guitar'
  | 'guitar_lead'
  | 'guitar_rhythm'
  | 'bass'
  | 'piano'
  | 'other';

export interface TabProjectSource {
  kind: TabSourceFormat;
  fileName?: string;
  /** 原始下载地址（溯源用） */
  url?: string;
  /** 来源站点名，例如 'Ultimate Guitar' / 'MuseScore' */
  site?: string;
  rights: RightsStatus;
  rightsNote?: string;
  parsedAt: string;
  parserVersion: string;
}

export interface TabSection {
  name: string;
  fromMeasure: number;
  toMeasure: number;
}

export interface TabProjectMeta {
  title: string;
  artist?: string;
  album?: string;
  bpm: number;
  timeSignature: string;
  /** 调性，例如 'A minor' */
  key?: string;
  instrument: TabInstrument;
  /** 变调夹品位，0 = 无 */
  capo: number;
  transcriber?: string;
  sections?: TabSection[];
}

export interface TabProjectNote {
  id: string;
  /** 1 = 一弦（高音 E）… 6 = 六弦（低音 E） */
  string: number;
  fret: number;
  midi: number;
  /** 小节内偏移秒数 */
  offsetSec: number;
  /** 小节内拍位置（0 起） */
  beat: number;
  durationSec: number;
  rhythm?: TabRhythm;
  technique?: TabTechnique;
  velocity?: number;
  confidence?: number;
  chordName?: string;
  /**
   * 左手指法：0 = 空弦（不按），1 = 食指，2 = 中指，3 = 无名指，4 = 小指。
   *
   * 来源优先级：
   * 1. 源文件真实标注（MusicXML / Guitar Pro 的 `<fingering>`）—— **不可被覆盖**；
   * 2. `fingering.ts#deriveLeftHandFingering` 的启发式推定（音频转录 / ASCII tab 只能走这条）；
   * 3. 人工在 CMS 复核工作台改写。
   */
  finger?: number;
  /**
   * 该音符所在的**手位**（= 此时食指按第几品）。
   *
   * 为什么要写到音符级，而不只是小节级？
   * 谱面上的数字现在是**手指号**（市场练习谱写法），品位靠
   * `fret = position + finger − 1` 反推 —— 一旦一小节内音域超过 4 品
   * （真实 solo 很常见），单一小节把位就会让反推失真。
   * 因此换把点之后的音符会带上新的手位，谱面就在该处多印一个小号「N把位」标记，
   * 从而**任何音符的品位都能被唯一确定**。
   */
  position?: number;
  /** 源文件中的列位置（ASCII tab 用，便于回溯） */
  sourceColumn?: number;
}

export interface TabProjectChord {
  name: string;
  offsetSec: number;
  beat: number;
  durationSec: number;
  /** 6 个元素，索引 0 = 六弦；数字 = 品位，'x' = 闷弦 */
  frets?: Array<number | 'x'>;
  /** 扫弦模式，例如 'D D U U D U' */
  strumPattern?: string;
}

export interface TabProjectMeasure {
  /** 0 起的小节序号（与后端 Measure.index 对齐时 +1） */
  index: number;
  label?: string;
  timeSignature?: string;
  bpm?: number;
  startTime: number;
  endTime: number;
  beats: number;
  notes: TabProjectNote[];
  chords?: TabProjectChord[];
  /**
   * 本小节把位：`P` = 第 P 把位（食指按第 P 品），谱面上通常标记为罗马数字 Ⅰ/Ⅱ/Ⅲ…
   * 由 `fingering.ts` 推定或由源文件/人工指定。
   */
  position?: number;
  /** 保留源文本（ASCII tab 原文），供教研人工比对 */
  rawText?: string;
  sourceRef?: string;
}

export interface TabProjectTrack {
  id: string;
  name: string;
  instrument: TabInstrument;
  tuning: number[];
  capo: number;
  measures: TabProjectMeasure[];
}

export interface TabProjectWarning {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  measureIndex?: number;
}

export interface TabProjectStats {
  measureCount: number;
  noteCount: number;
  chordCount: number;
  barreCount: number;
  /** 按列位置近似分配节奏的小节数（ASCII tab 常见） */
  approximateRhythmMeasures: number;
  timeSignatureChanges: number;
  durationSec: number;
}

export interface TabProject {
  format: 'guitarmate-tab-project';
  version: '1.0';
  meta: TabProjectMeta;
  /** 主轨调弦（索引 0 = 一弦） */
  tuning: number[];
  capo: number;
  tracks: TabProjectTrack[];
  source: TabProjectSource;
  warnings: TabProjectWarning[];
  stats: TabProjectStats;
}

export const TAB_PROJECT_FORMAT_ID = 'guitarmate-tab-project';
export const TAB_PROJECT_VERSION = '1.0';

/**
 * 发布就绪的小节结构 —— 与 `POST /api/measures/publish` 的 `measures[]` 对齐
 * （音符使用**绝对秒** `audioTime`）。
 */
export interface PublishReadyMeasure {
  index: number;
  label: string;
  startTime: number;
  endTime: number;
  /** 本小节把位（第 P 把位），随音符一起下发到 C 端供谱面标注 */
  position?: number;
  notes: Array<{
    id: string;
    audioTime: number;
    string: number;
    fret: number;
    pitch: number;
    duration: number;
    confidence: number;
    x: number;
    y: number;
    technique?: TabTechnique;
    chordName?: string;
    /** 左手指法：0 = 空弦，1-4 = 食指…小指 */
    finger?: number;
  }>;
  barres: Array<{
    instrument: string;
    fret: number;
    fromString: number;
    toString: number;
    startTime: number;
    duration: number;
    x: number;
    y: number;
  }>;
  chords: Array<{
    instrument: string;
    chordName: string;
    startTime: number;
    duration: number;
    x: number;
    y: number;
    /** 指法图（6 元素，索引 0 = 六弦，-1 = 闷弦）—— 小店序可直接画和弦图 */
    voicing?: number[];
  }>;
  tabImageUrl: string;
}
