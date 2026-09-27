import { ScrollView, Text, View } from '@tarojs/components';

/**
 * 架构方案 · 页签 4：核心数据模型定义（TypeScript & Database Entity Specs）
 * ======================================================================
 *
 * 逐块照搬 Web 版 `ArchitectureModal.tsx` 的 `activeTab === 'schema'` 分支（1179-1370 行）：
 * 三个代码块 + 各自的标题行（`// N. …`）与右侧来源标签（`/src/types.ts`、`WeChat Cloud / MySQL`）。
 *
 * ## 两条实情（页面上也写着）
 *
 * 1. 这里的 **TypeScript 接口是"规划稿"**：与后端/小程序现在的真实类型（`utils/practice.ts` 的
 *    `PracticePackage`、CMS 的 `types.ts`）**不完全一样** —— 方案文档写在前、实现落在后，
 *    字段名自然有漂移（例如文档里是 `warmupMins`，CMS 实现里是 `timeAllocation.tuningMin`）。
 *    我**没有"顺手改成一致"**：这是方案原文，改了就不是那份方案了；要统一应当反过来
 *    以实现为准去修订文档，那是教研侧的决定。
 * 2. 代码块必须能**横滑**（SQL 里一行的注释比屏幕宽），所以统一包在 `ScrollView scrollX` 里。
 */

/** 三个代码块（内容与 Web 版逐字一致） */
const BLOCKS: Array<{ title: string; source: string; code: string }> = [
  {
    title: '// 1. 课时教学步骤与模块依赖 (LessonStep & TimeAllocation)',
    source: '/src/types.ts',
    code: `export interface LessonStep {
  id: string;
  title: string;
  type: 'video' | 'trainer' | 'tuner' | 'practice';
  durationMin: number;
  completed: boolean;

  // 依赖与解锁卡点
  prerequisite?: {
    requiredStepId?: string; // 前置课时 ID
    minScore?: number;        // AI 听音达标分 (例如 80)
    isUnlockedByDefault?: boolean;
  };

  // 20 分钟时间切片模型
  timeAllocation?: {
    warmupMins: number;      // 琴头校音 (3min)
    videoLectureMins: number;// 名师微课 (6min)
    chordDrillMins: number;  // 和弦微测 (4min)
    switchingMins: number;   // 转换冲刺 (4min)
    songJamMins: number;     // 曲目对拍 (3min)
    totalMins: number;       // 20min
  };

  // 视频资产与打点联动
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
      chordHighlight?: string; // 联动显示和弦卡
    }[];
  };

  // 和弦微练习
  trainerData?: {
    targetChords: string[];
    tempoBpm: number;
    description: string;
    exerciseConfig?: {
      switchPairs: [string, string][];
      startBpm: number;
      targetBpm: number;
      durationSec: number;
      passStreakCount: number;
    };
  };

  // 教学曲目切片绑定
  songBinding?: {
    songId: string;
    title: string;
    artist: string;
    sectionSnippet?: string;
    suggestedCapo?: string;
    tabMode?: 'CRD' | 'TAB';
  };
}`,
  },
  {
    title: '// 2. 数据库关系表与集合规划 (Cloud Database Schema)',
    source: 'WeChat Cloud / MySQL',
    code: `-- 1. 课程大纲表
CREATE TABLE courses (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  stage_id VARCHAR(32) NOT NULL, -- 所属成长阶段
  level VARCHAR(64) NOT NULL,
  total_steps INT DEFAULT 0,
  recommended_daily_mins INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 课时表与依赖
CREATE TABLE lesson_steps (
  id VARCHAR(64) PRIMARY KEY,
  chapter_id VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL,
  type ENUM('video', 'trainer', 'tuner', 'practice') NOT NULL,
  duration_min INT DEFAULT 20,
  prerequisite_step_id VARCHAR(64),
  passing_score INT DEFAULT 80,
  time_allocation_json JSON,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);

-- 3. 视频资产与打点表
CREATE TABLE video_assets (
  id VARCHAR(64) PRIMARY KEY,
  lesson_step_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(512) NOT NULL,
  transcoded_1080p VARCHAR(512),
  transcoded_720p VARCHAR(512),
  key_points_json JSON -- 存储 [{timeSec: 35, label: "...", chord: "Em"}]
);

-- 4. 学员学习进度与 AI 评测记录
CREATE TABLE user_learning_progress (
  user_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  best_score INT DEFAULT 0,
  last_practice_date DATE,
  streak_count INT DEFAULT 0,
  PRIMARY KEY (user_id, step_id)
);

-- 5. 音频资产与吉他六线谱挂进度条对齐表 (Audio-Tab Sync Table)
CREATE TABLE audio_tab_sync_assets (
  id VARCHAR(64) PRIMARY KEY,
  song_id VARCHAR(64) NOT NULL,
  audio_url VARCHAR(512) NOT NULL,
  duration_sec FLOAT NOT NULL,
  bpm INT DEFAULT 60,
  waveform_peaks_json JSON,       -- 存储 128 点归一化声学振幅数组
  measure_timestamps_json JSON,   -- 存储小节绝对毫秒起止 [{measure: 1, startSec: 0, endSec: 4.2}]
  note_timestamps_json JSON,      -- 存储六线谱逐音符对拍秒数 [{string: 1, fret: 2, timeSec: 1.05}]
  latency_offset_ms INT DEFAULT 0, -- 蓝牙耳机延迟补偿 (ms)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id)
);`,
  },
  {
    title: '// 3. 六线谱音符挂音乐进度条类型定义 (AudioTabSyncConfig)',
    source: '/src/types.ts',
    code: `export interface AudioTabSyncConfig {
  audioId: string;
  audioFileName: string;
  audioDurationSec: number;        // 音频总时长 (秒)
  waveformPeaks: number[];         // 声学波形峰值采样 (0~1 归一化)
  playbackOffsetMs: number;        // 延迟补偿偏移量 (±ms)
  
  // 小节级别时间戳网格 (驱动六线谱按小节滚动)
  measureTimestamps: {
    measureIndex: number;
    startSec: number;
    endSec: number;
    chord?: string;
  }[];
  
  // 逐音符精确时序打点 (驱动六线谱游标毫秒级推进与音符发光)
  noteTimestamps?: {
    lineIndex: number;
    noteIndex: number;
    timeSec: number;               // 触发音频对拍秒数
    fret: number | string;         // 品位 (例如 2, 7, '2^')
    string: number;                // 弦号 (1~6 弦)
  }[];
}`,
  },
];

