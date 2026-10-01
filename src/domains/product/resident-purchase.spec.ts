import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { ProductService } from './product.service';

describe('resident purchase recovery', () => {
  const gb = 1073741824;
  let order: any;
  let prisma: any;
  let api: any;
  let service: ProductService;
  let packageInfo: any;
  let balance: number;

  function matchesOrder(candidate: any, where: Record<string, any>) {
    return Object.entries(where).every(([field, condition]) => {
      if (field === 'OR') {
        return condition.some((branch) => matchesOrder(candidate, branch));
      }
      const value = candidate[field];
      if (condition !== null && typeof condition === 'object') {
        if ('in' in condition) return condition.in.includes(value);
        if ('path' in condition) {
          return condition.path.reduce((current, key) => current?.[key], value) === condition.equals;
        }
        if ('equals' in condition) {
          return isDeepStrictEqual(value, condition.equals === Prisma.DbNull ? null : condition.equals);
        }
        if ('not' in condition) {
          return !isDeepStrictEqual(value, condition.not === Prisma.DbNull ? null : condition.not);
        }
        if ('gt' in condition) return value > condition.gt;
        throw new Error(`Unsupported order filter: ${field}`);
      }
      return value === condition;
    });
  }

  function updateMatchingOrder(candidate: any, { where, data }: any) {
    if (!matchesOrder(candidate, where)) return { count: 0 };
    Object.assign(candidate, structuredClone(data));
    return { count: 1 };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-01T05:45:50Z') });
    balance = 10;
    order = { id: 'checkout', userId: 'customer', type: 'resident', tariff: '1 Gb',
      status: 'PROCESSING', totalPrice: 2.4, orderId: null, orderNumber: null,
      residentFulfillment: null };
    packageInfo = { package_key: 'sub', traffic_limit: String(3 * gb),
      traffic_left: String(gb), is_active: true, rotation: 1,
      expired_at: { date: '2026-10-17 23:59:59.000000', timezone: 'UTC' } };
    const ownedOrder = { id: 'old', userId: 'customer', type: 'resident', status: 'PAID', proxySellerId: 'sub' };
    let transactionQueue = Promise.resolve();
    prisma = { order: {
      findUnique: jest.fn(async ({ where }) => matchesOrder(order, where) ? structuredClone(order) : null),
      findFirst: jest.fn(async ({ where }) => matchesOrder(ownedOrder, where) ? structuredClone(ownedOrder) : null),
      update: jest.fn(async (args) => {
        if (!updateMatchingOrder(order, args).count) throw new Error('Order not found');
        return structuredClone(order);
      }),
      updateMany: jest.fn(async (args) => updateMatchingOrder(order, args)),
    },
      $transaction: jest.fn((callback) => {
        const transaction = transactionQueue.then(async () => {
          const pendingOrder = structuredClone(order);
          let pendingBalance = balance;
          const result = await callback({
            $queryRaw: jest.fn(async () => []),
            user: {
              updateMany: jest.fn(async ({ where, data }) => {
                if (where.id !== order.userId || pendingBalance < Number(where.balance.gte)) return { count: 0 };
                pendingBalance -= Number(data.balance.decrement);
                return { count: 1 };
              }),
              update: jest.fn(async ({ where, data }) => {
                if (where.id !== order.userId) throw new Error('User not found');
                pendingBalance += Number(data.balance.increment);
                return { id: order.userId, balance: pendingBalance };
              }),
            },
            order: {
              findFirst: jest.fn(async ({ where }) => structuredClone(
                [pendingOrder, ownedOrder].find((candidate) => matchesOrder(candidate, where)) ?? null,
              )),
              updateMany: jest.fn(async (args) => updateMatchingOrder(pendingOrder, args)),
            },
          });
          // Only commit a successful claim; a losing worker cannot overwrite the winner.
          Object.assign(order, pendingOrder);
          balance = pendingBalance;
          return result;
        });
        transactionQueue = transaction.then(() => undefined, () => undefined);
        return transaction;
      }),
    };
    api = {
      get: jest.fn(async (path: string) => ({ data: { status: 'success', data:
        path === '/resident/package'
          ? { package_key: 'main', is_active: true, expired_at: '30.10.2026 23:59:59', traffic_left: String(50 * gb) }
          : [structuredClone(packageInfo)], errors: [] } })),
      post: jest.fn(async (path: string, body: any) => {
        if (path === '/order/make') return { data: { status: 'success', data:
          { orderId: 1266906093, listBaseOrderNumbers: ['NS-first'], total: 1 }, errors: [] } };
        Object.assign(packageInfo, body);
        return { data: { status: 'success', data: structuredClone(packageInfo), errors: [] } };
      }),
    };
    service = new ProductService(new ConfigService(), prisma);
    (service as any).proxySeller = api;
    jest.spyOn(service, 'getActiveProxyList').mockImplementation(async () => ({
      status: 'success', data: { items: [{ package_info: structuredClone(packageInfo) }] },
    }) as any);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  const info = { type: 'resident' as const, orderId: 'checkout', userId: 'customer',
    tariff: '1 Gb', tariffId: 25208, paymentId: 1 };

  it('persists a successful tariff purchase before a subpackage error and does not buy again on retry', async () => {
    const normal = api.post.getMockImplementation();
    let rejectUpdate = true;
    api.post.mockImplementation(async (path: string, body: any) => {
      if (path === '/residentsubuser/update' && rejectUpdate) return { data: {
        status: 'error', data: null, errors: [{ code: 0, message: 'Allocation temporarily unavailable' }],
      } };
      return normal(path, body);
    });
    await expect(service.placeOrder(info)).rejects.toThrow('Allocation temporarily unavailable');
    expect(order.orderId).toBe('1266906093');
    expect(order.orderNumber).toBe('NS-first');
    rejectUpdate = false;
    const result = await service.placeOrder(info);
    expect(result.orderId).toBe('1266906093');
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
    expect(packageInfo.traffic_limit).toBe('4294967296');
  });

  it('caps the requested date at the main package expiry', async () => {
    await service.placeOrder(info);
    const update = api.post.mock.calls.find(([path]) => path === '/residentsubuser/update')[1];
    expect(update.expired_at).toBe('30.10.2026');
  });

  it('selects the newest owned package, not an arbitrary historical expired one', async () => {
    await service.placeOrder(info);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
  });

  it('blocks a timed-out allocation for reconciliation without repeating the update or purchase', async () => {
    const normal = api.post.getMockImplementation(); let timeout = true;
    api.post.mockImplementation(async (path: string, body: any) => {
      const result = await normal(path, body);
      if (path === '/residentsubuser/update' && timeout) { timeout = false; throw new Error('ETIMEDOUT'); }
      return result;
    });
    await expect(service.placeOrder(info)).rejects.toThrow();
    expect(packageInfo.traffic_limit).toBe('4294967296');
    await expect(service.placeOrder(info)).rejects.toMatchObject({ status: 409 });
    expect(order.residentFulfillment.stage).toBe('update_requested');
    expect(packageInfo.traffic_limit).toBe('4294967296');
    expect(api.post.mock.calls.filter(([path]) => path === '/residentsubuser/update')).toHaveLength(1);
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
  });

  it('does not repeat a tariff purchase after an ambiguous timeout', async () => {
    api.post.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(service.placeOrder(info)).rejects.toThrow();
    await expect(service.placeOrder(info)).rejects.toThrow();
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
  });

  it('claims the paid request once even when two workers enter after a database lock connection is lost', async () => {
    const results = await Promise.allSettled([service.placeOrder(info), service.placeOrder(info)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
  });

  it('does not repeat subaccount creation after an ambiguous response', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    jest.spyOn(service, 'getActiveProxyList').mockResolvedValue({ status: 'success', data: { items: [] } } as any);
    const normal = api.post.getMockImplementation();
    api.post.mockImplementation(async (path: string, body: any) => {
      if (path === '/residentsubuser/create') throw new Error('ETIMEDOUT');
      return normal(path, body);
    });
    await expect(service.placeOrder(info)).rejects.toThrow();
    await expect(service.placeOrder(info)).rejects.toThrow();
    expect(api.post.mock.calls.filter(([path]) => path === '/residentsubuser/create')).toHaveLength(1);
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
  });

  it('does not mark allocation applied when the provider reports success without changing the limit', async () => {
    const normal = api.post.getMockImplementation();
    api.post.mockImplementation(async (path: string, body: any) => path === '/residentsubuser/update'
      ? { data: { status: 'success', data: { package_key: 'sub' } } } : normal(path, body));
    await expect(service.placeOrder(info)).rejects.toThrow('not confirmed');
    expect(order.residentFulfillment.stage).toBe('updated');
  });

  it('does not shorten an existing package or buy a tariff when its expiry exceeds the parent bound', async () => {
    packageInfo.expired_at = '31.10.2026';
    await expect(service.placeOrder(info)).rejects.toThrow('shorten');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('retries a changed provider expiry bound without buying the tariff again', async () => {
    const normal = api.post.getMockImplementation(); let fail = true;
    api.post.mockImplementation(async (path: string, body: any) => {
      if (path === '/residentsubuser/update' && fail) {
        fail = false;
        return { data: { status: 'error', errors: [{ message: 'Set the [ expired_at ] date to be greater than 01.10.2026 and less than 28.10.2026' }] } };
      }
      return normal(path, body);
    });
    await service.placeOrder(info);
    expect(packageInfo.expired_at).toBe('27.10.2026');
    expect(api.post.mock.calls.filter(([path]) => path === '/order/make')).toHaveLength(1);
  });
});
