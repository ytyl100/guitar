# 外部六线谱 → 统一 JSON → 小程序：完整实施方案

> 解决的核心问题：网上拿到的谱子是**人工制谱的各种格式**（ASCII tab / MusicXML / Guitar Pro / 和弦表 /
> 转录 JSON），本项目需要把它们统一成「可发布到小程序的六线谱 JSON」。
>
> 本文档对应代码：`guitarmate-audio-backend/src/tab-import/`、`guitarmate-audio-backend/src/published/`、
> `guitarmate-frontend/src/practicePackage.ts`、`guitarmate-studio-cms/src/components/studios/TabImportStudio.tsx`

---

## 一、结论先行：数据源的现实

| 你的疑问 | 现实答案 |
|---|---|
| 有「Hotel California 节奏吉他 + SoloTrace 风格六线谱 JSON」这种公开数据集吗？ | **没有。** 不存在公开的、模型产出的名曲级六线谱 JSON 语料 |
| 能搜到的是什么？ | 全是**人工制谱**：ASCII tab（UG/GuitarTabs）、Guitar Pro 文件、Songsterr 私有格式、少量 MusicXML |
| 人工谱 vs AI 转录，用哪个？ | **人工 tab 做 ground truth，Demucs + Basic Pitch 做自动草稿**，再用统一格式缝合 |
| 能直接抓 UG/Songsterr 的吗？ | ❌ 不能。ToS 禁止抓取 + 流行曲目仍在版权保护期 |
| 怎么才能上线？ | 只有三条合规路线：**公有领域** / **官方授权渠道** / **自有编配** |

---

## 二、支持的格式与「节奏精度」矩阵

`GET /api/tab-import/formats` 会实时返回这张表。

| 格式 | 扩展名 | 节奏精度 | 说明 |
|---|---|---|---|
| Guitar Pro `.gpx` | `.gpx` | **时值精确** | ZIP + `Content/score.gpif`（XML），含调弦 / 变调夹 / 时值 / 技巧 |
| MusicXML | `.musicxml` `.xml` | **时值精确** | MuseScore / OpenScore / 版权方官方导出 |
| TabProject | `.json` | **时值精确** | 本平台统一中间格式，可反复编辑与回灌 |
| 转录 JSON | `.json` | **时值精确** | SoloTrace / Basic Pitch，与音频时间轴对齐，指法需复核 |
| ASCII 六线谱 | `.txt` `.tab` | ⚠️ **节奏近似** | 无时值信息，按列位置线性映射到拍网格 |
| 和弦表 + 扫弦 | `.txt` `.chords` | ⚠️ **节奏合成** | 和弦名 + 把位 + 扫弦模式自动展开成音符 |
| Guitar Pro `.gp3/.gp4/.gp5` | 二进制 | — | ❌ 不逆向，需先转 MusicXML（接口会返回转换指令） |

> **为什么要区分精度**：ASCII 谱的节奏是「猜」出来的，必须让教研老师在后台核对后才能发布；
> 这个警告会写进 `warnings`（`code=ascii-rhythm-approximate`）并在 CMS 上高亮显示。

---

## 三、统一中间格式：TabProject

```
ASCII tab ─┐
MusicXML  ─┤
Guitar Pro─┼─► [ parser ] ─► TabProject ─► PublishReadyMeasure[] ─► POST /api/measures/publish ─► 小程序
和弦表     ─┤                (统一中间格式)      (弦/品/MIDI + 绝对秒)
SoloTrace ─┘
```

关键约定（与 CMS / C 端完全一致）：

| 字段 | 约定 |
|---|---|
| `string` | 1 = 最细的高音 E 弦（一弦），6 = 最粗的低音 E 弦 |
| `midi` | 标准 MIDI 音高，`midi = 空弦音高 + fret + capo` |
| `tuning` | 6 元素 MIDI 数组，**索引 0 = 一弦**；默认标准调弦 EADGBE |
| `offsetSec` / `beat` | 小节内偏移秒数 / 小节内拍位置（0 起） |
| 和弦 `frets` | 6 元素，**索引 0 = 六弦（低音 E）**，`'x'` = 闷弦 |
| `finger` | 左手指法：0 = 空弦，1 = 食指，2 = 中指，3 = 无名指，4 = 小指 |
| `position` | **音符级手位**：`P` = 此时食指按第 P 品，公式 `finger = fret - P + 1`。与小节把位不同 = **小节内换把**（谱面会在该处多印一个小号「N把位」） |
| 小节 `position` | 小节**起始手位**（= 该小节最早那个已标注音符的手位）——谱面左上角那个数字 |
| 导出坐标 | `x = offsetSec / 小节时长`，`y = (string - 1) / 5`（0-1，一弦在上） |

