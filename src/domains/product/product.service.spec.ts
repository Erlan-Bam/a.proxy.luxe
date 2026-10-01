import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
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
    totalPrice: 2.4,
    orderId: 'original-provider-order',
    orderNumber: 'original-order-number',
    end_date: '22.07.2026',
    residentFulfillment: null,
    createdAt: new Date('2026-06-23T12:00:00Z'),
    updatedAt: new Date('2026-06-23T12:00:00Z'),
  };
  let orders: Record<string, any>[];
  let balance: number;
  let residentPackage: {
    package_key: string;
    traffic_limit: string;
    is_active: boolean;
    expired_at: string | { date: string };
  };

  function matchesOrder(
    candidate: Record<string, any>,
    where: Record<string, any>,
  ) {
    return Object.entries(where).every(([field, condition]) => {
      if (field === 'OR') {
        return condition.some((branch) => matchesOrder(candidate, branch));
      }
      const value = candidate[field];
      if (condition !== null && typeof condition === 'object') {
        if ('in' in condition) return condition.in.includes(value);
        if ('path' in condition) {
          return (
            condition.path.reduce((current, key) => current?.[key], value) ===
            condition.equals
          );
        }
        if ('not' in condition) {
          return !isDeepStrictEqual(value, condition.not === Prisma.DbNull ? null : condition.not);
        }
        if ('equals' in condition) {
          return isDeepStrictEqual(value, condition.equals === Prisma.DbNull ? null : condition.equals);
        }
        if ('gt' in condition) return value > condition.gt;
        throw new Error(`Unsupported order filter: ${field}`);
      }
      return value === condition;
    });
  }

  function updateOrder(
    candidate: Record<string, any>,
    data: Record<string, any>,
  ) {
    Object.assign(
      candidate,
      structuredClone({
        ...data,
        ...('totalPrice' in data && { totalPrice: Number(data.totalPrice) }),
        ...('partnerCommission' in data && { partnerCommission: String(data.partnerCommission) }),
      }),
    );
    return structuredClone(candidate);
  }

  const prisma = {
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(),
  };

  let service: ProductService;
  let proxySeller: {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-07-23T23:30:00Z') });
    orders = [structuredClone(order)];
    balance = 10;
    residentPackage = {
      package_key: 'resident-package',
      traffic_limit: String(1024 ** 3),
      is_active: true,
      expired_at: { date: '2026-07-22 23:59:59.000000' },
    };

    service = new ProductService(
      {
        get: jest.fn().mockReturnValue('test-key'),
      } as unknown as ConfigService,
      prisma as any,
    );
    jest
      .spyOn(service, 'withResidentLock')
      .mockImplementation(async (_userId, action) => action());
    proxySeller = {
      get: jest.fn(),
      post: jest.fn(),
    };
    (service as any).proxySeller = proxySeller;

    prisma.order.findUnique.mockImplementation(async ({ where }) => {
      return structuredClone(
        orders.find((candidate) => matchesOrder(candidate, where)) ?? null,
      );
    });
    prisma.order.findFirst.mockImplementation(async ({ where, orderBy }) => {
      const candidates = orders.filter((candidate) =>
        matchesOrder(candidate, where),
      );
      if (orderBy?.createdAt) {
        candidates.sort(
          (a, b) =>
            (a.createdAt.getTime() - b.createdAt.getTime()) *
            (orderBy.createdAt === 'asc' ? 1 : -1),
        );
      }
      return structuredClone(candidates[0] ?? null);
    });
    prisma.order.update.mockImplementation(async ({ where, data }) => {
      const candidate = orders.find((candidate) =>
        matchesOrder(candidate, where),
      );
      if (!candidate) throw new Error(`Order not found: ${where.id}`);
      return updateOrder(candidate, data);
    });
    prisma.order.updateMany.mockImplementation(async ({ where, data }) => {
      const candidates = orders.filter((candidate) =>
        matchesOrder(candidate, where),
      );
      candidates.forEach((candidate) => updateOrder(candidate, data));
      return { count: candidates.length };
    });
    prisma.order.create.mockImplementation(async ({ data }) => {
      const created = {
        id: `renewal-order-${orders.length}`,
        orderId: null,
        orderNumber: null,
        proxySellerId: null,
        residentFulfillment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...structuredClone(data),
      };
      orders.push(created);
      return structuredClone(created);
    });
    prisma.user.findUnique.mockImplementation(async ({ where }) => {
      return where.id === order.userId
        ? { id: order.userId, balance, referredBy: null }
        : null;
    });
    prisma.user.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.id !== order.userId || balance < Number(where.balance.gte)) {
        return { count: 0 };
      }
      balance -= Number(data.balance.decrement);
      return { count: 1 };
    });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));

    jest.spyOn(service, 'getProductReferenceByType').mockResolvedValue({
      status: 'success',
      tariffs: [
        { id: 101, name: '1 Gb', personal: true },
        { id: 103, name: '3 Gb', personal: true },
      ],
    } as any);
    proxySeller.get.mockImplementation(async (path: string) => {
      if (path === '/resident/package') {
        return {
          data: {
            status: 'success',
            data: {
              package_key: 'main-package',
              is_active: true,
              expired_at: { date: '2026-08-23 23:59:59.000000' },
            },
          },
        };
      }
      if (path === '/residentsubuser/packages') {
        return {
          data: { status: 'success', data: [structuredClone(residentPackage)] },
        };
      }
      throw new Error(`Unexpected provider GET: ${path}`);
    });
    proxySeller.post.mockImplementation(async (path: string, data: any) => {
      if (path === '/order/make') {
        return {
          data: {
            status: 'success',
            data: {
              orderId: 12345,
              listBaseOrderNumbers: ['resident-renewal-12345'],
            },
          },
        };
      }
      if (path === '/residentsubuser/update') {
        Object.assign(residentPackage, data);
        return {
          data: { status: 'success', data: structuredClone(residentPackage) },
        };
      }
      throw new Error(`Unexpected provider POST: ${path}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function expectRenewal(
    tariff: string,
    tariffId: number,
    price: number,
    trafficLimit: string,
  ) {
    expect(proxySeller.post).toHaveBeenCalledTimes(2);
    expect(proxySeller.post).toHaveBeenNthCalledWith(
      1,
      '/order/make',
      { tarifId: tariffId, paymentId: 1 },
      { timeout: 30000 },
    );
    expect(proxySeller.post).toHaveBeenNthCalledWith(
      2,
      '/residentsubuser/update',
      expect.objectContaining({
        package_key: 'resident-package',
        traffic_limit: trafficLimit,
        expired_at: '22.08.2026',
      }),
      { timeout: 30000 },
    );
    expect(residentPackage).toEqual(
      expect.objectContaining({
        package_key: 'resident-package',
        traffic_limit: trafficLimit,
        is_active: true,
        expired_at: '22.08.2026',
      }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    const debit = prisma.user.updateMany.mock.calls[0][0];
    expect(debit.where.id).toBe(order.userId);
    expect(Number(debit.where.balance.gte)).toBe(price);
    expect(Number(debit.data.balance.decrement)).toBe(price);
    expect(balance).toBeCloseTo(10 - price);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: order.userId,
        type: 'resident',
        status: 'PENDING',
        tariff,
        totalPrice: price,
      }),
    });
    expect(orders).toHaveLength(2);
    expect(orders.find((candidate) => candidate.id === order.id)).toEqual({
      ...order,
      proxySellerId: null,
    });
    expect(
      orders.find((candidate) => candidate.id === 'renewal-order-1'),
    ).toEqual(
      expect.objectContaining({
        userId: order.userId,
        type: 'resident',
        status: 'PAID',
        tariff,
        totalPrice: price,
        proxySellerId: 'resident-package',
        orderId: '12345',
        orderNumber: 'resident-renewal-12345',
        end_date: '22.08.2026',
        residentFulfillment: expect.objectContaining({
          stage: 'applied',
          sourceOrderId: order.id,
          packageKey: 'resident-package',
          baseline: String(1024 ** 3),
          target: trafficLimit,
          charge: String(price),
          expiry: '22.08.2026',
        }),
      }),
    );
  }

  it('renews the package with the original tariff and debits its price', async () => {
    const request = {
      orderId: order.id,
      packageKey: 'resident-package',
      user: { id: order.userId } as any,
    };
    const result = await service.prolongResident(request);

    expect(await service.prolongResident(request)).toEqual(result);
    expectRenewal('1 Gb', 101, 2.4, String(2 * 1024 ** 3));
    expect(result).toEqual({
      message: 'Successfully finished order',
      status: 'success',
      type: 'resident',
      orderId: 'renewal-order-1',
      price: 2.4,
      balance: 7.6,
      date_end: '22.08.2026',
      tariff: '1 Gb',
    });
  });

  it('renews the package with the tariff selected by the user', async () => {
    const request = {
      orderId: order.id,
      packageKey: 'resident-package',
      tariff: '3 Gb',
      user: { id: order.userId } as any,
    };
    const result = await service.prolongResident(request);

    expect(await service.prolongResident(request)).toEqual(result);
    expectRenewal('3 Gb', 103, 7, String(4 * 1024 ** 3));
    expect(result).toEqual({
      message: 'Successfully finished order',
      status: 'success',
      type: 'resident',
      orderId: 'renewal-order-1',
      price: 7,
      balance: 3,
      date_end: '22.08.2026',
      tariff: '3 Gb',
    });
  });

  it('rejects an order that does not belong to the user', async () => {
    await expect(
      service.prolongResident({
        orderId: order.id,
        packageKey: 'resident-package',
        user: { id: 'another-user' } as any,
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(proxySeller.get).not.toHaveBeenCalled();
    expect(proxySeller.post).not.toHaveBeenCalled();
    expect(service.getProductReferenceByType).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(orders).toEqual([order]);
    expect(balance).toBe(10);
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
