# 音频转录后台 API 对接与 AI 流水线架构实施方案
*(Audio Transcription API Integration & AI Model Pipeline Specification)*

**文档版本**：v1.0.0  
**适用模块**：前端音频向导 (`WizardModal`)、任务流状态看板 (`TranscriptionProgressModal`)、双轨乐谱查看器 (`ScoreViewer`)、导出系统 (`DownloadModal`)、后台 Python DSP/AI 算力引擎  
**更新日期**：2026-10-04  

---

## 1. 方案背景与架构全景

本项目致力于构建高精度吉他音频自动转谱（Audio-to-Score / Audio-to-TAB）系统。系统通过从前端导入多模态音频源（本地文件、网络短视频/音频流媒体链接、麦克风现场录制），联动后端高性能算力集群，执行 **FFmpeg 音频重采样切片 ➔ HTDemucs v4 混合 Transformer 吉他音轨剥离 ➔ 频谱瞬态与复调基频估计 ➔ 基于 Viterbi 算法的吉他生理位移最优化把位求解 ➔ 独奏/伴奏分类排版** 全流程任务，最终向前端交付结构化乐谱数据 `ScoreData`，支持五线谱与六线谱垂直联动渲染及工业级多格式一键导出。

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND (React + TypeScript)                                 │
│                                                                                                 │
│  [音频源导入向导]              [任务流实时看板]               [双轨乐谱渲染与走带]               │
│  WizardModal (6步)       ──► TranscriptionProgressModal ──►  ScoreViewer (五线谱 + TAB)         │
│  - 本地文件 (MP3/WAV/M4A)    - 5阶段细粒度进度指示            - Eb/Cm 三降号高音谱号对齐         │
│  - 网络外链 (抖音/B站/YT)    - SSE 实时事件驱动推流           - 1~6 弦品格数字与击勾连音         │
│  - 麦克风实时采样            - 结构化计算日志与剩余时间        - 独奏 / 伴奏扫弦双轨切换          │
│                                                                        │                        │
│                                                                        ▼                        │
│                                                               [多格式导出引擎]                  │
│                                                               DownloadModal                     │
│                                                               (JSON / MusicXML / PDF / GP5)     │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │
                 HTTP REST / SSE EventStream    │  双向通信契约
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND SERVICES (Python + FastAPI / Celery)                        │
│                                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Phase 1: FFmpeg 预处理管道                                                                  │ │
│ │ - yt-dlp 网络流提取 ➔ 44.1kHz 16-bit 线性 PCM 立体声重采样 ➔ EBU R128 音量标准化 ➔ 切片重叠窗 │ │
│ └──────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
│                                                ▼                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Phase 2: HTDemucs 6-stem 混合 Transformer 音轨分离                                          │ │
│ │ - 深度时频双分支架构 ➔ 剥离人声/鼓点/贝斯 ➔ 输出纯净独立吉他声轨 (Lead & Acoustic)          │ │
│ └──────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
│                                                ▼                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Phase 3: 频谱瞬态起音与复调基频估计 (Onset & F0 Tracking)                                    │ │
│ │ - CNN/Bi-LSTM 复调音高检测 ➔ 瞬态敲击过滤 ➔ 独奏旋律线 vs 垂直多音扫弦能量分类              │ │
│ └──────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
│                                                ▼                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Phase 4: 基于 Viterbi 算法的吉他手部生理力学位移求解器                                      │ │
│ │ - 吉他多音同品状态空间建模 ➔ 虎口位移与手指疲劳成本函数 ➔ 动态规划求取全局最优 TAB 指法     │ │
│ └──────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
│                                                ▼                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Phase 5: 格式序列化与分发服务                                                               │ │
│ │ - 组装前端标准 ScoreData JSON ➔ 生成 MusicXML 4.0 ➔ 调用 pyguitarpro 生成二进制 .gp5        │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 现有前端工程功能与数据资产分析

### 2.1 交互组件清单与职责
1. **音频向导组件 (`src/components/WizardModal.tsx`)**：
   - 收集导入方式：本地上传（`sourceType: 'upload'`）、第三方链接解析（`sourceType: 'url'`）、录音（`sourceType: 'record'`）。
   - 输出任务配置实体 `TranscriptionJobSettings`（包含调号、拍号、独奏乐器过滤、吉他专属提取等）。
