/**
 * 本地数据 → 后端数据库 迁移脚本
 * ==============================
 *
 * 用途：把 `guitar-ai-audio` 原先存在**浏览器 localStorage / 源码常量**里的业务数据
 * 一次性搬进 `guitarmate-audio-backend` 的数据库。迁移是**幂等**的，可以反复运行。
 *
 * 运行（前端目录下）：
 * ```powershell
 * # 1) 先起后端：cd ..\guitarmate-audio-backend ; node dist\main.js
 * # 2) 迁移（默认 http://localhost:3000）
 * npx tsx scripts/migrate-to-backend.ts
 * #    - 只跑某一部分：npx tsx scripts/migrate-to-backend.ts --only=users
 * #                    可选值：groups,users,videos,drills,courses,library,notifications,creditRequests,leads,pricing,progress
 * #    - 指定后端：GUITARMATE_API=http://127.0.0.1:3000 npx tsx scripts/migrate-to-backend.ts
 * #    - 演练（只打印不写库）：--dry-run
 * #    - 清空重建用户（⚠️ 会级联删掉积分流水/任务进度）：--replace-users
 * #    - 清空重建课程（⚠️ 会清掉运维在库里的改动）：--replace-courses
 * ```
 *
 * ⚠️ 两个刻意的设计：
 * 1. **种子来源放在前端**（`DEMO_USERS` 等常量），迁移脚本只是「搬运工」——
 *    不把演示数据复制到后端源码里，避免两处定义日后漂移（仓库既有约定）。
 * 2. **迁移完前端就不再 import 这些常量**（见 `backendService` 的改造），
 *    常量本身保留仅作离线兜底/类型示例，不再参与运行时数据来源。
 */

import { DEMO_USERS } from '../src/types/auth';
import { INITIAL_COURSES, INITIAL_VIDEOS, INITIAL_DRILLS } from '../src/utils/backendService';
import { INITIAL_LIBRARY_ITEMS } from '../src/data/libraryData';
import { INITIAL_NOTIFICATIONS } from '../src/types/notification';
import { PRICING_PLANS } from '../src/types/pricing';
import {
  INITIAL_CREDIT_RECOVERY_REQUESTS,
  INITIAL_ENTERPRISE_LEADS,
  INITIAL_TASK_PROGRESS,
} from '../src/data/initialOpsData';
import {
  userApi,
  userGroupApi,
  courseApi,
  videoApi,
  drillApi,
  libraryApi,
  notificationApi,
  creditRecoveryApi,
  enterpriseLeadApi,
  pricingPlanApi,
  healthApi,
  API_BASE,
  ApiError,
} from '../src/services/apiClient';

type UserProfileLike = (typeof DEMO_USERS)[string];
type CourseLike = (typeof INITIAL_COURSES)[number];
type VideoLike = (typeof INITIAL_VIDEOS)[number];
type DrillLike = (typeof INITIAL_DRILLS)[number];
type LibraryLike = (typeof INITIAL_LIBRARY_ITEMS)[number];

interface Options {
  only: string[];
  dryRun: boolean;
  replaceUsers: boolean;
  replaceCourses: boolean;
}

