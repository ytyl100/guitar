import { Module } from '@nestjs/common';
import { PublishedController } from './published.controller';
import { MeasuresModule } from '../measures/measures.module';
import { PracticePackageService } from './practice-package.service';

@Module({
  imports: [MeasuresModule],
  controllers: [PublishedController],
  providers: [PracticePackageService],
  exports: [PracticePackageService],
})
export class PublishedModule {}
