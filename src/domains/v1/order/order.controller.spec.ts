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
});
