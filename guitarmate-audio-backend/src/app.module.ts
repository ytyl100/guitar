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
  ],
  controllers: [AppController],
})
export class AppModule {}
