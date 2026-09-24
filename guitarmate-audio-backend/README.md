# 🎸 GuitarMate Audio Backend

吉他六线谱智能练习平台 —— **音频 / 小节数据中台**

基于 **NestJS 10 + Prisma 5 + SQLite** 构建，负责：

| 能力 | 说明 |
|---|---|
| 曲目与分轨管理 | Score / Track CRUD，转录 JSON 导入 |
| 转录结果导入 | 接收 Mac 工作站 (SoloTrace / Basic Pitch) 导出的 JSON 并落盘 |
| 音频切片 | `ffmpeg` 按小节区间切片，自动加 5ms 淡入淡出避免爆音 |
| 对象存储 | 阿里云 OSS 上传；未配置凭证时自动降级到本地 `./uploads` 静态目录 |
| 小节发布 | 计算 `relativeTime = audioTime - startTime`，写入 Measure / MeasureTrack / Barre / ChordMarker |
| 小程序接口 | `/api/published/*` 面向 C 端小程序提供已发布曲目与小节数据 |

> 📑 Swagger 交互文档：<http://localhost:3000/docs>

---

## 一、快速开始（本地开发）

```bash
cd guitarmate-audio-backend

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env       # Windows: copy .env.example .env

# 3. 生成 Prisma Client 并初始化数据库
npx prisma generate
npx prisma migrate dev --name init     # 无迁移文件时可用: npx prisma db push

# 4. 写入示例数据（可选）
npm run db:seed

# 5. 启动开发服务（watch 模式）
npm run dev
```

启动后访问：

- 服务根路径（健康检查 + 数据统计）：<http://localhost:3000>
- Swagger 文档：<http://localhost:3000/docs>

### npm scripts

| 脚本 | 用途 |
|---|---|
| `npm run dev` | NestJS watch 模式启动 |
| `npm run build` | 编译到 `dist/` |
| `npm run start` | 运行编译产物 |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:migrate` | 创建并应用迁移 |
| `npm run prisma:studio` | 打开 Prisma Studio 可视化查看 SQLite |
| `npm run db:seed` | 写入示例曲目 |
| `npm run demo:audio` | 生成**纯吉他**示例音频 `uploads/demo/demo_guitar.wav`（通用伴奏，**与你的标注无关**） |
| `npm run demo:original` | 生成**通用乐队占位** `uploads/demo/demo_original.wav`（吉他+贝斯+鼓，**自有 3.0s/小节网格，不与你的节点对齐**，仅用于验证「Original 播的是另一个文件」） |
| `npm run verify:alignment` | 校验某段 WAV 的起音是否与已发布小节标注对齐 |
| `npm run lint` | TypeScript 类型检查 |

---

## 二、环境变量 (`.env`)

```env
DATABASE_URL="file:./data/app.db"
PORT=3000
APP_URL="http://localhost:3000"

# 阿里云 OSS（留空则自动降级为本地 ./uploads 静态目录）
OSS_REGION="oss-cn-hangzhou"
OSS_BUCKET="guitar-practice"
OSS_ACCESS_KEY_ID=""
OSS_ACCESS_KEY_SECRET=""
```

---

## 三、核心接口

### 3.1 管理后台（guitarmate-studio-cms）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/scores` | 全部曲目（含分轨） |
| `POST` | `/api/scores` | 新建曲目（草稿） |
| `POST` | `/api/scores/:id/tracks` | 为曲目添加分轨 |
| `POST` | `/api/scores/:id/transcription` | **导入 SoloTrace 转录 JSON** |
| `PATCH` | `/api/scores/:id/status` | 更新发布状态 |
| `POST` | `/api/measures/publish` | **发布小节**（切片 → OSS → 相对时间 → 入库） |
| `GET` | `/api/measures/demo-audio` | 内置示例音频信息（联调用） |
| `POST` | `/api/measures/render-audio` | **按标注合成对齐示范音频**（`withBand:true` → 吉他+贝斯+鼓的原声） |
| `DELETE` | `/api/measures/score/:scoreId` | **清空该曲目已发布小节**（重新发布前清理旧数据） |

`POST /api/measures/publish` 请求体：