2. **处理看板组件 (`src/components/TranscriptionProgressModal.tsx`)**：
   - 现已定义 5 大标准技术阶段：
     1. *FFmpeg Audio Slicing & Resampling*（音频切片重采样与归一化）
     2. *Demucs v4 Hybrid Transformer Separation*（吉他音轨独立分离）
     3. *Spectral Onset & Pitch Estimation*（频谱瞬态检测与复调基频估计）
     4. *Guitar Biomechanics & Fretboard Mapping*（生理工学指法与把位求解）
     5. *Dual Staff & 6-Line TAB Generation*（双轨乐谱数据契约组装）
   - 目前采用前端 `setInterval` 简单累加模拟，需无缝平移对接为真实 SSE 协议。
3. **双轨乐谱渲染组件 (`src/components/ScoreViewer.tsx`)**：
   - 上半部分五线谱：标准五线谱线、高音谱号（𝄞）、调号（支持 $E\flat/Cm$ 三降号调号：$B\flat, E\flat, A\flat$）、音符符头（利用音高算法进行行线定位 `getStaffDiatonicStep`）、符干方向、时值音符、连音线。
   - 下半部分六线谱：标准 1~6 弦线、品格数字（0~24 品）、空弦指示、击勾弦技巧（`hammer`, `pull`, `slide`, `bend`, `vibrato` 等）、和弦网格图。
4. **导出模态框 (`src/components/DownloadModal.tsx`)**：
   - 覆盖 JSON、MusicXML 4.0、PDF（原生 Print CSS 矢量打印）、GuitarPro (.gp5) 下载入口。

### 2.2 核心数据契约 (`src/types/music.ts`)
后端交付的数据必须完全遵照现有前端定义的契约模型，无需前端二次转译：
```typescript
export type GuitarString = 1 | 2 | 3 | 4 | 5 | 6; // 1 = 高音 E, 6 = 低音 E
export type NoteDuration = 'w' | 'h' | 'q' | '8' | '16' | '32';

export interface TabNote {
  id: string;
  string: GuitarString;
  fret: number;
  duration: NoteDuration;
  beat: number;          // 小节内拍位偏移 (0.0, 0.5, 1.0, 1.5...)
  durationBeats: number; // 持续拍长 (四分音符为 1.0, 八分音符为 0.5)
  isTied?: boolean;
  technique?: 'none' | 'hammer' | 'pull' | 'slide' | 'bend' | 'vibrato' | 'harmonic' | 'mute';
  pitch: string;         // 音高标识，例如 "Eb4", "C4"
  midi: number;          // 标准 MIDI 音高编号 (0-127)
}

export interface MeasureChord {
  name: string;
  fretPosition?: number;
  beat: number;
  diagramFret?: number;
}

export interface Measure {
  id: string;
  number: number;
  chord?: MeasureChord;
  notes: TabNote[];
  timeSignature?: { numerator: number; denominator: number };
}

export interface ScoreData {
  id: string;
  title: string;
  subtitle: string;
  tempo: number;
  timeSignature: string;
  keySignature: string;
  flatsCount?: number;
  sharpsCount?: number;
  tuning: string[];      // 标准调弦 ["E4", "B3", "G3", "D3", "A2", "E2"]
  tuningName: string;
  capo: number;          // 变调夹品位 (如 3 品)
  transcribedBy: string;
  measures: Measure[];
  totalDurationSeconds: number;
  sourceType?: 'youtube' | 'tiktok' | 'file' | 'audio';
  videoUrl?: string;
  videoTitle?: string;
}
```

---

## 3. 前端与后端 API 接口对接方案

