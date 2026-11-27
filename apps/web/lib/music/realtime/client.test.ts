import { describe, expect, it } from "vitest";

import { createLocalRealtimeClient, tenantTopic } from "./client";

const TENANT = "11111111-1111-4111-8111-111111111111";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe("the local realtime transport", () => {
  it("names the channels per tenant", () => {
    expect(tenantTopic(TENANT, "live:abc")).toBe(`t:${TENANT}:live:abc`);
  });

  it("delivers a broadcast to the other channels of the topic, not to the sender or other topics", async () => {
    const a = createLocalRealtimeClient(TENANT);
    const b = createLocalRealtimeClient(TENANT);
    const received: unknown[] = [];
    const own: unknown[] = [];
    const other: unknown[] = [];
    const sender = a.channel("live:1");
    sender.on("broadcast", { event: "state" }, ({ payload }) => own.push(payload));
    const listener = b.channel("live:1").on("broadcast", { event: "state" }, ({ payload }) => {
      received.push(payload);
    });
    const unrelated = b.channel("live:2").on("broadcast", { event: "state" }, ({ payload }) => {
      other.push(payload);
    });
    const foreignTenant = createLocalRealtimeClient("22222222-2222-4222-8222-222222222222")
      .channel("live:1")
      .on("broadcast", { event: "state" }, ({ payload }) => other.push(payload));
    for (const channel of [sender, listener, unrelated, foreignTenant]) channel.subscribe();
    await tick();
    await sender.send({ type: "broadcast", event: "state", payload: { seq: 1 } });
    await tick();
    expect(received).toEqual([{ seq: 1 }]);
    expect(own).toEqual([]);
    expect(other).toEqual([]);
    for (const channel of [sender, listener, unrelated, foreignTenant]) {
      await a.removeChannel(channel);
    }
  });

  it("lists the participants that track their presence", async () => {
    const a = createLocalRealtimeClient(TENANT);
    const b = createLocalRealtimeClient(TENANT);
    const first = a.channel("live:3", { presenceKey: "ann" });
    const second = b.channel("live:3", { presenceKey: "bela" });
    let synced = 0;
    second.on("presence", { event: "sync" }, () => synced++);
    first.subscribe();
    second.subscribe();
    await tick();
    await first.track({ userId: "ann", name: "Anna" });
    await second.track({ userId: "bela", name: "Béla" });
    await tick();
    const state = second.presenceState();
    expect(Object.keys(state).sort()).toEqual(["ann", "bela"]);
    expect(synced).toBeGreaterThan(0);
    await a.removeChannel(first);
    await b.removeChannel(second);
  });
});