```json
{
  "scoreId": "cuid...",
  "trackId": "cuid...",
  "trackAudioPath": "/Users/me/guitar.wav 或 https://...",
  "channel": "guitar",
  "originalAudioPath": "uploads/demo/demo_original.wav",
  "bpm": 75,
  "timeSignature": "4/4",
  "measures": [
    {
      "index": 1,
      "label": "第 1 小节",
      "startTime": 0,
      "endTime": 3.2,
      "tabImageUrl": "",
      "notes": [
        { "id": "n_1_0", "audioTime": 0.1, "string": 1, "fret": 7,
          "pitch": 67, "duration": 0.5, "confidence": 0.92, "x": 0.03, "y": 0 }
      ],
      "barres": [
        { "instrument": "guitar", "fret": 1, "fromString": 1, "toString": 6,
          "startTime": 0.1, "duration": 1.2, "x": 0.03, "y": 0.5 }
      ],
      "chords": [
        { "instrument": "guitar", "chordName": "Bm",
          "startTime": 0, "duration": 1.6, "x": 0, "y": 0.06 }
      ]
    }
  ]
}
```

### 3.2 小程序（guitarmate-frontend）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/published/scores` | 已发布曲目列表 |
| `GET` | `/api/published/scores/:id/measures` | 小节数据（`notes` 已反序列化为数组） |

#### 双声道音源：`Simplified` / `Original`

每个小节的 `MeasureTrack` 会同时携带**两条**音频地址，供 C 端小程序顶部的
`Simplified` / `Original` 开关切换：

| 字段 | 含义 | C 端行为 |
|---|---|---|
| `audioUrl` | **练习声道**切片音频 | 选 `Simplified` 时播放（默认） |
| `channel` | 练习声道标识 | `guitar`(默认) / `guitar_lead` / `guitar_rhythm` / `bass` / `piano` / `other` |
| `originalAudioUrl` | **原声（全轨混音）** 切片音频 | 选 `Original` 时播放；为 `null` 时前端回退到 `audioUrl` |

发布时的两个可选参数：

- `channel` —— 决定 `trackAudioPath` 对应的是哪一条声部，默认 `guitar`。
  只写入 `MeasureTrack.channel`，**不会**改写已存在的 `Track.instrument`，
  避免同一条分轨被不同管理员的多次发布互相覆盖。
- `originalAudioPath` —— 原声（含鼓 / 贝斯 / 电琴等）来源。留空时自动回退到
  `Score.originalAudio`。

> 原声**不可访问时不会阻断发布**（练习声道与谱面仍然可用），只会在响应
> `warnings[]` 里说明，并把 `originalAudioUrl` 置空 —— C 端 `Original` 会自动回退到练习声道，
> 不会出现「切过去没声音」。

**联调一行命令**（把某个已发布曲目重发成双声道版本）：

```bash
node scripts/republish-dual-channel.mjs <scoreId>
```

脚本会自动：
1. 调 `POST /api/measures/render-audio`（`withBand:false`）→ 纯吉他 → **Simplified**
2. 调 `POST /api/measures/render-audio`（`withBand:true`）→ 吉他+贝斯+鼓 → **Original**
3. 按 `index` 去重、清空旧小节、用上面两个路径重新发布

> ⚠️ **不要**拿 `demo_original.wav` 当 Original 音源做对齐验证 ——
> 它是通用占位伴奏（自有 3.0s/小节、Am-F-C-G 进行），与你的标注不在同一个网格上，
> 听起来就是「吉他没有落在节点上」。要验证双声道功能请用 `render_band_<scoreId>.wav`。

### 3.3 让前端「PLAY 按钮」真正出声（重要）

前端只播放**后端返回的 `MeasureTrack.audioUrl`**。所以发布小节时填写的
`trackAudioPath` 必须是**后端能读到、且切片后能通过 HTTP 访问**的来源：

| `trackAudioPath` 取值 | 结果 |
|---|---|
| `uploads/demo/demo_guitar.wav`（**相对项目根目录，推荐**） | ✅ 自动解析为绝对路径 → ffmpeg 切片 → 返回 `http://host/uploads/measures/.../slice_xxx.mp3` |
| 服务器本地绝对路径（`D:\...\uploads\demo\demo_guitar.wav`） | ✅ 同上 |
| 公网可访问的音频 URL | ✅ 同上 |
| `http://localhost:3000/uploads/demo/demo_guitar.wav`（走后端静态目录） | ✅ 同上 |
| `https://cdn.example.com/xxx.mp3` 之类示例占位地址 | ❌ 发布前即被拦截（400） |
| 后端读不到的路径（如前端本机路径） | ❌ 发布前即被拦截（400） |

> 后端切片失败时会自动降级为「原始音频 + `#t=start,end` 时间片段」，
> 前端会自行把播放区间限制在该小节窗口内，**但前提是那个原始音频本身可访问**。

**发布前的自动校验（避免"发布成功但播不出声"）**

`POST /api/measures/publish` 在写库前会依次校验，任一失败即返回 `400` 且**不写入任何数据**：

1. `scoreId` / `trackId` 是否存在且互相匹配；
2. `trackAudioPath` 是否可读：
   - 本地路径 → 文件是否存在于**后端机器**上
   - `http(s)://` → 是否可连通（HEAD，失败回退 `Range: bytes=0-0` 的 GET，6s 超时）

