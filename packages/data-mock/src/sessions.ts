/**
 * Per-demo-session isolation (D-91 AC1): each demo session id gets its own `MockStore`, created
 * lazily from a dataset factory. Idle sessions expire after a TTL and the number of live
 * sessions is capped (least recently used evicted first), so a public demo cannot grow memory
 * without bound.
 */
import type { MockDataset } from "./dataset";
import type { MockStore, MockStoreOptions } from "./store";
import { createMockStore } from "./store";

export type MockSessionsOptions = {
  /** Produces the seed of a new session (called once per session). */
  datasetFactory: () => MockDataset;
  /** Idle time after which a session is dropped (default 2 h). */
  ttlMs?: number;
  /** Maximum number of live sessions (default 200); the least recently used is evicted. */
  maxSessions?: number;
  /** Clock in epoch ms for TTL bookkeeping (default `Date.now`). */
  clock?: () => number;
  /** Options for every session store (switch defaults, clock, sleep). */
  storeOptions?: MockStoreOptions;
};

export interface MockSessions {
  /** The store of `sessionId`, created on first use; refreshes its idle timer. */
  get(sessionId: string): MockStore;
  /** Whether a live (non-expired) session exists. */
  has(sessionId: string): boolean;
  /** *Visszaállítás*: restore the session's seed (creates the session if needed). */
  reset(sessionId: string): MockStore;
  /** Drop a session; returns whether it existed. */
  delete(sessionId: string): boolean;
  /** Drop expired sessions; returns how many were removed. */
  sweep(): number;
  /** Number of live sessions. */
  readonly size: number;
}

export const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 200;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function assertSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    throw new TypeError("Invalid demo session id");
  }
}

export function createMockSessions(options: MockSessionsOptions): MockSessions {
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  if (!(ttlMs > 0)) throw new RangeError("ttlMs must be positive");
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new RangeError("maxSessions must be a positive integer");
  }
  const clock = options.clock ?? Date.now;
  // Map iteration order = insertion order; re-inserting on access keeps it LRU-ordered.
  const sessions = new Map<string, { store: MockStore; lastAccess: number }>();

  const expired = (lastAccess: number, now: number) => now - lastAccess >= ttlMs;

  const sweep = (): number => {
    const now = clock();
    let removed = 0;
    for (const [id, entry] of sessions) {
      if (expired(entry.lastAccess, now)) {
        sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  };

  const get = (sessionId: string): MockStore => {
    assertSessionId(sessionId);
    const now = clock();
    const existing = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (existing && !expired(existing.lastAccess, now)) {
      sessions.set(sessionId, { store: existing.store, lastAccess: now });
      return existing.store;
    }
    sweep();
    while (sessions.size >= maxSessions) {
      const oldest = sessions.keys().next().value as string;
      sessions.delete(oldest);
    }
    const store = createMockStore(options.datasetFactory(), options.storeOptions);
    sessions.set(sessionId, { store, lastAccess: now });
    return store;
  };

  return {
    get,
    has(sessionId) {
      const entry = sessions.get(sessionId);
      return entry !== undefined && !expired(entry.lastAccess, clock());
    },
    reset(sessionId) {
      const store = get(sessionId);
      store.reset();
      return store;
    },
    delete: (sessionId) => sessions.delete(sessionId),
    sweep,
    get size() {
      return sessions.size;
    },
  };
}
