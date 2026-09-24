#!/usr/bin/env python3
"""
separate.py —— Demucs htdemucs_6s 多乐器分离
==========================================

用法（由 Node 侧 `TranscribeService` 调用）：

```bash
python workers/separate.py \
  --input  uploads/transcriptions/<id>/source.wav \
  --output uploads/transcriptions/<id>/stems \
  --model  htdemucs_6s \
  --stems  guitar,bass,piano,other \
  [--device cpu|cuda]
```

输出（stdout 最后一行）：

```
GUITARMATE_RESULT {"ok":true,"model":"htdemucs_6s","stems":[{"instrument":"guitar","path":".../guitar.wav"}]}
```

htdemucs_6s 的 6 条 stem 顺序固定为：
`drums, bass, other, vocals, guitar, piano`
（注意 `other` 在 `vocals` 之前 —— 记错顺序会导致「吉他轨里是鼓声」这类隐蔽错误。）

安装：
```bash
pip install -U demucs            # 首次运行会自动下载 htdemucs_6s 权重（约 300MB）
```
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    ensure_dir,
    fail,
    log,
    module_available,
    require_file,
    round4,
    succeed,
)

# htdemucs_6s 的官方 sources 顺序 —— 不要改
HTDEMUCS_6S_SOURCES = ["drums", "bass", "other", "vocals", "guitar", "piano"]
# htdemucs（4 轨）回退顺序
HTDEMUCS_4_SOURCES = ["drums", "bass", "other", "vocals"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Demucs 多乐器分离（GuitarMate）")
    parser.add_argument("--input", required=True, help="输入音频（wav/mp3/flac）")
    parser.add_argument("--output", required=True, help="输出目录（每条 stem 一个 .wav）")
    parser.add_argument("--model", default="htdemucs_6s", help="Demucs 模型名，默认 htdemucs_6s")
    parser.add_argument(
        "--stems",
        default="guitar,bass,piano,other",
        help="需要输出的乐器（逗号分隔）；为空则输出全部 stem",
    )
    parser.add_argument("--device", default=None, help="cpu / cuda（默认自动）")
    parser.add_argument("--segment", type=float, default=None, help="分段长度（秒），显存不足时调小")
    parser.add_argument("--shifts", type=int, default=1, help="随机 shift 次数（越大越准越慢）")
    parser.add_argument("--overlap", type=float, default=0.25, help="分段重叠比例")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = require_file(args.input, "输入音频")
    output_dir = ensure_dir(args.output)

    if not module_available("demucs"):
        fail(
            "未安装 demucs。安装：pip install -U demucs"
            "（首次运行会自动下载 htdemucs_6s 权重）"
        )
    if not module_available("torch"):
        fail("未安装 PyTorch。请先安装 torch（CPU 版即：pip install torch）再安装 demucs。")

    wanted: List[str] = [s.strip().lower() for s in (args.stems or "").split(",") if s.strip()]

    try:
        import torch  # noqa: F401
        from demucs.apply import apply_model
        from demucs.audio import AudioFile, save_audio
        from demucs.pretrained import get_model
    except Exception as exc:  # pragma: no cover - 环境相关
        fail(f"导入 demucs 失败：{exc}")

    log(f"加载模型：{args.model}")
    try:
        model = get_model(args.model)
    except Exception as exc:
        fail(
            f"无法加载模型 {args.model}：{exc}\n"
            "提示：htdemucs_6s 需要 demucs>=4.1；老版本请升级 pip install -U demucs"
        )

    sources: List[str] = list(getattr(model, "sources", HTDEMUCS_6S_SOURCES))
    log(f"模型 sources：{sources}")

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    sample_rate = int(getattr(model, "samplerate", 44100))
    log(f"读取音频：{source}（目标采样率 {sample_rate}Hz，设备 {device}）")

    try:
        wav = AudioFile(str(source)).read(
            streams=0,
            samplerate=sample_rate,
            channels=int(getattr(model, "audio_channels", 2)),
        )
    except Exception as exc:
        fail(f"读取音频失败（请确认是有效的 mp3/wav/flac）：{exc}")

    if wav.dim() == 2:  # (channels, time) → (batch, channels, time)
        wav = wav.unsqueeze(0)

    apply_kwargs: Dict[str, object] = {
        "device": device,
        "shifts": max(1, args.shifts),
        "split": True,
        "overlap": min(0.9, max(0.0, args.overlap)),
        "progress": False,
    }
    if args.segment:
        apply_kwargs["segment"] = args.segment

    log("开始分离（这一步最耗时，请耐心等待）…")
    try:
        with torch.no_grad():
            estimates = apply_model(model, wav, **apply_kwargs)
    except Exception as exc:
        fail(f"Demucs 分离失败：{exc}")

    estimates = estimates[0]  # (sources, channels, time)
    duration_sec = round4(estimates.shape[-1] / sample_rate)

    stems = []
    for index, name in enumerate(sources):
        instrument = "other" if name not in ("guitar", "bass", "piano", "vocals", "drums") else name
        if wanted and instrument not in wanted:
            continue
        stem_path = output_dir / f"{instrument}.wav"
        try:
            save_audio(estimates[index].cpu(), str(stem_path), samplerate=sample_rate)
        except Exception as exc:
            fail(f"写出 stem 失败（{instrument}）：{exc}")
        log(f"已写出 {instrument} → {stem_path}")
        stems.append({"instrument": instrument, "path": str(stem_path), "durationSec": duration_sec})

    if not stems:
        fail(f"没有任何 stem 被写出（请求的乐器：{wanted or '全部'}；模型 sources：{sources}）")

    succeed(model=args.model, device=device, sampleRate=sample_rate, durationSec=duration_sec, stems=stems)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - 兜底，保证结果行一定输出
        fail(f"separate.py 未捕获异常：{type(exc).__name__}: {exc}")
