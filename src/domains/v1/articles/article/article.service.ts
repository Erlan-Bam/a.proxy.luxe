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

    // Create article first
    const article = await this.prisma.article.create({
      data: {
        title: createArticleDto.title,
        content: createArticleDto.content,
        images: createArticleDto.images,
        mainImage: createArticleDto.mainImage,
        lang: createArticleDto.lang,
        slug,
      },
    });

    // Handle tags if provided
    if (createArticleDto.tags && createArticleDto.tags.length > 0) {
      await this.updateArticleTags(article.id, createArticleDto.tags);
    }

    return this.findOne(article.id);
  }

  async findAll(page = 1, limit = 10, lang: Language = 'ru') {
    const skip = (page - 1) * limit;
    return await this.prisma.article.findMany({
      skip,
      take: limit,
      where: { lang: lang },
      include: {
        tags: true,
      },
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
      include: {
        tags: true,
      },
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

  async createTag(name: string) {
    return this.prisma.tag.create({
      data: { name },
    });
  }

  async getAllTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async deleteTag(id: string) {
    return this.prisma.tag.delete({
      where: { id },
    });
  }

  async updateArticleTags(articleId: string, tagNames: string[]) {
    const article = await this.findOne(articleId);
    if (!article) {
      throw new HttpException('Article not found', 404);
    }

    // Найти или создать теги
    const tags = await Promise.all(
      tagNames.map(async (name) => {
        return this.prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }),
    );

    // Обновить связи статьи с тегами
    return this.prisma.article.update({
      where: { id: articleId },
      data: {
        tags: {
          set: [], // Сначала удаляем все связи
          connect: tags.map((tag) => ({ id: tag.id })), // Затем добавляем новые
        },
      },
      include: {
        tags: true,
      },
    });
  }

  async getArticlesByTag(
    tagName: string,
    page = 1,
    limit = 10,
    lang: Language = 'ru',
  ) {
    const skip = (page - 1) * limit;

    return this.prisma.article.findMany({
      where: {
        lang,
        tags: {
          some: {
            name: tagName,
          },
        },
      },
      include: {
        tags: true,
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}
