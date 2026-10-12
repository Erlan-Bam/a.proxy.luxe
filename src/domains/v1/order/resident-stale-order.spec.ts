import { ConfigService } from '@nestjs/config';
import { ProductService } from '../../product/product.service';
import { OrderService } from './order.service';

describe('resident checkout after a completed purchase', () => {
  const userId = 'customer';
  const paidAt = new Date('2026-09-27T08:45:00Z');
  let orders: any[];
  let prisma: any;
  let product: ProductService;
  let service: OrderService;

  beforeEach(() => {
    orders = [
      {
        id: 'old-1',
        userId,
        type: 'resident',
        status: 'PROCESSING',
        tariff: '10 Gb',
        createdAt: new Date('2026-09-27T08:34:00Z'),
        residentFulfillment: null,
        orderId: null,
      },
      {
        id: 'old-2',
        userId,
        type: 'resident',
        status: 'PROCESSING',
        tariff: '10 Gb',
        createdAt: new Date('2026-09-27T08:35:00Z'),
        residentFulfillment: null,
        orderId: null,
      },
      {
        id: 'completed',
        userId,
        type: 'resident',
        status: 'PAID',
        tariff: '10 Gb',
        createdAt: new Date('2026-09-27T08:40:00Z'),
        updatedAt: paidAt,
        residentFulfillment: null,
        orderId: 'provider-order',
      },
    ];
    prisma = {
      order: {
        findFirst: jest.fn(async ({ where, orderBy }) => {
          const matches = orders.filter((order) => {
            if (order.userId !== where.userId || order.type !== where.type)
              return false;
            if (
              typeof where.status === 'string' &&
              order.status !== where.status
            )
              return false;
            if (where.status?.in && !where.status.in.includes(order.status))
              return false;
            if (where.tariff && order.tariff !== where.tariff) return false;
            if (where.createdAt?.gt && order.createdAt <= where.createdAt.gt)
              return false;
            if (
              where.OR &&
              !(
                order.residentFulfillment ||
                order.status === 'PROCESSING' ||
                order.orderId
              )
            )
              return false;
            if (
              where.residentFulfillment?.equals &&
              order.residentFulfillment !== null
            )
              return false;
            return true;
          });
          return (
            matches.sort((a, b) =>
              orderBy.createdAt === 'asc'
                ? a.createdAt.getTime() - b.createdAt.getTime()
                : (b.updatedAt ?? b.createdAt).getTime() -
                  (a.updatedAt ?? a.createdAt).getTime(),
            )[0] ?? null
          );
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const matches = orders.filter(
            (order) =>
              order.userId === where.userId &&
              order.type === where.type &&
              order.status === where.status &&
              order.createdAt < where.createdAt.lt &&
              !order.orderId &&
              !order.residentFulfillment,
          );
          matches.forEach((order) => {
            order.status = data.status;
          });
          return { count: matches.length };
        }),
        create: jest.fn(async ({ data }) => {
          const order = {
            id: 'fresh',
            createdAt: new Date('2026-10-12T08:12:00Z'),
            ...data,
          };
          orders.push(order);
          return order;
        }),
      },
    };
    product = new ProductService(new ConfigService(), prisma);
    jest
      .spyOn(product, 'withResidentLock')
      .mockImplementation(async (_id, action) => action());
    jest.spyOn(product, 'getProductReferenceByType').mockResolvedValue({
      status: 'success',
      tariffs: [{ id: 1, name: '10 Gb' }],
    } as any);
    jest.spyOn(product, 'getCalcForOrder').mockResolvedValue(21 as any);
    service = new OrderService(prisma, product, {} as any);
  });

  it('creates a fresh order when later paid checkout superseded legacy processing rows', async () => {
    const result = await service.create({
      userId,
      type: 'resident',
      tariff: '10 Gb',
      goal: 'surfing',
    } as any);
    expect(result.id).toBe('fresh');
    expect(
      orders
        .filter((order) => order.status === 'CANCELED')
        .map((order) => order.id),
    ).toEqual(['old-1', 'old-2']);
    expect(orders.find((order) => order.id === 'completed').status).toBe(
      'PAID',
    );
  });

  it('keeps a current ambiguous provider operation blocked from a second purchase', async () => {
    orders[0].createdAt = new Date('2026-10-12T08:00:00Z');
    orders[1].status = 'CANCELED';
    const result = await service.create({
      userId,
      type: 'resident',
      tariff: '10 Gb',
      goal: 'surfing',
    } as any);
    expect(result.id).toBe('old-1');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
