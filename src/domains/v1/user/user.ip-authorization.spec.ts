import { PaymentStatus } from '@prisma/client';

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
    };
  };
  let productService: {
    getIpAuthorizations: jest.Mock;
    deleteIpAuthorization: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
      },
    };
    productService = {
      getIpAuthorizations: jest.fn(),
      deleteIpAuthorization: jest.fn(),
    };
    service = new UserService(prisma as any, productService as any);
  });

  it('lists authorizations only after finding an order owned by the user', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      userId: 'user-1',
      proxySellerId: '5094738',
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
      proxySellerId: null,
    });

    await expect(
      service.getIpAuthorizations('user-1', 'app-order-1'),
    ).rejects.toMatchObject({ status: 400 });

    expect(productService.getIpAuthorizations).not.toHaveBeenCalled();
  });

  it('returns 404 without deleting when the authorization is absent from the owned order', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'app-order-1',
      proxySellerId: '5094738',
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
      proxySellerId: '5094738',
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
      proxySellerId: '5094738',
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