export default function ArchitectureSchema() {
  return (
    <View>
      <View className="gm-card">
        <Text className="gm-studio-h">🗄 核心数据模型定义 (TypeScript &amp; Database Entity Specs)</Text>
        <Text className="gm-meta" style="display:block;margin-top:6px;line-height:1.7">
          前后端统一类型定义，全面覆盖教学视频资产、时间戳知识点打点、模块前置依赖与课时时间切片
        </Text>
      </View>

      {BLOCKS.map((b) => (
        <View key={b.title} className="gm-card">
          <View style="display:flex;align-items:flex-start;justify-content:space-between">
            <Text className="gm-schema-title" style="flex:1;min-width:0">
              {b.title}
            </Text>
            <Text className="gm-schema-source">{b.source}</Text>
          </View>
          <ScrollView scrollX className="gm-schema-code-wrap">
            <Text className="gm-schema-code">{b.code}</Text>
          </ScrollView>
        </View>
      ))}

      <View className="gm-card">
        <Text className="gm-section-title">ℹ️ 关于这份数据模型</Text>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          这里的接口是方案规划稿，与仓库里现在跑的实现不完全一致（方案写在前、实现落在后）：
          例如文档里叫 warmupMins，CMS 实现里是 timeAllocation.tuningMin；
          文档的 type 有 4 种，CMS 的课时类型是 5 种（多了 tuning）。
        </Text>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          我没有把正文改成与实现一致 —— 改了就不是那份方案原文了。要统一，应当反过来以实现为准去修订方案，
          那是教研侧的决定。
        </Text>
      </View>
    </View>
  );
}
