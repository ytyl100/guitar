# =========================================================
# GuitarMate Audio Backend (NestJS 10 + Prisma 5 + SQLite)
# 多阶段构建: builder + runner
# =========================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma 在 Alpine 上需要 openssl
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install --no-audit --no-fund

# 先复制 prisma schema 生成 client (利用 Docker 层缓存)
COPY prisma ./prisma
RUN npx prisma generate

# 复制源码并编译 NestJS
COPY . .
RUN npm run build


# ---------- Stage 2: runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

# ffmpeg 用于小节音频切片 (fluent-ffmpeg 会优先使用 ffmpeg-static，
# 这里同时安装系统 ffmpeg 以兼容不同架构)
RUN apk add --no-cache ffmpeg openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 编译产物 + Prisma schema/client + 种子脚本
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# SQLite 数据目录与本地音频/谱图目录
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

# 启动前先执行 Prisma 迁移 (无迁移文件时回退到 db push)，再启动服务
CMD ["sh", "-c", "npx prisma migrate deploy || true; npx prisma db push --skip-generate --accept-data-loss; node dist/main.js"]