### 3.1 接口 1：创建转录任务
- **Endpoint**: `POST /api/v1/transcribe/create`
- **说明**：支持本地多格式媒体文件直接上传或提交第三方视频/音频外链。
- **Content-Type**: `multipart/form-data`（上传文件）或 `application/json`（外链方式）
- **请求参数说明**：
  | 字段名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | `sourceType` | string | 是 | `'upload'` \| `'url'` \| `'record'` |
  | `file` | Binary | 否 | 音频/视频实体文件（支持 mp3, wav, flac, m4a, mp4, mov） |
  | `externalUrl` | string | 否 | 抖音、B站、微信视频号、YouTube 视频链接（后端自动调取 `yt-dlp` 抓取原音） |
  | `instrument` | string | 否 | 乐器偏好，默认 `'acoustic_guitar'` |
  | `trackType` | string | 否 | 期望提取音轨：`'solo'` (独奏) \| `'strumming'` (伴奏扫弦) \| `'both'` (双轨) |
  | `keySignature`| string | 否 | 目标调号，如 `'Eb/Cm'` |
  | `timeSignature`| string| 否 | 目标拍号，如 `'4/4'` |
  | `capo` | integer| 否 | 变调夹品位，默认 `0` |

- **成功响应示例**：
  ```json
  {
    "code": 200,
    "message": "Transcription task initiated",
    "data": {
      "taskId": "task_20261004_guitarmate_89412",
      "status": "queued",
      "estimatedDurationSeconds": 20
    }
  }
  ```

---

### 3.2 接口 2：实时进度流（Server-Sent Events）
- **Endpoint**: `GET /api/v1/transcribe/{taskId}/progress`
- **说明**：客户端通过 `EventSource` 建立单向长连接，后端任务 Worker 处理过程中持续广播阶段更新。
- **协议**：`text/event-stream`
- **推送事件与报文结构**：
  ```http
  event: stage_update
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "stepId": 1,
    "stepName": "FFmpeg Audio Slicing & Resampling",
    "progressPercent": 18,
    "detailLog": "Resampling stream to 44.1kHz stereo, applying EBU R128 dynamic normalization...",
    "elapsedSeconds": 3.2
  }

  event: stage_update
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "stepId": 2,
    "stepName": "Demucs v4 Hybrid Transformer Separation",
    "progressPercent": 48,
    "detailLog": "Executing HTDemucs-6s inference: isolated clean guitar stem from drums & vocals.",
    "elapsedSeconds": 8.7
  }

  event: stage_update
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "stepId": 3,
    "stepName": "Spectral Onset & Pitch Estimation",
    "progressPercent": 68,
    "detailLog": "Detected 342 polyphonic note transients, classifying lead melody vs chord strumming...",
    "elapsedSeconds": 13.5
  }

  event: stage_update
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "stepId": 4,
    "stepName": "Guitar Biomechanics & Fretboard Mapping",
    "progressPercent": 88,
    "detailLog": "Solving Viterbi minimum biomechanical displacement across 24-fret fretboard...",
    "elapsedSeconds": 17.2
  }

  event: stage_update
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "stepId": 5,
    "stepName": "Dual Staff & 6-Line TAB Generation",
    "progressPercent": 100,
    "detailLog": "Successfully assembled Treble Clef and TAB JSON schema with chord cues.",
    "elapsedSeconds": 19.8
  }

  event: completed
  data: {
    "taskId": "task_20261004_guitarmate_89412",
    "resultEndpoint": "/api/v1/transcribe/task_20261004_guitarmate_89412/result"
  }
  ```

---

### 3.3 接口 3：获取转录乐谱结果
- **Endpoint**: `GET /api/v1/transcribe/{taskId}/result`
- **说明**：任务完成后获取排版好的完整乐谱数据。
- **返回结构体**：直接承接 `ScoreData`，包含双轨（独奏与伴奏）切换信息：
  ```json
  {
    "code": 200,
    "data": {
      "id": "score_auto_20261004",
      "title": "Macaroon 5 (AI Transcription)",
      "subtitle": "Guitar Pro Dual-Staff Edition",
      "tempo": 104,
      "timeSignature": "4/4",
      "keySignature": "Eb/Cm",
      "flatsCount": 3,
      "sharpsCount": 0,
      "tuning": ["E4", "B3", "G3", "D3", "A2", "E2"],
      "tuningName": "Standard EADGBE",
      "capo": 3,
      "transcribedBy": "GuitarMate Demucs v4 AI Engine",
      "totalDurationSeconds": 184,
      "measures": [
        {
          "id": "m_1",
          "number": 1,
          "chord": { "name": "Cm", "beat": 0.0, "diagramFret": 3 },
          "notes": [
            {
              "id": "n_1_1",
              "string": 2,
              "fret": 4,
              "duration": "q",
              "beat": 0.0,
              "durationBeats": 1.0,
              "pitch": "Eb4",
              "midi": 63,
              "technique": "none"
            },
            {
              "id": "n_1_2",
              "string": 3,
              "fret": 5,
              "duration": "q",
              "beat": 0.0,
              "durationBeats": 1.0,
              "pitch": "C4",
              "midi": 60,
              "technique": "none"
            }
          ]
        }
      ],
      "tracks": [
        { "id": "track_lead", "name": "Lead Guitar (独奏吉他)", "type": "solo" },
        { "id": "track_rhythm", "name": "Rhythm Guitar (伴奏扫弦)", "type": "strumming" }
      ]
    }
  }
  ```

