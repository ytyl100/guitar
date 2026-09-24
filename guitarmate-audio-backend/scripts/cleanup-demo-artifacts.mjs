/**
 * 清理演示 / 测试留下的曲目与存储目录
 * ====================================
 *
 * 演示（`npm run demo:pipeline --keep`）与端到端测试都会写真实数据：
 * 一批同名的演示曲目、镜像出来的小节、`uploads/transcriptions/*` 音频。
 * 反复跑就会攒出好几份「A 小调练习曲」。本脚本负责把**带标记的曲目**整条删干净。
 *
 * 安全边界：
 * - 只删标题命中 `--match`（默认 `[E2E]` / `demo:` / 内置样品真值里的标题）的曲目，
 *   普通业务曲目一律不碰；
 * - 删之前打印清单，`--dry-run` 可先看一眼；
 * - 连带删除：Track / Measure / 叠加层（Prisma 级联），以及对应 uploads 目录；
 *
 * 用法：
 * ```bash
 * node scripts/cleanup-demo-artifacts.mjs --dry-run   # 先看会删什么
 * node scripts/cleanup-demo-artifacts.mjs             # 真删
 * ```
 */

import { PrismaClient } from '@prisma/client';
import { existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const argValue = (name, fallback) => {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback;
};

/** 默认只清理「一眼能认出来是测试/演示」的标题 */
const MATCHES = (argValue('match', '') || '[E2E],A 小调练习曲（solo + 和弦）')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`\n🧹 清理演示产物${dryRun ? '（dry-run，不会真删）' : ''}`);
console.log(`  标题命中：${MATCHES.join(' | ')}\n`);

const scores = await prisma.score.findMany({
  where: { OR: MATCHES.map((m) => ({ title: { contains: m } })) },
  include: {
    tracks: { select: { id: true, instrument: true } },
    _count: { select: { measures: true } },
  },
});

if (scores.length === 0) {
  console.log('没有匹配的曲目，无需清理。\n');
  await prisma.$disconnect();
  process.exit(0);
}

let deletedMeasures = 0;
for (const score of scores) {
  console.log(`  · ${score.title}  (${score.id})  小节=${score._count.measures} 分轨=${score.tracks.length}`);

  if (dryRun) continue;

  /**
   * 依赖顺序交给 Prisma 的级联：`Score → Track / Measure → MeasureTrack / Barre / ChordMarker`
   * 全是 `onDelete: Cascade`，`Project.scoreId` 与 `PracticePackage.scoreId` 是 `SetNull`，
   * 所以一句 `score.delete` 就能干净移除（音符存在 `MeasureTrack.notes` JSON 里，没有 Notes 表）。
   */
  await prisma.score.delete({ where: { id: score.id } });
  deletedMeasures += score._count.measures;

  for (const dir of ['measures', 'demo']) {
    const path = join(ROOT, 'uploads', dir, score.id);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
}

if (dryRun) {
  console.log('\n这是 dry-run：去掉 --dry-run 才会真正删除。\n');
} else {
  console.log(`\n✅ 删除曲目 ${scores.length} 个 · 小节 ${deletedMeasures} 个\n`);
}

await prisma.$disconnect();
