# 音频转录流水线（Audio → Six-line Tab → PracticePackage）

> 解决的核心问题：拿到一段**音频**（上传 MP3/WAV/FLAC 或 URL），
> 自动跑「乐器分离 → 转录 → 转谱」，产出**可人工复核的六线谱**，
> 最终下发成小程序端唯一数据契约 `PracticePackage`（schemaVersion 1.0）。
>
> 本文档对应代码：`guitarmate-audio-backend/src/transcription/`、`workers/`、
> `guitarmate-studio-cms/src/components/review/`。

---

## 一、与「六线谱导入」（tab-import）的关系

两条入口互补，**汇聚到同一个中间格式 TabProject，再汇聚到同一个 C 端契约**：

```
① 人工制谱   ASCII / MusicXML / .gpx / 和弦表 ─┐
                                                ├─► TabProject ─► 发布 ─► PracticePackage ─► 小程序
② 原始音频   MP3/WAV/FLAC 或 URL(yt-dlp)     ─┘   (统一中间格式)
             └─ Demucs → Basic Pitch → Tayuya
```

| | tab-import | **transcription（本次新增）** |
|---|---|---|
| 输入 | 人工制谱文件 | 原始音频 / 视频链接 |
| 节奏精度 | 视格式而定（ASCII 为近似） | 时值来自 MIDI，随音频时间轴 |
| 主要风险 | 版权（已有合规闸门） | **模型误检**（低置信度音符需人工复核） |
| 落库 | `Score / Track / Measure` | `Project / TranscribeJob / TranscribeTrack / PracticePackage` |

---

## 二、数据模型（任务 1）

`prisma/schema.prisma` 追加 4 张表，**不修改任何既有模型**（只给 `Score` 加了一组虚拟反向关系）：

```
Project ─1:N─ TranscribeJob    每个阶段的执行记录（状态/耗时/入参出参/错误）
        ─1:N─ TranscribeTrack  Demucs 分离出的分轨 + 转录产出
        ─1:1─ PracticePackage  最终下发给 C 端的 JSON 快照（payload 为 String）
        ─0:1─ Score            可选：回流到既有发布链路
```

- `Project.status`：`pending | downloading | separating | transcribing | converting | review | published | failed`
- ⚠️ **命名说明**：方案里的 `Track` 模型名已被「曲目分轨」占用（Prisma model 名全局唯一），
  因此转录流水线的分轨模型命名为 **`TranscribeTrack`**，语义一一对应。
- `PracticePackage.payload` 是 `String`（SQLite 不支持 `Json`），与既有 `MeasureTrack.notes` 同一约定。

应用变更：

```bash
cd guitarmate-audio-backend
npx prisma db push      # 新增表（幂等，不动既有数据）
npx prisma generate     # ⚠️ 需先停掉正在运行的 node dist/main.js，否则 query_engine DLL 被占用
```

---

## 三、后端服务（任务 2 / 任务 5）

`src/transcription/`：

| 文件 | 职责 |
|---|---|
| `upload.service.ts` | **UploadService**：base64 上传（扩展名 + 魔数 + 体积校验）、URL 下载（yt-dlp；直链走 HTTP）、ffmpeg 元信息探测 |
| `transcribe.service.ts` | **TranscribeService**：编排 Demucs → Basic Pitch → Tayuya，阶段链与任务留痕 |
| `publish.service.ts` | **PublishService**：按小节切音频 → 上传 OSS → 算 `relativeTime`/归一化坐标 → 输出 schemaVersion 1.0 |
| `queue/` | **BullMQ 分阶段派发**（`bullmq.queue.ts`）+ Redis 缺失时的进程内降级（`in-process.queue.ts`） |
| `python-runner.service.ts` | 找解释器、调用 `workers/*.py`、解析 `GUITARMATE_RESULT` 协议 |
| `simulation.service.ts` | Python 依赖缺失时的兜底（含**真实可用的 SMF MIDI 写入器**） |

### 3.1 队列：BullMQ 是可选依赖

`bullmq` / `ioredis` **当前未安装**，因此设计成运行时可选加载：

| 条件 | 驱动 | 说明 |
|---|---|---|
| `REDIS_URL` 可连通 + 装了 bullmq | `bullmq` | 持久化、多进程、可在 BullMQ Board 观测 |
| 其它情况 | `in-process` | 语义等价的最小实现（串行 + 重试 + 退避），**进程重启丢队列** |