---

### 3.4 接口 4：乐谱多格式导出服务
- **Endpoint**: `GET /api/v1/export/{format}`
- **Query 参数**：`taskId={taskId}&format=gp5`（支持 `gp5`、`musicxml`、`pdf`、`json`）
- **返回**：对应二进制文件流或 XML 文本，响应头带标准的 `Content-Disposition: attachment; filename="..."`。

---

## 4. 后端核心算法与 AI 模型架构实现方案

### 4.1 Phase 1: FFmpeg 切片与重采样管道
```python
import subprocess
import os

def preprocess_audio(input_file: str, output_wav: str) -> str:
    """
    使用 FFmpeg soxr 滤镜重采样至 44.1kHz 16-bit 立体声，
    并应用 EBU R128 标准进行电平与动态响度归一化。
    """
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", input_file,
        "-vn",                      # 丢弃视频流
        "-acodec", "pcm_s16le",     # 16-bit 线性 PCM
        "-ar", "44100",             # 44.1kHz 采样率
        "-ac", "2",                 # 立体声
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", # 广播级响度均衡
        output_wav
    ]
    subprocess.run(ffmpeg_cmd, check=True)
    return output_wav
```

---

### 4.2 Phase 2: HTDemucs 6-stem 混合 Transformer 分轨
采用 Meta 开源的 `htdemucs_6s`（6-stem：drums, bass, other, vocals, guitar, piano）。通过时域卷积与频域自注意力的交叉多尺度计算，彻底隔绝击鼓底鼓低频与人声高频杂波，输出纯净的独立吉他音频（`guitar.wav`）。

```python
# backend/services/demucs_separator.py
import torch
import demucs.separate

class DemucsSeparatorService:
    def __init__(self, device: str = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    def separate_guitar_stem(self, input_wav_path: str, output_directory: str) -> str:
        """
        执行 HTDemucs 混合 Transformer 音轨剥离，提取吉他独立声轨。
        """
        demucs.separate.main([
            "-n", "htdemucs_6s",
            "--two-stems", "guitar",  # 关键：聚焦提取 guitar 音轨
            "-d", self.device,
            "-o", output_directory,
            input_wav_path
        ])
        
        # 提取后的纯吉他声轨路径
        isolated_guitar_path = os.path.join(output_directory, "htdemucs_6s", "guitar.wav")
        return isolated_guitar_path
```

---

### 4.3 Phase 3 & 4: 独奏/伴奏分类与基于 Viterbi 算法的生理力学指法规划

吉他在物理构造上具备“同音不同品”的多解性（例如中央 $C_4$ 可以在 2弦1品、3弦5品、4弦10品、5弦15品产生）。传统启发式贪婪算法常出现“左手在指板上来回无规律大幅度跳跃”的荒谬指法。本方案基于隐马尔可夫模型（HMM）与 **Viterbi 动态规划算法**，建立符合人体工学的成本代价函数。

#### 生理工学位移代价函数公式设计
设在时刻 $t$，左手选定的物理坐标状态为 $S_t = (\text{string}_t, \text{fret}_t)$，其从上一个音符状态 $S_{t-1} = (\text{string}_{t-1}, \text{fret}_{t-1})$ 的转移成本为：

$$\mathcal{C}(S_{t-1} \to S_t) = w_{\text{fret}} \cdot \Delta_{\text{fret}} + w_{\text{string}} \cdot \Delta_{\text{string}} + \text{Penalty}_{\text{stretch}} + \text{Bonus}_{\text{open}} + \text{Bonus}_{\text{box}}$$

