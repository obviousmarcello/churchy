// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TtlLruCache } from "./cache";
import { createTenant, splitOwnerName } from "./create-tenant";
import { createFakeDb } from "./fake-db";
import { createHostResolver, normalizeHost } from "./hosts";
import { getEntitlementsRow, getProfileByAuthUser } from "./queries";
import { RESERVED_SLUGS, checkSlug } from "./slug";

const T1 = "11111111-1111-4111-8111-111111111111";
const U1 = "22222222-2222-4222-8222-222222222222";
const O1 = "33333333-3333-4333-8333-333333333333";

describe("TtlLruCache", () => {
  it("expires entries after the TTL", () => {
    let now = 0;
    const cache = new TtlLruCache<string>({ ttlMs: 60_000, maxEntries: 10, now: () => now });
    cache.set("a", "x");
    now = 59_999;
    expect(cache.get("a")).toBe("x");
    now = 60_000;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used entry", () => {
    const cache = new TtlLruCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // a is now the most recent
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("deletes by key, by predicate, and clears", () => {
    const cache = new TtlLruCache<number>({ ttlMs: 1000, maxEntries: 5 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.deleteWhere((_k, v) => v > 2)).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe("slug validation", () => {
  it("normalizes with slugify and accepts a church name", () => {
    expect(checkSlug("Szent István Plébánia")).toEqual({ ok: true, slug: "szent-istvan-plebania" });
    expect(checkSlug("  Őrség-Hősök ")).toEqual({ ok: true, slug: "orseg-hosok" });
  });

  it("rejects too short, too long and empty slugs", () => {
    for (const bad of ["", "ab", "!!!", "x".repeat(41), "---"]) {
      expect(checkSlug(bad), bad).toEqual({ ok: false, reason: "invalid" });
    }
    expect(checkSlug("x".repeat(40)).ok).toBe(true);
  });

  it("rejects reserved words, also after normalization", () => {
    for (const word of [
      "www",
      "platform",
      "admin",
      "api",
      "app",
      "belepes",
      "munkater",
      "egyhazmegye",
    ]) {
      expect(RESERVED_SLUGS.has(word), word).toBe(true);
      expect(checkSlug(word), word).toEqual({ ok: false, reason: "reserved" });
    }
    expect(checkSlug("Munkatér")).toEqual({ ok: false, reason: "reserved" });
    expect(checkSlug("ADMIN")).toEqual({ ok: false, reason: "reserved" });
  });

  it("every reserved word is itself a valid-looking slug (the list names real collisions)", () => {
    for (const word of RESERVED_SLUGS) expect(word).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("normalizeHost", () => {
  it("lower-cases, strips port and trailing dot, rejects garbage", () => {
    expect(normalizeHost("Szent.Churchy.HU:3000")).toBe("szent.churchy.hu");
    expect(normalizeHost("example.hu.")).toBe("example.hu");
    for (const bad of ["", " ", "a b.hu", "x/y.hu", "-a.hu", "a..hu", "evil.hu/../"]) {
      expect(normalizeHost(bad), bad).toBeNull();
    }
  });
});

describe("resolveHost", () => {
  const tenant = { id: T1, slug: "szentistvan", status: "active" };
  let now: number;
  let fake: ReturnType<typeof createFakeDb>;
  const make = (extra: Parameters<typeof createFakeDb>[0] = () => undefined) => {
    fake = createFakeDb((text, values) => {
      if (/from tenants where slug/.test(text)) return values[0] === tenant.slug ? [tenant] : [];
      if (/from organizations where slug/.test(text))
        return values[0] === "veszprem" ? [{ id: O1, slug: "veszprem" }] : [];
      if (/from domains d join tenants/.test(text)) {
        return values[0] === "szentistvan-plebania.hu"
          ? [{ tenant_id: T1, slug: "szentistvan", status: "active" }]
          : [];
      }
      return extra(text, values);
    });
    return createHostResolver({
      db: async () => fake.db,
      appBaseDomain: "churchy.hu",
      publicBaseDomain: "egyhaz.example",
      now: () => now,
    });
  };
  beforeEach(() => {
    now = 0;
  });

  it("maps every host kind of SDD §4.1", async () => {
    const r = make();
    expect(await r.resolveHost("platform.churchy.hu")).toEqual({ kind: "platform" });
    expect(await r.resolveHost("szentistvan.churchy.hu")).toEqual({
      kind: "app",
      tenantId: T1,
      slug: "szentistvan",
      suspended: false,
    });
    expect(await r.resolveHost("szentistvan.egyhaz.example")).toMatchObject({
      kind: "public",
      tenantId: T1,
    });
    expect(await r.resolveHost("veszprem.churchy.hu")).toEqual({
      kind: "org",
      orgId: O1,
      slug: "veszprem",
    });
    expect(await r.resolveHost("szentistvan-plebania.hu")).toMatchObject({
      kind: "public",
      tenantId: T1,
    });
    expect(await r.resolveHost("www.szentistvan-plebania.hu")).toMatchObject({
      kind: "public",
      tenantId: T1,
    });
  });

  it("unknown hosts, reserved labels, the bare base domains and invalid hosts are unknown", async () => {
    const r = make();
    for (const host of [
      "nincs.churchy.hu",
      "nincs.egyhaz.example",
      "admin.churchy.hu",
      "www.churchy.hu",
      "churchy.hu",
      "egyhaz.example",
      "a.b.churchy.hu",
      "other.example",
      "bad host",
    ]) {
      expect(await r.resolveHost(host), host).toEqual({ kind: "unknown" });
    }
  });

  it("serves from the cache for 60 s (also misses), then asks again", async () => {
    const r = make();
    await r.resolveHost("szentistvan.churchy.hu");
    await r.resolveHost("SZENTISTVAN.churchy.hu:443");
    await r.resolveHost("nincs.churchy.hu");
    await r.resolveHost("nincs.churchy.hu");
    expect(fake.calls.filter((c) => /from tenants/.test(c.text))).toHaveLength(2);
    now = 61_000;
    await r.resolveHost("szentistvan.churchy.hu");
    expect(fake.calls.filter((c) => /from tenants/.test(c.text))).toHaveLength(3);
  });

  it("invalidates a host (and its www twin) and a tenant's hosts", async () => {
    const r = make();
    await r.resolveHost("szentistvan-plebania.hu");
    await r.resolveHost("szentistvan.churchy.hu");
    await r.resolveHost("nincs.churchy.hu");
    r.invalidateHost("www.szentistvan-plebania.hu");
    await r.resolveHost("szentistvan-plebania.hu");
    expect(fake.calls.filter((c) => /from domains/.test(c.text))).toHaveLength(2);

    const before = fake.calls.length;
    r.invalidateTenant({ slug: "szentistvan" });
    await r.resolveHost("szentistvan.churchy.hu");
    await r.resolveHost("szentistvan-plebania.hu");
    expect(fake.calls.length).toBeGreaterThan(before);
    const afterOne = fake.calls.length;
    await r.resolveHost("nincs.churchy.hu"); // untouched entry still cached
    expect(fake.calls.length).toBe(afterOne);
    r.invalidateTenant({ tenantId: T1 });
    r.clear();
    await r.resolveHost("nincs.churchy.hu");
    expect(fake.calls.length).toBeGreaterThan(afterOne);
  });

  it("reports a suspended tenant and queries only verified domains", async () => {
    fake = createFakeDb((text) =>
      /from tenants where slug/.test(text) ? [{ ...tenant, status: "suspended" }] : [],
    );
    const r = createHostResolver({ db: async () => fake.db, now: () => now });
    expect(await r.resolveHost("szentistvan.churchy.hu")).toMatchObject({ suspended: true });
    await r.resolveHost("custom.example");
    expect(fake.calls.at(-1)?.text).toContain("verified_at is not null");
  });
});

describe("getProfileByAuthUser / getEntitlementsRow", () => {
  it("returns null for non-uuid ids without touching the database", async () => {
    const { db, calls } = createFakeDb();
    expect(await getProfileByAuthUser("t-demo", db)).toBeNull();
    expect(await getEntitlementsRow("t-demo", db)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("maps the profile and its diocesan memberships", async () => {
    const { db } = createFakeDb((text) => {
      if (/from profiles/.test(text))
        return [
          {
            id: U1,
            email: "a@example.test",
            name: "Próba Anna",
            two_factor_enabled: true,
            last_login_at: null,
          },
        ];
      if (/from org_memberships/.test(text))
        return [{ org_id: O1, roles: ["hrOfficer"], category_scopes: null, parish_scopes: [T1] }];
      return [];
    });
    expect(await getProfileByAuthUser(U1, db)).toEqual({
      id: U1,
      email: "a@example.test",
      name: "Próba Anna",
      twoFactorEnabled: true,
      lastLoginAt: null,
      orgMemberships: [
        { orgId: O1, roles: ["hrOfficer"], categoryScopes: null, parishScopes: [T1] },
      ],
    });
    expect(await getProfileByAuthUser(U1, createFakeDb().db)).toBeNull();
  });

  const entitlements = {
    customDomain: false,
    storageGb: 1,
    maxEditors: 3,
    modules: ["news"],
    footerCredit: true,
    workspaceAllowed: false,
    wsTier: "none",
    wsModules: [],
    maxWorkspaceUsers: null,
    musicResearchPerMonth: 0,
  };

  it("builds the entitlement sources: free plan, no workspace, no deal", async () => {
    const { db, calls } = createFakeDb((text) => {
      if (/from tenants/.test(text))
        return [{ plan_key: "ingyenes", ws_tier: "none", organization_id: null }];
      if (/from plans/.test(text))
        return [
          {
            key: "ingyenes",
            name: "Ingyenes",
            kind: "website",
            price_monthly: 0,
            price_yearly: 0,
            entitlements,
          },
        ];
      return [];
    });
    const sources = await getEntitlementsRow(T1, db);
    expect(sources?.websitePlan.key).toBe("ingyenes");
    expect(sources?.workspacePlan).toBeNull();
    expect(sources?.deal).toBeNull();
    expect(calls.some((c) => /from deals/.test(c.text))).toBe(false);
  });

  it("includes the workspace plan and the deal in force; null for unknown tenant or plan", async () => {
    const { db } = createFakeDb((text, values) => {
      if (/from tenants/.test(text))
        return [{ plan_key: "teljes", ws_tier: "s50", organization_id: O1 }];
      if (/from plans/.test(text)) {
        expect(values[0]).toEqual(["teljes", "ws_s50"]);
        return [
          {
            key: "teljes",
            name: "Teljes",
            kind: "website",
            price_monthly: 1,
            price_yearly: 10,
            entitlements,
          },
          {
            key: "ws_s50",
            name: "Munkatér S",
            kind: "workspace",
            price_monthly: 2,
            price_yearly: 20,
            entitlements,
          },
        ];
      }
      if (/from deals/.test(text))
        return [{ id: "d1", plan_keys: ["teljes"], valid_from: "2026-01-01", valid_to: null }];
      return [];
    });
    const sources = await getEntitlementsRow(T1, db);
    expect(sources?.workspacePlan?.key).toBe("ws_s50");
    expect(sources?.deal).toEqual({
      id: "d1",
      planKeys: ["teljes"],
      validFrom: "2026-01-01",
      validTo: null,
    });

    expect(await getEntitlementsRow(T1, createFakeDb().db)).toBeNull();
    const noPlan = createFakeDb((text) =>
      /from tenants/.test(text)
        ? [{ plan_key: "teljes", ws_tier: "none", organization_id: null }]
        : [],
    );
    expect(await getEntitlementsRow(T1, noPlan.db)).toBeNull();
  });
});

describe("splitOwnerName", () => {
  it("family name first, titles with a dot are the prefix", () => {
    expect(splitOwnerName("Kovács János")).toEqual({
      prefix: null,
      family: "Kovács",
      given: "János",
    });
    expect(splitOwnerName("dr. Nagy Anna Mária")).toEqual({
      prefix: "dr.",
      family: "Nagy",
      given: "Anna Mária",
    });
    expect(splitOwnerName("P. Fr. Tóth")).toEqual({ prefix: "P. Fr.", family: "Tóth", given: "" });
    expect(splitOwnerName("Szabó")).toEqual({ prefix: null, family: "Szabó", given: "" });
  });
});

describe("createTenant", () => {
  const input = {
    name: "Szent István Plébánia",
    slug: "Szent István",
    denomination: "rk" as const,
    owner: { authUserId: U1, email: "Anna@Example.test", name: "dr. Nagy Anna" },
  };
  const happy = (text: string) => {
    if (/from plans/.test(text)) return [{ "?column?": 1 }];
    if (/into profiles/.test(text)) return [{ id: U1 }];
    return [];
  };

  it("bootstraps the church in one transaction with audit entries", async () => {
    const { db, calls, events } = createFakeDb(happy);
    const result = await createTenant(input, db);
    expect(result).toMatchObject({ ok: true, slug: "szent-istvan", profileExisted: false });
    expect(events).toEqual(["begin", "commit"]);
    expect(calls.every((c) => c.tx)).toBe(true);
    const tables = calls.map((c) => /into (\w+)/.exec(c.text)?.[1] ?? c.text.split(" ")[3]);
    expect(tables).toEqual([
      "plans",
      "organizations",
      "tenants",
      "profiles",
      "billing_accounts",
      "subscriptions",
      "memberships",
      "people",
      "audit_log",
      "audit_log",
    ]);
    const tenantInsert = calls.find((c) => /into tenants/.test(c.text))!;
    expect(tenantInsert.values.slice(1)).toEqual([
      "szent-istvan",
      "Szent István Plébánia",
      "rk",
      "ingyenes",
    ]);
    const profile = calls.find((c) => /into profiles/.test(c.text))!;
    expect(profile.values).toEqual([U1, "anna@example.test", "dr. Nagy Anna"]); // email lower-cased
    const membership = calls.find((c) => /into memberships/.test(c.text))!;
    expect(membership.text).toContain("'owner'");
    const person = calls.find((c) => /into people/.test(c.text))!;
    expect(person.values.slice(3, 6)).toEqual(["dr.", "Nagy", "Anna"]);
    // Audit entries: no name or e-mail anywhere in them.
    for (const audit of calls.filter((c) => /into audit_log/.test(c.text))) {
      const text = JSON.stringify(audit.values);
      expect(text).not.toMatch(/Nagy|Anna|example\.test/);
    }
  });

  it("skips the profile audit entry when the profile already existed", async () => {
    const { db, calls } = createFakeDb((text) => (/from plans/.test(text) ? [{ x: 1 }] : []));
    const result = await createTenant(input, db);
    expect(result).toMatchObject({ ok: true, profileExisted: true });
    expect(calls.filter((c) => /into audit_log/.test(c.text))).toHaveLength(1);
  });

  it("returns invalid with Hungarian issues for bad input, without a transaction", async () => {
    const { db, events } = createFakeDb();
    const result = await createTenant(
      { ...input, name: " ", owner: { ...input.owner, authUserId: "nope", email: "not-an-email" } },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    if (!result.ok && result.reason === "invalid") {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        "name",
        "owner.authUserId",
        "owner.email",
      ]);
      expect(result.issues.every((i) => i.message.length > 0)).toBe(true);
    }
    expect(events).toEqual([]);
  });

  it("refuses reserved and invalid slugs before touching the database", async () => {
    const { db, events } = createFakeDb();
    expect(await createTenant({ ...input, slug: "admin" }, db)).toEqual({
      ok: false,
      reason: "slug_reserved",
    });
    expect(await createTenant({ ...input, slug: "ab" }, db)).toEqual({
      ok: false,
      reason: "slug_invalid",
    });
    expect(events).toEqual([]);
  });

  it("maps a duplicate slug (unique violation) and rolls back", async () => {
    const dup = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "tenants_slug_unique",
    });
    const { db, events } = createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into tenants/.test(text)) return dup;
      return [];
    });
    expect(await createTenant(input, db)).toEqual({ ok: false, reason: "slug_taken" });
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("maps a taken e-mail, an organization slug and a missing free plan", async () => {
    const dupEmail = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "profiles_email_key",
    });
    const a = createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into profiles/.test(text)) return dupEmail;
      return [];
    });
    expect(await createTenant(input, a.db)).toEqual({ ok: false, reason: "email_taken" });

    const b = createFakeDb((text) =>
      /from plans/.test(text) ? [{ x: 1 }] : /from organizations/.test(text) ? [{ x: 1 }] : [],
    );
    expect(await createTenant(input, b.db)).toEqual({ ok: false, reason: "slug_taken" });
    expect(b.calls.some((c) => /into tenants/.test(c.text))).toBe(false);

    const c = createFakeDb();
    expect(await createTenant(input, c.db)).toEqual({ ok: false, reason: "plan_missing" });
  });

  it("rethrows unexpected errors (permission, connection)", async () => {
    const denied = Object.assign(new Error("permission denied"), { code: "42501" });
    const { db, events } = createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into memberships/.test(text)) return denied;
      return [];
    });
    await expect(createTenant(input, db)).rejects.toThrow("permission denied");
    expect(events).toEqual(["begin", "rollback"]);
  });
});
