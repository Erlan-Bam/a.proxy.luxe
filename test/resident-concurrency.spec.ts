import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/domains/v1/shared/prisma.service';
import { ProductService } from '../src/domains/product/product.service';
import { OrderService } from '../src/domains/v1/order/order.service';
import { UserService } from '../src/domains/v1/user/user.service';

const url = process.env.RESIDENT_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).pathname !== '/resident_test'
) {
  throw new Error(
    'Use a dedicated local resident_test database via RESIDENT_TEST_DATABASE_URL',
  );
}
const prisma = new PrismaService({ datasources: { db: { url } } });
const gib = 1073741824;
const users: string[] = [];
const coupons: string[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function fixture() {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@resident-test.invalid`,
      password: 'not-a-real-password',
      balance: 10,
    },
  });
  users.push(user.id);
  const pkg = {
    package_key: randomUUID(),
    traffic_limit: String(3 * gib),
    is_active: true,
    expired_at: { date: '2026-10-15 23:59:59' },
  };
  const yesterday = new Date(Date.now() - 86400000);
  const source = await prisma.order.create({
    data: {
      userId: user.id,
      type: 'resident',
      status: 'PAID',
      goal: 'surfing',
      tariff: '1 Gb',
      proxySellerId: pkg.package_key,
      totalPrice: 2.4,
      end_date: '15.10.2026',
      orderId: 'previous-purchase',
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  });
  const api = {
    get: jest.fn(async (path: string) => ({
      data: {
        status: 'success',
        data:
          path === '/resident/package'
            ? {
                package_key: 'main-never-customer',
                is_active: true,
                expired_at: { date: '2030-12-31 23:59:59' },
              }
            : [{ ...pkg }],
      },
    })),
    post: jest.fn(async (path: string, body: any): Promise<any> => {
      if (path === '/order/make')
        return {
          data: {
            status: 'success',
            data: {
              orderId: 1266906093,
              listBaseOrderNumbers: ['NS_test_purchase'],
            },
          },
        };
      if (path === '/residentsubuser/update') {
        pkg.traffic_limit = body.traffic_limit;
        pkg.expired_at = { date: body.expired_at };
        return { data: { status: 'success', data: { ...pkg } } };
      }
      throw new Error(`Unexpected paid test endpoint: ${path}`);
    }),
  };
  const product = () => {
    const service = new ProductService(
      new ConfigService({ DATABASE_URL: url }),
      prisma,
    );
    (service as any).proxySeller = api;
    jest.spyOn(service, 'getProductReferenceByType').mockResolvedValue({
      status: 'success',
      tariffs: [
        { id: 25208, name: '1 Gb', personal: true },
        { id: 25209, name: '3 Gb', personal: true },
      ],
    } as any);
    return service;
  };
  const service = product();
  const orders = new OrderService(prisma, service, {} as any);
  const dto = {
    userId: user.id,
    type: 'resident',
    tariff: '1 Gb',
    goal: 'surfing',
    periodDays: '1m',
  } as any;
  const draft = () => orders.create(dto);
  const balance = async () =>
    Number(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance,
    );
  const purchases = () =>
    api.post.mock.calls.filter(([path]) => path === '/order/make').length;
  return {
    user,
    source,
    pkg,
    api,
    service,
    product,
    orders,
    dto,
    draft,
    balance,
    purchases,
  };
}

beforeAll(async () => {
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Order_one_pending_resident_fulfillment_per_user"
    ON "Order" ("userId") WHERE "type" = 'resident' AND "status" IN ('PENDING', 'PROCESSING')
    AND "residentFulfillment" IS NOT NULL`);
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await prisma.partnerTransaction.deleteMany({ where: { partnerId: { in: users } } });
  await prisma.partnerPayoutRequest.deleteMany({ where: { partnerId: { in: users } } });
  await prisma.referral.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.coupon.deleteMany({ where: { code: { in: coupons } } });
  await prisma.$disconnect();
});

