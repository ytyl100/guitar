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
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LibraryModule } from './library/library.module';
import { OpsModule } from './ops/ops.module';

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
    /** 用户 / 用户组 / 权限矩阵 / 积分账户（guitar-ai-audio 与小程序共用的身份层） */
    UsersModule,
    /** 课纲 / 教学视频 / 和弦组合（guitar-ai-audio 原型的课程数据，独立于 CMS 的 curriculum） */
    CoursesModule,
    /** 音频乐谱库（guitar-ai-audio 的曲库条目 + 完整乐谱；小程序另读 /api/published/library） */
    LibraryModule,
    /** 运营域：站内通知 / 积分恢复工单 / 企业线索 / 定价方案 */
    OpsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
