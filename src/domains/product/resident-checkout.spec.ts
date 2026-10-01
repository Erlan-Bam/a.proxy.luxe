import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { ProductService } from './product.service';

describe('resident checkout billing and retry routing', () => {
  let service: ProductService;
  let order: any;
  let prisma: any;
  let balance: number;

  function matchesOrder(where: Record<string, any>) {
    return Object.entries(where).every(([field, condition]) => {
      if (field === 'OR') return condition.some((branch) => matchesOrder(branch));
      const value = order[field];
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

  function updateOrder(data: Record<string, any>) {
    Object.assign(order, structuredClone({
      ...data,
      ...('totalPrice' in data && { totalPrice: Number(data.totalPrice) }),
      ...('partnerCommission' in data && { partnerCommission: String(data.partnerCommission) }),
    }));
    return structuredClone(order);
  }

  beforeEach(() => {
    balance = 10;
    order = { id: 'checkout', userId: 'customer', type: 'resident', status: 'PENDING',
      tariff: '1 Gb', totalPrice: 2.4, residentFulfillment: null, orderId: null, orderNumber: null,
      proxySellerId: null };
    prisma = { order: {
      findUnique: jest.fn(async ({ where }) => matchesOrder(where) ? structuredClone(order) : null),
      findFirst: jest.fn(async ({ where }) => matchesOrder(where) ? structuredClone(order) : null),
      update: jest.fn(async ({ where, data }) => {
        if (!matchesOrder(where)) throw new Error('Order not found');
        return updateOrder(data);
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!matchesOrder(where)) return { count: 0 };
        updateOrder(data);
        return { count: 1 };
      }),
    }, user: {
      findUnique: jest.fn(async ({ where }) => where.id === 'customer' ? { id: 'customer', balance, referredBy: null } : null),
      updateMany: jest.fn(async ({ where, data }) => {
        if (where.id !== 'customer' || balance < Number(where.balance.gte)) return { count: 0 };
        balance -= Number(data.balance.decrement); return { count: 1 };
      }),
    }, coupon: { findUnique: jest.fn(), updateMany: jest.fn() },
      $queryRaw: jest.fn(async () => []),
      $transaction: jest.fn(async callback => callback(prisma)) };
    service = new ProductService(new ConfigService(), prisma);
    (service as any).withResidentLock = jest.fn(async (_id, fn) => fn());
    jest.spyOn(service, 'getProductReferenceByType').mockResolvedValue({ status: 'success',
      tariffs: [{ id: 25208, name: '1 Gb', personal: true }] } as any);
    jest.spyOn(service, 'placeOrder').mockImplementation(async ({ charge }) => {
      const reservedCharge = charge ?? String(order.totalPrice);
      balance -= Number(reservedCharge);
      order.residentFulfillment = structuredClone({ stage: 'applied', packageKey: 'sub',
        target: '4294967296', expiry: '29.10.2026', charge: reservedCharge, fundsReserved: true });
      return { orderId: 'provider-id', orderNumber: 'NS-first', package_key: 'sub', end_date: '29.10.2026' };
    });
  });

  it('debits the customer exactly once when a completed checkout is submitted again', async () => {
    await (service as any).finishResidentOrder('checkout', 'customer');
    await (service as any).finishResidentOrder('checkout', 'customer');
    expect(balance).toBe(7.6);
    expect(service.placeOrder).toHaveBeenCalledTimes(1);
    expect(order.status).toBe('PAID');
    expect(order.end_date).toBe('29.10.2026');
  });

  it('does not debit a customer when subpackage provisioning fails', async () => {
    jest.mocked(service.placeOrder).mockRejectedValue(new Error('allocation failed'));
    await expect((service as any).finishResidentOrder('checkout', 'customer')).rejects.toThrow('allocation failed');
    expect(balance).toBe(10);
    expect(order.status).not.toBe('PAID');
  });

  it('persists commission attribution with settlement and never duplicates it on replay', async () => {
    prisma.user.findUnique.mockImplementation(async () => ({ id: 'customer', balance, referredBy: { partnerId: 'partner' } }));
    prisma.partnerTransaction = { create: jest.fn().mockResolvedValue({}) };
    await service.finishResidentOrder('checkout', 'customer');
    await service.finishResidentOrder('checkout', 'customer');
    expect(order).toMatchObject({ partnerId: 'partner', partnerCommission: '0.36' });
    expect(Number.isFinite(new Date(order.partnerCommissionRecordedAt).getTime())).toBe(true);
    expect(prisma.partnerTransaction.create).toHaveBeenCalledTimes(1);
    expect(String(prisma.partnerTransaction.create.mock.calls[0][0].data.amount)).toBe('0.36');
    expect(balance).toBe(7.6);
  });

  it('routes a new checkout to an unfinished paid provider operation instead of buying again', async () => {
    order.status = 'PROCESSING'; order.orderId = 'provider-id';
    order.residentFulfillment = { stage: 'purchased' };
    const result = await (service as any).getPendingResidentOrder('customer', '1 Gb');
    expect(result.id).toBe('checkout');
    await expect((service as any).getPendingResidentOrder('customer', '3 Gb')).rejects.toThrow();
  });

  it('refuses checkout for another user before provider calls or billing', async () => {
    await expect((service as any).finishResidentOrder('checkout', 'other')).rejects.toThrow();
    expect(service.placeOrder).not.toHaveBeenCalled(); expect(balance).toBe(10);
  });

  it('keeps ambiguous legacy processing orders blocked rather than purchasing again', async () => {
    order.status = 'PROCESSING';
    await expect((service as any).finishResidentOrder('checkout', 'customer')).rejects.toThrow();
    expect(service.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects a stale draft made before a newer resident purchase completed', async () => {
    order.createdAt = new Date('2026-10-01T05:45:00Z');
    prisma.order.findFirst.mockImplementation(async ({ where }) => where.status === 'PAID'
      ? { id: 'newer-paid', createdAt: new Date('2026-10-01T05:50:00Z') } : null);
    await expect((service as any).finishResidentOrder('checkout', 'customer')).rejects.toThrow();
    expect(service.placeOrder).not.toHaveBeenCalled();
  });
});
