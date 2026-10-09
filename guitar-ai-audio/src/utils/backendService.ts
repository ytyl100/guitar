import { 
  CourseCurriculum, 
  CourseChapter, 
  ChapterContentItem, 
  TeachingVideo, 
  ChordDrillCombination 
} from '../types/curriculum';
import { UserProfile, DEMO_USERS } from '../types/auth';
import { CreditRecoveryRequest, CreditTransaction, EnterpriseLead, PricingPlan, PRICING_PLANS } from '../types/pricing';
import { AppNotification, INITIAL_NOTIFICATIONS } from '../types/notification';
import { INITIAL_LIBRARY_ITEMS, TranscriptionItem } from '../data/libraryData';
import {
  userApi,
  userGroupApi,
  courseApi,
  videoApi,
  drillApi,
  libraryApi,
  creditRecoveryApi,
  enterpriseLeadApi,
  notificationApi,
  pricingPlanApi,
} from '../services/apiClient';

/**
 * ⚠️ **已退役的 localStorage 键**（保留仅为记录迁移范围 + 将来做一次性清理）。
 *
 * 下面这些键就是原先的「假数据库」：现在数据都在 `guitarmate-audio-backend` 的库里，
 * 前端**不再读写**它们。刻意**不主动删除**存量数据 —— 迁移是分域推进的
 * （需求 (1) 用户已完成，需求 (2)(3)(4) 进行中），
 * 在全部迁完并验证之前删掉本机旧数据，等于把唯一的兜底副本销毁。
 * 等需求 (3)(4) 也验收通过，再统一做清理（或让用户自己清）。
 */
export const LEGACY_LOCAL_STORAGE_KEYS = [
  'guitarmate_backend_courses_v1',
  'guitarmate_backend_videos_v1',
  'guitarmate_backend_drills_v1',
  'guitarmate_backend_users_v2',
  'guitarmate_backend_user_progress_v1',
  'guitarmate_backend_credit_requests_v1',
  'guitarmate_backend_credit_transactions_v1',
  'guitarmate_backend_enterprise_leads_v1',
] as const;

// Initial Seed Videos with Cue Points
/**
 * ⚠️ 下面三个 `INITIAL_*` 是**迁移用的种子数据**（需求 (2)）。
 * 导出是给 `scripts/migrate-to-backend.ts` 用的 —— 种子的唯一来源留在这里，
 * 后端源码里不再存一份，以免日后两处定义漂移（仓库既有约定）。
 */
export const INITIAL_VIDEOS: TeachingVideo[] = [
  {
    id: 'vid_001',
    title: '民谣吉他基础扫弦律动精讲与右手指力拆解',
    description: '详述下扫与上挑手指发力比例，第 4 拍切音停顿点控制。',
    category: '指法扫弦',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
    durationFormatted: '08:45',
    associatedCourseId: 'course_001',
    associatedCourseTitle: '初学民谣指弹与和弦转换',
    status: 'published',
    videoSourceType: 'link',
    cuePoints: [
      { id: 'cue_1', timeSeconds: 15, timeFormatted: '00:15', label: '手腕自然下沉姿势' },
      { id: 'cue_2', timeSeconds: 85, timeFormatted: '01:25', label: '下扫三四弦过弦角度' },
      { id: 'cue_3', timeSeconds: 210, timeFormatted: '03:30', label: '重音切分点示范与练习' },
      { id: 'cue_4', timeSeconds: 420, timeFormatted: '07:00', label: '双行谱表与原速跟练' },
    ],
  },
  {
    id: 'vid_002',
    title: 'F大横按秒按技巧与食指侧边缘发力原理',
    description: '破解初学者手酸无力难题，利用琴颈杠杆力轻松按响 1 品。',
    category: '大横按专修',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-acoustic-guitar-in-nature-41274-large.mp4',
    durationFormatted: '12:20',
    associatedCourseId: 'course_001',
    associatedCourseTitle: '初学民谣指弹与和弦转换',
    status: 'published',
    videoSourceType: 'link',
    cuePoints: [
      { id: 'cue_5', timeSeconds: 30, timeFormatted: '00:30', label: '食指微转侧面接触琴弦' },
      { id: 'cue_6', timeSeconds: 150, timeFormatted: '02:30', label: '大拇指支撑中线高度' },
      { id: 'cue_7', timeSeconds: 360, timeFormatted: '06:00', label: '从 C 和弦快速切换到 F' },
    ],
  },
  {
    id: 'vid_003',
    title: '流行指弹经典前奏独奏与加花技巧',
    description: '拇指低音交替根音加高音旋律线，打造饱满独奏声场。',
    category: '流行独奏',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
    durationFormatted: '15:10',
    associatedCourseId: 'course_002',
    associatedCourseTitle: '流行吉他编配与指弹进阶',
    status: 'published',
    videoSourceType: 'link',
    cuePoints: [
      { id: 'cue_8', timeSeconds: 45, timeFormatted: '00:45', label: '主旋律音符时值保持' },
      { id: 'cue_9', timeSeconds: 240, timeFormatted: '04:00', label: '击弦与勾弦音量均衡' },
      { id: 'cue_10', timeSeconds: 510, timeFormatted: '08:30', label: '自然泛音点弹法' },
    ],
  },
];

// Initial Seed Chord Combinations
export const INITIAL_DRILLS: ChordDrillCombination[] = [
  {
    id: 'drill_001',
    title: '流行经典 1645 万能走向',
    chords: ['C', 'Am', 'F', 'G'],
    bpmStart: 60,
    bpmTarget: 110,
    steps: [60, 75, 90, 105, 110],
    description: '流行音乐最高频进行的和弦轮换微测，训练无缝换把。',
    createdAt: '2026-09-20',
    status: 'published',
  },
  {
    id: 'drill_002',
    title: '卡农进行黄金和弦环',
    chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'],
    bpmStart: 55,
    bpmTarget: 95,
    steps: [55, 65, 80, 95],
    description: '涵盖初学必备全系开放和弦，左手肌肉记忆强化。',
    createdAt: '2026-09-25',
    status: 'published',
  },
  {
    id: 'drill_003',
    title: '爵士/城市流行 II-V-I 扩展和弦走向',
    chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
    bpmStart: 70,
    bpmTarget: 120,
    steps: [70, 85, 100, 115, 120],
    description: '七和弦色彩与柔和声响切换微测。',
    createdAt: '2026-09-28',
    status: 'published',
  },
  {
    id: 'drill_004',
    title: '经典吉他摇滚挂留色彩走向',
    chords: ['Dsus4', 'D', 'Dsus2', 'D'],
    bpmStart: 80,
    bpmTarget: 130,
    steps: [80, 95, 110, 125, 130],
    description: '食指与无名指快速起落独立性微测。',
    createdAt: '2026-09-30',
    status: 'published',
  },
  {
    id: 'drill_005',
    title: '开放和弦全能基础四和弦环',
    chords: ['Em', 'C', 'G', 'D'],
    bpmStart: 60,
    bpmTarget: 115,
    steps: [60, 75, 90, 105, 115],
    description: '欧美流行热单万能 4 和弦循环转换训练。',
    createdAt: '2026-10-01',
    status: 'published',
  },
];

