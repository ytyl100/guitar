#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
验证「转录音符的落点是否对得上音频」—— 用音频里**真实的起音点**当客观基准。

动机：用户反馈「音符落点不准」。听感无法自动化，但可以测量：
  ① 音符时间戳 vs 音频起音点 的时间偏差（这是「落点」的直接定义）
  ② 反向覆盖率（音频里有起音、谱面没有音 → 漏音）
  ③ 音高是否正确（只对**单音语境**的音符抽样，避免和声把 YIN 带跑）

还有一个关键怀疑点：`midi_to_tab.py` 会把音符起点**吸附到网格**上，
网格粗细由 `--grid` 决定（`grid_seconds = beat_sec / divisions`，1/8 → 半拍）。
如果实际偏差主要是量化造成的，那改网格（而不是换模型）才是正解 —— 本脚本会分别报告
「basic-pitch 原始时间戳」与「入谱（已量化）时间戳」的偏差，并模拟更细网格的效果。

用法：
  python scripts/verify-transcription-alignment.py \
      --tab uploads/transcriptions/<id>/tab/guitar.json \
      --midi uploads/transcriptions/<id>/midi/guitar.mid \
      --stem uploads/transcriptions/<id>/stems/guitar.wav
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np


def _reconfig_stdout() -> None:
    """Windows 控制台是 GBK(cp936)，直接 print emoji/中文会 UnicodeEncodeError。"""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def load_tab_notes(tab_path: Path) -> tuple[list[dict], float, float]:
    """返回 (notes, beat_sec, grid_sec)。notes 里带绝对时间 `absSec`。"""
    data = json.loads(tab_path.read_text(encoding="utf-8"))
    meta = data.get("meta") or {}
    bpm = float(meta.get("bpm") or 100)
    ts = str(meta.get("timeSignature") or "4/4")
    try:
        denom = int(ts.split("/")[1])
    except Exception:
        denom = 4
    beat_sec = 60.0 / bpm * (4.0 / denom)

    notes: list[dict] = []
    for track in data.get("tracks") or []:
        for measure in track.get("measures") or []:
            start = float(measure.get("startTime") or 0.0)
            for note in measure.get("notes") or []:
                if not note.get("midi"):
                    continue
                notes.append(
                    {
                        "midi": int(note["midi"]),
                        "absSec": start + float(note.get("offsetSec") or 0.0),
                        "durSec": float(note.get("durationSec") or 0.0),
                        "confidence": float(note.get("confidence") or 0.0),
                        "measure": int(measure.get("index") or 0) + 1,
                    }
                )
    notes.sort(key=lambda n: n["absSec"])
    return notes, beat_sec, beat_sec / 2.0


def load_midi_times(midi_path: Path) -> list[float]:
    """basic-pitch 写出的 MIDI 里是**未量化**的精确时间戳。"""
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(str(midi_path))
    return sorted(n.start for inst in pm.instruments for n in inst.notes)


def detect_onsets(stem_path: Path, sr: int = 22050) -> tuple[dict, np.ndarray, int]:
    """
    起音检测有**方向性偏差**，所以两边都测，报告区间：
      - backtrack=True ：回溯到能量谷底 → 偏早
      - backtrack=False：阈值越界的那一帧 → 偏晚
    真实起音点落在两者之间。只看一个方向会把偏差算到转录头上（或反过来掩盖真问题）。
    """
    import librosa

    y, sr = librosa.load(str(stem_path), sr=sr, mono=True)
    out: dict[str, np.ndarray] = {}
    for tag, bt in (("valley(早)", True), ("attack(晚)", False)):
        onsets = librosa.onset.onset_detect(
            y=y, sr=sr, hop_length=512, backtrack=bt, units="time", normalize=True
        )
        out[tag] = np.sort(np.asarray(onsets))
    return out, y, sr


def stats_bracket(label: str, times: np.ndarray, onsets: dict) -> None:
    for tag, arr in onsets.items():
        print(f"  {label} [基准 {tag}]")
        stats("  ", times, arr)


