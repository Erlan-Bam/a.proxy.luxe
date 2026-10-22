import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService.getActiveProxyList', () => {
  const userId = 'customer-id';
  const orderId = 'customer-order-id';
  const orderNumber = 'NS_1791720551243-cF';

  function createService(orders: Record<string, unknown>[], items: object[]) {
    const prisma = {
      order: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }) =>
            orders.filter(
              (order) =>
                (order.userId ?? userId) === where.userId &&
                (order.type ?? where.type) === where.type &&
                order.proxySellerId !== null,
            ),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ProductService(
      {
        get: jest.fn().mockReturnValue('test-key'),
      } as unknown as ConfigService,
      prisma as any,
    );
    const proxySeller = {
      get: jest.fn().mockResolvedValue({
        data: { status: 'success', data: { items } },
      }),
    };
    (service as any).proxySeller = proxySeller;
    return { service, prisma, proxySeller };
  }

  it.each(['ipv6', 'isp'])(
    'matches v2 %s proxies by owned order number when provider order_id changes',
    async (type) => {
      const { service } = createService(
        [
          {
            id: orderId,
            proxySellerId: '1733674913',
            orderNumber,
          },
        ],
        [
          {
            id: 'provider-proxy-id',
            order_id: '6acb7c679cd8a877b3214681',
            order_number: orderNumber,
          },
          {
            id: 'another-customer-proxy',
            order_id: 'another-provider-order',
            order_number: 'another-order-number',
          },
        ],
      );

      const result = await service.getActiveProxyList(userId, type);

      expect(result.status).toBe('success');
      expect(result.data?.items).toEqual([
        expect.objectContaining({
          id: 'provider-proxy-id',
          order_id: '6acb7c679cd8a877b3214681',
          order_number: orderNumber,
          orderId,
        }),
      ]);
    },
  );

  it('keeps matching legacy provider order IDs when no order number is stored', async () => {
    const { service, prisma } = createService(
      [{ id: orderId, proxySellerId: '1733674913', orderNumber: null }],
      [
        {
          id: 'legacy-proxy',
          order_id: '1733674913',
          order_number: orderNumber,
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'ipv6');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([
      expect.objectContaining({ id: 'legacy-proxy', orderId }),
    ]);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, orderNumber: null },
      data: { orderNumber },
    });
  });

  it('matches renewed ISP proxies by the original base order number', async () => {
    const { service } = createService(
      [{ id: orderId, proxySellerId: '1733674913', orderNumber }],
      [
        {
          id: 'renewed-proxy',
          order_id: 'new-provider-order-id',
          order_number: 'new-renewal-number',
          base_order_number: orderNumber,
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'isp');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([
      expect.objectContaining({ id: 'renewed-proxy', orderId }),
    ]);
  });

  it('recovers legacy ISP renewals when the stored number has an extension suffix', async () => {
    const { service, prisma } = createService(
      [
        {
          id: 'first-owned-order',
          proxySellerId: '4677001',
          orderNumber: '4677001_97297324_e_DiIoEtS8jV',
        },
        {
          id: 'second-owned-order',
          proxySellerId: '4709873',
          orderNumber: '4709873_98230769_e_QQsFYmIPgh',
        },
      ],
      [
        {
          id: 'first-owned-proxy',
          ip: '85.120.131.1',
          order_id: '6a24d9f5717805635c06e74f',
          order_number: '4677001_97297324_e_RoJF765sux',
          base_order_number: '4677001_97297324',
        },
        {
          id: 'second-owned-proxy',
          ip: '85.120.128.108',
          order_id: '6a24d9f4717805635c06e73b',
          order_number: '4709873_98230769_e_PZopo5yaGx',
          base_order_number: '4709873_98230769',
        },
        {
          id: 'other-customer-proxy',
          order_id: 'another-provider-order',
          order_number: '9999999_11111111_e_other',
          base_order_number: '9999999_11111111',
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'isp');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([
      expect.objectContaining({
        id: 'first-owned-proxy',
        orderId: 'first-owned-order',
      }),
      expect.objectContaining({
        id: 'second-owned-proxy',
        orderId: 'second-owned-order',
      }),
    ]);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('does not trust a legacy suffix when its numeric provider ID disagrees', async () => {
    const { service } = createService(
      [
        {
          id: orderId,
          proxySellerId: '4677001',
          orderNumber: '9999999_97297324_e_DiIoEtS8jV',
        },
      ],
      [
        {
          id: 'wrong-base-proxy',
          order_id: 'new-provider-order-id',
          order_number: '9999999_97297324_e_RoJF765sux',
          base_order_number: '9999999_97297324',
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'isp');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([]);
  });

  it('does not match a legacy ISP order belonging to another user', async () => {
    const { service, prisma } = createService(
      [
        {
          id: 'other-customer-order',
          userId: 'other-customer',
          type: 'isp',
          proxySellerId: '4677001',
          orderNumber: '4677001_97297324_e_DiIoEtS8jV',
        },
      ],
      [
        {
          id: 'other-customer-proxy',
          order_id: 'new-provider-order-id',
          order_number: '4677001_97297324_e_RoJF765sux',
          base_order_number: '4677001_97297324',
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'isp');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, type: 'isp', proxySellerId: { not: null } },
      }),
    );
  });

  it('does not attach an ambiguous legacy ISP base to either local order', async () => {
    const { service } = createService(
      [
        {
          id: 'first-order',
          proxySellerId: '4677001',
          orderNumber: '4677001_97297324_e_first',
        },
        {
          id: 'second-order',
          proxySellerId: '4677001',
          orderNumber: '4677001_97297324_e_second',
        },
      ],
      [
        {
          id: 'ambiguous-proxy',
          order_id: 'new-provider-order-id',
          order_number: '4677001_97297324_e_current',
          base_order_number: '4677001_97297324',
        },
      ],
    );

    const result = await service.getActiveProxyList(userId, 'isp');

    expect(result.status).toBe('success');
    expect(result.data?.items).toEqual([]);
  });
});
