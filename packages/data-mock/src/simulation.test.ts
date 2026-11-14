/** Integration tests: every simulation switch exercised through the repositories. */
import { DATA_MODULES, isContractError } from "@churchy/contracts";
import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "./repositories";
import {
  MockOfflineError,
  MockSimulationError,
  isMockSimulationError,
  mergeSwitches,
  DEFAULT_SWITCHES,
} from "./simulation";
import { createMockStore } from "./store";
import { CONTRACT_ENV, contractDataset, seedContractFixtures } from "./testing/fixtures";

const ctxA = { tenantId: CONTRACT_ENV.tenantA, actor: CONTRACT_ENV.actorA };
const at = (hhmm: string) => `2032-05-10T${hhmm}:00+02:00`;

async function roomIn(repos: ReturnType<typeof createMockRepositories>) {
  const loc = await repos.locations.upsert(ctxA, {
    name: "Plébániaház",
    slug: "haz",
    kind: "egyeb",
  });
  return repos.rooms.upsert(ctxA, { locationId: loc.id, name: "Közösségi terem" });
}

describe("simulation switches", () => {
  it("latency: every repository call waits latencyMs (0–2,000 ms)", async () => {
    const sleep = vi.fn(async () => {});
    const store = createMockStore(contractDataset(), { sleep });
    const repos = createMockRepositories(store);
    await repos.locations.list(ctxA);
    expect(sleep).not.toHaveBeenCalled();
    store.setSwitches({ latencyMs: 750 });
    await repos.locations.list(ctxA);
    await repos.billing.listPlans(ctxA);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(750);
  });

  it("latency: real timers delay the call", async () => {
    const store = seedContractFixtures({ switches: { latencyMs: 40 } });
    const repos = createMockRepositories(store);
    const started = Date.now();
    await repos.tenants.current(ctxA);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("offline: every module rejects with a typed offline error until switched back", async () => {
    const store = seedContractFixtures();
    const repos = createMockRepositories(store);
    store.setSwitches({ offline: true });
    for (const module of DATA_MODULES) {
      const repo = repos[module] as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const method = Object.values(repo)[0]!;
      const error = await method(ctxA).catch((e: unknown) => e);
      expect(error, module).toBeInstanceOf(MockOfflineError);
      expect(isMockSimulationError(error, "OFFLINE")).toBe(true);
      expect(isContractError(error)).toBe(false);
    }
    store.setSwitches({ offline: false });
    expect((await repos.tenants.current(ctxA))?.id).toBe(CONTRACT_ENV.tenantA);
  });

  it("offline: a call in flight fails if the switch flips during the latency", async () => {
    const sleepStore = createMockStore(contractDataset(), {
      switches: { latencyMs: 10 },
      sleep: async () => {
        sleepStore.setSwitches({ offline: true });
      },
    });
    const repos = createMockRepositories(sleepStore);
    await expect(repos.tenants.current(ctxA)).rejects.toBeInstanceOf(MockOfflineError);
  });

  it("bookingConflictOnNext: the next booking write fails with CONFLICT, then resets itself", async () => {
    const store = seedContractFixtures();
    const repos = createMockRepositories(store);
    const room = await roomIn(repos);
    store.setSwitches({ bookingConflictOnNext: true });
    const error = await repos.bookings
      .create(ctxA, { roomId: room.id, startsAt: at("10:00"), endsAt: at("11:00"), title: "Próba" })
      .catch((e: unknown) => e);
    expect(isContractError(error, "CONFLICT")).toBe(true);
    expect((error as { details: Record<string, unknown> }).details).toMatchObject({
      simulated: true,
    });
    expect(store.switches.bookingConflictOnNext).toBe(false);
    const booking = await repos.bookings.create(ctxA, {
      roomId: room.id,
      startsAt: at("10:00"),
      endsAt: at("11:00"),
      title: "Próba",
    });
    expect(booking.status).toBe("pending");

    store.setSwitches({ bookingConflictOnNext: true });
    await expect(
      repos.bookings.update(ctxA, booking.id, { title: "Átnevezve" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    store.setSwitches({ bookingConflictOnNext: true });
    await expect(
      repos.bookings.createSeries(
        ctxA,
        {
          roomId: room.id,
          rrule: "FREQ=WEEKLY;COUNT=1",
          dtstart: at("18:00"),
          durationMin: 60,
          title: "Sorozat",
        },
        [{ startsAt: at("18:00"), endsAt: at("19:00") }],
        { skipConflicts: true },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Nothing was written by the failed calls.
    expect((await repos.bookings.get(ctxA, booking.id))?.title).toBe("Próba");
    expect(store.data.bookingSeries).toEqual([]);
  });

  it("uploadFailure: media uploads fail while on; nothing is recorded", async () => {
    const store = seedContractFixtures({ switches: { uploadFailure: true } });
    const repos = createMockRepositories(store);
    const upload = () =>
      repos.media.create(ctxA, {
        kind: "pdf",
        filename: "hirdetes.pdf",
        mimeType: "application/pdf",
        storageKey: "t/a/hirdetes.pdf",
        bytes: 1000,
      });
    const error = await upload().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockSimulationError);
    expect(isMockSimulationError(error, "UPLOAD_FAILED")).toBe(true);
    expect((await repos.media.usage(ctxA)).count).toBe(0);
    store.setSwitches({ uploadFailure: false });
    expect((await upload()).filename).toBe("hirdetes.pdf");
  });

  it("paymentFailure: subscriptions fail, nothing is written and the billing contact is notified", async () => {
    const store = seedContractFixtures();
    const repos = createMockRepositories(store);
    await repos.billing.upsertBillingAccount(ctxA, {
      name: "Minta Plébánia",
      address: { postalCode: "1011", city: "Budapest", line1: "Minta utca 1.", line2: null },
      email: "szamlazas@example.test",
      paymentMethod: "card",
    });
    const sub = await repos.billing.createSubscription(ctxA, {
      planKey: "teljes",
      tenantId: CONTRACT_ENV.tenantA,
      period: "monthly",
      status: "active",
      currentPeriodEnd: "2027-01-01T00:00:00+01:00",
    });
    store.setSwitches({ paymentFailure: true });
    const error = await repos.billing
      .createSubscription(ctxA, {
        planKey: "ws_s50",
        tenantId: CONTRACT_ENV.tenantA,
        period: "monthly",
        status: "active",
        currentPeriodEnd: "2027-01-01T00:00:00+01:00",
      })
      .catch((e: unknown) => e);
    expect(isMockSimulationError(error, "PAYMENT_FAILED")).toBe(true);
    await expect(
      repos.billing.updateSubscription(ctxA, sub.id, { status: "active" }),
    ).rejects.toMatchObject({
      code: "PAYMENT_FAILED",
    });
    expect(await repos.billing.listSubscriptions(ctxA)).toHaveLength(1);
    expect(store.listOutbox({ template: "billing.paymentFailed" })).toHaveLength(2);
  });

  it("mergeSwitches validates every field and isMockSimulationError rejects other values", () => {
    expect(mergeSwitches({ ...DEFAULT_SWITCHES }, { paymentFailure: true }).paymentFailure).toBe(
      true,
    );
    expect(isMockSimulationError(null)).toBe(false);
    expect(isMockSimulationError(new Error("x"))).toBe(false);
    expect(isMockSimulationError(new MockOfflineError(), "PAYMENT_FAILED")).toBe(false);
  });
});
