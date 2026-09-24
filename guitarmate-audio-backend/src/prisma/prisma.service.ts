import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // 确保数据存储目录存在
    const prismaDataDir = join(process.cwd(), 'prisma', 'data');
    if (!existsSync(prismaDataDir)) {
      mkdirSync(prismaDataDir, { recursive: true });
    }
    const rootDataDir = join(process.cwd(), 'data');
    if (!existsSync(rootDataDir)) {
      mkdirSync(rootDataDir, { recursive: true });
    }

    // 确保绝对协议及有效回退
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || !dbUrl.startsWith('file:')) {
      dbUrl = 'file:./data/app.db';
    }

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to SQLite database successfully');
    } catch (err: any) {
      this.logger.error(
        `Failed to connect to SQLite: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
