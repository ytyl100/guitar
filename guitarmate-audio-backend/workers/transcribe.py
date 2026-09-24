#!/usr/bin/env python3
"""
transcribe.py —— Basic Pitch 音频 → MIDI + 音符事件
================================================

用法（由 Node 侧 `TranscribeService` 调用）：

```bash
python workers/transcribe.py \
  --input  uploads/transcriptions/<id>/stems/guitar.wav \
  --output uploads/transcriptions/<id>/midi/guitar.mid \
  --instrument guitar \
  --tuning 64,59,55,50,45,40 \
  --capo 0 \
  --onset-threshold 0.5 --frame-threshold 0.3
```

输出（stdout 最后一行）：

```
GUITARMATE_RESULT {"ok":true,"instrument":"guitar","midiPath":"...","noteCount":123,
                   "confidenceAvg":0.78,"lowConfidenceCount":24,"bpm":96,"notes":[...]}
```

`confidence` 取 Basic Pitch 的音符**振幅**（0-1），是 ReviewPage「低置信度标红」的依据。

安装：
```bash
pip install -U basic-pitch      # 依赖 tensorflow / librosa / pretty_midi
```
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    STANDARD_TUNING,
    assign_fingering,
    fail,
    log,
    measure_duration_sec,
    module_available,
    parse_tuning_arg,
    require_file,
    round4,
    succeed,
)

# 乐器音域（用于过滤泛音/噪声产生的离谱音高）
PITCH_RANGES = {
    "guitar": (40, 88),   # E2 - E6
    "bass": (28, 67),     # E1 - G4
    "piano": (21, 108),   # A0 - C8
    "other": (21, 108),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Basic Pitch 音频转录（GuitarMate）")
    parser.add_argument("--input", required=True, help="输入分轨音频")
    parser.add_argument("--output", required=True, help="输出 MIDI 路径（.mid）")
    parser.add_argument("--instrument", default="guitar", help="guitar / bass / piano / other")
    parser.add_argument("--tuning", default=None, help="调弦 MIDI 数组（索引 0 = 一弦）")
    parser.add_argument("--capo", type=int, default=0, help="变调夹品位")
    parser.add_argument("--bpm", type=float, default=0.0, help="已知 BPM（0 = 由 librosa 估计）")
    parser.add_argument("--onset-threshold", type=float, default=0.5, help="音符起始阈值（越低越灵敏）")
    parser.add_argument("--frame-threshold", type=float, default=0.3, help="帧激活阈值")
    parser.add_argument("--min-note-length-ms", type=int, default=58, help="最短音符（毫秒）")
    parser.add_argument("--multiple-pitch-bends", action="store_true", help="允许多个 pitch bend（更慢）")
    parser.add_argument("--melodia-trick", action="store_true", help="启用 Basic Pitch 的 melodia 后处理")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = require_file(args.input, "输入音频")
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not module_available("basic_pitch"):
        fail(
            "未安装 basic-pitch。安装：pip install -U basic-pitch\n"
            "（依赖 TensorFlow；若只想要六线谱草稿，可保持 TRANSCRIBE_SIMULATE=true 走模拟模式）"
        )
    if not module_available("pretty_midi"):
        fail("未安装 pretty_midi（basic-pitch 的依赖）。安装：pip install -U pretty_midi")

    try:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import predict
    except Exception as exc:
        fail(f"导入 basic_pitch 失败：{exc}")

    tuning = args.tuning and parse_tuning_arg(args.tuning, args.instrument) or parse_tuning_arg(None, args.instrument)
    min_pitch, max_pitch = PITCH_RANGES.get(args.instrument, PITCH_RANGES["other"])

    log(
        f"Basic Pitch 转录：{source}\n"
        f"  instrument={args.instrument} 调弦={tuning} capo={args.capo}\n"
        f"  onset={args.onset_threshold} frame={args.frame_threshold} 最短音符={args.min_note_length_ms}ms"
    )

    try:
        _model_output, midi_data, note_events = predict(
            str(source),
            model_or_model_path=ICASSP_2022_MODEL_PATH,
            onset_threshold=args.onset_threshold,
            frame_threshold=args.frame_threshold,
            minimum_note_length=args.min_note_length_ms,
            minimum_frequency=_pitch_to_freq(min_pitch),
            maximum_frequency=_pitch_to_freq(max_pitch),
            multiple_pitch_bends=args.multiple_pitch_bends,
            melodia_trick=args.melodia_trick,
        )
    except Exception as exc:
        fail(f"Basic Pitch 推理失败：{type(exc).__name__}: {exc}")

    # ── 音符事件 → 我们的音符结构（含弦号 / 品位）──
    notes: List[Dict[str, Any]] = []
    for event in note_events or []:
        # basic-pitch 的 note_events 元素形如 (start, end, pitch, amplitude, pitch_bend)
        start_sec, end_sec, pitch, amplitude = float(event[0]), float(event[1]), int(round(float(event[2]))), float(event[3])
        bend = float(event[4]) if len(event) > 4 and event[4] is not None else 0.0
        if pitch < min_pitch or pitch > max_pitch:
            continue
        fingering = assign_fingering(pitch, tuning, args.capo)
        notes.append(
            {
                "id": f"tr_{len(notes)}",
                "string": fingering.string,
                "fret": fingering.fret,
                "pitch": pitch,
                "startSec": round4(start_sec),
                "durationSec": round4(max(0.02, end_sec - start_sec)),
                "confidence": round4(min(1.0, max(0.0, amplitude))),
                "velocity": int(min(127, max(1, round(amplitude * 100)))),
                "technique": "bend" if abs(bend) > 0.5 else "normal",
            }
        )

    if not notes:
        # 没有音符不算致命错误，但要如实告知（Node 侧会把它当成「空谱面」继续走 convert）
        log("警告：Basic Pitch 没有检测到任何音符（阈值过高 / 分轨静音 / 乐器不匹配？）")

    # ── 写出 MIDI（Basic Pitch 已经建好的 pretty_midi 对象）──
    midi_path = output_path
    try:
        midi_data.write(str(midi_path))
    except Exception as exc:
        log(f"直接写出 MIDI 失败（{exc}），改用备用路径")
        midi_path = output_path.with_name(f"{output_path.stem}_raw.mid")
        try:
            midi_data.write(str(midi_path))
        except Exception as exc2:
            fail(f"写出 MIDI 失败：{exc2}")

    # ── BPM：优先用调用方给的，否则用 librosa 估计 ──
    bpm = float(args.bpm) if args.bpm and args.bpm > 0 else 0.0
    if bpm <= 0:
        bpm = _estimate_bpm(source) or 0.0
    if bpm <= 0:
        bpm = 120.0
        log("警告：BPM 估计失败，回退 120")

    confidences = [n["confidence"] for n in notes]
    confidence_avg = round4(sum(confidences) / len(confidences)) if confidences else 0.0
    low_confidence = sum(1 for c in confidences if c < 0.6)
    duration_sec = round4(max([n["startSec"] + n["durationSec"] for n in notes], default=0.0))

    log(
        f"完成：{len(notes)} 个音符（低置信度 {low_confidence}），BPM≈{round(bpm, 2)}，"
        f"时长≈{duration_sec}s → {midi_path}"
    )

    succeed(
        instrument=args.instrument,
        midiPath=str(midi_path),
        noteCount=len(notes),
        confidenceAvg=confidence_avg,
        lowConfidenceCount=low_confidence,
        bpm=round(bpm, 3),
        durationSec=duration_sec,
        measureDurationSec=round4(measure_duration_sec(bpm, "4/4")),
        tuning=tuning,
        notes=notes,
    )


def _pitch_to_freq(midi_pitch: float) -> float:
    return 440.0 * (2.0 ** ((float(midi_pitch) - 69.0) / 12.0))


def _estimate_bpm(source: Path) -> Optional[float]:
    """用 librosa 估计 BPM（basic-pitch 已依赖 librosa，无需额外安装）。"""
    try:
        import librosa  # type: ignore

        y, sr = librosa.load(str(source), mono=True)
        tempo, _beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
        value = float(tempo if not hasattr(tempo, "__len__") else tempo[0])
        log(f"librosa 估计 BPM ≈ {value:.2f}")
        return value
    except Exception as exc:
        log(f"BPM 估计失败：{exc}")
        return None


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover
        fail(f"transcribe.py 未捕获异常：{type(exc).__name__}: {exc}")
