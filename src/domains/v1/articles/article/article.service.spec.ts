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
