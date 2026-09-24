import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 跨域支持 (支持小程序与前端 CMS 联调)
  //
  // ⚠️ 必须在 `useStaticAssets` **之前**注册：CORS 本质是 express 中间件，
  // 静态资源如果先挂载，请求根本不会再经过 CORS 中间件 → `/uploads/**` 缺
  // `Access-Control-Allow-Origin`，CMS 里 fetch 这些音频（波形提取）会被浏览器拦截，
  // 而 `<audio src>` 播放却正常 —— 症状很隐蔽。
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 确保 uploads 目录存在并开放静态访问
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // 全局参数校验与类型自动转换
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 谱面导入需要接收 base64 编码的 .gpx（ZIP）/ .musicxml，默认 100kb 不够用
  try {
    app.useBodyParser('json', { limit: '30mb' });
    app.useBodyParser('urlencoded', { limit: '30mb', extended: true });
  } catch (err: any) {
    logger.warn(`无法调整请求体大小限制（不影响非二进制导入）：${err.message}`);
  }

  // 配置 Swagger API 交互文档
  const config = new DocumentBuilder()
    .setTitle('GuitarMate Audio Backend API')
    .setDescription(
      'GuitarMate 音频后台管理系统与小程序核心服务接口文档（NestJS 10 + Prisma 5 + SQLite）',
    )
    .setVersion('1.0.0')
    .addTag('Measures', '小节切片发布与数据入库')
    .addTag('Published', '面向小程序的已发布曲目与小节查询（含 PracticePackage 统一契约）')
    .addTag('Scores', '曲目与乐器轨数据管理（含调性/变调夹/调弦/授权状态）')
    .addTag(
      'TabImport',
      '六线谱导入：ASCII tab / MusicXML / .gpx / 和弦表 / 转录 JSON → 统一 TabProject → 发布到小程序',
    )
    .addTag(
      'Transcription',
      '音频转录：上传 MP3/WAV/FLAC 或 yt-dlp URL → Demucs 分离 → Basic Pitch 转录 → Tayuya 转谱 → PracticePackage',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('swagger', app, document);

  const port = 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`======================================================`);
  logger.log(`🎸 GuitarMate Audio Backend is running!`);
  logger.log(`📡 Server:      http://0.0.0.0:${port}`);
  logger.log(`📑 Swagger Docs: http://0.0.0.0:${port}/docs`);
  logger.log(`🗄️  Database:    SQLite (./data/app.db)`);
  logger.log(`======================================================`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
