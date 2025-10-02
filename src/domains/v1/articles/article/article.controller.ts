import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  ParseEnumPipe,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ArticleService } from './article.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { baseUrl } from 'src/main';
import { Language } from '@prisma/client';

@Controller('v1/articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  create(
    @UploadedFiles() files: any[],
    @Body() createArticleDto: CreateArticleDto,
  ) {
    const imageUrls = files.map(
      (file) => `${baseUrl}/uploads/${file.filename}`,
    );
    createArticleDto.images = imageUrls;
    return this.articleService.create(createArticleDto);
  }

  @Get()
  findAll(
    @Query('lang', new ParseEnumPipe(Language)) lang: Language,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const pageNumber = parseInt(page as any, 10);
    const limitNumber = parseInt(limit as any, 10);
    return this.articleService.findAll(pageNumber, limitNumber, lang);
  }

  @Post('upload-image')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Allow only image files
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
  uploadImage(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const imageUrl = `${baseUrl}/uploads/${file.filename}`;
    return {
      imageUrl,
      message: 'Image uploaded successfully',
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articleService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  update(
    @Param('id') id: string,
    @UploadedFiles() files: any[],
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    if (files?.length) {
      const imageUrls = files.map(
        (file) => `${baseUrl}/uploads/${file.filename}`,
      );
      updateArticleDto.images = imageUrls;
    }

    return this.articleService.update(id, updateArticleDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  remove(@Param('id') id: string) {
    return this.articleService.remove(id);
  }
}
