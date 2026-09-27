# =========================================================
# GuitarMate Audio Backend (NestJS 10 + Prisma 5 + SQLite)
# 多阶段构建: builder + runner
#
# ⚠️ 两个阶段都必须是 **glibc** 基础镜像（Debian slim），不能用 alpine：
#   1. PyTorch 只发布 manylinux(glibc) wheel，**没有 musl 版** → alpine 上装不了 demucs；
#   2. Prisma 的 query engine 二进制与 libc 绑定 —— builder 用 musl、runner 用 glibc
#      会直接运行时报错，所以两阶段必须一致。
# =========================================================

# ---------- Stage 1: builder ----------
FROM node:20-slim AS builder

WORKDIR /app

# Prisma 在 Debian 上需要 openssl
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --no-audit --no-fund

# 先复制 prisma schema 生成 client (利用 Docker 层缓存)
COPY prisma ./prisma
RUN npx prisma generate

# 复制源码并编译 NestJS
COPY . .
RUN npm run build


# ---------- Stage 2: runner ----------
FROM node:20-slim AS runner

WORKDIR /app

# ffmpeg 用于小节音频切片；python3 用于真实 AI worker（分离 / 转录）
# ⚠️ demucs 读取音频时要**同时**用到 ffmpeg 和 **ffprobe**
#    （`demucs/audio.py` 里直接 `subprocess.check_output(['ffprobe', ...])`）。
#    Debian 的 ffmpeg 包**自带 ffprobe**，所以容器里本来就有；
#    但本机 Windows 用 `ffmpeg-static` 时**只有 ffmpeg.exe**，
#    因此 npm 侧额外装了 `ffprobe-static` 并把它加进 worker 的 PATH
#    （见 `src/transcription/python-runner.service.ts#workerEnv`）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg openssl ca-certificates \
        python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# ── 真实转录流水线（Python worker）─────────────────────────────
# 不显式指定时后端会自动探测，这里写死避免 PATH 差异带来的不确定性
ENV PYTHON_BIN=python3
ENV WORKERS_DIR=/app/workers
# 允许依赖缺失时静默降级为「模拟转录」。
# ⚠️ 生产建议设为 false —— 缺 demucs/basic-pitch 时**直接失败**，
#    而不是悄悄产出低质量结果（历史上正是这样让「节点不准」被忽视了很久）。
ENV TRANSCRIBE_SIMULATE=false
# AI 模型权重缓存（demucs 会从 HuggingFace 拉 htdemucs_6s ≈ 300MB）→ 挂卷持久化，
# 否则每次重建镜像/重启容器都要重新下载。
ENV TORCH_HOME=/app/models/torch
ENV HF_HOME=/app/models/hf
VOLUME ["/app/models"]

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 编译产物 + Prisma schema/client + 种子脚本
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# ⚠️ 必需：Python worker 脚本。以前漏了这一行 → 容器里 /app/workers 不存在，
#    无论装不装 demucs，分离/转录都只能走 Node 兜底。
COPY --from=builder /app/workers ./workers

# ── 真实 AI 依赖 ──────────────────────────────────────────────
# 只从 PyTorch 的 **CPU** 索引装 torch：PyPI 上的默认 Linux 包是 CUDA 版（约 2.5GB），
# CPU 版约 200MB。demucs 4.1 用 sphn 做音频 IO，不再需要 torchaudio。
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN python3 -m pip install --no-cache-dir --break-system-packages \
        --index-url ${TORCH_INDEX} torch \
    && python3 -m pip install --no-cache-dir --break-system-packages demucs \
    && python3 -c "import demucs, torch; print('demucs', demucs.__version__, 'torch', torch.__version__)"

# 可选：Basic Pitch（复音转录，比单音 YIN 强得多，但依赖 TensorFlow，镜像 +≈600MB）。
# 打开方式：docker build --build-arg INSTALL_BASIC_PITCH=true .
#
# ⚠️ 两个硬约束（本机实测踩过，容器里同样会踩）：
#   1. **Python 必须 ≤ 3.11**：basic-pitch 0.4 依赖 `tensorflow<2.15.1`，
#      而 TF 2.15 只提供到 cp311 的 wheel（3.12/3.13/3.14 都没有）→ 会退化成源码构建并失败。
#      Debian bookworm 的 `python3` 正好是 3.11，所以这里能用（比本机 Python 3.14 还省事）。
#   2. **setuptools 必须 < 81**：basic-pitch 仍然 `import pkg_resources`，
#      而 setuptools>=81 已移除该模块 → 运行时报 `No module named 'pkg_resources'`。
#      因此最后一步要把 setuptools 钉回 <81。
ARG INSTALL_BASIC_PITCH=false
RUN if [ "$INSTALL_BASIC_PITCH" = "true" ]; then \
        python3 -m pip install --no-cache-dir --break-system-packages basic-pitch \
        && python3 -m pip install --no-cache-dir --break-system-packages --upgrade "setuptools<81" \
        && python3 -c "import basic_pitch, tensorflow as tf; print('basic-pitch ok, tf', tf.__version__)"; \
    fi

# SQLite 数据目录与本地音频/谱图目录
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

# 启动前先执行 Prisma 迁移 (无迁移文件时回退到 db push)，再启动服务
CMD ["sh", "-c", "npx prisma migrate deploy || true; npx prisma db push --skip-generate --accept-data-loss; node dist/main.js"]