各分量量化标准：
1. **横向品格位移代价 $\Delta_{\text{fret}}$**：$|\text{fret}_t - \text{fret}_{t-1}|$。
   - 当位移 $\le 4$ 品时，处于同一自然把位手型内，惩罚系数线性增长；
   - 当位移 $> 4$ 品时，超出左手舒适张力，引入超线性惩罚：$\text{Penalty} = (\Delta_{\text{fret}} - 4)^{1.8} \times 2.5$。
2. **纵向跨弦代价 $\Delta_{\text{string}}$**：$|\text{string}_t - \text{string}_{t-1}| \times 0.8$。跨越多根弦会增加手指跨度与右手指法难度。
3. **空弦按弦奖励 $\text{Bonus}_{\text{open}}$**：若 $\text{fret}_t = 0$，左手无需施加生理按压力，直接赋予负成本（奖励 $-0.5$）。
4. **把位锚定盒型奖励 $\text{Bonus}_{\text{box}}$**：若当前品位位于主奏把位（如 $E\flat$ 调的 3~6 品变调夹有效区段），赋予倾向性奖励。

#### 完整 Python Viterbi 求解器模块
```python
# backend/services/viterbi_guitar_solver.py
import numpy as np
from typing import List, Dict, Tuple

# 标准吉他 1 弦至 6 弦空弦 MIDI 编号 (E4, B3, G3, D3, A2, E2)
STANDARD_TUNING_MIDI = {1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40}

class GuitarBiomechanicsViterbiSolver:
    def __init__(self, capo: int = 3, max_frets: int = 24):
        self.capo = capo
        self.max_frets = max_frets
        self.w_fret = 1.2
        self.w_string = 0.8

    def get_candidate_positions(self, midi_pitch: int) -> List[Tuple[int, int]]:
        """获取目标 MIDI 音符在吉他指板上所有可行的 (弦号, 品格) 物理位置"""
        candidates = []
        for string_idx, open_midi in STANDARD_TUNING_MIDI.items():
            effective_open = open_midi + self.capo
            fret = midi_pitch - effective_open
            if 0 <= fret <= self.max_frets:
                candidates.append((string_idx, fret))
        return candidates

    def transition_cost(self, pos_prev: Tuple[int, int], pos_curr: Tuple[int, int]) -> float:
        """求解两音符之间的手指生理力学转移阻力"""
        s_prev, f_prev = pos_prev
        s_curr, f_curr = pos_curr

        # 空弦无需移动把位，成本极低
        if f_curr == 0:
            return 0.1

        fret_delta = abs(f_curr - f_prev)
        # 单把位舒适跨度 (<=4 品)
        if fret_delta <= 4:
            fret_cost = fret_delta * self.w_fret
        else:
            # 剧烈换把惩罚
            fret_cost = (4 * self.w_fret) + ((fret_delta - 4) ** 1.8) * 2.5

        string_cost = abs(s_curr - s_prev) * self.w_string
        return fret_cost + string_cost

    def solve_optimal_tab(self, note_events: List[Dict]) -> List[Tuple[int, int]]:
        """
        输入经过基频估计后的音符流事件 [{'midi': 63, 'beat': 0.0, 'duration': 'q'}, ...]
        输出全局最低位移消耗的 [(string, fret), ...] 序列
        """
        if not note_events:
            return []

        T = len(note_events)
        candidates_seq = [self.get_candidate_positions(n['midi']) for n in note_events]

        # 校验是否有不可弹奏音符
        for idx, cands in enumerate(candidates_seq):
            if not cands:
                # 极端超高音或超低音兜底策略
                candidates_seq[idx] = [(1, self.max_frets)]

        # 动态规划矩阵
        dp = [{} for _ in range(T)]
        backtrack = [{} for _ in range(T)]

        # 初始化第 0 步
        for pos in candidates_seq[0]:
            dp[0][pos] = 0.0

        # 前向递推
        for t in range(1, T):
            for curr_pos in candidates_seq[t]:
                best_cost = float('inf')
                best_prev = None
                for prev_pos in candidates_seq[t - 1]:
                    cost = dp[t - 1][prev_pos] + self.transition_cost(prev_pos, curr_pos)
                    if cost < best_cost:
                        best_cost = cost
                        best_prev = prev_pos
                dp[t][curr_pos] = best_cost
                backtrack[t][curr_pos] = best_prev

        # 逆向回溯全局最优路径
        last_pos = min(dp[-1], key=dp[-1].get)
        optimal_positions = [last_pos]

        for t in range(T - 1, 0, -1):
            prev = backtrack[t][optimal_positions[-1]]
            optimal_positions.append(prev)

        optimal_positions.reverse()
        return optimal_positions
```

