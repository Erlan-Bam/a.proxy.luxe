import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { PrismaService } from '../../shared/prisma.service';
import { Article, Language } from '@prisma/client';
import slugify from 'slugify';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  private generateSlug(title: string): string {
    return slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()"!:@]/g,
    });
  }

  async create(createArticleDto: CreateArticleDto) {
    const slug = this.generateSlug(createArticleDto.title);
    return await this.prisma.article.create({
      data: {
        title: createArticleDto.title,
        content: createArticleDto.content,
        images: createArticleDto.images,
        mainImage: createArticleDto.mainImage,
        lang: createArticleDto.lang,
        slug,
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

  async findOne(identifier: string) {
    // Check if identifier is a UUID (for backward compatibility with admin panel)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const article = await this.prisma.article.findFirst({
      where: isUUID ? { id: identifier } : { slug: identifier },
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

    const updateData: any = {
      title: updateArticleDto.title ?? article.title,
      content: updateArticleDto.content ?? article.content,
      images: updateArticleDto.images ?? article.images,
      mainImage: updateArticleDto.mainImage ?? article.mainImage,
      lang: updateArticleDto.lang ?? article.lang,
    };

    // If title is being updated, regenerate slug
    if (updateArticleDto.title && updateArticleDto.title !== article.title) {
      updateData.slug = this.generateSlug(updateArticleDto.title);
    }

    return this.prisma.article.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<Article> {
    return await this.prisma.article.delete({ where: { id } });
  }

  async setMainImage(id: string, mainImage: string) {
    const article = await this.findOne(id);
    if (!article) {
      throw new HttpException('Article not found', 404);
    }

    return this.prisma.article.update({
      where: { id },
      data: { mainImage },
    });
  }

  async removeMainImage(id: string) {
    const article = await this.findOne(id);
    if (!article) {
      throw new HttpException('Article not found', 404);
    }

    return this.prisma.article.update({
      where: { id },
      data: { mainImage: null },
    });
  }
}
