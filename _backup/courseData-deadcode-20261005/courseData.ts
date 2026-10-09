import { ScoreData } from '../types/music';
import { MACAROON_5_SCORE } from './macaroon5Demo';
import { LAID_BACK_GUITARS_SCORE } from './libraryData';

export interface CourseLesson {
  id: string;
  title: string;
  duration: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  focus: string;
  score: ScoreData;
  bpmTarget: number;
}

export interface CourseTrack {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  totalLessons: number;
  totalHours: string;
  category: 'fingerstyle' | 'pop' | 'electric' | 'theory';
  description: string;
  skills: string[];
  lessons: CourseLesson[];
  featuredScore: ScoreData;
  coverImage: string;
}

export interface StudentPracticeRecord {
  id: string;
  courseTitle: string;
  lessonTitle: string;
  lastPracticed: string;
  progressPercent: number;
  currentBpm: number;
  targetBpm: number;
  measuresMastered: string;
  score: ScoreData;
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  targetMeasures: string;
  targetBpm: number;
  status: 'pending' | 'submitted' | 'graded';
  aiScore?: number;
  teacherFeedback?: string;
  score: ScoreData;
}

export const GUITAR_COURSE_TRACKS: CourseTrack[] = [
  {
    id: 'fingerstyle-foundations',
    title: '初学指弹筑基与独立性',
    subtitle: 'Acoustic Fingerstyle Foundations',
    level: '入门至进阶',
    totalLessons: 8,
    totalHours: '6.5 小时',
    category: 'fingerstyle',
    description: '从持琴手型与靠弦/勾弦音色对比切入，专修 P-i-m-a 拇指交替低音独立性、Travis Picking 律动与双音旋律线，奠定指弹核心根基。',
    skills: ['拇指独立低音交替', '双音分解与和弦琶音', 'Travis Picking 律动', '把位自然音阶串联'],
    coverImage: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&auto=format&fit=crop&q=80',
    featuredScore: MACAROON_5_SCORE,
    lessons: [
      {
        id: 'fs-01',
        title: '第 1 讲：右手 P-i-m-a 靠弦与勾弦发力几何',
        duration: '18 分钟',
        level: 'Beginner',
        focus: '手腕平整度与拇指低音共鸣',
        score: MACAROON_5_SCORE,
        bpmTarget: 70,
      },
      {
        id: 'fs-02',
        title: '第 2 讲：Travis Picking 交替低音与旋律分离',
        duration: '22 分钟',
        level: 'Intermediate',
        focus: '4/5/6 弦低音与 1/2 弦反拍点缀',
        score: LAID_BACK_GUITARS_SCORE,
        bpmTarget: 88,
      },
      {
        id: 'fs-03',
        title: '第 3 讲：低把位至第 7 把位双音模进实战',
        duration: '25 分钟',
        level: 'Intermediate',
        focus: '三度与六度双音旋律连贯性',
        score: MACAROON_5_SCORE,
        bpmTarget: 95,
      },
    ],
  },
  {
    id: 'pop-accompaniment',
    title: '流行民谣弹唱与和弦宝典',
    subtitle: 'Pop Accompaniment & Harmony Mastery',
    level: '零基础至中级',
    totalLessons: 12,
    totalHours: '9 小时',
    category: 'pop',
    description: '破解大横按 F 和弦无痛发力秘密，掌握 1645 与卡农万能和弦走向，系统学习切音拍弦（Slap）与复合扫弦律动，让你随心自弹自唱。',
    skills: ['大横按无痛发力法', '拍弦击弦（Slap）技巧', '1645 / 4536251 走向', '移调夹 Capo 深度运用'],
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    featuredScore: LAID_BACK_GUITARS_SCORE,
    lessons: [
      {
        id: 'pop-01',
        title: '第 1 讲：大横按 F 和弦骨骼杠杆发力与食指侧面接触',
        duration: '20 分钟',
        level: 'Beginner',
        focus: '虎口放松与大拇指支撑中线',
        score: LAID_BACK_GUITARS_SCORE,
        bpmTarget: 75,
      },
      {
        id: 'pop-02',
        title: '第 2 讲：经典 1645 与 4536251 和弦平滑换指技巧',
        duration: '24 分钟',
        level: 'Intermediate',
        focus: '保留共同指与无缝跨把位',
        score: MACAROON_5_SCORE,
        bpmTarget: 85,
      },
      {
        id: 'pop-03',
        title: '第 3 讲：拍弦切音与复合扫弦重音摇摆（Swing）',
        duration: '28 分钟',
        level: 'Intermediate',
        focus: '大拇指击弦与手掌根消音配合',
        score: LAID_BACK_GUITARS_SCORE,
        bpmTarget: 92,
      },
    ],
  },
  {
    id: 'electric-lead',
    title: '电吉他主音与音阶即兴',
    subtitle: 'Electric Lead & Pentatonic Solos',
    level: '中级至高级',
    totalLessons: 10,
    totalHours: '8 小时',
    category: 'electric',
    description: '小调五声音阶 5 大把位立体串联、精准全音与 1/4 音推弦、击勾弦（Legato）与速弹点弦技巧，从音符复读机进阶为有表达力的主音吉他手。',
    skills: ['五声音阶 5 大把位串联', '推弦揉弦音准控制', '击勾连奏（Legato）', '蓝调音与和弦外音即兴'],
    coverImage: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=600&auto=format&fit=crop&q=80',
    featuredScore: MACAROON_5_SCORE,
    lessons: [
      {
        id: 'elec-01',
        title: '第 1 讲：A 小调五声音阶 1-5 把位滑指串联',
        duration: '22 分钟',
        level: 'Intermediate',
        focus: '三指推弦与手腕旋转揉弦',
        score: MACAROON_5_SCORE,
        bpmTarget: 90,
      },
      {
        id: 'elec-02',
        title: '第 2 讲：B.B. King 蓝调盒子把位与灵魂推弦',
        duration: '26 分钟',
        level: 'Advanced',
        focus: '微调推弦与颤音音色控制',
        score: LAID_BACK_GUITARS_SCORE,
        bpmTarget: 88,
      },
    ],
  },
  {
    id: 'sight-reading',
    title: '专业视谱与节奏律动工坊',
    subtitle: 'Sight Reading & Rhythmic Training',
    level: '全阶段通用',
    totalLessons: 6,
    totalHours: '5 小时',
    category: 'theory',
    description: '打破对六线谱的盲目依赖，建立五线谱绝对音高与吉他 6 根琴弦实物映射，攻克切分音、附点与三连音重音转移，建立稳固内心节拍钟。',
    skills: ['五线谱六线谱互译', '切分音附点精准视奏', '三连音与摇摆微节拍', '盲弹把位听音定位'],
    coverImage: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    featuredScore: LAID_BACK_GUITARS_SCORE,
    lessons: [
      {
        id: 'read-01',
        title: '第 1 讲：五线谱第一把位自然音符与琴弦绝对定位',
        duration: '20 分钟',
        level: 'Beginner',
        focus: 'C 大调自然音盲弹不看手',
        score: LAID_BACK_GUITARS_SCORE,
        bpmTarget: 60,
      },
      {
        id: 'read-02',
        title: '第 2 讲：十六分音符切分音与附点弱起重音攻关',
        duration: '25 分钟',
        level: 'Intermediate',
        focus: '节拍机反拍跟踩与双手交替',
        score: MACAROON_5_SCORE,
        bpmTarget: 80,
      },
    ],
  },
];