启用真实 BullMQ：

```bash
cd guitarmate-audio-backend && npm i bullmq ioredis
# .env
REDIS_URL=redis://127.0.0.1:6379
QUEUE_DRIVER=bullmq
```

阶段链（每阶段独立重试，互不拖累）：

```
separate ──► transcribe（按分轨投递）──► convert（按分轨投递）
```

### 3.2 发布：关键不变式

| 量 | 公式 |
|---|---|
| `relativeTime` | `audioTime - measure.startTime` |
| `x` | `relativeTime / measure.duration` |
| `y` | `(string - 1) / 5`（一弦在上） |
| `midi` | `空弦音高 + fret + capo` |
| 小节时长 | `拍数 × (60/bpm) × (4/拍号分母)` —— **绝不硬编码** |

- `metronome` **始终下发**（`enabled: !audioUrl`）：音频 404 时客户端立即降级，不会「点了没声音」；
- 音符坐标服务端兜底：`x` / `y` 缺失或为 0 时由服务端按公式补齐；
- 小节按 `index` 升序、音符按 `relativeTime` 升序（C 端「当前节点」判定依赖该顺序）；
- **人工覆写 BPM / 拍号后会自动重新划分小节**（`rewindowTabProject`）并给出 warning ——
  否则 `ffmpeg` 切出的音频区间与谱面小节会错位（历史「音频与节点不一致」的根源）。

可选回流：`mirrorToScorePipeline: true` 会把结果写入既有 `Score / Track / Measure`
（先清空该曲目旧小节，因为旧链路是 append-only），这样旧接口与对齐工作台也能看到数据。

---

## 四、Python Workers（任务 3）

见 `workers/README.md`。契约极简：CLI 参数进、`stderr` 打日志、`stdout` 最后一行 `GUITARMATE_RESULT {json}` 出。

| 文件 | 阶段 | 依赖 |
|---|---|---|
| `separate.py` | Demucs `htdemucs_6s` 六轨分离 | `demucs` + `torch` |
| `transcribe.py` | Basic Pitch 音频 → MIDI + 音符（置信度） | `basic-pitch` |
| `midi_to_tab.py` | MIDI → 六线谱 TabProject | **零依赖**（纯标准库 SMF 解析 + 指法分配） |

> `midi_to_tab.py` 是「Tayuya 兼容」转换器：可选 `TAYUYA_BIN` 走外部实现，
> 否则用内置转换器（量化 + 最低把位优先）。两条路径产出同一份 TabProject。

**依赖缺失不会让链路瘫痪**：`TRANSCRIBE_SIMULATE=true`（默认）时自动走模拟转录 ——
产物带 `simulated` 标记与 `warn` warning，`provenance.humanReviewLevel` 很低，不会被误上线。

---

## 四·五、内置真实转录器（`node-yin`，零依赖）

重型 ML 依赖（Demucs / Basic Pitch，需要 torch + TensorFlow）在很多机器上装不上，
但**那不该意味着只能出模拟谱**。因此在 `transcribe` 阶段插了一个用 Node 自己写的真实转录器：

```
Basic Pitch 可用        → 走 ML（最准，复音也能转）
  ↓ 否则
ffmpeg 可用（已在用）    → NodeTranscriberService（真实、离线、零新增依赖）
  ↓ 否则
TRANSCRIBE_SIMULATE     → 模拟器（按节拍网格造音符，带 simulated 标记）
```

```
src/transcription/pitch-analysis.ts      纯函数 DSP：YIN / 分帧 / BPM / 色度 / 和弦模板
src/transcription/node-transcriber.service.ts  ffmpeg 解码 → 分析 → 真实 SMF + 和弦时间线
scripts/generate-solo-sample.mjs         生成带真值标注的吉他 solo+和弦 样品（`npm run demo:solo`）
scripts/verify-pitch-analysis.mjs        用真值量化识别精度（`npm run verify:pitch`）
scripts/demo-audio-to-miniprogram.mjs    一条命令跑完整条链路（`npm run demo:pipeline`）
```

**算法**（都是教科书方法，看得懂、能定位问题）：