it('keeps exact referral commission after payout and replay without changing financial totals', async () => {
  const f = await fixture();
  const partner = await prisma.user.create({ data: { email: `${randomUUID()}@resident-test.invalid`, password: 'fixture-only' } });
  users.push(partner.id);
  await prisma.referral.create({ data: { partnerId: partner.id, userId: f.user.id } });
  const order = await f.draft();
  await f.service.finishResidentOrder(order.id, f.user.id);
  await f.product().finishResidentOrder(order.id, f.user.id);
  expect(await f.balance()).toBe(7.6);
  const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(stored.partnerId).toBe(partner.id);
  expect(stored.partnerCommission?.toString()).toBe('0.36');
  expect(await prisma.partnerTransaction.count({ where: { partnerId: partner.id } })).toBe(1);
  const statistics = new UserService(prisma, f.service);
  const before = await statistics.getPartnerDetails(partner.id);
  expect(before.referrals[0]).toMatchObject({ purchasesCount: 1, purchasesTotal: '2.4', commissionAmount: '0.36', commissionComplete: true });
  expect(before.availableBalance.toString()).toBe('0.36');
  expect(before.allTimeEarn.toString()).toBe('0.36');
  await prisma.$transaction([
    prisma.partnerPayoutRequest.create({ data: { partnerId: partner.id, amount: '0.36', wallet: 'fixture-only', status: 'PAID', paidAt: new Date() } }),
    prisma.partnerTransaction.deleteMany({ where: { partnerId: partner.id } }),
  ]);
  const after = await statistics.getPartnerDetails(partner.id);
  expect(after.referrals[0].commissionAmount).toBe('0.36');
  expect(after.availableBalance.toString()).toBe('0');
  expect(after.allTimeEarn.toString()).toBe('0.36');
  expect((await statistics.getPartnerDetails(f.user.id)).referrals).toEqual([]);
});

it('returns one checkout for duplicate draft creation', async () => {
  const f = await fixture();
  const a = await f.draft(),
    b = await f.draft();
  expect(b.id).toBe(a.id);
  expect(
    await prisma.order.count({
      where: { userId: f.user.id, status: 'PENDING' },
    }),
  ).toBe(1);
});

it('serializes distinct orders across service instances and rejects the stale second draft', async () => {
  const f = await fixture();
  const first = await f.draft();
  const second = await prisma.order.create({
    data: { ...f.dto, totalPrice: 2.4, end_date: '31.10.2026' },
  });
  const entered = deferred(),
    release = deferred();
  const original = f.api.post.getMockImplementation()!;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/order/make') {
      entered.resolve();
      await release.promise;
    }
    return original(path, body);
  });
  const request = f.service.finishResidentOrder(first.id, f.user.id);
  await entered.promise;
  try {
    await expect(
      f.product().finishResidentOrder(second.id, f.user.id),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.product().finishResidentOrder(first.id, f.user.id),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    release.resolve();
  }
  await request;
  await expect(
    f.service.finishResidentOrder(second.id, f.user.id),
  ).rejects.toMatchObject({ status: 409 });
  await f.service.finishResidentOrder(first.id, f.user.id);
  expect(f.purchases()).toBe(1);
  expect(await f.balance()).toBe(7.6);
  expect(f.pkg.traffic_limit).toBe(String(4 * gib));
});

it('resumes the paid checkpoint after process restart and reuses it instead of a new checkout', async () => {
  const f = await fixture();
  const order = await f.draft();
  const original = f.api.post.getMockImplementation()!;
  let fail = true;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/residentsubuser/update' && fail)
      return {
        data: {
          status: 'error',
          errors: [{ message: 'temporarily unavailable' }],
        },
      };
    return original(path, body);
  });
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toMatchObject({ status: 502 });
  expect(await f.balance()).toBe(7.6);
  expect((await f.draft()).id).toBe(order.id);
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).orderId,
  ).toBe('1266906093');
  fail = false;
  await f.product().finishResidentOrder(order.id, f.user.id);
  expect(f.purchases()).toBe(1);
  expect(await f.balance()).toBe(7.6);
  expect(f.pkg.traffic_limit).toBe(String(4 * gib));
});

