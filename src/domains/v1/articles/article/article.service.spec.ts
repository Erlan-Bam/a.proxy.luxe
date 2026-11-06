import { Language } from '@prisma/client';
import { ArticleService } from './article.service';

describe('ArticleService pagination', () => {
  const prisma = {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const service = new ArticleService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns every article in the paginated response when requested', async () => {
    const articles = [{ id: 'first' }, { id: 'second' }];
    prisma.article.findMany.mockResolvedValue(articles);
    prisma.article.count.mockResolvedValue(articles.length);

    const result = await service.findAllPaginated(3, null, Language.ru);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything(),
        take: expect.anything(),
      }),
    );
    expect(result).toMatchObject({
      data: articles,
      total: 2,
      page: 1,
      limit: 2,
      totalPages: 1,
    });
  });
});

describe('ArticleService translations', () => {
  const prisma = {
    article: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const service = new ArticleService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns the Russian counterpart when a requested English slug has lang=ru', async () => {
    const english = { id: 'en-id', lang: Language.en, slug: 'english', translation: { id: 'ru-id', lang: Language.ru, slug: 'russian' }, translatedBy: null };
    const russian = { id: 'ru-id', lang: Language.ru, slug: 'russian', translation: null, translatedBy: { id: 'en-id', lang: Language.en, slug: 'english' } };
    prisma.article.findFirst.mockResolvedValueOnce(english).mockResolvedValueOnce(russian);

    const result = await service.findOne('english', Language.ru);

    expect(result).toMatchObject({ id: 'ru-id', lang: Language.ru, translation: { slug: 'english' } });
  });

  it('does not return an article in the wrong language when no translation exists', async () => {
    prisma.article.findFirst.mockResolvedValue({ id: 'en-id', lang: Language.en, slug: 'english', translation: null, translatedBy: null });

    await expect(service.findOne('english', Language.ru)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects pairing articles in the same language', async () => {
    prisma.article.findUnique
      .mockResolvedValueOnce({ id: 'first', lang: Language.en })
      .mockResolvedValueOnce({ id: 'second', lang: Language.en });

    await expect(service.setTranslation('first', 'second')).rejects.toMatchObject({ status: 400 });
    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('rejects a Russian article that already has another English pair', async () => {
    prisma.article.findUnique
      .mockResolvedValueOnce({ id: 'new-en', lang: Language.en })
      .mockResolvedValueOnce({ id: 'ru', lang: Language.ru });
    prisma.article.findFirst.mockResolvedValueOnce({ id: 'old-en' });

    await expect(service.setTranslation('new-en', 'ru')).rejects.toMatchObject({ status: 409 });
    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('links an English article to its Russian translation', async () => {
    prisma.article.findUnique
      .mockResolvedValueOnce({ id: 'en', lang: Language.en })
      .mockResolvedValueOnce({ id: 'ru', lang: Language.ru });
    prisma.article.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'en', lang: Language.en, slug: 'english', translation: { id: 'ru', lang: Language.ru, slug: 'russian' }, translatedBy: null });
    prisma.article.update.mockResolvedValue({ id: 'en' });

    const result = await service.setTranslation('en', 'ru');

    expect(prisma.article.update).toHaveBeenCalledWith({ where: { id: 'en' }, data: { translationId: 'ru' } });
    expect(result).toMatchObject({ translation: { slug: 'russian' } });
  });
});