def _nearest_delta(times: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """每个 times 元素到 ref 中最近点的有符号偏差（秒）。"""
    if len(ref) == 0 or len(times) == 0:
        return np.asarray([])
    idx = np.searchsorted(ref, times)
    idx = np.clip(idx, 1, len(ref) - 1)
    left, right = ref[idx - 1], ref[idx]
    return np.where(np.abs(times - left) <= np.abs(right - times), times - left, times - right)


def stats(label: str, times: np.ndarray, onsets: np.ndarray) -> dict:
    if len(times) == 0:
        print(f"{label}: 无音符")
        return {}
    d = _nearest_delta(times, onsets)
    a = np.abs(d)
    row = {
        "n": len(times),
        "w50": float((a <= 0.050).mean() * 100),
        "w100": float((a <= 0.100).mean() * 100),
        "w200": float((a <= 0.200).mean() * 100),
        "median": float(np.median(a) * 1000),
        "p90": float(np.percentile(a, 90) * 1000),
        "bias": float(np.median(d) * 1000),
    }
    print(
        f"{label}\n"
        f"    音符 {row['n']} 个 | ±50ms {row['w50']:.1f}%  ±100ms {row['w100']:.1f}%  "
        f"±200ms {row['w200']:.1f}%\n"
        f"    中位偏差 {row['median']:.0f}ms  p90 {row['p90']:.0f}ms  系统偏移 {row['bias']:+.0f}ms"
    )
    return row


def coverage(onsets: np.ndarray, note_times: np.ndarray, tol: float = 0.080) -> float:
    """有多少音频起音点被谱面覆盖（漏音率）。"""
    if len(onsets) == 0 or len(note_times) == 0:
        return 0.0
    d = np.abs(_nearest_delta(onsets, note_times))
    return float((d <= tol).mean() * 100)


def simulate_grid(times: np.ndarray, grid: float) -> np.ndarray:
    return np.round(times / grid) * grid


def pitch_check(y: np.ndarray, sr: int, notes: list[dict], onsets: np.ndarray, sample: int) -> dict:
    """
    只对**单音语境**的音符做音高核对：
    该音符周围 ±60ms 内没有别的音（否则 YIN 会锁到和声的某个音上，误差不算模型的）。
    """
    import librosa

    iso: list[dict] = []
    for i, n in enumerate(notes):
        lo = n["absSec"] - 0.06
        hi = n["absSec"] + 0.15
        if any(i != j and lo <= notes[j]["absSec"] <= hi for j in range(len(notes))):
            continue
        # 起音后 30~250ms 是稳定段
        iso.append(n)
    if len(iso) > sample:
        step = len(iso) / sample
        iso = [iso[int(i * step)] for i in range(sample)]

    ok05 = ok1 = octave = 0
    checked = 0
    for n in iso:
        a, b = n["absSec"] + 0.03, n["absSec"] + min(max(n["durSec"], 0.12), 0.35)
        if b - a < 0.05 or b * sr >= len(y):
            continue
        seg = y[int(a * sr) : int(b * sr)]
        if len(seg) < 512:
            continue
        # ⚠️ fmin/fmax 必须**按该音符自己的音高**给（±7 半音）：
        # 早期固定 70~1200Hz 时，低音轨的 E1(41Hz) 直接落在范围外 →
        # YIN 只能锁到谐波上 → 报出 20% 的"八度错位"，那是**测量缺陷**不是转录错误。
        fmin = 440.0 * 2.0 ** ((n["midi"] - 7 - 69) / 12.0)
        fmax = 440.0 * 2.0 ** ((n["midi"] + 7 - 69) / 12.0)
        try:
            f0 = librosa.yin(seg, fmin=fmin, fmax=fmax, sr=sr, hop_length=256)
        except Exception:
            continue
        f0 = f0[np.isfinite(f0) & (f0 > 0)]
        if len(f0) == 0:
            continue
        # 取中位数音高（避开起音/衰减尾巴的抖动）
        hz = float(np.median(f0))
        if hz <= 0:
            continue
        midi = int(round(69 + 12 * np.log2(hz / 440.0)))
        delta = abs(midi - n["midi"])
        checked += 1
        if delta == 0:
            ok05 += 1
        elif delta <= 1:
            ok1 += 1
        elif delta % 12 == 0 and delta >= 12:
            octave += 1
    if checked == 0:
        return {"checked": 0}
    res = {
        "checked": checked,
        "exact": ok05 / checked * 100,
        "within1": (ok05 + ok1) / checked * 100,
        "octave": octave / checked * 100,
    }
    print(
        f"    抽样 {checked} 个单音语境音符：完全一致 {res['exact']:.1f}%  "
        f"±1 半音内 {res['within1']:.1f}%  八度错位 {res['octave']:.1f}%"
    )
    return res


def main() -> None:
    _reconfig_stdout()
    ap = argparse.ArgumentParser(description="转录落点对齐验证（起音点基准）")
    ap.add_argument("--tab", required=True, help="tab/<instrument>.json（入谱后的量化结果）")
    ap.add_argument("--midi", required=True, help="midi/<instrument>.mid（basic-pitch 原始输出）")
    ap.add_argument("--stem", required=True, help="stems/<instrument>.wav")
    ap.add_argument("--sample", type=int, default=150, help="音高核对抽样数")
    args = ap.parse_args()

    tab_path, midi_path, stem_path = Path(args.tab), Path(args.midi), Path(args.stem)
    for p in (tab_path, midi_path, stem_path):
        if not p.exists():
            print(f"❌ 找不到 {p}")
            sys.exit(1)

    tab_notes, beat_sec, grid_sec = load_tab_notes(tab_path)
    raw_times = np.asarray(load_midi_times(midi_path))
    onsets, y, sr = detect_onsets(stem_path)
    n_onsets = "/".join(str(len(v)) for v in onsets.values())

    print("=" * 68)
    print(f"音频 {stem_path.name}  时长 {len(y) / sr:.2f}s  采样率 {sr}")
    print(f"BPM {60 / beat_sec:.1f}  一拍 {beat_sec * 1000:.0f}ms  当前量化网格 1/8 = {grid_sec * 1000:.0f}ms")
    print(f"音频起音点（valley/attack 两种口径）: {n_onsets} 个")
    print(f"basic-pitch 原始音符: {len(raw_times)} 个   入谱音符（已量化）: {len(tab_notes)} 个")
    print("=" * 68)

    tab_times = np.asarray([n["absSec"] for n in tab_notes])

    print("\n① basic-pitch 原始时间戳（未量化）vs 音频起音 —— 模型本身的落点精度")
    stats_bracket("", raw_times, onsets)

    print("\n② 入谱时间戳（已量化到 1/8）vs 音频起音 —— 学员实际看到的落点")
    stats_bracket("", tab_times, onsets)

    print("\n③ 量化损失模拟（把原始时间戳按不同网格吸附，看偏差变化）")
    for spec, div in (("1/8", 2), ("1/16", 4), ("1/32", 8)):
        g = beat_sec / div
        print(f"  --grid {spec} ({g * 1000:.0f}ms)")
        stats_bracket("", simulate_grid(raw_times, g), onsets)

    print("\n④ 反向覆盖率（音频起音点被谱面覆盖的比例；差 = 漏音）")
    for tag, arr in onsets.items():
        print(
            f"    [{tag}] 原始: {coverage(arr, raw_times):.1f}%   "
            f"入谱: {coverage(arr, tab_times):.1f}%（容差 ±80ms）"
        )

    print("\n⑤ 音高核对（YIN，仅单音语境抽样）")
    flat = onsets["valley(早)"]
    pitch_check(y, sr, tab_notes, flat, args.sample)
    print()


if __name__ == "__main__":
    main()
