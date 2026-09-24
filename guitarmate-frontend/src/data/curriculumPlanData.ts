/**
 * Comprehensive Curriculum Planning & Course Management Blueprint
 * 吉他课程体系编排、视频资产管理、和弦练习模块与时间进度规划全景方案
 */

export interface CurriculumSectionDoc {
  id: string;
  title: string;
  badge: string;
  summary: string;
  content: string[];
  subsections?: {
    subtitle: string;
    items: string[];
    table?: {
      headers: string[];
      rows: string[][];
    };
    codeBlock?: string;
  }[];
}

export const MASTER_CURRICULUM_BLUEPRINT: CurriculumSectionDoc[] = [
  {
    id: 'overview',
    title: '一、吉他课程教研编排与层级体系架构',
    badge: '教研顶层设计',
    summary: '构建工业级吉他教学体系，采用“阶段 - 课程 - 章节 - 课时 - 模块”5级树状结构，实现由浅入深、循序渐进的科学进阶。',
    content: [
      '《GuitarMate 弦音伴侣》的核心教学理念是“碎片化沉浸，学练对拍合一”。传统吉他视频教学最大的痛点是“看会了但手不会”，本体系通过将每节课拆解为标准20分钟闭环，让学员在单次学习中同时完成新知输入、微观练习、机器评测与实战伴奏。',
    ],
    subsections: [
      {
        subtitle: '1. 5级教研大纲树状拓扑架构',
        items: [
          'Level 1【成长阶段 Stage】：定义学员技术里程碑（零基础扫盲 -> 四和弦流行歌 -> 扫弦律动 -> 横按进阶）。',
          'Level 2【专栏课程 Course】：独立主题教程，如《First Timers 零基础入门》《4-Chord Pop Hits 流行弹唱》。',
          'Level 3【教学章节 Chapter】：核心技术单元，如《Chapter 2: 掌握首批开放和弦》《Chapter 3: 扫弦节拍器进阶》。',
          'Level 4【课时单元 Lesson Step】：单次20分钟标准学习任务包，包含教学目标与学习时长配比。',
          'Level 5【教学交互模块 Interactive Module】：落地执行单元，包括名师视频、单和弦解析、转换对练习、AI听音考核、真曲伴奏跟弹。',
        ],
        table: {
          headers: ['阶段划分', '适用对象', '核心和弦/技术', '达成目标', '推荐周期'],
          rows: [
            ['Stage 0: 破冰破茧', '绝对零基础、首次拿琴', '持琴、调音、爬格子、Em, D6/9', '手指不疼、听懂节拍、弹响首支双和弦曲目', '7 天'],
            ['Stage 1: 四和弦神级弹唱', '能换和弦但速度慢', 'G, Em, C, D 流行四大和弦走向', '实现 60 BPM 熟练切换，完整弹唱《Perfect》', '14 天'],
            ['Stage 2: 节奏与扫弦律动', '和弦没问题但节奏单调', '民谣分解、切音、下上下上扫弦、Am, E', '脱离死板下扫，具备流行流行歌曲律动感', '21 天'],
            ['Stage 3: 大横按攻坚与Solo', '遇到大横按就放弃的学员', '大横按 F, Bm, F#，推弦、滑音、五声音阶', '攻克 F 和弦阻碍，弹奏《加州旅馆》尾奏 Solo', '30 天'],
          ],
        },
      },
      {
        subtitle: '2. 标准化单课时 5 步教学闭环',
        items: [
          '第1步【热身校准】(0-3 min)：琴头调音器精准校准 6 根琴弦，结合 1 分钟蜘蛛爬格子激活左手指尖灵活性。',
          '第2步【视频新授】(3-9 min)：名师视频 6 分钟微课精讲，直击新和弦按法要领、动作细节与常见手型误区。',
          '第3步【和弦精炼】(9-13 min)：单和弦静音弦与发声弦检查，麦克风 AI 声音监听逐音验证触弦饱满度。',
          '第4步【转换冲刺】(13-17 min)：核心转换对节拍器提速阶梯（40 -> 60 -> 80 BPM），达成流畅肌肉记忆。',
          '第5步【曲目跟弹】(17-20 min)：真曲伴奏智能滚动，伴随高精度六线谱指示条进行实战对拍演练并生成今日成就报告。',
        ],
      },
    ],
  },
  {
    id: 'video-management',
    title: '二、教学视频全生命周期管理与多维绑定',
    badge: '音视频工业流',
    summary: '解决传统教学视频与课件割裂问题，提供云端上传、CDN自适应转码、知识点打点（Timestamping）与谱画同步联动。',
    content: [
      '在小程序端，教学视频不再是单一的被动播放器，而是与交互式六线谱、和弦指法卡、节拍器深度交织的交互中枢。',
    ],
    subsections: [
      {
        subtitle: '1. 视频存储上传与转码分发机制',
        items: [
          '【上传通道】：教务后台采用“客户端直传对象存储（Tencent COS / Aliyun OSS）”，服务端仅下发临时 STS 鉴权令牌与回调钩子，杜绝应用服务器带宽瓶颈。',
          '【转码流水线】：上传完成后由云端媒体处理服务（MPS）自动触发转码，生成 1080P/720P/480P 自适应码率，提取第 3 秒高清帧作为视频海报封面。',
          '【小程序播放】：采用微信小程序原生 <video> 组件，开启硬件解码与 prefetch 预拉流，保障弱网环境下秒开不卡顿。',
        ],
      },
      {
        subtitle: '2. 教学视频分类资产库',
        items: [
          '【内容维度】：持琴姿态 (Posture)、扫弦律动 (Rhythm)、和弦精解 (Chord)、基础乐理 (Theory)、曲目拆解 (Song Breakdown)。',
          '【版权与师资】：支持按主讲老师多维度检索（如伯克利客座讲师、指弹先锋、古典名师），附带讲师背景资质与学员评价。',
          '【难度标签】：Beginner / Intermediate / Advanced，便于教研团队灵活调度组装至不同课程中。',
        ],
      },
      {
        subtitle: '3. 时间戳知识点打点绑定与音画联动 (Timestamp Key-Points)',
        items: [
          '【打点标注】：后台管理端提供打点编辑器，精准标记关键时间秒数（如 00:45 “左手拇指中线定位”，01:30 “无名指与小指下落顺序”）。',
          '【快进直达】：学员端视频播放器提供可视化时间戳药丸徽标，点击即可毫秒级 Seek 到对应教学难点。',
          '【分屏联动】：当视频播放进度触发特定知识点时，界面下方或侧边自动调出对应的和弦指法卡及六线谱高亮，做到“耳听其声、目见其形、手操其位”。',
        ],
        codeBlock: `interface VideoAssetConfig {
  id: string;
  title: string;
  sourceUrl: string; // CDN 加速 HLS/MP4
  durationSec: number;
  category: 'posture' | 'rhythm' | 'chord' | 'theory' | 'song_breakdown';
  teacher: { name: string; title: string; avatar: string };
  keyPoints: {
    timeSec: number;
    title: string;
    chordHighlight?: string; // 触发和弦指法同步
    tipDescription: string;
  }[];
}`,
      },
    ],
  },
  {
    id: 'module-sequencing',
    title: '三、课程前后模块设置与依赖解锁流转机制',
    badge: '智能流转引擎',
    summary: '确立严密的模块前后序依赖关系与通关卡点逻辑，杜绝盲目跳步，同时保障学习链路的灵活性与韧性。',
    content: [
      '科学的技能养成必须经历“认知 -> 模仿 -> 刻意练习 -> 机器检验 -> 综合应用”的完整认知闭环。',
    ],
    subsections: [
      {
        subtitle: '1. 6大标准化交互模块矩阵',
        items: [
          '1. Tuner 调音模块：课前强制或建议校音，保证吉他在标准 EADGBE 音高下练习，培养良好音高敏锐度。',
          '2. Video 视频精讲模块：高清慢动作示范与避坑讲解，支持 0.75x/1.0x/1.25x 变速播放。',
          '3. Chord Anatomy 和弦透视模块：三维指位图解，标注根音、空弦音、禁音弦与手指分配。',
          '4. Switch Trainer 转换对模块：双和弦节拍器对拍训练，记录每分钟有效切换次数（TPM）。',
          '5. Mic AI Test 麦克风听音闯关模块：Web Audio 声音采集与频域分析，连续 3~5 次成功触发 Perfect 通关激励。',
          '6. Song Jam 实战曲目伴奏模块：伴随动态六线谱滚动与真声伴奏，完整演奏歌曲片段或全曲。',
        ],
      },
      {
        subtitle: '2. 前置后置依赖与解锁规则引擎',
        items: [
          '【严格顺序解锁 (Strict Sequential)】：默认规则下，后一模块受前一模块完成状态锁定，防止新手越级遭遇严重挫败。',
          '【评分卡点模式 (Score-Gated Unlock)】：麦克风 AI 听音测试需获得 ≥80 分（或连续正确 3 次），系统方可解锁该章节关联的实战歌曲。',
          '【有效完播率检查】：视频课时需累积播放达 85% 以上且无快进跳过关键时间戳，系统才打上已完成绿标。',
          '【免考核自由通道 (VIP/Teacher Bypass)】：VIP 学员或自评已有基础的用户可一键解锁全量模块，自由挑选薄弱环节回溯巩固。',
        ],
      },
    ],
  },
  {
    id: 'repertoire-selection',
    title: '四、教学曲目选取规范与曲谱教案深度关联',
    badge: '曲库教学联动',
    summary: '打破“为了教歌而教歌”的孤岛思维，实现曲目选取与已学和弦技术树的 100% 精准对应与片段化切片拆解。',
    content: [
      '初学吉他者退费和放弃的最主要原因是“前两节课学了几个和弦，第三节课老师就给了一首充斥着大横按 F 或复杂分解节奏的曲子”。本系统实行严格的“技术树曲目准入机制”。',
    ],
    subsections: [
      {
        subtitle: '1. 技术树曲目映射准则',
        items: [
          '【严格不超纲原则】：某课时绑定的伴奏曲目，其和弦集合（Chord Set）必须严格 ≤ 该课时及之前所有课时教授和弦的并集。',
          '【阶段 0（破冰）配套曲目】：仅包含 Em 与 D6/9 两个和弦，如《Horse with No Name》《500 Miles 简化版》。',
          '【阶段 1（四和弦）配套曲目】：仅包含 G, Em, C, D 流行和弦走向，如《Perfect》《童年》《Knockin on Heaven\'s Door》。',
          '【阶段 2（进阶）配套曲目】：引入 Am, E, F 等，如《Hotel California》《Despacito》《晴天》。',
        ],
      },
      {
        subtitle: '2. 原版与简化谱（Original vs. Simplified）双轨配置',
        items: [
          '【一键切换】：曲目详情支持“Simplified”与“Original”双模式。新手使用简化版（避开大横按、变调夹适配低难度把位），熟练后切换至原版高阶指法。',
          '【变调夹 Capo 科学规划】：针对不同嗓音与指法舒适度，后台预设最适 Capo 品位建议，避免学员因音高过高撕扯嗓子。',
        ],
      },
      {
        subtitle: '3. 教学片段微切片技术 (Song Segmenting)',
        items: [
          '【降低认知负荷】：不要求学员一上来弹完整首 4 分钟歌曲，教研可在后台圈定片段（如仅截取“Verse 1 主歌 4 小节循环”或“Chorus 副歌扫弦 8 小节”）。',
          '【片段循环伴奏】：小伴奏带无限循环播放，配合指引指针，帮助学员将有限的精力集中攻克核心段落。',
        ],
      },
    ],
  },
  {
    id: 'chord-modules',
    title: '五、内部每个和弦练习模块的精细化设置',
    badge: '微观练习引擎',
    summary: '深入和弦按压微观机理，提供按法定义、转换对阶梯配置、麦克风 AI 频域听音容差与防错纠偏指引。',
    content: [
      '和弦转换速度是衡量吉他初学者是否突破瓶颈的核心指标。传统的“自己在家数节拍”效率低下，必须依托可视化参数与机器听音即时反馈。',
    ],
    subsections: [
      {
        subtitle: '1. 和弦静态微观结构定义参数',
        items: [
          '【弦位与品位】：精确到 6 根弦的数字品格数组（如 [0, 2, 2, 0, 0, 0] 表示 Em，[\'x\', 3, 2, 0, 1, 0] 表示 C）。',
          '【手指序列编号】：明确指定 1食指、2中指、3无名指、4小指，并注明推荐落指顺序（例如 G 和弦建议中指与无名指先就位，食指后就位）。',
          '【避坑防错提示】：针对每个和弦录入易错知识，如“C和弦食指关节不可塌陷，否则容易碰到第1弦空弦发出哑音”。',
        ],
      },
      {
        subtitle: '2. 和弦转换对矩阵 (Pair Switching) 与 BPM 阶梯',
        items: [
          '【转换对配置】：指定两两配对（如 G ⇄ Em, C ⇄ D, Em ⇄ D6/9），设定 60 秒极速切换冲刺挑战。',
          '【BPM 渐进阶梯】：慢速破冰 40 BPM -> 稳定过渡 60 BPM -> 原速实战 80+ BPM。',
          '【TPM 指标沉淀】：统计学员每分钟有效转换次数（Transitions Per Minute），生成个人速度成长折线。',
        ],
      },
      {
        subtitle: '3. Web Audio 麦克风听音判别算法与容差配置',
        items: [
          '【自相关频域分析】：通过小程序的录音管理器或 Web Audio API 分析音频输入频谱，寻找谐波基频。',
          '【容错度设定】：允许 ±15 cents 音分容差，兼容吉他轻微音准偏差与琴弦老化情况。',
          '【连胜正向激励】：判定连续 3 次按准并拨响后，屏幕泛起翠绿波纹与“PERFECT”徽章，自动推进至下一和弦或下一小节。',
        ],
      },
    ],
  },
  {
    id: 'time-scheduling',
    title: '六、学习渐进各个模块时间进度布置与课表规划',
    badge: '教务进度排布',
    summary: '根据成人与青少年注意力曲线，制定科学的单课时间配比模型、周期性打卡训练营与艾宾浩斯复盘机制。',
    content: [
      '学琴贵在“少食多餐”。单次练习 20 分钟、连续 21 天，效果远胜于每周单次死磕 3 小时。因此课程系统内必须强制植入时间切片分配与提醒调度。',
    ],
    subsections: [
      {
        subtitle: '1. 黄金 20 分钟单课时间切片分配表',
        items: [
          '教务系统内为每个课时绑定 TimeAllocation 数据结构，并在小程序端呈现动态时间进度环。',
        ],
        table: {
          headers: ['时间切片', '时长 (min)', '教学模块', '核心任务', '考核验收方式'],
          rows: [
            ['00:00 - 03:00', '3 min', '调音器 & 手指热身', '吉他 6 根弦校准，1-2品蜘蛛爬格子', '调音器 6 弦全绿'],
            ['03:00 - 09:00', '6 min', '名师视频微课', '观看核心指法讲解与示范动作', '完播率 ≥ 85%'],
            ['09:00 - 13:00', '4 min', '单和弦微测与纠偏', '逐根弦拨响检查杂音，AI 麦克风听音', '麦克风测试 3 次 Perfect'],
            ['13:00 - 17:00', '4 min', '和弦对极速转换冲刺', '对拍节拍器，从 40 BPM 递增至 70 BPM', '达到 40 次/分钟转换速率'],
            ['17:00 - 20:00', '3 min', '真曲伴奏对拍弹唱', '随六线谱指针跟随真声伴奏弹奏', '完成片段弹唱并打卡分享'],
          ],
        },
      },
      {
        subtitle: '2. 周期性训练营课表规划',
        items: [
          '【7 天零基础入门营】：持琴 -> 调音 -> 右手扫弦 -> Em 掌握 -> D6/9 掌握 -> 双和弦转换 -> 首曲《Horse with No Name》毕业。',
          '【21 天流行歌攻坚营】：第一周攻克 G & Em，第二周攻克 C & D，第三周四大和弦闭环，完整弹唱《Perfect》与《童年》。',
          '【4 周扫弦节奏大师营】：主攻扫弦切音、3/4 拍华尔兹、切分音符律动，打下民谣伴奏骨架。',
        ],
      },
      {
        subtitle: '3. 基于艾宾浩斯曲线的智能复盘调度',
        items: [
          '【遗忘临界点预警】：根据艾宾浩斯遗忘模型，在学员掌握新和弦后的第 2 天、第 4 天、第 7 天，小程序首页弹窗提醒“2分钟极速和弦复盘”，答对后加盖掌握印章。',
          '【智能补弱推题】：若学员在实战伴奏中某和弦失误率超过 20%，系统自动在下一次热身环节追加该和弦转换的对拍巩固练习。',
        ],
      },
    ],
  },
  {
    id: 'data-schema',
    title: '七、核心数据结构设计与数据库规范 (Schema Specs)',
    badge: '技术数据底座',
    summary: '完备的 TypeScript 实体模型与数据库表设计，无缝适配微信小程序端与教务管理 CMS。',
    content: [
      '所有业务逻辑均由强类型数据结构支撑，确保在 Taro/React 客户端与 Node.js/Cloud 存储端的数据一致性。',
    ],
    subsections: [
      {
        subtitle: '1. 课程大纲、课时与教学模块 TypeScript 实体定义',
        items: ['包含前置依赖规则、视频打点元数据、和弦微练习参数与时间切片配比：'],
        codeBlock: `// 1. 课时教学步骤与模块依赖
export interface LessonStep {
  id: string;
  title: string;
  type: 'video' | 'trainer' | 'tuner' | 'practice';
  durationMin: number; // 默认推荐 20 min 中的子切片
  completed: boolean;
  
  // 依赖与解锁机制
  prerequisite?: {
    requiredStepId?: string; // 前置课时 ID
    minScore?: number;        // 最低达标分 (例如 80)
    isUnlockedByDefault?: boolean;
  };
  
  // 时间进度规划配比 (分钟)
  timeAllocation?: {
    warmupMins: number;      // 热身 (3min)
    videoLectureMins: number;// 视频 (6min)
    chordDrillMins: number;  // 和弦微测 (4min)
    switchingMins: number;   // 转换冲刺 (4min)
    songJamMins: number;     // 曲目对拍 (3min)
    totalMins: number;       // 20min
  };
  
  // 教学视频绑定与时间戳打点
  videoData?: {
    teacherName: string;
    teacherTitle: string;
    description: string;
    videoUrl?: string;
    videoPoster: string;
    category?: 'posture' | 'rhythm' | 'chord' | 'theory' | 'song_breakdown';
    keyPoints: string[];
    detailedKeyPoints?: {
      timeSec: number;
      label: string;
      chordHighlight?: string; // 联动和弦卡
    }[];
  };
  
  // 和弦练习模块配置
  trainerData?: {
    targetChords: string[];
    tempoBpm: number;
    description: string;
    exerciseConfig?: {
      switchPairs: [string, string][]; // e.g. [['G', 'Em'], ['C', 'D']]
      startBpm: number;                 // e.g. 40
      targetBpm: number;                // e.g. 80
      durationSec: number;              // e.g. 60
      passStreakCount: number;          // 连续达成判定 (3次)
      accuracyToleranceCents: number;   // 频率容差 (±15)
    };
  };
  
  // 教学曲目绑定
  songBinding?: {
    songId: string;
    title: string;
    artist: string;
    sectionSnippet?: string; // e.g. 'VERSE 1'
    suggestedCapo?: string;  // e.g. 'Capo: fret 1'
    tabMode?: 'CRD' | 'TAB';
  };
}`,
      },
      {
        subtitle: '2. 数据库关系表/集合规划设计 (Database Collections)',
        items: [
          'courses 表：存储课程元数据、所属成长阶段 (stageId)、预估学习天数、封面图、定价。',
          'chapters 表：存储章节顺序、核心教学目标 (learningGoal)、关联曲目 (songReferenceId)。',
          'lesson_steps 表：存储具体课时、类型 (video/trainer/practice/tuner)、前后依赖外键。',
          'video_assets 表：多媒体库，存储视频时长、转码分辨率列表、讲师信息、打点 JSON。',
          'chord_definitions 表：和弦指法库，品格数组、手指编号、易错贴士、音频频率表。',
          'user_learning_progress 表：学员维度各课时完成状态、AI 听音最高评分、完播时长、复盘打卡日程。',
        ],
      },
    ],
  },
  {
    id: 'cms-studio',
    title: '八、课程编排教务管理系统 (Course Studio CMS) 落地规范',
    badge: '后台系统蓝图',
    summary: '为教研主管与吉他老师提供可视化的课程编写后台，实现视频直传打点、拖拽编排、规则配置的一站式管理。',
    content: [
      '教务系统通常面向 PC Web 浏览器开发（如 React + AntDesign 或 Tailwind），后台产出的 JSON 直接通过微信云开发数据库或 RESTful API 灌入小程序端。',
    ],
    subsections: [
      {
        subtitle: '1. 教研管理后台核心四大功能工作台',
        items: [
          '【工作台 1：大纲可视化编排器 (Curriculum Outline Studio)】：左侧树状视图，支持拖拽重排章节顺序、一键添加课时、配置前后依赖锁。',
          '【工作台 2：视频素材库与时间戳打点器 (Video & Timestamp Editor)】：支持视频拖拽直传，提供带有波形图的播放器，播放到关键帧点击“添加打点”即可绑定知识说明。',
          '【工作台 3：和弦微练习生成器 (Chord Exercise Configurator)】：可视化选择 6 根琴弦品格，直接生成手指按法预览，拖拽滑动条设定起始与达标 BPM。',
          '【工作台 4：教学曲库切片关联器 (Repertoire Slicer)】：从已有音乐伴奏库中挑选曲目，圈定起止时间范围作为教学切片。',
        ],
      },
      {
        subtitle: '2. 学员学习轨迹与教学质量数据大盘 (Analytics Dashboard)',
        items: [
          '【漏斗流失率分析】：监控从 视频观看 -> 和弦练习 -> 麦克风测试 -> 歌曲实战 的流失率，发现教学阻点。',
          '【高频卡点和弦排行榜】：统计全网学员 AI 麦克风测试中通过率最低的和弦（如 F、Bm），指导教研优化教学视频细节。',
          '【学员课时完课率与复购转化】：为运营团队提供学员转化看板。',
        ],
      },
    ],
  },
  {
    id: 'audio-tab-sync',
    title: '十、音频上传与吉他六线谱挂音乐进度条管理模块 (Audio Upload & Tab Sync Engine)',
    badge: '音谱同步引擎',
    summary: '打通音频资产直传、波形峰值解析、六线谱小节/音符毫秒级打点与播放进度条双向挂载联动的工业级解决方案。',
    content: [
      '在吉他教学与伴奏中，“音频上传之后六线谱如何精准挂载音乐进度条”是核心体验瓶颈。如果仅依靠静态图片谱或粗粒度歌词滚动，学员无法感知具体每一品、每一弦是在原曲音频的哪一毫秒被弹响。',
      '本模块专门解决“原版原声/示范伴奏音频上传 -> 波形生成 -> 六线谱音符时序绑定 -> 双向挂载音乐进度条 -> 毫秒级音画谱同频对拍跟弹”的全生命周期链路。',
    ],
    subsections: [
      {
        subtitle: '1. 音频资产上传、格式转码与波形峰值提取流水线 (Audio Ingestion)',
        items: [
          '【支持格式与直传】：支持 MP3、WAV、FLAC、M4A、AAC 音频直传云端对象存储（COS/OSS），前端利用 Web Audio API 在浏览器端即时抽样计算 100~200 个振幅峰值（Waveform Peaks），用于在进度条下方绘制声学波形图。',
          '【元数据智能识别】：解析音频总时长（精确到毫秒）、采样率（44.1kHz / 48kHz）与双声道数据，支持后台一键探测 BPM 与强弱拍网格（Beats Grid Detection）。',
          '【双轨音频引擎】：支持“真实录音原声 (Uploaded Audio)”与“Web Audio 物理物理合成 (Guitar Synth)”无缝切换，伴奏中可独立调节吉他音轨音量与人声音量。',
        ],
      },
      {
        subtitle: '2. 六线谱“挂音乐进度条”双向时钟驱动模型 (Bi-directional Playhead Linking)',
        items: [
          '【时间主时钟 (Audio Master Clock)】：以音频播放的真实毫秒时间戳（currentTime）作为唯一绝对时钟源，通过 requestAnimationFrame (60 FPS) 高刷新率驱动界面，杜绝定时器累积漂移误差。',
          '【小节与音符位置映射 (Time-to-Position Mapping)】：六线谱上每个小节与每个六线谱音符（string, fret）均被分配起止时间（timeSec 与 durationSec）。系统通过数学插值算法将绝对时间转换为六线谱游标的 X 轴像素位置（Playhead X Position）。',
          '【双向交互挂载 (Bi-directional Seeking)】：',
          '  - 拖拽或点击底部音乐总进度条：六线谱即时平滑滚动到对应小节，对应音符实时发光并更新当前和弦指法图；',
          '  - 点击或拖动六线谱内部任意小节或音符：音频底层自动执行 audio.currentTime = note.timeSec 精准 Seek，实现“指哪播哪、听哪看哪”。',
        ],
        codeBlock: `// 六线谱音符与音频进度条挂载数据结构
export interface AudioTabSyncConfig {
  audioId: string;
  audioFileName: string;
  audioDurationSec: number;        // 音频总时长 (秒)
  waveformPeaks: number[];         // 声学波形峰值采样 (0~1 归一化)
  playbackOffsetMs: number;        // 延迟补偿偏移量 (±ms)
  
  // 小节级别时间戳网格
  measureTimestamps: {
    measureIndex: number;
    startSec: number;
    endSec: number;
    chord?: string;
  }[];
  
  // 逐音符精确时序打点 (Note-level Timestamps)
  noteTimestamps?: {
    lineIndex: number;
    noteIndex: number;
    timeSec: number;               // 触发音频对拍秒数
    fret: number | string;         // 品位 (例如 2, 7, '2^')
    string: number;                // 弦号 (1~6 弦)
  }[];
}`,
      },
      {
        subtitle: '3. 教研后台“音谱对齐打点器”工作台 (Audio-Tab Sync Studio CMS)',
        items: [
          '【交互式波形对齐器】：教研老师上传伴奏音频后，后台界面将呈现“顶部音频真实波形轨 + 中间小节分割线 + 底部六线谱多音轨”。',
          '【轻按键盘空格键对拍打点 (Tap-to-Align)】：播放音频时，老师可通过节拍跟敲（Tap Tempo / Spacebar）快速批量对齐小节线；亦可鼠标拖拽小节起止标线微调。',
          '【AB 片段循环挂载】：可将特定 4 小节或 Solo 片段在进度条上设定循环区间（A-B Loop），供学员开启针对性慢速循环跟弹。',
        ],
      },
      {
        subtitle: '4. 前端性能优化与弱网降级保障 (WeChat Mini-Program Optimizations)',
        items: [
          '【虚拟化谱面渲染 (Virtual Tab View)】：只渲染视口前后的六线谱小节，避免长音频多小节谱面造成 DOM/Canvas 节点过多导致卡顿。',
          '【音频流边下边播与缓存】：微信小程序端使用 InnerAudioContext，开启 obStartTime 与缓冲监控，即便在移动端弱网环境下拖拽进度条也能秒开回弹。',
          '【音频延迟自动补偿 (Latency Compensation)】：针对蓝牙耳机（AirPods等）常见 150~250ms 延迟，设置中提供“音频-谱面延迟微调滑块”，确保视听触严格同一帧。',
        ],
      },
    ],
  },
  {
    id: 'integration',
    title: '十一、与前序架构方案的无缝承接与落地总结',
    badge: '系统集成闭环',
    summary: '完整继承原有《GuitarMate 弦音伴侣》小程序品牌、6大核心功能模块与技术选型，形成兼具前台高体验与后台强管控的商业闭环。',
    content: [
      '本方案完全融入前期所制定的技术基座（Taro/React + Web Audio API + 微信支付与云存储）：',
    ],
    subsections: [
      {
        subtitle: '1. 业务模块前后无缝呼应',
        items: [
          '曲目伴奏库 (MusicTab)：既是学员自由弹唱的歌单，又是课程模块中 Song Jam 练习的教学曲源。',
          '课程选课大厅与课时页 (CourseTab)：承载本次升级的 5 级大纲体系、视频打点联动、AI 麦克风听音闯关与 20 分钟时间切片。',
          '和弦库与指法图 (ChordLibraryTab)：为课程内的 Chord Anatomy 和弦透视与转换对提供坚实的和弦字典支撑。',
          '实用工具箱 (ToolsTab)：调音器与节拍器无缝内嵌在每节课的热身与对拍冲刺模块中。',
          '个人中心 (ProfileTab)：沉淀学员课时完成数、和弦掌握数、打卡热力图与 VIP 会员权益。',
        ],
      },
      {
        subtitle: '2. 快速上线与工程落地建议',
        items: [
          '【Phase 1 快速原型期 (1-2周)】：使用当前工程内的 Mock 数据模型与 Web Audio 合成器快速打磨单课 20 分钟流转体验。',
          '【Phase 2 教研录课与存储直传 (3-4周)】：录制 13 节首期精讲微视频，接入腾讯云 COS/VOD 上传与转码，配置关键打点。',
          '【Phase 3 微信小程序提审与发布 (1周)】：采用 Taro 打包微信小程序，配置合法域名与麦克风权限隐私协议，正式发布上线。',
        ],
      },
    ],
  },
];
