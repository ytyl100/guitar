import { CreditRecoveryRequest, EnterpriseLead } from '../types/pricing';

/**
 * 运营域的**迁移种子数据**（需求 (4)）
 * ==================================
 *
 * 这三份数据原先并不在某个常量里，而是**藏在 `backendService` 的几个 getter 内部**
 * （"库里没有就返回这份演示数据并写进 localStorage"）。迁到后端之后那段逻辑被删掉了，
 * 但**数据本身不能丢** —— 否则：
 *   · 超管工作台那条待审批工单没了；
 *   · 销售后台那条企业线索没了；
 *   · 学员端课程进度从「已完成 3 项」变成 0。
 *
 * 所以把它们**原样搬到这个文件**，作为迁移脚本的输入。
 * 这里只被 `scripts/migrate-to-backend.ts` 使用，运行时不参与任何逻辑
 * （后端是唯一数据源；前端不再 import 它们）。
 */

/**
 * 教师额度恢复申请 —— 原来写死在 `getCreditRecoveryRequests()` 里。
 *
 * ⚠️ `currentCredits: 12` 是**当时快照**，不是从用户表算出来的。
 * 保持原样才不会让界面上那句「当前余额: 12 点」变样。
 */
export const INITIAL_CREDIT_RECOVERY_REQUESTS: CreditRecoveryRequest[] = [
  {
    id: 'req_001',
    userId: 'usr_coach_alex',
    userName: '李老师 (认证名师)',
    userEmail: 'alex.guitar@studio.com',
    userRole: 'teacher',
    currentCredits: 12,
    requestedAmount: 5000,
    reason: '新一期吉他指弹大纲发布版本，包含 4 节新课及伴奏音频打点切片，申请恢复 5000 点教研额度。',
    createdAt: '2026-10-04 10:20:00',
    status: 'pending',
  },
];

/** 企业版线索 —— 原来写死在 `getEnterpriseLeads()` 里 */
export const INITIAL_ENTERPRISE_LEADS: EnterpriseLead[] = [
  {
    id: 'lead_001',
    fullName: '李校长',
    workEmail: 'principal.li@parsons-music.com',
    companyName: '柏斯音乐国际教育学院',
    monthlyMinutes: '2,000 - 10,000 分钟',
    useCases: ['专属私有教师与课纲系统独立部署', '批量乐谱与多轨格式打包导出'],
    notes: '全国 50+ 连锁分校期末考级扒谱与指弹视频伴奏统一部署。',
    createdAt: '2026-10-02T15:30:00Z',
    status: 'contacted',
  },
];

/**
 * 学员任务进度的**演示默认值** —— 原来写在 `getUserTaskProgress()` 的兜底分支里：
 * 「这个用户没有进度记录 → 返回这三项已完成」。
 *
 * ⚠️ 迁移时会给**每个演示账号**都写入这三行，这样行为与迁移前**完全一致**
 * （任何人打开课程页看到的都是 3 项已完成）。
 * 迁移之后新建的账号则从 0 开始 —— 这是刻意的：
 * 「新学员默认已完成 3 节课」本身就是个演示期的怪现象。
 */
export const INITIAL_TASK_PROGRESS: Record<string, boolean> = {
  item_101_1: true,
  item_101_2: true,
  item_102_1: true,
};
