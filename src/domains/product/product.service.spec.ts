import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService.prolongResident', () => {
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    type: 'resident',
    status: 'PAID',
    proxySellerId: 'resident-package',
    tariff: '1 Gb',
    country: null,
    quantity: 1,
    proxyType: 'HTTPS',
    goal: 'surfing',
  };

  const prisma = {
    order: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: ProductService;
  let proxySeller: {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ProductService(
      { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService,
      prisma as any,
    );
    proxySeller = {
      get: jest.fn(),
      post: jest.fn(),
    };
    (service as any).proxySeller = proxySeller;

    prisma.order.findFirst.mockResolvedValue(order);
    prisma.user.findUnique.mockResolvedValue({
      id: order.userId,
      balance: 10,
    });
    prisma.user.update.mockResolvedValue({
      id: order.userId,
      balance: 7.6,
    });
    prisma.order.update.mockResolvedValue(order);
    prisma.order.create.mockResolvedValue({ id: 'renewal-order' });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));

    jest.spyOn(service, 'getProductReferenceByType').mockResolvedValue({
      status: 'success',
      tariffs: [
        { id: 101, name: '1 Gb', personal: true },
        { id: 103, name: '3 Gb', personal: true },
      ],
    } as any);
    jest
      .spyOn(service, 'getOneMonthLaterFormatted')
      .mockResolvedValue('22.08.2026');

    proxySeller.get.mockResolvedValue({
      data: {
        status: 'success',
        data: [
          {
            package_key: 'resident-package',
            traffic_limit: String(1024 ** 3),
            rotation: 60,
          },
        ],
      },
    });
    proxySeller.post.mockImplementation((path: string) => {
      if (path === '/order/make') {
        return Promise.resolve({
          data: {
            status: 'success',
            data: {
              orderId: 12345,
              listBaseOrderNumbers: ['resident-renewal-12345'],
            },
          },
        });
      }

      return Promise.resolve({
        data: {
          status: 'success',
          data: { package_key: 'resident-package' },
        },
      });
    });
  });

  it('renews the package with the original tariff and debits its price', async () => {
    const result = await service.prolongResident({
      orderId: order.id,
      packageKey: 'resident-package',
      user: { id: order.userId } as any,
    });

    expect(proxySeller.post).toHaveBeenNthCalledWith(1, '/order/make', {
      tarifId: 101,
      paymentId: 1,
    });
    expect(proxySeller.post).toHaveBeenNthCalledWith(
      2,
      '/residentsubuser/update',
      expect.objectContaining({
        package_key: 'resident-package',
        traffic_limit: String(2 * 1024 ** 3),
        expired_at: '22.08.2026',
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: order.userId },
      data: { balance: { decrement: 2.4 } },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: order.id },
      data: {
        end_date: '22.08.2026',
        tariff: '1 Gb',
        totalPrice: 2.4,
        orderNumber: 'resident-renewal-12345',
      },
    });
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: '12345',
        orderNumber: 'resident-renewal-12345',
      }),
    });
    expect(result).toEqual({
      status: 'success',
      price: 2.4,
      balance: 7.6,
      date_end: '22.08.2026',
      tariff: '1 Gb',
    });
  });

  it('renews the package with the tariff selected by the user', async () => {
    prisma.user.update.mockResolvedValue({
      id: order.userId,
      balance: 3,
    });

    const result = await service.prolongResident({
      orderId: order.id,
      packageKey: 'resident-package',
      tariff: '3 Gb',
      user: { id: order.userId } as any,
    });

    expect(proxySeller.post).toHaveBeenNthCalledWith(1, '/order/make', {
      tarifId: 103,
      paymentId: 1,
    });
    expect(proxySeller.post).toHaveBeenNthCalledWith(
      2,
      '/residentsubuser/update',
      expect.objectContaining({
        package_key: 'resident-package',
        traffic_limit: String(4 * 1024 ** 3),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: order.userId },
      data: { balance: { decrement: 7 } },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: order.id },
      data: {
        end_date: '22.08.2026',
        tariff: '3 Gb',
        totalPrice: 7,
        orderNumber: 'resident-renewal-12345',
      },
    });
    expect(result).toEqual({
      status: 'success',
      price: 7,
      balance: 3,
      date_end: '22.08.2026',
      tariff: '3 Gb',
    });
  });

  it('rejects an order that does not belong to the user', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.prolongResident({
        orderId: order.id,
        packageKey: 'resident-package',
        user: { id: 'another-user' } as any,
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(proxySeller.get).not.toHaveBeenCalled();
    expect(proxySeller.post).not.toHaveBeenCalled();
  });
});

describe('ProductService.modifyProxyResident', () => {
  const activePackage = {
    package_key: 'f39a0c1d4fafa09c189a',
    is_active: true,
    expired_at: { date: '2026-06-12 23:59:59.000000' },
    traffic_left: '1073741824',
  };

  function createService() {
    const service = new ProductService(new ConfigService(), {} as any);
    const proxySeller = {
      get: jest.fn().mockResolvedValue({
        data: {
          data: [activePackage],
        },
      }),
      post: jest.fn().mockResolvedValue({
        data: {
          status: 'success',
          data: {
            id: 20431569,
          },
          errors: [],
        },
      }),
    };

    (service as any).proxySeller = proxySeller;

    return { service, proxySeller };
  }

  it.each([
    ['null rotation from JSON NaN', null],
    ['each_request rotation alias', 'each_request'],
  ])(
    'normalizes %s to ProxySeller per-request rotation',
    async (_name, rotation) => {
      const { service, proxySeller } = createService();

      await service.modifyProxyResident({
        package_key: activePackage.package_key,
        ports: 1,
        whitelist: '',
        title: 'avitoria',
        rotation,
        geo: { country: 'RU' },
      } as any);

      expect(proxySeller.post).toHaveBeenCalledWith(
        'residentsubuser/list/add',
        expect.objectContaining({
          rotation: 0,
        }),
      );
    },
  );
});