#### 独奏（SOLO）与伴奏（Strumming）自动辨识分类
- **伴奏扫弦识别**：若在 $\le 35\text{ms}$ 的微小时窗内，检测到 $\ge 3$ 个音符同时起振，且音高覆盖吉他开放或封闭和弦构成音，自动识别为“扫弦小节”。根据音符微时差判定**下扫（$\downarrow$）**或**上挑（$\uparrow$）**，并向前端注入 `MeasureChord`（如 $Cm, G, F$ 和弦图表）。
- **独奏 SOLO 识别**：音符呈现单音时序推进，垂直重叠小，伴随滑音、推弦、揉弦特征，映射为 `track_lead` 单音旋律线。

---

## 5. 双轨乐谱前端渲染联动规范

前端 `ScoreViewer.tsx` 接收到 `ScoreData` 后，严格保持上下双轨像素级垂直对齐：

```
                             【双轨垂直对齐排版图示】

                Eb/Cm (3降号)
   ┌─────────── 𝄞 ♭♭♭ 4/4 ───────────────────────────────────────────┐  ◄── 上轨：标准五线谱
   │                          ♩.           ♫            ♩            │      - 高音谱号、符头符干、连音线
   │                         (C4)        (Eb4)         (G4)          │      - 规范音高位置 (Diatonic Step)
   └──────────────────────────┼────────────┼────────────┼────────────┘
                              │            │            │            ◄── 垂直对齐辅助基准
   ┌──────────────────────────┼────────────┼────────────┼────────────┐  ◄── 下轨：吉他六线谱 (TAB)
   │             T          --1------------4------------3------------│      - 1~6 弦品位与技术修饰
   │             A          --1--------------------------------------│      - 和弦图示对齐
   │             B          --3--------------------------------------│      - 击勾弦连音线 (h/p)
   └─────────────────────────────────────────────────────────────────┘
```

1. **上轨（五线谱）渲染**：
   - 谱号固定使用高音谱号（𝄞）；
   - 调号根据后端解析自动挂载降记号：$E\flat/Cm$ 调在 $B, E, A$ 三条线/间对应位置渲染 3 个 $\flat$ 符号；
   - 符头垂直高度严格遵循 `getStaffDiatonicStep(note.pitch)`，三线（$B_4$）以上符干朝下，三线以下符干朝上。
2. **下轨（六线谱 TAB）渲染**：
   - 1 弦（高音 E）至 6 弦（低音 E）等距分布，品格数字带白色不透明背景遮挡弦线；
   - 连音线跨品格绘制，技巧符号标明 $h$ (击弦)、$p$ (勾弦)、$s$ (滑音)、$b$ (推弦)。
3. **独奏与伴奏轨道切换联动**：
   - 顶部提供 `Track Switcher`，可一键在 `Lead Solo`（主奏独奏谱）与 `Acoustic Rhythm`（扫弦伴奏谱）间无缝切换；
   - 底部琴把 `GuitarFretboard` 与当前激活轨道的当前拍音符联动，高亮对应品位及推荐指法。

---

## 6. 多格式乐谱导出系统实现规范

| 格式 | 生成端 | 核心协议与实现规范 | 业务应用场景 |
| :--- | :--- | :--- | :--- |
| **标准 JSON** | 前端原生导出 | 序列化 `ScoreData`，符合统一 Tab-v1 JSON Schema | 平台自身二次编排、云端保存、大纲关联 |
| **MusicXML 4.0** | 后端/前端 | 生成包含 `<score-partwise>` 树，在 `<technical>` 中写入 `<string>` 与 `<fret>` 节点 | 导入 Sibelius、Finale、MuseScore 等专业制谱软件 |
| **PDF 矢量乐谱** | 前端原生 | 基于 `@media print` 样式实现分页断点、矢量 SVG 导出与无损打印排版 | 线下打印、教案发放、学员实体练习手册 |
| **GuitarPro (.gp5)** | **后端专用引擎** | Python 集成 `pyguitarpro` 库，根据 `ScoreData` 构建二进制数据流 | 导入 Guitar Pro 7/8 变调、变速、互动跟弹 |