// Initial Seed Courses with 3-tier structure (13 complete chapters for beginner system course)
export const INITIAL_COURSES: CourseCurriculum[] = [
  {
    id: 'course_001',
    title: '初学民谣指弹与和弦转换速成 (初级吉他系统精讲)',
    subtitle: 'Acoustic Foundations & Rapid Chord Transition · 13 Lessons Full Course',
    description: '专为吉他初学者与零基础自学者定制的系统课纲，涵盖13大递进章节与20分钟切片练习法：从吉他构造持琴坐姿、指弹发力，到全套开放和弦、F大横按突破，再到击勾弦、泛音与Macaroon 5毕业曲双轨实战考核。',
    coverImage: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
    level: '零基础 / 初级',
    totalLessons: 13,
    totalHours: '10.5 小时',
    category: '民谣指弹',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    isSystemBasic: true,
    isFree: true,
    status: 'published',
    version: 'v2.5',
    versionHistory: [
      { version: 'v2.5', date: '2026-10-02', author: '李老师', note: '补全 13 章节全套体系，支持视频打点、实战乐谱与和弦阶梯联动' },
      { version: 'v2.1', date: '2026-09-28', author: '李老师', note: '优化了第2章大横按微测打点，增加AI双行谱同步' },
      { version: 'v2.0', date: '2026-09-15', author: '李老师', note: '全新编排 20 分钟模块化切片课程结构' },
      { version: 'v1.0', date: '2026-08-01', author: '李老师', note: '初始大纲创建' },
    ],
    orderIndex: 1,
    chapters: [
      {
        id: 'chap_101',
        title: '第一章 · 吉他构造、持琴与右手指弹发力',
        category: '基本功',
        description: '掌握正确持琴角度，建立右手拇指、食指、中指、无名指分配分工与指甲修剪标准。',
        totalDuration: '45 分钟',
        orderIndex: 1,
        items: [
          {
            id: 'item_101_1',
            title: '教学精讲：右手指弹姿势与指甲修剪标准',
            type: 'video',
            description: '讲解 P-I-M-A 手指自然落弦角度与肌肉放松',
            orderIndex: 1,
            videoId: 'vid_001',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
            cuePoints: INITIAL_VIDEOS[0].cuePoints,
          },
          {
            id: 'item_101_2',
            title: '实战乐谱：右手空弦拨弦与音色均匀度练习谱',
            type: 'transcription_score',
            description: '加载系统 AI 高精度五线谱与六线 TAB 练习',
            orderIndex: 2,
            scoreId: 'canon-in-d',
            scoreTitle: '空弦拨弦热身谱 · 60 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_102',
        title: '第二章 · 核心开放和弦快速转换与微测',
        category: '和弦转换',
        description: '重点攻克 C、Am、F、G 和弦转换卡顿，掌握共用指与保留指要领。',
        totalDuration: '60 分钟',
        orderIndex: 2,
        items: [
          {
            id: 'item_102_1',
            title: '专项突破：C与Am共用指保留要领',
            type: 'video',
            description: '大拇指与食指配合发力拆解，消除换和弦杂音',
            orderIndex: 1,
            videoId: 'vid_002',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-acoustic-guitar-in-nature-41274-large.mp4',
            cuePoints: INITIAL_VIDEOS[1].cuePoints,
          },
          {
            id: 'item_102_2',
            title: '和弦微测：流行经典 1645 万能走向阶梯挑战',
            type: 'chord_drill',
            description: '阶梯提升速度从 60 BPM 到 110 BPM',
            orderIndex: 2,
            chordDrillId: 'drill_001',
            chords: ['C', 'Am', 'F', 'G'],
            bpmTarget: 110,
          },
        ],
      },
      {
        id: 'chap_103',
        title: '第三章 · 节拍器与 4/4 拍扫弦节奏型',
        category: '扫弦节奏',
        description: '掌握节拍器稳定对齐，下扫与上扫手腕阻尼感，消除扫弦僵硬。',
        totalDuration: '50 分钟',
        orderIndex: 3,
        items: [
          {
            id: 'item_103_1',
            title: '教学视频：扫弦手腕放松与音色通透要诀',
            type: 'video',
            description: '观察手腕在琴弦上方画弧线动作，避免手臂直上直下硬砸',
            orderIndex: 1,
            videoId: 'vid_001',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
            cuePoints: INITIAL_VIDEOS[0].cuePoints,
          },
          {
            id: 'item_103_2',
            title: '实战乐谱：四分音符与八分音符基础扫弦跟练谱',
            type: 'transcription_score',
            description: '双行五线谱与TAB下上扫箭头实时高亮跟练',
            orderIndex: 2,
            scoreId: 'laid-back-guitars',
            scoreTitle: '基础扫弦练习曲 · 72 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_104',
        title: '第四章 · 爬指基本功与左手按弦发力优化',
        category: '左手机能',
        description: '通过食指至小指半音阶爬格子训练，强化四指独立性与无痛按弦。',
        totalDuration: '55 分钟',
        orderIndex: 4,
        items: [
          {
            id: 'item_104_1',
            title: '教学视频：左手大拇指支撑与一品一指正确姿态',
            type: 'video',
            description: '指尖立起垂直触弦，避免小拇指蜷缩飞行',
            orderIndex: 1,
            videoId: 'vid_002',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-acoustic-guitar-in-nature-41274-large.mp4',
            cuePoints: INITIAL_VIDEOS[1].cuePoints,
          },
          {
            id: 'item_104_2',
            title: '和弦微测：开放和弦全能四和弦环',
            type: 'chord_drill',
            description: '强化 Em - C - G - D 左手肌肉记忆',
            orderIndex: 2,
            chordDrillId: 'drill_005',
            chords: ['Em', 'C', 'G', 'D'],
            bpmTarget: 115,
          },
        ],
      },
      {
        id: 'chap_105',
        title: '第五章 · 经典民谣分解节奏型 53231323 实战',
        category: '分解和弦',
        description: '最经典的民谣分解节奏型实战，拇指稳控低音，三指细腻拨弦。',
        totalDuration: '45 分钟',
        orderIndex: 5,
        items: [
          {
            id: 'item_105_1',
            title: '教学精讲：右手手指轮流发力与声音颗粒度',
            type: 'video',
            description: 'P-I-M-I-A-I-M-I 右手循环拨弦连贯性',
            orderIndex: 1,
            videoId: 'vid_001',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
            cuePoints: INITIAL_VIDEOS[0].cuePoints,
          },
          {
            id: 'item_105_2',
            title: '实战乐谱：经典分解和弦慢速伴奏谱',
            type: 'transcription_score',
            description: '跟练双行谱完整 8 小节分解循环',
            orderIndex: 2,
            scoreId: 'a-minor-etude',
            scoreTitle: '民谣经典分解琶音 · 68 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_106',
        title: '第六章 · F 大横按与大拇指力学专项攻克',
        category: '横按突破',
        description: '攻克吉他初学者最大拦路虎：F 大横按食指侧面受力与手腕放松。',
        totalDuration: '65 分钟',
        orderIndex: 6,
        items: [
          {
            id: 'item_106_1',
            title: '专项视频：利用琴体后靠杠杆力轻松横按',
            type: 'video',
            description: '食指微向左倾斜侧面按弦，右手轻轻往后搂琴体',
            orderIndex: 1,
            videoId: 'vid_002',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-acoustic-guitar-in-nature-41274-large.mp4',
            cuePoints: INITIAL_VIDEOS[1].cuePoints,
          },
          {
            id: 'item_106_2',
            title: '和弦微测：大横按万能走向 60-110 速度考核',
            type: 'chord_drill',
            description: '考核从 C 和弦跳跃至 F 大横按的反应时间',
            orderIndex: 2,
            chordDrillId: 'drill_001',
            chords: ['C', 'Am', 'F', 'G'],
            bpmTarget: 110,
          },
          {
            id: 'item_106_3',
            title: '实战乐谱：F和弦过渡实战跟练谱',
            type: 'transcription_score',
            description: '攻克实战歌曲中的横按音色清晰度',
            orderIndex: 3,
            scoreId: 'laid-back-guitars',
            scoreTitle: 'F大横按歌曲片段精练 · 65 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_107',
        title: '第七章 · 常用切音与打板节奏型技巧',
        category: '打击技巧',
        description: '引入打击乐律动，掌握掌根切音（Palm Mute）与大拇指拍弦拍打技巧。',
        totalDuration: '50 分钟',
        orderIndex: 7,
        items: [
          {
            id: 'item_107_1',
            title: '教学视频：右手肉垫轻触琴码切音手法',
            type: 'video',
            description: '右手小鱼际位置贴近琴桥消除低频杂音',
            orderIndex: 1,
            videoId: 'vid_003',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
            cuePoints: INITIAL_VIDEOS[2].cuePoints,
          },
          {
            id: 'item_107_2',
            title: '实战乐谱：流行扫弦切音打板实战谱',
            type: 'transcription_score',
            description: '双轨谱面带切音标记与高低声部联动',
            orderIndex: 2,
            scoreId: 'isolated',
            scoreTitle: '律动切音伴奏练习 · 80 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_108',
        title: '第八章 · 附点音符与三连音律动感培养',
        category: '乐理节奏',
        description: '建立深层音乐律动，辨识附点八分音符的跳跃感与三连音均分时值。',
        totalDuration: '40 分钟',
        orderIndex: 8,
        items: [
          {
            id: 'item_108_1',
            title: '教学视频：摇摆 Shuffle 节奏与附点音符示范',
            type: 'video',
            description: '通过节拍器声响理解 3:1 时值比例',
            orderIndex: 1,
            videoId: 'vid_001',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
            cuePoints: INITIAL_VIDEOS[0].cuePoints,
          },
          {
            id: 'item_108_2',
            title: '实战乐谱：附点切分与布鲁斯三连音练习谱',
            type: 'transcription_score',
            description: '慢速原声同步演奏跟练',
            orderIndex: 2,
            scoreId: 'isolated',
            scoreTitle: '附点节奏专题强化 · 75 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_109',
        title: '第九章 · 常用调性转换：C 调与 G 调互换应用',
        category: '调性转换',
        description: '学习首调与固定调思维，掌握变调夹（Capo）在各品位的使用规律。',
        totalDuration: '55 分钟',
        orderIndex: 9,
        items: [
          {
            id: 'item_109_1',
            title: '教学视频：变调夹夹在 2 品与 4 品的音高换算',
            type: 'video',
            description: '移调夹原理与指型不变调性升降',
            orderIndex: 1,
            videoId: 'vid_003',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
            cuePoints: INITIAL_VIDEOS[2].cuePoints,
          },
          {
            id: 'item_109_2',
            title: '和弦微测：流行 4536251 进阶换调挑战',
            type: 'chord_drill',
            description: '考核多级和弦平滑过渡能力',
            orderIndex: 2,
            chordDrillId: 'drill_002',
            chords: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C'],
            bpmTarget: 95,
          },
        ],
      },
      {
        id: 'chap_110',
        title: '第十章 · 简易民谣指弹独奏曲精讲',
        category: '指弹独奏',
        description: '将旋律线与和弦伴奏融为一体，初识指弹独奏（Fingerstyle）的魅力。',
        totalDuration: '60 分钟',
        orderIndex: 10,
        items: [
          {
            id: 'item_110_1',
            title: '教学视频：高音主旋律突出与低音伴奏弱化对比',
            type: 'video',
            description: '如何让听众清晰辨识出歌曲的人声旋律线',
            orderIndex: 1,
            videoId: 'vid_003',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
            cuePoints: INITIAL_VIDEOS[2].cuePoints,
          },
          {
            id: 'item_110_2',
            title: '实战乐谱：经典民谣简易指弹独奏跟练谱',
            type: 'transcription_score',
            description: '交互式 TAB 谱滚动跟练',
            orderIndex: 2,
            scoreId: 'laid-back-guitars',
            scoreTitle: '民谣初级指弹独奏 · 70 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_111',
        title: '第十一章 · 击弦 (Hammer-on) 与勾弦 (Pull-off) 技巧',
        category: '装饰技巧',
        description: '掌握吉他最灵动的装饰连音：左手击弦发力点与勾弦离弦角度。',
        totalDuration: '45 分钟',
        orderIndex: 11,
        items: [
          {
            id: 'item_111_1',
            title: '教学精讲：敲击指板发声要点与勾弦向内拨动',
            type: 'video',
            description: '避免击弦软弱无声，击打品丝后方黄金发音区',
            orderIndex: 1,
            videoId: 'vid_002',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-acoustic-guitar-in-nature-41274-large.mp4',
            cuePoints: INITIAL_VIDEOS[1].cuePoints,
          },
          {
            id: 'item_111_2',
            title: '实战乐谱：击弦勾弦加花小品跟练谱',
            type: 'transcription_score',
            description: '双行乐谱高亮展示 H 与 P 连音线',
            orderIndex: 2,
            scoreId: 'a-minor-etude',
            scoreTitle: '击勾弦综合音色微练 · 85 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_112',
        title: '第十二章 · 自然泛音与人工泛音发声奥秘',
        category: '泛音色彩',
        description: '探索吉他如钟鸣般的纯净高频音色，掌握12品、7品、5品自然泛音。',
        totalDuration: '40 分钟',
        orderIndex: 12,
        items: [
          {
            id: 'item_112_1',
            title: '教学视频：左手肚指轻触品丝正上方瞬间离弦',
            type: 'video',
            description: '右手触弦瞬间左手迅速抬起保留泛音震动',
            orderIndex: 1,
            videoId: 'vid_001',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4',
            cuePoints: INITIAL_VIDEOS[0].cuePoints,
          },
          {
            id: 'item_112_2',
            title: '实战乐谱：自然泛音色彩尾奏练习谱',
            type: 'transcription_score',
            description: 'AI 标定菱形泛音符头与吉他指板品位映射',
            orderIndex: 2,
            scoreId: 'canon-in-d',
            scoreTitle: '泛音与余音延绵练习 · 60 BPM',
            scoreArtist: 'GuitarMate AI Studio',
          },
        ],
      },
      {
        id: 'chap_113',
        title: '第十三章 · 毕业实战大曲：Macaroon 5 独奏跟练与全曲考核',
        category: '毕业大曲',
        description: '初级吉他系统课终章！综合运用前12章所有技法，完成AI双行谱交互评测与全曲通关。',
        totalDuration: '75 分钟',
        orderIndex: 13,
        items: [
          {
            id: 'item_113_1',
            title: '终章视频：Macaroon 5 全曲结构分段精解与难点剖析',
            type: 'video',
            description: '李老师逐小节示范主歌、副歌与华彩段落指法转换',
            orderIndex: 1,
            videoId: 'vid_003',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
            cuePoints: INITIAL_VIDEOS[2].cuePoints,
          },
          {
            id: 'item_113_2',
            title: '实战乐谱：Macaroon 5 交互式双行谱慢速跟练 (毕业考核曲目)',
            type: 'transcription_score',
            description: '加载系统 AI 高精度五线谱与六线 TAB 练习，支持慢速跟练与指板联动',
            orderIndex: 2,
            scoreId: 'macaroon-5',
            scoreTitle: 'Macaroon 5 · Acoustic Solo (毕业通关曲目)',
            scoreArtist: 'GuitarMate AI Studio',
          },
          {
            id: 'item_113_3',
            title: '和弦微测：毕业综合和弦阶梯挑战',
            type: 'chord_drill',
            description: '从 70 BPM 阶梯考核至 120 BPM 达标',
            orderIndex: 3,
            chordDrillId: 'drill_003',
            chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
            bpmTarget: 120,
          },
        ],
      },
    ],
  },
  {
    id: 'course_002',
    title: '流行吉他编配与指弹进阶独奏',
    subtitle: 'Fingerstyle Solo Arranging & Harmony · 教师专修课',
    description: '进阶指弹学员专修，涵盖泛音、拍弦、扫弦加花与七和弦/挂留和弦即兴运用。',
    coverImage: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=600&q=80',
    level: '中级至高级',
    totalLessons: 16,
    totalHours: '12.0 小时',
    category: '流行独奏',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    isSystemBasic: false,
    isFree: false,
    status: 'published',
    version: 'v1.4',
    versionHistory: [
      { version: 'v1.4', date: '2026-09-20', author: '李老师', note: '新增爵士色彩走向与打点标注' },
      { version: 'v1.0', date: '2026-08-10', author: '李老师', note: '初始大纲创建' },
    ],
    orderIndex: 2,
    chapters: [
      {
        id: 'chap_201',
        title: '第一章 · 流行独奏前奏与主旋律音位打点',
        category: '独奏技巧',
        description: '学习吉他高把位旋律线与根音交织走位。',
        totalDuration: '50 分钟',
        orderIndex: 1,
        items: [
          {
            id: 'item_201_1',
            title: '视频示范：经典指弹前奏独奏手法',
            type: 'video',
            description: '高低声部平衡示范',
            orderIndex: 1,
            videoId: 'vid_003',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-playing-acoustic-guitar-on-a-couch-41272-large.mp4',
            cuePoints: INITIAL_VIDEOS[2].cuePoints,
          },
          {
            id: 'item_201_2',
            title: '和弦阶梯：II-V-I 扩展和弦进阶挑战',
            type: 'chord_drill',
            description: '从 Dm7 到 G7、Cmaj7 顺滑流动',
            orderIndex: 2,
            chordDrillId: 'drill_003',
            chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
            bpmTarget: 120,
          },
        ],
      },
    ],
  },
  {
    id: 'course_003',
    title: '吉他即兴伴奏与布鲁斯和声理论',
    subtitle: 'Blues Progression & Improv Mastery · 教师专修课',
    description: '通过布鲁斯 12 小节框架与小调五声音阶，建立听音辨位与即兴 Solo 架构。',
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    level: '进阶专修',
    totalLessons: 10,
    totalHours: '6.5 小时',
    category: '和声乐理',
    teacherId: 'usr_coach_alex',
    teacherName: '李老师 (认证名师)',
    institutionId: 'inst_001',
    institutionName: '柏斯音乐国际教育学院',
    isSystemBasic: false,
    isFree: false,
    status: 'draft',
    version: 'v0.9-draft',
    versionHistory: [
      { version: 'v0.9-draft', date: '2026-09-29', author: '李老师', note: '正在编排五声音阶实战打点' },
    ],
    orderIndex: 3,
    chapters: [],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 数据域：**后端是唯一数据源**（本地内存缓存 + 写穿透）
// ---------------------------------------------------------------------------
// 原先 getUsers/saveUsers 等方法直接读写 localStorage（8 个 key），
// 换浏览器/清缓存就全丢，小程序也读不到。现在改为：
//   · hydrate() 在应用启动时把后端数据拉进内存缓存；
//   · 所有读取走缓存（**保持同步签名** —— 组件里的 `useState(backendService.getUsers())`
//     这类同步调用因此一行都不用改）；
//   · 写入先更新缓存（UI 立即响应），再把**变化的记录**推给后端（写穿透）。
//
// ⚠️ 为什么只推「变化的记录」而不是整表覆盖：整表 upsert 会拿本机缓存
// 把别的标签页/别的端的改动一起抹掉（典型的 last-write-wins 事故）。
//
// ⚠️ 未 hydrate 完成前，读取会回退到源码里的 `DEMO_*` / `INITIAL_*`（保证首屏不空白）。
// 一旦拿到后端数据就以库为准 —— 于是“前端不再依赖 DUMMY 数据”成立。
//
// ⚠️ **删除**必须单独发请求（不能靠「推剩下的记录」表达删除）——
// 所以 deleteXxx 里除了更新缓存，还要显式调一次 `xxxApi.remove()`。
// ═══════════════════════════════════════════════════════════════════════════

let usersCache: UserProfile[] | null = null;
let userGroupsCache: any[] | null = null;
/** 需求 (2)：课纲 / 教学视频 / 和弦组合 */
let coursesCache: CourseCurriculum[] | null = null;
let videosCache: TeachingVideo[] | null = null;
let drillsCache: ChordDrillCombination[] | null = null;
/** 需求 (3)：音频乐谱库（每条含完整 ScoreData） */
let libraryCache: TranscriptionItem[] | null = null;
/** 需求 (4)：积分恢复工单 / 积分流水 / 企业线索 / 学员任务进度 */
let creditRequestsCache: CreditRecoveryRequest[] | null = null;
let creditTxCache: CreditTransaction[] | null = null;
let leadsCache: EnterpriseLead[] | null = null;
/** 需求 (4)：站内通知 / 定价方案 */
let notificationsCache: AppNotification[] | null = null;
let pricingPlansCache: PricingPlan[] | null = null;
/** 任务进度按用户缓：`{ [userId]: { [itemId]: boolean } }` */
const taskProgressCache = new Map<string, Record<string, boolean>>();
const taskProgressDirty = new Set<string>();
/** 后端同步状态（供 UI 提示；静默失败是这类改造最危险的模式） */
const backendSyncState: { status: 'idle' | 'loading' | 'ready' | 'error'; message: string; at: number } = {
  status: 'idle',
  message: '尚未连接后端',
  at: 0,
};

function reportSyncError(scope: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  backendSyncState.status = 'error';
  backendSyncState.message = `${scope} 同步失败：${msg}`;
  backendSyncState.at = Date.now();
  // eslint-disable-next-line no-console
  console.error(`[backendService] ${backendSyncState.message}`);
}

/** 同步成功：更新状态（供 UI 显示「已同步 n 条」） */
function reportSyncOk(scope: string, count: number) {
  backendSyncState.status = 'ready';
  backendSyncState.message = `${scope}已同步到后端（本次 ${count} 条）`;
  backendSyncState.at = Date.now();
}

/** 把变化的记录挑出来（含新增）；`prev` 为空时全部推送 */
function changedRecords<T extends { id: string }>(prev: T[] | null, next: T[]): T[] {
  if (!prev) return next;
  return next.filter((item) => {
    const before = prev.find((p) => p.id === item.id);
    return !before || JSON.stringify(before) !== JSON.stringify(item);
  });
}

/**
 * 通用写穿透：只推变化的记录，不 await（保持方法同步签名）。
 * 失败不抛（UI 已经更新了，抛出去也回不去），只记状态 + console。
 */
function pushChanged<T extends { id: string }>(
  scope: string,
  prev: T[] | null,
  next: T[],
  send: (changed: T[]) => Promise<unknown>,
) {
  const changed = changedRecords(prev, next);
  if (changed.length === 0) return;
  void send(changed).then(
    () => reportSyncOk(scope, changed.length),
    (err) => reportSyncError(scope, err),
  );
}

export const backendService = {
  // 1. COURSES & CURRICULUM  —— 数据源：后端 REST（`/api/courses`）
  /**
   * ⚠️ 这里原先有一段「本地数据修补」逻辑（发现章节数 <13 或残留旧 scoreId 就重写 localStorage），
   * 那是为了修早期版本写坏的本机缓存。改为以后端为唯一数据源后**不再需要**：
   * 库里的数据是迁移脚本一次性写入并回读校验过的，不存在「本机半坏状态」。
   * 保留它会带来新问题 —— 每次读取都拿源码里的 `INITIAL_COURSES` 覆盖运维在库里的改动。
   */
  getCourses: (): CourseCurriculum[] => {
    return coursesCache ?? INITIAL_COURSES;
  },

  saveCourses: (courses: CourseCurriculum[]) => {
    const prev = coursesCache;
    coursesCache = courses;
    pushChanged('课程', prev, courses, (changed) => courseApi.importCourses(changed));
  },

  saveSingleCourse: (course: CourseCurriculum): CourseCurriculum[] => {
    const courses = backendService.getCourses();
    const index = courses.findIndex((c) => c.id === course.id);
    let updated: CourseCurriculum[];
    if (index >= 0) {
      updated = courses.map((c) => (c.id === course.id ? course : c));
    } else {
      updated = [course, ...courses];
    }
    backendService.saveCourses(updated);
    return updated;
  },

  deleteCourse: (courseId: string): CourseCurriculum[] => {
    const courses = backendService.getCourses().filter((c) => c.id !== courseId);
    backendService.saveCourses(courses);
    // ⚠️ 删除必须单独发请求：写穿透只推「剩下的记录」，推不出「这条没了」
    void courseApi.remove(courseId).catch((err) => reportSyncError('课程删除', err));
    return courses;
  },

  publishCourse: (courseId: string, versionNote: string, author: string): CourseCurriculum[] => {
    const courses = backendService.getCourses().map((c) => {
      if (c.id === courseId) {
        const nextVersion = `v${(parseFloat(c.version.replace('v', '')) + 0.1).toFixed(1)}`;
        return {
          ...c,
          status: 'published' as const,
          version: nextVersion,
          versionHistory: [
            {
              version: nextVersion,
              date: new Date().toISOString().split('T')[0],
              author,
              note: versionNote || '更新并正式发布课程大纲',
            },
            ...c.versionHistory,
          ],
        };
      }
      return c;
    });
    backendService.saveCourses(courses);
    return courses;
  },

  archiveCourse: (courseId: string): CourseCurriculum[] => {
    const courses = backendService.getCourses().map((c) => {
      if (c.id === courseId) {
        return { ...c, status: 'archived' as const };
      }
      return c;
    });
    backendService.saveCourses(courses);
    return courses;
  },

  rollbackVersion: (courseId: string, targetVersion: string): CourseCurriculum[] => {
    const courses = backendService.getCourses().map((c) => {
      if (c.id === courseId) {
        return {
          ...c,
          version: targetVersion,
          versionHistory: [
            {
              version: targetVersion,
              date: new Date().toISOString().split('T')[0],
              author: '系统回滚',
              note: `回滚到历史版本 ${targetVersion}`,
            },
            ...c.versionHistory,
          ],
        };
      }
      return c;
    });
    backendService.saveCourses(courses);
    return courses;
  },

  // 2. TEACHING VIDEOS & CUE POINTS  —— 数据源：后端 REST（`/api/videos`）
  getVideos: (): TeachingVideo[] => {
    return videosCache ?? INITIAL_VIDEOS;
  },

  saveVideos: (videos: TeachingVideo[]) => {
    const prev = videosCache;
    videosCache = videos;
    pushChanged('教学视频', prev, videos, (changed) => videoApi.importVideos(changed));
  },

  saveSingleVideo: (video: TeachingVideo): TeachingVideo[] => {
    const videos = backendService.getVideos();
    const index = videos.findIndex((v) => v.id === video.id);
    let updated: TeachingVideo[];
    if (index >= 0) {
      updated = videos.map((v) => (v.id === video.id ? video : v));
    } else {
      updated = [video, ...videos];
    }
    backendService.saveVideos(updated);
    return updated;
  },

  deleteVideo: (videoId: string): TeachingVideo[] => {
    const videos = backendService.getVideos().filter((v) => v.id !== videoId);
    backendService.saveVideos(videos);
    // 删除必须单独发请求（写穿透推不出「这条没了」）。
    // 后端默认 `cascade=true`，会自己把课纲里引用它的内容项摘掉 —— 下面这段本地级联
    // 仍然保留：一是让 UI 立刻一致（不必等往返），二是后端不可用时本机也不会留下死链。
    void videoApi.remove(videoId).catch((err) => reportSyncError('教学视频删除', err));

    // Cascade clean-up: remove items from all courses where videoId matches
    const courses = backendService.getCourses();
    let hasChanged = false;
    const cleanedCourses = courses.map((course) => {
      const updatedChapters = course.chapters.map((ch) => {
        const hasMatchingItem = ch.items.some((it) => it.videoId === videoId);
        if (hasMatchingItem) {
          hasChanged = true;
          return {
            ...ch,
            items: ch.items.filter((it) => it.videoId !== videoId),
          };
        }
        return ch;
      });
      return { ...course, chapters: updatedChapters };
    });
    if (hasChanged) {
      backendService.saveCourses(cleanedCourses);
    }

    return videos;
  },

  // 3. CHORD DRILLS & BPM LADDER  —— 数据源：后端 REST（`/api/drills`）
  getDrills: (): ChordDrillCombination[] => {
    return drillsCache ?? INITIAL_DRILLS;
  },

  saveDrills: (drills: ChordDrillCombination[]) => {
    const prev = drillsCache;
    drillsCache = drills;
    pushChanged('和弦组合', prev, drills, (changed) => drillApi.importDrills(changed));
  },

  saveSingleDrill: (drill: ChordDrillCombination): ChordDrillCombination[] => {
    const drills = backendService.getDrills();
    const index = drills.findIndex((d) => d.id === drill.id);
    let updated: ChordDrillCombination[];
    if (index >= 0) {
      updated = drills.map((d) => (d.id === drill.id ? drill : d));
    } else {
      updated = [drill, ...drills];
    }
    backendService.saveDrills(updated);
    return updated;
  },

  publishAllDrills: (): ChordDrillCombination[] => {
    const drills = backendService.getDrills();
    const updated = drills.map((d) => ({ ...d, status: 'published' as const }));
    backendService.saveDrills(updated);
    return updated;
  },

  deleteDrill: (drillId: string): ChordDrillCombination[] => {
    const drills = backendService.getDrills().filter((d) => d.id !== drillId);
    backendService.saveDrills(drills);
    // 同 deleteVideo：删除单独发请求，且后端默认级联清理课纲引用
    void drillApi.remove(drillId).catch((err) => reportSyncError('和弦组合删除', err));

    // Cascade clean-up: remove items from all courses where chordDrillId matches
    const courses = backendService.getCourses();
    let hasChanged = false;
    const cleanedCourses = courses.map((course) => {
      const updatedChapters = course.chapters.map((ch) => {
        const hasMatchingItem = ch.items.some((it) => it.chordDrillId === drillId);
        if (hasMatchingItem) {
          hasChanged = true;
          return {
            ...ch,
            items: ch.items.filter((it) => it.chordDrillId !== drillId),
          };
        }
        return ch;
      });
      return { ...course, chapters: updatedChapters };
    });
    if (hasChanged) {
      backendService.saveCourses(cleanedCourses);
    }

    return drills;
  },

  // 3.5 LIBRARY  —— 数据源：后端 REST（`/api/library`）
  /**
   * 曲库条目（每条自带完整 `score: ScoreData`）。
   *
   * ⚠️ 为什么乐谱本体也进库、而不是改成读后端的 `Score` 表：
   * 两边**同名但内容不同** —— 库里 `Macaroon 5` 是 86 小节/1371 音符，
   * 这里的 `MACAROON_5_SCORE` 是 30 小节/86 音符；`Laid Back Guitars` 库里 100 小节、
   * 这里 4 小节。真挂过去，用户点开练习看到的谱子会当场变样，属于「改变现有功能」。
   * 所以整份 `ScoreData` 原样存进 `LibraryItem.scoreJson`，前端读到的字节与迁移前完全一致。
   */
  getLibraryItems: (): TranscriptionItem[] => {
    return libraryCache ?? INITIAL_LIBRARY_ITEMS;
  },

  saveLibraryItems: (items: TranscriptionItem[]) => {
    const prev = libraryCache;
    libraryCache = items;
    pushChanged('曲库', prev, items, (changed) => libraryApi.importItems(changed));
  },

  /** 单条保存（曲库编辑/收藏切换后整体落库；不存在则新建） */
  saveSingleLibraryItem: (item: TranscriptionItem): TranscriptionItem[] => {
    const items = backendService.getLibraryItems();
    const exists = items.some((i) => i.id === item.id);
    const updated = exists ? items.map((i) => (i.id === item.id ? item : i)) : [item, ...items];
    backendService.saveLibraryItems(updated);
    return updated;
  },

  deleteLibraryItem: (id: string): TranscriptionItem[] => {
    const items = backendService.getLibraryItems().filter((i) => i.id !== id);
    backendService.saveLibraryItems(items);
    // 删除必须单独发请求（写穿透推不出「这条没了」）
    void libraryApi.remove(id).catch((err) => reportSyncError('曲库删除', err));
    return items;
  },

  // 4. USERS & ROLES  —— 数据源：后端 REST（`/api/users`）
  /**
   * 预拉取**所有域**的数据到内存缓存。
   * 在 `main.tsx` 启动时调一次；失败不阻断启动（页面仍能用源码里的演示数据兜底）。
   *
   * ⚠️ 这里用 `Promise.allSettled` 的语义（每个域各自 catch）而不是 `Promise.all`：
   * 某一个域挂了不该让其它域也退回演示数据 —— 那会让「部分迁移成功」的现场
   * 看起来像「全都没迁」。
   */
  hydrate: async (): Promise<{
    ok: boolean;
    users: number;
    groups: number;
    courses: number;
    videos: number;
    drills: number;
    library: number;
    creditRequests: number;
    leads: number;
    notifications: number;
    plans: number;
  }> => {
    backendSyncState.status = 'loading';
    backendSyncState.message = '正在从后端载入数据…';

    const [users, groups] = await Promise.all([
      userApi.list<UserProfile[]>().catch((err) => {
        reportSyncError('用户', err);
        return null;
      }),
      userGroupApi.list<any[]>().catch(() => [] as any[]),
    ]);

    const [courses, videos, drills, library, creditRequests, leads, transactions, notifications, plans] = await Promise.all([
      courseApi.list<CourseCurriculum[]>().catch((err) => {
        reportSyncError('课程', err);
        return null;
      }),
      videoApi.list<TeachingVideo[]>().catch((err) => {
        reportSyncError('教学视频', err);
        return null;
      }),
      drillApi.list<ChordDrillCombination[]>().catch((err) => {
        reportSyncError('和弦组合', err);
        return null;
      }),
      libraryApi.list<TranscriptionItem[]>().catch((err) => {
        reportSyncError('曲库', err);
        return null;
      }),
      creditRecoveryApi.list<CreditRecoveryRequest[]>().catch((err) => {
        reportSyncError('积分恢复工单', err);
        return null;
      }),
      enterpriseLeadApi.list<EnterpriseLead[]>().catch((err) => {
        reportSyncError('企业线索', err);
        return null;
      }),
      userApi.transactions<CreditTransaction[]>(undefined, 500).catch((err) => {
        reportSyncError('积分流水', err);
        return null;
      }),
      notificationApi.list<AppNotification[]>().catch((err) => {
        reportSyncError('通知', err);
        return null;
      }),
      pricingPlanApi.list<PricingPlan[]>().catch((err) => {
        reportSyncError('定价方案', err);
        return null;
      }),
    ]);

    if (Array.isArray(users)) usersCache = users;
    if (Array.isArray(groups)) userGroupsCache = groups;
    if (Array.isArray(courses)) coursesCache = courses;
    if (Array.isArray(videos)) videosCache = videos;
    if (Array.isArray(drills)) drillsCache = drills;
    if (Array.isArray(library)) libraryCache = library;
    if (Array.isArray(creditRequests)) creditRequestsCache = creditRequests;
    if (Array.isArray(leads)) leadsCache = leads;
    if (Array.isArray(transactions)) creditTxCache = transactions;
    if (Array.isArray(notifications)) notificationsCache = notifications;
    if (Array.isArray(plans)) pricingPlansCache = plans;

    const counts = {
      users: usersCache?.length ?? 0,
      groups: userGroupsCache?.length ?? 0,
      courses: coursesCache?.length ?? 0,
      videos: videosCache?.length ?? 0,
      drills: drillsCache?.length ?? 0,
      library: libraryCache?.length ?? 0,
      creditRequests: creditRequestsCache?.length ?? 0,
      leads: leadsCache?.length ?? 0,
      notifications: notificationsCache?.length ?? 0,
      plans: pricingPlansCache?.length ?? 0,
    };
    const ok = !!users && !!courses && !!videos && !!drills && !!library;
    if (ok) {
      backendSyncState.status = 'ready';
      backendSyncState.message =
        `已从后端载入 ${counts.users} 个用户 / ${counts.groups} 个用户组 / ` +
        `${counts.courses} 门课程 / ${counts.videos} 个视频 / ${counts.drills} 个和弦组合 / ` +
        `${counts.library} 条曲库 / ${counts.creditRequests} 条积分工单 / ${counts.leads} 条线索 / ` +
        `${counts.notifications} 条通知 / ${counts.plans} 个定价方案`;
      backendSyncState.at = Date.now();
    }
    return { ok, ...counts };
  },

  /** 同步状态（UI 可以据此显示「已连接后端 / 同步失败」） */
  getSyncState: () => ({ ...backendSyncState }),

  /** 已同步的用户组 / 权限矩阵（后端 `user-groups.catalog.ts` 的播种结果） */
  getUserGroups: <T = any>(): T[] => (userGroupsCache ?? []) as T[],

  getUsers: (): UserProfile[] => {
    // 已 hydrate → 以库为准；否则回退到源码里的演示账号（首屏不空白）
    return usersCache ?? Object.values(DEMO_USERS);
  },

  saveUsers: (users: UserProfile[]) => {
    const prev = usersCache;
    usersCache = users;
    const changed = changedRecords(prev, users);
    if (changed.length === 0) return;
    // 写穿透：不 await（保持同步签名），失败时记入 syncState 并打到 console
    void userApi.importUsers(changed).then(
      () => {
        backendSyncState.status = 'ready';
        backendSyncState.message = `用户已同步到后端（本次 ${changed.length} 条）`;
        backendSyncState.at = Date.now();
      },
      (err) => reportSyncError('用户', err),
    );
  },

  updateUserRole: (userId: string, newRole: UserProfile['role']): UserProfile[] => {
    const users = backendService.getUsers().map((u) => {
      if (u.id === userId) {
        let initialCredits = u.credits;
        let isUnlimited = false;
        let quota = u.monthlyCreditQuota || 600;

        if (newRole === 'super_admin') {
          initialCredits = 999999;
          isUnlimited = true;
          quota = 999999;
        } else if (newRole === 'teacher' || newRole === 'institution') {
          initialCredits = Math.max(initialCredits, 5000);
          quota = 5000;
        } else if (newRole === 'student') {
          initialCredits = Math.max(initialCredits, 3000);
          quota = 3000;
        } else if (newRole === 'plus') {
          initialCredits = Math.max(initialCredits, 600);
          quota = 600;
        }

        return { 
          ...u, 
          role: newRole, 
          status: 'active' as const,
          credits: initialCredits,
          isUnlimitedCredits: isUnlimited,
          monthlyCreditQuota: quota,
        };
      }
      return u;
    });
    backendService.saveUsers(users);
    return users;
  },

  assignUserGroup: (
    userId: string, 
    newRole: UserProfile['role'],
    options?: {
      institutionId?: string;
      institutionName?: string;
      teacherId?: string;
      teacherName?: string;
    }
  ): UserProfile[] => {
    const users = backendService.getUsers().map((u) => {
      if (u.id === userId) {
        let initialCredits = u.credits;
        let isUnlimited = false;
        let quota = u.monthlyCreditQuota || 600;

        if (newRole === 'super_admin') {
          initialCredits = 999999;
          isUnlimited = true;
          quota = 999999;
        } else if (newRole === 'teacher' || newRole === 'institution') {
          initialCredits = Math.max(initialCredits, 5000);
          quota = 5000;
        } else if (newRole === 'student') {
          initialCredits = Math.max(initialCredits, 3000);
          quota = 3000;
        } else if (newRole === 'plus') {
          initialCredits = Math.max(initialCredits, 600);
          quota = 600;
        }

        return {
          ...u,
          role: newRole,
          status: 'active' as const,
          credits: initialCredits,
          isUnlimitedCredits: isUnlimited,
          monthlyCreditQuota: quota,
          institutionId: options?.institutionId !== undefined ? options.institutionId : u.institutionId,
          institutionName: options?.institutionName !== undefined ? options.institutionName : u.institutionName,
          teacherId: options?.teacherId !== undefined ? options.teacherId : u.teacherId,
          teacherName: options?.teacherName !== undefined ? options.teacherName : u.teacherName,
        };
      }
      return u;
    });
    backendService.saveUsers(users);
    return users;
  },

  updateUserProfile: (userId: string, updates: Partial<UserProfile>): UserProfile[] => {
    const users = backendService.getUsers().map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          ...updates,
        };
      }
      return u;
    });
    backendService.saveUsers(users);
    return users;
  },

  // 8.3: 根据用户组层级关系不同组别看到不同用户信息
  getVisibleUsers: (currentUser: UserProfile): UserProfile[] => {
    const allUsers = backendService.getUsers();

    if (currentUser.role === 'super_admin') {
      // 超管：查看全局所有机构、教师、学员与注册用户
      return allUsers;
    }

    if (currentUser.role === 'institution') {
      // 机构：查看其下所有教师与学员
      return allUsers.filter((u) => 
        u.id === currentUser.id ||
        u.institutionId === currentUser.institutionId ||
        (currentUser.institutionName && u.institutionName === currentUser.institutionName)
      );
    }

    if (currentUser.role === 'teacher') {
      // 教师：查看其名下所有挂靠学员与自身所属机构
      return allUsers.filter((u) =>
        u.id === currentUser.id ||
        u.teacherId === currentUser.id ||
        (currentUser.name && u.teacherName?.includes(currentUser.name.split(' ')[0]))
      );
    }

    if (currentUser.role === 'student') {
      // 学员：查看自身、所属机构与挂靠教师
      return allUsers.filter((u) =>
        u.id === currentUser.id ||
        (currentUser.teacherId && u.id === currentUser.teacherId) ||
        (currentUser.institutionId && u.id === currentUser.institutionId)
      );
    }

    // 普通用户 / 游客
    return allUsers.filter((u) => u.id === currentUser.id);
  },

  searchUsers: (query: string, roleFilter?: string): UserProfile[] => {
    const all = backendService.getUsers();
    const q = query.trim().toLowerCase();
    return all.filter((u) => {
      const matchRole = !roleFilter || roleFilter === 'all' || u.role === roleFilter;
      if (!matchRole) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.institutionName && u.institutionName.toLowerCase().includes(q)) ||
        (u.teacherName && u.teacherName.toLowerCase().includes(q))
      );
    });
  },

  bindStudentToTeacher: (
    studentId: string, 
    teacherId: string, 
    teacherName: string, 
    institutionId?: string, 
    institutionName?: string
  ): UserProfile[] => {
    const users = backendService.getUsers().map((u) => {
      if (u.id === studentId) {
        return {
          ...u,
          teacherId,
          teacherName,
          institutionId: institutionId || u.institutionId,
          institutionName: institutionName || u.institutionName,
        };
      }
      return u;
    });
    backendService.saveUsers(users);
    return users;
  },

  // 6. CREDITS ECONOMY & RECOVERY LEDGER (Section 4)
  checkCredits: (userId: string, requiredCredits: number): { hasEnough: boolean; currentCredits: number; shortage: number } => {
    const users = backendService.getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return { hasEnough: false, currentCredits: 0, shortage: requiredCredits };
    }

    // 超管免扣减无限额度
    if (user.role === 'super_admin' || user.isUnlimitedCredits) {
      return { hasEnough: true, currentCredits: 999999, shortage: 0 };
    }

    const currentCredits = user.credits || 0;
    const hasEnough = currentCredits >= requiredCredits;
    const shortage = Math.max(0, requiredCredits - currentCredits);
    return { hasEnough, currentCredits, shortage };
  },

  deductCredits: (
    userId: string, 
    amount: number, 
    description: string, 
    type: CreditTransaction['type'] = 'transcription'
  ): { success: boolean; newBalance: number } => {
    const users = backendService.getUsers();
    let newBalance = 0;
    let didDeduct = false;

    const updatedUsers = users.map((u) => {
      if (u.id === userId) {
        // 超管免扣除
        if (u.role === 'super_admin' || u.isUnlimitedCredits) {
          newBalance = 999999;
          didDeduct = true;
          return u;
        }

        // 余额不足校验：不予扣减，返回失败
        if ((u.credits || 0) < amount) {
          newBalance = u.credits || 0;
          didDeduct = false;
          return u;
        }

        newBalance = (u.credits || 0) - amount;
        didDeduct = true;
        return {
          ...u,
          credits: newBalance,
        };
      }
      return u;
    });

    if (didDeduct) {
      backendService.saveUsers(updatedUsers);

      // Record transaction
      const tx: CreditTransaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        amount: -amount,
        type,
        description,
        balanceAfter: newBalance,
        createdAt: new Date().toISOString(),
      };
      backendService.saveCreditTransaction(tx);
    }

    return { success: didDeduct, newBalance };
  },

  grantCredits: (
    userId: string, 
    amount: number, 
    description: string, 
    type: CreditTransaction['type'] = 'admin_grant'
  ): { success: boolean; newBalance: number } => {
    const users = backendService.getUsers();
    let newBalance = 0;
    let didGrant = false;

    const updatedUsers = users.map((u) => {
      if (u.id === userId) {
        newBalance = (u.credits || 0) + amount;
        didGrant = true;
        return {
          ...u,
          credits: newBalance,
        };
      }
      return u;
    });

    if (didGrant) {
      backendService.saveUsers(updatedUsers);

      const tx: CreditTransaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        amount,
        type,
        description,
        balanceAfter: newBalance,
        createdAt: new Date().toISOString(),
      };
      backendService.saveCreditTransaction(tx);
    }

    return { success: didGrant, newBalance };
  },

  // Credits Recovery Requests (教师与机构点数用尽后申请恢复 5000 点)
  // —— 数据源：后端 REST（`/api/credit-recovery-requests`）
  /**
   * ⚠️ 这一域原来完全没有可能工作：申请存在**提交者的浏览器**里，
   * 超管在另一台电脑上永远看不到。落库后才是真的「提交 → 审批」流程。
   */
  getCreditRecoveryRequests: (): CreditRecoveryRequest[] => {
    return creditRequestsCache ?? [];
  },

  /**
   * 提交额度恢复申请。
   *
   * 同步返回「本地新工单」（UI 要立刻显示），同时向后端提交；
   * 后端如果发现该用户已有待审工单，会返回那条已有工单（不重复创建），
   * 这里就把乐观插入的那条替换掉 —— 否则界面会多出一条幽灵工单。
   */
  applyCreditRecovery: (
    userId: string,
    userName: string,
    userEmail: string,
    userRole: 'teacher' | 'institution',
    reason: string
  ): CreditRecoveryRequest => {
    const user = backendService.getUsers().find((u) => u.id === userId);
    const optimistic: CreditRecoveryRequest = {
      id: `req_${Date.now()}`,
      userId,
      userName,
      userEmail,
      userRole,
      currentCredits: user?.credits || 0,
      requestedAmount: 5000,
      reason,
      createdAt: new Date().toLocaleString(),
      status: 'pending',
    };
    creditRequestsCache = [optimistic, ...backendService.getCreditRecoveryRequests()];

    void creditRecoveryApi
      .apply<CreditRecoveryRequest>({
        id: optimistic.id,
        userId,
        userName,
        userEmail,
        userRole,
        reason,
        createdAt: optimistic.createdAt,
      })
      .then(
        (saved) => {
          // 后端返回的可能是「已存在的那条 pending」——用它的 id 顶掉乐观条目
          const list = backendService.getCreditRecoveryRequests();
          creditRequestsCache =
            saved.id === optimistic.id
              ? list.map((r) => (r.id === optimistic.id ? saved : r))
              : [saved, ...list.filter((r) => r.id !== optimistic.id && r.id !== saved.id)];
          reportSyncOk('积分恢复申请', 1);
        },
        (err) => reportSyncError('积分恢复申请', err),
      );

    return optimistic;
  },

  /**
   * 审批通过。
   *
   * ⚠️ 为什么不像原来那样自己调 `grantCredits`：
   * 后端 `POST /:id/approve` 把「置状态 + 发积分 + 记流水」放在**同一个事务**里，
   * 并且对重复调用幂等 —— 原实现在 UI 上点两次就会发两次 5000 点。
   * 这里本地先乐观置为 approved（UI 立即响应），再用服务端返回的 `newBalance` 校准用户缓存。
   */
  approveCreditRecovery: (requestId: string, approvedBy: string = 'Gardenart (超级管理员)'): CreditRecoveryRequest[] => {
    const list = backendService.getCreditRecoveryRequests();
    const target = list.find((r) => r.id === requestId);
    const optimistic = list.map((req) =>
      req.id === requestId
        ? { ...req, status: 'approved' as const, approvedAt: new Date().toLocaleString(), approvedBy }
        : req,
    );
    creditRequestsCache = optimistic;

    if (target) {
      void creditRecoveryApi.approve<{ newBalance?: number; grantedAmount?: number }>(requestId, { approvedBy }).then(
        (res) => {
          if (typeof res?.newBalance === 'number') {
            // ⚠️ 直接改缓存、**不再写穿透**：库里已经改好了，
            // 再推一次就等于用本机算出来的余额去覆盖服务端的结果。
            usersCache = backendService
              .getUsers()
              .map((u) => (u.id === target.userId ? { ...u, credits: res.newBalance! } : u));
          }
          reportSyncOk('积分恢复审批', 1);
        },
        (err) => reportSyncError('积分恢复审批', err),
      );
    }

    return optimistic;
  },

  rejectCreditRecovery: (requestId: string): CreditRecoveryRequest[] => {
    const optimistic = backendService
      .getCreditRecoveryRequests()
      .map((req) => (req.id === requestId ? { ...req, status: 'rejected' as const } : req));
    creditRequestsCache = optimistic;
    void creditRecoveryApi.reject(requestId).catch((err) => reportSyncError('积分恢复驳回', err));
    return optimistic;
  },

  // Credit Transactions Ledger  —— 数据源：后端 REST（`/api/users/credits/transactions`）
  /**
   * ⚠️ 原实现只留最近 100 条（`slice(0, 100)`）。落库后不再截断：
   * 账本被静默截断是财务类数据最不能接受的行为。
   */
  getCreditTransactions: (userId?: string): CreditTransaction[] => {
    const all = creditTxCache ?? [];
    return userId ? all.filter((tx) => tx.userId === userId) : all;
  },

  /**
   * 追加一条流水。
   *
   * 余额那边已经通过 `saveUsers` → `POST /api/users/import` 写进库了，
   * 但**流水不写进库就没人看得见**（原来只落 localStorage）。
   * 后端 `POST /api/users/credits/transactions` 按 id 幂等 upsert，重复提交不会重复记账。
   */
  saveCreditTransaction: (tx: CreditTransaction) => {
    creditTxCache = [tx, ...(creditTxCache ?? [])];
    void userApi
      .recordTransaction({
        id: tx.id,
        userId: tx.userId,
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
        balanceAfter: tx.balanceAfter,
        createdAt: tx.createdAt,
      })
      .catch((err) => reportSyncError('积分流水', err));
  },

  // 7. ENTERPRISE LEADS (Section 5.3)  —— 数据源：后端 REST（`/api/enterprise-leads`）
  /**
   * ⚠️ 销售线索存 localStorage 等于「换个业务员打开后台就看不到这单」。
   * 落库后小程序/CRM 也能读同一份（`/api/enterprise-leads`）。
   */
  getEnterpriseLeads: (): EnterpriseLead[] => {
    return leadsCache ?? [];
  },

  saveEnterpriseLead: (lead: EnterpriseLead): EnterpriseLead[] => {
    const updated = [lead, ...backendService.getEnterpriseLeads()];
    leadsCache = updated;
    void enterpriseLeadApi
      .create({
        id: lead.id,
        fullName: lead.fullName,
        workEmail: lead.workEmail,
        companyName: lead.companyName,
        monthlyMinutes: lead.monthlyMinutes,
        useCases: lead.useCases,
        notes: lead.notes,
        status: lead.status,
        createdAt: lead.createdAt,
      })
      .then(() => reportSyncOk('企业线索', 1), (err) => reportSyncError('企业线索', err));
    return updated;
  },

  // 5. STUDENT TASK PROGRESS (视频观看完毕、实战乐谱演奏完毕、和弦微测达标完毕)

  // 8. NOTIFICATIONS  —— 数据源：后端 REST（`/api/notifications`）
  /**
   * 站内通知。原先存在 localStorage（`NotificationBell.tsx` 里的
   * `guitarmate_notifications_list_v1`）—— 而通知**本来就不该按浏览器存在本机**，
   * 换台电脑就看不到自己的通知，这恰好是通知功能存在的意义。
   */
  getNotifications: (): AppNotification[] => {
    return notificationsCache ?? INITIAL_NOTIFICATIONS;
  },

  /** 整份保存（新增/更新走 importItems 的 upsert；删除请用 deleteNotification） */
  saveNotifications: (list: AppNotification[]) => {
    const prev = notificationsCache;
    notificationsCache = list;
    pushChanged('通知', prev, list, (changed) => notificationApi.importItems(changed));
  },

  deleteNotification: (id: string) => {
    const list = backendService.getNotifications().filter((n) => n.id !== id);
    backendService.saveNotifications(list);
    void notificationApi.remove(id).catch((err) => reportSyncError('通知删除', err));
    return list;
  },

  /** 清空全部通知（前端「清空」按钮）—— 必须逐条删，没有批量接口是有意的：
   *  批量清空在服务端应该是一个需要二次确认的运维动作，不该被一个前端按钮触发。 */
  clearNotifications: () => {
    const ids = backendService.getNotifications().map((n) => n.id);
    notificationsCache = [];
    for (const id of ids) {
      void notificationApi.remove(id).catch((err) => reportSyncError('通知清空', err));
    }
    return [];
  },

  // 9. PRICING PLANS  —— 数据源：后端 REST（`/api/pricing-plans`）
  /**
   * 定价方案。原先硬编码在 `types/pricing.ts` 的 `PRICING_PLANS`。
   *
   * ⚠️ 改这里的权益时**必须同步 `/api/user-groups`**（用户组权益矩阵），
   * 否则会出现「定价页写着导出 MIDI，实际账号没这个权限」。
   */
  getPricingPlans: (): PricingPlan[] => {
    return pricingPlansCache ?? PRICING_PLANS;
  },
  /**
   * 读取学员任务进度。
   *
   * ⚠️ 未 hydrate（缓存里这个用户还没拉过）时返回 `{}`，并且**异步补拉一次** ——
   * 保持同步签名是硬约束（`StudentCourseView` 在渲染期就调它）。
   * 补拉回来后不触发重渲染（没有 state 通知机制），所以下一次刷新才看得到 ——
   * 这是刻意的取舍：宁可“晚一拍”，也不要为了这个把整条渲染链路改成异步。
   */
  getUserTaskProgress: (userId: string): Record<string, boolean> => {
    const cached = taskProgressCache.get(userId);
    if (cached) return cached;
    if (!taskProgressDirty.has(userId)) {
      taskProgressDirty.add(userId);
      void userApi
        .taskProgress<Record<string, boolean>>(userId)
        .then((progress) => {
          taskProgressCache.set(userId, progress || {});
          taskProgressDirty.delete(userId);
        })
        .catch((err) => {
          taskProgressDirty.delete(userId);
          reportSyncError('任务进度', err);
        });
    }
    return {};
  },

  setUserTaskCompleted: (userId: string, itemId: string, completed: boolean = true): Record<string, boolean> => {
    const current = taskProgressCache.get(userId) ?? {};
    const updated = { ...current, [itemId]: completed };
    taskProgressCache.set(userId, updated);
    void userApi
      .setTaskCompleted<Record<string, boolean>>(userId, itemId, completed)
      .then(() => reportSyncOk('任务进度', 1), (err) => reportSyncError('任务进度', err));
    return updated;
  },

  getCourseCompletionStats: (userId: string, course: CourseCurriculum) => {
    const progress = backendService.getUserTaskProgress(userId);
    let totalItems = 0;
    let completedItems = 0;

    course.chapters.forEach((chapter) => {
      chapter.items.forEach((item) => {
        totalItems += 1;
        if (progress[item.id]) {
          completedItems += 1;
        }
      });
    });

    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    return {
      totalItems,
      completedItems,
      percentage,
    };
  },
};
