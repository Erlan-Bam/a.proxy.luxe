import { ErrorLogService } from './error-log.service';

describe('ErrorLogService pagination', () => {
  const prisma = {
    errorLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  const service = new ErrorLogService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns every error log when pagination is disabled', async () => {
    const logs = [{ id: 'first' }, { id: 'second' }];
    prisma.errorLog.findMany.mockResolvedValue(logs);
    prisma.errorLog.count.mockResolvedValue(logs.length);

    const result = await service.findAll(4, null);

    expect(prisma.errorLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toMatchObject({
      data: logs,
      total: 2,
      page: 1,
      limit: 2,
      totalPages: 1,
    });
  });
});
