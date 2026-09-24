#!/usr/bin/env tsx
/**
 * 六线谱导入 CLI
 * ==============
 *
 * 用法（在 guitarmate-audio-backend 目录下执行）：
 *
 * ```bash
 * npm run tab:import -- samples/tab/study.ascii.txt --out build/study.tabproject.json
 * npm run tab:import -- song.musicxml --format musicxml
 * npm run tab:import -- song.gpx --print
 * npm run tab:import -- --sample ascii-study
 * npm run tab:verify
 * ```
 *
 * 与 HTTP 接口 `POST /api/tab-import/parse` 调用的是**同一套解析器**，
 * 因此离线转换结果与 CMS 里导入的结果完全一致。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { detectTextFormat, parseTabInput, SUPPORTED_FORMATS } from '../src/tab-import/parsers';
import { projectMeasureToAscii, projectToPublishMeasures } from '../src/tab-import/tab-project.utils';
import { TAB_SAMPLES } from '../src/tab-import/tab-samples';
import { copyrightHint } from '../src/tab-import/tab-sources.catalog';

interface CliArgs {
  file?: string;
  sampleId?: string;
  format?: string;
  out?: string;
  print: boolean;
  bpm?: number;
  title?: string;
  rights?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { print: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') args.format = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--print') args.print = true;
    else if (a === '--bpm') args.bpm = parseInt(argv[++i], 10);
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--rights') args.rights = argv[++i];
    else if (a === '--sample') args.sampleId = argv[++i];
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

function describe(project: any, publishMeasures: any, label: string): void {
  const d = project.stats;
  const hint = copyrightHint(project.meta.title);
  console.log('');
  console.log('─'.repeat(72));
  console.log(`📄 ${label}`);
  console.log('─'.repeat(72));
  console.log(`  格式        : ${project.source.kind}`);
  console.log(`  曲名 / 作者 : ${project.meta.title}${project.meta.artist ? ' — ' + project.meta.artist : ''}`);
  console.log(`  BPM / 拍号  : ${project.meta.bpm} / ${project.meta.timeSignature}`);
  console.log(`  调弦 / 变调 : ${project.tuning.join(' ')} (capo ${project.capo})`);
  console.log(`  小节 / 音符 : ${d.measureCount} / ${d.noteCount}`);
  console.log(`  和弦 / 横按 : ${d.chordCount} / ${publishMeasures.reduce((s: number, m: any) => s + m.barres.length, 0)}`);
  console.log(`  时长        : ${d.durationSec}s`);
  console.log(`  发布小节数  : ${publishMeasures.length}`);
  console.log(`  版权        : ${hint.tier} — ${hint.reason}`);
  if (project.warnings?.length) {
    console.log('  ⚠️  警告:');
    for (const w of project.warnings) {
      console.log(`      [${w.level}] ${w.code}: ${w.message.split('\n')[0]}`);
    }
  }
  const m0 = project.tracks[0]?.measures?.[0];
  if (m0) {
    console.log('  第 1 小节 ASCII 预览:');
    console.log(
      projectMeasureToAscii(m0)
        .split('\n')
        .map((l: string) => '      ' + l)
        .join('\n'),
    );
  }
}

function runFile(args: CliArgs): number {
  let content: string;
  let buffer: Buffer | undefined;
  let fileName: string;
  let format = args.format as any;

  if (args.sampleId) {
    const sample = TAB_SAMPLES.find((s) => s.id === args.sampleId);
    if (!sample) {
      console.error(`❌ 找不到示例 ${args.sampleId}。可用：${TAB_SAMPLES.map((s) => s.id).join(', ')}`);
      return 1;
    }
    content = sample.content;
    fileName = `${sample.id}.txt`;
    format = format || sample.format;
  } else if (args.file) {
    const path = resolve(args.file);
    if (!existsSync(path)) {
      console.error(`❌ 文件不存在：${path}`);
      return 1;
    }
    const raw = readFileSync(path);
    fileName = path.split(/[/\\]/).pop() || 'input';
    buffer = raw;
    content = raw.toString('utf8');
    if (!format && !/\.(gpx|gp3|gp4|gp5)$/i.test(fileName)) {
      format = detectTextFormat(content);
    }
  } else {
    console.error('用法: npm run tab:import -- <file> [--format x] [--out y] [--print]');
    console.error('      npm run tab:import -- --sample ascii-study');
    return 1;
  }

  let project;
  try {
    project = parseTabInput({
      content,
      buffer,
      format,
      fileName,
      bpm: args.bpm,
      title: args.title,
      rights: (args.rights as any) || 'unknown',
    });
  } catch (err: any) {
    console.error(`❌ 解析失败：${err.message}`);
    return 1;
  }

  const publishMeasures = projectToPublishMeasures(project);
  describe(project, publishMeasures, fileName);

  if (args.out) {
    const outPath = resolve(args.out);
    if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(project, null, 2), 'utf-8');
    console.log(`\n✅ TabProject 已写入：${outPath}`);
    console.log('   下一步：POST /api/tab-import/save（把 project 字段贴进去）→ 再 POST /api/measures/publish 发布到小程序');
  } else if (args.print) {
    console.log('\n' + JSON.stringify({ format: project.format, stats: project.stats }, null, 2));
  }

  return 0;
}

function runVerify(): number {
  console.log('🧪 解析器回归测试（内置示例）');
  console.log(`已注册格式：${SUPPORTED_FORMATS.map((f) => f.format).join(', ')}`);

  let failed = 0;
  for (const sample of TAB_SAMPLES) {
    try {
      const project = parseTabInput({
        content: sample.content,
        format: sample.format,
        fileName: `${sample.id}.txt`,
        rights: sample.rights,
        rightsNote: sample.rightsNote,
      });
      const measures = projectToPublishMeasures(project);
      const noteCount = measures.reduce((s, m) => s + m.notes.length, 0);
      const barreCount = measures.reduce((s, m) => s + m.barres.length, 0);
      const chordMarkers = measures.reduce((s, m) => s + m.chords.length, 0);
      const ok = measures.length > 0 && noteCount > 0;
      if (!ok) failed++;
      console.log(
        `${ok ? '✅' : '❌'} ${sample.id.padEnd(20)} format=${String(project.source.kind).padEnd(11)} ` +
          `小节=${String(project.stats.measureCount).padStart(3)} 音符=${String(noteCount).padStart(4)} ` +
          `和弦标记=${String(chordMarkers).padStart(2)} 横按标记=${String(barreCount).padStart(2)} ` +
          `时长=${project.stats.durationSec}s`,
      );

      // 音高自洽性：midi 必须 = 空弦 + 品 + capo
      const bad = measures.flatMap((m) => m.notes).filter((n) => {
        const open = project.tuning[n.string - 1];
        return open === undefined || open + n.fret + project.capo !== n.pitch;
      });
      if (bad.length > 0) {
        failed++;
        console.log(
          `   ❌ ${bad.length} 个音符的音高与弦/品不一致（例：string=${bad[0].string} fret=${bad[0].fret} pitch=${bad[0].pitch}）`,
        );
      }

      // 小节时间单调
      const times = measures.map((m) => m.startTime);
      if (!times.every((t, i) => i === 0 || t >= times[i - 1])) {
        failed++;
        console.log('   ❌ 小节起始时间不是单调递增的');
      }

      // 小节内音符按时间递增（C 端 useScrollSync / PracticeMeasure 依赖该顺序）
      const unsorted = measures.filter((m) =>
        m.notes.some((n, i) => i > 0 && n.audioTime < m.notes[i - 1].audioTime - 1e-6),
      );
      if (unsorted.length > 0) {
        failed++;
        console.log(`   ❌ ${unsorted.length} 个小节的音符不是按时间递增`);
      }

      // 归一化坐标必须在 0-1
      const outOfRange = measures
        .flatMap((m) => m.notes)
        .filter((n) => n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1);
      if (outOfRange.length > 0) {
        failed++;
        console.log(`   ❌ ${outOfRange.length} 个音符的归一化坐标越界`);
      }
    } catch (err: any) {
      failed++;
      console.log(`❌ ${sample.id.padEnd(20)} 解析抛错：${err.message}`);
    }
  }

  console.log('');
  if (failed === 0) {
    console.log('🎉 全部示例通过：解析器 → 发布结构（弦/品/音高/时间/坐标）自洽。');
  } else {
    console.log(`💥 ${failed} 项校验失败。`);
  }
  return failed === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes('--verify')) {
  process.exit(runVerify());
}
process.exit(runFile(parseArgs(argv)));
