import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "./repositories";
import { createMockSessions } from "./sessions";
import { CONTRACT_ENV, contractDataset } from "./testing/fixtures";

const ctxA = { tenantId: CONTRACT_ENV.tenantA, actor: CONTRACT_ENV.actorA };
const anonA = { tenantId: CONTRACT_ENV.tenantA, actor: { userId: null, personId: null } };

describe("createMockSessions", () => {
  it("isolates demo sessions: one session never sees another's changes", async () => {
    const sessions = createMockSessions({ datasetFactory: contractDataset });
    const alice = createMockRepositories(sessions.get("session-alice"));
    const bob = createMockRepositories(sessions.get("session-bob"));

    const location = await alice.locations.upsert(ctxA, {
      name: "Szent Anna-kápolna",
      slug: "szent-anna",
      kind: "kapolna",
    });
    await alice.tenants.updateSiteConfig(ctxA, { identity: { shortName: "Csak Alice" } });
    const receipt = await alice.requests
      .upsertForm(ctxA, {
        key: "keresztelo",
        title: "Keresztelési bejelentés",
        referencePrefix: "KER",
        fields: [{ type: "text", key: "nev", label: "Név", required: true }],
      })
      .then(() =>
        alice.requests.submit(anonA, {
          formKey: "keresztelo",
          data: { nev: "Minta Bence" },
          consent: true,
          consentTextHash: "sha256-v1-minta",
        }),
      );

    expect(await bob.locations.get(ctxA, location.id)).toBeNull();
    expect(await bob.locations.list(ctxA)).toEqual([]);
    expect((await bob.tenants.current(ctxA))?.siteConfig.identity).toBeUndefined();
    expect(await bob.requests.get(ctxA, receipt.id)).toBeNull();
    expect(sessions.get("session-bob").listOutbox()).toEqual([]);
    expect(sessions.get("session-alice").listOutbox()).toHaveLength(2);

    // The same session id returns the same store.
    expect(sessions.get("session-alice")).toBe(sessions.get("session-alice"));
    expect(sessions.size).toBe(2);
  });

  it("resets one session to its seed without touching the others", async () => {
    const sessions = createMockSessions({ datasetFactory: contractDataset });
    const a = createMockRepositories(sessions.get("a"));
    const b = createMockRepositories(sessions.get("b"));
    await a.people.upsert(ctxA, { familyName: "Teszt", givenName: "Aladár" });
    const kept = await b.people.upsert(ctxA, { familyName: "Teszt", givenName: "Borbála" });
    const reset = sessions.reset("a");
    expect(reset.snapshot()).toEqual(contractDataset());
    expect((await b.people.get(ctxA, kept.id))?.givenName).toBe("Borbála");
    // reset() of an unknown session creates it from the seed.
    expect(sessions.reset("uj").snapshot()).toEqual(contractDataset());
  });

  it("creates stores lazily, once per session", () => {
    const factory = vi.fn(contractDataset);
    const sessions = createMockSessions({ datasetFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    sessions.get("x");
    sessions.get("x");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(sessions.has("x")).toBe(true);
    expect(sessions.has("y")).toBe(false);
  });

  it("expires idle sessions after the TTL", () => {
    let now = 0;
    const sessions = createMockSessions({
      datasetFactory: contractDataset,
      ttlMs: 1000,
      clock: () => now,
    });
    const first = sessions.get("s1");
    sessions.get("s2");
    now = 900;
    sessions.get("s1"); // refreshes s1
    now = 1500;
    expect(sessions.has("s1")).toBe(true);
    expect(sessions.has("s2")).toBe(false);
    expect(sessions.sweep()).toBe(1);
    expect(sessions.size).toBe(1);
    now = 3000;
    // An expired session comes back fresh.
    expect(sessions.get("s1")).not.toBe(first);
  });

  it("caps the number of sessions, evicting the least recently used", () => {
    let now = 0;
    const sessions = createMockSessions({
      datasetFactory: contractDataset,
      maxSessions: 2,
      clock: () => ++now,
    });
    sessions.get("a");
    sessions.get("b");
    sessions.get("a"); // a is now most recent
    sessions.get("c"); // evicts b
    expect(sessions.size).toBe(2);
    expect(sessions.has("a")).toBe(true);
    expect(sessions.has("b")).toBe(false);
    expect(sessions.has("c")).toBe(true);
    expect(sessions.delete("a")).toBe(true);
    expect(sessions.delete("a")).toBe(false);
  });

  it("rejects invalid session ids and options", () => {
    const sessions = createMockSessions({ datasetFactory: contractDataset });
    expect(() => sessions.get("")).toThrow(TypeError);
    expect(() => sessions.get("../etc")).toThrow(TypeError);
    expect(() => sessions.get("x".repeat(129))).toThrow(TypeError);
    expect(() => createMockSessions({ datasetFactory: contractDataset, ttlMs: 0 })).toThrow(
      RangeError,
    );
    expect(() => createMockSessions({ datasetFactory: contractDataset, maxSessions: 0 })).toThrow(
      RangeError,
    );
  });
});
