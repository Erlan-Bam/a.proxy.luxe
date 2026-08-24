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

describe('ProductService IP authorizations', () => {
  let service: ProductService;
  let proxySeller: {
    get: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    service = new ProductService({ get: jest.fn() } as any, {} as any);
    proxySeller = {
      get: jest.fn(),
      delete: jest.fn(),
    };
    (service as any).proxySeller = proxySeller;
  });

  it('returns only sanitized IP authorizations for the requested provider order', async () => {
    proxySeller.get.mockResolvedValue({
      data: {
        status: 'success',
        data: [
          {
            id: 'ip-auth-1',
            active: true,
            ip: '203.0.113.10',
            orderNumber: '5094738_108303894',
          },
          {
            id: 'password-auth-1',
            active: true,
            login: 'secret-login',
            password: 'secret-password',
            orderNumber: '5094738_108303894',
          },
          {
            id: 'other-order-ip',
            active: true,
            ip: '203.0.113.20',
            orderNumber: '9999999_100',
          },
        ],
        errors: [],
      },
    });

    await expect(service.getIpAuthorizations('5094738')).resolves.toEqual([
      {
        id: 'ip-auth-1',
        active: true,
        ip: '203.0.113.10',
        orderNumber: '5094738_108303894',
      },
    ]);
  });

  it('deletes one exact authorization ID', async () => {
    proxySeller.delete.mockResolvedValue({
      data: { status: 'success', data: { deleted: true } },
    });

    await service.deleteIpAuthorization('ip-auth-1');

    expect(proxySeller.delete).toHaveBeenCalledWith('/auth/delete', {
      data: { id: 'ip-auth-1' },
    });
  });

  it('throws a 502 when listing authorizations fails at the provider', async () => {
    proxySeller.get.mockResolvedValue({
      data: { status: 'error', data: [], errors: [] },
    });

    await expect(service.getIpAuthorizations('5094738')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws a 502 when deleting an authorization fails at the provider', async () => {
    proxySeller.delete.mockResolvedValue({
      data: { status: 'error', data: { deleted: false }, errors: [] },
    });

    await expect(
      service.deleteIpAuthorization('ip-auth-1'),
    ).rejects.toMatchObject({ status: 502 });
  });
});
