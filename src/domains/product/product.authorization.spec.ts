import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService.addAuth', () => {
  const prisma = {
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  let service: ProductService;
  let proxySeller: {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductService(
      {
        get: jest.fn().mockReturnValue('test-key'),
      } as unknown as ConfigService,
      prisma as any,
    );
    proxySeller = {
      get: jest.fn(),
      post: jest.fn(),
    };
    (service as any).proxySeller = proxySeller;
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates IP authorization for an owned order number', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-id' });
    proxySeller.post.mockResolvedValue({
      data: {
        status: 'success',
        data: {
          orderNumber: '123_456',
          ip: '2001:db8::1',
        },
      },
    });

    await expect(
      service.addAuth('user-id', '123_456', '2001:db8::1'),
    ).resolves.toEqual({
      status: 'success',
      data: {
        orderNumber: '123_456',
        ip: '2001:db8::1',
      },
    });

    expect(proxySeller.post).toHaveBeenCalledWith('/auth/add/ip', {
      orderNumber: '123_456',
      ip: '2001:db8::1',
    });
    expect(proxySeller.get).not.toHaveBeenCalled();
  });

  it('backfills and authorizes an owned legacy ISP order', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order-id', proxySellerId: '42' },
    ]);
    proxySeller.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          status: 'success',
          data: {
            items:
              path === '/proxy/list/isp'
                ? [
                    {
                      order_id: 42,
                      order_number: '123_456',
                    },
                  ]
                : [],
          },
        },
      }),
    );
    proxySeller.post.mockResolvedValue({
      data: { status: 'success', data: { ip: '127.0.0.1' } },
    });

    await service.addAuth('user-id', '123_456', '127.0.0.1');

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-id',
        orderNumber: null,
      },
      data: { orderNumber: '123_456' },
    });
  });

  it('rejects order numbers that do not belong to the user', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.order.findMany.mockResolvedValue([]);
    proxySeller.get.mockResolvedValue({
      data: { status: 'success', data: { items: [] } },
    });

    await expect(
      service.addAuth('user-id', 'other-order', '127.0.0.1'),
    ).rejects.toBeInstanceOf(HttpException);

    expect(proxySeller.post).not.toHaveBeenCalled();
  });

  it('surfaces Proxy-Seller business errors returned with HTTP 200', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-id' });
    proxySeller.post.mockResolvedValue({
      data: {
        status: 'error',
        errors: [{ message: 'IP already linked' }],
      },
    });

    await expect(
      service.addAuth('user-id', '123_456', '127.0.0.1'),
    ).rejects.toMatchObject({
      message: 'IP already linked',
    });
  });
});
