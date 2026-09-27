import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';

describe('PaymentService.getPaymentHistory', () => {
  it('returns both Proxy-Seller order identifiers for the admin log', async () => {
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PaymentService(
      { get: jest.fn() } as unknown as ConfigService,
      prisma as any,
    );

    await service.getPaymentHistory('user-id');

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          orderId: true,
          orderNumber: true,
        }),
      }),
    );
  });
});
