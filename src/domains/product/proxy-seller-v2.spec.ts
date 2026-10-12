import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('Proxy-Seller v2 purchase contract', () => {
  it('accepts reference lists without the legacy target field', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.get = jest.fn().mockResolvedValue({
      data: {
        status: 'success',
        data: {
          items: {
            tarifs: [{ id: '10-gb-ind2', name: '10 GB', personal: true }],
          },
        },
      },
    });
    await expect(
      service.getProductReferenceByType('resident'),
    ).resolves.toMatchObject({
      status: 'success',
      targets: [],
      tariffs: [{ id: '10-gb-ind2', name: '10 Gb' }],
    });
  });

  it('uses the v2 API and selects provider balance for nonresident orders', async () => {
    const service = new ProductService(
      new ConfigService({ PROXY_SELLER: 'test-key' }),
      {} as any,
    );
    const api = (service as any).proxySeller;
    expect(api.defaults.baseURL).toBe(
      'https://proxy-seller.com/personal/api/v2/test-key',
    );
    api.post = jest.fn().mockResolvedValue({
      data: {
        status: 'success',
        data: {
          orderId: 123,
          listBaseOrderNumbers: ['NS-123'],
        },
      },
    });
    await service.placeOrder({
      type: 'isp',
      userId: 'customer',
      paymentId: 1,
      countryId: 1,
      periodId: '1m',
      quantity: 1,
    } as any);
    expect(api.post).toHaveBeenCalledWith(
      '/order/make',
      expect.objectContaining({
        paymentId: 'balance',
        sectionCode: 'isp',
      }),
    );
  });

  it('selects provider balance when extending an ISP proxy', async () => {
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'order',
            userId: 'customer',
            type: 'isp',
            end_date: '30.10.2026',
          }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ balance: 10 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new ProductService(new ConfigService(), prisma as any);
    const api = (service as any).proxySeller;
    api.post = jest
      .fn()
      .mockResolvedValue({
        data: { status: 'success', data: { orderId: 42 } },
      });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await service.prolongProxy({
        orderId: 'order',
        type: 'isp',
        id: '42',
        periodId: '1m',
      } as any);
      expect(api.post).toHaveBeenCalledWith(
        '/prolong/make/isp',
        expect.objectContaining({
          paymentId: 'balance',
        }),
      );
    } finally {
      jest.restoreAllMocks();
    }
  });
});
