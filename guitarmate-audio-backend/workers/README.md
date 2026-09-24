# Python Workers —— 音频转录三阶段

被 Node 侧 `src/transcription/transcribe.service.ts` 通过 `child_process` 调用，
**没有任何 RPC / 消息队列协议**，只有一条极简契约：

```
输入：命令行参数（--input / --output / --instrument …）
日志：stderr（人类可读）
结果：stdout 的最后一行 —— GUITARMATE_RESULT {"ok":true,...}
```

失败时也会输出 `{"ok":false,"message":"..."}` 并以退出码 1 结束 ——
这样后端可以把「缺哪个包、怎么装」原样透传到 CMS，而不是只报一句 `command failed`。

---

## 文件一览

| 文件 | 阶段 | 作用 | 依赖 |
|---|---|---|---|
| `common.py` | — | 结果协议 / 指法分配 / 零依赖 SMF 解析 / TabProject 组装 | 无 |
| `separate.py` | ① 分离 | Demucs `htdemucs_6s` 把混音拆成 6 条 stem | `demucs`, `torch` |
| `transcribe.py` | ② 转录 | Basic Pitch 音频 → MIDI + 音符事件（含置信度） | `basic-pitch` |
| `midi_to_tab.py` | ③ 转谱 | MIDI → 六线谱 TabProject（内置 Tayuya 兼容转换器） | **无（纯标准库）** |

---

## 安装

```bash
# 档位 A：完整真实转录（含 PyTorch，约 2GB）
python -m pip install -r workers/requirements.txt

# 档位 B：最小可用（只做分离；转谱本身零依赖）
python -m pip install torch demucs
```

Windows 上如果 `python3` 不在 PATH，请设置 `PYTHON_BIN`：

```powershell
$env:PYTHON_BIN = "C:\Python311\python.exe"
```

---

## 手动调用示例

```bash
# ① 分离
python workers/separate.py \
  --input  uploads/transcriptions/<id>/source.wav \
  --output uploads/transcriptions/<id>/stems \
  --model  htdemucs_6s --stems guitar,bass,piano

# ② 转录（Basic Pitch）
python workers/transcribe.py \
  --input  uploads/transcriptions/<id>/stems/guitar.wav \
  --output uploads/transcriptions/<id>/midi/guitar.mid \
  --instrument guitar --tuning 64,59,55,50,45,40 --capo 0

# ③ 转谱（零依赖）
python workers/midi_to_tab.py \
  --input  uploads/transcriptions/<id>/midi/guitar.mid \
  --output uploads/transcriptions/<id>/tab/guitar.json \
  --instrument guitar --bpm 96 --title "Canon in D"
```

---

## 关键约定（务必与 Node / CMS / 小程序保持一致）

| 量 | 公式 |
|---|---|
| `midi` | `空弦音高 + fret + capo` |
| `string` | `1` = 最细的高音 E 弦（一弦），`6` = 最粗的低音 E 弦 |
| `tuning` | 6 个 MIDI 音高，**索引 0 = 一弦** |
| `offsetSec` | 音符相对**小节起点**的秒数 |
| `beat` | `offsetSec / (60 / bpm)` |
| 小节时长 | `拍数 × (60 / bpm) × (4 / 拍号分母)` —— **绝不硬编码 2.4s** |

导出坐标（由 Node 侧 `projectToPublishMeasures` 统一计算）：
`x = offsetSec / 小节时长`，`y = (string - 1) / 5`。

---

## htdemucs_6s 的 sources 顺序（易错点）

```
drums, bass, other, vocals, guitar, piano
```

`other` 在 `vocals` **之前**。顺序写错会导致「吉他轨里其实是鼓声」这类很难排查的问题 ——
`separate.py` 直接用 `model.sources` 而不是硬编码顺序来规避这个坑。

---

## 关于 Tayuya

Tayuya 是第三方 MIDI → 六线谱工具，输出格式随版本变化较大。
`midi_to_tab.py` 的处理策略：

1. 设置了 `--tayuya-bin` / `TAYUYA_BIN` → 调用外部 Tayuya，并要求它写出 **TabProject 结构**的 JSON；
2. 否则使用**内置转换器**（纯标准库）：
   - 解析 SMF（Type 0/1，支持 tempo 变化与变速 meta）；
   - 起点按 `1/8` 网格量化（`--no-quantize` 可关）；
   - 「最低把位优先」分配弦号/品位，超出音域时夹取到极限品位（宁失真不丢音）；
   - 等分小节后组装标准 TabProject。

两条路径的输出都通过 `projectToPublishMeasures` 进入发布流程，
因此对下游（CMS / PracticePackage / 小程序）完全透明。

---

## 整机没有 Python 时怎么办？

后端 `PythonRunnerService.probe()` 会检测能力，任一缺失且
`TRANSCRIBE_SIMULATE=true`（默认）时，`TranscribeService` 会走
`TranscriptionSimulationService`：

| 真实阶段 | 模拟产物 |
|---|---|
| Demucs 分离 | 源音频直接登记为 `guitar` 分轨 |
| Basic Pitch | 按节拍网格生成练习音符 + **真实可用的 SMF MIDI 文件**（刻意混入低置信度音符，用于验证 ReviewPage 标红） |
| Tayuya | 内置装配器直接产出结构合法的 TabProject |

产物一律带 `simulated` 标记与 `warn` warning，`provenance.humanReviewLevel` 很低，
不会被误当成真实转录结果上线。这样「上传 → 队列 → 复核 → 发布 → PracticePackage」
在**任何机器**上都能端到端验证。
