/**
 * 「我的」页面的数据与类型
 * =========================
 *
 * ⚠️ **逐字移植**自 Web 版：
 * - `guitarmate-frontend/src/types.ts` → `UserProfile` / `PaymentRecord` / `Course`（这里只留用到的字段）
 * - `guitarmate-frontend/src/data/mockData.ts` → `INITIAL_USER_PROFILE` / `INITIAL_PAYMENT_RECORDS` /
 *   `INITIAL_COURSES` 里的 `first-timers` 那门课
 *
 * 这些是**演示数据**：小程序还没有账号体系，后端也没有用户/订单表（`Schema.prisma` 里只有
 * Score / Measure / Project 这些内容侧的表）。所以刻意与 Web 版保持一致 ——
 * 改动这里的数字就等于改了 Web 版的行为，而 Web 版才是「设计基准」。
 *
 * 将来接了真实账号后，这个文件整体替换成 `GET /api/me` + `GET /api/me/orders` 即可，
 * 页面代码不用动（它只认下面的类型）。
 */

export interface UserProfile {
  name: string;
  avatar: string;
  /** 会员状态文案，如「VIP学员」 */
  memberStatus: string;
  vipExpiryDate: string;
  daysStreak: number;
  totalPracticeMins: number;
  masteredChordsCount: number;
  completedSongsCount: number;
  enrolledCourseId: string;
}

export interface PaymentRecord {
  id: string;
  orderNumber: string;
  title: string;
  amount: number;
  date: string;
  status: string;
  channel: string;
}

/** 只保留「我的」页面要展示的字段（Web 的 `Course` 还带 chapters，那是 Learn 页用的） */
export interface EnrolledCourse {
  id: string;
  title: string;
  subtitle: string;
  coverImage: string;
  totalSteps: number;
  completedSteps: number;
}

export const USER_PROFILE: UserProfile = {
  name: '弦动心生 (Guitarist Lee)',
  avatar:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  memberStatus: 'VIP学员',
  vipExpiryDate: '2027-09-12',
  daysStreak: 16,
  totalPracticeMins: 385,
  masteredChordsCount: 14,
  completedSongsCount: 3,
  enrolledCourseId: 'first-timers',
};

export const PAYMENT_RECORDS: PaymentRecord[] = [
  {
    id: 'pay-001',
    orderNumber: 'WX202609128849201',
    title: 'GuitarMate Pro 全年VIP订阅',
    amount: 198.0,
    date: '2026-09-12 14:32',
    status: 'SUCCESS',
    channel: '微信支付 (WeChat Pay)',
  },
  {
    id: 'pay-002',
    orderNumber: 'WX202608157731992',
    title: '零基础民谣吉他系统训练营',
    amount: 99.0,
    date: '2026-08-15 19:10',
    status: 'SUCCESS',
    channel: '微信支付 (WeChat Pay)',
  },
  {
    id: 'pay-003',
    orderNumber: 'WX202607015520119',
    title: '吉他专业调音伴奏工具箱永久包',
    amount: 29.0,
    date: '2026-07-01 10:05',
    status: 'SUCCESS',
    channel: '微信支付 (WeChat Pay)',
  },
];

export const ENROLLED_COURSE: EnrolledCourse = {
  id: 'first-timers',
  title: 'First Timers Start Here',
  subtitle: 'Learn your first chords and song',
  coverImage:
    'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=800&auto=format&fit=crop&q=80',
  totalSteps: 13,
  completedSteps: 1,
};