export const INITIAL_STUDENT_PRACTICE: StudentPracticeRecord[] = [
  {
    id: 'rec-01',
    courseTitle: '初学指弹筑基与独立性',
    lessonTitle: '第 2 讲：Travis Picking 交替低音与旋律分离',
    lastPracticed: '今日 14:20',
    progressPercent: 78,
    currentBpm: 76,
    targetBpm: 88,
    measuresMastered: '第 1-8 小节',
    score: MACAROON_5_SCORE,
  },
  {
    id: 'rec-02',
    courseTitle: '流行民谣弹唱与和弦宝典',
    lessonTitle: '第 1 讲：大横按 F 和弦骨骼杠杆发力与换指',
    lastPracticed: '昨天 21:05',
    progressPercent: 92,
    currentBpm: 82,
    targetBpm: 85,
    measuresMastered: '第 1-12 小节',
    score: LAID_BACK_GUITARS_SCORE,
  },
];

export const INITIAL_HOMEWORK_LIST: HomeworkAssignment[] = [
  {
    id: 'hw-01',
    title: '《Macaroon 5》前奏 1-8 小节稳定度达标（目标 80 BPM）',
    course: '初学指弹筑基与独立性',
    dueDate: '2026-10-05',
    targetMeasures: '第 1-8 小节',
    targetBpm: 80,
    status: 'submitted',
    aiScore: 94,
    teacherFeedback: '低音交替十分平稳！第 6 小节第 3 拍高音弦略有杂音，注意食指起弦动作要干净。',
    score: MACAROON_5_SCORE,
  },
  {
    id: 'hw-02',
    title: '《Laid Back Guitars》G 大调和弦琶音变速循环（60->88 BPM）',
    course: '流行民谣弹唱与和弦宝典',
    dueDate: '2026-10-08',
    targetMeasures: '第 1-16 小节',
    targetBpm: 88,
    status: 'pending',
    score: LAID_BACK_GUITARS_SCORE,
  },
];
