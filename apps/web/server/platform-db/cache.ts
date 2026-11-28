/** Small in-memory LRU cache with a TTL (SDD §4.1 host resolution: 60 s). */
export class TtlLruCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly options: {
      readonly ttlMs: number;
      readonly maxEntries: number;
      readonly now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (hit === undefined) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency (Map iterates in insertion order; the first key is the least recent).
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Removes every entry whose key or value matches; returns how many. */
  deleteWhere(match: (key: string, value: V) => boolean): number {
    let n = 0;
    for (const [key, entry] of [...this.entries]) {
      if (match(key, entry.value)) {
        this.entries.delete(key);
        n += 1;
      }
    }
    return n;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
