/**
 * Unit tests of the DB adapter base without a database: context validation happens before a
 * connection is taken, error mapping, row helpers and the registry wiring.
 */
import {
  AdapterRegistry,
  ContractError,
  adapterRegistry,
  isContractError,
  type Ctx,
} from "@churchy/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../client";
import { appDb, registerDbAdapter } from "../register";
import { DB_MODULES, createDbRepositories, dbRepositoryFactories } from "./index";
import {
  asUuid,
  createDbAdapterBase,
  expectRow,
  isoInstant,
  isoInstantOrNull,
  requireUuid,
} from "./base";
import { DbAdapterError, mapDbError, pgErrorOf } from "./errors";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const ORG = "00000000-0000-4000-8000-0000000000aa";
const staff = { userId: "u-1", personId: "p-1" };
const anonymous = { userId: null, personId: null };

/** A source that fails the test if the adapter ever tries to connect. */
const neverConnect = vi.fn((): Db => {
  throw new Error("must not connect");
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isContractError(error) ? error.code : `other: ${String(error)}`;
  }
  return "resolved";
}

afterEach(() => neverConnect.mockClear());

describe("adapter base: contexts are checked before any query", () => {
  const base = createDbAdapterBase(neverConnect);
  const fn = vi.fn(async () => "ran");

  it("rejects a missing or malformed context with CONTEXT", async () => {
    expect(await codeOf(base.run(undefined as unknown as Ctx, fn))).toBe("CONTEXT");
    expect(await codeOf(base.run({} as Ctx, fn))).toBe("CONTEXT");
    expect(await codeOf(base.read(null as unknown as Ctx, "empty", fn))).toBe("CONTEXT");
    expect(await codeOf(base.write({ tenantId: "", actor: staff }, fn))).toBe("CONTEXT");
  });

  it("rejects tenant/org ids that are not database ids (e.g. mock ids) with CONTEXT", async () => {
    expect(await codeOf(base.read({ tenantId: "t-szenttivadar", actor: staff }, "", fn))).toBe(
      "CONTEXT",
    );
    expect(await codeOf(base.run({ orgId: "o-egyhazmegye", actor: staff }, fn))).toBe("CONTEXT");
  });

  it("rejects a context carrying both tenantId and orgId (SDD §25.7)", async () => {
    const both = { tenantId: TENANT, orgId: ORG, actor: staff };
    expect(await codeOf(base.run(both, fn))).toBe("CONTEXT");
    expect(await codeOf(base.read(both, "empty", fn))).toBe("CONTEXT");
    expect(await codeOf(base.write(both, fn))).toBe("CONTEXT");
  });

  it("tenant reads return the empty value for organization and platform contexts", async () => {
    expect(await base.read({ orgId: ORG, actor: staff }, "empty", fn)).toBe("empty");
    expect(await base.read({ actor: staff }, null, fn)).toBeNull();
  });

  it("tenant writes need a tenant context and a signed-in actor", async () => {
    expect(await codeOf(base.write({ orgId: ORG, actor: staff }, fn))).toBe("CONTEXT");
    expect(await codeOf(base.write({ actor: staff }, fn))).toBe("CONTEXT");
    expect(await codeOf(base.write({ tenantId: TENANT, actor: anonymous }, fn))).toBe("FORBIDDEN");
  });

  it("never connected and never ran the query", () => {
    expect(fn).not.toHaveBeenCalled();
    expect(neverConnect).not.toHaveBeenCalled();
  });

  it("repositories validate the context before connecting", async () => {
    const repos = createDbRepositories(neverConnect);
    const both = { tenantId: TENANT, orgId: ORG, actor: staff };
    expect(await codeOf(repos.locations.list(both))).toBe("CONTEXT");
    expect(await repos.locations.list({ orgId: ORG, actor: staff })).toEqual([]);
    expect(await repos.announcements.latest({ actor: staff })).toBeNull();
    expect(await repos.announcements.list({ actor: staff }, { pageSize: 5 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 5,
    });
    expect(await codeOf(repos.announcements.list({ actor: staff }, { pageSize: 0 }))).toBe(
      "VALIDATION",
    );
    expect(await codeOf(repos.announcements.publish({ orgId: ORG, actor: staff }, TENANT))).toBe(
      "CONTEXT",
    );
    expect(neverConnect).not.toHaveBeenCalled();
  });
});

describe("error mapping", () => {
  const pgError = (code: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(`driver message with row values ${code}`), { code, ...extra });

  it("finds the driver error in the cause chain", () => {
    const driver = pgError("23505");
    expect(pgErrorOf(new Error("wrapped", { cause: driver }))).toBe(driver);
    expect(pgErrorOf(new Error("plain"))).toBeNull();
    expect(pgErrorOf(Object.assign(new Error("net"), { code: "ECONNREFUSED" }))).toBeNull();
    expect(pgErrorOf("not an object")).toBeNull();
  });

  it.each([
    ["23505", "CONFLICT"],
    ["23P01", "CONFLICT"],
    ["23503", "NOT_FOUND"],
    ["23502", "VALIDATION"],
    ["23514", "VALIDATION"],
    ["22P02", "VALIDATION"],
  ])("maps SQLSTATE %s to %s", (code, expected) => {
    const mapped = mapDbError(new Error("query failed", { cause: pgError(code) }));
    expect(isContractError(mapped)).toBe(true);
    expect((mapped as ContractError).code).toBe(expected);
    expect(mapped.message).not.toContain("row values");
  });

  it("maps RLS violations to NOT_FOUND and other privilege errors to FORBIDDEN", () => {
    const rls = pgError("42501", {
      message: 'new row violates row-level security policy for table "locations"',
    });
    expect((mapDbError(rls) as ContractError).code).toBe("NOT_FOUND");
    const grant = pgError("42501", { message: "permission denied for table plans" });
    expect((mapDbError(grant) as ContractError).code).toBe("FORBIDDEN");
  });

  it("keeps constraint and table, never the driver message", () => {
    const mapped = mapDbError(
      pgError("23505", { constraint: "locations_tenant_id_slug_key", table: "locations" }),
    ) as ContractError;
    expect(mapped.details).toEqual({
      constraint: "locations_tenant_id_slug_key",
      entity: "locations",
    });
    const unknown = mapDbError(pgError("22012", { constraint: "c", table: "t" }));
    expect(unknown).toBeInstanceOf(DbAdapterError);
    expect(unknown.message).toBe("Database error 22012 (c)");
    expect(unknown).toMatchObject({ sqlState: "22012", constraint: "c", table: "t" });
  });

  it("passes contract errors and non-database errors through", () => {
    const contract = new ContractError("CONFLICT", "x");
    expect(mapDbError(contract)).toBe(contract);
    const bug = new TypeError("bug");
    expect(mapDbError(bug)).toBe(bug);
    expect(mapDbError("thrown string")).toBeInstanceOf(DbAdapterError);
    expect(new DbAdapterError(null).message).toBe("Database adapter failure");
  });
});

describe("row helpers", () => {
  it("accepts only uuids as database ids", () => {
    expect(asUuid("nincs-ilyen")).toBeNull();
    expect(asUuid(null)).toBeNull();
    expect(asUuid(TENANT.toUpperCase())).toBe(TENANT);
    expect(requireUuid(TENANT, "Location")).toBe(TENANT);
    expect(() => requireUuid("loc-1", "Location")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });

  it("converts driver timestamps to ISO-8601 instants", () => {
    expect(isoInstant("2026-11-18 09:00:00.123+01")).toBe("2026-11-18T08:00:00.123Z");
    expect(isoInstant("2026-11-18 09:00:00+05:30")).toBe("2026-11-18T03:30:00.000Z");
    expect(isoInstant("2026-11-18T08:00:00Z")).toBe("2026-11-18T08:00:00.000Z");
    expect(isoInstantOrNull(null)).toBeNull();
    expect(() => isoInstant("tegnap")).toThrow(/Unexpected timestamptz/);
  });

  it("expectRow returns the first row or throws NOT_FOUND", () => {
    expect(expectRow([{ id: "a" }], "X", "a")).toEqual({ id: "a" });
    expect(() => expectRow([], "X", "a")).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});

describe("registry wiring", () => {
  it("registers a db factory for exactly the modules with a DB adapter", () => {
    const registry = new AdapterRegistry();
    registry.register("db", dbRepositoryFactories(neverConnect));
    expect(registry.registeredModules("db")).toEqual(
      expect.arrayContaining(["locations", "announcements"]),
    );
    expect(registry.registeredModules("db")).toHaveLength(DB_MODULES.length);
    const locations = registry.resolve("locations", { DATA_ADAPTER_LOCATIONS: "db" });
    expect(typeof locations.list).toBe("function");
    expect(registry.unavailableModules({ DATA_ADAPTER_NEWS: "db" })).toContainEqual({
      module: "news",
      kind: "db",
    });
    expect(neverConnect).not.toHaveBeenCalled();
  });

  it("registerDbAdapter registers with the process-wide registry without connecting", () => {
    registerDbAdapter(neverConnect);
    expect(adapterRegistry.registeredModules("db")).toEqual(
      expect.arrayContaining([...DB_MODULES]),
    );
    // Only the db adapter is registered here, so every module left on mock is unavailable.
    expect(adapterRegistry.unavailableModules({ DATA_ADAPTER_LOCATIONS: "db" })).not.toContainEqual(
      { module: "locations", kind: "db" },
    );
    adapterRegistry.clear();
    expect(neverConnect).not.toHaveBeenCalled();
  });

  it("appDb needs DATABASE_URL and creates one lazy pool", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => appDb()).toThrow("DATABASE_URL is not set");
    vi.stubEnv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none");
    const db = appDb();
    expect(appDb()).toBe(db);
    await (db as Db & { $client: { end(): Promise<void> } }).$client.end();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("churchy.db.appDb")];
    vi.unstubAllEnvs();
  });
});