**左手指法 / 把位**（`src/tab-import/fingering.ts`）：

- MusicXML 的 `<technical><fingering>` 会被解析并**保留**（真实指法不被启发式覆盖）；
- ASCII tab / 和弦表 / 转录 JSON 这类无指法信息的源，按「分帧 → **逐帧定手位** → 分手指」推定，
  并写入 `warnings`（`fingering-derived` / `fingering-clamped` / `fingering-position-shift`）；
- ⚠️ **为什么是逐帧而不是整小节一个手位**：谱面上的数字是**手指号**，品位靠
  `fret = position + finger − 1` 反推。真实 solo 一小节常跨 5 品以上，单一手位会让大量音符
  被迫夹到手指范围上，数字就再也反推不出品位；现在换把处会多印一个小号「N把位」。
- 推定结果可在 CMS 复核工作台逐音符改写，最终随 `PracticeNote.finger` / `PracticeNote.position`
  / `PracticeMeasure.position` 下发到小程序（详见 `TRANSCRIPTION_PIPELINE.md` §六）。

小节时长由 `BPM + 拍号` 推导：`拍数 × (60 / bpm) × (4 / 拍号分母)`
（**不硬编码 2.4s** —— 那正是旧的「音频与节点不一致」问题根源）。

---

## 四、端到端流程

```
① GET  /api/tab-import/sources        ← 先看清「从哪里拿谱子」与版权边界
② POST /api/tab-import/parse          ← 任意格式 → TabProject + 发布就绪小节（预览，不落库）
③ 人工复核（ASCII 回显 / 近似节奏提示 / 低置信度音符）
④ POST /api/tab-import/save           ← 落到曲目工程（自动建 Score/Track + 写入调性/变调夹/调弦/授权）
⑤ 补音频 → POST /api/measures/publish → GET /api/published/scores/:id/package → 小程序
```

### 音频的三种情况

| 情况 | 做法 | C 端表现 |
|---|---|---|
| 有分轨音频 | 填 `trackAudioPath`（绝对路径或公网 URL）→ ffmpeg 切片 → OSS/CDN | 正常播放 + 节点高亮 |
| **没有音频**（纯 tab） | `allowMissingAudio: true` + `audioFallback: 'metronome'` | 后端为**每个小节合成节拍器占位音频**（纯 Node WAV，无需 ffmpeg），照样能播、能高亮、能循环 |
| 想听与标注精确对齐的音频 | 先发布一次 → `POST /api/measures/render-audio`（`withBand=true` 加鼓/贝斯）→ 把它填回音频路径重新发布 | 吉他与节点毫秒级对齐 |

> ⚠️ **发布是 append-only**：重新发布会重复追加小节。CMS 的发布按钮会先自动清空旧小节。

---

## 五、C 端唯一数据契约：PracticePackage

```
GET /api/published/scores/:id/package
```

- `schemaVersion: '1.0'`（版本白名单校验，不在名单内提示用户升级小程序）
- `score` / `tracks` / `measures` / `assets` / `provenance`
- **不含音频二进制**：只有 `audioUrl` / `originalAudioUrl`（CDN URL）+ 时间戳
- `metronome` **始终下发**（`enabled: !audioUrl`）→ 音频 404 时客户端可即时降级，不会「点了没声音」
- 小节按 `index` 升序、音符按 `relativeTime` 升序；`x` / `y` 缺失时服务端兜底推算

小程序端消费层（`guitarmate-frontend/src/`）：

