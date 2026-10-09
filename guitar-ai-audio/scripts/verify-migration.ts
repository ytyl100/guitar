/**
 * 迁移结果完整性校验（P5）
 * ==========================
 *
 * 迁移脚本 `migrate-to-backend.ts` 负责「搬」，这个脚本负责「验收」：
 * 它**只读**，不改任何数据，可以随时反复跑。
 *
 * 检查四类问题（都是"数据看着在、其实已经坏了"的经典形态）：
 *
 * 1. **数量对不上** —— 库里少了几条（导入失败了但脚本没报错）。
 * 2. **引用悬空** —— 课纲引用了不存在的视频/和弦组合；曲库指向不存在的乐谱；
 *    积分工单/任务进度指向不存在的用户。前端点下去就是"什么都没发生"。
 * 3. **形状漂移** —— 后端返回的 JSON 形状跟前端类型对不上（比如漏了 `type` 字段），
 *    编译期查不出来，运行时表现为"某列空白"。
 * 4. **本地残留** —— 前端还在往 localStorage 写业务数据（等于没迁干净）。
 *
 * 运行：
 * ```powershell
 * npx tsx scripts/verify-migration.ts
 * # 只跑某一段：npx tsx scripts/verify-migration.ts --only=refs
 * ```
 * 退出码非 0 表示有问题（可直接接进 CI）。
 */

import { DEMO_USERS } from '../src/types/auth';
import { PRICING_PLANS } from '../src/types/pricing';
import { INITIAL_NOTIFICATIONS } from '../src/types/notification';
import {
  INITIAL_COURSES,
  INITIAL_VIDEOS,
  INITIAL_DRILLS,
  LEGACY_LOCAL_STORAGE_KEYS,
} from '../src/utils/backendService';
import { INITIAL_LIBRARY_ITEMS } from '../src/data/libraryData';
import {
  INITIAL_CREDIT_RECOVERY_REQUESTS,
  INITIAL_ENTERPRISE_LEADS,
  INITIAL_TASK_PROGRESS,
} from '../src/data/initialOpsData';
import { API_BASE, ApiError } from '../src/services/apiClient';

const ok = (s: string) => console.log(`  ✅ ${s}`);
const fail = (s: string) => {
  console.log(`  ❌ ${s}`);
  process.exitCode = 1;
};
const warn = (s: string) => console.log(`  ⚠️  ${s}`);
const line = (s = '') => console.log(s);

let checks = 0;
/** 计数式断言：把"应该相等"写成一句话，失败时直接给出两边的值 */
function expectEqual(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (actual === expected) ok(`${label}：${actual}`);
  else fail(`${label}：实际 ${actual} vs 期望 ${expected}`);
}

function expectTrue(label: string, cond: boolean, detail?: string) {
  checks++;
  if (cond) ok(label);
  else fail(`${label}${detail ? ` —— ${detail}` : ''}`);
}

