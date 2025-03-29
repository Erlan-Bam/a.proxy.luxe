import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createArticleDto: CreateArticleDto) {
    return this.prisma.article.create({
      data: {
        title: createArticleDto.title,
        content: createArticleDto.content,
        images: createArticleDto.images,
      },
    });
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    return await this.prisma.article.findMany({
      skip,
      take: limit,
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
    return this.prisma.article.update({
      where: { id },
      data: {
        title: updateArticleDto.title ?? article.title,
        content: updateArticleDto.content ?? article.content,
        images: updateArticleDto.images ?? article.images,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.article.delete({ where: { id } });
  }
}
