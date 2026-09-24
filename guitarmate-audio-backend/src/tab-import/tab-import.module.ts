import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TabImportController } from './tab-import.controller';
import { TabImportService } from './tab-import.service';

/**
 * 六线谱导入模块
 *
 * 只依赖 PrismaModule：解析器全部是纯函数（无 IO），
 * 落盘写入 `uploads/tab-projects/`，不触碰音频链路，
 * 因此与 MeasuresModule 完全解耦。
 */
@Module({
  imports: [PrismaModule],
  controllers: [TabImportController],
  providers: [TabImportService],
  exports: [TabImportService],
})
export class TabImportModule {}