/** 只读 GET（带超时，避免后端没起时脚本一直挂着） */
async function get<T = any>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const only = process.argv.slice(2).find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? [];
  const wants = (k: string) => only.length === 0 || only.includes(k);
  const demoUsers = Object.values(DEMO_USERS);

  line('');
  line('════════════════════════════════════════════════════');
  line(' GuitarMate · 迁移完整性校验（只读）');
  line('════════════════════════════════════════════════════');
  line(`  后端地址: ${API_BASE}`);
  line(`  检查项  : ${only.length ? only.join(' / ') : '全部'}`);
  line('');

  try {
    await get('/api/health');
  } catch (err) {
    line(`  ❌ 连不上后端（${API_BASE}）：${(err as Error).message}`);
    line('     先启动：cd guitarmate-audio-backend && npm run dev');
    process.exitCode = 1;
    return;
  }

  // 先把各域数据一次性拉下来（后面所有检查共用，避免几十次请求）
  const [users, groups, courses, videos, drills, library, notifications, requests, leads, plans] =
    await Promise.all([
      get<any[]>('/api/users'),
      get<any[]>('/api/user-groups'),
      get<any[]>('/api/courses'),
      get<any[]>('/api/videos'),
      get<any[]>('/api/drills'),
      get<any[]>('/api/library'),
      get<any[]>('/api/notifications'),
      get<any[]>('/api/credit-recovery-requests'),
      get<any[]>('/api/enterprise-leads'),
      get<any[]>('/api/pricing-plans'),
    ]);

  // ══════════════════════════════════════════════════════════
  // 1) 数量对账
  // ══════════════════════════════════════════════════════════
  if (wants('counts')) {
    line('【1】数量对账（库 vs 源码种子）');
    expectEqual('用户组', groups.length, 8);
    expectEqual('用户', users.length, demoUsers.length);
    expectEqual('课程', courses.length, INITIAL_COURSES.length);
    expectEqual('教学视频', videos.length, INITIAL_VIDEOS.length);
    expectEqual('和弦组合', drills.length, INITIAL_DRILLS.length);
    expectEqual('曲库条目', library.length, INITIAL_LIBRARY_ITEMS.length);
    expectEqual('通知', notifications.length, INITIAL_NOTIFICATIONS.length);
    expectEqual('积分工单', requests.length, INITIAL_CREDIT_RECOVERY_REQUESTS.length);
    expectEqual('企业线索', leads.length, INITIAL_ENTERPRISE_LEADS.length);
    expectEqual('定价方案', plans.length, PRICING_PLANS.length);
    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 2) 引用完整性（悬空引用 = 前端点下去没反应）
  // ══════════════════════════════════════════════════════════
  if (wants('refs')) {
    line('【2】引用完整性');

    const userIds = new Set(users.map((u) => u.id));
    const videoIds = new Set(videos.map((v) => v.id));
    const drillIds = new Set(drills.map((d) => d.id));
    const scoreIds = new Set((await get<any[]>('/api/scores')).map((s) => s.id));
    const courseIds = new Set(courses.map((c) => c.id));

    // —— 课纲 → 视频 / 和弦组合 / 曲库条目
    const badRefs: string[] = [];
    const itemScoreIds = new Set(library.map((l) => l.id));
    for (const c of courses) {
      for (const ch of c.chapters ?? []) {
        for (const it of ch.items ?? []) {
          if (it.videoId && !videoIds.has(it.videoId)) badRefs.push(`${c.id}/${ch.id}/${it.id} → video ${it.videoId}`);
          if (it.chordDrillId && !drillIds.has(it.chordDrillId))
            badRefs.push(`${c.id}/${ch.id}/${it.id} → drill ${it.chordDrillId}`);
          if (it.scoreId && !itemScoreIds.has(it.scoreId))
            badRefs.push(`${c.id}/${ch.id}/${it.id} → library ${it.scoreId}`);
        }
      }
    }
    expectTrue(
      `课纲的 ${videoIds.size} 个视频 / ${drillIds.size} 个和弦组合 / ${itemScoreIds.size} 个曲库条目引用全部有对应记录`,
      badRefs.length === 0,
      badRefs.slice(0, 5).join('；'),
    );

    // —— 曲库 → 已发布乐谱（可空，但填了就必须存在）
    const badScoreRefs = library.filter((l) => l.scoreId && !scoreIds.has(l.scoreId));
    expectTrue('曲库的 scoreId 引用全部存在', badScoreRefs.length === 0, badScoreRefs.map((l) => `${l.id}→${l.scoreId}`).join('；'));

    // —— 曲库 → 乐谱本体不能是空的（前端拿 `score.measures` 直接渲染）
    const emptyScores = library.filter((l) => !l.score || !Array.isArray(l.score.measures) || l.score.measures.length === 0);
    expectTrue('每条曲库条目都带非空乐谱本体（score.measures）', emptyScores.length === 0, emptyScores.map((l) => l.id).join('；'));

    // —— 曲库 → 归属用户
    const badOwners = library.filter((l) => l.ownerUserId && !userIds.has(l.ownerUserId));
    expectTrue('曲库的 ownerUserId 引用全部存在', badOwners.length === 0, badOwners.map((l) => l.id).join('；'));

    // —— 积分工单 → 用户
    const badReqUsers = requests.filter((r) => !userIds.has(r.userId));
    expectTrue('积分工单指向的用户全部存在', badReqUsers.length === 0, badReqUsers.map((r) => `${r.id}→${r.userId}`).join('；'));

    // —— 用户归属：指导名师必须是真实账号
    //    ⚠️ institutionId **不是用户 id**，而是一套独立的机构业务编号
    //    （`inst_001`/`inst_002`/`inst_003`，由机构账号自己的 `institutionId` 字段定义，
    //     学员用它指向所属机构）。一开始没分清这两个命名空间，误报了一堆"悬空引用"。
    const badTeachers = users.filter((u) => u.teacherId && !userIds.has(u.teacherId));
    expectTrue('用户的指导名师 teacherId 指向的都是真实账号', badTeachers.length === 0, badTeachers.map((u) => `${u.id}→${u.teacherId}`).join('；'));

    const ownInstitutionIds = new Set(
      users.filter((u) => u.role === 'institution' && u.institutionId).map((u) => u.institutionId as string),
    );
    const badInstitutions = users.filter((u) => u.institutionId && !ownInstitutionIds.has(u.institutionId));
    expectTrue(
      '用户的所属机构 institutionId 都能对上某个机构账号（或用空值）',
      badInstitutions.length === 0,
      badInstitutions.map((u) => `${u.id}→${u.institutionId}`).join('；'),
    );
    line(`  机构业务编号：${[...ownInstitutionIds].join(', ') || '（无）'}`);

    // —— 通知 → 课程 / 乐谱
    const badNotifCourses = notifications.filter((n) => n.courseId && !courseIds.has(n.courseId));
    expectTrue('通知里的课程引用全部存在', badNotifCourses.length === 0, badNotifCourses.map((n) => n.id).join('；'));

    /**
     * ⚠️ 通知里的 `scoreId` 属于「前端用来跳转的曲库条目 id」。
     * 这里**只警告不算失败**：`notif_002` 指向 `macaroon_5_demo`，
     * 而真实曲库条目叫 `macaroon-5` —— 这是**迁移前就坏的演示数据**，
     * 不是迁移造成的（迁移原样搬运，没有"修正"它，因为那会改变现有行为）。
     * 需要修的话，改 `INITIAL_NOTIFICATIONS` 里那条的 scoreId 并重跑迁移即可。
     */
    const libIds = new Set(library.map((l) => l.id));
    const staleNotifScores = notifications.filter((n) => n.scoreId && !libIds.has(n.scoreId));
    if (staleNotifScores.length) {
      warn(
        `${staleNotifScores.length} 条通知的 scoreId 指向不存在的曲库条目（**迁移前就如此**，点进去不会跳到乐谱）：` +
          staleNotifScores.map((n) => `${n.id}→${n.scoreId}`).join('；'),
      );
    } else {
      ok('通知里的曲库条目引用全部存在');
    }

    // —— 用户组层级：role 必须都是内置组
    const groupCodes = new Set(groups.map((g) => g.code));
    const badRoles = users.filter((u) => !groupCodes.has(u.role));
    expectTrue('所有用户的 role 都能对上内置用户组', badRoles.length === 0, badRoles.map((u) => `${u.id}:${u.role}`).join('；'));

    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 3) 形状契约（后端返回的字段必须还是前端类型那份形状）
  // ══════════════════════════════════════════════════════════
  if (wants('shape')) {
    line('【3】形状契约（防"字段静默丢失"）');

    // ⚠️ 这一项来自真实教训：全局 ValidationPipe 的 whitelist 会把 DTO 没声明的字段丢掉，
    //    曾经差点出现"课程封面全没了"这种保存成功但数据缺失的情况。
    const miss = (label: string, rows: any[], fields: string[]) => {
      const bad: string[] = [];
      for (const r of rows) {
        for (const f of fields) {
          if (!(f in r)) bad.push(`${r.id}.${f}`);
        }
      }
      expectTrue(`${label} 的 ${fields.length} 个关键字段都存在`, bad.length === 0, bad.slice(0, 6).join(', '));
    };

    miss('课程', courses, ['id', 'title', 'status', 'version', 'versionHistory', 'chapters', 'teacherName', 'institutionName']);
    miss('教学视频', videos, ['id', 'title', 'videoUrl', 'cuePoints', 'status', 'videoSourceType']);
    miss('和弦组合', drills, ['id', 'title', 'chords', 'bpmStart', 'bpmTarget', 'steps', 'status']);
    miss('曲库条目', library, ['id', 'title', 'subtitle', 'artist', 'coverUrl', 'instrument', 'category', 'type', 'badges', 'tempo', 'keySignature', 'capo', 'durationSeconds', 'createdAt', 'score']);
    miss('通知', notifications, ['id', 'type', 'title', 'summary', 'content', 'timeAgo', 'timestamp', 'isRead']);
    miss('积分工单', requests, ['id', 'userId', 'userName', 'userEmail', 'userRole', 'currentCredits', 'requestedAmount', 'reason', 'createdAt', 'status']);
    miss('企业线索', leads, ['id', 'fullName', 'workEmail', 'companyName', 'monthlyMinutes', 'useCases', 'createdAt', 'status']);
    miss('定价方案', plans, ['id', 'planTier', 'title', 'priceMonthly', 'priceYearly', 'priceMonthlyNum', 'monthlyCredits', 'exportFormats', 'ctaText', 'ctaVariant']);

    // ⚠️ 前端读的是 `type`（不是 `accessType`）——序列化必须换回来
    const typeFieldOk = library.every((l) => l.type === 'unlocked' || l.type === 'trial');
    expectTrue('曲库的 type 是 unlocked/trial（服务端已把 accessType 换回前端字段名）', typeFieldOk);

    // ⚠️ 数组字段必须是真数组，不能是 JSON 字符串（否则前端 `.map` 直接崩）
    const arrayFields: Array<[string, any[], string]> = [
      ['课程 versionHistory', courses, 'versionHistory'],
      ['课程 chapters', courses, 'chapters'],
      ['视频 cuePoints', videos, 'cuePoints'],
      ['和弦组合 chords', drills, 'chords'],
      ['和弦组合 steps', drills, 'steps'],
      ['曲库 badges', library, 'badges'],
      ['线索 useCases', leads, 'useCases'],
    ];
    for (const [label, rows, field] of arrayFields) {
      const bad = rows.filter((r) => !Array.isArray(r[field]));
      expectTrue(`${label} 是数组而不是字符串`, bad.length === 0, bad.map((r) => r.id).join('；'));
    }

    // 定价的小数不能被截断成整数（9.99 → 9）
    const plus = plans.find((p) => p.id === 'plus');
    expectTrue(
      '定价方案的小数价格没有被截断（plus.priceMonthlyNum = 9.99）',
      plus ? plus.priceMonthlyNum === 9.99 : false,
      plus ? `实际 ${plus.priceMonthlyNum}` : 'plus 不存在',
    );

    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 4) 学员任务进度（每个演示账号都应有演示默认值）
  // ══════════════════════════════════════════════════════════
  if (wants('progress')) {
    line('【4】学员任务进度');
    const items = Object.keys(INITIAL_TASK_PROGRESS);
    let missing = 0;
    for (const u of demoUsers) {
      const progress = await get<Record<string, boolean>>(`/api/users/${encodeURIComponent(u.id)}/task-progress`);
      for (const itemId of items) if (progress[itemId] !== true) missing++;
    }
    expectTrue(
      `${demoUsers.length} 个账号 × ${items.length} 项进度都在库里`,
      missing === 0,
      `缺 ${missing} 项`,
    );
    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 5) 本地残留（backendService 里不该再有业务数据的 localStorage 读写）
  // ══════════════════════════════════════════════════════════
  if (wants('local')) {
    line('【5】本地存储残留检查（静态扫描源码）');
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    /**
     * ⚠️ 必须相对**脚本自己**定位源码目录，不能用 `process.cwd()`。
     * 第一次写的时候用了 cwd，而当时 shell 停在 `guitarmate-audio-backend`，
     * 于是扫的是**后端**的 src —— 那里当然没有这些 localStorage 键，
     * 检查"全绿"，实际上什么都没查（最危险的一种假阳性）。
     */
    const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const srcDir = join(frontendRoot, 'src');

    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(name)) out.push(p);
      }
      return out;
    };

    const srcFiles = walk(srcDir);
    line(`  扫描范围：${srcDir}（${srcFiles.length} 个 ts/tsx 文件）`);
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const text = readFileSync(f, 'utf8');
      for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
        // 只看"真的在用它读写"，注释里提到不算
        const pattern = new RegExp(`(getItem|setItem|removeItem)\\(\\s*['"\`]${key}`, 'g');
        if (pattern.test(text)) offenders.push(`${f.replace(frontendRoot, '')} → ${key}`);
      }
    }
    expectTrue(
      `${LEGACY_LOCAL_STORAGE_KEYS.length} 个已退役的 localStorage 键在源码里已无读写（注释除外）`,
      offenders.length === 0,
      offenders.join('；'),
    );

    /**
     * 前端仍保留的 localStorage 用法应该只有「纯 UI 偏好」（主题/语言）——
     * 这类**本来就该存在浏览器里**，不是业务数据。
     * 如果这里冒出别的键，说明有业务数据漏迁了。
     */
    const uiOnly = srcFiles.filter((f) => /localStorage\.setItem/.test(readFileSync(f, 'utf8')));
    line(`  仍在使用 localStorage 的文件（应只有 UI 偏好）：`);
    for (const f of uiOnly) {
      const text = readFileSync(f, 'utf8');
      const keys = [...text.matchAll(/localStorage\.(get|set)Item\(\s*['"`]([^'"`]+)/g)].map((m) => m[2]);
      line(`      · ${f.replace(frontendRoot, '')} → ${[...new Set(keys)].join(', ') || '(动态键)'}`);
    }
    /**
     * 允许留下的 localStorage 键：
     * - `guitarmate_theme` / `guitarmate_lang` 这类**纯 UI 偏好**（本来就该存本机）；
     * - `guitarmate_user` —— **会话指针**（"这台浏览器登的是谁"），
     *   资料本体已改为从后端取（见 `App.tsx` 里 user 的 useState 初值）。
     *   登录校验本身不在本阶段范围内（用户明确说"只做数据与权限模型"），
     *   所以不引入 token/session 服务，但**不能**拿它当资料真相。
     */
    const allowed = /theme|lang|locale|sidebar|preference|guitarmate_user/i;
    const suspicious = uiOnly.filter((f) => {
      const keys = [...readFileSync(f, 'utf8').matchAll(/localStorage\.setItem\(\s*['"`]([^'"`]+)/g)].map((m) => m[1]);
      return keys.some((k) => !allowed.test(k));
    });
    expectTrue(
      'localStorage 里只剩 UI 偏好与会话指针，没有业务数据副本',
      suspicious.length === 0,
      suspicious.map((f) => f.replace(frontendRoot, '')).join('；'),
    );
    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 6) 练习乐谱来源统一性（静态扫描）
  // ══════════════════════════════════════════════════════════
  if (wants('scores')) {
    line('【6】练习乐谱来源统一性（不该再有本地"练习谱"来源）');
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const srcDir = join(frontendRoot, 'src');

    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(name)) out.push(p);
      }
      return out;
    };
    const srcFiles = walk(srcDir);

    /**
     * 允许引用本地乐谱常量的**仅限**这几个文件，且各有明确理由：
     * - `data/libraryData.ts` / `data/macaroon5Demo.ts`：**迁移种子**的定义处
     *   （种子的唯一来源留在前端，后端源码不存副本，见迁移脚本顶部说明）；
     * - `utils/backendService.ts`：`libraryCache ?? INITIAL_LIBRARY_ITEMS` 的**离线兜底**
     *   —— 后端连不上时首屏不空白。它是"兜底"，不是"来源"。
     *
     * 任何**其它**文件再引用这些常量，就意味着练习谱又出现了第二个来源，
     * 于是"改了库里、页面还是老样子"这类问题会重新出现 —— 直接报错。
     */
    const allowed = [
      join('src', 'data', 'libraryData.ts'),
      join('src', 'data', 'macaroon5Demo.ts'),
      join('src', 'utils', 'backendService.ts'),
    ];
    const relOf = (f: string) => f.slice(frontendRoot.length + 1);
    const SCORE_CONSTS = [
      'MACAROON_5_SCORE',
      'LAID_BACK_GUITARS_SCORE',
      'ISOLATED_SCORE',
      'A_MINOR_ETUDE_SCORE',
      'CANON_IN_D_SCORE',
    ];
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const rel = relOf(f);
      if (allowed.includes(rel)) continue;
      const text = readFileSync(f, 'utf8');
      for (const c of SCORE_CONSTS) {
        // 只看真实 import / 使用（注释里的说明不算）
        const imported = new RegExp(`import\\s*\\{[^}]*\\b${c}\\b[^}]*\\}`).test(text);
        const usedOutsideComment = text
          .split(/\r?\n/)
          .some((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && new RegExp(`\\b${c}\\b`).test(l));
        if (imported || usedOutsideComment) offenders.push(`${rel} → ${c}`);
      }
    }
    expectTrue(
      `除「迁移种子」与「离线兜底」外，没有文件引用本地乐谱常量（扫描 ${srcFiles.length} 个文件）`,
      offenders.length === 0,
      offenders.join('；'),
    );

    // 解析器必须"命中不到就返回 null"，而不是回退到某首演示曲
    const resolver = readFileSync(join(srcDir, 'utils', 'scoreResolver.ts'), 'utf8');
    expectTrue('课程乐谱解析器不含"按关键词猜谱"的兜底分支', !SCORE_CONSTS.some((c) => resolver.includes(c)));
    expectTrue(
      '课程乐谱解析器在未绑定时返回 null（由调用方显式处理）',
      /return null;/.test(resolver) && /ScoreData \| null/.test(resolver),
    );

    // 工作台默认谱 / 招牌曲必须来自后端曲库
    const libSource = readFileSync(join(srcDir, 'utils', 'librarySource.ts'), 'utf8');
    expectTrue(
      '默认谱与招牌曲都从 `getLibraryItems()`（后端曲库）取，且用「空谱」占位而不是假谱',
      /getLibraryItems\(\)/.test(libSource) && /EMPTY_SCORE/.test(libSource),
    );
    line('');
  }

  // ══════════════════════════════════════════════════════════
  // 汇总
  // ══════════════════════════════════════════════════════════
  line('════════════════════════════════════════════════════');
  if (process.exitCode) {
    line(` ❌ 有失败项；共执行 ${checks} 项检查，请查看上面的 ❌`);
  } else {
    line(` 🎉 全部通过：共 ${checks} 项检查 —— 数据完整、引用无悬空、形状未漂移、本地无残留、乐谱来源统一`);
  }
  line('════════════════════════════════════════════════════');
  line('');
}

main().catch((err) => {
  const e = err as ApiError;
  console.error(`校验脚本异常终止：${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
  process.exitCode = 1;
});