#### 后端 Python 生成 GuitarPro 5 (.gp5) 核心代码片段
```python
# backend/services/gp5_export_service.py
import guitarpro

def export_score_to_gp5(score_data: dict, output_file_path: str):
    """
    将标准 JSON ScoreData 序列化为原生 Guitar Pro 5 二进制文件
    """
    song = guitarpro.Song()
    song.title = score_data.get("title", "Guitar Transcription")
    song.artist = score_data.get("transcribedBy", "GuitarMate AI")
    song.tempo = score_data.get("tempo", 120)

    # 创建标准吉他音轨
    track = guitarpro.Track(song)
    track.name = "Acoustic Guitar"
    track.channel.instrument = 25  # MIDI: Acoustic Guitar (steel)
    track.strings = [
        guitarpro.GuitarString(1, 64), # E4
        guitarpro.GuitarString(2, 59), # B3
        guitarpro.GuitarString(3, 55), # G3
        guitarpro.GuitarString(4, 50), # D3
        guitarpro.GuitarString(5, 45), # A2
        guitarpro.GuitarString(6, 40), # E2
    ]
    song.tracks.append(track)

    # 填充小节与音符
    for m_data in score_data.get("measures", []):
        measure = guitarpro.Measure(track)
        voice = measure.voices[0]
        for n_data in m_data.get("notes", []):
            beat = guitarpro.Beat(voice)
            beat.duration.value = 4  # 四分音符
            note = guitarpro.Note(beat)
            note.value = n_data["fret"]
            note.string = n_data["string"]
            beat.notes.append(note)
            voice.beats.append(beat)
        track.measures.append(measure)

    guitarpro.write(song, output_file_path)
    return output_file_path
```

---

## 7. 当前工程短板深度分析与落地升级路线建议

### 7.1 当前工程存在的短板
1. **转录状态机目前为纯前端假计时（Mock）**：
   - `TranscriptionProgressModal.tsx` 当前依赖 `setInterval` 简单推进 step，未打通后端真实 SSE 流，无法真实反映模型分轨、基频计算和换把解算的物理耗时与异常中断。
2. **长篇幅乐谱全量 DOM 挂载性能风险**：
   - `ScoreViewer.tsx` 当前对所有小节采用全量 HTML/SVG 渲染。对于长达 150 小节以上的全曲，DOM 节点将达数千个，易引起低配移动端设备横向滚动卡顿。
3. **GuitarPro 导出目前为占位模拟**：
   - 前端当前以简单文本 Blob 占位，无法直接生成合法的 `.gp5` 二进制文件，必须依赖后端专用导出服务支持。
4. **视频与乐谱走带的微毫秒同步漂移**：
   - 当前视频播放器窗口（`VideoPlayerWindow`）与音频合成器（`guitarSynth`）走带各自独立计时，缺少统一的 Master Audio Clock 时钟锁。

### 7.2 实施落地升级路线建议（按优先级排序）
1. **P0（核心打通）**：将 `TranscriptionProgressModal` 改造成真实 `EventSource` 监听模式，对接 `/api/v1/transcribe/create` 与 `/progress`，使进度看板成为真正的“端到端 AI 计算可视化中枢”。
2. **P1（后端服务落地）**：容器化部署 Python 后端微服务（内置 PyTorch, HTDemucs 6s, Basic Pitch, Viterbi 模块和 `pyguitarpro`），提供真实的音轨分离与 `.gp5` 下载能力。
3. **P2（独奏/伴奏分轨试听）**：将 HTDemucs 输出的 `guitar_lead.wav` 与 `guitar_rhythm.wav` 下发前端，允许学员在底部走带面板（`BottomPlaybackBar`）自由切换 Mute/Solo，实现单音与伴奏分轨沉浸式跟练。
4. **P3（排版虚拟化优化）**：引入可视区域虚拟小节加载（Virtual Measure Windowing），当乐谱超出可视范围时自动卸载不可见 DOM，确保千小节长曲也能保持 120 FPS 丝滑走带。
