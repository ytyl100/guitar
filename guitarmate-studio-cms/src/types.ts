export interface TabNote {
  id: string;
  measureIndex: number;
  stringIndex: number; // 1 = 1st string (High E), 6 = 6th string (Low E)
  fret: number | string; // 0, 1, 2, 3... or 'X', 'h', 'p'
  timestampSec: number;
  durationSec: number;
  rhythmType?: '1/4' | '1/8' | '1/16' | '1/32' | '1/2' | '1/1';
  technique?: 'normal' | 'hammer-on' | 'pull-off' | 'slide' | 'vibrato' | 'bend' | 'palm-mute' | 'harmonic';
  velocity?: number; // 0 - 127
  chordName?: string;
  barreMarker?: string; // e.g. "B I" for barre on fret 1
  /** 转录置信度 0-1 (SoloTrace 导入时写入，<0.6 需人工复核) */
  confidence?: number;
  /** MIDI 音高 (SoloTrace 导入时写入) */
  pitch?: number;
}

/** 横按标注 (与后端 Barre 模型对齐，坐标为归一化 0-1) */
export interface BarreMarker {
  id: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number; // 相对小节或全曲起始的秒数
  duration: number;
  x: number; // 归一化 X (0-1)
  y: number; // 归一化 Y (0-1)
  instrument?: string;
}

/** 和弦标记 (与后端 ChordMarker 模型对齐) */
export interface ChordMarker {
  id: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number; // 归一化 X (0-1)
  y: number; // 归一化 Y (0-1)
  instrument?: string;
}

export interface AudioTabSyncConfig {
  audioId: string;
  audioTitle?: string;
  audioDurationSec: number;
  waveformPeaks: number[]; // 128 acoustic waveform peaks normalized (0.0 to 1.0)
  measureTimestamps: number[]; // e.g. [0.00, 2.40, 4.80, 7.20, ...]
  noteTimestamps: TabNote[];
  playbackOffsetMs: number; // Bluetooth headset latency adjustment: ±200ms
  bpm?: number;
  timeSignature?: [number, number]; // [4, 4]
  loopRegion?: {
    startSec: number;
    endSec: number;
    enabled: boolean;
  };
  // ── 后端 (guitarmate-audio-backend) 发布绑定信息 ──────────────
  /** 后端 Score ID，用于 POST /api/measures/publish */
  remoteScoreId?: string;
  /** 后端 Track ID，用于 POST /api/measures/publish */
  remoteTrackId?: string;
  /** 分轨原始音频的本地绝对路径或 URL（后端 ffmpeg 切片使用） */
  remoteAudioPath?: string;
  /**
   * 练习声道 —— C 端 Simplified 模式播放该声道。
   * guitar(默认) / guitar_lead / guitar_rhythm / bass / piano / other
   */
  remoteChannel?: string;
  /**
   * 原声（含鼓 / 贝斯 / 电琴等全轨混音）路径或 URL —— C 端 Original 模式播放。
   * 留空时后端自动回退到 Score.originalAudio。
   */
  remoteOriginalAudioPath?: string;
  /** 转录来源文件名 (SoloTrace / Basic Pitch 导出的 JSON) */
  transcriptionFileName?: string;
  /** 转录音符的低置信度数量 (<0.6)，需人工优先复核 */
  lowConfidenceCount?: number;
  /**
   * 和弦标注（可选）。
   *
   * 对齐工作台的 `chordMarkers` 原本只存在组件局部 state 里 →
   * 从「① 音频导入与六线谱校正」跳过来时**复核阶段标注的和弦会在重新发布时丢掉**。
   * 落到配置里之后：切走再回来还在，发布时也能照常写进 ChordMarker 表。
   * `startTime` 是**整曲绝对秒**（与 `noteTimestamps[].timestampSec` 同一口径）。
   */
  chordMarkers?: Array<{ id: string; chordName: string; startTime: number }>;
  /**
   * 扫弦模式配置（「六线谱编辑器」用；**可选、不影响发布载荷**）。
   *
   * 这里刻意不引入独立的 `strums` 表：和弦轨 + 扫弦轨只是编辑期的中间表示，
   * 点「套用为音符」时会合成成标准 `TabNote` 写进 `noteTimestamps`，
   * 因此与既有发布链路（measures[].notes）完全兼容。
   * 类型定义见 `components/studios/tablature/tabEditorModel.ts#StrumConfig`。
   */
  strumConfig?: {
    chordName: string;
    chordShape: number[];
    strings: number[];
    grid: string;
    pattern: string[];
    velocity: number;
    stagger: boolean;
  };
}