it('retains the atomic reservation after finalization rollback and finishes without another debit', async () => {
  const f = await fixture();
  const order = await f.draft();
  const transaction = prisma.$transaction.bind(prisma);
  const spy = jest.spyOn(prisma, '$transaction').mockImplementation(((
    callback: any,
    options: any,
  ) =>
    options?.isolationLevel === 'Serializable'
      ? transaction(async (tx) => {
          await callback(tx);
          throw new Error('simulated crash before commit');
        }, options)
      : transaction(callback, options)) as any);
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toThrow('simulated crash');
  spy.mockRestore();
  expect(await f.balance()).toBe(7.6);
  const saved = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(saved.status).toBe('PROCESSING');
  expect(saved.residentFulfillment).toMatchObject({
    stage: 'applied',
    fundsReserved: true,
    charge: '2.4',
  });
  const calls = f.api.post.mock.calls.length;
  await f.product().finishResidentOrder(order.id, f.user.id);
  expect(f.api.post).toHaveBeenCalledTimes(calls);
  expect(await f.balance()).toBe(7.6);
});

it('fails closed after an ambiguous paid response even across restart and new draft creation', async () => {
  const f = await fixture(),
    order = await f.draft();
  f.api.post.mockRejectedValue(
    new Error('socket reset after sending purchase'),
  );
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toThrow();
  expect((await f.draft()).id).toBe(order.id);
  await expect(
    f.product().finishResidentOrder(order.id, f.user.id),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.purchases()).toBe(1);
  expect(await f.balance()).toBe(7.6);
});

it('enforces one pending resident fulfillment in the database independently of the app lock', async () => {
  const f = await fixture(),
    order = await f.draft();
  await prisma.order.update({
    where: { id: order.id },
    data: { residentFulfillment: { stage: 'purchase_requested' } },
  });
  await expect(
    prisma.order.create({
      data: {
        ...f.dto,
        totalPrice: 2.4,
        end_date: '31.10.2026',
        residentFulfillment: { stage: 'purchase_requested' },
      },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
});

it('replays renewal of the old package owner without another purchase or charge', async () => {
  const f = await fixture();
  const dto = {
    orderId: f.source.id,
    packageKey: f.pkg.package_key,
    user: { id: f.user.id },
  } as any;
  const first = await f.service.prolongResident(dto);
  const replay = await f.product().prolongResident(dto);
  expect(replay.orderId).toBe(first.orderId);
  expect(f.purchases()).toBe(1);
  expect(await f.balance()).toBe(7.6);
  const source = await prisma.order.findUniqueOrThrow({
    where: { id: f.source.id },
  });
  expect(source.proxySellerId).toBeNull();
  expect(source.orderId).toBe('previous-purchase');
});

it('uses the persisted discounted amount exactly once on a failed update retry', async () => {
  const f = await fixture(),
    order = await f.draft();
  const code = randomUUID();
  coupons.push(code);
  await prisma.coupon.create({ data: { code, discount: 50, limit: 1 } });
  const original = f.api.post.getMockImplementation()!;
  let fail = true;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/residentsubuser/update' && fail)
      return {
        data: {
          status: 'error',
          errors: [{ message: 'temporarily unavailable' }],
        },
      };
    return original(path, body);
  });
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id, code),
  ).rejects.toThrow();
  fail = false;
  await f.product().finishResidentOrder(order.id, f.user.id);
  await f.product().finishResidentOrder(order.id, f.user.id, code);
  expect(await f.balance()).toBe(8.8);
  expect(
    (await prisma.coupon.findUniqueOrThrow({ where: { code } })).limit,
  ).toBe(0);
  expect(f.purchases()).toBe(1);
});

