import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor, Ctx } from "../ctx";
import { ANONYMOUS_ACTOR } from "../ctx";
import type { ContractErrorCode } from "../errors";
import { isContractError } from "../errors";
import type { DataModule, Repositories } from "../registry";

/**
 * Fixture identities every adapter must provide to the contract suites. For adapters with
 * foreign keys (DB), these rows must exist: two tenants, one organization, and users/people for
 * the staff actors (`actorA` belongs to tenant A, `actorB` to tenant B).
 */
export type ContractEnv = {
  tenantA: string;
  tenantB: string;
  orgId: string;
  actorA: Actor & { userId: string; personId: string };
  actorB: Actor & { userId: string; personId: string };
  /** A user with organization roles in `orgId`. */
  orgActor: Actor & { userId: string };
  /** A platform operator (no tenant, no org). */
  platformActor: Actor & { userId: string };
};

/** What an adapter factory returns for one test: repositories (some modules may be missing). */
export type ContractSetup = {
  repos: Partial<Repositories>;
  env: ContractEnv;
  /** Called after every test (close connections, roll back a transaction…). */
  dispose?: () => void | Promise<void>;
};

/** Called before EVERY test; must return isolated (or at least independent) state. */
export type ContractAdapterFactory = () => ContractSetup | Promise<ContractSetup>;

export type ContractContexts = {
  /** Staff of tenant A. */
  a: Ctx;
  /** Staff of tenant B. */
  b: Ctx;
  /** Anonymous visitor of tenant A's public site. */
  anonA: Ctx;
  /** Anonymous visitor of tenant B's public site. */
  anonB: Ctx;
  /** Diocesan user in `env.orgId` (no tenant). */
  org: Ctx;
  /** Platform operator (no tenant, no org). */
  platform: Ctx;
};

export type SuiteContext<M extends DataModule> = {
  /** The repository under test. */
  readonly repo: Repositories[M];
  /** All repositories the adapter provides (for prerequisites from other modules). */
  readonly repos: Partial<Repositories>;
  readonly env: ContractEnv;
  readonly ctx: ContractContexts;
  /** Another module's repository; fails the test if the adapter does not provide it. */
  need<K extends DataModule>(module: K): Repositories[K];
};

export type ContractSuiteOptions = { adapterName?: string };

export type ContractSuite<M extends DataModule> = ((
  factory: ContractAdapterFactory,
  options?: ContractSuiteOptions,
) => void) & { readonly module: M };

export function contextsFor(env: ContractEnv): ContractContexts {
  return {
    a: { tenantId: env.tenantA, actor: env.actorA },
    b: { tenantId: env.tenantB, actor: env.actorB },
    anonA: { tenantId: env.tenantA, actor: ANONYMOUS_ACTOR },
    anonB: { tenantId: env.tenantB, actor: ANONYMOUS_ACTOR },
    org: { orgId: env.orgId, actor: env.orgActor },
    platform: { actor: env.platformActor },
  };
}

/**
 * Defines the contract suite of one module. The returned function registers a `describe` block
 * for a given adapter factory; the factory runs before each test.
 */
export function defineContractSuite<M extends DataModule>(
  module: M,
  body: (t: SuiteContext<M>) => void,
): ContractSuite<M> {
  const suite = (factory: ContractAdapterFactory, options: ContractSuiteOptions = {}) => {
    describe(`[${options.adapterName ?? "adapter"}] ${module} repository contract`, () => {
      let setup: ContractSetup | undefined;
      const current = (): ContractSetup => {
        if (!setup) throw new Error("Contract setup not initialised");
        return setup;
      };
      const t: SuiteContext<M> = {
        get repo() {
          return t.need(module);
        },
        get repos() {
          return current().repos;
        },
        get env() {
          return current().env;
        },
        get ctx() {
          return contextsFor(current().env);
        },
        need<K extends DataModule>(name: K): Repositories[K] {
          const repo = current().repos[name];
          if (!repo) throw new Error(`Adapter does not provide the "${name}" repository`);
          return repo as Repositories[K];
        },
      };
      beforeEach(async () => {
        setup = await factory();
      });
      afterEach(async () => {
        await setup?.dispose?.();
        setup = undefined;
      });
      body(t);
    });
  };
  return Object.assign(suite, { module });
}

/** Registers a placeholder for a module the adapter does not implement yet (visible as skipped). */
export function skipContractSuite(module: DataModule, options: ContractSuiteOptions = {}): void {
  describe(`[${options.adapterName ?? "adapter"}] ${module} repository contract`, () => {
    it.skip("no adapter registered for this module yet", () => {});
  });
}

/** Asserts that `promise` rejects with a `ContractError` of `code`; returns the error. */
export async function expectContractError(
  promise: Promise<unknown>,
  code: ContractErrorCode,
): Promise<{ code: ContractErrorCode; details: Record<string, unknown> }> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected a ContractError(${code})`).toBeDefined();
  expect(isContractError(caught), `expected a ContractError, got ${String(caught)}`).toBe(true);
  const error = caught as { code: ContractErrorCode; details: Record<string, unknown> };
  expect(error.code).toBe(code);
  return error;
}

let counter = 0;
/**
 * Unique suffix for slugs/keys so suites can run repeatedly against a persistent database.
 * Lowercase alphanumerics only (valid in slugs and keys).
 */
export function uniq(prefix = "x"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

const usedSundays = new Set<string>();
/**
 * A random Sunday between 2100 and ~2800 (unique within the process) — announcements are unique
 * per tenant and week, so suites must not reuse weeks against a persistent database.
 */
export function uniqueSunday(): string {
  for (;;) {
    const firstSunday = Date.UTC(2100, 0, 3); // 2100-01-03 is a Sunday
    const weeks = Math.floor(Math.random() * 36_000);
    const iso = new Date(firstSunday + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
    if (!usedSundays.has(iso)) {
      usedSundays.add(iso);
      return iso;
    }
  }
}

/** Instants used by suites: one far in the past, one far in the future. */
export const PAST = "2020-01-05T10:00:00+01:00";
export const FUTURE = "2999-01-05T10:00:00+01:00";

/** Minimal rich-text document. */
export function doc(text: string) {
  return {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

/** ids of a list, for concise assertions. */
export function ids(rows: readonly { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

/** Shared tenant-scoping assertions for a created row `id` of tenant A. */
export async function expectHiddenFromTenantB(opts: {
  getAsB: () => Promise<unknown>;
  listAsB: () => Promise<readonly { id: string }[]>;
  id: string;
}): Promise<void> {
  expect(await opts.getAsB()).toBeNull();
  expect(ids(await opts.listAsB())).not.toContain(opts.id);
}
