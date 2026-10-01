import { ConfigService } from '@nestjs/config';
import { UserService } from '../v1/user/user.service';
import { ProductService } from './product.service';

describe('balance guards preserve resident reservations', () => {
  it('does not let an admin removal overdraft a balance changed since its initial read', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ balance: 10 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new UserService(prisma as any, {} as any);
    await expect(
      service.removeBalance({
        user: { type: 'ADMIN' },
        email: 'fixture@invalid',
        amount: 10,
      } as any),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'fixture@invalid', balance: { gte: 10 } },
      data: { balance: { decrement: 10 } },
    });
  });

  it('still removes up to the available balance through the admin endpoint', async () => {
    const updated = { id: 'customer', balance: 0 };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ balance: 2 })
          .mockResolvedValue(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new UserService(prisma as any, {} as any);
    expect(
      await service.removeBalance({
        user: { type: 'ADMIN' },
        email: 'fixture@invalid',
        amount: 10,
      } as any),
    ).toEqual(updated);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 2 } } }),
    );
  });

  it.each(['isp', 'ipv6'])(
    'does not let a competing %s renewal spend reserved funds',
    async (type) => {
      const prisma = {
        order: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'order', userId: 'customer' }),
          update: jest.fn(),
          create: jest.fn(),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ balance: 10 }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const service = new ProductService(new ConfigService(), prisma as any);
      (service as any).proxySeller = {
        post: jest
          .fn()
          .mockResolvedValue({
            data: { status: 'success', data: { orderId: 'provider' } },
          }),
      };
      await expect(
        service.prolongProxy({
          orderId: 'order',
          id: 'proxy-1',
          type,
          periodId: '1m',
        } as any),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    },
  );
});
