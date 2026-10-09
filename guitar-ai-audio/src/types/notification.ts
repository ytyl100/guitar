export type NotificationType = 'feedback' | 'score_update' | 'drill_award' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  summary: string;
  content: string;
  timeAgo: string;
  timestamp: string;
  isRead: boolean;
  tag?: string;
  author?: string;
  scoreId?: string;
  courseId?: string;
}

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif_001',
    type: 'feedback',
    title: '【作业批阅】第2章 F大横按发力要领打卡已批阅',
    summary: '李老师已批阅您的 F 大横按打卡视频',
    content: '李老师评语：“大拇指支撑位与食指侧面倾斜角度非常标准，3品音色通透无杂音。已核准本章节学习打卡，建议下一步将节拍器提升至 85 BPM 尝试跟练！”',
    timeAgo: '10 分钟前',
    timestamp: '2026-10-04 14:30',
    isRead: false,
    tag: '评分 96分 · 优秀',
    author: '李老师 (认证名师)',
    courseId: 'course_001',
  },
  {
    id: 'notif_002',
    type: 'score_update',
    title: '【乐谱更新】《Macaroon 5》双轨乐谱发布 v2.5',
    summary: '官方 AI 双轨乐谱已更新优化',
    content: '《Macaroon 5 · Acoustic Solo》已根据导师示范微调了第 3-4 小节的高音旋律线与六线 TAB 品位规划，支持五线谱+六线谱实时指板同步跟练。',
    timeAgo: '1 小时前',
    timestamp: '2026-10-04 13:20',
    isRead: false,
    tag: '双轨乐谱 · v2.5',
    author: 'GuitarMate AI Studio',
    scoreId: 'macaroon_5_demo',
  },
  {
    id: 'notif_003',
    type: 'drill_award',
    title: '【挑战达标】流行经典 1645 万能走向达标！',
    summary: '已通过 110 BPM 阶梯微测考核',
    content: '恭喜！您已成功完成 110 BPM 和弦微测阶梯挑战，左手指法转换流畅度达标，系统已自动发放 5 学分至您的账户，可在用户中心抵扣专修教程。',
    timeAgo: '昨天 17:40',
    timestamp: '2026-10-03 17:40',
    isRead: false,
    tag: '+5 学分奖励',
    author: '和弦微测系统',
  },
  {
    id: 'notif_004',
    type: 'system',
    title: '【系统公告】初级吉他系统课 13 章节全新上线',
    summary: '支持打点视频、实战乐谱与和弦阶梯联动',
    content: '初学民谣指弹与和弦转换速成课纲已全面扩充为 13 章节科学阶梯，并打通打点视频研读、交互式双行谱跟练与和弦微测考核全流程打卡。',
    timeAgo: '2 天前',
    timestamp: '2026-10-02 09:00',
    isRead: true,
    tag: '课程体系升级',
    author: '系统教务组',
    courseId: 'course_001',
  },
];
