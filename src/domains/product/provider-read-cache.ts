export type ProviderReadCachePolicy = {
  ttlMs: number;
  staleIfErrorMs?: number;
  retryAfterErrorMs?: number;
};

type CacheEntry = {
  value: unknown;
  expiresAt: number;
  staleUntil: number;
  lastAccessed: number;
};

export class ProviderReadCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private accessSequence = 0;
  private generation = 0;

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(
    key: string,
    policy: ProviderReadCachePolicy,
    loader: () => Promise<T>,
    cacheWhen: (value: T) => boolean = () => true,
  ): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && this.now() < cached.expiresAt) {
      cached.lastAccessed = ++this.accessSequence;
      return cached.value as T;
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const loadGeneration = this.generation;
    let pending!: Promise<T>;
    pending = (async () => {
      try {
        const value = await loader();
        if (loadGeneration === this.generation && cacheWhen(value)) {
          this.store(key, value, policy);
        }
        return value;
      } catch (error) {
        const stale = this.entries.get(key);
        const currentTime = this.now();
        if (stale && currentTime < stale.staleUntil) {
          const retryAfterErrorMs = Math.max(0, policy.retryAfterErrorMs ?? 0);
          stale.expiresAt = Math.min(
            stale.staleUntil,
            currentTime + retryAfterErrorMs,
          );
          stale.lastAccessed = ++this.accessSequence;
          return stale.value as T;
        }
        if (stale) this.entries.delete(key);
        throw error;
      } finally {
        if (this.inFlight.get(key) === pending) {
          this.inFlight.delete(key);
        }
      }
    })();
    this.inFlight.set(key, pending);
    return pending;
  }

  invalidate(...prefixes: string[]): void {
    this.generation += 1;
    for (const key of this.entries.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.entries.delete(key);
      }
    }
    for (const key of this.inFlight.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.inFlight.delete(key);
      }
    }
  }

  private store<T>(
    key: string,
    value: T,
    policy: ProviderReadCachePolicy,
  ): void {
    const currentTime = this.now();
    this.removeExpired(currentTime);
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const leastRecentlyUsed = [...this.entries.entries()].sort(
        ([, left], [, right]) => left.lastAccessed - right.lastAccessed,
      )[0]?.[0];
      if (leastRecentlyUsed) this.entries.delete(leastRecentlyUsed);
    }
    this.entries.set(key, {
      value,
      expiresAt: currentTime + Math.max(0, policy.ttlMs),
      staleUntil:
        currentTime +
        Math.max(0, policy.ttlMs) +
        Math.max(0, policy.staleIfErrorMs ?? 0),
      lastAccessed: ++this.accessSequence,
    });
  }

  private removeExpired(currentTime: number): void {
    for (const [key, entry] of this.entries) {
      if (currentTime >= entry.staleUntil) this.entries.delete(key);
    }
  }
}
