import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService resident active list', () => {
  const orders = [
    {
      id: 'old-order',
      proxySellerId: 'old-package',
      orderNumber: null,
      tariff: '1 Gb',
      totalPrice: 2.4,
      end_date: '10.09.2025',
    },
    {
      id: 'current-order',
      proxySellerId: 'current-package',
      orderNumber: 'current-number',
      tariff: '1 Gb',
      totalPrice: 2.4,
      end_date: '28.11.2026',
    },
  ];

  const prisma = { order: { findMany: jest.fn() } };
  let service: ProductService;
  let get: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue(orders);
    service = new ProductService(
      { get: () => 'test-key' } as unknown as ConfigService,
      prisma as never,
    );
    get = jest.fn(async (path: string) => {
      if (path === '/residentsubuser/packages') {
        return {
          data: {
            status: 'success',
            data: [
              { package_key: 'old-package', is_active: false },
              {
                package_key: 'current-package',
                is_active: true,
                expired_at: { date: '2026-11-28' },
              },
            ],
          },
        };
      }
      if (path === '/residentsubuser/lists?package_key=old-package') {
        return { data: { status: 'error', data: null } };
      }
      if (path === '/residentsubuser/lists?package_key=current-package') {
        return { data: { status: 'success', data: [{ id: 1 }] } };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    (service as any).proxySeller = { get };
  });

  it('shows the active package even when an older inactive package cannot list proxies', async () => {
    const result = await service.getActiveProxyList('user-id', 'resident');

    expect(result).toMatchObject({
      status: 'success',
      data: {
        items: [{ orderId: 'current-order', package_list: [{ id: 1 }] }],
      },
    });
    expect((result as any).data.items).toHaveLength(1);
    expect(get).not.toHaveBeenCalledWith(
      '/residentsubuser/lists?package_key=old-package',
    );
  });

  it('omits an old package missing from the provider package list', async () => {
    const originalGet = get.getMockImplementation();
    get.mockImplementation((path: string) =>
      path === '/residentsubuser/packages'
        ? Promise.resolve({
            data: {
              status: 'success',
              data: [{ package_key: 'current-package', is_active: true }],
            },
          })
        : originalGet!(path),
    );

    const result = await service.getActiveProxyList('user-id', 'resident');

    expect(result).toMatchObject({
      status: 'success',
      data: { items: [{ orderId: 'current-order' }] },
    });
    expect(get).not.toHaveBeenCalledWith(
      '/residentsubuser/lists?package_key=old-package',
    );
  });

  it('reports a provider error for a current active package', async () => {
    const originalGet = get.getMockImplementation();
    get.mockImplementation((path: string) =>
      path === '/residentsubuser/lists?package_key=current-package'
        ? Promise.resolve({ data: { status: 'error', data: null } })
        : originalGet!(path),
    );

    const result = await service.getActiveProxyList('user-id', 'resident');

    expect(result).toMatchObject({ status: 'error' });
    expect(get).toHaveBeenCalledWith(
      '/residentsubuser/lists?package_key=current-package',
    );
  });
});