| 步骤 | 方法 | 关键取舍 |
|---|---|---|
| 解码 | ffmpeg → 22050Hz 单声道 f32（stdout 直接拿裸 PCM） | 采样率减半让差分函数快一倍 |
| 基频 | **YIN**（累积均值归一化差分 + 抛物线插值） | 取第一个低于阈值的**局部极小**，避免锁到 2 倍周期 |
| 切音 | **起音引导**：先在振幅包络上找起音，再在起音后几帧估计音高 | 拨弦 = 一次起音 = 一个音；靠「同音高连续帧」切会被延音切成碎片 |
| 去抖 | 音高轨迹中值滤波（窗 5）+ 单帧手位合邻 | 拨弦换音瞬间 YIN 会跳到邻音/次谐波 |
| BPM | 起音强度包络自相关（50–200 BPM） | >180 减半 —— 自相关最容易锁到 2 倍拍长 |
| 和弦 | 色度（65–520Hz 伴奏频段）+ 模板余弦匹配 + 低音根音加分 | 旋律排在高音区，限定频段能显著减少「旋律把和弦带跑」 |

**实测精度**（`npm run verify:pitch`，样品 `uploads/demo/solo_am_f_c_g.wav`，8 小节 / 64 个 solo 音）：

| 指标 | 结果 |
|---|---|
| 音高准确率 | 96.9–98.4%（与真值逐音比对） |
| BPM 估计 | 96.8 vs 真值 96（误差 0.8%） |
| 和弦识别 | 6/8–7/8 小节完全正确（Am/F/C/G 全部命中，末小节尾巴会多出 Gadd9/Dm） |
| 假阳性 | ~6 个（延音尾巴被当成起音，进复核工作台人工删） |
| 耗时 | 21s 音频 ≈ 1 秒 |

**和弦时间线**由 `analyzeChords()` 产出后，在 `convert` 阶段由 `applyAudioChordTimeline()`
映射到小节上（**宁少勿滥**：一小节取主和弦，只有另一段在小节里独立占到大半才补标第二个）。
它优先于 `deriveChords()` 的旋律推定 —— 因为它是从**真实伴奏**里听出来的，
而不是从单音旋律猜的。

> ⚠️ 局限：只做**单音**旋律（复音/多声部仍需 Basic Pitch）；伴奏比 solo 还响时会跟丢。
> 所有产物都会写 `engine` 与 `analysis`（BPM/有音高帧占比/和弦段数），
> 复核工作台与演示脚本据此区分「真听出来的」和「模拟的」。

---

## 五、管理后台复核工作台（任务 4）

CMS 侧边栏新增「**音频转录复核工作台**」（`transcription-review`）：

```
guitarmate-studio-cms/src/components/review/
  ReviewPage.tsx          三栏：项目列表+新建 / 逐小节谱面 / 音符检查器
  StandardTabRenderer.tsx 标准六线谱渲染器（自绘 SVG，无第三方渲染依赖）
  standardTabLayout.ts    排版引擎（纯函数：数据 → 线/记号/连接符/坐标，渲染与叠加层共用）
  NoteInspector.tsx       编辑 弦号 / 品位 / 时值 / 技巧 / 手指（+ 删除误检音符）
  reviewTypes.ts          视图模型 + 不可变编辑（改品位自动重算 midi）
```

- **低置信度音符标红**：`NoteOverlay` 按 `>=0.8 绿 / >=0.6 黄 / <0.6 红` 着色（复用既有组件），
  置信度圆点画在**音符左上角**、手指上标画在**右上角**，两者都不遮挡中间的数字；
- 改弦号/品位后 `midi` 会**同步重算**，避免 C 端音高与谱面不一致；
- 谱面宽度自适应容器，低于 560px 时改为横向滚动（不压缩到不可读）。

### 5.1 标准六线谱排版规则（`standardTabLayout.ts`）

排版规则**全部集中在纯函数里**，组件只负责把返回值画成 SVG：

