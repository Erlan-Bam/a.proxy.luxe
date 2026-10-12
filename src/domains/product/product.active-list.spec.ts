import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService.getActiveProxyList', () => {
  const userId = 'customer-id';
  const orderId = 'customer-order-id';
  const orderNumber = 'NS_1791720551243-cF';

  function createService(orders: Record<string, unknown>[], items: object[]) {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ProductService(
      { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService,
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
    const { service } = createService(
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
});