it('never reopens PAID when an old worker resumes after losing its session lock', async () => {
  const f = await fixture(),
    order = await f.draft();
  jest
    .spyOn(f.service, 'withResidentLock')
    .mockImplementation(async (_id, action) => action());
  const entered = deferred(),
    release = deferred();
  const reference = await f.service.getProductReferenceByType('resident');
  jest
    .mocked(f.service.getProductReferenceByType)
    .mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return reference;
    });
  const stale = f.service.finishResidentOrder(order.id, f.user.id);
  await entered.promise;
  try {
    await f.product().finishResidentOrder(order.id, f.user.id);
  } finally {
    release.resolve();
  }
  await stale;
  expect(await f.balance()).toBe(7.6);
  expect(f.purchases()).toBe(1);
});

it('fences a different stale order when its worker resumes after the first checkout completed', async () => {
  const f = await fixture(),
    first = await f.draft();
  const second = await prisma.order.create({
    data: { ...f.dto, totalPrice: 2.4, end_date: '31.10.2026' },
  });
  jest
    .spyOn(f.service, 'withResidentLock')
    .mockImplementation(async (_id, action) => action());
  const entered = deferred(),
    release = deferred();
  const reference = await f.service.getProductReferenceByType('resident');
  jest
    .mocked(f.service.getProductReferenceByType)
    .mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return reference;
    });
  const stale = f.service.finishResidentOrder(second.id, f.user.id);
  const outcome = stale.then(
    () => 'purchased',
    () => 'blocked',
  );
  await entered.promise;
  try {
    await f.product().finishResidentOrder(first.id, f.user.id);
  } finally {
    release.resolve();
  }
  expect(await outcome).toBe('blocked');
  expect(await f.balance()).toBe(7.6);
  expect(f.purchases()).toBe(1);
});

it('does not delete a checkpoint created after the deletion eligibility read', async () => {
  const f = await fixture(),
    order = await f.draft();
  const entered = deferred(),
    release = deferred();
  const original = prisma.order.findFirst.bind(prisma.order);
  const spy = jest.spyOn(prisma.order, 'findFirst').mockImplementation((async (
    args: any,
  ) => {
    const row = await original(args);
    if (args.where.id === order.id && Object.keys(args.where).length === 2) {
      entered.resolve();
      await release.promise;
    }
    return row;
  }) as any);
  const deletion = f.orders.deleteById(f.user.id, order.id);
  const outcome = deletion.then(
    () => 'deleted',
    () => 'blocked',
  );
  await entered.promise;
  try {
    await f.service.finishResidentOrder(order.id, f.user.id);
  } finally {
    release.resolve();
  }
  expect(await outcome).toBe('blocked');
  spy.mockRestore();
  expect(
    await prisma.order.findUnique({ where: { id: order.id } }),
  ).toMatchObject({ status: 'PAID' });
});

it('blocks a fresh checkout behind an uncertain legacy PROCESSING purchase', async () => {
  const f = await fixture(),
    order = await f.draft();
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'PROCESSING' },
  });
  expect((await f.draft()).id).toBe(order.id);
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.purchases()).toBe(0);
});

