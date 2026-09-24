import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { DemoAudioService } from './demo-audio.service';

@Module({
  providers: [AudioService, DemoAudioService],
  exports: [AudioService, DemoAudioService],
})
export class AudioModule {}
