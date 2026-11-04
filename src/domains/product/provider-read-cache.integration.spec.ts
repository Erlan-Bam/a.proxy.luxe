import { ConfigService } from '@nestjs/config';
import { ProductService } from './product.service';

describe('ProductService provider read cache', () => {
  const providerItems = [
    {
      id: 'proxy-a',
      ip: '192.0.2.10',
      protocol: 'SOCKS5',
      port_socks: 10001,
      port_http: 10002,
      country: 'GB',
      login: 'login-a',
      password: 'password-a',
      order_id: 'provider-a',
      order_number: 'NS-A',
      auth_ip: '',
      can_prolong: true,
      date_end: '2026-11-15',
    },
    {
      id: 'proxy-b',
      ip: '192.0.2.20',
      protocol: 'SOCKS5',
      port_socks: 20001,
      port_http: 20002,
      country: 'GB',
      login: 'login-b',
      password: 'password-b',
      order_id: 'provider-b',
      order_number: 'NS-B',
      auth_ip: '',
      can_prolong: true,
      date_end: '2026-11-15',
    },
  ];

  const ordersByUser = {
    'user-a': [
      {
        id: 'local-a',
        proxySellerId: 'provider-a',
        orderNumber: 'NS-A',
        tariff: null,
        totalPrice: 0.8,
        end_date: '15.11.2026',
      },
    ],
    'user-b': [
      {
        id: 'local-b',
        proxySellerId: 'provider-b',
        orderNumber: 'NS-B',
        tariff: null,
        totalPrice: 0.8,
        end_date: '15.11.2026',
      },
    ],
  };

  const createService = () => {
    const prisma = {
      order: {
        findMany: jest.fn(async ({ where }: any) =>
          structuredClone(ordersByUser[where.userId] ?? []),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ProductService(
      new ConfigService({ PROXY_SELLER: 'test-key' }),
      prisma as any,
    );
    return { service, prisma, api: (service as any).proxySeller };
  };

  it('shares one cached proxy list without leaking another user proxies', async () => {
    const { service, api } = createService();
    api.get = jest.fn().mockResolvedValue({
      data: { status: 'success', data: { items: providerItems } },
    });

    const first = await service.getActiveProxyList('user-a', 'ipv6');
    const second = await service.getActiveProxyList('user-a', 'ipv6');
    const otherUser = await service.getActiveProxyList('user-b', 'ipv6');

    expect(first).toMatchObject({
      status: 'success',
      data: { items: [{ id: 'proxy-a', orderId: 'local-a' }] },
    });
    expect(second).toEqual(first);
    expect(otherUser).toMatchObject({
      status: 'success',
      data: { items: [{ id: 'proxy-b', orderId: 'local-b' }] },
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('fails a list read when v2 returns HTML 403 instead of serving v1 data', async () => {
    const { service, api } = createService();
    api.get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        headers: { 'content-type': 'text/html; charset=UTF-8' },
      },
    });

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const first = await service.getActiveProxyList('user-a', 'isp');
      expect(first).toMatchObject({ status: 'error' });
      expect(first).not.toHaveProperty('data.items');
      expect(api.get).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not serve a stale proxy list after v2 rejects a refresh with 403', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-04T00:00:00Z') });
    const { service, api } = createService();
    api.get = jest
      .fn()
      .mockResolvedValueOnce({
        data: { status: 'success', data: { items: providerItems } },
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          headers: { 'content-type': 'text/html; charset=UTF-8' },
        },
      });
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(service.getActiveProxyList('user-a', 'isp')).resolves.toMatchObject({
        status: 'success',
      });
      jest.advanceTimersByTime(21_000);
      await expect(service.getActiveProxyList('user-a', 'isp')).resolves.toMatchObject({
        status: 'error',
      });
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
      jest.useRealTimers();
    }
  });

  it('does not hide a provider JSON 403 or server failure', async () => {
    const { service, api } = createService();
    api.get = jest
      .fn()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          headers: { 'content-type': 'application/json' },
        },
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 502, headers: { 'content-type': 'text/html' } },
      });
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        service.getActiveProxyList('user-a', 'isp'),
      ).resolves.toMatchObject({ status: 'error' });
      await expect(
        service.getActiveProxyList('user-a', 'isp'),
      ).resolves.toMatchObject({ status: 'error' });
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('invalidates cached authorizations after creating a new authorization', async () => {
    const { service, api } = createService();
    api.get = jest.fn().mockResolvedValue({
      data: {
        status: 'success',
        data: [
          { id: 1, active: true, ip: '198.51.100.1', orderNumber: 'NS-A' },
        ],
      },
    });
    api.post = jest.fn().mockResolvedValue({
      data: { status: 'success', data: { id: 2 } },
    });

    await service.getIpAuthorizations('NS-A');
    await service.getIpAuthorizations('NS-A');
    expect(api.get).toHaveBeenCalledTimes(1);

    await service.createIpAuthorization('NS-A', '198.51.100.2');
    await service.getIpAuthorizations('NS-A');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('keeps the purchase-critical resident tariff lookup uncached', async () => {
    const { service, api } = createService();
    api.get = jest.fn().mockResolvedValue({
      data: {
        status: 'success',
        data: {
          items: {
            tarifs: [{ id: 777, name: '1 Gb', personal: true }],
          },
        },
      },
    });

    await expect(
      (service as any).getCurrentResidentTariffId('1 Gb'),
    ).resolves.toBe(777);
    await expect(
      (service as any).getCurrentResidentTariffId('1 Gb'),
    ).resolves.toBe(777);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('reports a v2 resident package business error instead of an empty list', async () => {
    const { service, api } = createService();
    api.get = jest.fn().mockResolvedValue({
      data: { status: 'error', data: null, errors: [{ code: 503, message: 'IP not allowed' }] },
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(service.getActiveProxyList('user-a', 'resident')).resolves.toMatchObject({
        status: 'error',
      });
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it('reports a v2 resident list business error instead of successful emptiness', async () => {
    const { service, api } = createService();
    api.get = jest.fn(async (path: string) => ({
      data: path === '/residentsubuser/packages'
        ? { status: 'success', data: [{ package_key: 'provider-a', is_active: true }], errors: [] }
        : { status: 'error', data: null, errors: [{ code: 503, message: 'IP not allowed' }] },
    }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(service.getActiveProxyList('user-a', 'resident')).resolves.toMatchObject({
        status: 'error',
      });
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it('does not report success when v2 rejects a resident package rotation', async () => {
    const { service, api } = createService();
    api.post = jest.fn().mockResolvedValue({
      data: { status: 'error', data: null, errors: [{ code: 0, message: 'Invalid rotation' }] },
    });
    await expect(service.updateRotation({ package_key: 'provider-a', rotation: 60 } as any))
      .rejects.toThrow();
  });

  it('does not submit rotation after v2 rejects a resident list rename', async () => {
    const { service, api } = createService();
    api.post = jest.fn().mockResolvedValue({
      data: { status: 'error', data: null, errors: [{ code: 0, message: 'List not found' }] },
    });
    await expect(service.updateList(1, 'provider-a', 'Renamed', 60)).rejects.toThrow();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('sends zero to v2 when a resident list selects rotation per request', async () => {
    const { service, api } = createService();
    api.post = jest.fn().mockResolvedValue({ data: { status: 'success', data: {}, errors: [] } });
    await expect(service.updateList(1, 'provider-a', undefined, 0)).resolves.toMatchObject({
      status: 'success',
    });
    expect(api.post).toHaveBeenCalledWith('/residentsubuser/list/rotation', {
      id: 1,
      package_key: 'provider-a',
      rotation: 0,
    });
  });

  it('does not cache a malformed successful proxy list', async () => {
    const { service, api } = createService();
    api.get = jest
      .fn()
      .mockResolvedValueOnce({
        data: { status: 'success', data: {} },
      })
      .mockResolvedValueOnce({
        data: { status: 'success', data: { items: providerItems } },
      });

    await service.getActiveProxyList('user-a', 'ipv6');
    await service.getActiveProxyList('user-a', 'ipv6');

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('invalidates resident reads after the first successful partial update', async () => {
    const { service, api } = createService();
    api.get = jest.fn(async (path: string) => ({
      data: {
        status: 'success',
        data:
          path === '/residentsubuser/packages'
            ? [{ package_key: 'provider-a', is_active: true }]
            : [],
      },
    }));
    api.post = jest
      .fn()
      .mockResolvedValueOnce({ data: { status: 'success' } })
      .mockRejectedValueOnce(new Error('rotation failed'));
    const consoleLog = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    try {
      await service.getActiveProxyList('user-a', 'resident');
      await service.getActiveProxyList('user-a', 'resident');
      expect(api.get).toHaveBeenCalledTimes(2);

      await expect(
        service.updateList(1, 'provider-a', 'Renamed', 30),
      ).rejects.toThrow('rotation failed');

      await service.getActiveProxyList('user-a', 'resident');
      expect(api.get).toHaveBeenCalledTimes(4);
    } finally {
      consoleLog.mockRestore();
    }
  });

  it('never logs an Axios object containing the provider API URL', async () => {
    const { service, api } = createService();
    const providerError = Object.assign(new Error('Request failed'), {
      response: { status: 403 },
      config: {
        baseURL: 'https://proxy-seller.com/personal/api/v2/secret-provider-key',
      },
    });
    api.get = jest.fn().mockRejectedValue(providerError);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        service.getActiveProxyList('user-a', 'ipv6'),
      ).resolves.toEqual({
        status: 'error',
        message: 'Error fetching active proxy list',
      });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        'secret-provider-key',
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
