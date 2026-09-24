import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '系统健康检查与服务概览' })
  async getStatus() {
    const scoreCount = await this.prisma.score.count();
    const trackCount = await this.prisma.track.count();
    const measureCount = await this.prisma.measure.count();
    const publishedScoreCount = await this.prisma.score.count({
      where: { status: 'published' },
    });

    return {
      name: 'GuitarMate Audio Backend',
      status: 'operational',
      framework: 'NestJS 10 + Prisma 5 + SQLite',
      database: {
        provider: 'sqlite',
        path: './data/app.db',
        stats: {
          scores: scoreCount,
          publishedScores: publishedScoreCount,
          tracks: trackCount,
          measures: measureCount,
        },
      },
      endpoints: {
        swaggerDocs: '/docs',
        publishedScores: '/api/published/scores',
        publishedMeasures: '/api/published/scores/:id/measures',
        publishMeasures: 'POST /api/measures/publish',
        allScores: '/api/scores',
      },
      time: new Date().toISOString(),
    };
  }

  @Get('api/health')
  @ApiOperation({ summary: 'API 探针接口' })
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
