/**
 * 用户组 / 权限目录（内置 8 个用户形态）
 * =====================================
 *
 * 取值逐条对齐 `guitar-ai-audio/docs/USER_ROLES_PERMISSIONS_ROADMAP.md`：
 * - §一「系统总体角色层级与定义」→ 角色 code / 层级 / 积分标准
 * - §六「各类型用户端到端系统使用场景与功能矩阵」→ 转录上限 / 小节锁 / 导出 / 课纲权
 * - §八.3「按层级看到不同用户信息」→ `visibleGroupCodes`
 *
 * ⚠️ 为什么这份目录放在后端代码里，而不是直接从 `DEMO_USERS` 推：
 * 角色/权限是**平台规则**，不是演示数据；前端那 19 个演示账号只是规则的实例。
 * 规则放后端 → 小程序、未来的管理端、任何客户端都拿到同一套；
 * 前端只需把「账号实例」迁移过来（见 `guitar-ai-audio/scripts/migrate-to-backend.ts`）。
 *
 * ⚠️ 文档内部有两处口径不一致，这里**按 §一 取**并标注出来，供教研确认：
 * - **试用用户**：§一 写「完整转录双行谱（不限小节）/ 无限转录库」，
 *   §六 表格写「30 秒 / 8 小节（或全曲）」→ 这里取 §一（`maxTranscriptionSeconds: 900`、`lockedMeasures: 0`）。
 */

/** 组 code 联合（与前端 `UserRole` 完全一致，便于前端零改动映射） */
export const USER_GROUP_CODES = [
  'super_admin',
  'institution',
  'teacher',
  'student',
  'plus',
  'trial_guest',
  'registered',
  'anonymous',
] as const;

export type UserGroupCode = (typeof USER_GROUP_CODES)[number];

/** 可复用的权限片段（避免各组的清单里出现拼写漂移） */
const P = {
  userManage: 'user:manage',
  userViewSubtree: 'user:view_subtree',
  userSearch: 'user:search',
  curriculumAll: 'curriculum:all',
  curriculumRead: 'curriculum:read',
  curriculumCreate: 'curriculum:create',
  curriculumEditOwn: 'curriculum:edit_own',
  curriculumPublish: 'curriculum:publish',
  curriculumViewBound: 'curriculum:view_bound',
  studentProgressView: 'student:progress:view',
  creditApprove: 'credit:approve',
  creditRequestRecovery: 'credit:request_recovery',
  creditEarn: 'credit:earn',
  scoreExport: 'score:export',
  scoreExportLimited: 'score:export:limited',
  scoreTranscribe: 'score:transcribe',
  privacyOptOutAi: 'privacy:opt_out_ai',
  profileEditSelf: 'profile:edit_self',
  profileEditInstitution: 'profile:edit_institution',
} as const;

/** 四种导出格式（Plus/Pro/教师/机构/超管解锁） */
const ALL_EXPORTS = ['midi', 'musicxml', 'pdf', 'gpx'];

export interface UserGroupSeed {
  code: UserGroupCode;
  name: string;
  /** 数字越小权限越高；1 = 超管 */
  level: number;
  description: string;
  /** 可见的**下级组** code；空数组 = 由服务层按 level 决定 */
  visibleGroupCodes: UserGroupCode[];
  permissions: string[];
  maxTranscriptionSeconds: number;
  lockedMeasures: number;
  cloudLibraryLimit: number;
  exportFormats: string[];
  curriculumRights: 'none' | 'readonly' | 'own' | 'all';
  curriculumPublishCost: number;
  defaultCredits: number;
  creditsResetCycle: 'none' | 'once' | 'monthly_1st' | 'renewal' | 'unlimited';
  isUnlimitedCredits: boolean;
  creditRecoveryAmount: number;
  orderIndex: number;
}

