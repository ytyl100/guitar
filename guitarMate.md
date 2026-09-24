markdown
# 吉他六线谱智能练习平台 — 完整实施方案（SQLite 版）

> 目标：上传歌曲音频 → 多乐器分离 → 转录为带时间戳的六线谱 → 管理后台可视化标注与切片 → 微信小程序按小节循环练习，节点随音乐行进高亮。数据库采用 **SQLite 单文件**，零运维成本。

---

## 一、系统总览

### 1.1 架构图
┌─────────────────────────────────────────────────────────────┐
│ 用户层 │
│ 微信小程序 (Taro 3 + React 18) │
│ 曲目列表 / 小节选择 / 循环练习 / 播放竖条 / 节点高亮 │
└──────────────────────────┬──────────────────────────────────┘
│ HTTPS API
┌──────────────────────────▼──────────────────────────────────┐
│ 应用层 (NestJS + Node 20) │
│ REST API / 音频切片(ffmpeg) / OSS 上传 / BullMQ 任务队列 │
│ 数据存储：SQLite (单文件 app.db) │
└──────────────────────────┬──────────────────────────────────┘
│ JSON 上传
┌──────────────────────────▼──────────────────────────────────┐
│ 转录层 (Mac 工作站) │
│ Demucs htdemucs_6s 多乐器分离 │
│ MVSep (可选) 主音/节奏吉他二次分离 │
│ SoloTrace (macOS) 音频→六线谱 JSON │
│ Basic Pitch 贝斯轨转录 │
└──────────────────────────┬──────────────────────────────────┘
│
┌──────────────────────────▼──────────────────────────────────┐
│ 管理后台 (React + Vite) │
│ 六线谱渲染(VexFlow) / 节点标注 / 横按检测 / 和弦标注 │
│ 小节框选切分 / 音频切片 / 发布 │
└─────────────────────────────────────────────────────────────┘

text

### 1.2 技术栈

| 层 | 技术选型 |
|---|---|
| 小程序 | Taro 3.x + React 18 + TypeScript |
| 管理后台 | React 18 + Vite + TypeScript + Ant Design 5 + VexFlow 4 |
| 后端 | Node.js 20 + NestJS 10 + Prisma 5 |
| 数据库 | **SQLite**（单文件 `./data/app.db`） |
| 缓存/队列 | Redis + BullMQ（可选，原型阶段可省略） |
| 对象存储 | 阿里云 OSS / 腾讯云 COS / 本地静态目录（开发） |
| 音频处理 | ffmpeg + Demucs + Basic Pitch |
| 转录工具 | SoloTrace（macOS 本地） |
| 部署 | Docker Compose（后端 + SQLite + Redis 可选） |

### 1.3 为什么选择 SQLite

- **零配置**：不需要独立的数据库服务进程
- **单文件**：整个数据库就是一个 `.db` 文件，直接复制即为备份
- **Prisma 原生支持**：Schema 几乎不用改动
- **资源占用低**：约 5-10MB 内存，适合中小规模应用
- **易迁移**：未来数据量增大，改 `provider` 即可迁移到 PostgreSQL

---

## 二、SQLite 数据库设计

### 2.1 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // "file:./data/app.db"
}

// ─────────────────────────────────────────
// 曲目
// ─────────────────────────────────────────
model Score {
  id            String   @id @default(cuid())
  title         String
  artist        String?
  bpm           Int?
  timeSignature String   @default("4/4")
  originalAudio String   // 原曲 OSS/静态 URL
  coverUrl      String?
  status        String   @default("draft")  // draft | published
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tracks   Track[]
  measures Measure[]

  @@index([status])
}

// ─────────────────────────────────────────
// 乐器轨
// ─────────────────────────────────────────
model Track {
  id         String   @id @default(cuid())
  scoreId    String
  score      Score    @relation(fields: [scoreId], references: [id], onDelete: Cascade)
  instrument String   // guitar_lead | guitar_rhythm | guitar | bass | piano | other
  audioUrl   String
  jsonUrl    String?  // SoloTrace JSON 地址
  createdAt  DateTime @default(now())

  measureTracks MeasureTrack[]

  @@index([scoreId])
}

// ─────────────────────────────────────────
// 练习小节
// ─────────────────────────────────────────
model Measure {
  id            String   @id @default(cuid())
  scoreId       String
  score         Score    @relation(fields: [scoreId], references: [id], onDelete: Cascade)
  index         Int
  label         String   // "前奏 第1-4小节"
  startTime     Float
  endTime       Float
  duration      Float
  bpm           Int
  timeSignature String   @default("4/4")
  createdAt     DateTime @default(now())

  trackData     MeasureTrack[]
  barres        Barre[]
  chords        ChordMarker[]

  @@index([scoreId])
}

// ─────────────────────────────────────────
// 小节 × 乐器轨
// 注意：SQLite 不支持 Json 类型，用 String 存序列化后的 JSON
// ─────────────────────────────────────────
model MeasureTrack {
  id          String   @id @default(cuid())
  measureId   String
  measure     Measure  @relation(fields: [measureId], references: [id], onDelete: Cascade)
  trackId     String
  track       Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)
  audioUrl    String
  tabImageUrl String
  imageWidth  Int      @default(1200)
  imageHeight Int      @default(300)
  notes       String   // JSON.stringify(Note[])

  @@index([measureId])
}

// ─────────────────────────────────────────
// 横按标记
// ─────────────────────────────────────────
model Barre {
  id         String  @id @default(cuid())
  measureId  String
  measure    Measure @relation(fields: [measureId], references: [id], onDelete: Cascade)
  instrument String
  fret       Int
  fromString Int
  toString   Int
  startTime  Float
  duration   Float
  x          Float
  y          Float
}

