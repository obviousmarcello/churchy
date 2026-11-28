import type { PlatformDb, PlatformQueryable, PlatformQueryResult } from "./client";

/** One statement the fake saw. */
export interface Call {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly tx: boolean;
}

type Handler = (text: string, values: readonly unknown[]) => unknown[] | Error | undefined;

/**
 * A scripted platform database for unit tests: `handler` answers a statement with rows, an Error
 * (thrown, like a constraint violation) or `undefined` (no rows). Transactions record commit/rollback.
 */
export function createFakeDb(handler: Handler = () => undefined) {
  const calls: Call[] = [];
  const events: string[] = [];
  const run = (tx: boolean): PlatformQueryable["query"] =>
    (async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text: text.replace(/\s+/g, " ").trim(), values, tx });
      const out = handler(text, values);
      if (out instanceof Error) throw out;
      const rows = out ?? [];
      return { rows, rowCount: rows.length } satisfies PlatformQueryResult<unknown>;
    }) as PlatformQueryable["query"];
  const db: PlatformDb = {
    query: run(false),
    async transaction(fn) {
      events.push("begin");
      try {
        const result = await fn({ query: run(true) });
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  };
  return { db, calls, events };
}
