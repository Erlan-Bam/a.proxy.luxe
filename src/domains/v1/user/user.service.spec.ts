import { UserType } from '@prisma/client';
import { UserService } from './user.service';

describe('UserService promo codes', () => {
  const prisma = {
    coupon: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  const service = new UserService(prisma as never, {} as never);
  const admin = { id: 'admin-id', type: UserType.ADMIN } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an admin promo code without assigning it to the admin account', async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);
    prisma.coupon.create.mockResolvedValue({ code: 'SUMMER25' });

    await service.addPromocode({
      user: admin,
      promocode: ' summer25 ',
      discount: 25,
      limit: 100,
    });

    expect(prisma.coupon.create).toHaveBeenCalledWith({
      data: {
        code: 'SUMMER25',
        discount: 25,
        limit: 100,
      },
    });
  });

  it('rejects a duplicate admin promo code before attempting to create it', async () => {
    prisma.coupon.findUnique.mockResolvedValue({ code: 'SUMMER25' });

    await expect(
      service.addPromocode({
        user: admin,
        promocode: 'SUMMER25',
        discount: 25,
        limit: 100,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(prisma.coupon.create).not.toHaveBeenCalled();
  });

  it('lets an admin delete a promo code by its code', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      code: 'SUMMER25',
      userId: null,
    });
    prisma.coupon.delete.mockResolvedValue({ code: 'SUMMER25' });

    await service.deletePromocode(admin, ' summer25 ');

    expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
      where: { code: 'SUMMER25' },
    });
    expect(prisma.coupon.delete).toHaveBeenCalledWith({
      where: { code: 'SUMMER25' },
    });
  });

  it('returns the complete user list when pagination is disabled', async () => {
    const users = [
      { id: 'new-user', email: 'new@example.com' },
      { id: 'old-user', email: 'old@example.com' },
    ];
    prisma.user.findMany.mockResolvedValue(users);
    prisma.user.count.mockResolvedValue(users.length);

    const result = await service.getUsersInfo(admin, 7, null);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything(),
        take: expect.anything(),
      }),
    );
    expect(result).toMatchObject({
      data: users,
      total: 2,
      page: 1,
      limit: 2,
      totalPages: 1,
    });
  });
});
