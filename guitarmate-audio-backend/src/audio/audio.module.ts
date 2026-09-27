import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { DemoAudioService } from './demo-audio.service';
import { ChordAudioController } from './chord-audio.controller';

@Module({
  /** `ChordAudioController` = 和弦库试听（`GET /api/audio/strum`），只依赖 DemoAudioService */
  controllers: [ChordAudioController],
  providers: [AudioService, DemoAudioService],
  exports: [AudioService, DemoAudioService],
})
export class AudioModule {}
