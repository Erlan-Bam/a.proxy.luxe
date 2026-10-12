import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('Proxy-Seller v2 purchase contract', () => {
  it('serves the purchase catalog locally without calling Proxy-Seller', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const get = jest.fn();
    (service as any).proxySeller.get = get;

    await expect(service.getProductReference()).resolves.toMatchObject({
      status: 'success',
      isp: {
        country: expect.arrayContaining([
          expect.objectContaining({ id: 'USA' }),
        ]),
      },
      ipv6: {
        country: expect.arrayContaining([
          expect.objectContaining({ id: 'DEU' }),
        ]),
      },
      resident: {
        tariffs: expect.arrayContaining([
          expect.objectContaining({ id: 25208 }),
          expect.objectContaining({ id: 25209 }),
        ]),
      },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the local catalog stable between requests', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const first = await service.getProductReference();
    await expect(service.getProductReference()).resolves.toEqual(first);
  });

  it('serves resident tariff references locally without calling Proxy-Seller', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.get = jest.fn();
    await expect(
      service.getProductReferenceByType('resident'),
    ).resolves.toMatchObject({
      status: 'success',
      targets: [],
      tariffs: expect.arrayContaining([
        { id: 25208, name: '1 Gb', personal: true },
        { id: 25209, name: '3 Gb', personal: true },
      ]),
    });
    expect(api.get).not.toHaveBeenCalled();
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
        findUnique: jest.fn().mockResolvedValue({
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
    api.post = jest.fn().mockResolvedValue({
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