export const USER_GROUP_SEEDS: UserGroupSeed[] = [
  {
    code: 'super_admin',
    name: '超级管理员',
    level: 1,
    description: '全局总控：机构入驻审核、教师资质认证、积分恢复审批、全局用户与大纲管控',
    visibleGroupCodes: [],
    permissions: [
      '*',
      P.userManage,
      P.userViewSubtree,
      P.userSearch,
      P.curriculumAll,
      P.curriculumRead,
      P.curriculumCreate,
      P.curriculumEditOwn,
      P.curriculumPublish,
      P.studentProgressView,
      P.creditApprove,
      P.scoreExport,
      P.profileEditInstitution,
    ],
    maxTranscriptionSeconds: 0,
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: ALL_EXPORTS,
    curriculumRights: 'all',
    curriculumPublishCost: 0,
    defaultCredits: 0,
    creditsResetCycle: 'unlimited',
    isUnlimitedCredits: true,
    creditRecoveryAmount: 0,
    orderIndex: 1,
  },
  {
    code: 'institution',
    name: '教学机构',
    level: 2,
    description: '区域教务管理者：管理下辖教师团队、只读审阅旗下课纲、监管学员进度、区域招生派单',
    visibleGroupCodes: ['teacher', 'student'],
    permissions: [
      P.userViewSubtree,
      P.userSearch,
      P.curriculumRead,
      P.studentProgressView,
      P.creditRequestRecovery,
      P.scoreExport,
      P.profileEditInstitution,
      P.profileEditSelf,
    ],
    maxTranscriptionSeconds: 900,
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: ALL_EXPORTS,
    // ⚠️ 机构**只读**审阅旗下教师课纲，无权篡改（§六）
    curriculumRights: 'readonly',
    curriculumPublishCost: 15,
    defaultCredits: 5000,
    creditsResetCycle: 'none',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 5000,
    orderIndex: 2,
  },
  {
    code: 'teacher',
    name: '认证教师',
    level: 3,
    description: '创作者与教学者：1:1 独立编排发布课纲（发一次扣 15 积分）、管理名下学员、申请积分恢复',
    visibleGroupCodes: ['student'],
    permissions: [
      P.userViewSubtree,
      P.userSearch,
      P.curriculumCreate,
      P.curriculumEditOwn,
      P.curriculumPublish,
      P.studentProgressView,
      P.creditRequestRecovery,
      P.scoreExport,
      P.profileEditInstitution,
      P.profileEditSelf,
    ],
    maxTranscriptionSeconds: 900,
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: ALL_EXPORTS,
    curriculumRights: 'own',
    curriculumPublishCost: 15,
    defaultCredits: 5000,
    creditsResetCycle: 'none',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 5000,
    orderIndex: 3,
  },
  {
    code: 'student',
    name: '挂靠学员 (Pro)',
    level: 4,
    description: '师承进阶型：与认证教师绑定、解锁专属完整课纲、每日练琴赚积分、学分抵扣课程',
    visibleGroupCodes: ['teacher'],
    permissions: [
      P.curriculumViewBound,
      P.studentProgressView,
      P.creditEarn,
      P.scoreExport,
      P.profileEditSelf,
    ],
    maxTranscriptionSeconds: 900,
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: ALL_EXPORTS,
    curriculumRights: 'none',
    curriculumPublishCost: 15,
    defaultCredits: 3000,
    creditsResetCycle: 'renewal',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 0,
    orderIndex: 4,
  },
  {
    code: 'plus',
    name: '付费订阅用户 (Plus)',
    level: 5,
    description: '独立进阶吉他手：单次最长 15 分钟、四类乐谱导出、可退出 AI 训练、全套官方基础课',
    visibleGroupCodes: [],
    permissions: [P.scoreTranscribe, P.scoreExport, P.privacyOptOutAi, P.profileEditSelf],
    maxTranscriptionSeconds: 900,
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: ALL_EXPORTS,
    curriculumRights: 'none',
    curriculumPublishCost: 15,
    defaultCredits: 600,
    creditsResetCycle: 'monthly_1st',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 0,
    orderIndex: 5,
  },
  {
    code: 'trial_guest',
    name: '普通试用用户 (14 天)',
    level: 6,
    description: '全功能体验型：完整转录双行谱、无限转录库、开放基础课第 1 课；14 天后回落为普通注册用户',
    visibleGroupCodes: [],
    permissions: [P.scoreTranscribe, P.scoreExportLimited, P.profileEditSelf],
    maxTranscriptionSeconds: 900, // 见文件头说明：按 §一（不限小节）
    lockedMeasures: 0,
    cloudLibraryLimit: 0,
    exportFormats: [],
    curriculumRights: 'none',
    curriculumPublishCost: 15,
    defaultCredits: 600,
    creditsResetCycle: 'once',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 0,
    orderIndex: 6,
  },
  {
    code: 'registered',
    name: '普通注册用户',
    level: 7,
    description: '受限云端存储型：限前 8 小节 / 30 秒试听，云端乐谱库上限 50 条，引导开启 14 天试用',
    visibleGroupCodes: [],
    permissions: [P.scoreTranscribe, P.profileEditSelf],
    maxTranscriptionSeconds: 30,
    lockedMeasures: 8,
    cloudLibraryLimit: 50,
    exportFormats: [],
    curriculumRights: 'none',
    curriculumPublishCost: 15,
    defaultCredits: 0,
    creditsResetCycle: 'none',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 0,
    orderIndex: 7,
  },
  {
    code: 'anonymous',
    name: '匿名访客',
    level: 8,
    description: '前端体验型：可试听转录结果，仅开放前 8 小节 / 30 秒，本地缓存上限 10 条',
    visibleGroupCodes: [],
    permissions: [],
    maxTranscriptionSeconds: 30,
    lockedMeasures: 8,
    cloudLibraryLimit: 10,
    exportFormats: [],
    curriculumRights: 'none',
    curriculumPublishCost: 15,
    defaultCredits: 0,
    creditsResetCycle: 'none',
    isUnlimitedCredits: false,
    creditRecoveryAmount: 0,
    orderIndex: 8,
  },
];

/** 前端 `UserRole` → 是否内置组（用于校验传入的 role 是否合法） */
export const isUserGroupCode = (value: string): value is UserGroupCode =>
  (USER_GROUP_CODES as readonly string[]).includes(value);
