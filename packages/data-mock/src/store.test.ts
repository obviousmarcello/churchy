import { describe, expect, it } from "vitest";
import { emptyDataset } from "./dataset";
import { createMockRepositories } from "./repositories";
import { createMockStore } from "./store";
import { CONTRACT_ENV, contractDataset } from "./testing/fixtures";

const ctxA = { tenantId: CONTRACT_ENV.tenantA, actor: CONTRACT_ENV.actorA };

describe("createMockStore", () => {
  it("holds a deep clone and never mutates the dataset it was created from", async () => {
    const seed = contractDataset();
    const pristine = structuredClone(seed);
    const store = createMockStore(seed);
    const repos = createMockRepositories(store);
    await repos.locations.upsert(ctxA, {
      name: "Szent Anna-kápolna",
      slug: "szent-anna",
      kind: "kapolna",
    });
    await repos.tenants.updateSiteConfig(ctxA, { identity: { shortName: "Minta" } });
    expect(seed).toEqual(pristine);
    expect(store.data.locations).toHaveLength(1);
  });

  it("reset() restores the seed exactly, clears the outbox and restores switches", async () => {
    const seed = contractDataset();
    const store = createMockStore(seed, { switches: { latencyMs: 0 } });
    const repos = createMockRepositories(store);
    const firstId = store.nextId("x");
    await repos.members.invite(ctxA, {
      email: "uj.tag@example.test",
      name: "Új Tag",
      role: "editor",
    });
    await repos.people.upsert(ctxA, { familyName: "Teszt", givenName: "Elek" });
    store.data.tenants[0]!.name = "Átírt név";
    store.setSwitches({ uploadFailure: true });
    expect(store.listOutbox()).toHaveLength(1);

    store.reset();
    expect(store.snapshot()).toEqual(seed);
    expect(store.listOutbox()).toEqual([]);
    expect(store.switches.uploadFailure).toBe(false);
    expect(store.nextId("x")).toBe(firstId);
  });

  it("returns copies, so callers cannot mutate the store through results", async () => {
    const store = createMockStore(contractDataset());
    const repos = createMockRepositories(store);
    const tenant = await repos.tenants.current(ctxA);
    tenant!.name = "Kívülről átírva";
    expect((await repos.tenants.current(ctxA))?.name).toBe("Minta Plébánia");
    const snapshot = store.snapshot();
    snapshot.tenants.length = 0;
    expect(store.data.tenants).toHaveLength(2);
  });

  it("generates unique ids and uses the injected clock", () => {
    const now = new Date("2026-11-13T09:00:00Z");
    const store = createMockStore(emptyDataset(), { now: () => now });
    expect(store.nextId("a")).not.toBe(store.nextId("a"));
    expect(store.now()).toBe(now);
    expect(store.nowIso()).toBe("2026-11-13T09:00:00.000Z");
  });

  it("validates switch values", () => {
    const store = createMockStore(emptyDataset());
    expect(store.setSwitches({ latencyMs: 2000 }).latencyMs).toBe(2000);
    expect(() => store.setSwitches({ latencyMs: 2001 })).toThrow(RangeError);
    expect(() => store.setSwitches({ latencyMs: -1 })).toThrow(RangeError);
    expect(() => store.setSwitches({ latencyMs: 1.5 })).toThrow(RangeError);
    expect(() => store.setSwitches({ offline: "igen" as never })).toThrow(TypeError);
    expect(() => createMockStore(emptyDataset(), { switches: { latencyMs: 5000 } })).toThrow(
      RangeError,
    );
    store.resetSwitches();
    expect(store.switches.latencyMs).toBe(0);
  });

  it("keeps a filterable outbox and rejects non-scalar or long params", () => {
    const store = createMockStore(emptyDataset());
    store.appendOutbox({
      channel: "email",
      template: "request.confirmation",
      recipient: { kind: "persona", persona: "requester" },
      tenantId: "t-1",
      params: { reference: "KER-2026-0001" },
    });
    store.appendOutbox({
      channel: "push",
      template: "plan.mention",
      recipient: { kind: "person", personId: "p-1" },
      tenantId: "t-2",
      params: { planId: "plan-1" },
    });
    expect(store.listOutbox({ tenantId: "t-1" })).toHaveLength(1);
    expect(store.listOutbox({ channel: "push" })[0]?.template).toBe("plan.mention");
    expect(store.listOutbox({ template: "request.confirmation" })[0]).toMatchObject({
      id: expect.any(String),
      at: expect.any(String),
    });
    expect(() =>
      store.appendOutbox({
        channel: "email",
        template: "hr.ticketUpdated",
        recipient: { kind: "persona", persona: "hrHandlers" },
        tenantId: "t-1",
        params: { body: "x".repeat(201) },
      }),
    ).toThrow(TypeError);
    expect(() =>
      store.appendOutbox({
        channel: "email",
        template: "hr.ticketUpdated",
        recipient: { kind: "persona", persona: "hrHandlers" },
        tenantId: "t-1",
        params: { data: { nested: true } } as never,
      }),
    ).toThrow(TypeError);
    store.clearOutbox();
    expect(store.listOutbox()).toEqual([]);
  });
});
