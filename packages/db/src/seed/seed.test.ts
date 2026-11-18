import { DEMO_TENANT_IDS, createDemoDataset } from "@churchy/data-mock";
import { describe, expect, it } from "vitest";
import { contextSettings, databaseUrl } from "../client";
import { demoUuid, isUuid, mapIds } from "./ids";
import { parentsFirst, prepareDemoDataset } from "./demo";
import { validateDataset } from "./validate";

const NOW = new Date("2026-11-18T10:00:00+01:00");

describe("demoUuid", () => {
  it("is deterministic, RFC 9562 version 5, and keeps existing UUIDs", () => {
    const a = demoUuid("t-szenttivadar");
    expect(a).toBe(demoUuid("t-szenttivadar"));
    expect(a).not.toBe(demoUuid("t-reformatus"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuid(a)).toBe(true);
    expect(demoUuid(a.toUpperCase())).toBe(a);
  });
});

describe("mapIds", () => {
  it("maps known ids everywhere (fields, arrays, nested JSON) and leaves other strings", () => {
    const known = new Set(["p-1", "m-1"]);
    const out = mapIds(
      { id: "p-1", ids: ["p-1", "x"], nested: { mediaId: "m-1", text: "p-1 is here" }, n: 3 },
      known,
    );
    expect(out).toEqual({
      id: demoUuid("p-1"),
      ids: [demoUuid("p-1"), "x"],
      nested: { mediaId: demoUuid("m-1"), text: "p-1 is here" },
      n: 3,
    });
  });
});

describe("parentsFirst", () => {
  it("orders self-references parent before child", () => {
    const rows = [
      { id: "c", parent: "b" },
      { id: "b", parent: "a" },
      { id: "a", parent: null },
      { id: "x", parent: "outside" },
    ];
    expect(parentsFirst(rows, (r) => r.parent).map((r) => r.id)).toEqual(["a", "x", "b", "c"]);
  });

  it("rejects cycles", () => {
    const rows = [
      { id: "a", parent: "b" },
      { id: "b", parent: "a" },
    ];
    expect(() => parentsFirst(rows, (r) => r.parent)).toThrow(/Cyclic/);
  });
});

describe("validateDataset", () => {
  it("reports rows that break a contract schema", () => {
    const ds = createDemoDataset(NOW);
    ds.posts[0] = { ...ds.posts[0]!, slug: "Nem Slug" };
    const issues = validateDataset(ds);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ collection: "posts", index: 0 });
    expect(issues[0]!.message).toMatch(/^slug: /);
  });
});

describe("databaseUrl", () => {
  it("reads DATABASE_URL from the environment only", () => {
    expect(databaseUrl({ DATABASE_URL: "postgres://x" })).toBe("postgres://x");
    expect(() => databaseUrl({})).toThrow(/DATABASE_URL/);
    expect(() => databaseUrl({ DATABASE_URL: " " })).toThrow(/DATABASE_URL/);
  });
});

describe("contextSettings (per-transaction RLS settings)", () => {
  const actor = { userId: "u", personId: null };
  it("maps tenant, organization and platform contexts", () => {
    expect(contextSettings({ tenantId: "t", actor })).toEqual({ tenantId: "t", orgId: "" });
    expect(contextSettings({ orgId: "o", actor })).toEqual({ tenantId: "", orgId: "o" });
    expect(contextSettings({ actor })).toEqual({ tenantId: "", orgId: "" });
  });

  it("never sets both (SDD §25.7)", () => {
    expect(() => contextSettings({ tenantId: "t", orgId: "o", actor })).toThrow();
  });
});

describe("demo seed data (D-02 AC4) — same fixtures as the mock adapter", () => {
  const ds = prepareDemoDataset(NOW);
  const fixtures = createDemoDataset(NOW);

  it("the D-91 fixtures and the id-mapped rows pass the contract Zod schemas", () => {
    expect(validateDataset(fixtures)).toEqual([]);
    expect(validateDataset(ds)).toEqual([]);
  });

  it("is the mock fixture set, row for row", () => {
    for (const key of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
      expect(ds[key].length, key).toBe(fixtures[key].length);
    }
  });

  it("uses UUIDs for every id", () => {
    for (const rows of Object.values(ds) as { id?: unknown; tenantId?: unknown }[][]) {
      for (const row of rows) {
        if (typeof row.id === "string") expect(isUuid(row.id), row.id).toBe(true);
        if (typeof row.tenantId === "string") expect(isUuid(row.tenantId)).toBe(true);
      }
    }
  });

  it("has the 3 demo churches + diocese with the D-02 minimum content, in Hungarian", () => {
    const churches = [DEMO_TENANT_IDS.catholic, DEMO_TENANT_IDS.reformed, DEMO_TENANT_IDS.baptist];
    expect(ds.organizations).toHaveLength(1);
    for (const fixtureId of churches) {
      const id = demoUuid(fixtureId);
      const of = <T extends { tenantId: string | null }>(rows: T[]) =>
        rows.filter((r) => r.tenantId === id);
      expect(of(ds.posts).length, `${fixtureId} news`).toBeGreaterThanOrEqual(10);
      expect(of(ds.events).length, `${fixtureId} events`).toBeGreaterThanOrEqual(15);
      expect(of(ds.serviceRules).length, `${fixtureId} schedule`).toBeGreaterThan(0);
      expect(of(ds.announcements).length, `${fixtureId} announcements`).toBeGreaterThanOrEqual(4);
      const staff = of(ds.people).filter((p) => p.isPublic && p.active);
      expect(staff.length, `${fixtureId} staff`).toBeGreaterThanOrEqual(6);
    }
    const catholic = demoUuid(DEMO_TENANT_IDS.catholic);
    expect(ds.locations.filter((l) => l.tenantId === catholic).length).toBeGreaterThanOrEqual(2);
    expect(ds.posts.some((p) => /[áéíóöőúüű]/i.test(p.title))).toBe(true);
  });
});
