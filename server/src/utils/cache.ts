interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private hitCount = 0;
  private missCount = 0;
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 30000) {
    this.defaultTtlMs = defaultTtlMs;

    // Periodic sweep for expired cache keys every 30 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, 30000).unref();
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount += 1;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.missCount += 1;
      return null;
    }

    this.hitCount += 1;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    const duration = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + duration,
    });
  }

  public del(key: string): boolean {
    return this.store.delete(key);
  }

  public invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count += 1;
      }
    }
    return count;
  }

  public clear(): void {
    this.store.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  public stats() {
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }
}

export const platformCache = new MemoryCache(30000); // 30-second TTL