失败时返回可操作的提示，例如：

```
分轨音频来源不可用，已终止发布（未写入任何数据）。
原因：音频 URL 无法连接：https://cdn.example.com/canon_guitar.mp3（fetch failed）

请把「分轨音频路径 / URL」改为下面之一后重试：
  · 后端服务器上可读取的音频文件绝对路径（推荐）
  · 公网可直接下载的音频 URL（不要使用 cdn.example.com 之类的占位地址）

如果只想先入库谱面标注（不含音频，C 端无法播放），请在请求体加上 "allowMissingAudio": true。
```

若确实只想入库谱面标注（C 端无法播放），可传 `"allowMissingAudio": true` 跳过第 2 步校验；
此时响应中的 `degradedAudioCount` / `warnings` 会标明有多少小节的音频被降级。

**重新发布前清空旧数据：** 发布接口是「追加」语义，重复发布会累积重复小节。
管理后台「发布小节至后端」弹窗底部提供**清空已发布小节**按钮（带二次确认），
等价于 `DELETE /api/measures/score/:scoreId`，会级联删除
`Barre` / `ChordMarker` / `MeasureTrack` 并清理本地 `uploads/measures/{scoreId}` 切片目录。

**一键生成可播放的示例音频：**

```bash
npm run demo:audio
# → 生成 uploads/demo/demo_guitar.wav (25s / 8 小节 @ 80 BPM，每小节 3.00s)
```
> ⚠️ 该文件是**通用伴奏**，它的节奏跟你自己的六线谱标注无关，
> 所以会出现「音频与节点对不上 / 没节点的地方也有声音」。
> 想验证音画同步请用下面的「按标注生成对齐音频」。

**⭐ 按标注生成「与节点精确对齐」的示范音频（推荐联调方式）**

管理后台「发布小节至后端」弹窗点 **「按标注生成对齐音频」**（等价于
`POST /api/measures/render-audio`）：后端读取该曲目**已发布小节**的音符标注
（弦/品/relativeTime），逐音拨响合成一段 WAV，**只有标注的时间点才有声音**。

```jsonc
// POST /api/measures/render-audio
{ "scoreId": "cmu8g2bpi0003i5aq0xw1j8hs" }
// → { "suggestedPath": "uploads/demo/render_<scoreId>.wav", "noteCount": 44, ... }
```

**⭐ 再点「按标注生成原声(加鼓/贝斯)」得到 Original 音源**

```jsonc
// POST /api/measures/render-audio  { "withBand": true }
// → { "suggestedPath": "uploads/demo/render_band_<scoreId>.wav", "beatsPerBar": 4, ... }
```

- 吉他沿用**同一批节点**，落在与 Simplified 完全相同的时刻
- 贝斯跟随该拍最近的吉他音符（低一个八度）
- 鼓点网格 **由小节窗口推导**：`beatSec = 小节时长 / beatsPerBar`（`beatsPerBar` 默认取
  `timeSignature` 分子）—— 不读 DB 的 `bpm` 字段，因此即使 bpm 元数据与实际标注网格不一致，
  鼓/贝斯也会与节点同拍
- 结果：`Original` 听起来比 `Simplified` 丰满（多了低音与鼓），**且每个吉他音仍在节点上**

生成后可校验对齐度：

```bash
npm run verify:alignment -- uploads/demo/render_<scoreId>.wav
# ① 起音命中标注 ≈ 100%（实测偏差 ±7ms）
# ② 无标注处的多余起音 = 0
```

> 拿 `render_band_*.wav` 去跑该脚本的话，② 会报出若干「多余起音」——
> 那是贝斯/鼓正常发声，不是失准；脚本的判据是「除了标注不说话」，只适用于纯吉他轨。

生成的路径会自动填入弹窗，直接「确认发布」即可得到与节点完全对齐的小节音频。

> 路径解析规则见 `AudioService.resolveInput()`：依次尝试 `http(s)` → 绝对路径 →
> 相对项目根目录 → 相对 `uploads/`，因此 **不需要** 写死机器相关的绝对路径。

---

## 四、Mac 工作站转录流程（手动）

```bash
# 1. 音频分离（6 轨：vocals / drums / bass / guitar / piano / other）
pip install demucs
python -m demucs -n htdemucs_6s -d cpu -o ./output song.mp3

# 2. 吉他轨 → 六线谱 JSON
#    打开 SoloTrace 桌面应用 → 导入 guitar.wav → 校对低置信度音符
#    → Beat Map 校正 BPM/拍号 → File → Export → JSON

# 3. 贝斯轨转录（可选）
pip install basic-pitch
python -c "from basic_pitch.inference import predict_and_save; \
  predict_and_save(['bass.wav'], './output', save_midi=True)"
```

