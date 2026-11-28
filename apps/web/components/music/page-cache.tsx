"use client";

// Music Sheet DB keeps pages in an offline browser cache and invalidates it after saves
// (`components/page-cache.tsx`). Churchy renders the music pages on the server for each request,
// so there is nothing to invalidate: these keep the call sites of the copied components unchanged.

/** No-op: there is no browser page cache. */
export function invalidatePageCache(_keys: readonly string[]): void {}

/** Returns the action unchanged (it used to invalidate the cache first). */
export function invalidating<Args extends unknown[], R>(
  _keys: readonly string[],
  action: (...args: Args) => R,
): (...args: Args) => R {
  return action;
}

/** No-op: there is no browser page cache (the copy of the chord sheet is not kept). */
export function invalidatePageCacheExcept<Data>(
  _keys: readonly string[],
  _except: string,
  _update: (data: Data) => Data,
): void {}
