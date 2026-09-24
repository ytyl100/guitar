#!/usr/bin/env node
/**
 * 生成一个最小的 .gpx 测试样本（ZIP + Content/score.gpif）
 * ========================================================
 *
 * 用途：验证 `src/tab-import/parsers/guitar-pro.parser.ts` 里
 * 「ZIP 读取 + GPIF XML 解析」链路真的能跑通（不需要真实 Guitar Pro 文件）。
 *
 * 用法：
 *   node scripts/make-gpx-fixture.mjs            → samples/tab/gpx-demo.gpx
 *   node scripts/make-gpx-fixture.mjs out.gpx
 *
 * 样本内容为**自有编配**的两小节吉他谱（Am → C），不含任何版权素材。
 */

import { deflateRawSync } from 'zlib';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const GPIF = `<?xml version="1.0" encoding="utf-8"?>
<GPIF>
  <GPIFVersion>1.0</GPIFVersion>
  <Score>
    <Title>GPX 示例：Am–C 两小节（自有编配）</Title>
    <Artist>GuitarMate 教研组</Artist>
    <MasterTrack>
      <Automations>
        <Automation>
          <Type>Tempo</Type>
          <Value>96</Value>
          <RatioPosition>0</RatioPosition>
        </Automation>
      </Automations>
    </MasterTrack>
    <MasterBars>
      <MasterBar id="0"><Time>4/4</Time><Section><Text>Intro</Text></Section></MasterBar>
      <MasterBar id="1"><Time>4/4</Time></MasterBar>
    </MasterBars>
    <Rhythms>
      <Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>
      <Rhythm id="1"><NoteValue>Eighth</NoteValue></Rhythm>
      <Rhythm id="2"><NoteValue>Half</NoteValue></Rhythm>
    </Rhythms>
    <Tracks>
      <Track id="1">
        <Name>Steel Guitar</Name>
        <Staves>
          <Staff>
            <Properties>
              <Property name="Tuning"><Pitches>64 59 55 50 45 40</Pitches></Property>
              <Property name="Capo"><Fret>0</Fret></Property>
            </Properties>
            <Bars>
              <Bar id="0">
                <Voices>
                  <Voice>
                    <Beats>
                      <Beat id="0"><Rhythm ref="2"/><Notes>
                        <Note id="0"><Properties><Property name="String"><Number>5</Number></Property><Property name="Fret"><Number>0</Number></Property></Properties></Note>
                        <Note id="1"><Properties><Property name="String"><Number>3</Number></Property><Property name="Fret"><Number>2</Number></Property></Properties></Note>
                        <Note id="2"><Properties><Property name="String"><Number>2</Number></Property><Property name="Fret"><Number>1</Number></Property></Properties></Note>
                        <Note id="3"><Properties><Property name="String"><Number>1</Number></Property><Property name="Fret"><Number>0</Number></Property></Properties></Note>
                      </Notes></Beat>
                      <Beat id="1"><Rhythm ref="2"/><Notes>
                        <Note id="4"><Properties><Property name="String"><Number>4</Number></Property><Property name="Fret"><Number>2</Number></Property></Properties></Note>
                        <Note id="5"><Properties><Property name="String"><Number>1</Number></Property><Property name="Fret"><Number>0</Number></Property></Properties></Note>
                      </Notes></Beat>
                    </Beats>
                  </Voice>
                </Voices>
              </Bar>
              <Bar id="1">
                <Voices>
                  <Voice>
                    <Beats>
                      <Beat id="0"><Rhythm ref="0"/><Notes>
                        <Note id="0"><Properties><Property name="String"><Number>5</Number></Property><Property name="Fret"><Number>3</Number></Property></Properties></Note>
                        <Note id="1"><Properties><Property name="String"><Number>2</Number></Property><Property name="Fret"><Number>1</Number></Property></Properties></Note>
                      </Notes></Beat>
                      <Beat id="1"><Rhythm ref="1"/><Notes>
                        <Note id="2"><Properties><Property name="String"><Number>1</Number></Property><Property name="Fret"><Number>3</Number></Property></Properties></Note>
                      </Notes></Beat>
                      <Beat id="2"><Chord/><Rhythm ref="1"/><Notes>
                        <Note id="3"><Properties><Property name="String"><Number>3</Number></Property><Property name="Fret"><Number>0</Number></Property></Properties></Note>
                      </Notes></Beat>
                      <Beat id="3"><Rhythm ref="2"/><Notes>
                        <Note id="4"><Properties><Property name="String"><Number>1</Number></Property><Property name="Fret"><Number>0</Number></Property></Properties></Note>
                      </Notes></Beat>
                    </Beats>
                  </Voice>
                </Voices>
              </Bar>
            </Bars>
          </Staff>
        </Staves>
      </Track>
    </Tracks>
  </Score>
</GPIF>
`;

// ── 最小 ZIP 写入（deflate + 中央目录） ──────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

const target = resolve(process.argv[2] || join('samples', 'tab', 'gpx-demo.gpx'));
const entryName = Buffer.from('Content/score.gpif', 'utf8');
const raw = Buffer.from(GPIF, 'utf8');
const deflated = deflateRawSync(raw);
const crc = crc32(raw);

const localHeader = Buffer.alloc(30);
localHeader.writeUInt32LE(0x04034b50, 0);
localHeader.writeUInt16LE(20, 4);
localHeader.writeUInt16LE(0, 6);
localHeader.writeUInt16LE(8, 8); // deflate
localHeader.writeUInt32LE(crc, 14);
localHeader.writeUInt32LE(deflated.length, 18);
localHeader.writeUInt32LE(raw.length, 22);
localHeader.writeUInt16LE(entryName.length, 26);

const dataOffset = localHeader.length + entryName.length;

const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4);
central.writeUInt16LE(20, 6);
central.writeUInt16LE(8, 10);
central.writeUInt32LE(crc, 16);
central.writeUInt32LE(deflated.length, 20);
central.writeUInt32LE(raw.length, 24);
central.writeUInt16LE(entryName.length, 28);
central.writeUInt32LE(0, 42); // relative offset of local header

const centralSize = central.length + entryName.length;

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(1, 8);
eocd.writeUInt16LE(1, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(dataOffset + deflated.length, 16);

const zip = Buffer.concat([localHeader, entryName, deflated, central, entryName, eocd]);

if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, zip);

console.log(`✅ 已生成 GPX 测试样本：${target} (${zip.length} bytes, gpif ${raw.length} bytes)`);
console.log(`   验证：npm run tab:import -- "${target}" --print`);