// ─────────────────────────────────────────
// 和弦标记
// ─────────────────────────────────────────
model ChordMarker {
  id         String  @id @default(cuid())
  measureId  String
  measure    Measure @relation(fields: [measureId], references: [id], onDelete: Cascade)
  instrument String
  chordName  String
  startTime  Float
  duration   Float
  x          Float
  y          Float
}
2.2 SQLite 的三个关键适配
① Json → String：SQLite 不支持 Prisma 的 Json 类型，所有 JSON 字段需改为 String，在 Service 层手动序列化。

② enum → String：SQLite 无原生 enum，Prisma 会用 String 代替，需在应用层做校验。

③ 索引与并发：SQLite 默认单写者模式，你场景下写入仅来自管理后台，完全够用；如果并发写入频繁，可在连接串加 ?connection_limit=1 避免锁冲突。

2.3 类型定义（前后端共享）
typescript
// shared/types.ts
export interface Note {
  id: string;
  string: number;      // 1-6 (1=最细弦)
  fret: number;        // 0-24
  pitch: number;       // MIDI 音高
  relativeTime: number;// 相对小节起始秒数
  duration: number;
  confidence: number;
  x: number;           // 归一化 X (0-1)
  y: number;           // 归一化 Y (0-1)
}

export interface Barre {
  id: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export interface ChordMarker {
  id: string;
  chordName: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}
2.4 .env 配置
env
DATABASE_URL="file:./data/app.db"
PORT=3000
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=guitar-practice
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
2.5 package.json 脚本
json
{
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev --name init",
    "prisma:studio": "prisma studio",
    "db:seed": "ts-node prisma/seed.ts",
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js"
  }
}

三、建立后端实施音频数据库管理（NestJS）
3.1 项目结构
==========================================================
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── data/
│   └── app.db              ← SQLite 数据库文件
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── scores/
│   │   ├── scores.controller.ts
│   │   ├── scores.service.ts
│   │   └── dto/
│   ├── tracks/
│   ├── measures/
│   │   ├── measures.controller.ts
│   │   ├── measures.service.ts
│   │   └── dto/
│   ├── audio/
│   │   ├── audio.service.ts
│   │   └── audio.module.ts
│   ├── oss/
│   │   └── oss.service.ts
│   └── published/
│       ├── published.controller.ts
│       └── published.service.ts
├── .env
├── Dockerfile
└── package.json
3.2 依赖安装
bash
npm i @nestjs/common @nestjs/core @nestjs/platform-express
npm i @prisma/client
npm i -D prisma
npm i class-validator class-transformer
npm i fluent-ffmpeg ffmpeg-static
npm i ali-oss
npm i fs-extra
npm i -D @types/fluent-ffmpeg @types/fs-extra
3.3 PrismaService
typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
3.4 音频切片服务
typescript
// src/audio/audio.service.ts
import { Injectable } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { join } from 'path';
import { tmpdir } from 'os';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

