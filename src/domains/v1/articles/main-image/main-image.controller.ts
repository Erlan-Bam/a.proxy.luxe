import {
  Controller,
  Param,
  Patch,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ArticleService } from '../article/article.service';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { baseUrl } from 'src/main';
import { SetMainImageUrlDto } from './dto/set-main-image-url.dto';

@Controller('v1/articles/main-image')
export class MainImageController {
  constructor(private readonly articleService: ArticleService) {}

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @UseInterceptors(
    FileInterceptor('mainImage', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `main-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only image files are allowed'), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  )
  setMainImage(@Param('id') id: string, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const mainImageUrl = `${baseUrl}/uploads/${file.filename}`;
    return this.articleService.setMainImage(id, mainImageUrl);
  }

  @Patch(':id/url')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  setMainImageByUrl(
    @Param('id') id: string,
    @Body() setMainImageUrlDto: SetMainImageUrlDto,
  ) {
    return this.articleService.setMainImage(
      id,
      setMainImageUrlDto.mainImageUrl,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  removeMainImage(@Param('id') id: string) {
    return this.articleService.removeMainImage(id);
  }
}
