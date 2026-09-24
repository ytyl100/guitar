import { AudioTabSyncConfig, Stage, ChordConfig, HardChordMetric, LessonDropoffFunnelStep, MusicTrack } from '../types';

// 128 acoustic waveform points for high-energy guitar strumming and solo peaks
const generateDefaultWaveform = (): number[] => {
  const peaks: number[] = [];
  for (let i = 0; i < 128; i++) {
    // 4 measures with distinct beats
    const beatPhase = (i % 16) / 16;
    const accent = (i % 16 === 0 || i % 16 === 8) ? 0.35 : 0.05;
    const decay = Math.exp(-beatPhase * 3.2);
    const harmonic = Math.sin(i * 0.35) * 0.15 + Math.cos(i * 0.8) * 0.1;
    const val = Math.max(0.12, Math.min(0.98, decay * 0.75 + accent + Math.abs(harmonic)));
    peaks.push(Number(val.toFixed(3)));
  }
  return peaks;
};

export const INITIAL_AUDIO_TAB_SYNC: AudioTabSyncConfig = {
  audioId: 'audio-gt-2026-001',
  audioTitle: '《民谣吉他核心手型突破 - C大调前奏与分解对齐》',
  audioDurationSec: 19.2,
  waveformPeaks: generateDefaultWaveform(),
  bpm: 80,
  timeSignature: [4, 4],
  playbackOffsetMs: -15, // Bluetooth headset compensation
  loopRegion: {
    startSec: 4.8,
    endSec: 9.6,
    enabled: true,
  },
  // 8 measures (each measure is 2.4s at 80 BPM, 4 beats @ 0.6s)
  measureTimestamps: [
    0.0,
    2.4,
    4.8,
    7.2,
    9.6,
    12.0,
    14.4,
    16.8,
  ],
  noteTimestamps: [
    // Measure 1: C Chord Strum & Arpeggio (0.00s - 2.40s)
    // Beat 1: Vertical multi-note chord stack (同一条垂直线上)
    { id: 'n-1a', measureIndex: 0, stringIndex: 5, fret: 3, timestampSec: 0.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 95, chordName: 'C' },
    { id: 'n-1b', measureIndex: 0, stringIndex: 4, fret: 2, timestampSec: 0.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 90, chordName: 'C' },
    { id: 'n-1c', measureIndex: 0, stringIndex: 2, fret: 1, timestampSec: 0.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 92, chordName: 'C' },
    { id: 'n-1d', measureIndex: 0, stringIndex: 1, fret: 0, timestampSec: 0.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 88, chordName: 'C' },
    // Beat 2: 3rd string open (1/4 note)
    { id: 'n-2', measureIndex: 0, stringIndex: 3, fret: 0, timestampSec: 0.60, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 80 },
    // Beat 3: 2nd string 1st fret (1/4 note)
    { id: 'n-3', measureIndex: 0, stringIndex: 2, fret: 1, timestampSec: 1.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 85 },
    // Beat 4: 1st string open (1/4 note)
    { id: 'n-4', measureIndex: 0, stringIndex: 1, fret: 0, timestampSec: 1.80, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 82 },

    // Measure 2: G/B Walk-down with 8th-note connected rhythm beams (2.40s - 4.80s)
    // Beat 1: Dual pinch notes on same vertical line
    { id: 'n-5a', measureIndex: 1, stringIndex: 5, fret: 2, timestampSec: 2.40, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 92, chordName: 'G/B' },
    { id: 'n-5b', measureIndex: 1, stringIndex: 2, fret: 3, timestampSec: 2.40, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 88, chordName: 'G/B' },
    // Beat 2:
    { id: 'n-6', measureIndex: 1, stringIndex: 3, fret: 0, timestampSec: 3.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 78 },
    // Beat 3 & 4: Consecutive 8th notes with horizontal beam connection (八分音符符杠连接)
    { id: 'n-7', measureIndex: 1, stringIndex: 2, fret: 3, timestampSec: 3.60, durationSec: 0.28, rhythmType: '1/8', technique: 'normal', velocity: 84 },
    { id: 'n-8', measureIndex: 1, stringIndex: 1, fret: 3, timestampSec: 3.90, durationSec: 0.28, rhythmType: '1/8', technique: 'normal', velocity: 80 },
    { id: 'n-8b', measureIndex: 1, stringIndex: 2, fret: 3, timestampSec: 4.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 82 },

    // Measure 3: Am Chord (4.80s - 7.20s)
    // Beat 1: Am dual root + 3rd
    { id: 'n-9a', measureIndex: 2, stringIndex: 5, fret: 0, timestampSec: 4.80, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 94, chordName: 'Am' },
    { id: 'n-9b', measureIndex: 2, stringIndex: 2, fret: 1, timestampSec: 4.80, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 90, chordName: 'Am' },
    // Beat 2:
    { id: 'n-10', measureIndex: 2, stringIndex: 4, fret: 2, timestampSec: 5.40, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 85 },
    // Beat 3 & 4:
    { id: 'n-11', measureIndex: 2, stringIndex: 3, fret: 2, timestampSec: 6.00, durationSec: 0.55, rhythmType: '1/4', technique: 'hammer-on', velocity: 88 },
    { id: 'n-12', measureIndex: 2, stringIndex: 2, fret: 1, timestampSec: 6.60, durationSec: 0.55, rhythmType: '1/4', technique: 'vibrato', velocity: 90 },

    // Measure 4: F Major Full Barre Chord (横按与同一垂直线多音柱式) (7.20s - 9.60s)
    // Beat 1: Full 6-string Barre Chord on Fret 1 (B I) strictly aligned on vertical X line
    { id: 'n-13a', measureIndex: 3, stringIndex: 6, fret: 1, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 96, chordName: 'F', barreMarker: 'B I' },
    { id: 'n-13b', measureIndex: 3, stringIndex: 5, fret: 3, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 92, chordName: 'F', barreMarker: 'B I' },
    { id: 'n-13c', measureIndex: 3, stringIndex: 4, fret: 3, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 90, chordName: 'F', barreMarker: 'B I' },
    { id: 'n-13d', measureIndex: 3, stringIndex: 3, fret: 2, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 88, chordName: 'F', barreMarker: 'B I' },
    { id: 'n-13e', measureIndex: 3, stringIndex: 2, fret: 1, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 91, chordName: 'F', barreMarker: 'B I' },
    { id: 'n-13f', measureIndex: 3, stringIndex: 1, fret: 1, timestampSec: 7.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 89, chordName: 'F', barreMarker: 'B I' },
    // Beat 2:
    { id: 'n-14', measureIndex: 3, stringIndex: 3, fret: 2, timestampSec: 7.80, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 82 },
    // Beat 3:
    { id: 'n-15', measureIndex: 3, stringIndex: 2, fret: 1, timestampSec: 8.40, durationSec: 0.55, rhythmType: '1/4', technique: 'pull-off', velocity: 84 },
    // Beat 4:
    { id: 'n-16', measureIndex: 3, stringIndex: 1, fret: 0, timestampSec: 9.00, durationSec: 0.55, rhythmType: '1/4', technique: 'slide', velocity: 86 },

    // Measure 5: Solo Lick with 16th-note double beams (十六分音符双横梁连线) (9.60s - 12.00s)
    { id: 'n-17', measureIndex: 4, stringIndex: 3, fret: 2, timestampSec: 9.60, durationSec: 0.15, rhythmType: '1/16', technique: 'slide', velocity: 92 },
    { id: 'n-18', measureIndex: 4, stringIndex: 2, fret: 1, timestampSec: 9.75, durationSec: 0.15, rhythmType: '1/16', technique: 'normal', velocity: 88 },
    { id: 'n-19', measureIndex: 4, stringIndex: 2, fret: 3, timestampSec: 9.90, durationSec: 0.15, rhythmType: '1/16', technique: 'hammer-on', velocity: 95 },
    { id: 'n-20', measureIndex: 4, stringIndex: 1, fret: 0, timestampSec: 10.05, durationSec: 0.15, rhythmType: '1/16', technique: 'normal', velocity: 85 },
    { id: 'n-21', measureIndex: 4, stringIndex: 1, fret: 3, timestampSec: 10.80, durationSec: 0.55, rhythmType: '1/4', technique: 'vibrato', velocity: 98 },

    // Measure 6: G7 Chord (12.00s - 14.40s)
    { id: 'n-22a', measureIndex: 5, stringIndex: 6, fret: 3, timestampSec: 12.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 95, chordName: 'G7' },
    { id: 'n-22b', measureIndex: 5, stringIndex: 1, fret: 1, timestampSec: 12.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 90, chordName: 'G7' },
    { id: 'n-23', measureIndex: 5, stringIndex: 4, fret: 0, timestampSec: 12.60, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 80 },
    { id: 'n-24', measureIndex: 5, stringIndex: 2, fret: 0, timestampSec: 13.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 82 },
    { id: 'n-25', measureIndex: 5, stringIndex: 1, fret: 1, timestampSec: 13.80, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 88 },

    // Measure 7: C resolution sweep (14.40s - 16.80s)
    { id: 'n-26', measureIndex: 6, stringIndex: 5, fret: 3, timestampSec: 14.40, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 98, chordName: 'C' },
    { id: 'n-27', measureIndex: 6, stringIndex: 4, fret: 2, timestampSec: 15.00, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 88 },
    { id: 'n-28', measureIndex: 6, stringIndex: 3, fret: 0, timestampSec: 15.60, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 84 },
    { id: 'n-29', measureIndex: 6, stringIndex: 2, fret: 1, timestampSec: 16.20, durationSec: 0.55, rhythmType: '1/4', technique: 'normal', velocity: 90 },

    // Measure 8: Ending Strum Harmonics (16.80s - 19.20s)
    { id: 'n-30a', measureIndex: 7, stringIndex: 1, fret: 12, timestampSec: 16.80, durationSec: 2.20, rhythmType: '1/2', technique: 'harmonic', velocity: 100 },
    { id: 'n-30b', measureIndex: 7, stringIndex: 2, fret: 12, timestampSec: 16.80, durationSec: 2.20, rhythmType: '1/2', technique: 'harmonic', velocity: 100 },
    { id: 'n-30c', measureIndex: 7, stringIndex: 3, fret: 12, timestampSec: 16.80, durationSec: 2.20, rhythmType: '1/2', technique: 'harmonic', velocity: 100 },
  ],
};