@Injectable()
export class AudioService {
  async sliceAudio(
    inputPath: string,
    startTime: number,
    endTime: number,
  ): Promise<string> {
    const outputPath = join(
      tmpdir(),
      `slice_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
    );

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .outputOptions([
          '-af',
          `afade=t=in:d=0.005,afade=t=out:st=${(endTime - startTime - 0.005).toFixed(3)}:d=0.005`,
        ])
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });

    return outputPath;
  }
}
3.5 OSS 上传服务
typescript
// src/oss/oss.service.ts
import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { createReadStream } from 'fs';
import { basename } from 'path';

@Injectable()
export class OssService {
  private client: OSS;

  constructor() {
    this.client = new OSS({
      region: process.env.OSS_REGION,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET,
    });
  }

  async upload(localPath: string, remoteDir: string): Promise<string> {
    const filename = basename(localPath);
    const objectKey = `${remoteDir}/${filename}`;
    await this.client.put(objectKey, createReadStream(localPath));
    return `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${objectKey}`;
  }
}
3.6 小节发布 API
typescript
// src/measures/measures.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { MeasuresService } from './measures.service';
import { AudioService } from '../audio/audio.service';
import { OssService } from '../oss/oss.service';

@Controller('api/measures')
export class MeasuresController {
  constructor(
    private measures: MeasuresService,
    private audio: AudioService,
    private oss: OssService,
  ) {}

  @Post('publish')
  async publish(@Body() dto: PublishMeasuresDto) {
    const results = [];

    for (const m of dto.measures) {
      // 1. 切音频
      const localPath = await this.audio.sliceAudio(
        dto.trackAudioPath,
        m.startTime,
        m.endTime,
      );

      // 2. 上传 OSS
      const audioUrl = await this.oss.upload(localPath, `measures/${dto.scoreId}`);

      // 3. 计算音符相对时间
      const notes = m.notes.map(n => ({
        ...n,
        relativeTime: n.audioTime - m.startTime,
      }));

      // 4. 写库（SQLite）
      const measure = await this.measures.create({
        scoreId: dto.scoreId,
        trackId: dto.trackId,
        startTime: m.startTime,
        endTime: m.endTime,
        duration: m.endTime - m.startTime,
        bpm: dto.bpm,
        timeSignature: dto.timeSignature,
        label: m.label,
        index: m.index,
        audioUrl,
        tabImageUrl: m.tabImageUrl,
        imageWidth: 1200,
        imageHeight: 300,
        notes: JSON.stringify(notes),   // ← SQLite: String
        barres: m.barres,
        chords: m.chords,
      });

      results.push(measure);
    }

    return { success: true, measures: results };
  }
}
3.7 MeasuresService（含 JSON 序列化）
typescript
// src/measures/measures.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeasuresService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.measure.create({
      data: {
        scoreId: data.scoreId,
        index: data.index,
        label: data.label,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        bpm: data.bpm,
        timeSignature: data.timeSignature,
        trackData: {
          create: {
            trackId: data.trackId,
            audioUrl: data.audioUrl,
            tabImageUrl: data.tabImageUrl,
            imageWidth: data.imageWidth,
            imageHeight: data.imageHeight,
            notes: data.notes,  // 已序列化的 String
          },
        },
        barres: { create: data.barres },
        chords: { create: data.chords },
      },
      include: { trackData: true, barres: true, chords: true },
    });
  }

  async findByScore(scoreId: string) {
    const measures = await this.prisma.measure.findMany({
      where: { scoreId },
      orderBy: { index: 'asc' },
      include: { trackData: true, barres: true, chords: true },
    });

    // 反序列化 notes
    return measures.map(m => ({
      ...m,
      trackData: m.trackData.map(t => ({
        ...t,
        notes: JSON.parse(t.notes),
      })),
    }));
  }
}
3.8 小程序端 API
typescript
// src/published/published.controller.ts
@Controller('api/published')
export class PublishedController {
  constructor(
    private prisma: PrismaService,
    private measures: MeasuresService,
  ) {}

  @Get('scores')
  async listScores() {
    return this.prisma.score.findMany({
      where: { status: 'published' },
      select: {
        id: true,
        title: true,
        artist: true,
        coverUrl: true,
        bpm: true,
        _count: { select: { measures: true } },
      },
    });
  }

  @Get('scores/:id/measures')
  async getMeasures(@Param('id') id: string) {
    return this.measures.findByScore(id);
  }
}
3.9 Docker Compose
yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    volumes:
      - ./backend/data:/app/data      # SQLite 文件挂载
      - ./uploads:/app/uploads         # 本地开发可存原始音频
    environment:
      - DATABASE_URL=file:/app/data/app.db
      - OSS_REGION=${OSS_REGION}
      - OSS_BUCKET=${OSS_BUCKET}
      - OSS_ACCESS_KEY_ID=${OSS_ACCESS_KEY_ID}
      - OSS_ACCESS_KEY_SECRET=${OSS_ACCESS_KEY_SECRET}
    ports:
      - "3000:3000"
    restart: unless-stopped

  # 可选：任务队列（原型阶段可省略）
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
备份方法：直接复制 backend/data/app.db 即可。

3.10 种子数据脚本
typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const score = await prisma.score.create({
    data: {
      title: 'Hotel California',
      artist: 'Eagles',
      bpm: 75,
      timeSignature: '4/4',
      originalAudio: 'https://cdn.example.com/hotel_california.mp3',
      status: 'draft',
    },
  });
  console.log('Seeded:', score.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

四、转录层实施（Mac 工作站），这部分需要单独分开处理：
4.1 环境准备
bash
# 音频分离
pip install demucs
pip install audio-separator

# 贝斯转录
pip install basic-pitch

# 系统工具
brew install ffmpeg

# GIT下载SoloTrace
git clone https://github.com/EzraCerpac/solotrace.git
cd solotrace
# 按其 README 配置 Python 虚拟环境和模型
4.2 Demucs 分离脚本
python
# scripts/separate.py
import subprocess
import sys
from pathlib import Path

def separate_stems(input_audio: str, output_dir: str):
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", "htdemucs_6s",
        "-d", "cpu",  # 或 "cuda"
        "-o", output_dir,
        input_audio,
    ]
    subprocess.run(cmd, check=True)

    song = Path(input_audio).stem
    base = Path(output_dir) / "htdemucs_6s" / song

    return {
        "vocals": str(base / "vocals.wav"),
        "drums":  str(base / "drums.wav"),
        "bass":   str(base / "bass.wav"),
        "guitar": str(base / "guitar.wav"),
        "piano":  str(base / "piano.wav"),
        "other":  str(base / "other.wav"),
    }

if __name__ == "__main__":
    result = separate_stems(sys.argv[1], sys.argv[2])
    for k, v in result.items():
        print(f"{k}: {v}")
4.3 SoloTrace 使用流程
打开 SoloTrace 桌面应用

导入 guitar.wav或者在市场上找合适的wav音频文件（最好带有吉他弹唱）

等待自动转录完成

在审核界面检查低置信度音符（红色标记）

使用 Beat Map 校正 BPM 和拍号

File → Export → JSON，导出结构如下

json
{
  "version": "1.0",
  "bpm": 75,
  "timeSignature": "4/4",
  "notes": [
    {
      "id": "n_001",
      "string": 1,
      "fret": 7,
      "pitch": 67,
      "audioTime": 12.345,
      "scoreTime": 12.345,
      "duration": 0.8,
      "confidence": 0.92
    }
  ],
  "beatMap": {
    "bpm": 75,
    "beats": [
      { "time": 0.0, "measure": 1, "beatInMeasure": 1 }
    ]
  }
}
4.4 贝斯转录脚本
python
# scripts/transcribe_bass.py
from basic_pitch.inference import predict_and_save
from basic_pitch import ICASSP_2022_MODEL_PATH

predict_and_save(
    audio_path_list=["bass.wav"],
    output_directory="./output",
    save_midi=True,
    model_or_model_path=ICASSP_2022_MODEL_PATH,
)
# 输出 bass_basic_pitch.mid，再用 midi-json 工具转 JSON

五、管理后台实施（React + VexFlow），这部分是对当前项目处理渲染六线谱-guitarmate-studio-cms的增强，管理后台需要处理从第四部分的SoloTrace转录的JSON导入来管理六线谱的标注以及小节分段管理；
以下是参考代码（需要根据当前实际界面根据功能变化做最小调整）
5.1 页面结构
==========================================================
/                         曲目列表
/scores/:id/transcribe    转录结果导入
/scores/:id/annotate      六线谱标注编辑器 ← 核心
/scores/:id/measures      小节管理
/scores/:id/publish       发布确认
5.2 核心依赖
bash
npm i react react-dom react-router-dom
npm i antd
npm i vexflow
npm i axios
npm i zustand
npm i -D vite @vitejs/plugin-react typescript

5.3 六线谱渲染组件
==========================================================
// src/components/TabRenderer.tsx
import { useEffect, useRef } from 'react';
import {
  Renderer, TabStave, TabNote, Beam, Voice, Formatter, Stem, Fraction,
} from 'vexflow';

interface Note {
  id: string;
  string: number;
  fret: number;
  duration: number;
  audioTime: number;
}

interface Props {
  notes: Note[];
  bpm: number;
  timeSignature: string;
  onNoteRendered?: (noteId: string, x: number, y: number) => void;
}

export function TabRenderer({ notes, bpm, timeSignature, onNoteRendered }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(1200, 200);
    const ctx = renderer.getContext();

    const stave = new TabStave(10, 40, 1180);
    stave.addClef('tab');
    const [beats] = timeSignature.split('/');
    stave.setTimeSignature(timeSignature);
    stave.setContext(ctx).draw();

    const beatDuration = 60 / bpm;
    const vexNotes = notes.map(n => {
      const beatsCount = n.duration / beatDuration;
      let dur = 'q';
      if (beatsCount >= 1) dur = 'q';
      else if (beatsCount >= 0.5) dur = '8';
      else if (beatsCount >= 0.25) dur = '16';
      else dur = '32';

      return new TabNote({
        positions: [{ str: n.string, fret: String(n.fret) }],
        duration: dur,
      }, true);
    });

    const voice = new Voice({ numBeats: Number(beats), beatValue: 4 })
      .addTickables(vexNotes);

    new Formatter().joinVoices([voice]).format([voice], 1100);
    voice.draw(ctx, stave);

    const beams = Beam.generateBeams(vexNotes, {
      stemDirection: Stem.DOWN,
      groups: [new Fraction(2, 8)],
    });
    beams.forEach(b => b.setContext(ctx).draw());

    vexNotes.forEach((vn, idx) => {
      const x = vn.getAbsoluteX();
      const y = vn.getYs()[0];
      onNoteRendered?.(notes[idx].id, x / 1200, y / 200);
    });
  }, [notes, bpm, timeSignature]);

  return <div ref={containerRef} className="tab-renderer" />;
}
5.4 节点标注叠加层
==========================================================
// src/components/NoteOverlay.tsx
interface NoteMarker {
  id: string;
  x: number;
  y: number;
  confidence: number;
}

export function NoteOverlay({
  markers, selectedId, onSelect,
}: {
  markers: NoteMarker[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {markers.map(m => {
        const color =
          m.confidence >= 0.8 ? '#52c41a'
          : m.confidence >= 0.6 ? '#faad14'
          : '#ff4d4f';
        const isSelected = selectedId === m.id;
        return (
          <div
            key={m.id}
            onClick={() => onSelect(m.id)}
            style={{
              position: 'absolute',
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: isSelected ? 16 : 10,
              height: isSelected ? 16 : 10,
              borderRadius: '50%',
              background: color,
              border: isSelected ? '2px solid #fff' : 'none',
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'all 0.15s',
            }}
          />
        );
      })}
    </div>
  );
}
5.5 横按自动检测
typescript
// src/utils/barreDetector.ts
export interface Barre {
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
}

export function detectBarres(
  notes: { string: number; fret: number; audioTime: number; duration: number }[],
): Barre[] {
  const groups: Record<number, typeof notes> = {};
  for (const n of notes) {
    const key = Math.round((n.audioTime * 1000) / 30);
    (groups[key] ||= []).push(n);
  }

  const barres: Barre[] = [];
  for (const group of Object.values(groups)) {
    if (group.length < 2) continue;

    const byFret: Record<number, typeof group> = {};
    for (const n of group) (byFret[n.fret] ||= []).push(n);

    for (const [fretStr, sameFret] of Object.entries(byFret)) {
      if (sameFret.length < 2) continue;
      const strings = sameFret.map(n => n.string).sort((a, b) => a - b);
      let consecutive = true;
      for (let i = 1; i < strings.length; i++) {
        if (strings[i] - strings[i - 1] !== 1) { consecutive = false; break; }
      }
      if (consecutive) {
        barres.push({
          fret: Number(fretStr),
          fromString: strings[0],
          toString: strings[strings.length - 1],
          startTime: Math.min(...sameFret.map(n => n.audioTime)),
          duration: Math.max(...sameFret.map(n => n.duration)),
        });
      }
    }
  }
  return barres;
}
5.6 和弦标注面板
tsx
// src/components/ChordPanel.tsx
import { useState } from 'react';
import { Input, Button } from 'antd';

const COMMON_CHORDS = [
  'C','Cm','C7','D','Dm','D7','E','Em','E7','F','Fm','F7',
  'G','Gm','G7','A','Am','A7','B','Bm','B7',
  'F#','Bm7','Am7','Dm7','Em7','Cadd9','Dsus4','Asus2',
];

export function ChordPanel({ onInsert, activeTime }: {
  onInsert: (chord: string, time: number) => void;
  activeTime: number;
}) {
  const [search, setSearch] = useState('');
  const filtered = COMMON_CHORDS.filter(c =>
    c.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <Input
        placeholder="搜索和弦"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 8 }}>
        {filtered.map(c => (
          <Button key={c} size="small" onClick={() => onInsert(c, activeTime)}>
            {c}
          </Button>
        ))}
      </div>
    </div>
  );
}
5.7 小节切分器
tsx
// src/components/MeasureSlicer.tsx
import { useEffect, useState } from 'react';
import { Button } from 'antd';

interface Slice {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  notes: any[];
}

export function MeasureSlicer({ notes, bpm, onSlicesChange }: {
  notes: any[];
  bpm: number;
  onSlicesChange: (slices: Slice[]) => void;
}) {
  const [slices, setSlices] = useState<Slice[]>([]);

  useEffect(() => {
    const beatDur = 60 / bpm;
    const measureDur = beatDur * 4;
    const total = Math.max(...notes.map(n => n.audioTime + n.duration), 0);
    const auto: Slice[] = [];
    for (let t = 0; t < total; t += measureDur) {
      auto.push({
        id: `auto_${auto.length}`,
        label: `第 ${auto.length + 1} 小节`,
        startTime: t,
        endTime: Math.min(t + measureDur, total),
        notes: notes.filter(n => n.audioTime >= t && n.audioTime < t + measureDur),
      });
    }
    setSlices(auto);
    onSlicesChange(auto);
  }, [notes, bpm]);

  const merge = (ids: string[]) => {
    const merged = slices
      .filter(s => ids.includes(s.id))
      .sort((a, b) => a.startTime - b.startTime);
    const newSlice: Slice = {
      id: `merged_${Date.now()}`,
      label: merged.map(m => m.label).join(' + '),
      startTime: merged[0].startTime,
      endTime: merged[merged.length - 1].endTime,
      notes: merged.flatMap(m => m.notes),
    };
    const next = [...slices.filter(s => !ids.includes(s.id)), newSlice]
      .sort((a, b) => a.startTime - b.startTime);
    setSlices(next);
    onSlicesChange(next);
  };

  return (
    <div>
      {slices.map(s => (
        <div key={s.id} style={{ padding: 8, border: '1px solid #eee', marginBottom: 4 }}>
          <strong>{s.label}</strong>
          <span style={{ marginLeft: 12 }}>{s.notes.length} 音符</span>
        </div>
      ))}
    </div>
  );
}

六、微信小程序实施（Taro）,由于需要实施每个音乐对应的六线谱渲染结果，需要在小程序前端处理六线谱练习页，因此要考虑在当前小程序项目中分析以下核心功能，请注意部分API接口需要对接项目guitarmate-audio-backend的接口（localhost:3000/docs swagger api)：
以下项目结构为参考，尽量不改动现有结构与样式前提下处理练习页面从接口获取的六线谱节段的结果；

6.1 项目结构
==========================================================
miniprogram/
├── src/
│   ├── app.tsx
│   ├── app.config.ts
│   ├── pages/
│   │   ├── index/          曲目列表
│   │   ├── measures/       小节选择
│   │   └── practice/       练习页（核心）
│   ├── components/
│   │   ├── TabViewport.tsx
│   │   ├── NoteLayer.tsx
│   │   ├── BarreLayer.tsx
│   │   ├── ChordLabel.tsx
│   │   └── ChordDiagram.tsx
│   ├── hooks/
│   │   └── useScrollSync.ts
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── index.ts
├── package.json
└── project.config.json

6.2 依赖
==========================================================
npm i @tarojs/taro @tarojs/components @tarojs/react react react-dom
npm i -D @tarojs/cli typescript
6.3 核心同步 Hook
typescript
// src/hooks/useScrollSync.ts
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';

interface Note {
  id: string;
  relativeTime: number;
  duration: number;
  x: number;
  y: number;
}

interface Options {
  audioUrl: string;
  notes: Note[];
  viewportWidth: number;
  imageWidth: number;
  playheadRatio?: number;
}

export function useScrollSync({
  audioUrl, notes, viewportWidth, imageWidth, playheadRatio = 1 / 3,
}: Options) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollX, setScrollX] = useState(0);

  const audioRef = useRef<Taro.InnerAudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const frameTimeRef = useRef(0);
  const playingRef = useRef(false);
  const activeNoteRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = Taro.createInnerAudioContext();
    audio.src = audioUrl;
    audio.loop = true;

    audio.onPlay(() => {
      playingRef.current = true;
      lastTimeRef.current = audio.currentTime;
      frameTimeRef.current = performance.now();
      loop();
    });

    audio.onPause(() => {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
    });

    // 每 250ms 校准一次基准时间
    audio.onTimeUpdate(() => {
      lastTimeRef.current = audio.currentTime;
      frameTimeRef.current = performance.now();
    });

    audioRef.current = audio;

    const loop = () => {
      const now = performance.now();
      const dt = (now - frameTimeRef.current) / 1000;
      frameTimeRef.current = now;

      if (playingRef.current) {
        lastTimeRef.current += dt * audio.playbackRate;
      }

      const t = lastTimeRef.current;

      const current = notes.find(
        n => t >= n.relativeTime && t < n.relativeTime + n.duration,
      );
      if (current?.id !== activeNoteRef.current) {
        activeNoteRef.current = current?.id ?? null;
        setActiveNoteId(current?.id ?? null);
      }

      if (current) {
        const noteX = current.x * imageWidth;
        const targetScroll = Math.max(0, noteX - viewportWidth * playheadRatio);
        setScrollX(targetScroll);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.stop();
      audio.destroy();
    };
  }, [audioUrl, notes]);

  return {
    activeNoteId,
    isPlaying,
    scrollX,
    play: () => { audioRef.current?.play(); setIsPlaying(true); },
    pause: () => { audioRef.current?.pause(); setIsPlaying(false); },
    setRate: (r: number) => { if (audioRef.current) audioRef.current.playbackRate = r; },
  };
}
6.4 练习页
==========================================================
// src/pages/practice/index.tsx
import { View, Image, Button, Slider } from '@tarojs/components';
import { useState } from 'react';
import { useScrollSync } from '@/hooks/useScrollSync';
import { ChordDiagram } from '@/components/ChordDiagram';

export default function PracticePage() {
  const measure = /* 从路由 guitarmate-audio-backend的/API 获取 */;
  const [tempo, setTempo] = useState(1.0);

  const { activeNoteId, isPlaying, scrollX, play, pause, setRate } =
    useScrollSync({
      audioUrl: measure.audioUrl,
      notes: measure.trackData[0].notes,
      viewportWidth: 750,
      imageWidth: measure.trackData[0].imageWidth,
    });

  const activeChord = measure.chords.find(c => {
    const activeNote = measure.trackData[0].notes.find(n => n.id === activeNoteId);
    if (!activeNote) return false;
    return activeNote.relativeTime >= c.startTime &&
           activeNote.relativeTime < c.startTime + c.duration;
  });

  return (
    <View className="practice-page">
      {activeChord && <ChordDiagram name={activeChord.chordName} />}

      <View style={{ overflow: 'hidden', position: 'relative', width: '100%' }}>
        <View
          style={{
            transform: `translateX(${-scrollX}px)`,
            transition: 'transform 0.03s linear',
            position: 'relative',
          }}
        >
          <Image
            src={measure.trackData[0].tabImageUrl}
            mode="widthFix"
            style={{ width: `${measure.trackData[0].imageWidth}px` }}
          />

          {/* 节点高亮层 */}
          {measure.trackData[0].notes.map((n: any) => (
            <View
              key={n.id}
              style={{
                position: 'absolute',
                left: `${n.x * 100}%`,
                top: `${n.y * 100}%`,
                width: '24rpx',
                height: '24rpx',
                borderRadius: '50%',
                background: activeNoteId === n.id ? '#ff4444' : 'transparent',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {/* 横按层 */}
          {measure.barres.map((b: any) => (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: '4rpx',
                height: '120rpx',
                background: 'rgba(255,68,68,0.6)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {/* 和弦标记层 */}
          {measure.chords.map((c: any) => (
            <View
              key={c.id}
              style={{
                position: 'absolute',
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                fontSize: '28rpx',
                fontWeight: 'bold',
                color: '#333',
                transform: 'translate(-50%, -100%)',
              }}
            >
              {c.chordName}
            </View>
          ))}
        </View>

        {/* 固定播放竖条 */}
        <View
          style={{
            position: 'absolute',
            left: '33.33%',
            top: 0,
            bottom: 0,
            width: '4rpx',
            background: '#ff4444',
            zIndex: 10,
          }}
        />
      </View>

      <View>
        <Button onClick={isPlaying ? pause : play}>
          {isPlaying ? '暂停' : '播放'}
        </Button>
        <Slider
          min={0.5} max={1.5} step={0.1} value={tempo}
          onChange={e => { setTempo(e.detail.value); setRate(e.detail.value); }}
        />
      </View>
    </View>
  );
}

6.5 和弦图组件
==========================================================
// src/components/ChordDiagram.tsx
import { View } from '@tarojs/components';

const CHORD_DB: Record<string, { frets: number[]; fingers: number[]; baseFret: number }> = {
  'C':   { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  'Am':  { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
  'F':   { frets: [1, 3, 3, 2, 1, 1],  fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
  'G':   { frets: [3, 2, 0, 0, 0, 3],  fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
  'G7':  { frets: [3, 2, 0, 0, 0, 1],  fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  'D':   { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
  'Dm':  { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 },
  'D7':  { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1 },
  'E':   { frets: [0, 2, 2, 1, 0, 0],  fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
  'E7':  { frets: [0, 2, 0, 1, 0, 0],  fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  'Em':  { frets: [0, 2, 2, 0, 0, 0],  fingers: [0, 2, 3, 0, 0, 0], baseFret: 1 },
};

export function ChordDiagram({ name }: { name: string }) {
  const chord = CHORD_DB[name];
  if (!chord) return <View>{name}</View>;
  // 可用 Canvas 绘制，或简单展示名称
  return <View className="chord-diagram">{name}</View>;
}

七、完整数据流
===========================================================
① 音频上传
   用户 → 管理后台 → OSS (original.wav)
   ↓
② Mac 工作站转录
   Demucs htdemucs_6s → guitar.wav / bass.wav / ...
   SoloTrace(guitar.wav) → guitar.json
   Basic Pitch(bass.wav) → bass.mid → bass.json
   ↓ 手动上传 JSON 到管理后台
③ 管理后台标注
   解析 JSON → VexFlow 渲染六线谱
   自动检测横按 → 人工确认
   和弦识别/手动标注 → 绑定时间轴
   计算每个节点归一化坐标
   框选练习小节 → 提交发布
   ↓
④ 后端处理
   ffmpeg 切片 → OSS 上传
   写入 Measure / MeasureTrack / Barre / ChordMarker
   ↓
⑤ 小程序练习
   GET /api/published/scores/:id/measures
   渲染 SVG 六线谱 + 叠加高亮层
   InnerAudioContext 循环播放 + RAF 平滑滚动
八、实施里程碑
Phase 1：后端骨架（1 周）
-------------------------------------------------------
□ NestJS + Prisma + SQLite 初始化（prisma migrate dev）
□ Score / Track / Measure 基础 CRUD
□ OSS 上传服务
□ ffmpeg 音频切片服务
□ publish 接口跑通
Phase 2：Mac 转录流程（1 周）
-------------------------------------------------------
□ Demucs 环境搭建 + 分离脚本
□ SoloTrace 使用培训（录制操作文档）
□ JSON 导入管理后台的接口
Phase 3：管理后台标注编辑器（2 周）
-------------------------------------------------------
□ VexFlow 六线谱渲染组件
□ 节点标注叠加层 + 低置信度着色
□ 横按自动检测 + 人工确认
□ 和弦标注面板
□ 小节框选切分 + 发布
Phase 4：小程序练习页（2 周）
-------------------------------------------------------
□ 曲目列表 / 小节选择页
□ useScrollSync Hook + RAF 平滑滚动
□ 节点 / 横按 / 和弦高亮层
□ 和弦图组件
□ 变速 / 循环 / AB 循环
Phase 5：优化与测试（1 周）
□ 长乐谱虚拟化
□ 真机性能测试（iOS / Android）
□ 版权声明 / 用户反馈入口

九、风险与应对
风险	影响	应对
htdemucs_6s 吉他分离质量低	转录错误率高	引入 MVSep 二次分离；强化后台人工校正
SoloTrace 仅支持 macOS	无法服务器化	部署 Mac 工作站；或将 Basic Pitch + 指法求解器服务化
横按/和弦自动识别不准	标注效率低	提供手动标注面板；低置信度优先人工
小程序 RAF 被节流	滚动卡顿	onTimeUpdate 周期性校准；onHide 暂停动画
长乐谱内存溢出	小程序崩溃	虚拟化：只渲染视口 ±2 小节
SQLite 并发写	少量冲突	单进程部署；写入队列化；必要时迁 PostgreSQL
版权合规	法律风险	上传时强制勾选授权声明；提供下架通道

十、以下提示词可分段检查，分段执行。

根据以上整体方案，创建任务 1：初始化项目与数据库
==========================================================
请仔细检查分析用 NestJS + Prisma + SQLite 生成后端项目骨架。
1. prisma/schema.prisma 使用 sqlite provider，url 为 "file:./data/app.db"
2. 数据库包含 6 个模型：Score、Track、Measure、MeasureTrack、Barre、ChordMarker
   - MeasureTrack.notes 字段类型为 String（不是 Json），存 JSON 序列化字符串
   - 所有 id 使用 @default(cuid())
   - 建立必要的外键关系和 @@index
3. 提供 PrismaService（继承 PrismaClient，实现 OnModuleInit）
4. package.json 中包含脚本：prisma:generate、prisma:migrate、prisma:studio、db:seed、dev、build
5. .env 文件包含 DATABASE_URL="file:./data/app.db"
6. 生成一份 seed.ts 脚本，插入一条示例 Score

请依次输出：
- prisma/schema.prisma
- src/prisma/prisma.service.ts
- src/prisma/prisma.module.ts
- prisma/seed.ts
- package.json 完整内容
- .env 示例

注意：SQLite 不支持 Json 和 enum 类型，所有 JSON 字段用 String，enum 值用 String 表示。

2：后端核心服务
==========================================================
请检查基于 NestJS 生成以下服务，数据库为 SQLite（Prisma）：

1. AudioService
   - 方法 sliceAudio(inputPath, startTime, endTime)
   - 使用 fluent-ffmpeg + ffmpeg-static
   - 输出 mp3，加上 5ms fade in/out 避免爆音

2. OssService
   - 方法 upload(localPath, remoteDir) 返回 CDN URL
   - 使用 ali-oss SDK

3. MeasuresService
   - 方法 create(data)：创建 Measure 及其关联 MeasureTrack / Barre / ChordMarker
   - 方法 findByScore(scoreId)：返回小节列表，并把 MeasureTrack.notes 从 String 反序列化为对象数组

4. MeasuresController
   - POST /api/measures/publish
   - 接收：{ scoreId, trackId, trackAudioPath, bpm, timeSignature, measures: [{ index, label, startTime, endTime, notes, barres, chords, tabImageUrl }] }
   - 流程：切片音频 → 上传 OSS → 计算 notes 的 relativeTime（audioTime - startTime）→ 写入数据库

5. PublishedController
   - GET /api/published/scores：返回 status='published' 的曲目列表
   - GET /api/published/scores/:id/measures：返回该曲目的所有小节及关联数据

已经输出完整的 TypeScript 代码，包括 imports、decorators、DTO 定义。

根据以上整体方案，检查 3：管理后台六线谱标注器
==========================================================
请检查是否用 React 18 + Vite + TypeScript + Ant Design 5 + VexFlow 4 生成管理后台的核心组件。

组件清单：
1. TabRenderer.tsx
   - 输入：notes（含 string/fret/duration/audioTime）、bpm、timeSignature
   - 用 VexFlow 的 TabStave + TabNote + Beam 渲染六线谱
   - 将秒数 duration 转为 VexFlow 时值（q/8/16/32）
   - 渲染完成后通过回调返回每个音符的归一化坐标 (x/1200, y/200)

2. NoteOverlay.tsx
   - 在 TabRenderer 上方叠加节点标记
   - 按 confidence 着色：>=0.8 绿色，>=0.6 黄色，<0.6 红色
   - 支持点击选中

3. ChordPanel.tsx
   - 提供常用和弦按钮（C、Am、F、G、G7、E7 等）
   - 点击后调用 onInsert(chordName, activeTime)

4. MeasureSlicer.tsx
   - 输入：notes、bpm
   - 按 4/4 拍自动生成初始小节（每小节 = bpm 对应的 4 拍）
   - 支持合并（merge）和拆分（split）操作

5. utils/barreDetector.ts
   - 输入：notes 数组
   - 按 audioTime 分组（30ms 容差）
   - 检测同品位连续多弦 → 输出 Barre[]

6. 主页面 AnnotatePage.tsx
   - 左侧 TabRenderer + NoteOverlay
   - 中间 ChordPanel
   - 右侧 MeasureSlicer
   - 底部"发布"按钮，调用 POST /api/measures/publish

请输出所有组件的完整代码。

根据以上整体方案，检查任务 4：Taro 小程序练习页
==========================================================
请检查分析用 Taro 3 + React 18 + TypeScript 生成微信小程序的练习页。

核心要求：
1. hooks/useScrollSync.ts
   - 参数：audioUrl、notes、viewportWidth、imageWidth、playheadRatio=1/3
   - 用 Taro.createInnerAudioContext() 播放音频
   - 用 requestAnimationFrame 平滑插值（因为 onTimeUpdate 每 250ms 才触发一次）
   - 每 250ms 用 audio.currentTime 校准基准时间
   - 每帧计算当前 activeNoteId 和 scrollX（让当前音符对准视口 1/3 处）
   - 返回 { activeNoteId, isPlaying, scrollX, play, pause, setRate }

2. pages/practice/index.tsx
   - 渲染六线谱图片（<Image>）
   - 用 transform: translateX(-scrollX) 实现横向滚动
   - 叠加节点高亮层（绝对定位 <View>）
   - 叠加横按层（竖直粗线）
   - 叠加和弦标记层（文字）
   - 固定播放竖条在 33.33% 位置
   - 底部控制栏：播放/暂停按钮、变速 Slider

3. components/ChordDiagram.tsx
   - 内置常用和弦指法表（CHORD_DB）
   - 根据和弦名渲染指法图（简单版直接显示名称）

关键性能优化：
- 用 useRef 保存 activeNoteId，只在变化时 setState
- 用 requestAnimationFrame 驱动滚动，避免 setInterval
- onHide 时暂停动画循环

输出完整的 TypeScript 代码。

根据以上整体方案，检查任务 5：Docker 部署与文档
==========================================================
请生成以下部署文件：

1. docker-compose.yml
   - 只包含 backend 服务（SQLite 单文件）
   - 挂载 ./backend/data 到容器 /app/data
   - 挂载 ./uploads 到容器 /app/uploads
   - 环境变量从 .env 读取
   - Redis 服务可选（注释掉）

2. backend/Dockerfile
   - 基于 node:20-alpine
   - 安装 ffmpeg
   - 多阶段构建：builder + runner
   - 启动时先执行 prisma migrate deploy

3. README.md
   - 项目简介
   - 本地开发步骤（npm install → prisma migrate → npm run dev）
   - Mac 转录流程说明（Demucs + SoloTrace）
   - 备份 SQLite 的方法（复制 data/app.db）
   - 常见问题

安全输出所有文件内容。

根据以上整体方案，检查任务 6：类型定义与共享代码
==========================================================
请检查生成前后端共享的 TypeScript 类型定义文件 shared/types.ts，包含：

1. Note：{ id, string, fret, pitch, relativeTime, duration, confidence, x, y }
2. Barre：{ id, fret, fromString, toString, startTime, duration, x, y }
3. ChordMarker：{ id, chordName, startTime, duration, x, y }
4. Measure：{ id, scoreId, index, label, startTime, endTime, duration, bpm, timeSignature, trackData: MeasureTrack[], barres: Barre[], chords: ChordMarker[] }
5. MeasureTrack：{ id, measureId, trackId, audioUrl, tabImageUrl, imageWidth, imageHeight, notes: Note[] }
6. Score：{ id, title, artist, bpm, timeSignature, originalAudio, coverUrl, status }
7. Track：{ id, scoreId, instrument, audioUrl, jsonUrl }

另外，生成 src/services/api.ts，封装：
- getPublishedScores()
- getMeasuresByScore(scoreId)
- publishMeasures(payload)

输出完整代码。
==========================================================

十一、快速启动清单
bash
# 1. 后端初始化
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
# 访问 http://localhost:3000

# 2. 管理后台
cd admin
npm install
npm run dev
# 访问 http://localhost:5173

# 3. 小程序
cd miniprogram
npm install
npm run dev:weapp
# 用微信开发者工具打开 dist/ 目录

# 4. Mac 工作站转录（手动流程）
python scripts/separate.py song.mp3 ./output
# 打开 SoloTrace → 导入 guitar.wav → 导出 JSON
# 将 JSON 上传到管理后台

# 5. 备份 SQLite
cp backend/data/app.db backups/app-$(date +%Y%m%d).db
十二、总结
本方案的核心特点：

SQLite 单文件存储：零运维成本，app.db 直接复制即为完整备份，未来可平滑迁移到 PostgreSQL。

转录与标注分离：Mac 工作站负责 AI 转录，管理后台负责人工校正，避免在小程序端处理复杂计算。

数据驱动的节点跟随：SoloTrace 提供的 audioTime 直接驱动前端高亮，无需自行推算时间。

RAF 平滑滚动：解决微信小程序 onTimeUpdate 精度不足的问题，实现 60fps 竖条跟随。

可扩展的横按/和弦标注：自动检测 + 人工确认，让标准六线谱图谱具备练习价值。
