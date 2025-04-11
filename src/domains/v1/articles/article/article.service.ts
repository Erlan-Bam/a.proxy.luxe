import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PrismaService } from '../../shared/prisma.service';
import { Article, Language } from '@prisma/client';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createArticleDto: CreateArticleDto) {
    return await this.prisma.article.create({
      data: {
        title: createArticleDto.title,
        content: createArticleDto.content,
        images: createArticleDto.images,
        lang: createArticleDto.lang,
      },
    });
  }

  async findAll(page = 1, limit = 10, lang: Language = 'ru') {
    const skip = (page - 1) * limit;
    return await this.prisma.article.findMany({
      skip,
      take: limit,
      where: { lang: lang },
    });
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  async update(id: string, updateArticleDto: UpdateArticleDto) {
    const article = await this.findOne(id);
    if (!article) {
      throw new HttpException('Article not found', 404);
    }
    return this.prisma.article.update({
      where: { id },
      data: {
        title: updateArticleDto.title ?? article.title,
        content: updateArticleDto.content ?? article.content,
        images: updateArticleDto.images ?? article.images,
        lang: updateArticleDto.lang ?? article.lang,
      },
    });
  }

  async remove(id: string): Promise<Article> {
    return await this.prisma.article.delete({ where: { id } });
  }
}