export interface VideoKeyPoint {
  id: string;
  timestampSec: number;
  title: string;
  description: string;
  category: 'hand_posture' | 'rhythm_tip' | 'chord_switch' | 'anti_buzz' | 'tone';
  linkedChordName?: string;
  thumbnailTimeSec?: number;
}

export interface ChordConfig {
  id: string;
  name: string; // e.g., "C", "Am", "F", "G", "Dm7", "Em"
  rootNote: string;
  bassString: number; // 4, 5, 6
  // String 6 (Low E) to String 1 (High E):
  // value: number for fret, 'x' for mute, 'o' for open
  frets: (number | 'x' | 'o')[];
  // finger for each string (1=Index, 2=Middle, 3=Ring, 4=Pinky, null)
  fingers: (number | null)[];
  barreFret?: number;
  pitfalls: string[]; // 避坑指南
  tips: string; // 防哑音要点
  audioFrequencies?: number[];
}

export interface ChordPairConfig {
  id: string;
  fromChord: string;
  toChord: string;
  startBpm: number;
  targetBpm: number;
  stepBpm: number; // e.g., +5 BPM
  passBars: number; // e.g., 4 or 8 bars consecutive
  toleranceCents: number; // e.g. 15 cents
}

export interface LessonStep {
  id: string;
  title: string;
  type: 'tuning' | 'video' | 'chord_quiz' | 'pair_drill' | 'song_sync';
  prerequisite: {
    linearUnlocked: boolean; // 严格线性顺序
    minAiScore: number; // AI 听音评分卡点 (60 ~ 100)
    minVideoWatchRate: number; // 视频完播率防刷 (80% ~ 100%)
  };
  timeAllocation: {
    tuningMin: number; // e.g. 3m
    videoMin: number; // e.g. 6m
    quizMin: number; // e.g. 4m
    drillMin: number; // e.g. 4m
    songMin: number; // e.g. 3m
  };
  /**
   * 自定义时间切片模块（可选）。
   *
   * 为什么不直接用 `timeAllocation`？—— 它的 5 个字段（tuning/video/quiz/drill/song）
   * 是**教学法固定维度**，被 C 端与卡点引擎直接消费，不能随便加字段；
   * 而教研偶尔需要额外模块（如「节奏跟拍」「视奏」）。两者并存：
   * `timeAllocation` 永远是这 5 项的分钟数，`timeModules` 存在时用于**覆盖展示名称/顺序/颜色**
   * 以及承载额外模块（额外模块的分钟数只在这里维护，不计入黄金 20 分钟校验）。
   */
  timeModules?: TimeModule[];
  videoData: {
    videoId: string;
    title: string;
    durationSec: number;
    instructor: string;
    resolution: '1080P' | '4K' | '720P';
    transcodeStatus: 'READY' | 'PROCESSING' | 'FAILED';
    keyPoints: VideoKeyPoint[];
  };
  /** 关联的教学视频（多对多）；为空时回退到 `videoData` 的那一个 */
  videoIds?: string[];
  /** 关联的和弦练习组（多对多，提供和弦练习） */
  chordGroupIds?: string[];
  trainerData: {
    chordPairs: ChordPairConfig[];
    toleranceCents: number; // ±15 cents
    initialBpm: number;
    targetBpm: number;
    noiseGateDb: number;
    /** 练习阶段列表（每个和弦组合可配置多阶段）；为空时回退 `chordPairs[0]` */
    stages?: ChordDrillStage[];
  };
  songBinding: {
    songId: string;
    songName: string;
    difficulty: '入门' | '进阶' | '挑战';
    tabSyncId: string;
    originalArtist?: string;
  };
}

