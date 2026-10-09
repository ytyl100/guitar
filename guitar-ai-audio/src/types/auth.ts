export type UserRole = 
  | 'super_admin'   // 1. 超级管理员：增删改查所有用户、维护关系与所有功能 (无限 Credits)
  | 'institution'   // 2. 教学机构：管理属下教师与学员、查看学分与大纲(只读) (5000 Credits)
  | 'teacher'       // 3. 教师：归属机构、查看学员与学分、对课程大纲发布/归档/草稿/版本/删除 (5000 Credits)
  | 'student'       // 4. 挂靠学员：师承进阶、解锁名师完整课纲 (3000 Credits/月)
  | 'plus'          // 5. 付费订阅用户：Plus会员、全套官方课、四类格式导出 (600 Credits/月)
  | 'trial_guest'   // 6. 普通试用用户：14天试用期、600 Credits
  | 'registered'    // 7. 普通注册用户：未开通试用、0 Credits、限前8小节
  | 'anonymous';    // 8. 匿名访客：0 Credits、免登录体验前8小节

export type PlanType = 'free' | 'trial' | 'plus' | 'pro' | 'enterprise';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isLoggedIn: boolean;
  memberSince: string;
  plan: PlanType;
  trialActive?: boolean;
  trialExpiresAt?: string;
  language: string;
  
  // Credits & Economic system
  credits: number;
  isUnlimitedCredits?: boolean;
  monthlyCreditQuota?: number;
  creditsCycleResetDate?: string;
  
  // AI Privacy Setting
  optOutAiTraining?: boolean;
  
  // Relationship & Teaching fields
  institutionId?: string;
  institutionName?: string;
  teacherId?: string;
  teacherName?: string;
  completedLessonsCount?: number;
  status: 'active' | 'pending';

  // Contact & Institution Profile Info
  phone?: string;
  wechat?: string;
  address?: string;
  bio?: string;
}