| 要素 | 规则 |
|---|---|
| 弦线 | 6 条等距横线，**第 6 弦（低音 E）更粗**；贝斯传 `stringCount=4` 得 4 线谱 |
| 谱号 | TAB 三字母，T 落在第 2 弦、A 落在第 4 弦、B 落在第 6 弦 |
| 拍号 | 分子在第 2-3 弦之间、分母在第 4-5 弦之间（与五线谱写法一致） |
| 速度 | 谱面下方 `♪ = N`；小节号画在左上，仅第一小节画谱号/拍号/速度 |
| 把位 | 谱面**左上角阿拉伯数字** + 「把位」小字（数据来自 `measure.position`；早期用罗马数字，改数字是为了让学员不用先认罗马数字） |
| 小节号 | 谱面**右上角**（与左上角的把位标记对角分开，两个数字不会被连着读） |
| 和弦 | 和弦名画在**弦线上方**的独立和弦行，x 与该和弦的时间成正比 |
| 弦线数字 | **手指号**（0 显示为 ○）直接写在弦线上，y 严格等于弦线 y，并为数字**挖空**弦线避免压字。品位由左上角把位标记反推：`fret = position + finger − 1` |
| 换把标记 | 音符自带 `position`（小节内换把时与 `measure.position` 不同）→ 在手位变化处多印一个小号「N把位」→ **任何音符的品位都能唯一反推** |
| 手指标数 | 数字右上方的小号上标，0 显示为 `○`（空弦） |
| 节奏连接符 | 按**拍**分组画在弦线**下方**，八分 1 条 / 十六分 2 条 |
| 扫弦箭头 | ≥3 根弦同时发音 → 在该簇左侧画扫弦箭头，跨越整个簇的弦范围 |
| 拍点刻度 | 每拍一个小竖线（在弦线下方），末小节画一细一粗收尾线 |
| 坐标 | `timeToX()` 线性映射，t=0 → 音符区左边界，越界时间夹取 |

小程序端的**排版规则完全相同**（同一套函数），只是像素密度不同：

| | CMS | 小程序 |
|---|---|---|
| 弦间距 | 13 | 11 |
| 画布 | 依容器宽度（≥560） | 600×142 固定 viewBox，按比例缩放 |

> ⚠️ **两份引擎必须同步**：`guitarmate-studio-cms/src/components/review/standardTabLayout.ts`
> 与 `guitarmate-frontend/src/utils/standardTabLayout.ts` 是**同一套规则的两个副本**
> （两个包之间没有共享库）。**改任何一条排版规则都必须同时改这两份**，
> 否则会出现「后台看到的谱和学员练的谱不一样」。
> `npm run verify:tab-layout`（CMS）里有专门的「两端排版规则一致」断言来兜这条底线。

---

## 六、左手指法与把位标注（fingering）

真实六线谱（教材 / Guitar Pro / 官方谱）都会在品位数旁标出**用哪根手指按**（1-4）
以及当前的**把位**（本项目用阿拉伯数字）。本项目三层都原本没有这个概念，现已补全：

| 层 | 改动 |
|---|---|
| 数据模型 | `TabProjectNote.finger`（0 = 空弦，1-4 = 食指…小指）、`TabProjectNote.position`（**该音生效的手位**）、`TabProjectMeasure.position`（小节起始手位）、`Measure.position Int?` |
| 生产者 | ① MusicXML 解析器现在读 `<technical><fingering>`（**以前被直接丢掉**）；② 新增 `src/tab-import/fingering.ts` 做启发式推定 |
| 契约 | `PracticeNote.finger`、`PracticeNote.position`、`PracticeMeasure.position`（可选字段，缺失时 C 端不画标记 → 旧数据完全兼容） |
| 渲染 | CMS `StandardTabRenderer`（自绘 SVG）、小程序 `PracticeMeasure` —— **同一套排版引擎**，样式与教材一致 |
| 编辑 | CMS `NoteInspector` 可逐音符改手指、逐小节改把位，并支持「按此把位重算手指」 |

### 记法约定

```
 1 = 食指 · 2 = 中指 · 3 = 无名指 · 4 = 小指 · ○ = 空弦
 把位 P = 食指所按的品位；此时第 n 指负责第 P + n − 1 品
 核心公式：finger = fret − position + 1（空弦除外）
```

### 推定算法（`deriveLeftHandFingering`）

1. **分帧**：同一发音时刻（±20ms）的音符合成一帧 —— 和弦必须整体出手型，
   逐个音符独立算手指一定会得到「和弦里三个音都是食指」这种不可能的手型；
2. **逐帧定手位**（一帧 = 同一发音时刻，同手型）：能用当前手位覆盖就不换；
   否则移动到最近的可覆盖手位（优先「最高音落在小指」）。手位写回每个音符的 `note.position`，
   并在**去抖动**（长度仅 1 帧的手位段并入相邻段）后作为谱面换把标记的数据源；