it('reserves the last coupon use atomically before either customer purchases at the provider', async () => {
  const a = await fixture(),
    b = await fixture();
  const ao = await a.draft(),
    bo = await b.draft();
  const code = randomUUID();
  coupons.push(code);
  await prisma.coupon.create({ data: { code, discount: 50, limit: 1 } });
  const bothReady = deferred();
  let ready = 0;
  for (const f of [a, b]) {
    const reference = await f.service.getProductReferenceByType('resident');
    jest
      .mocked(f.service.getProductReferenceByType)
      .mockImplementation(async () => {
        if (++ready === 2) bothReady.resolve();
        await bothReady.promise;
        return reference;
      });
  }
  const results = await Promise.allSettled([
    a.service.finishResidentOrder(ao.id, a.user.id, code),
    b.service.finishResidentOrder(bo.id, b.user.id, code),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(a.purchases() + b.purchases()).toBe(1);
  expect((await a.balance()) + (await b.balance())).toBe(18.8);
});

it('creates one new subpackage and resumes after a failed confirmation read without another create', async () => {
  const f = await fixture();
  await prisma.order.update({
    where: { id: f.source.id },
    data: { proxySellerId: null },
  });
  const order = await f.draft();
  const post = f.api.post.getMockImplementation()!,
    get = f.api.get.getMockImplementation()!;
  let failConfirmation = false;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/residentsubuser/create') {
      f.pkg.traffic_limit = body.traffic_limit;
      f.pkg.expired_at = { date: body.expired_at };
      failConfirmation = true;
      return { data: { status: 'success', data: { ...f.pkg } } };
    }
    return post(path, body);
  });
  f.api.get.mockImplementation(async (path) => {
    if (path === '/residentsubuser/packages' && failConfirmation) {
      failConfirmation = false;
      throw new Error('read connection lost');
    }
    return get(path);
  });
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toThrow();
  await f.product().finishResidentOrder(order.id, f.user.id);
  expect(
    f.api.post.mock.calls.filter(
      ([path]) => path === '/residentsubuser/create',
    ),
  ).toHaveLength(1);
  expect(f.purchases()).toBe(1);
  expect(f.pkg.traffic_limit).toBe(String(gib));
  expect(await f.balance()).toBe(7.6);
});

it('reserves funds before allocation and can finish with zero available balance', async () => {
  const f = await fixture(),
    order = await f.draft();
  await prisma.user.update({
    where: { id: f.user.id },
    data: { balance: 2.4 },
  });
  const post = f.api.post.getMockImplementation()!;
  let fail = true;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/residentsubuser/update' && fail)
      return {
        data: {
          status: 'error',
          errors: [{ message: 'temporarily unavailable' }],
        },
      };
    return post(path, body);
  });
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toThrow();
  expect(await f.balance()).toBe(0);
  const saved = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(saved.residentFulfillment).toMatchObject({
    fundsReserved: true,
    charge: '2.4',
  });
  fail = false;
  await f.product().finishResidentOrder(order.id, f.user.id);
  expect(await f.balance()).toBe(0);
  expect(f.purchases()).toBe(1);
});

it('rolls back the reservation and claim together before any provider purchase', async () => {
  const f = await fixture(),
    order = await f.draft();
  const transaction = prisma.$transaction.bind(prisma);
  const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((
    callback: any,
  ) =>
    transaction(async (tx) => {
      await callback(tx);
      throw new Error('claim commit failed');
    })) as any);
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id),
  ).rejects.toThrow();
  spy.mockRestore();
  expect(await f.balance()).toBe(10);
  expect(f.purchases()).toBe(0);
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .residentFulfillment,
  ).toBeNull();
});

it('atomically releases funds and coupon once after a definitive purchase rejection', async () => {
  const f = await fixture(),
    order = await f.draft();
  const code = randomUUID();
  coupons.push(code);
  await prisma.coupon.create({ data: { code, discount: 50, limit: 1 } });
  f.api.post.mockResolvedValue({
    data: { status: 'error', errors: [{ message: 'Tariff unavailable' }] },
  });
  await expect(
    f.service.finishResidentOrder(order.id, f.user.id, code),
  ).rejects.toThrow('Tariff unavailable');
  const saved = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(saved.status).toBe('CANCELED');
  expect(saved.residentFulfillment).toMatchObject({
    fundsReserved: false,
    couponReserved: false,
  });
  await expect(
    f.product().finishResidentOrder(order.id, f.user.id, code),
  ).rejects.toThrow();
  expect(await f.balance()).toBe(10);
  expect(
    (await prisma.coupon.findUniqueOrThrow({ where: { code } })).limit,
  ).toBe(1);
  expect(f.purchases()).toBe(1);
});

