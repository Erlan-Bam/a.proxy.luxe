import { Module } from '@nestjs/common';
import { MainImageController } from './main-image.controller';
import { ArticleModule } from '../article/article.module';

@Module({
  imports: [ArticleModule],
  controllers: [MainImageController],
})
export class MainImageModule {}