/** 时间切片模块（用于课时的可视化分配；内置 5 个模块的元信息在这里统一） */
export interface TimeModule {
  /** 内置模块 = tuningMin/videoMin/quizMin/drillMin/songMin；自定义模块 = `custom-*` */
  key: string;
  name: string;
  minutes: number;
  /** 标配分钟数（界面提示用） */
  defaultMin: number;
  /** Tailwind 背景色（进度条分段） */
  color: string;
  /** Tailwind 文字色（卡片标题） */
  textCol: string;
  desc: string;
  /** true = 教研自定义模块，不计入黄金 20 分钟校验 */
  custom?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LessonStep[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  /** 封面兜底色（Tailwind 渐变 token，如 `from-amber-600 to-orange-700`）；没上传封面图时用 */
  coverColor: string;
  /**
   * 课程封面图（后端上传返回的**相对路径**，如 `/uploads/curriculum/covers/cover_ab12cd34ef56.png`）。
   *
   * ⚠️ 存相对路径而不是绝对 URL：换域名/换机器时不用把整棵课程树重编一遍。
   * C 端（`/api/curriculum/learn`）会自动拼成绝对地址给 `<img>` / `<Image>` 用。
   */
  coverImage?: string;
  targetLevel: string;
  chapters: Chapter[];
}

/** 成长阶段编码：放开到 L9（新增阶段时自动取下一个未占用编码） */
export type StageCode = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9';

export interface Stage {
  id: string;
  stageCode: StageCode;
  name: string;
  focus: string;
  /** 排序（缺省按数组顺序） */
  order?: number;
  courses: Course[];
}

/** 教学视频（视频库实体，可被多个课时复用） */
export interface TeachingVideo {
  id: string;
  title: string;
  instructor: string;
  /** 视频源地址（CDN / OSS）；管理员上传后由后端转码写入 */
  videoUrl: string;
  /**
   * 转码产物（后端 `POST /api/curriculum/assets/transcode` 的结果，由后台点「转码」写回）。
   * `url` 存的是**相对路径**（`/uploads/curriculum/videos/transcoded/x_720p.mp4`），
   * C 端投影时拼成绝对地址 —— 与 `videoUrl` 同一套约定。
   */
  variants?: Array<{ label: string; url: string }>;
  coverUrl?: string;
  durationSec: number;
  resolution: '1080P' | '4K' | '720P';
  transcodeStatus: 'READY' | 'PROCESSING' | 'FAILED';
  status: 'draft' | 'ready' | 'archived';
  tags: string[];
  keyPoints: VideoKeyPoint[];
  /** 首次由哪个课时创建（溯源用，不参与引用计数） */
  sourceLessonId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 「谁在引用这个资产文件」里的一条引用。
 * `video` = 视频库记录；`lesson` = 课时里的内联副本；`course` = 课程封面。
 */
export interface CurriculumAssetRef {
  kind: 'video' | 'lesson' | 'course';
  id: string;
  title: string;
}

/** 资产库统计（视频 / 封面共用） */
export interface CurriculumAssetBucket<T> {
  total: number;
  totalBytes: number;
  referencedCount: number;
  orphanCount: number;
  /** 这一桶里的孤儿文件共占多少字节（一键清理能省的数字） */
  orphanBytes: number;
  items: T[];
}

/**
 * 统一视频资产库里的一个**视频文件**（`GET /api/curriculum/assets` → `videos.items`）。
 *
 * ⚠️ 别和 `TeachingVideo` 搞混：那是课程文档里的**记录**，这是磁盘上的**字节**。
 * 记录可以指向某个文件，也可以谁都不指（那就是 `referencedBy: []` 的孤儿）。
 */
export interface CurriculumVideoAsset {
  fileName: string;
  /** 相对路径（与 `TeachingVideo.videoUrl` 同一套写法，可直接写回去） */
  relativePath: string;
  /** 绝对 URL（浏览器里直接点开预览/下载） */
  url: string;
  /** `source` = CMS 直传的源文件；`transcoded` = ffmpeg 产物 */
  folder: 'source' | 'transcoded';
  sizeBytes: number;
  mtimeMs: number;
  /** ffprobe 探到的真实时长（读不到就是 null —— 损坏文件 / 非视频） */
  durationSec: number | null;
  resolution: { width: number; height: number } | null;
  /** 这次是否真的探测过（超出后端单次探测上限的文件会是 false，下次刷新轮到） */
  probed: boolean;
  referencedBy: CurriculumAssetRef[];
}

/**
 * 统一资产库里的一个**封面图文件**。
 *
 * 封面和视频一样会变孤儿：换一张封面只是改课程文档里的字段，旧图会留在磁盘上。
 */
export interface CurriculumCoverAsset {
  fileName: string;
  relativePath: string;
  url: string;
  sizeBytes: number;
  mtimeMs: number;
  referencedBy: CurriculumAssetRef[];
}

/**
 * 统一资产库的一次完整响应（`GET /api/curriculum/assets`）。
 *
 * 把「文件」与「引用」两个方向一次说完：
 * - `videos` / `covers`：**磁盘上的文件** → 被谁引用（`referencedBy` 空 = 孤儿）；
 * - `dangling`：**反过来** —— 被引用但文件不在（C 端会点出假播放按钮 / 封面裂图）；
 * - `orphanBytes`：一键清理能省多少空间。
 */
export interface CurriculumAssetLibrary {
  videos: CurriculumAssetBucket<CurriculumVideoAsset> & { probeLimit: number };
  covers: CurriculumAssetBucket<CurriculumCoverAsset>;
  dangling: Array<{ kind: 'video' | 'cover'; path: string; referencedBy: CurriculumAssetRef[] }>;
  orphanBytes: number;
}

/**
 * 后端**课程以外**目录的体检结果（`GET /api/storage/health`）。
 *
 * 与课程资产是同一套思路的第二个实现：`uploads/` 下这些目录各自属于不同的表，
 * 归属口径不同（`transcriptions/<projectId>`、`measures/<scoreId>`、`tab-projects/<scoreId>`、`demo/` 缓存）。
 */
export interface StorageDomainReport {
  domain: string;
  dir: string;
  label: string;
  files: number;
  bytes: number;
  /** 没有归属的文件（可清理） */
  orphanFiles: number;
  orphanBytes: number;
  /** 库里指了路径、但文件不在（悬空引用） */
  missingRefs: number;
  orphanSample: Array<{ rel: string; bytes: number; reason: string }>;
  missingSample: Array<{ rel: string; owner: string; field: string }>;
  /** 结构性缺失（记录在、内容缺） */
  dataGaps: string[];
  /** 是否允许一键清理孤儿 */
  cleanable: boolean;
  note: string;
}

export interface StorageHealth {
  checkedAt: string;
  totals: {
    files: number;
    bytes: number;
    orphanFiles: number;
    orphanBytes: number;
    missingRefs: number;
    dataGaps: number;
  };
  domains: StorageDomainReport[];
}

/** 一次清理的结果（`DELETE /api/storage/orphans`） */
export interface StorageCleanupResult {
  domain: string;
  dryRun: boolean;
  removedFiles: number;
  freedBytes: number;
  removedDirs: string[];
  sample: string[];
  skipped: string[];
}

/** 数据体检报告（`GET /api/curriculum/health`） */
export interface CurriculumHealth {
  revision: number;
  checkedAt: string;
  counts: { error: number; warn: number; info: number };
  /** 没有 error/warn（info 只是提示） */
  healthy: boolean;
  issues: Array<{
    level: 'error' | 'warn' | 'info';
    code: string;
    target: string;
    message: string;
    fixHint: string;
  }>;
  summary: {
    videos: number;
    covers: number;
    orphanVideos: number;
    orphanCovers: number;
    orphanBytes: number;
    lessons: number;
  };
}

/** 和弦练习组：一组和弦 + 一组练习阶段，可被多个课时复用 */
export interface ChordGroup {
  id: string;
  name: string;
  description: string;
  /** `ChordConfig` 的 key（如 `C` / `Am`） */
  chordKeys: string[];
  difficulty: '入门' | '进阶' | '挑战';
  /** 组内默认练习阶段（组内所有和弦对共用） */
  stages: ChordDrillStage[];
  /**
   * 对某些和弦对的单独覆盖：key = `${fromChord}|${toChord}`。
   * 命中时该和弦对用这里的阶段，其余用 `stages`。
   */
  pairStages?: Record<string, ChordDrillStage[]>;
  createdAt: string;
  updatedAt: string;
}

/** 练习阶段（BPM 阶梯的一段）：一个和弦组合可由多个阶段递进 */
export interface ChordDrillStage {
  id: string;
  name: string;
  /** `ChordConfig` 的 key */
  fromChord: string;
  toChord: string;
  startBpm: number;
  targetBpm: number;
  stepBpm: number;
  passBars: number;
  toleranceCents: number;
  order: number;
}

export interface MusicVersion {
  versionNumber: string; // e.g. 'v1.0', 'v1.1'
  note: string; // e.g. '基础四分音符分解版'
  updatedAt: string;
  status: 'draft' | 'published' | 'archive';
  config: AudioTabSyncConfig;
}

export type MusicStatus = 'draft' | 'published' | 'archive';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: '民谣吉他' | '流行弹唱' | '指弹独奏' | '摇滚前奏' | '综合练习曲';
  difficulty: '入门' | '进阶' | '挑战';
  keySignature: string; // 'C大调', 'G大调', etc.
  status: MusicStatus;
  currentVersion: string;
  versions: MusicVersion[];
  tabConfig: AudioTabSyncConfig;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  cEndPlayCount?: number; // C端学员学习播放人次
  /** 来源转录项目 id（「编辑六线谱」按钮回到校正工作台时用） */
  sourceProjectId?: string;
  /** 发布后的后端 Score id（音乐库与 C 端曲目对应用） */
  backendScoreId?: string;
}

export interface HardChordMetric {
  chordName: string;
  passRate: number; // percentage
  sampleCount: number;
  avgRetryTimes: number;
  avgStuckDays: number;
  topFailureReason: string;
  acousticIssueSpectrum: {
    buzzingRate: number;
    muteStringRate: number;
    slowTransitionRate: number;
    wrongPitchRate: number;
  };
}

export interface LessonDropoffFunnelStep {
  stepKey: keyof LessonStep['timeAllocation'];
  label: string;
  durationMin: number;
  completionRate: number; // percentage
  dropoffRate: number; // percentage
  avgUserScore: number;
}