3. **分手指**：`finger = fret − position + 1` 夹到 [1,4]；同一帧内同一品出现在多根弦上 → 横按；
4. **技巧修正**：`slide` 同指滑过、`hammer-on` 手指序递增、`pull-off` 递减；
5. **已有真实指法优先**：源文件带 `<fingering>` 的音符**不被覆盖**（`onlyMissing`），
   并用它们反推真实把位（`position = fret − finger + 1` 取最小值）；
6. **小节标记对齐**：`measure.position` 取「该小节最早那个已标注音符的手位」，
   保证谱面左上角的标记与弦线上的手指号一致（二次调用时不会把人工/源文件的标注冲掉）。

> 为什么从「整小节单一手位」改成「逐帧手位」？
> 因为谱面上的数字现在是**手指号**，品位必须能由 `position + finger − 1` 唯一反推。
> 而真实的 solo 一小节经常跨 5 品以上（实测：单小节 fret 5–12），单一小节手位会让
> 44% 的音符被迫「夹到可用手指」—— 那些数字就再也反推不出品位了。
> 现在换把处会多印一个小号「N把位」，手指号始终可读。

> ⚠️ 自动指法永远是**建议值**（同一段旋律存在多种合理指法）。
> 所有推定都会写入 `warnings`（`fingering-derived` / `fingering-clamped` / `fingering-position-shift`），
> 并且必须在 CMS 复核工作台里人工确认后才能发布。

### 谱面渲染位置（为什么写手指号、且不写在弦线下方）

**写什么**：弦线上的数字默认写**手指号**（`noteLabel='finger'`，市面练习谱写法），
而非品位 —— 把位标记 + 手指号已经能定位到具体品位 (`fret = position + finger − 1`)，
谱面大幅减负。复核纠错时可切回 `noteLabel='fret'`（品位号 + 手指上标），
`<title>`/`NoteInspector` 无论哪种模式都始终带**真实品位**。

**位置**：弦间距只有 13px（小程序端 11px），而音符框本身占 ~14px —— 手指标记写在下方会与
下一根弦的框重叠。因此采用**上标**写法（与 Guitar Pro / Soundslice 一致）：

```
        8 把位                     ← 小节起始手位（左上角）
   Am              5把位          ← 和弦名 / 换把标记（标在小节内的换把处）
  ┌─ 手指号（1-4 / ○）
  e|── 1 ── 3 ── 1 ── 4 ──│
  └─ 落在弦线上，弦线被挖空
```

### 和弦标注（`deriveChords`）

`src/tab-import/chord-detect.ts` 三级策略，**只补缺、不覆盖**：

1. **显式来源优先**：MusicXML `<harmony>` / 和弦表解析出的和弦永不改写；
2. **同簇精确匹配**：≥3 根弦同时发音 → 音级集合与内置 `CHORD_VOICINGS` 精确相等 → 直接命名；
3. **窗口和声分析**（单音旋律用）：滑动窗口内统计音级覆盖度，
   根音必须出现、覆盖度 ≥0.6 才算候选；打分时根音在低音 +40、斜杠和弦 -8、
   窗口外的音 -12、和弦内音 -3。

> ⚠️ 被**推定**出来的和弦只写和弦名，**不写 `frets` 指法图**（`frets` 刻意留空）——
> 单音旋律里反推出来的按法没有依据，画出来就是假指法。显式来源的和弦才带 `frets`。
> 连续重复的和弦会被压缩为一次标注（原谱也只在变化处标）。

---

## 七、接口速查

```
GET    /api/transcription/capabilities              能力探测（是否需要装 Python 依赖）
GET    /api/transcription/queue                     队列统计与驱动

POST   /api/transcription/projects/upload           上传 MP3/WAV/FLAC（base64）→ 建项目 + 入队
POST   /api/transcription/projects/from-url         URL 导入（yt-dlp / 直链）→ 建项目 + 入队
GET    /api/transcription/projects                  项目列表
GET    /api/transcription/projects/:id              详情（含阶段时间线 + 分轨音符 + TabProject）
PATCH  /api/transcription/projects/:id              人工复核保存（tabProject 整体覆写）
DELETE /api/transcription/projects/:id              删除（级联）

POST   /api/transcription/projects/:id/start        启动/续跑（202，异步）
POST   /api/transcription/projects/:id/retry        从「第一个未完成的阶段」恢复
POST   /api/transcription/projects/:id/publish      生成并发布 PracticePackage
GET    /api/transcription/projects/:id/package      取 C 端契约（与 /api/published/... 同构）
GET    /api/transcription/projects/:id/revisions    发布历史（revision 自增）
```

