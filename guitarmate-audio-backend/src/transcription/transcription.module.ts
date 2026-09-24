import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AudioModule } from '../audio/audio.module';
import { OssModule } from '../oss/oss.module';
import { MeasuresModule } from '../measures/measures.module';
import { TranscriptionController } from './transcription.controller';
import { TranscribeService } from './transcribe.service';
import { PublishService } from './publish.service';
import { UploadService } from './upload.service';
import { PythonRunnerService } from './python-runner.service';
import { NodeTranscriberService } from './node-transcriber.service';
import { TranscriptionSimulationService } from './simulation.service';
import { TranscribeQueueService } from './queue/transcribe.queue';

/**
 * 音频转录流水线模块
 * ==================
 *
 * 依赖关系（全部**复用既有模块**，不修改它们的任何代码）：
 *
 * | 依赖 | 复用点 |
 * |---|---|
 * | `PrismaModule` | Project / TranscribeJob / TranscribeTrack / PracticePackage 4 张新表 |
 * | `AudioModule` | `AudioService.sliceAudio` —— 按小节切片（ffmpeg） |
 * | `OssModule` | `OssService.upload` —— 切片上 CDN（未配置时回退本地静态目录） |
 * | `MeasuresModule` | `MeasuresService` —— 仅在显式开启 `mirrorToScorePipeline` 时写旧链路 |
 *
 * 与 `TabImportModule`（人工制谱导入）互补：
 * - `tab-import`：ASCII / MusicXML / GPX / 和弦表 → TabProject
 * - `transcription`：原始音频 → Demucs → Basic Pitch → Tayuya → TabProject（同一结构）
 *
 * 两者最终都汇聚到同一个 C 端契约 `PracticePackage`（schemaVersion 1.0）。
 */
@Module({
  imports: [PrismaModule, AudioModule, OssModule, MeasuresModule],
  controllers: [TranscriptionController],
  providers: [
    PythonRunnerService,
    TranscriptionSimulationService,
    NodeTranscriberService,
    TranscribeQueueService,
    UploadService,
    TranscribeService,
    PublishService,
  ],
  exports: [TranscribeService, PublishService, PythonRunnerService, NodeTranscriberService, UploadService],
})
export class TranscriptionModule {}
