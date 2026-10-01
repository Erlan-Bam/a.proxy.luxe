import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { OrderService } from './order.service';

const url = process.env.ADMIN_LOG_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/resident_test')) {
  throw new Error('Use the dedicated local resident_test database for admin log integration tests');
}

(url ? describe : describe.skip)('Admin logs PostgreSQL pagination', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new OrderService(prisma as never, {} as never, {} as never);
  const token = randomUUID();
  const prefix = `admin-log-${token}`;
  const userId = randomUUID();
  const email = `${token}_50%@admin-log.invalid`;
  const id = (kind: string, n: number) => `${prefix}-${kind}-${String(n).padStart(3, '0')}`;
  const createdAt = new Date('2026-09-30T23:59:59.999Z');
  const base = {
    ordersPage: 1, ordersLimit: 100, paymentsPage: 1, paymentsLimit: 100,
    search: token, status: 'PAID' as const,
    ordersType: 'resident' as const, ordersEmail: '_50%', ordersGoal: 'work%',
    ordersProviderOrder: 'NS_50%\\literal',
    ordersCreatedFrom: '2026-09-01', ordersCreatedTo: '2026-09-30',
    ordersAmountMin: '0.10', ordersAmountMax: '10.50',
    paymentsEmail: '_50%', paymentsMethod: 'Crypto_50%',
    paymentsCreatedTo: '2026-09-30', paymentsAmountMin: '0.10', paymentsAmountMax: '10.50',
  };

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email, password: 'never-return-this' }, select: { id: true } });
    const orders = Array.from({ length: 106 }, (_, n) => ({
      id: id('order', n), userId, type: 'resident' as const, status: 'PAID' as const,
      goal: 'work% research', totalPrice: n === 0 ? '0.10' : '10.50', end_date: '',
      orderId: n % 2 ? 'NS_50%\\literal' : null,
      orderNumber: n % 2 ? null : 'NS_50%\\literal',
      residentFulfillment: { password: 'private-fulfillment' },
      createdAt: n === 0 ? new Date('2026-09-01T00:00:00.000Z') : createdAt,
      updatedAt: n === 0 ? new Date('2026-10-01T00:00:00Z') : createdAt,
    }));
    await prisma.order.createMany({ data: [
      ...orders,
      { ...orders[1], id: id('order', 110), status: 'PENDING' },
      { ...orders[1], id: id('order', 111), type: 'ipv6' },
      { ...orders[1], id: id('order', 112), totalPrice: '10.51' },
      { ...orders[1], id: id('order', 113), goal: 'work without percent' },
      { ...orders[1], id: id('order', 114), orderId: 'NSa50x\\literal' },
      { ...orders[1], id: id('order', 115), createdAt: new Date('2026-10-01T00:00:00Z') },
    ] });
    const payments = Array.from({ length: 106 }, (_, n) => ({
      id: id('payment', n), userId, price: '10.50', method: 'Crypto_50%', createdAt,
    }));
    await prisma.payment.createMany({ data: [
      ...payments,
      { ...payments[1], id: id('payment', 110), method: 'CryptoX50X' },
      { ...payments[1], id: id('payment', 111), price: '10.51' },
    ] });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('filters and counts the full database before taking stable non-overlapping pages', async () => {
    const first = await service.generalLog(base);
    const second = await service.generalLog({ ...base, ordersPage: 2, paymentsPage: 2 });
    expect(first).toMatchObject({ totalOrders: 106, totalPayments: 106, totalOrderPages: 2, totalPaymentPages: 2 });
    expect(first.orders).toHaveLength(100);
    expect(first.payments).toHaveLength(100);
    expect(first.orders[0].id).toBe(id('order', 105));
    expect(first.orders[99].id).toBe(id('order', 6));
    expect(second.orders.map((row) => row.id)).toEqual([5, 4, 3, 2, 1, 0].map((n) => id('order', n)));
    expect(second.payments.map((row) => row.id)).toEqual([5, 4, 3, 2, 1, 0].map((n) => id('payment', n)));
    expect(first.orders[0].user).toEqual({ email });
    expect(first.orders[0]).not.toHaveProperty('residentFulfillment');
    expect(first.orders[0]).not.toHaveProperty('partnerId');
    expect(first.orders[0].user).not.toHaveProperty('password');
  });

  it('sorts updated dates explicitly and payments independently, including show-all', async () => {
    const result = await service.generalLog({ ...base,
      ordersLimit: null, paymentsLimit: null,
      ordersSortBy: 'updatedAt', paymentsSortBy: 'id', paymentsSortDirection: 'asc',
    });
    expect(result.orders).toHaveLength(106);
    expect(result.payments).toHaveLength(106);
    expect(result.orders[0].id).toBe(id('order', 0));
    expect(result.payments[0].id).toBe(id('payment', 0));
    expect(result.totalOrderPages).toBe(1);
    expect(result.totalPaymentPages).toBe(1);
  });

  it('matches local IDs literally without filtering the returned page in memory', async () => {
    const result = await service.generalLog({ ...base,
      ordersId: id('order', 0), paymentsId: id('payment', 0),
    });
    expect(result.totalOrders).toBe(1);
    expect(result.totalPayments).toBe(1);
    expect(result.orders[0].id).toBe(id('order', 0));
    expect(result.payments[0].id).toBe(id('payment', 0));
  });
});
