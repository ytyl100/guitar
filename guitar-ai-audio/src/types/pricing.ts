export type PricingBillingCycle = 'monthly' | 'yearly';

export interface PricingPlan {
  id: 'free' | 'plus' | 'pro' | 'enterprise';
  planTier: 'Plan 1' | 'Plan 2' | 'Plan 3' | 'Plan 4';
  title: string;
  subtitle: string;
  badge?: string;
  isPopular?: boolean;
  priceMonthly: string;
  priceYearly: string;
  priceMonthlyNum: number;
  priceYearlyNum: number;
  periodMonthly: string;
  periodYearly: string;
  savingsBadge?: string;
  
  // Specs matching roadmap 5.2
  maxSingleTranscriptionDuration: string;
  monthlyCredits: string;
  equivalentAudioMinutes: string;
  exportFormats: string;
  curriculumAccess: string;
  aiModelTrainingPrivacy: string;
  supportLevel: string;
  
  ctaText: string;
  ctaVariant: 'secondary' | 'primary' | 'pro' | 'enterprise';
}

export interface EnterpriseLead {
  id: string;
  fullName: string;
  workEmail: string;
  companyName: string;
  monthlyMinutes: string;
  useCases: string[];
  notes?: string;
  createdAt: string;
  status: 'new' | 'contacted' | 'negotiating' | 'closed';
}

export interface CreditRecoveryRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'teacher' | 'institution';
  currentCredits: number;
  requestedAmount: number; // 5000 credits standard
  reason: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number; // negative for deduction, positive for grant
  type: 'transcription' | 'curriculum_publish' | 'monthly_reset' | 'admin_grant' | 'trial_grant' | 'recovery_approved';
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    planTier: 'Plan 1',
    title: 'Free (试用)',
    subtitle: '适合初次体验吉他 AI 转录与基础体验课的爱好者',
    priceMonthly: '$0',
    priceYearly: '$0',
    priceMonthlyNum: 0,
    priceYearlyNum: 0,
    periodMonthly: '免费试用 14 天',
    periodYearly: '永久免费体验',
    maxSingleTranscriptionDuration: '30 秒 或 8 个小节',
    monthlyCredits: '600 credits (试用期内一次性)',
    equivalentAudioMinutes: '累计最多 60 分钟',
    exportFormats: '仅网页在线播放',
    curriculumAccess: '体验课第 1 课',
    aiModelTrainingPrivacy: '默认参与模型训练',
    supportLevel: '社区基础支持',
    ctaText: 'Start 14-Day Trial',
    ctaVariant: 'secondary',
  },
  {
    id: 'plus',
    planTier: 'Plan 2',
    title: 'Plus (付费用户)',
    subtitle: '专为独立进阶吉他手与个人创作者设计的转录工作流',
    priceMonthly: '$9.99',
    priceYearly: '$8.49',
    priceMonthlyNum: 9.99,
    priceYearlyNum: 8.49,
    periodMonthly: '/ 月 (¥19/月)',
    periodYearly: '/ 月 (按年付 $101.88，省 15%)',
    savingsBadge: 'Save 15%',
    maxSingleTranscriptionDuration: '单次最长支持 15 分钟',
    monthlyCredits: '600 credits / 月 (每月1号恢复)',
    equivalentAudioMinutes: '每月总计 60 分钟',
    exportFormats: 'MIDI, MusicXML, PDF, Guitar Pro 导出',
    curriculumAccess: '平台官方基础课程全量开放',
    aiModelTrainingPrivacy: 'Opt out (可退出 AI 训练)',
    supportLevel: '标准邮件技术支持',
    ctaText: 'Upgrade to Plus',
    ctaVariant: 'primary',
  },
  {
    id: 'pro',
    planTier: 'Plan 3',
    title: 'Pro (学员推荐)',
    subtitle: '师承进阶学员首选，解锁名师大纲与高频转录额度',
    badge: '名师推荐 · 最受欢迎',
    isPopular: true,
    priceMonthly: '$19.99',
    priceYearly: '$16.99',
    priceMonthlyNum: 19.99,
    priceYearlyNum: 16.99,
    periodMonthly: '/ 月',
    periodYearly: '/ 月 (按年付 $203.88，省 15%)',
    savingsBadge: 'Save 15%',
    maxSingleTranscriptionDuration: '单次最长支持 15 分钟',
    monthlyCredits: '3000 credits / 月 (每月续费恢复)',
    equivalentAudioMinutes: '每月总计 300 分钟',
    exportFormats: 'MIDI, MusicXML, PDF, Guitar Pro 导出',
    curriculumAccess: '解锁名师专属完整课程大纲资源',
    aiModelTrainingPrivacy: 'Opt out (可退出 AI 训练)',
    supportLevel: '优先通道技术支持 + 教师答疑',
    ctaText: 'Get Pro Student Plan',
    ctaVariant: 'pro',
  },
  {
    id: 'enterprise',
    planTier: 'Plan 4',
    title: 'Enterprise (企业定制)',
    subtitle: '为吉他琴行、连锁音乐学校与院校教研室提供一站式解决方案',
    priceMonthly: 'Custom',
    priceYearly: 'Custom',
    priceMonthlyNum: 0,
    priceYearlyNum: 0,
    periodMonthly: '商务面议',
    periodYearly: '年度专属合同',
    maxSingleTranscriptionDuration: '自定义时长 (无单次限制)',
    monthlyCredits: '按需无限定制 Credits 额度',
    equivalentAudioMinutes: '批量大并发专用通道',
    exportFormats: '完整格式导出 + 批量乐谱打包导出',
    curriculumAccess: '机构私有课纲库与定制教务系统集成',
    aiModelTrainingPrivacy: '企业级专属物理隔离训练通道',
    supportLevel: 'API 接口集成 + 专属 1v1 客户经理',
    ctaText: 'Contact Sales',
    ctaVariant: 'enterprise',
  },
];