it('does not create twice when a stale worker overlaps post-create confirmation', async () => {
  const f = await fixture(),
    order = await f.draft();
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'PROCESSING',
      orderId: 'already-bought',
      residentFulfillment: {
        stage: 'purchased',
        baseline: '0',
        target: String(gib),
        desiredExpiry: '31.10.2026',
        charge: '2.4',
        fundsReserved: true,
      },
    },
  });
  const firstRead = deferred(),
    secondRead = deferred(),
    allowFirst = deferred(),
    allowSecond = deferred();
  const confirming = deferred(),
    confirm = deferred();
  let mainReads = 0;
  const secondClaim = deferred();
  let claims = 0;
  const update = prisma.order.updateMany.bind(prisma.order);
  const spy = jest.spyOn(prisma.order, 'updateMany').mockImplementation((async (
    args: any,
  ) => {
    const result = await update(args);
    if (
      args.data.residentFulfillment?.stage === 'create_requested' &&
      ++claims === 2
    )
      secondClaim.resolve();
    return result;
  }) as any);
  const get = f.api.get.getMockImplementation()!;
  f.api.get.mockImplementation(async (path) => {
    if (path === '/resident/package') {
      if (++mainReads === 1) {
        firstRead.resolve();
        await allowFirst.promise;
      } else {
        secondRead.resolve();
        await allowSecond.promise;
      }
    } else {
      confirming.resolve();
      await confirm.promise;
    }
    return get(path);
  });
  f.api.post.mockImplementation(async (path, body) => {
    if (path !== '/residentsubuser/create')
      throw new Error('Unexpected endpoint');
    f.pkg.traffic_limit = body.traffic_limit;
    f.pkg.expired_at = { date: body.expired_at };
    return { data: { status: 'success', data: { ...f.pkg } } };
  });
  const info = {
    type: 'resident' as const,
    orderId: order.id,
    userId: f.user.id,
    tariff: '1 Gb',
    tariffId: 25208,
    paymentId: 1,
  };
  const first = f.service.placeOrder(info).then(
    () => 'ok',
    () => 'blocked',
  );
  await firstRead.promise;
  const second = f
    .product()
    .placeOrder(info)
    .then(
      () => 'ok',
      () => 'blocked',
    );
  await secondRead.promise;
  allowFirst.resolve();
  await confirming.promise;
  allowSecond.resolve();
  await secondClaim.promise;
  confirm.resolve();
  await Promise.all([first, second]);
  spy.mockRestore();
  expect(
    f.api.post.mock.calls.filter(
      ([path]) => path === '/residentsubuser/create',
    ),
  ).toHaveLength(1);
});

it('exclusively claims an allocation so a delayed worker cannot overwrite a later purchase', async () => {
  const f = await fixture(),
    order = await f.draft();
  jest
    .spyOn(f.service, 'withResidentLock')
    .mockImplementation(async (_id, action) => action());
  const entered = deferred(),
    release = deferred();
  const original = f.api.post.getMockImplementation()!;
  let updates = 0;
  f.api.post.mockImplementation(async (path, body) => {
    if (path === '/residentsubuser/update' && ++updates === 1) {
      entered.resolve();
      await release.promise;
    }
    return original(path, body);
  });
  const first = f.service.finishResidentOrder(order.id, f.user.id);
  await entered.promise;
  try {
    await expect(
      f.product().finishResidentOrder(order.id, f.user.id),
    ).rejects.toMatchObject({ status: 409 });
    expect((await f.draft()).id).toBe(order.id);
  } finally {
    release.resolve();
  }
  await first;
  expect(updates).toBe(1);
  expect(f.purchases()).toBe(1);
  expect(await f.balance()).toBe(7.6);
});
