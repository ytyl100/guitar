import { Module } from '@nestjs/common';
import { PublishedController } from './published.controller';
import { MeasuresModule } from '../measures/measures.module';
import { PracticePackageService } from './practice-package.service';
import { PublishedLibraryService } from './published-library.service';
import { TabRenderService } from './tab-render.service';

@Module({
  imports: [MeasuresModule],
  controllers: [PublishedController],
  providers: [PracticePackageService, PublishedLibraryService, TabRenderService],
  exports: [PracticePackageService, PublishedLibraryService, TabRenderService],
})
export class PublishedModule {}