| 文件 | 作用 |
|---|---|
| `practicePackage.ts` | 契约类型 + **零依赖校验器** + 旧接口归一化兼容层 + `#t=` 媒体片段解析 |
| `services/api.ts#fetchPracticePackage` | 先打 `/package`，404 时回退旧 `/measures` 再归一化 |
| `hooks/useAudioClock.ts` | 音频时钟（rAF 插值 / `#t=` 窗口裁剪 / 出错回调） |
| `hooks/useMetronomeClock.ts` | 节拍器时钟（Web Audio 前瞻调度，无音频资源依赖） |
| `hooks/usePracticeClock.ts` | **时间源选择器**：有音频用音频、没音频或音频坏掉自动切节拍器 |
| `components/PracticeMeasure.tsx` | 小节渲染器：图片模式（竖条固定 33.33%）/ 矢量模式（600×142） |

---

## 六、合规与版权闸门

`GET /api/tab-import/sources` 返回 4 个等级的数据源目录；`GET /api/tab-import/copyright?title=xxx`
按曲名给出判定。导入时若命中已知版权曲目（`hotel california` / `stairway to heaven` / …），
会直接写入 `warnings` 并在 CMS 红色高亮，`copyright.publishable=false`。

授权状态会落库到 `Score.license`，最终出现在 C 端契约的 `provenance.license`
（`public_domain` / `cc_by` / `authorized` / `user_uploaded`）。

---

## 七、命令与接口速查

### 后端

```bash
npm run build                                  # nest build
node dist/main.js                              # 启动（:3000，Swagger /docs）
npm run tab:verify                             # 解析器回归测试（4 个内置示例）
npm run tab:import -- <file> [--format x] [--print|--out y]
npm run tab:import -- --sample ascii-study     # 直接跑内置示例
npm run tab:gpx-fixture                        # 生成 .gpx 测试样本
node scripts/e2e-tab-pipeline.mjs              # 端到端：解析→入库→发布→C 端契约
node scripts/verify-practice-package.mjs       # 契约校验 + 音频可达性
node scripts/verify-score-metadata.mjs         # 曲目元数据往返（非破坏性，自动还原）
```

### CMS / 小程序

```bash
cd guitarmate-studio-cms && npm run dev        # 后台：侧边栏「六线谱导入工作台」
cd guitarmate-frontend  && npm run verify:contract   # 小程序端消费层验证
```

### 内置示例（自有编配 / 公有领域，可安全用于演示）

| id | 格式 | 演示什么 |
|---|---|---|
| `ascii-study` | ascii-tab | 8 小节 Am–C–G–Am / F–G–Am–E7，列位置 → 拍网格的近似映射 |
| `chord-sheet-demo` | chord-sheet | 和弦名 + 把位 + 扫弦模式 → 真实六线谱音符（16 小节 / 450 音符） |
| `musicxml-demo` | musicxml | divisions / 调弦 / `<technical>` 指位 / `harmony` 和弦标记 |
| `transcription-demo` | solo-trace | 带 `audioTime` + `confidence` 的转录草稿链路 |

---

## 八、已知限制（诚实清单）

1. **ASCII 谱的节奏是近似值** —— 结构与源文件无关，这是格式本身的限制；须人工核对后再发布。
2. **`.gp3/.gp4/.gp5` 不解析** —— 私有二进制，改用 MuseScore / TuxGuitar / alphaTab 转 MusicXML。
3. **GPX 解析为「尽力而为」** —— 已覆盖调弦 / 变调夹 / 时值 / 常见技巧；用真实文件导入后请在后台复核。
4. **和弦表把位来自内置库 + 移动式模板** —— 未收录的和弦会用横按模板生成，需人工确认好不好听。
5. **`provenance.source` 的判定较粗** —— 目前按 `Track.jsonUrl` 是否来自 `transcriptions/` 区分
   `solotrace` 与 `manual`；导入流水线统一后会改为按谱面来源写入。
6. **契约里 `assets.audioFormat` 默认 `mp3`** —— 切片 URL 常无扩展名；`AudioService` 实际用 ffmpeg 输出 `.mp3`。
7. **`difficulty` 默认启发式推导** —— 可在 CMS 的元数据表单里人工覆盖。
8. **列表里只有当前小节跑真实时钟** —— 其余小节用静态空闲时钟 + `progressOverride`，
   避免为每个小节创建一个 `HTMLAudioElement`（几十个音频请求）。
