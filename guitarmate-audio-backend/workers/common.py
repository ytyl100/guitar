"""
GuitarMate 转录 Worker 公共库
=============================

所有 worker 共享的约定（与 Node 侧 `src/transcription/python-runner.service.ts` 对齐）：

1. **输入**：命令行参数（`--input` / `--output` / `--instrument` …），不依赖任何 RPC 框架；
2. **人类可读日志** → `stderr`；结构化结果 → `stdout` 的**最后一行**，格式：
   ```
   GUITARMATE_RESULT {"ok": true, ...}
   ```
3. **失败也要输出结果行**（`{"ok": false, "message": "..."}`）并 `exit 1`，
   这样 Node 侧能把「依赖缺失 / 参数错误」的原因透传到 CMS，而不是只看到一句 "command failed"；
4. **零依赖优先**：能用标准库实现的部分（SMF 解析、指法分配）就不要引入第三方包，
   让 `midi_to_tab.py` 在没有 pip 包的环境里也能跑。
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

RESULT_PREFIX = "GUITARMATE_RESULT "

# 标准调弦（索引 0 = 一弦 / 高音 E），MIDI 音高
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]
BASS_TUNING = [43, 38, 33, 28]

MIDI_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


# ─────────────────────────────────────────────
# 输出协议
# ─────────────────────────────────────────────


def _force_utf8() -> None:
    """Windows 控制台常常是 cp936，直接 print 中文会 UnicodeEncodeError。"""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def log(message: str) -> None:
    """人类可读日志 → stderr（Node 侧只解析 stdout 的结果行，不会互相干扰）。"""
    print(message, file=sys.stderr, flush=True)


def emit(result: Dict[str, Any], exit_code: int = 0) -> None:
    """输出结构化结果行并退出。"""
    _force_utf8()
    payload = json.dumps(result, ensure_ascii=False, default=str)
    print(f"{RESULT_PREFIX}{payload}", flush=True)
    sys.exit(exit_code)


def fail(message: str, **extra: Any) -> None:
    """失败：输出 ok=false 的结果行，退出码 1（Node 侧会读取 message 给出可操作提示）。"""
    emit({"ok": False, "message": message, **extra}, exit_code=1)


def succeed(**payload: Any) -> None:
    emit({"ok": True, **payload})


def require_file(path_value: Optional[str], label: str) -> Path:
    if not path_value:
        fail(f"缺少参数：{label}")
    path = Path(path_value).expanduser()
    if not path.exists():
        fail(f"{label} 不存在：{path}")
    return path


def ensure_dir(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def module_available(name: str) -> bool:
    import importlib.util

    try:
        return importlib.util.find_spec(name) is not None
    except Exception:
        return False


def parse_tuning_arg(raw: Optional[str], instrument: str) -> List[int]:
    """`--tuning "64,59,55,50,45,40"`（MIDI 数组，索引 0 = 一弦）"""
    if raw:
        try:
            values = [int(v.strip()) for v in raw.split(",") if v.strip() != ""]
            if values:
                return values
        except ValueError:
            log(f"警告：--tuning 解析失败（{raw}），回退到默认调弦")
    return list(BASS_TUNING if instrument == "bass" else STANDARD_TUNING)


def midi_to_name(midi: int) -> str:
    midi = int(round(midi))
    return f"{MIDI_NAMES[midi % 12]}{midi // 12 - 1}"


def measure_duration_sec(bpm: float, time_signature: str) -> float:
    """小节时长 = 拍数 × (60/bpm) × (4/拍号分母)。**绝不硬编码 2.4s。**"""
    beats_raw, _, denominator_raw = (time_signature or "4/4").partition("/")
    beats = int(beats_raw) if beats_raw.isdigit() else 4
    denominator = int(denominator_raw) if denominator_raw.isdigit() else 4
    safe_bpm = float(bpm) if bpm and bpm > 0 else 120.0
    return (60.0 / safe_bpm) * beats * (4.0 / denominator)


def round4(value: float) -> float:
    return float(f"{float(value):.4f}")


# ─────────────────────────────────────────────
# 指法分配（MIDI 音高 → 弦号 + 品位）
# ─────────────────────────────────────────────


@dataclass
class Fingering:
    string: int  # 1 = 一弦（最细）
    fret: int

    @property
    def opens_high(self) -> int:
        return self.string


def assign_fingering(pitch: int, tuning: Sequence[int], capo: int = 0, max_fret: int = 19) -> Fingering:
    """
    为给定的 MIDI 音高选择**最低的把位**（吉他手最自然的按法）：
    遍历 6 根弦，取 `fret = pitch - (空弦 + capo)` 落在 [0, max_fret] 的最小值。
    找不到时把音高夹到一弦/六弦的极限品，保证一定能渲染（宁可失真也不丢音符）。
    """
    candidates: List[Fingering] = []
    for index, open_pitch in enumerate(tuning):
        fret = int(round(pitch)) - (int(open_pitch) + int(capo))
        if 0 <= fret <= max_fret:
            candidates.append(Fingering(string=index + 1, fret=fret))

    if candidates:
        # 优先低品位；品位相同时优先较粗的弦（低音弦），音色更稳
        return sorted(candidates, key=lambda f: (f.fret, -f.string))[0]

    # 越界兜底：按音高相对整体调弦范围的位置夹取
    lowest = min(tuning) + capo
    highest = max(tuning) + capo
    if pitch < lowest:
        return Fingering(string=len(tuning), fret=abs(pitch - lowest))
    return Fingering(string=1, fret=int(round(pitch)) - (max(tuning) + capo))


def infer_instrument(tuning: Sequence[int]) -> str:
    return "bass" if len(tuning) <= 4 else "guitar"


# ─────────────────────────────────────────────
# 极简 SMF（Standard MIDI File）解析器 —— 零依赖
# ─────────────────────────────────────────────


@dataclass
class MidiNote:
    pitch: int
    start_sec: float
    duration_sec: float
    velocity: int


@dataclass
class MidiDocument:
    notes: List[MidiNote]
    bpm: float
    time_signature: str


def _read_vlq(data: bytes, offset: int) -> Tuple[int, int]:
    value = 0
    while True:
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, offset


def parse_midi(path: Path, default_bpm: float = 120.0) -> MidiDocument:
    """
    解析 Type 0 / Type 1 的 MIDI 文件，返回绝对秒时间的音符列表。

    只用标准库 —— 这样即使机器上没装 `mido` / `pretty_midi`，
    `midi_to_tab.py` 依然能把 Basic Pitch 输出的 .mid 转成六线谱。
    """
    data = path.read_bytes()
    if len(data) < 14 or data[0:4] != b"MThd":
        raise ValueError(f"不是合法的 MIDI 文件（缺少 MThd 头）：{path}")

    header_len = int.from_bytes(data[4:8], "big")
    track_count = int.from_bytes(data[10:12], "big")
    division = int.from_bytes(data[12:14], "big")
    ticks_per_quarter = division if division > 0 else 480

    offset = 8 + header_len
    tempo_us_per_quarter = int(60_000_000 / (default_bpm if default_bpm > 0 else 120))
    time_signature = "4/4"

    raw_notes: List[Tuple[float, float, int, int]] = []  # (start_sec, dur, pitch, velocity)
    track_count = max(1, track_count)

    for _ in range(track_count):
        if offset + 8 > len(data) or data[offset : offset + 4] != b"MTrk":
            break
        track_len = int.from_bytes(data[offset + 4 : offset + 8], "big")
        track_end = offset + 8 + track_len
        cursor = offset + 8

        current_tick = 0
        running_status = 0
        active: Dict[int, Tuple[float, int]] = {}

        while cursor < track_end:
            delta, cursor = _read_vlq(data, cursor)
            current_tick += delta
            if cursor >= track_end:
                break

            status = data[cursor]
            if status & 0x80:
                cursor += 1
                running_status = status
            else:
                status = running_status

            if status == 0xFF:  # meta event
                meta_type = data[cursor]
                cursor += 1
                length, cursor = _read_vlq(data, cursor)
                payload = data[cursor : cursor + length]
                cursor += length
                if meta_type == 0x51 and length >= 3:
                    tempo_us_per_quarter = int.from_bytes(payload[0:3], "big") or tempo_us_per_quarter
                elif meta_type == 0x58 and length >= 2:
                    time_signature = f"{payload[0]}/{2 ** payload[1]}"
                continue

            if status in (0xF0, 0xF7):  # sysex
                length, cursor = _read_vlq(data, cursor)
                cursor += length
                continue

            event_type = status & 0xF0
            seconds = current_tick / ticks_per_quarter * (tempo_us_per_quarter / 1_000_000)

            if event_type in (0x80, 0x90):
                pitch = data[cursor]
                velocity = data[cursor + 1]
                cursor += 2
                is_on = event_type == 0x90 and velocity > 0
                if is_on:
                    active[pitch] = (seconds, velocity)
                else:
                    started = active.pop(pitch, None)
                    if started:
                        start_sec, start_velocity = started
                        raw_notes.append((start_sec, max(0.02, seconds - start_sec), pitch, start_velocity))
                continue

            if event_type in (0xA0, 0xB0, 0xE0):
                cursor += 2
                continue
            if event_type in (0xC0, 0xD0):
                cursor += 1
                continue

        # 未闭合的音符按「到轨尾」处理
        for pitch, (start_sec, velocity) in active.items():
            raw_notes.append((start_sec, 0.25, pitch, velocity))

        offset = track_end

    notes = [
        MidiNote(pitch=pitch, start_sec=round4(start), duration_sec=round4(dur), velocity=int(velocity))
        for start, dur, pitch, velocity in sorted(raw_notes, key=lambda n: n[0])
    ]
    bpm = 60_000_000 / tempo_us_per_quarter if tempo_us_per_quarter > 0 else default_bpm
    return MidiDocument(notes=notes, bpm=round(float(bpm), 3), time_signature=time_signature)


# ─────────────────────────────────────────────
# TabProject 组装（与 Node 侧 tab-import / simulation 完全同构）
# ─────────────────────────────────────────────


def build_tab_project(
    *,
    instrument: str,
    tuning: Sequence[int],
    capo: int,
    bpm: float,
    time_signature: str,
    notes: Iterable[Dict[str, Any]],
    title: str,
    artist: Optional[str] = None,
    warnings: Optional[List[Dict[str, Any]]] = None,
    source_kind: str = "solo-trace",
    source_site: str = "GuitarMate 转录流水线",
    source_detail: str = "basic-pitch + midi_to_tab",
) -> Dict[str, Any]:
    """
    把「绝对秒 + MIDI 音高」的音符列表组装成标准 TabProject。

    关键不变式（与 `src/tab-import/tab-project.utils.ts` 完全一致）：
    - `midi = 空弦音高 + fret + capo`
    - `offsetSec = start_sec - measure.startTime`（小节内偏移）
    - `beat = offsetSec / (60/bpm)`
    - 小节窗口 = 等长 `measure_duration_sec(bpm, time_signature)`
    """
    measure_sec = measure_duration_sec(bpm, time_signature)
    beats = int((time_signature or "4/4").split("/")[0]) if (time_signature or "4/4").split("/")[0].isdigit() else 4

    sorted_notes = sorted(notes, key=lambda n: (float(n["startSec"]), int(n["string"])))
    duration_sec = (
        max(float(n["startSec"]) + float(n.get("durationSec", 0.25)) for n in sorted_notes)
        if sorted_notes
        else measure_sec
    )
    measure_count = max(1, int(-(-duration_sec // measure_sec)))  # ceil

    measures: List[Dict[str, Any]] = []
    note_total = 0
    for measure_index in range(measure_count):
        start_time = round4(measure_index * measure_sec)
        end_time = round4(min(duration_sec, (measure_index + 1) * measure_sec))
        if end_time <= start_time:
            end_time = round4(start_time + measure_sec)

        in_window = [
            n for n in sorted_notes if start_time - 1e-6 <= float(n["startSec"]) < end_time + 1e-6
        ]
        tab_notes: List[Dict[str, Any]] = []
        for note_index, n in enumerate(in_window):
            offset_sec = round4(float(n["startSec"]) - start_time)
            tab_notes.append(
                {
                    "id": f"{instrument}_m{measure_index}_n{note_index}",
                    "string": int(n["string"]),
                    "fret": int(n["fret"]),
                    "midi": int(n["midi"]),
                    "offsetSec": offset_sec,
                    "beat": round4(offset_sec / (60.0 / (bpm if bpm > 0 else 120))),
                    "durationSec": round4(float(n.get("durationSec", 0.25))),
                    "rhythm": n.get("rhythm"),
                    "technique": n.get("technique", "normal"),
                    "velocity": int(n.get("velocity", 90)),
                    "confidence": float(n.get("confidence", 1.0)),
                    "chordName": n.get("chordName"),
                }
            )
        note_total += len(tab_notes)

        measures.append(
            {
                "index": measure_index,
                "label": f"第 {measure_index + 1} 小节",
                "startTime": start_time,
                "endTime": end_time,
                "beats": beats,
                "notes": tab_notes,
            }
        )

    barre_count = 0
    all_warnings = list(warnings or [])

    return {
        "format": "guitarmate-tab-project",
        "version": "1.0",
        "meta": {
            "title": title,
            "artist": artist,
            "bpm": int(round(bpm)) if bpm else 120,
            "timeSignature": time_signature or "4/4",
            "instrument": instrument,
            "capo": int(capo),
        },
        "tuning": [int(t) for t in tuning],
        "capo": int(capo),
        "tracks": [
            {
                "id": f"{instrument}-1",
                "name": "贝斯轨" if instrument == "bass" else "吉他轨",
                "instrument": instrument,
                "tuning": [int(t) for t in tuning],
                "capo": int(capo),
                "measures": measures,
            }
        ],
        "source": {
            "kind": source_kind,
            "fileName": None,
            "site": source_site,
            "rights": "user-submission",
            "rightsNote": source_detail,
            "parsedAt": _now_iso(),
            "parserVersion": "1.0.0",
        },
        "warnings": all_warnings,
        "stats": {
            "measureCount": len(measures),
            "noteCount": note_total,
            "chordCount": 0,
            "barreCount": barre_count,
            "approximateRhythmMeasures": 0,
            "timeSignatureChanges": 0,
            "durationSec": round4(duration_sec),
        },
    }


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")
