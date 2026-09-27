import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AudioModule } from './audio/audio.module';
import { OssModule } from './oss/oss.module';
import { MeasuresModule } from './measures/measures.module';
import { PublishedModule } from './published/published.module';
import { ScoresModule } from './scores/scores.module';
import { TabImportModule } from './tab-import/tab-import.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    AudioModule,
    OssModule,
    MeasuresModule,
    PublishedModule,
    ScoresModule,
    TabImportModule,
    /** 音频转录流水线：Demucs → Basic Pitch → Tayuya → PracticePackage */
    TranscriptionModule,
    /** 课程大纲（CMS 管理 / 小程序 Learn 页消费）—— 后端唯一数据源 */
    CurriculumModule,
    /** 存储体检：uploads 下课程以外目录的孤儿文件 / 悬空引用对账 */
    StorageModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
