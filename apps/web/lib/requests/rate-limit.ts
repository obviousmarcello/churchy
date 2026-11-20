/**
 * Sliding-window rate limit of the public request forms (D-28 AC3): at most `limit` submissions
 * per `windowMs` for one key (tenant + hashed IP). In memory: fine for the demo; the BE part
 * moves it to the database/edge so it holds across instances.
 */
export interface RateLimiter {
  /** Records a hit for `key` at `nowMs` and returns whether it is allowed. */
  take(key: string, nowMs: number): boolean;
  /** Hits left for `key` in the current window. */
  remaining(key: string, nowMs: number): number;
  reset(): void;
}

export const REQUEST_LIMIT = 5;
export const REQUEST_WINDOW_MS = 60 * 60 * 1000;

export function createRateLimiter(
  limit = REQUEST_LIMIT,
  windowMs = REQUEST_WINDOW_MS,
): RateLimiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, nowMs: number): number[] => {
    const list = (hits.get(key) ?? []).filter((t) => t > nowMs - windowMs);
    if (list.length > 0) hits.set(key, list);
    else hits.delete(key);
    return list;
  };
  return {
    take(key, nowMs) {
      const list = recent(key, nowMs);
      if (list.length >= limit) return false;
      hits.set(key, [...list, nowMs]);
      return true;
    },
    remaining: (key, nowMs) => Math.max(0, limit - recent(key, nowMs).length),
    reset: () => hits.clear(),
  };
}