export const INITIAL_MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'track-sunny',
    title: '《晴天》前奏分解与双音扫弦',
    artist: '周杰伦',
    genre: '流行弹唱',
    difficulty: '入门',
    keySignature: 'G大调',
    status: 'published',
    currentVersion: 'v1.1',
    cEndPlayCount: 38420,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-12',
    tags: ['前奏经典', '双音分解', '开放和弦', '推荐必弹'],
    tabConfig: INITIAL_AUDIO_TAB_SYNC,
    versions: [
      {
        versionNumber: 'v1.0',
        note: '初版：基础四分音符分解与小节线对齐',
        updatedAt: '2026-03-01 14:20',
        status: 'archive',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
      {
        versionNumber: 'v1.1',
        note: '名师强化版：增加击弦(H)与揉弦(~)装饰音，蓝牙延迟微调标定 -15ms',
        updatedAt: '2026-03-12 10:45',
        status: 'published',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-pain-jack',
    title: '《痛仰 - 再见杰克》副歌扫弦与切音对齐',
    artist: '痛仰乐队',
    genre: '摇滚前奏',
    difficulty: '进阶',
    keySignature: 'C大调',
    status: 'published',
    currentVersion: 'v1.0',
    cEndPlayCount: 24190,
    createdAt: '2026-02-18',
    updatedAt: '2026-03-05',
    tags: ['扫弦节奏', '切音律动', '下下上上下', '现场摇滚'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-jack-002',
      audioTitle: '《痛仰 - 再见杰克》副歌扫弦与切音对齐',
      bpm: 110,
      audioDurationSec: 21.8,
      measureTimestamps: [0.0, 2.18, 4.36, 6.54, 8.72, 10.9, 13.08, 15.26, 17.44, 19.62],
      playbackOffsetMs: 0,
      loopRegion: { startSec: 4.36, endSec: 10.9, enabled: true },
    },
    versions: [
      {
        versionNumber: 'v1.0',
        note: '标准现场副歌高速扫弦版，附带右手掌根弱音切音标记',
        updatedAt: '2026-03-05 16:30',
        status: 'published',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-hotel-california',
    title: '《加州旅馆 (Hotel California)》前奏慢速分解',
    artist: 'Eagles',
    genre: '民谣吉他',
    difficulty: '挑战',
    keySignature: 'B小调',
    status: 'draft',
    currentVersion: 'v0.9',
    cEndPlayCount: 0,
    createdAt: '2026-03-10',
    updatedAt: '2026-03-17',
    tags: ['十二弦手感', '低音交替', 'Bm横按', '教研打点中'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-hotel-003',
      audioTitle: '《加州旅馆》慢速分解与Bm卡点训练',
      bpm: 72,
      audioDurationSec: 26.6,
      playbackOffsetMs: -10,
    },
    versions: [
      {
        versionNumber: 'v0.8',
        note: '初测版：小节线大致对齐，Bm横按音符待校正',
        updatedAt: '2026-03-10 11:00',
        status: 'draft',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
      {
        versionNumber: 'v0.9',
        note: '当前工作草稿：补全 128 点声学波形，增加 7 品卡波夹低音标记',
        updatedAt: '2026-03-17 18:15',
        status: 'draft',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-canon',
    title: '《卡农 (Canon in D)》C调入门指弹独奏',
    artist: '帕赫贝尔',
    genre: '指弹独奏',
    difficulty: '进阶',
    keySignature: 'C大调',
    status: 'published',
    currentVersion: 'v2.0',
    cEndPlayCount: 52180,
    createdAt: '2026-01-15',
    updatedAt: '2026-03-08',
    tags: ['独奏经典', '双声部对齐', '和声走向', '精选指弹'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-canon-004',
      audioTitle: '《卡农》C调双声部独立线条',
      bpm: 76,
      audioDurationSec: 25.2,
      measureTimestamps: [0.0, 3.15, 6.3, 9.45, 12.6, 15.75, 18.9, 22.05],
    },
    versions: [
      {
        versionNumber: 'v1.0',
        note: '单音主旋律简化版',
        updatedAt: '2026-01-15 09:30',
        status: 'archive',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
      {
        versionNumber: 'v2.0',
        note: '全低音交替伴奏完整独奏版，C-G-Am-Em-F-C-F-G 黄金走向',
        updatedAt: '2026-03-08 15:40',
        status: 'published',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-story-time',
    title: '《光阴的故事》开放和弦扫弦对齐',
    artist: '罗大佑',
    genre: '民谣吉他',
    difficulty: '入门',
    keySignature: 'D大调',
    status: 'draft',
    currentVersion: 'v0.5',
    cEndPlayCount: 0,
    createdAt: '2026-03-14',
    updatedAt: '2026-03-16',
    tags: ['民谣怀旧', '新手首选', 'D-A-Bm-F#m', '待校音'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-story-005',
      audioTitle: '《光阴的故事》基础扫弦节奏',
      bpm: 84,
      audioDurationSec: 22.8,
    },
    versions: [
      {
        versionNumber: 'v0.5',
        note: '刚导入原音频，待利用 Spacebar 进行 Tap-to-Align 跟敲打点',
        updatedAt: '2026-03-14 17:20',
        status: 'draft',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-romance',
    title: '《爱的罗曼斯》轮指技巧专项练习曲 (旧版)',
    artist: '传统西班牙古典',
    genre: '综合练习曲',
    difficulty: '进阶',
    keySignature: 'E小调',
    status: 'archive',
    currentVersion: 'v1.0',
    cEndPlayCount: 8940,
    createdAt: '2025-11-20',
    updatedAt: '2026-01-10',
    tags: ['三连音', '古典吉他', '轮指', '已归档'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-romance-006',
      audioTitle: '《爱的罗曼斯》轮指三连音',
      bpm: 90,
      audioDurationSec: 24.0,
    },
    versions: [
      {
        versionNumber: 'v1.0',
        note: '2025年度教研旧版归档，已迁移至新版《五级古典指弹精修》',
        updatedAt: '2026-01-10 12:00',
        status: 'archive',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
  {
    id: 'track-ordinary-path',
    title: '《平凡之路》卡波夹2品低音跑动',
    artist: '朴树',
    genre: '流行弹唱',
    difficulty: '入门',
    keySignature: 'A小调',
    status: 'published',
    currentVersion: 'v1.0',
    cEndPlayCount: 46720,
    createdAt: '2026-02-10',
    updatedAt: '2026-02-28',
    tags: ['卡波夹2品', '八分音符下扫', 'Em-C-G-D', '热门弹唱'],
    tabConfig: {
      ...INITIAL_AUDIO_TAB_SYNC,
      audioId: 'audio-ordinary-007',
      audioTitle: '《平凡之路》低音走向扫弦对齐',
      bpm: 88,
      audioDurationSec: 21.8,
    },
    versions: [
      {
        versionNumber: 'v1.0',
        note: '经典 Em-C-G-D 进行，原汁原味低音连接跑动',
        updatedAt: '2026-02-28 14:10',
        status: 'published',
        config: INITIAL_AUDIO_TAB_SYNC,
      },
    ],
  },
];

// 5-Level Topology: Stage -> Course -> Chapter -> LessonStep -> Interactive Modules
export const INITIAL_STAGES: Stage[] = [
  {
    id: 'stage-l1',
    stageCode: 'L1',
    name: '入门筑基阶段 (Zero to Basic Strumming)',
    focus: '琴体工学握持、琴头精准调音、三大开放和弦 (C/G/Am) 与初级四分音符下扫律动',
    courses: [
      {
        id: 'course-c101',
        title: '《民谣吉他核心手型与黄金20分钟实战营》',
        subtitle: '建立无痛按弦记忆与节拍器肌肉记忆',
        coverColor: 'from-amber-600 to-orange-700',
        targetLevel: '吉他小白零基础 ~ 练习时长 15 小时内',
        chapters: [
          {
            id: 'chap-101-1',
            title: '第1章：琴弦发声机理与立指工学',
            description: '消除指肚蹭弦哑音，建立指尖第1关节垂直触弦规范',
            order: 1,
            lessons: [
              {
                id: 'lesson-step-001',
                title: '第01课：黄金立指工学与 C 和弦纯净按压',
                type: 'chord_quiz',
                prerequisite: {
                  linearUnlocked: true,
                  minAiScore: 80,
                  minVideoWatchRate: 95,
                },
                timeAllocation: {
                  tuningMin: 3,
                  videoMin: 6,
                  quizMin: 4,
                  drillMin: 4,
                  songMin: 3,
                },
                videoData: {
                  videoId: 'vid-gt-001',
                  title: '【名师精讲】指尖第1关节立指与虎口离空核心要领',
                  durationSec: 360,
                  instructor: '陈亮风格高级教研组 · 齐老师',
                  resolution: '4K',
                  transcodeStatus: 'READY',
                  keyPoints: [
                    {
                      id: 'kp-1',
                      timestampSec: 45,
                      title: '虎口悬空：拇指后置定位',
                      description: '虎口不可直接死贴琴颈下沿，拇指指腹顶于琴颈背面中轴线偏上位置。',
                      category: 'hand_posture',
                      linkedChordName: 'C',
                    },
                    {
                      id: 'kp-2',
                      timestampSec: 138,
                      title: '2弦1品食指防哑音重点',
                      description: '食指极易向下塌陷蹭到1弦空弦，必须使指甲盖正对上方，垂直按压在品丝正后方2毫米处。',
                      category: 'anti_buzz',
                      linkedChordName: 'C',
                    },
                    {
                      id: 'kp-3',
                      timestampSec: 280,
                      title: '4弦2品中指力矩支撑点',
                      description: '中指作为拱桥中心，第2关节向外顶出，为无名指跨弦提供空间。',
                      category: 'chord_switch',
                      linkedChordName: 'C',
                    },
                  ],
                },
                trainerData: {
                  chordPairs: [
                    {
                      id: 'pair-c-am',
                      fromChord: 'C',
                      toChord: 'Am',
                      startBpm: 40,
                      targetBpm: 80,
                      stepBpm: 5,
                      passBars: 8,
                      toleranceCents: 15,
                    },
                  ],
                  toleranceCents: 15,
                  initialBpm: 40,
                  targetBpm: 80,
                  noiseGateDb: -42,
                },
                songBinding: {
                  songId: 'song-c-01',
                  songName: '《晴天》前奏简化版分解',
                  difficulty: '入门',
                  tabSyncId: 'audio-gt-2026-001',
                  originalArtist: '周杰伦',
                },
              },
              {
                id: 'lesson-step-002',
                title: '第02课：从 C 到 Am 的不动指“轴心转换”技巧',
                type: 'pair_drill',
                prerequisite: {
                  linearUnlocked: true,
                  minAiScore: 85,
                  minVideoWatchRate: 90,
                },
                timeAllocation: {
                  tuningMin: 3,
                  videoMin: 6,
                  quizMin: 4,
                  drillMin: 4,
                  songMin: 3,
                },
                videoData: {
                  videoId: 'vid-gt-002',
                  title: '保留指魔法：食指与中指完全不离弦实现0延迟换把',
                  durationSec: 360,
                  instructor: '董运昌指弹学派教研席 · 林老师',
                  resolution: '1080P',
                  transcodeStatus: 'READY',
                  keyPoints: [
                    {
                      id: 'kp-4',
                      timestampSec: 62,
                      title: '无名指单兵调动',
                      description: '观察手型，C和弦转Am仅需将5弦3品无名指轻轻移至3弦2品，其余两指焊死在品位上。',
                      category: 'chord_switch',
                      linkedChordName: 'Am',
                    },
                  ],
                },
                trainerData: {
                  chordPairs: [
                    {
                      id: 'pair-am-c',
                      fromChord: 'Am',
                      toChord: 'C',
                      startBpm: 50,
                      targetBpm: 85,
                      stepBpm: 5,
                      passBars: 8,
                      toleranceCents: 15,
                    },
                  ],
                  toleranceCents: 15,
                  initialBpm: 50,
                  targetBpm: 85,
                  noiseGateDb: -40,
                },
                songBinding: {
                  songId: 'song-am-01',
                  songName: '《痛仰 - 再见杰克》副歌扫弦对齐',
                  difficulty: '入门',
                  tabSyncId: 'audio-gt-2026-001',
                  originalArtist: '痛仰乐队',
                },
              },
            ],
          },
          {
            id: 'chap-101-2',
            title: '第2章：G和弦三指型与大横按 F 和弦破冰',
            description: '攻克初学者第一道大门槛，利用手腕下沉与杠杆力攻克横按',
            order: 2,
            lessons: [
              {
                id: 'lesson-step-003',
                title: '第03课：大横按 F 和弦侧刃发力与琴颈杠杆力',
                type: 'pair_drill',
                prerequisite: {
                  linearUnlocked: true,
                  minAiScore: 75,
                  minVideoWatchRate: 95,
                },
                timeAllocation: {
                  tuningMin: 3,
                  videoMin: 6,
                  quizMin: 4,
                  drillMin: 4,
                  songMin: 3,
                },
                videoData: {
                  videoId: 'vid-gt-003',
                  title: '拒绝手掌死捏！大横按的身体重力学与食指外侧骨骼发力',
                  durationSec: 420,
                  instructor: '陈亮风格高级教研组 · 齐老师',
                  resolution: '4K',
                  transcodeStatus: 'READY',
                  keyPoints: [
                    {
                      id: 'kp-5',
                      timestampSec: 90,
                      title: '食指微转30度用骨质侧面',
                      description: '食指正面肉质柔软易吃进琴弦导致闷音，必须微向琴头侧旋，用坚硬的侧骨下压。',
                      category: 'anti_buzz',
                      linkedChordName: 'F',
                    },
                    {
                      id: 'kp-6',
                      timestampSec: 210,
                      title: '右手右肘向后带力平衡',
                      description: '右手小臂向后扣压吉他共鸣箱，形成杠杆原理将指板推向左手，无需虎口拼命捏挤。',
                      category: 'hand_posture',
                      linkedChordName: 'F',
                    },
                  ],
                },
                trainerData: {
                  chordPairs: [
                    {
                      id: 'pair-c-f',
                      fromChord: 'C',
                      toChord: 'F',
                      startBpm: 40,
                      targetBpm: 75,
                      stepBpm: 5,
                      passBars: 8,
                      toleranceCents: 15,
                    },
                  ],
                  toleranceCents: 15,
                  initialBpm: 40,
                  targetBpm: 75,
                  noiseGateDb: -42,
                },
                songBinding: {
                  songId: 'song-f-01',
                  songName: '《加州旅馆》慢速和弦进行',
                  difficulty: '进阶',
                  tabSyncId: 'audio-gt-2026-001',
                  originalArtist: 'Eagles',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'stage-l2',
    stageCode: 'L2',
    name: '基础进阶阶段 (Intermediate Rhythm & Chords)',
    focus: '切音扫弦、低音跑动 (Bass Walk)、挂留和弦与十六分音符复杂重音移位',
    courses: [
      {
        id: 'course-c201',
        title: '《律动吉他手：扫弦切音与七和弦色彩应用》',
        subtitle: '掌根切音、哑音扫弦与复合拍子实战',
        coverColor: 'from-emerald-600 to-teal-800',
        targetLevel: '掌握基础开放和弦，练习时长 40+ 小时',
        chapters: [],
      },
    ],
  },
  {
    id: 'stage-l3',
    stageCode: 'L3',
    name: '指弹独奏阶段 (Fingerstyle Solo Master)',
    focus: '拍弦 (Slap)、点弦 (Tap)、泛音调谐与多声部独立线条对齐编配',
    courses: [],
  },
];

// Comprehensive chord dictionary with exact 6-string finger allocations & tips
export const CHORD_LIBRARY: Record<string, ChordConfig> = {
  'C': {
    id: 'chord-c',
    name: 'C',
    rootNote: 'C',
    bassString: 5,
    // [String 6, 5, 4, 3, 2, 1]
    frets: ['x', 3, 2, 0, 1, 0],
    fingers: [null, 3, 2, null, 1, null],
    pitfalls: [
      '食指指腹极易塌下贴到1弦空弦，导致1弦高音E闷音或哑音',
      '无名指按5弦3品时未靠近品丝，导致低音发虚有打品杂音',
      '拇指不自觉绕过琴颈掐死指板，限制了手指张角',
    ],
    tips: '【防哑音要点】食指指甲朝上垂直立起；中指拱成弧桥给无名指让位；右手弹奏时务必避开6弦低音或用无名指指尖轻触6弦轻微消音。',
  },
  'Am': {
    id: 'chord-am',
    name: 'Am',
    rootNote: 'A',
    bassString: 5,
    frets: ['x', 0, 2, 2, 1, 0],
    fingers: [null, null, 2, 3, 1, null],
    pitfalls: [
      '中指(4弦2品)与无名指(3弦2品)挤在一起时容易歪斜蹭到2弦',
      '手腕过于上拱导致小鱼际肌肉酸痛',
    ],
    tips: '【防哑音要点】与C和弦手型几乎一致，食指中指保持不动，将无名指缩到中指正下方3弦2品即可。',
  },
  'G': {
    id: 'chord-g',
    name: 'G',
    rootNote: 'G',
    bassString: 6,
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [3, 2, null, null, null, 4],
    pitfalls: [
      '用小指按1弦3品力度不足，导致1弦产生嗡鸣打品',
      '中指(6弦3品)肉肚不小心闷死5弦2品',
    ],
    tips: '【防哑音要点】中指一定要立起来，手腕略微向琴头方向下沉，小指提前寻找1弦3品支撑点。',
  },
  'Em': {
    id: 'chord-em',
    name: 'Em',
    rootNote: 'E',
    bassString: 6,
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [null, 2, 3, null, null, null],
    pitfalls: [
      '中指和无名指并拢时压到3弦',
      '用力过猛导致手指关节僵硬无法快速切换',
    ],
    tips: '【防哑音要点】最简单双指和弦，6根弦均可同时发声，两指分别立在5弦与4弦靠近品丝处。',
  },
  'F': {
    id: 'chord-f',
    name: 'F (大横按)',
    rootNote: 'F',
    bassString: 6,
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barreFret: 1,
    pitfalls: [
      '用食指正面肉最软处横按，导致2弦和1弦完全闷死发哑',
      '左手虎口死命发力捏琴颈，5分钟即虎口抽筋酸痛',
      '食指过高导致掌关节悬空失去支撑',
    ],
    tips: '【防哑音要点】食指微向琴头转动20-30度，以坚硬侧面触弦；中指无名指小指先按好345弦，食指最后带入；利用右手手臂向后压琴体的力矩，把琴颈自然贴向食指。',
  },
  'Dm': {
    id: 'chord-dm',
    name: 'Dm',
    rootNote: 'D',
    bassString: 4,
    frets: ['x', 'x', 0, 2, 3, 1],
    fingers: [null, null, null, 2, 3, 1],
    pitfalls: [
      '无名指按2弦3品时容易碰触1弦',
      '右手扫弦误扫了6弦与5弦粗弦，产生严重浑浊低音',
    ],
    tips: '【防哑音要点】右手必须从4弦开始发音；无名指单点立指，拇指从上方可探出轻触6弦防蹭。',
  },
  'Bm': {
    id: 'chord-bm',
    name: 'Bm (2品横按)',
    rootNote: 'B',
    bassString: 5,
    frets: ['x', 2, 4, 4, 3, 2],
    fingers: [null, 1, 3, 4, 2, 1],
    barreFret: 2,
    pitfalls: [
      '食指尖误按到了6弦导致发出刺耳的F#低音',
      '无名指小指叠压导致4弦或3弦发哑',
    ],
    tips: '【防哑音要点】食指指尖顶在6弦下腹消音；食指第2品横按5弦至1弦，掌根微微内收保持手型紧凑。',
  },
};

// Top Chords Barrier Leaderboard for Learning Analytics
export const HARD_CHORDS_METRICS: HardChordMetric[] = [
  {
    chordName: 'F (大横按)',
    passRate: 32.4,
    sampleCount: 14280,
    avgRetryTimes: 18.6,
    avgStuckDays: 6.8,
    topFailureReason: '食指2弦与1弦软肉压弦导致发哑，掌心贴死琴颈无力矩',
    acousticIssueSpectrum: {
      buzzingRate: 42,
      muteStringRate: 38,
      slowTransitionRate: 15,
      wrongPitchRate: 5,
    },
  },
  {
    chordName: 'Bm (五品小横按)',
    passRate: 41.2,
    sampleCount: 10920,
    avgRetryTimes: 14.2,
    avgStuckDays: 4.5,
    topFailureReason: '根音5弦发闷，中指2弦3品未立起蹭到1弦',
    acousticIssueSpectrum: {
      buzzingRate: 35,
      muteStringRate: 44,
      slowTransitionRate: 16,
      wrongPitchRate: 5,
    },
  },
  {
    chordName: 'C/G (复合低音和弦)',
    passRate: 58.7,
    sampleCount: 8430,
    avgRetryTimes: 9.1,
    avgStuckDays: 2.7,
    topFailureReason: '无名指与小指跨度过宽造成手腕过度前旋',
    acousticIssueSpectrum: {
      buzzingRate: 28,
      muteStringRate: 26,
      slowTransitionRate: 40,
      wrongPitchRate: 6,
    },
  },
  {
    chordName: 'Bb (高把位横按)',
    passRate: 35.1,
    sampleCount: 6810,
    avgRetryTimes: 16.5,
    avgStuckDays: 5.2,
    topFailureReason: '无名指小横按234弦无法避开1弦，指力储备不足',
    acousticIssueSpectrum: {
      buzzingRate: 39,
      muteStringRate: 41,
      slowTransitionRate: 14,
      wrongPitchRate: 6,
    },
  },
  {
    chordName: 'G (四指民谣型)',
    passRate: 74.3,
    sampleCount: 18900,
    avgRetryTimes: 5.4,
    avgStuckDays: 1.4,
    topFailureReason: '小指无名指同时控制1、2弦3品速度滞后',
    acousticIssueSpectrum: {
      buzzingRate: 22,
      muteStringRate: 18,
      slowTransitionRate: 54,
      wrongPitchRate: 6,
    },
  },
];

export const DROPOFF_FUNNEL_STEPS: LessonDropoffFunnelStep[] = [
  { stepKey: 'tuningMin', label: '1. 琴头校音', durationMin: 3, completionRate: 98.4, dropoffRate: 1.6, avgUserScore: 96 },
  { stepKey: 'videoMin', label: '2. 视频精讲', durationMin: 6, completionRate: 92.1, dropoffRate: 6.3, avgUserScore: 89 },
  { stepKey: 'quizMin', label: '3. 和弦微测', durationMin: 4, completionRate: 81.5, dropoffRate: 10.6, avgUserScore: 82 },
  { stepKey: 'drillMin', label: '4. 转换冲刺', durationMin: 4, completionRate: 64.2, dropoffRate: 17.3, avgUserScore: 74 },
  { stepKey: 'songMin', label: '5. 曲目对拍', durationMin: 3, completionRate: 56.8, dropoffRate: 7.4, avgUserScore: 78 },
];
