/**
 * 「我的」页的视图模型与映射
 * ===========================
 *
 * 这一层把**后端数据**翻成页面要的形状，并且**明确区分**三种情况：
 *
 * 1. `值`   —— 后端有，直接用；
 * 2. `null` —— 后端**没有这个字段**，页面显示占位符 `—`；
 * 3. 加载中 / 失败 —— 页面显示加载态或错误提示，**不填假数据**。
 *
 * ## 为什么原来是假的、现在改成占位
 *
 * 老版本 `utils/profileSeed.ts` 里是一整份硬编码的演示资料
 * （弦动心生 / 连续 16 天 / 385 分钟 / 14 个和弦 / 3 笔订单…），
 * 那是从另一个项目（`guitarmate-frontend`）的 mock 逐字搬过来的。
 * 本次把它整个换成"后端起、后端落"：**后端没有的就是 `—`**。
 *
 * 宁可界面上出现几个 `—`，也不要几个看着很真实的假数字 ——
 * 假的练习天数会让人以为自己在坚持，假订单会让人以为已经付过钱。
 */

import type { ApiUser, ApiNotification, ApiCreditTransaction } from '../services/api';

/** 后端没有对应字段时统一显示这个（**不是** 0，0 会被误读成"真的没有"） */
export const NO_DATA = '—';

/** 用户卡要展示的内容 */
export interface ProfileHero {
  name: string;
  /** 头像：后端**没有** avatar 字段 → 固定 null，页面用首字母色块 */
  avatar: string | null;
  /** 会员/角色徽标（由 role + plan 映射，后端有） */
  memberStatus: string;
  /** 有效期：只有试用期有真实值；付费会员到期日后端**没有** → null */
  validUntil: string | null;
  /** 机构归属（后端有；游客为空） */
  institutionName: string | null;
  /** 指导名师（后端有；游客为空） */
  teacherName: string | null;
  /** 可用积分（后端有；`isUnlimitedCredits` 时显示 ∞） */
  credits: string;
  isUnlimitedCredits: boolean;
}

export interface ProfileMetric {
  key: string;
  /** `null` = 后端没有这个数据 → 页面显示 `—` */
  value: number | string | null;
  /** ⚠️ 存的是 **i18n key** 而不是文案：本页的文案覆盖在设置卡里写明了，
   *  这里写死中文会让「切英文」在这四个格子上失效。 */
  labelKey: ProfileMetricLabelKey;
}

type ProfileMetricLabelKey =
  | 'profile.metric.streak'
  | 'profile.metric.minutes'
  | 'profile.metric.chords'
  | 'profile.metric.lessons';

export interface ProfileCourseProgress {
  title: string;
  subtitle: string;
  /** 完成课时数（来自 `GET /api/users/:id/task-progress` ∩ 课程课时 id） */
  completedSteps: number;
  totalSteps: number;
  percentage: number;
  /** 后端连不上 / 课纲为空时为 true，页面给一行说明而不是画假进度条 */
  unavailable: boolean;
}

/** 角色 → 会员徽标文案（后端 `role` 是 8 个内置用户组 code 之一） */
const ROLE_BADGE: Record<string, string> = {
  super_admin: '超级管理员',
  institution: '教学机构',
  teacher: '认证教师',
  student: '挂靠学员',
  plus: 'Plus 会员',
  trial_guest: '14 天试用',
  registered: '注册用户',
  anonymous: '游客',
};

export function toProfileHero(user: ApiUser): ProfileHero {
  const badge = user.plan === 'pro' && user.role === 'student' ? 'Pro 学员' : ROLE_BADGE[user.role] || user.role;
  return {
    name: user.name || NO_DATA,
    avatar: null, // 后端无 avatar 字段（见文件头说明）
    memberStatus: badge,
    // ⚠️ 后端只有试用到期日，**没有**付费会员到期日 → 非试用账号一律 null（显示占位）
    validUntil: user.trialActive && user.trialExpiresAt ? user.trialExpiresAt.slice(0, 10) : null,
    institutionName: user.institutionName || null,
    teacherName: user.teacherName || null,
    credits: user.isUnlimitedCredits ? '∞' : String(user.credits ?? 0),
    isUnlimitedCredits: !!user.isUnlimitedCredits,
  };
}

/**
 * 四个练习指标。
 *
 * ⚠️ 原版这四个里**三个后端都没有来源**（连续练习天数 / 练习分钟 / 掌握和弦数），
 * 只有「完成课时」能由 `completedLessonsCount` 给出。所以：
 * 前三项返回 `null` → 页面显示 `—`，第四项是真值。
 * 后端将来加了这三张统计表，只要在这里补上映射即可，页面不用动。
 */
export function toProfileMetrics(user: ApiUser | null): ProfileMetric[] {
  return [
    { key: 'streak', value: null, labelKey: 'profile.metric.streak' },
    { key: 'minutes', value: null, labelKey: 'profile.metric.minutes' },
    { key: 'chords', value: null, labelKey: 'profile.metric.chords' },
    { key: 'lessons', value: user ? user.completedLessonsCount ?? 0 : null, labelKey: 'profile.metric.lessons' },
  ];
}

/**
 * 当前课程的完成度。
 *
 * ⚠️ 这里刻意用**两套课程体系都支持**的口径：把 `task-progress` 的 key 集合
 * 与课程课时 id 求交集 —— 交集里的 key 是 CMS 课时的 `lesson-step-xxx`，
 * 也可能来自另一套课程的内容项 id，算出来都对。
 * （背景：仓库里有 `guitar-ai-audio` 的 `Course` 表和 CMS 的 `curriculum` 文档两套课纲。）
 */
export function toCourseProgress(
  course: { title: string; subtitle: string; lessonIds: string[] } | null,
  progress: Record<string, boolean> | null,
): ProfileCourseProgress {
  if (!course) {
    return {
      title: NO_DATA,
      subtitle: '课程数据不可用',
      completedSteps: 0,
      totalSteps: 0,
      percentage: 0,
      unavailable: true,
    };
  }
  const total = course.lessonIds.length;
  const completed = progress ? course.lessonIds.filter((id) => progress[id] === true).length : 0;
  return {
    title: course.title,
    subtitle: course.subtitle,
    completedSteps: completed,
    totalSteps: total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    unavailable: total === 0,
  };
}

/** 积分流水 → 展示行（正负号 + 颜色由页面决定） */
export function toCreditRows(txs: ApiCreditTransaction[] | null) {
  if (!txs) return null; // null = 拉取失败/加载中（与"确实没有流水"区分开）
  return txs.map((tx) => ({
    id: tx.id,
    description: tx.description,
    type: tx.type,
    amount: tx.amount,
    /** `+30` / `-15` */
    amountText: `${tx.amount > 0 ? '+' : ''}${tx.amount}`,
    balanceAfter: tx.balanceAfter,
    createdAt: tx.createdAt.replace('T', ' ').slice(0, 16),
  }));
}

/** 通知类型 → 图标（与 Web 版一致的四种） */
export const NOTIFICATION_ICON: Record<string, string> = {
  feedback: '📝',
  score_update: '🎼',
  drill_award: '🏆',
  system: '📢',
};

export function notificationIcon(type: string): string {
  return NOTIFICATION_ICON[type] || '🔔';
}

export type { ApiNotification, ApiCreditTransaction };
