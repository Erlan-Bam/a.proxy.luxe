import { ProviderReadCache } from './provider-read-cache';

describe('ProviderReadCache', () => {
  let now: number;
  let cache: ProviderReadCache;

  beforeEach(() => {
    now = 1_000;
    cache = new ProviderReadCache(500, () => now);
  });

  it('reuses a successful provider read until its TTL expires', async () => {
    let calls = 0;
    const load = async () => ({ sequence: ++calls });

    await expect(
      cache.get('/proxy/list/ipv6', { ttlMs: 20_000 }, load),
    ).resolves.toEqual({ sequence: 1 });
    await expect(
      cache.get('/proxy/list/ipv6', { ttlMs: 20_000 }, load),
    ).resolves.toEqual({ sequence: 1 });
    expect(calls).toBe(1);

    now += 20_000;
    await expect(
      cache.get('/proxy/list/ipv6', { ttlMs: 20_000 }, load),
    ).resolves.toEqual({ sequence: 2 });
  });

  it('coalesces concurrent cache misses into one provider request', async () => {
    let resolveLoad: (value: { status: string }) => void = () => undefined;
    let calls = 0;
    const load = () => {
      calls += 1;
      return new Promise<{ status: string }>((resolve) => {
        resolveLoad = resolve;
      });
    };

    const first = cache.get(
      '/residentsubuser/packages',
      { ttlMs: 20_000 },
      load,
    );
    const second = cache.get(
      '/residentsubuser/packages',
      { ttlMs: 20_000 },
      load,
    );
    resolveLoad({ status: 'success' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'success' },
      { status: 'success' },
    ]);
    expect(calls).toBe(1);
  });

  it('serves a stale value during a provider outage and backs off refreshes', async () => {
    const policy = {
      ttlMs: 20_000,
      staleIfErrorMs: 120_000,
      retryAfterErrorMs: 30_000,
    };
    let calls = 0;
    await cache.get('/proxy/list/isp', policy, async () => {
      calls += 1;
      return ['cached-proxy'];
    });

    now += 20_000;
    const unavailable = async () => {
      calls += 1;
      throw new Error('cloudflare challenge');
    };
    await expect(
      cache.get('/proxy/list/isp', policy, unavailable),
    ).resolves.toEqual(['cached-proxy']);
    await expect(
      cache.get('/proxy/list/isp', policy, unavailable),
    ).resolves.toEqual(['cached-proxy']);
    expect(calls).toBe(2);

    now += 30_000;
    await expect(
      cache.get('/proxy/list/isp', policy, unavailable),
    ).resolves.toEqual(['cached-proxy']);
    expect(calls).toBe(3);
  });

  it('never caches a failed initial request', async () => {
    let calls = 0;
    const unavailable = async () => {
      calls += 1;
      throw new Error('provider unavailable');
    };

    await expect(
      cache.get('/reference/list/resident', { ttlMs: 600_000 }, unavailable),
    ).rejects.toThrow('provider unavailable');
    await expect(
      cache.get('/reference/list/resident', { ttlMs: 600_000 }, unavailable),
    ).rejects.toThrow('provider unavailable');
    expect(calls).toBe(2);
  });

  it('does not retain a response rejected by the cacheability rule', async () => {
    let calls = 0;
    const load = async () => ({
      status: calls++ === 0 ? 'error' : 'success',
    });
    const cacheSuccessful = (value: { status: string }) =>
      value.status === 'success';

    await expect(
      cache.get('/auth/list', { ttlMs: 20_000 }, load, cacheSuccessful),
    ).resolves.toEqual({ status: 'error' });
    await expect(
      cache.get('/auth/list', { ttlMs: 20_000 }, load, cacheSuccessful),
    ).resolves.toEqual({ status: 'success' });
    expect(calls).toBe(2);
  });

  it('invalidates all keys matching a provider resource prefix', async () => {
    let calls = 0;
    const load = async () => ++calls;
    await cache.get('/proxy/list/isp', { ttlMs: 20_000 }, load);
    await cache.get('/proxy/list/ipv6', { ttlMs: 20_000 }, load);

    cache.invalidate('/proxy/list/');

    await expect(
      cache.get('/proxy/list/isp', { ttlMs: 20_000 }, load),
    ).resolves.toBe(3);
    await expect(
      cache.get('/proxy/list/ipv6', { ttlMs: 20_000 }, load),
    ).resolves.toBe(4);
  });

  it('evicts the least recently used entry when the cache is full', async () => {
    cache = new ProviderReadCache(2, () => now);
    let calls = 0;
    const load = async () => ++calls;
    await cache.get('/one', { ttlMs: 20_000 }, load);
    now += 1;
    await cache.get('/two', { ttlMs: 20_000 }, load);
    now += 1;
    await cache.get('/three', { ttlMs: 20_000 }, load);

    await expect(cache.get('/one', { ttlMs: 20_000 }, load)).resolves.toBe(4);
  });
});
