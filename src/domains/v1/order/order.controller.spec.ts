import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserType } from '@prisma/client';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

describe('OrderController admin logs', () => {
  let controller: OrderController;
  const service = { generalLog: jest.fn() };
  const admin = { user: { type: UserType.ADMIN } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: OrderService, useValue: service }],
    }).compile();

    controller = module.get<OrderController>(OrderController);
  });

  it('honors the page and limit sent by the admin UI', async () => {
    await controller.generalLog(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      '3',
      '200',
    );
    expect(service.generalLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ordersPage: 3,
        ordersLimit: 200,
        paymentsPage: 3,
        paymentsLimit: 200,
      }),
    );
  });

  it('keeps explicit independent pagination and the all option', async () => {
    await controller.generalLog(admin, '2', '100', '4', '300', '3', '200');
    expect(service.generalLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ordersPage: 2,
        ordersLimit: 100,
        paymentsPage: 4,
        paymentsLimit: 300,
      }),
    );
    await controller.generalLog(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
    );
    expect(service.generalLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ ordersLimit: null, paymentsLimit: null }),
    );
  });

  it('rejects non-admins without querying logs', async () => {
    await expect(
      controller.generalLog({ user: { type: UserType.USER } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.generalLog).not.toHaveBeenCalled();
  });

  it('validates the status instead of sending an invalid enum to Prisma', async () => {
    await expect(
      controller.generalLog(
        admin,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'false',
        '',
        'FAILED',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.generalLog).not.toHaveBeenCalled();
  });

  it('passes search and status to the database query', async () => {
    await controller.generalLog(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'false',
      'NS_123',
      'PAID',
    );
    expect(service.generalLog).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'NS_123', status: 'PAID' }),
    );
  });

  const query = (values: Record<string, unknown>) =>
    (controller.generalLog as Function)(admin, undefined, undefined, undefined,
      undefined, undefined, undefined, 'false', '', 'ALL', values);

  it('defaults both independent sorts to creation descending', async () => {
    await query({});
    expect(service.generalLog).toHaveBeenCalledWith(expect.objectContaining({
      ordersSortBy: 'createdAt', ordersSortDirection: 'desc',
      paymentsSortBy: 'createdAt', paymentsSortDirection: 'desc',
    }));
  });

  it('accepts validated column filters and independent sorting', async () => {
    await query({
      ordersSortBy: 'email', ordersSortDirection: 'asc', paymentsSortBy: 'updatedAt',
      ordersType: 'ipv6', ordersEmail: ' user@example.com ', ordersAmountMin: '0',
      ordersCreatedTo: '2026-09-30', paymentsMethod: 'Crypto',
    });
    expect(service.generalLog).toHaveBeenCalledWith(expect.objectContaining({
      ordersSortBy: 'email', ordersSortDirection: 'asc', paymentsSortBy: 'updatedAt',
      ordersType: 'ipv6', ordersEmail: 'user@example.com', ordersAmountMin: '0',
      ordersCreatedTo: '2026-09-30', paymentsMethod: 'Crypto',
    }));
  });

  it.each([
    { ordersSortBy: 'password' }, { paymentsSortBy: 'status' },
    { ordersSortBy: '__proto__' }, { ordersSortDirection: 'DESC' },
    { paymentsSortDirection: 'sideways' }, { ordersType: 'ipv4' },
    { ordersCreatedFrom: 'yesterday' }, { ordersCreatedFrom: '2026-02-30' },
    { ordersCreatedTo: '2026-13-01' }, { paymentsUpdatedTo: '2026-09-01T25:00:00Z' },
    { ordersCreatedFrom: '2026-09-02', ordersCreatedTo: '2026-09-01' },
    { paymentsUpdatedFrom: '2026-09-03', paymentsUpdatedTo: '2026-09-02' },
    { ordersAmountMin: '-1' }, { ordersAmountMax: 'Infinity' },
    { paymentsAmountMin: 'NaN' }, { paymentsAmountMin: '1e3' },
    { ordersAmountMin: '10', ordersAmountMax: '2' },
    { paymentsAmountMin: '0.100000000000000002', paymentsAmountMax: '0.100000000000000001' },
    { ordersEmail: ['first', 'second'] }, { paymentsMethod: { contains: 'x' } },
    { ordersSortBy: ['createdAt', 'id'] },
  ])('rejects malformed column query %j before calling Prisma', async (values) => {
    await expect(query(values)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.generalLog).not.toHaveBeenCalled();
  });
});
