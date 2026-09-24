/**
 * 内置示例谱面
 * =============
 *
 * 全部为**自有编配 / 公有领域**素材，不含任何受版权保护的流行歌曲谱面，
 * 因此可以安全地用于演示、回归测试与对外展示。
 *
 * CMS 的「示例」按钮直接把这些文本送进导入框，一键跑通链路：
 * 解析 → 预览 → 保存到曲目 → 发布 → 小程序。
 */

import type { TabSourceFormat } from './tab-project.types';

export interface TabSample {
  id: string;
  label: string;
  format: TabSourceFormat;
  description: string;
  rights: 'public-domain' | 'original-arrangement' | 'user-submission';
  rightsNote: string;
  content: string;
}

/** 示例 1：ASCII 六线谱（自有编配的 Am–C–G–Am 练习曲） */
const ASCII_STUDY = `Title: 练习曲：Am–C–G–Am 分解与旋律
Artist: GuitarMate 教研组
Tempo: 90
Time: 4/4
Tuning: E A D G B E
Capo: 0
Key: A minor

[Verse]
Am              C               G               Am
e|----------------|----------------|----------------|----------------|
B|--------1-------|--------1-------|--------0-------|--------1-------|
G|----2-------2---|----0-------0---|----0-------0---|----2-------2---|
D|2-----------2---|2-----------2---|--------0-------|2-----------2---|
A|0-----------0---|3-----------3---|----------------|0-----------0---|
E|----------------|----------------|3-----------3---|----------------|

[Chorus]
F               G               Am              E7
e|----------------|----------------|----------------|----------------|
B|--------1-------|--------0-------|--------1-------|--------0-------|
G|----2-------2---|----0-------0---|----2-------2---|----1-------1---|
D|3-----------3---|----------------|2-----------2---|----------------|
A|----------------|2-----------2---|0-----------0---|2-----------2---|
E|1-----------1---|3-----------3---|----------------|0-----------0---|
`;

/** 示例 2：和弦表 + 扫弦模式（自有编配的练习进行） */
const CHORD_SHEET = `Title: 练习进行：Bm–F#7–A–E7 / G–D–Em–F#7/C#
Artist: 教研自编
Tempo: 88
Time: 4/4
Capo: 0
Key: B minor
Strum: D D U U D U

[Verse]
Bm | F#7 | A | E7
Bm | F#7 | A | E7

[Chorus]
G | D | Em | F#7/C#
G | D | Em | F#7/C#
`;

/** 示例 3：MusicXML（自有编配，含 <technical><string>/<fret> 与调弦信息） */
const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>示例：两小节六线谱（自有编配）</work-title></work>
  <identification><creator type="composer">GuitarMate 教研组</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Acoustic Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <direction>
        <direction-type>
          <metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome>
        </direction-type>
        <sound tempo="90"/>
      </direction>
      <harmony><root><root-step>A</root-step></root><kind>minor</kind></harmony>
      <note>
        <pitch><step>A</step><octave>2</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>5</string><fret>0</fret></technical></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>2</string><fret>1</fret></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>1</string><fret>0</fret></technical></notations>
      </note>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>3</string><fret>2</fret></technical></notations>
      </note>
    </measure>
    <measure number="2">
      <harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>5</string><fret>3</fret></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>1</string><fret>0</fret></technical></notations>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>1</string><fret>3</fret><bend><bend-alter>2</bend-alter></bend></technical></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <notations><technical><string>2</string><fret>1</fret></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>
`;

/** 示例 4：转录 JSON（SoloTrace 风格，模拟「AI 自动草稿」这条链路） */
const TRANSCRIPTION_JSON = JSON.stringify(
  {
    version: '1.0',
    sourceTool: 'SoloTrace (demo fixture)',
    bpm: 90,
    timeSignature: '4/4',
    notes: [
      { id: 'n1', string: 5, fret: 0, pitch: 45, audioTime: 0.0, duration: 0.9, confidence: 0.95 },
      { id: 'n2', string: 2, fret: 1, pitch: 60, audioTime: 0.667, duration: 0.6, confidence: 0.91 },
      { id: 'n3', string: 1, fret: 0, pitch: 64, audioTime: 1.334, duration: 0.6, confidence: 0.88 },
      { id: 'n4', string: 3, fret: 2, pitch: 57, audioTime: 2.001, duration: 0.6, confidence: 0.74 },
      { id: 'n5', string: 5, fret: 3, pitch: 48, audioTime: 2.668, duration: 0.9, confidence: 0.93 },
      { id: 'n6', string: 1, fret: 0, pitch: 64, audioTime: 3.335, duration: 0.6, confidence: 0.82 },
      { id: 'n7', string: 1, fret: 3, pitch: 67, audioTime: 4.002, duration: 0.6, confidence: 0.58 },
      { id: 'n8', string: 2, fret: 1, pitch: 60, audioTime: 4.669, duration: 0.9, confidence: 0.66 },
    ],
    beatMap: {
      bpm: 90,
      beats: [
        { time: 0, measure: 1, beatInMeasure: 1 },
        { time: 0.667, measure: 1, beatInMeasure: 2 },
        { time: 1.334, measure: 1, beatInMeasure: 3 },
        { time: 2.001, measure: 1, beatInMeasure: 4 },
        { time: 2.668, measure: 2, beatInMeasure: 1 },
        { time: 3.335, measure: 2, beatInMeasure: 2 },
        { time: 4.002, measure: 2, beatInMeasure: 3 },
        { time: 4.669, measure: 2, beatInMeasure: 4 },
      ],
    },
  },
  null,
  2,
);

export const TAB_SAMPLES: TabSample[] = [
  {
    id: 'ascii-study',
    label: 'ASCII 六线谱 · 练习曲（自有编配）',
    format: 'ascii-tab',
    description: '8 小节 Am–C–G–Am / F–G–Am–E7，含和弦行。演示「列位置 → 拍网格」的近似节奏映射。',
    rights: 'original-arrangement',
    rightsNote: 'GuitarMate 教研组自有编配，可自由使用。',
    content: ASCII_STUDY,
  },
  {
    id: 'chord-sheet-demo',
    label: '和弦表 + 扫弦 · Bm–F#7–A–E7（自有编配）',
    format: 'chord-sheet',
    description: '和弦名 + 把位 + 扫弦模式自动展开成六线谱音符，演示节奏吉他种子数据的生成。',
    rights: 'original-arrangement',
    rightsNote: '教研自编的练习进行，非任何歌曲的正式谱面。',
    content: CHORD_SHEET,
  },
  {
    id: 'musicxml-demo',
    label: 'MusicXML · 两小节（自有编配）',
    format: 'musicxml',
    description: '含 divisions / 拍号 / 六线调弦 / <technical>string+fret / harmony 和弦标记。演示精确时值链路。',
    rights: 'original-arrangement',
    rightsNote: 'GuitarMate 教研组自有编配。',
    content: MUSICXML,
  },
  {
    id: 'transcription-demo',
    label: '转录 JSON · SoloTrace 风格（模拟 AI 草稿）',
    format: 'solo-trace',
    description: '带 audioTime / confidence 的音符 + beatMap。演示「Demucs + Basic Pitch 自动草稿」这条链路。',
    rights: 'original-arrangement',
    rightsNote: '虚构的演示数据，不对应任何真实录音。',
    content: TRANSCRIPTION_JSON,
  },
];

export function findSample(id: string): TabSample | undefined {
  return TAB_SAMPLES.find((s) => s.id === id);
}