Swagger：`http://localhost:3000/docs` → `Transcription` 标签。

---

## 八、环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PYTHON_BIN` | 自动探测 `python3`/`python`/`py -3` | Python 解释器 |
| `YTDLP_BIN` | 自动探测 `yt-dlp` / `python -m yt_dlp` | URL 下载 |
| `TAYUYA_BIN` | 空 | 外部 Tayuya 可执行文件（可选） |
| `WORKERS_DIR` | `<后端>/workers` | worker 脚本目录 |
| `WORKER_TIMEOUT_MS` | `1800000` | 单个 worker 超时（30 分钟） |
| `TRANSCRIBE_SIMULATE` | `true` | 依赖缺失时是否允许模拟转录 |
| `DEMUCS_MODEL` | `htdemucs_6s` | 分离模型 |
| `BASIC_PITCH_ONSET` / `BASIC_PITCH_FRAME` | `0.5` / `0.3` | 转录灵敏度（越低越灵敏，误检越多） |
| `REDIS_URL` / `QUEUE_DRIVER` | — / `auto` | 队列后端 |
| `TRANSCRIBE_CONCURRENCY` | `1` | Worker 并发（Demucs 吃满 CPU） |

---

## 九、验证（全部可重复运行）

```bash
cd guitarmate-audio-backend
npx tsc --noEmit && node node_modules\@nestjs\cli\bin\nest.js build   # 类型 + 构建
node dist\main.js                                                     # 启动（:3000）
npm run transcribe:verify                                            # 端到端（58 项断言）
npm run demo:solo                                                     # 生成带真值的吉他 solo 样品
npm run verify:pitch                                                  # 内置转录器精度（13 项，需先 build）
npm run demo:pipeline -- --keep                                       # 真实音频 → 六线谱 → 小程序端（30 项）
npm run demo:clean -- --dry-run                                       # 清理演示/测试产物（先看后删）
node scripts/e2e-transcription-pipeline.mjs --keep --wav uploads/demo/demo_original.wav
```

`transcribe:verify` 覆盖：上传 → 入队 → 轮询三阶段 → **左手指法/手位推定 + 不变式校验
（`finger = fret − position + 1`）** → 人工复核（改品位/时值/技巧/手指 + 覆写 BPM）→ 发布
→ 契约校验（schemaVersion、小节/音符排序、
`x`/`y`/`relativeTime` 不变式、finger/position 下发、音频可达性、revision 自增）
→ MusicXML `<fingering>` 保留验证 → 清理。

> ⚠️ 本机装了 ffmpeg 时，e2e 会走**内置真实转录器**（`engine=node-yin`）而不是模拟器；
> 模拟路径只在 ffmpeg 也不可用时才会被激活。

```bash
cd guitarmate-studio-cms
npx tsc --noEmit && npx vite build
npm run verify:tab-layout     # 标准六线谱排版回归（47 项断言，含两端规则一致性）
```

```bash
cd guitarmate-frontend
npx tsc --noEmit && npm run verify:contract   # 小程序消费层契约校验
```

> ⚠️ 重启后端务必先杀旧进程，否则新进程静默 bind 失败、测试打到旧代码（表现为 404）：
> `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'dist[\\/]main' | % { Stop-Process -Id $_.ProcessId -Force }`

---

## 十、兼容性承诺

1. **零破坏性改动**：既有 `Score/Track/Measure`、`/api/measures/publish`、
   `/api/published/scores/:id/package`、tab-import 全套端点行为完全不变；
2. **零新增必装依赖**：BullMQ/yt-dlp/Demucs/Basic Pitch 全部为可选，缺失即降级；
   六线谱为**自绘 SVG**（无第三方渲染库），排版规则集中在纯函数里；
3. **同一份契约**：新流水线产出的 `PracticePackage` 与既有端点结构一致，
   小程序端 `validatePracticePackage` 无需任何改动；
4. **不污染旧数据**：转录产物默认只写新表，回写旧链路需显式开启 `mirrorToScorePipeline`。
