import { ConfigService } from '@nestjs/config';
import { ProviderOrderRejectedException } from './provider-order-rejected.exception';
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

  it('classifies an explicit upstream rejection as safe to retry', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: 'Forbidden' } },
    });

    await expect(
      service.placeOrder({
        type: 'ipv6',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'GBR',
        periodId: '1m',
        paymentId: 1,
        quantity: 13,
        protocol: 'SOCKS5',
      } as any),
    ).rejects.toBeInstanceOf(ProviderOrderRejectedException);
  });

  it('does not classify an upstream server error as safe to retry', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 502 },
    });

    await expect(
      service.placeOrder({
        type: 'ipv6',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'GBR',
        periodId: '1m',
        paymentId: 1,
        quantity: 13,
        protocol: 'SOCKS5',
      } as any),
    ).rejects.not.toBeInstanceOf(ProviderOrderRejectedException);
  });

  it('classifies a provider business error as safe to retry', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockResolvedValue({
      data: {
        status: 'error',
        errors: [{ message: 'Order cannot be fulfilled' }],
      },
    });

    await expect(
      service.placeOrder({
        type: 'isp',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'USA',
        periodId: '1m',
        paymentId: 1,
        quantity: 1,
      } as any),
    ).rejects.toBeInstanceOf(ProviderOrderRejectedException);
  });

  it('keeps a malformed success response for manual reconciliation', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockResolvedValue({
      data: { status: 'success', data: {} },
    });

    await expect(
      service.placeOrder({
        type: 'isp',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'USA',
        periodId: '1m',
        paymentId: 1,
        quantity: 1,
      } as any),
    ).rejects.not.toBeInstanceOf(ProviderOrderRejectedException);
  });

  it('keeps a malformed response without a status for manual reconciliation', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockResolvedValue({ data: {} });

    await expect(
      service.placeOrder({
        type: 'isp',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'USA',
        periodId: '1m',
        paymentId: 1,
        quantity: 1,
      } as any),
    ).rejects.not.toBeInstanceOf(ProviderOrderRejectedException);
  });

  it('does not classify a no-response transport failure as safe to retry', async () => {
    const service = new ProductService(new ConfigService(), {} as any);
    const api = (service as any).proxySeller;
    api.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      request: {},
      message: 'timeout',
    });

    await expect(
      service.placeOrder({
        type: 'ipv6',
        orderId: 'local-order',
        userId: 'customer',
        countryId: 'GBR',
        periodId: '1m',
        paymentId: 1,
        quantity: 13,
        protocol: 'SOCKS5',
      } as any),
    ).rejects.not.toBeInstanceOf(ProviderOrderRejectedException);
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
