import { ProxyType } from '@prisma/client';
import { OrderService } from './order.service';

describe('OrderService', () => {
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    type: 'ipv6',
    status: 'PROCESSING',
    country: 'Germany',
    quantity: 10,
    periodDays: '1m',
    proxyType: ProxyType.SOCKS5,
    goal: 'surfing',
    tariff: null,
    totalPrice: 0.8,
  };

  const user = {
    id: order.userId,
    email: 'customer@example.com',
    balance: 10,
    referredBy: null,
  };

  const prisma = {
    order: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    coupon: {
      update: jest.fn(),
    },
    partnerTransaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const productService = {
    getProductReferenceByType: jest.fn(),
    placeOrder: jest.fn(),
  };

  const userService = {
    sendProxyEmail: jest.fn(),
  };

  let service: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockResolvedValue(order);
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    productService.getProductReferenceByType.mockResolvedValue({
      status: 'success',
      country: [{ id: 610, name: 'Proxy of Germany' }],
      period: [{ id: '1m', name: '30 days' }],
    });
    productService.placeOrder.mockResolvedValue({
      orderId: 'external-order-id',
      orderNumber: 'external-order-number',
      package_key: undefined,
    });
    userService.sendProxyEmail.mockResolvedValue(undefined);

    service = new OrderService(
      prisma as any,
      productService as any,
      userService as any,
    );
  });

  it('passes the selected IPv6 protocol to Proxy-Seller', async () => {
    await service.finishOrder({
      orderId: order.id,
      proxyType: ProxyType.SOCKS5,
    });

    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'ipv6' }),
        data: expect.objectContaining({ proxyType: ProxyType.SOCKS5 }),
      }),
    );
    expect(productService.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ipv6',
        protocol: ProxyType.SOCKS5,
      }),
    );
  });
});

describe('OrderService admin log pagination', () => {
  const prisma = {
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  const service = new OrderService(prisma as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all orders and payments when pagination is disabled', async () => {
    const orders = [{ id: 'order-1' }];
    const payments = [{ id: 'payment-1' }, { id: 'payment-2' }];
    prisma.order.findMany.mockResolvedValue(orders);
    prisma.order.count.mockResolvedValue(orders.length);
    prisma.payment.findMany.mockResolvedValue(payments);
    prisma.payment.count.mockResolvedValue(payments.length);

    const result = await service.generalLog({
      ordersPage: 4,
      ordersLimit: null,
      paymentsPage: 5,
      paymentsLimit: null,
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything(),
        take: expect.anything(),
      }),
    );
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        skip: expect.anything(),
        take: expect.anything(),
      }),
    );
    expect(result).toMatchObject({
      orders,
      payments,
      ordersPage: 1,
      paymentsPage: 1,
      ordersLimit: 1,
      paymentsLimit: 2,
      totalOrderPages: 1,
      totalPaymentPages: 1,
    });
  });
});