function parseArgs(argv: string[]): Options {
  const only: string[] = [];
  let dryRun = false;
  let replaceUsers = false;
  let replaceCourses = false;
  for (const arg of argv) {
    if (arg.startsWith('--only=')) only.push(...arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--replace-users') replaceUsers = true;
    else if (arg === '--replace-courses') replaceCourses = true;
  }
  return { only, dryRun, replaceUsers, replaceCourses };
}

const line = (s = '') => console.log(s);
const ok = (s: string) => console.log(`  ✅ ${s}`);
const warn = (s: string) => console.log(`  ⚠️  ${s}`);
const fail = (s: string) => console.log(`  ❌ ${s}`);

/** 是否要跑某个部分（`--only` 为空 = 全跑） */
const wants = (opts: Options, key: string) => opts.only.length === 0 || opts.only.includes(key);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  line('');
  line('════════════════════════════════════════════════════');
  line(' GuitarMate · 本地数据 → 后端数据库 迁移');
  line('════════════════════════════════════════════════════');
  line(`  后端地址      : ${API_BASE}`);
  line(`  模式          : ${opts.dryRun ? '演练（不写库）' : '实际写入'}`);
  line(`  范围          : ${opts.only.length ? opts.only.join(' / ') : '全部'}`);
  line(`  用户导入策略  : ${opts.replaceUsers ? '清空重建（⚠️ 级联删除流水/进度）' : '幂等 upsert'}`);
  line(`  课程导入策略  : ${opts.replaceCourses ? '清空重建（⚠️ 会清掉运维在库里的改动）' : '幂等 upsert'}`);
  line('');

  // ── 0) 连通性 ──────────────────────────────────────────────
  line('【0】后端连通性');
  try {
    const health = await healthApi.check<any>();
    ok(`/api/health OK${health?.status ? `（status=${health.status}）` : ''}`);
  } catch (err) {
    fail(`连不上后端：${(err as Error).message}`);
    line('');
    line('  请先启动后端：');
    line('    cd ..\\guitarmate-audio-backend');
    line('    node node_modules\\@nestjs\\cli\\bin\\nest.js build');
    line('    node dist\\main.js');
    process.exitCode = 1;
    return;
  }

  // ── 1) 用户组（权限矩阵） ──────────────────────────────────
  let groupCount = 0;
  if (wants(opts, 'groups')) {
    line('');
    line('【1】用户组 / 权限矩阵');
    try {
      const groups = await userGroupApi.list<any[]>();
      groupCount = Array.isArray(groups) ? groups.length : 0;
      ok(`后端已有 ${groupCount} 个内置用户组（由 user-groups.catalog.ts 播种）`);
      for (const g of groups as any[]) {
        line(
          `      · ${String(g.code).padEnd(12)} L${String(g.level).padEnd(2)} ` +
            `credits=${g.isUnlimitedCredits ? 'unlimited' : g.defaultCredits} ` +
            `transcribe=${g.maxTranscriptionSeconds === 0 ? '∞' : g.maxTranscriptionSeconds + 's'} ` +
            `curriculum=${g.curriculumRights} exports=[${(g.exportFormats || []).join(',')}]`,
        );
      }
      if (groupCount === 0) warn('用户组为空 —— 后端 catalog 可能未加载（检查 UsersModule 是否注册）');
    } catch (err) {
      fail(`读取用户组失败：${(err as Error).message}`);
    }
  }

  // ── 2) 用户资料 ────────────────────────────────────────────
  if (wants(opts, 'users')) {
    line('');
    line('【2】用户资料（DEMO_USERS）');
    const demoUsers = Object.values(DEMO_USERS) as UserProfileLike[];
    line(`  源码里共 ${demoUsers.length} 个演示账号`);

    // 迁移前的完整性基线：id / email 必须唯一，否则 upsert 会互相覆盖
    const idSet = new Set(demoUsers.map((u) => u.id));
    const emailSet = new Set(demoUsers.map((u) => u.email));
    if (idSet.size !== demoUsers.length) fail(`id 有重复（${demoUsers.length} → ${idSet.size}），请先修源码`);
    if (emailSet.size !== demoUsers.length) fail(`email 有重复（${demoUsers.length} → ${emailSet.size}），请先修源码`);

    const byRole = demoUsers.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    line(`  角色分布：${Object.entries(byRole).map(([r, n]) => `${r}×${n}`).join('  ')}`);

    if (opts.dryRun) {
      line('  （演练模式：不写库）将导入以下账号：');
      demoUsers.forEach((u) => line(`      · ${u.id}  ${u.name}  <${u.email}>  role=${u.role}  credits=${u.credits}`));
    } else {
      try {
        const res = await userApi.importUsers<any>(demoUsers, opts.replaceUsers);
        ok(`导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
      } catch (err) {
        const e = err as ApiError;
        fail(`导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
        if (e.body) line(`      ${JSON.stringify(e.body).slice(0, 300)}`);
        process.exitCode = 1;
      }
    }
  }

  // ── 3) 课纲 / 教学视频 / 和弦组合（需求 (2)） ──────────────
  if (wants(opts, 'courses') || wants(opts, 'videos') || wants(opts, 'drills')) {
    line('');
    line('【3】课纲 / 教学视频 / 和弦组合（INITIAL_* 常量）');

    // 课纲：章节数 + 内容项数（用来判断「搬过去的是不是同一棵树」）
    const chapterCount = INITIAL_COURSES.reduce((n, c) => n + (c.chapters?.length ?? 0), 0);
    const itemCount = INITIAL_COURSES.reduce(
      (n, c) => n + (c.chapters ?? []).reduce((m, ch) => m + (ch.items?.length ?? 0), 0),
      0,
    );
    const cueCount = INITIAL_VIDEOS.reduce((n, v) => n + (v.cuePoints?.length ?? 0), 0);
    line(
      `  源码里共 ${INITIAL_COURSES.length} 门课程（${chapterCount} 章节 / ${itemCount} 内容项）、` +
        `${INITIAL_VIDEOS.length} 个教学视频（${cueCount} 个打点）、${INITIAL_DRILLS.length} 个和弦组合`,
    );

    // 内容项引用的 videoId / chordDrillId 必须能在库里找到，否则课纲里会出现点不开的死链
    const videoIds = new Set(INITIAL_VIDEOS.map((v) => v.id));
    const drillIds = new Set(INITIAL_DRILLS.map((d) => d.id));
    const dangling: string[] = [];
    for (const c of INITIAL_COURSES) {
      for (const ch of c.chapters ?? []) {
        for (const it of ch.items ?? []) {
          if (it.videoId && !videoIds.has(it.videoId)) dangling.push(`${c.id}/${ch.id}/${it.id} → video ${it.videoId}`);
          if (it.chordDrillId && !drillIds.has(it.chordDrillId)) dangling.push(`${c.id}/${ch.id}/${it.id} → drill ${it.chordDrillId}`);
        }
      }
    }
    dangling.length
      ? warn(`源码里就有 ${dangling.length} 处悬空引用（迁移后会原样保留）：${dangling.slice(0, 3).join('；')}`)
      : ok('课纲内的 videoId / chordDrillId 引用全部有对应记录');

    if (opts.dryRun) {
      line('  （演练模式：不写库）');
      INITIAL_COURSES.forEach((c) =>
        line(`      · ${c.id}  ${c.title}  status=${c.status}  ${c.chapters?.length ?? 0} 章  v=${c.version}`),
      );
      INITIAL_VIDEOS.forEach((v) => line(`      · ${v.id}  ${v.title}  ${v.cuePoints?.length ?? 0} 打点`));
      INITIAL_DRILLS.forEach((d) => line(`      · ${d.id}  ${d.title}  [${(d.chords || []).join(' ')}]`));
    } else {
      // ⚠️ 顺序有讲究：先视频/和弦组合，再课纲。
      // 课纲的内容项会引用 videoId/chordDrillId，反过来没有依赖。
      const steps: Array<{ key: string; label: string; run: () => Promise<{ created: number; updated: number; total: number }> }> = [
        {
          key: 'videos',
          label: '教学视频',
          run: () => videoApi.importVideos<any>(INITIAL_VIDEOS as unknown[], false),
        },
        {
          key: 'drills',
          label: '和弦组合',
          run: () => drillApi.importDrills<any>(INITIAL_DRILLS as unknown[], false),
        },
        {
          key: 'courses',
          label: '课程大纲',
          run: () => courseApi.importCourses<any>(INITIAL_COURSES as unknown[], opts.replaceCourses),
        },
      ];
      for (const step of steps) {
        if (!wants(opts, step.key)) continue;
        try {
          const res = await step.run();
          ok(`${step.label}：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
        } catch (err) {
          const e = err as ApiError;
          fail(`${step.label} 导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
          if (e.body) line(`      ${JSON.stringify(e.body).slice(0, 300)}`);
          process.exitCode = 1;
        }
      }
    }
  }

  // ── 4) 音频乐谱库（需求 (3)） ──────────────────────────────
  if (wants(opts, 'library')) {
    line('');
    line('【4】音频乐谱库（INITIAL_LIBRARY_ITEMS）');

    const scoreShape = (s: any) => ({
      measures: Array.isArray(s?.measures) ? s.measures.length : 0,
      notes: Array.isArray(s?.measures)
        ? s.measures.reduce((n: number, m: any) => n + (m?.notes?.length ?? 0), 0)
        : 0,
    });
    const distinctScores = new Set(INITIAL_LIBRARY_ITEMS.map((i) => i.score?.id));
    line(
      `  源码里共 ${INITIAL_LIBRARY_ITEMS.length} 条（` +
        `${INITIAL_LIBRARY_ITEMS.filter((i) => i.category === 'system').length} 条平台曲库 / ` +
        `${INITIAL_LIBRARY_ITEMS.filter((i) => i.category === 'user').length} 条用户上传），` +
        `共 ${distinctScores.size} 份不同的乐谱`,
    );
    for (const it of INITIAL_LIBRARY_ITEMS) {
      const sh = scoreShape(it.score);
      line(`      · ${it.id.padEnd(18)} ${it.category}/${it.type}  乐谱 ${sh.measures} 小节 / ${sh.notes} 音符`);
    }

    /**
     * 交叉引用匹配：只有**曲名完全相同**才写 `scoreId`。
     *
     * ⚠️ 这里刻意只建立「引用」，**不让前端改读后端那份乐谱** ——
     * 实测同名乐谱内容不同（后端 Macaroon 5 = 86 小节，源码这份 = 30 小节）。
     * 若挂过去当数据源，用户点开练习看到的谱子会当场变样，属于「改变现有功能」。
     * 乐谱本体一概原样存进 `LibraryItem.scoreJson`。
     */
    let scoreRefs = new Map<string, string>();
    try {
      const backendScores = await fetch(`${API_BASE}/api/scores`).then((r) => r.json());
      const byTitle = new Map<string, any>();
      for (const s of backendScores as any[]) byTitle.set(String(s.title).trim(), s);
      const matched: string[] = [];
      const contentDiffers: string[] = [];
      for (const it of INITIAL_LIBRARY_ITEMS) {
        const hit = byTitle.get(String(it.title).trim());
        if (!hit) continue;
        scoreRefs.set(it.id, hit.id);
        matched.push(`${it.id}→${hit.title}`);
        const src = scoreShape(it.score);
        if (hit.measureCount && hit.measureCount !== src.measures) {
          contentDiffers.push(`${it.id}（库 ${hit.measureCount} 小节 vs 源码 ${src.measures} 小节）`);
        }
      }
      matched.length
        ? ok(`与后端已发布乐谱同名的 ${matched.length} 条，已建立交叉引用：${matched.join('；')}`)
        : warn('没有任何条目的曲名与后端已有乐谱完全相同（全部只存 scoreJson）');
      if (contentDiffers.length) {
        warn(
          `⚠️ 同名但内容不同（所以前端仍读 scoreJson，不读后端乐谱）：${contentDiffers.join('；')}`,
        );
      }
    } catch (err) {
      warn(`读取 /api/scores 失败，本次不建立 scoreId 引用：${(err as Error).message}`);
    }

    if (opts.dryRun) {
      line('  （演练模式：不写库）');
    } else {
      const payload = INITIAL_LIBRARY_ITEMS.map((it) => ({
        ...it,
        scoreId: scoreRefs.get(it.id),
      }));
      try {
        const res = await libraryApi.importItems<any>(payload as unknown[], false);
        ok(`曲库导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
        if (res.skippedScores?.length) warn(`以下 scoreId 在后端不存在，已忽略：${res.skippedScores.join(', ')}`);
      } catch (err) {
        const e = err as ApiError;
        fail(`曲库导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
        if (e.body) line(`      ${JSON.stringify(e.body).slice(0, 300)}`);
        process.exitCode = 1;
      }
    }
  }

  // ── 5) 运营数据（需求 (4)：通知 / 积分工单 / 企业线索 / 定价方案 / 任务进度） ──
  if (
    wants(opts, 'notifications') ||
    wants(opts, 'creditRequests') ||
    wants(opts, 'leads') ||
    wants(opts, 'pricing') ||
    wants(opts, 'progress')
  ) {
    line('');
    line('【5】运营数据（通知 / 积分恢复工单 / 企业线索 / 定价方案 / 学员任务进度）');

    const demoUsers = Object.values(DEMO_USERS) as UserProfileLike[];

    if (wants(opts, 'notifications')) {
      line(`  通知：源码里 ${INITIAL_NOTIFICATIONS.length} 条（${INITIAL_NOTIFICATIONS.filter((n) => !n.isRead).length} 条未读）`);
      if (!opts.dryRun) {
        try {
          const res = await notificationApi.importItems<any>(INITIAL_NOTIFICATIONS as unknown[], false);
          ok(`通知导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
        } catch (err) {
          const e = err as ApiError;
          fail(`通知导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
          process.exitCode = 1;
        }
      }
    }

    if (wants(opts, 'creditRequests')) {
      line(`  积分恢复工单：源码里 ${INITIAL_CREDIT_RECOVERY_REQUESTS.length} 条（演示默认值，原先写在 getter 内部）`);
      INITIAL_CREDIT_RECOVERY_REQUESTS.forEach((r) =>
        line(`      · ${r.id}  ${r.userName}  申请 ${r.requestedAmount} 点  状态=${r.status}  ${r.createdAt}`),
      );
      if (!opts.dryRun) {
        try {
          const res = await creditRecoveryApi.importItems<any>(INITIAL_CREDIT_RECOVERY_REQUESTS as unknown[], false);
          ok(`工单导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
          if (res.missingUsers?.length) warn(`以下工单指向的用户不存在，已跳过：${res.missingUsers.join(', ')}`);
        } catch (err) {
          const e = err as ApiError;
          fail(`工单导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
          process.exitCode = 1;
        }
      }
    }

    if (wants(opts, 'leads')) {
      line(`  企业线索：源码里 ${INITIAL_ENTERPRISE_LEADS.length} 条`);
      if (!opts.dryRun) {
        try {
          const res = await enterpriseLeadApi.importItems<any>(INITIAL_ENTERPRISE_LEADS as unknown[], false);
          ok(`线索导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
        } catch (err) {
          const e = err as ApiError;
          fail(`线索导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
          process.exitCode = 1;
        }
      }
    }

    if (wants(opts, 'pricing')) {
      line(`  定价方案：源码里 ${PRICING_PLANS.length} 档（${PRICING_PLANS.map((p) => p.id).join(' / ')}）`);
      if (!opts.dryRun) {
        try {
          const res = await pricingPlanApi.importPlans<any>(PRICING_PLANS as unknown[], false);
          ok(`定价方案导入完成：新增 ${res.created} / 更新 ${res.updated}（共 ${res.total}）`);
        } catch (err) {
          const e = err as ApiError;
          fail(`定价方案导入失败：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
          if (e.body) line(`      ${JSON.stringify(e.body).slice(0, 300)}`);
          process.exitCode = 1;
        }
      }
    }

    if (wants(opts, 'progress')) {
      const items = Object.keys(INITIAL_TASK_PROGRESS);
      line(
        `  学员任务进度：演示默认值 ${items.length} 项（${items.join(', ')}）` +
          ` → 将为 ${demoUsers.length} 个演示账号各写一份（行为与迁移前一致）`,
      );
      if (opts.dryRun) {
        line(`      （演练模式：不写库）`);
      } else {
        let written = 0;
        let failed = 0;
        for (const u of demoUsers) {
          for (const itemId of items) {
            try {
              await userApi.setTaskCompleted(u.id, itemId, true);
              written++;
            } catch {
              failed++;
            }
          }
        }
        failed
          ? warn(`任务进度写入完成，但 ${failed} 条失败（多为账号不存在）`)
          : ok(`任务进度写入完成：${written} 条（${demoUsers.length} 账号 × ${items.length} 项）`);
      }
    }
  }

  // ── 6) 回读校验（用户） ────────────────────────────────────
  if (!opts.dryRun && wants(opts, 'users')) {
    line('');
    line('【6】回读校验 · 用户（数据库 → 前端形状）');
    try {
      const rows = await userApi.list<any[]>();
      const demoUsers = Object.values(DEMO_USERS) as UserProfileLike[];
      ok(`库中用户数 = ${rows.length}（源 = ${demoUsers.length}）`);
      const missing = demoUsers.filter((u) => !rows.some((r: any) => r.id === u.id));
      if (missing.length) {
        fail(`缺失 ${missing.length} 个账号：${missing.map((m) => m.id).join(', ')}`);
        process.exitCode = 1;
      } else {
        ok('全部账号 id 一一对应（迁移未丢人）');
      }
      // 抽查字段：积分 / 角色 / 机构归属
      const sample = rows.find((r: any) => r.role === 'teacher') || rows[0];
      if (sample) {
        const src = demoUsers.find((u) => u.id === sample.id);
        const same = src ? src.credits === sample.credits && src.role === sample.role : true;
        same
          ? ok(`抽查 ${sample.id}：role=${sample.role} credits=${sample.credits} 与源码一致`)
          : warn(`抽查 ${sample.id}：库内 role=${sample.role}/credits=${sample.credits}，源码 role=${src?.role}/credits=${src?.credits}`);
      }
    } catch (err) {
      fail(`回读失败：${(err as Error).message}`);
    }
  }

  if (!opts.dryRun && (wants(opts, 'courses') || wants(opts, 'videos') || wants(opts, 'drills'))) {
    line('');
    line('【7】回读校验 · 课纲域（逐条对比字段，而不只是数数）');
    try {
      const [courses, videos, drills] = await Promise.all([
        courseApi.list<any[]>(),
        videoApi.list<any[]>(),
        drillApi.list<any[]>(),
      ]);

      // —— 课程：id 齐全 + 章节树深度一致 + 版本/状态一致
      const missCourses = INITIAL_COURSES.filter((c) => !courses.some((r: any) => r.id === c.id));
      missCourses.length
        ? fail(`库中缺 ${missCourses.length} 门课程：${missCourses.map((c) => c.id).join(', ')}`)
        : ok(`课程 id 全部对上（${courses.length} 门）`);

      let mismatched = 0;
      for (const src of INITIAL_COURSES as CourseLike[]) {
        const row = courses.find((r: any) => r.id === src.id);
        if (!row) continue;
        const sameChapters = (row.chapters?.length ?? 0) === (src.chapters?.length ?? 0);
        const sameItems =
          JSON.stringify((row.chapters ?? []).map((ch: any) => (ch.items ?? []).length)) ===
          JSON.stringify((src.chapters ?? []).map((ch) => (ch.items ?? []).length));
        const sameMeta = row.status === src.status && row.version === src.version && row.title === src.title;
        if (!sameChapters || !sameItems || !sameMeta) {
          mismatched++;
          fail(
            `${src.id}：「${src.title}」不一致 —— ` +
              `章节 ${row.chapters?.length ?? 0}/${src.chapters?.length ?? 0}，` +
              `状态 ${row.status}/${src.status}，版本 ${row.version}/${src.version}`,
          );
        }
      }
      mismatched === 0 && ok(`全部 ${INITIAL_COURSES.length} 门课程的章节/内容项/状态/版本与源码一致`);

      // —— 视频：打点数 + 视频源类型
      const missVideos = INITIAL_VIDEOS.filter((v) => !videos.some((r: any) => r.id === v.id));
      missVideos.length
        ? fail(`库中缺 ${missVideos.length} 个视频：${missVideos.map((v) => v.id).join(', ')}`)
        : ok(`教学视频 id 全部对上（${videos.length} 个）`);
      const cueMismatch = (INITIAL_VIDEOS as VideoLike[]).filter((src) => {
        const row = videos.find((r: any) => r.id === src.id);
        return row ? (row.cuePoints?.length ?? 0) !== (src.cuePoints?.length ?? 0) : false;
      });
      cueMismatch.length
        ? fail(`打点数不一致：${cueMismatch.map((v) => v.id).join(', ')}`)
        : ok('全部视频的打点数与源码一致');

      // —— 和弦组合：和弦列表 + BPM 阶梯
      const missDrills = INITIAL_DRILLS.filter((d) => !drills.some((r: any) => r.id === d.id));
      missDrills.length
        ? fail(`库中缺 ${missDrills.length} 个和弦组合：${missDrills.map((d) => d.id).join(', ')}`)
        : ok(`和弦组合 id 全部对上（${drills.length} 个）`);
      const drillMismatch = (INITIAL_DRILLS as DrillLike[]).filter((src) => {
        const row = drills.find((r: any) => r.id === src.id);
        if (!row) return false;
        return (
          JSON.stringify(row.chords) !== JSON.stringify(src.chords) ||
          JSON.stringify(row.steps) !== JSON.stringify(src.steps) ||
          row.bpmTarget !== src.bpmTarget
        );
      });
      drillMismatch.length
        ? fail(`和弦/BPM 不一致：${drillMismatch.map((d) => d.id).join(', ')}`)
        : ok('全部和弦组合的和弦列表 / BPM 阶梯与源码一致');
    } catch (err) {
      fail(`回读失败：${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  // ── 7) 回读校验 · 曲库（乐谱本体必须逐字节一致） ────────────
  if (!opts.dryRun && wants(opts, 'library')) {
    line('');
    line('【8】回读校验 · 曲库（乐谱 JSON 逐条深度对比）');
    try {
      const rows = await libraryApi.list<any[]>();

      const missing = INITIAL_LIBRARY_ITEMS.filter((it) => !rows.some((r: any) => r.id === it.id));
      missing.length
        ? fail(`库中缺 ${missing.length} 条：${missing.map((m) => m.id).join(', ')}`)
        : ok(`曲库 id 全部对上（${rows.length} 条）`);

      /**
       * 最强的一条断言：把库里的 `score` 与源码里的 `score` 做**深度相等**比较。
       * 只要有一个音符/一个小节/一个调号对不上，这里就会报出来 ——
       * 乐谱是这整个系统最不能出错的数据，数数级别的校验是不够的。
       */
      const scoreMismatch = (INITIAL_LIBRARY_ITEMS as LibraryLike[]).filter((src) => {
        const row = rows.find((r: any) => r.id === src.id);
        if (!row) return false;
        return JSON.stringify(row.score) !== JSON.stringify(src.score);
      });
      scoreMismatch.length
        ? fail(`乐谱本体不一致：${scoreMismatch.map((s) => s.id).join(', ')}`)
        : ok(`全部 ${INITIAL_LIBRARY_ITEMS.length} 条的乐谱本体与源码**深度相等**（小节/音符/调号/打点全一致）`);

      // 展示层字段：分类、解锁状态、收藏、日期、徽标
      const metaMismatch = (INITIAL_LIBRARY_ITEMS as LibraryLike[]).filter((src) => {
        const row = rows.find((r: any) => r.id === src.id);
        if (!row) return false;
        return (
          row.title !== src.title ||
          row.category !== src.category ||
          row.type !== src.type ||
          row.tempo !== src.tempo ||
          row.keySignature !== src.keySignature ||
          row.capo !== src.capo ||
          row.createdAt !== src.createdAt ||
          !!row.isFavorite !== !!src.isFavorite ||
          JSON.stringify(row.badges) !== JSON.stringify(src.badges)
        );
      });
      metaMismatch.length
        ? fail(`展示字段不一致：${metaMismatch.map((s) => s.id).join(', ')}`)
        : ok('标题/分类/解锁状态/速度/调号/变调夹/创建日期/收藏/徽标全部一致');

      const stats = await libraryApi.stats<any>();
      line(
        `  库内统计：共 ${stats.total} 条（平台 ${stats.system} / 用户 ${stats.user}），` +
          `收藏 ${stats.favorites}，已关联已发布乐谱 ${stats.linkedToScore} 条`,
      );
      const dist = Object.entries(stats.byInstrument || {})
        .map(([k, v]) => `${k}×${v}`)
        .join('  ');
      line(`  乐器分布：${dist}`);
    } catch (err) {
      fail(`回读失败：${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  // ── 9) 回读校验 · 运营域 ───────────────────────────────────
  if (
    !opts.dryRun &&
    (wants(opts, 'notifications') || wants(opts, 'creditRequests') || wants(opts, 'leads') || wants(opts, 'pricing') || wants(opts, 'progress'))
  ) {
    line('');
    line('【9】回读校验 · 运营域');
    try {
      if (wants(opts, 'notifications')) {
        const rows = await notificationApi.list<any[]>();
        const miss = INITIAL_NOTIFICATIONS.filter((n) => !rows.some((r: any) => r.id === n.id));
        miss.length
          ? fail(`库中缺 ${miss.length} 条通知：${miss.map((m) => m.id).join(', ')}`)
          : ok(`通知 id 全部对上（库 ${rows.length} 条）`);
        const unread = await notificationApi.unreadCount<{ unread: number }>();
        const srcUnread = INITIAL_NOTIFICATIONS.filter((n) => !n.isRead).length;
        unread.unread >= srcUnread
          ? ok(`未读数 = ${unread.unread}（源码里 ${srcUnread} 条未读，库里不应少）`)
          : warn(`未读数 = ${unread.unread}，少于源码里的 ${srcUnread} 条未读 —— 检查是否有人读过`);
      }

      if (wants(opts, 'creditRequests')) {
        const rows = await creditRecoveryApi.list<any[]>();
        const miss = INITIAL_CREDIT_RECOVERY_REQUESTS.filter((r) => !rows.some((x: any) => x.id === r.id));
        miss.length
          ? fail(`库中缺 ${miss.length} 条工单：${miss.map((m) => m.id).join(', ')}`)
          : ok(`工单 id 全部对上（库 ${rows.length} 条）`);
        const src = INITIAL_CREDIT_RECOVERY_REQUESTS[0];
        const row = rows.find((r: any) => r.id === src.id);
        if (row) {
          row.reason === src.reason && row.createdAt === src.createdAt && row.currentCredits === src.currentCredits
            ? ok(`抽查 ${src.id}：申请说明 / 申请时间(${row.createdAt}) / 当时余额(${row.currentCredits}) 与源码一致`)
            : warn(`抽查 ${src.id} 有字段不同：${JSON.stringify({ reason: row.reason === src.reason, createdAt: `${row.createdAt}/${src.createdAt}`, credits: `${row.currentCredits}/${src.currentCredits}` })}`);
        }
        const pending = await creditRecoveryApi.pendingCount<{ pending: number }>();
        line(`  待审批工单：${pending.pending} 条`);
      }

      if (wants(opts, 'leads')) {
        const rows = await enterpriseLeadApi.list<any[]>();
        const miss = INITIAL_ENTERPRISE_LEADS.filter((l) => !rows.some((r: any) => r.id === l.id));
        miss.length
          ? fail(`库中缺 ${miss.length} 条线索：${miss.map((m) => m.id).join(', ')}`)
          : ok(`线索 id 全部对上（库 ${rows.length} 条）`);
        const src = INITIAL_ENTERPRISE_LEADS[0];
        const row = rows.find((r: any) => r.id === src.id);
        if (row) {
          JSON.stringify(row.useCases) === JSON.stringify(src.useCases) && row.status === src.status
            ? ok(`抽查 ${src.id}：使用场景数组 / 状态(${row.status}) 与源码一致`)
            : fail(`抽查 ${src.id}：useCases 或 status 不一致`);
        }
        const stats = await enterpriseLeadApi.stats<any>();
        line(`  线索统计：共 ${stats.total} 条，${Object.entries(stats.byStatus || {}).map(([k, v]) => `${k}×${v}`).join('  ')}`);
      }

      if (wants(opts, 'pricing')) {
        const rows = await pricingPlanApi.list<any[]>();
        const miss = PRICING_PLANS.filter((p) => !rows.some((r: any) => r.id === p.id));
        miss.length
          ? fail(`库中缺 ${miss.length} 个定价方案：${miss.map((m) => m.id).join(', ')}`)
          : ok(`定价方案 id 全部对上（${rows.length} 档）`);
        // 逐字段对比：权益写错一个词，用户就会按错的理解付费
        const mismatch = PRICING_PLANS.filter((src) => {
          const row = rows.find((r: any) => r.id === src.id);
          if (!row) return false;
          return (
            row.title !== src.title ||
            row.priceMonthly !== src.priceMonthly ||
            row.priceYearly !== src.priceYearly ||
            row.priceMonthlyNum !== src.priceMonthlyNum ||
            row.monthlyCredits !== src.monthlyCredits ||
            row.maxSingleTranscriptionDuration !== src.maxSingleTranscriptionDuration ||
            row.exportFormats !== src.exportFormats ||
            row.curriculumAccess !== src.curriculumAccess ||
            row.ctaText !== src.ctaText ||
            !!row.isPopular !== !!src.isPopular
          );
        });
        mismatch.length
          ? fail(`定价字段不一致：${mismatch.map((m) => m.id).join(', ')}`)
          : ok('价格/额度/权益/导出格式/CTA 全部与源码一致');
        line(`  展示顺序：${rows.map((r: any) => r.id).join(' → ')}（应与定价页从上到下一致）`);
      }

      if (wants(opts, 'progress')) {
        const items = Object.keys(INITIAL_TASK_PROGRESS);
        const demoUsers = Object.values(DEMO_USERS) as UserProfileLike[];
        let checked = 0;
        let missing = 0;
        for (const u of demoUsers) {
          const progress = await userApi.taskProgress<Record<string, boolean>>(u.id);
          checked++;
          for (const itemId of items) {
            if (progress[itemId] !== true) {
              missing++;
              if (missing <= 3) fail(`${u.id} 的进度缺 ${itemId}（拿到 ${JSON.stringify(progress)}）`);
            }
          }
        }
        missing === 0
          ? ok(`全部 ${checked} 个账号的 ${items.length} 项进度都在库里（与迁移前的兜底默认值一致）`)
          : fail(`共 ${missing} 项进度缺失`);
      }
    } catch (err) {
      fail(`回读失败：${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  line('');
  line('════════════════════════════════════════════════════');
  line(` 结束（用户组 ${groupCount} 个）${process.exitCode ? ' —— 有失败项，请查看上面的 ❌' : ' —— 全部通过'}`);
  line('  ⚠️ 迁移只负责「把数据搬过去」。任何一项如果出现 ❌，说明**前端还在依赖本地数据**，');
  line('     请先修好再继续 —— 带着半迁移状态上线，表现是「有的人看得到、有的人看不到」。');
  line('════════════════════════════════════════════════════');
  line('');
}

main().catch((err) => {
  console.error('迁移脚本异常终止：', err);
  process.exitCode = 1;
});