把导出的 JSON 通过管理后台 `导入转录 JSON` 按钮（或直接调用
`POST /api/scores/:id/transcription`）导入，然后完成横按 / 和弦标注、
小节切分，最后「发布小节至后端」。

### `htdemucs_6s` 输出目录约定

```
output/htdemucs_6s/<song_name>/
├── vocals.wav
├── drums.wav
├── bass.wav
├── guitar.wav
├── piano.wav
└── other.wav
```

---

## 五、Docker 部署

```bash
# 仓库根目录（guitarmate-audio-backend/）
docker compose up -d --build

# 查看日志
docker compose logs -f backend
```

`docker-compose.yml` 会挂载：

- `./data` → `/app/data`（**SQLite 单文件持久化**）
- `./uploads` → `/app/uploads`（本地音频切片与谱图回退目录）

容器启动时自动执行 `prisma migrate deploy`（无迁移文件时回退 `prisma db push`）。

---

## 六、备份 SQLite

整个数据库就是一个文件，**直接复制即为完整备份**：

```bash
# macOS / Linux
cp data/app.db backups/app-$(date +%Y%m%d).db

# Windows PowerShell
Copy-Item data\app.db "backups\app-$(Get-Date -Format yyyyMMdd).db"
```

恢复时把备份文件覆盖回 `data/app.db` 并重启服务即可。
未来数据量增大，只需把 `datasource.provider` 从 `sqlite` 改为 `postgresql`
并迁移数据，业务代码无需改动。

---

## 七、常见问题

**Q1. 启动报错 `database file does not exist` / 表不存在？**
执行 `npx prisma db push`（或 `npx prisma migrate dev --name init`）创建表结构。

**Q2. 发布小节时提示音频切片失败？**
检查 `trackAudioPath` 是否为后端**可访问**的本地路径或 URL；`ffmpeg-static`
未下载成功时容器内会使用系统 ffmpeg（Dockerfile 已安装）。切片失败时后端会
自动降级为该音频 URL + `#t=start,end` 片段引用，不阻塞入库。

> 若日志出现 `FFmpeg slice error: Error opening input file https://cdn.example.com/...`
> 说明音频来源本身不可访问（`cdn.example.com` 是示例占位域名）。
> 现在这种情况会在发布前被第 0 步校验直接拦截并返回 400，不会再写入脏数据。

**Q3. OSS 上传报错？**
`.env` 中 OSS 凭证留空时，服务会自动把切片写入本地 `uploads/` 并通过
`APP_URL/uploads/...` 提供访问，方便本地联调。

**Q4. 小程序拉取不到数据？**
只有 `status = "published"` 的曲目才会出现在 `/api/published/scores`。
发布小节后请在管理后台把曲目状态改为已发布。

**Q5. 小程序里点击 PLAY 没反应 / 提示「音频加载失败」？**
说明该小节的 `audioUrl` 无法访问。常见原因是发布时用了
`https://cdn.example.com/...` 这类示例占位地址，或填了后端读取不到的本地路径。
按 §3.3 用 `npm run demo:audio` 生成示例音频、并把它的绝对路径填入
「分轨音频路径 / URL」重新发布即可。
前端现在会显示具体失败的 URL，并提供「重试播放」按钮，不会再出现"点了没反应"。

**Q5. SQLite 写入出现 `database is locked`？**
SQLite 为单写者模型。本场景写入仅来自管理后台，单进程部署即可；
高并发场景可在 `DATABASE_URL` 追加 `?connection_limit=1`。

**Q6. `Barre.toString` 与 `Object.prototype.toString` 冲突？**
控制器已做 `toString` / `endString` / `fromString` 三重兼容解析，
前端只需传数值即可。

---

## 八、目录结构

```
guitarmate-audio-backend/
├── prisma/
│   ├── schema.prisma        # 6 个模型：Score / Track / Measure / MeasureTrack / Barre / ChordMarker
│   └── seed.ts
├── data/app.db              # SQLite 数据库文件
├── uploads/                 # 本地开发音频/谱图/转录 JSON 回退目录
├── src/
│   ├── audio/               # ffmpeg 切片服务
│   ├── oss/                 # 阿里云 OSS 上传服务
│   ├── scores/              # 曲目 / 分轨 / 转录导入
│   ├── measures/            # 小节发布
│   ├── published/           # 小程序接口
│   ├── prisma/              # PrismaModule / PrismaService
│   └── shared/types.ts      # 前后端共享类型
├── Dockerfile
└── docker-compose.yml
```
