import { PaymentStatus, Proxy } from '@prisma/client';

jest.mock(
  'src/domains/product/product.service',
  () => ({ ProductService: class ProductService {} }),
  { virtual: true },
);

import { UserService } from './user.service';

describe('UserService IP authorizations', () => {
  let service: UserService;
  let prisma: {
    order: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let productService: {
    createIpAuthorization: jest.Mock;
    findOrderNumber: jest.Mock;
    getIpAuthorizations: jest.Mock;
    deleteIpAuthorization: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    productService = {
      createIpAuthorization: jest.fn(),
      findOrderNumber: jest.fn(),
      getIpAuthorizations: jest.fn(),
      deleteIpAuthorization: jest.fn(),
    };
    service = new UserService(prisma as any, productService as any);
  });

  it('lists authorizations only after finding an order owned by the user', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: Proxy.resident,
      proxySellerId: 'resident-package-key',
      orderNumber: '5094738_108303894',
      status: PaymentStatus.PAID,
    });
    productService.getIpAuthorizations.mockResolvedValue([
      {
        id: 'ip-auth-1',
        active: true,
        ip: '203.0.113.10',
        orderNumber: '5094738_108303894',
      },
    ]);

    await expect(
      service.getIpAuthorizations('user-1', 'app-order-1'),
    ).resolves.toEqual({ items: expect.any(Array) });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'app-order-1',
          userId: 'user-1',
          status: PaymentStatus.PAID,
        },
      }),
    );
    expect(productService.getIpAuthorizations).toHaveBeenCalledWith(
      '5094738_108303894',
    );
  });

  it.each([Proxy.ipv6, Proxy.isp, Proxy.resident])(
    'creates an IP authorization for a paid owned %s order',
    async (type) => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'app-order-1',
        userId: 'user-1',
        type,
        proxySellerId:
          type === Proxy.resident ? 'resident-package-key' : '5094738',
        orderNumber: '5094738_108303894',
        status: PaymentStatus.PAID,
      });
      productService.createIpAuthorization.mockResolvedValue({
        status: 'success',
        data: {
          ip: '2001:db8::1',
          orderNumber: '5094738_108303894',
        },
      });

      await expect(
        service.createIpAuthorization('user-1', 'app-order-1', '2001:db8::1'),
      ).resolves.toMatchObject({ status: 'success' });

      expect(productService.createIpAuthorization).toHaveBeenCalledWith(
        '5094738_108303894',
        '2001:db8::1',
      );
    },
  );

  it('rejects unsupported proxy types before calling Proxy-Seller', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: 'ipv4' as Proxy,
      proxySellerId: '5094738',
      orderNumber: '5094738_108303894',
      status: PaymentStatus.PAID,
    });

    await expect(
      service.createIpAuthorization('user-1', 'app-order-1', '203.0.113.10'),
    ).rejects.toMatchObject({ status: 400 });

    expect(productService.createIpAuthorization).not.toHaveBeenCalled();
  });

  it('backfills a legacy ISP order number before creating authorization', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: Proxy.isp,
      proxySellerId: '5094738',
      orderNumber: null,
      status: PaymentStatus.PAID,
    });
    productService.findOrderNumber.mockResolvedValue('5094738_108303894');
    prisma.order.update.mockResolvedValue({ id: 'app-order-1' });
    productService.createIpAuthorization.mockResolvedValue({
      status: 'success',
    });

    await service.createIpAuthorization(
      'user-1',
      'app-order-1',
      '203.0.113.10',
    );

    expect(productService.findOrderNumber).toHaveBeenCalledWith(
      Proxy.isp,
      '5094738',
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'app-order-1' },
      data: { orderNumber: '5094738_108303894' },
    });
  });

  it('uses the selected proxy row when one ISP order contains multiple proxies', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: Proxy.isp,
      proxySellerId: '5094738',
      orderNumber: '5094738_111111111',
      status: PaymentStatus.PAID,
    });
    productService.findOrderNumber.mockResolvedValue('5094738_222222222');
    productService.createIpAuthorization.mockResolvedValue({
      status: 'success',
    });

    await service.createIpAuthorization(
      'user-1',
      'app-order-1',
      '203.0.113.10',
      'proxy-2',
    );

    expect(productService.findOrderNumber).toHaveBeenCalledWith(
      Proxy.isp,
      '5094738',
      'proxy-2',
    );
    expect(productService.createIpAuthorization).toHaveBeenCalledWith(
      '5094738_222222222',
      '203.0.113.10',
    );
  });

  it('lists authorizations for the selected IPv6 row instead of the stored first row', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: Proxy.ipv6,
      proxySellerId: '5094738',
      orderNumber: '5094738_111111111',
      status: PaymentStatus.PAID,
    });
    productService.findOrderNumber.mockResolvedValue('5094738_222222222');
    productService.getIpAuthorizations.mockResolvedValue([]);

    await service.getIpAuthorizations(
      'user-1',
      'app-order-1',
      'proxy-2',
    );

    expect(productService.getIpAuthorizations).toHaveBeenCalledWith(
      '5094738_222222222',
    );
  });

  it('rejects a selected proxy row that is not part of the owned order', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      type: Proxy.isp,
      proxySellerId: '5094738',
      orderNumber: '5094738_111111111',
      status: PaymentStatus.PAID,
    });
    productService.findOrderNumber.mockResolvedValue(null);

    await expect(
      service.getIpAuthorizations(
        'user-1',
        'app-order-1',
        'other-order-proxy',
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(productService.getIpAuthorizations).not.toHaveBeenCalled();
  });

  it('returns 404 without calling the provider when the order is missing or not owned', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.getIpAuthorizations('user-1', 'app-order-1'),
    ).rejects.toMatchObject({ status: 404 });

    expect(productService.getIpAuthorizations).not.toHaveBeenCalled();
  });

  it('returns 400 when the paid owned order has no provider identifier', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      type: Proxy.isp,
      proxySellerId: null,
      orderNumber: null,
    });

    await expect(
      service.getIpAuthorizations('user-1', 'app-order-1'),
    ).rejects.toMatchObject({ status: 400 });

    expect(productService.getIpAuthorizations).not.toHaveBeenCalled();
  });

  it('returns 404 without deleting when the authorization is absent from the owned order', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      type: Proxy.resident,
      proxySellerId: 'resident-package-key',
      orderNumber: '5094738_108303894',
    });
    productService.getIpAuthorizations.mockResolvedValue([
      {
        id: 'ip-auth-1',
        active: true,
        ip: '203.0.113.10',
        orderNumber: '5094738_108303894',
      },
    ]);

    await expect(
      service.deleteIpAuthorization('user-1', 'app-order-1', 'ip-auth-2'),
    ).rejects.toMatchObject({ status: 404 });

    expect(productService.deleteIpAuthorization).not.toHaveBeenCalled();
  });

  it('deletes an authorization present in the owned order with its exact ID', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      type: Proxy.resident,
      proxySellerId: 'resident-package-key',
      orderNumber: '5094738_108303894',
    });
    productService.getIpAuthorizations.mockResolvedValue([
      {
        id: 'ip-auth-1',
        active: true,
        ip: '203.0.113.10',
        orderNumber: '5094738_108303894',
      },
    ]);

    await expect(
      service.deleteIpAuthorization('user-1', 'app-order-1', 'ip-auth-1'),
    ).resolves.toEqual({ success: true });

    expect(productService.deleteIpAuthorization).toHaveBeenCalledWith(
      'ip-auth-1',
    );
  });

  it('does not expose or delete credential authorizations excluded by the provider filter', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      type: Proxy.resident,
      proxySellerId: 'resident-package-key',
      orderNumber: '5094738_108303894',
    });
    productService.getIpAuthorizations.mockResolvedValue([
      {
        id: 'ip-auth-1',
        active: true,
        ip: '203.0.113.10',
        orderNumber: '5094738_108303894',
      },
    ]);

    await expect(
      service.getIpAuthorizations('user-1', 'app-order-1'),
    ).resolves.toEqual({
      items: [
        {
          id: 'ip-auth-1',
          active: true,
          ip: '203.0.113.10',
          orderNumber: '5094738_108303894',
        },
      ],
    });
    await expect(
      service.deleteIpAuthorization(
        'user-1',
        'app-order-1',
        'credential-auth-1',
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(productService.deleteIpAuthorization).not.toHaveBeenCalled();
  });
});
