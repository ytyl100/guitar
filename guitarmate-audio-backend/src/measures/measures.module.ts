import { Module } from '@nestjs/common';
import { MeasuresController } from './measures.controller';
import { MeasuresService } from './measures.service';
import { AudioModule } from '../audio/audio.module';
import { OssModule } from '../oss/oss.module';

@Module({
  imports: [AudioModule, OssModule],
  controllers: [MeasuresController],
  providers: [MeasuresService],
  exports: [MeasuresService],
})
export class MeasuresModule {}