export const DEMO_USERS: Record<string, UserProfile> = {
  // 1. 超级管理员 (无限 Credits)
  super_admin: {
    id: 'usr_gardenart',
    name: 'Gardenart (超级管理员)',
    email: 'gardenartgz@gmail.com',
    role: 'super_admin',
    isLoggedIn: true,
    memberSince: 'Sep 30, 2026',
    plan: 'enterprise',
    language: 'Automatic',
    credits: 999999,
    isUnlimitedCredits: true,
    monthlyCreditQuota: 999999,
    optOutAiTraining: true,
    status: 'active',
    phone: '18688880000',
    bio: 'GuitarMate 平台全局总控管理员，负责全机构入驻审核与课纲审计。',
  },

  // 2. 教学机构 (5000 Credits)
  institution: {
    id: 'usr_parsons_academy',
    name: '柏斯音乐学院 (教学机构)',
    email: 'academy@parsons-music.com',
    role: 'institution',
    isLoggedIn: true,
    memberSince: 'Mar 15, 2026',
    plan: 'enterprise',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '400-888-1234',
    wechat: 'parsons_music_edu',
    address: '上海市徐汇区艺术国际大厦 8-10 楼 (全国连锁)',
    bio: '柏斯音乐国际教育学院，汇聚国际级吉他大师，致力于专业吉他与现代声乐教学。',
  },

  // 机构 2: 海伦艺术中心
  institution_hailun: {
    id: 'usr_hailun_academy',
    name: '海伦吉他艺术中心 (教学机构 2)',
    email: 'academy@hailun-art.com',
    role: 'institution',
    isLoggedIn: true,
    memberSince: 'Jan 10, 2026',
    plan: 'enterprise',
    institutionId: 'inst_002',
    institutionName: '海伦钢琴吉他艺术中心',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '021-68889999',
    wechat: 'hailun_art_edu',
    address: '上海市浦东新区张江文化艺术空间 3 楼',
    bio: '专注指弹与原声吉他演艺教学，培养超过数千名活跃吉他手。',
  },

  // 机构 3: 独立音乐家吉他工坊
  institution_indie: {
    id: 'usr_indie_studio',
    name: '独立音乐家吉他工坊 (教学机构 3)',
    email: 'studio@indie-guitar.com',
    role: 'institution',
    isLoggedIn: true,
    memberSince: 'May 20, 2026',
    plan: 'enterprise',
    institutionId: 'inst_003',
    institutionName: '独立音乐家吉他工坊',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '020-85556666',
    wechat: 'indie_guitar_gz',
    address: '广州市天河区花城大道音乐创客大厦 5 层',
    bio: '独立摇滚与电吉他先锋工作坊，致力于即兴演奏与扒谱编曲研究。',
  },

  // 3. 认证教师 (5000 Credits)
  teacher: {
    id: 'usr_coach_alex',
    name: '李老师 (认证名师)',
    email: 'alex.guitar@studio.com',
    role: 'teacher',
    isLoggedIn: true,
    memberSince: 'Apr 10, 2026',
    plan: 'pro',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '13800138001',
    wechat: 'alex_guitar_pro',
    address: '柏斯音乐学院吉他教研组 302 琴房',
    bio: '15年吉他教学与编谱经验，精通民谣弹唱与弗拉门戈指弹，累计指导过千名学员。',
  },

  // 教师 2: 王琴师
  teacher_wang: {
    id: 'usr_teacher_wang',
    name: '王琴师 (指弹独奏家)',
    email: 'wang.fingerstyle@studio.com',
    role: 'teacher',
    isLoggedIn: true,
    memberSince: 'Feb 18, 2026',
    plan: 'pro',
    institutionId: 'inst_002',
    institutionName: '海伦钢琴吉他艺术中心',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '13900139002',
    wechat: 'wang_guitar_master',
    address: '海伦艺术中心名师工作室 101',
    bio: '国内知名指弹吉他原创演奏家，擅长现代押尾风与特殊调弦技巧。',
  },

  // 教师 3: 陈教授
  teacher_chen: {
    id: 'usr_teacher_chen',
    name: '陈教授 (古典吉他名师)',
    email: 'chen.classical@studio.com',
    role: 'teacher',
    isLoggedIn: true,
    memberSince: 'Mar 01, 2026',
    plan: 'pro',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '13700137003',
    wechat: 'prof_chen_guitar',
    address: '柏斯音乐学院古典教研室 501',
    bio: '音乐学院客座教授，西班牙古典吉他学派传人，严谨教学与考级辅导专家。',
  },

  // 教师 4: 周导师
  teacher_zhou: {
    id: 'usr_teacher_zhou',
    name: '周导师 (摇滚电吉他)',
    email: 'zhou.rock@studio.com',
    role: 'teacher',
    isLoggedIn: true,
    memberSince: 'Jun 12, 2026',
    plan: 'pro',
    institutionId: 'inst_003',
    institutionName: '独立音乐家吉他工坊',
    language: 'Automatic',
    credits: 5000,
    monthlyCreditQuota: 5000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '13600136004',
    wechat: 'rock_zhou_shred',
    address: '独立音乐家吉他工坊排练厅 A',
    bio: '独立乐队主音吉他手，擅长速弹、点弦与现代重音色编配。',
  },

  // 4. 挂靠学员 (3000 Credits / 月)
  student: {
    id: 'usr_student_demo',
    name: '学员小明 (挂靠学员 1)',
    email: 'xiaoming.student@gmail.com',
    role: 'student',
    isLoggedIn: true,
    memberSince: 'Sep 30, 2026',
    plan: 'pro',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    language: 'Automatic',
    credits: 3000,
    monthlyCreditQuota: 3000,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    completedLessonsCount: 6,
    status: 'active',
    phone: '13511112222',
  },

  student_hong: {
    id: 'usr_student_hong',
    name: '学员小红 (挂靠学员 2)',
    email: 'hong.student@gmail.com',
    role: 'student',
    isLoggedIn: true,
    memberSince: 'Aug 15, 2026',
    plan: 'pro',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    language: 'Automatic',
    credits: 3000,
    monthlyCreditQuota: 3000,
    completedLessonsCount: 4,
    status: 'active',
  },

  student_qiang: {
    id: 'usr_student_qiang',
    name: '学员阿强 (挂靠学员 3)',
    email: 'qiang.student@gmail.com',
    role: 'student',
    isLoggedIn: true,
    memberSince: 'Jul 20, 2026',
    plan: 'pro',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    language: 'Automatic',
    credits: 3000,
    monthlyCreditQuota: 3000,
    completedLessonsCount: 8,
    status: 'active',
  },

  student_hua: {
    id: 'usr_student_hua',
    name: '学员小华 (挂靠学员 4)',
    email: 'hua.student@gmail.com',
    role: 'student',
    isLoggedIn: true,
    memberSince: 'Sep 05, 2026',
    plan: 'pro',
    institutionId: 'inst_002',
    institutionName: '海伦钢琴吉他艺术中心',
    teacherId: 'usr_teacher_wang',
    teacherName: '王琴师 (指弹独奏家)',
    language: 'Automatic',
    credits: 3000,
    monthlyCreditQuota: 3000,
    completedLessonsCount: 3,
    status: 'active',
  },

  student_dawei: {
    id: 'usr_student_dawei',
    name: '学员大伟 (挂靠学员 9)',
    email: 'dawei.student@gmail.com',
    role: 'student',
    isLoggedIn: true,
    memberSince: 'Aug 01, 2026',
    plan: 'pro',
    institutionId: 'inst_003',
    institutionName: '独立音乐家吉他工坊',
    teacherId: 'usr_teacher_zhou',
    teacherName: '周导师 (摇滚电吉他)',
    language: 'Automatic',
    credits: 3000,
    monthlyCreditQuota: 3000,
    completedLessonsCount: 9,
    status: 'active',
  },

  // 5. 付费订阅用户 (Plus - 600 Credits / 月)
  plus: {
    id: 'usr_plus_zhang',
    name: '张峰 (Plus 付费会员 4)',
    email: 'zhangfeng.guitar@gmail.com',
    role: 'plus',
    isLoggedIn: true,
    memberSince: 'Sep 10, 2026',
    plan: 'plus',
    language: 'Automatic',
    credits: 600,
    monthlyCreditQuota: 600,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
    phone: '13812345678',
    bio: '独立吉他爱好者，每月制作指弹独奏视频。',
  },

  plus_zhao: {
    id: 'usr_plus_zhao',
    name: '赵晓雅 (Plus 年付会员 5)',
    email: 'xiaoya.zhao@gmail.com',
    role: 'plus',
    isLoggedIn: true,
    memberSince: 'Aug 22, 2026',
    plan: 'plus',
    language: 'Automatic',
    credits: 600,
    monthlyCreditQuota: 600,
    creditsCycleResetDate: '2026-11-01',
    optOutAiTraining: true,
    status: 'active',
  },

  // 6. 普通试用用户 (Plan 1: Free - 600 Credits 到期清零)
  trial_guest: {
    id: 'usr_trial_guest',
    name: '试用游客 (普通试用用户 11)',
    email: 'guest@test.com',
    role: 'trial_guest',
    isLoggedIn: true,
    memberSince: 'Oct 01, 2026',
    plan: 'trial',
    trialActive: true,
    trialExpiresAt: '2026-10-15',
    language: 'Automatic',
    credits: 600,
    monthlyCreditQuota: 600,
    status: 'active',
  },

  // 7. 普通注册用户 (0 Credits, 未开启试用, 限前8小节)
  registered: {
    id: 'usr_reg_xu',
    name: '徐明 (普通注册用户 24)',
    email: 'xuming.reg@163.com',
    role: 'registered',
    isLoggedIn: true,
    memberSince: 'Oct 02, 2026',
    plan: 'free',
    trialActive: false,
    language: 'Automatic',
    credits: 0,
    monthlyCreditQuota: 0,
    status: 'active',
    bio: '刚注册吉他爱好者，暂未开启 14 天试用。',
  },

  registered_zhu: {
    id: 'usr_reg_zhu',
    name: '朱琳 (普通注册用户 25)',
    email: 'zhulin.reg@qq.com',
    role: 'registered',
    isLoggedIn: true,
    memberSince: 'Oct 03, 2026',
    plan: 'free',
    trialActive: false,
    language: 'Automatic',
    credits: 0,
    status: 'active',
  },

  // 8. 匿名用户 (免登录访客)
  anonymous: {
    id: 'usr_anonymous',
    name: '匿名访客 (未登录)',
    email: 'anonymous@guitarmate.internal',
    role: 'anonymous',
    isLoggedIn: false,
    memberSince: 'Today',
    plan: 'free',
    language: 'Automatic',
    credits: 0,
    status: 'active',
  }
};

// Default current user is Gardenart (Super Admin with full privileges)
export const DEFAULT_USER: UserProfile = DEMO_USERS.super_admin;
