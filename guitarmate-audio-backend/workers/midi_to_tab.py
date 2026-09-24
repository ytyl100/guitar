#!/usr/bin/env python3
"""
midi_to_tab.py —— MIDI → 六线谱 TabProject（Tayuya 阶段）
=====================================================

用法（由 Node 侧 `TranscribeService` 调用）：

```bash
python workers/midi_to_tab.py \
  --input  uploads/transcriptions/<id>/midi/guitar.mid \
  --output uploads/transcriptions/<id>/tab/guitar.json \
  --instrument guitar --bpm 96 --time-signature 4/4 --capo 0 \
  --tuning 64,59,55,50,45,40 --title "Canon in D"
```

输出（stdout 最后一行）：

```
GUITARMATE_RESULT {"ok":true,"instrument":"guitar","tabProjectPath":"...","tabProject":{...},
                   "measureCount":12,"noteCount":180,"bpm":96,"timeSignature":"4/4",
                   "tuning":[64,59,55,50,45,40],"warnings":[...]}
```

关于「Tayuya」
-------------
Tayuya（MIDI → 吉他六线谱）本身是一个独立的第三方工具，输出格式随版本差异很大。
为了**不引入不可控的解析逻辑**，这里的策略是：

1. 若设置了 `--tayuya-bin` / `TAYUYA_BIN`：调用外部 Tayuya，并期望它写出一个
   结构等于 `TabProject` 的 JSON（本平台统一中间格式）；解析失败则自动回退；
2. 否则使用**内置转换器**（本文件，纯标准库）：
   - 解析 SMF（Type 0/1，支持变速 tempo meta）→ 绝对秒音符；
   - 按 1/8 网格量化起点（可 `--no-quantize` 关闭）；
   - 用「最低把位优先」分配弦号/品位（`midi = 空弦 + fret + capo`）；
   - 按 `小节时长 = 拍数 × (60/bpm) × (4/拍号分母)` 等分小节；
   - 组装成 **标准 TabProject** —— 下游可直接复用
     `projectToPublishMeasures`（Node 侧）得到 `x = offsetSec/小节时长`、`y = (string-1)/5`。

因此本脚本**零 pip 依赖**，即使整机没有任何 Python 包也能产出可发布的六线谱结构。
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    assign_fingering,
    build_tab_project,
    fail,
    log,
    parse_midi,
    parse_tuning_arg,
    require_file,
    round4,
    succeed,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MIDI → 六线谱 TabProject（GuitarMate）")
    parser.add_argument("--input", required=True, help="输入 MIDI（.mid）")
    parser.add_argument("--output", required=True, help="输出 TabProject JSON 路径")
    parser.add_argument("--instrument", default="guitar", help="guitar / bass / piano / other")
    parser.add_argument("--bpm", type=float, default=0.0, help="目标 BPM（0 = 用 MIDI 内的 tempo）")
    parser.add_argument("--time-signature", default="4/4", help="拍号（默认 4/4）")
    parser.add_argument("--capo", type=int, default=0, help="变调夹品位")
    parser.add_argument("--tuning", default=None, help="调弦 MIDI 数组（索引 0 = 一弦）")
    parser.add_argument("--title", default="转录草稿", help="曲名")
    parser.add_argument("--artist", default=None, help="艺术家")
    parser.add_argument("--quantize", dest="quantize", action="store_true", default=True, help="按网格量化起点（默认开启）")
    parser.add_argument("--no-quantize", dest="quantize", action="store_false", help="关闭量化")
    parser.add_argument("--grid", default="1/8", help="量化网格：1/4 | 1/8 | 1/16 | 1/32（默认 1/8）")
    parser.add_argument("--tayuya-bin", default=os.environ.get("TAYUYA_BIN"), help="外部 Tayuya 可执行文件（可选）")
    return parser.parse_args()


# 每个 1/4 拍里包含多少个该网格单位（即分母 / 4）：1/8 → 2、1/16 → 4
GRID_DIVISIONS = {"1/4": 1, "1/8": 2, "1/16": 4, "1/32": 8}


def grid_seconds(beat_sec: float, spec: str) -> float:
    """网格单位时长（秒）。

    ⚠️ 历史 bug：之前写成 `beat_sec * (4 / divisions)`，而 `divisions` 是
    「分母 / 4」（1/8 → 2），结果 `4/2 = 2` 拍到一拍 → **网格比实际粗了 4 倍**。
    例：96 BPM 下的「1/8 网格」被当成 1.25s，四个八分音符全挤进同一格，
    再去重就只剩一个音（实测 63 个音只剩 25 个）。

    正确口径：`网格 = 一拍 × 4 / 分母`，即 1/8 → beat/2、1/16 → beat/4。
    """
    return beat_sec / GRID_DIVISIONS.get(spec, 2)


def main() -> None:
    args = parse_args()
    source = require_file(args.input, "输入 MIDI")
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    tuning = parse_tuning_arg(args.tuning, args.instrument)
    warnings: List[Dict[str, Any]] = []

    # ── ① 优先尝试外部 Tayuya（若提供）──
    external = _try_external_tayuya(args, source, output_path, tuning, warnings)
    if external is not None:
        succeed(**external)
        return

    # ── ② 内置转换器 ──
    try:
        document = parse_midi(source, default_bpm=args.bpm or 120.0)
    except Exception as exc:
        fail(f"解析 MIDI 失败：{type(exc).__name__}: {exc}")

    bpm = float(args.bpm) if args.bpm and args.bpm > 0 else float(document.bpm or 120.0)
    time_signature = args.time_signature or document.time_signature or "4/4"
    log(
        f"解析完成：{len(document.notes)} 个 MIDI 音符，BPM={round(bpm, 2)}，拍号={time_signature}"
        f"（MIDI 内 tempo 给出 {document.bpm}）"
    )

    if document.notes and document.bpm and abs(document.bpm - bpm) > 0.5 and not args.bpm:
        bpm = round(bpm, 3)

    beat_sec = 60.0 / (bpm if bpm > 0 else 120.0)
    grid_sec = grid_seconds(beat_sec, args.grid)

    notes: List[Dict[str, Any]] = []
    for index, note in enumerate(document.notes):
        start_sec = note.start_sec
        if args.quantize and grid_sec > 0:
            start_sec = round(start_sec / grid_sec) * grid_sec
        fingering = assign_fingering(note.pitch, tuning, args.capo)
        notes.append(
            {
                "startSec": round4(max(0.0, start_sec)),
                "durationSec": round4(max(0.05, note.duration_sec)),
                "string": fingering.string,
                "fret": fingering.fret,
                "midi": int(note.pitch),
                "velocity": int(note.velocity),
                # 转录置信度由上游 transcribe.py 提供；这里没有额外信息，按力度近似
                "confidence": round4(min(1.0, max(0.0, note.velocity / 127.0))),
                "technique": "normal",
                "id": f"tayuya_{index}",
            }
        )

    if not notes:
        warnings.append(
            {
                "level": "warn",
                "code": "empty-midi",
                "message": "MIDI 里没有任何音符，生成的六线谱将为空。请检查 Basic Pitch 的阈值设置。",
            }
        )

    if args.quantize:
        warnings.append(
            {
                "level": "info",
                "code": "rhythm-quantized",
                "message": f"音符起点已量化到 {args.grid} 网格（可用 --no-quantize 关闭）。",
            }
        )

    # 量化可能把不同音符叠到同一时刻 → 按 (时间, 弦号) 去重，避免 C 端出现「同弦同刻双音」
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for note in sorted(notes, key=lambda n: (n["startSec"], n["string"])):
        key = (note["startSec"], note["string"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(note)

    project = build_tab_project(
        instrument=args.instrument,
        tuning=tuning,
        capo=args.capo,
        bpm=bpm,
        time_signature=time_signature,
        notes=deduped,
        title=args.title,
        artist=args.artist,
        warnings=warnings,
        source_kind="solo-trace",
        source_site="GuitarMate 转录流水线",
        source_detail=f"basic-pitch MIDI → 内置 Tayuya 兼容转换器（网格 {args.grid}，capo {args.capo}）",
    )

    try:
        output_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        fail(f"写出 TabProject 失败：{exc}")

    log(
        f"完成：{project['stats']['measureCount']} 小节 / {project['stats']['noteCount']} 音符 → {output_path}"
    )

    succeed(
        instrument=args.instrument,
        tabProjectPath=str(output_path),
        tabProject=project,
        measureCount=project["stats"]["measureCount"],
        noteCount=project["stats"]["noteCount"],
        bpm=round(bpm, 3),
        timeSignature=time_signature,
        tuning=tuning,
        warnings=[w["message"] for w in warnings],
    )


def _try_external_tayuya(
    args: argparse.Namespace,
    source: Path,
    output_path: Path,
    tuning: List[int],
    warnings: List[Dict[str, Any]],
) -> Dict[str, Any] | None:
    """
    可选：调用外部 Tayuya 实现（`--tayuya-bin` / `TAYUYA_BIN`）。
    约定它把 TabProject 结构的 JSON 写到 `--output`；否则回退到内置转换器。
    """
    binary = args.tayuya_bin
    if not binary:
        return None

    log(f"检测到外部 Tayuya：{binary}，尝试调用…")
    command = [binary, "--input", str(source), "--output", str(output_path), "--tuning", ",".join(map(str, tuning))]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=600)
    except Exception as exc:
        log(f"调用外部 Tayuya 失败（{exc}），回退到内置转换器")
        warnings.append(
            {"level": "warn", "code": "tayuya-external-failed", "message": f"外部 Tayuya 调用失败：{exc}"}
        )
        return None

    if completed.returncode != 0 or not output_path.exists():
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()[-3:]
        log(f"外部 Tayuya 返回码 {completed.returncode}，回退到内置转换器：{' | '.join(detail)}")
        warnings.append(
            {
                "level": "warn",
                "code": "tayuya-external-failed",
                "message": f"外部 Tayuya 未产出结果（rc={completed.returncode}）：{' | '.join(detail)}",
            }
        )
        return None

    try:
        project = json.loads(output_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log(f"外部 Tayuya 输出不是合法 JSON（{exc}），回退到内置转换器")
        return None

    if project.get("format") != "guitarmate-tab-project":
        log("外部 Tayuya 输出不是 TabProject 结构，回退到内置转换器")
        return None

    log("外部 Tayuya 产出的 TabProject 校验通过")
    return {
        "instrument": args.instrument,
        "tabProjectPath": str(output_path),
        "tabProject": project,
        "measureCount": project.get("stats", {}).get("measureCount", 0),
        "noteCount": project.get("stats", {}).get("noteCount", 0),
        "bpm": project.get("meta", {}).get("bpm", args.bpm or 120),
        "timeSignature": project.get("meta", {}).get("timeSignature", args.time_signature),
        "tuning": project.get("tuning", tuning),
        "warnings": ["外部 Tayuya 转谱"],
    }


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover
        fail(f"midi_to_tab.py 未捕获异常：{type(exc).__name__}: {exc}")
