import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  event: null as unknown,
  plans: [] as { id: string }[],
  planItems: [] as unknown[],
  setItems: [] as unknown[],
  applied: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/workspace", () => ({
  getMemberEnv: async () => ({
    ctx: {},
    repos: {
      servicePlans: {
        list: async () => state.plans,
        get: async () => ({ plan: { id: "p1" }, items: state.planItems }),
        setItems: async (_ctx: unknown, _id: string, items: unknown) => {
          state.setItems.push(items);
        },
      },
    },
  }),
}));
vi.mock("./models/events", () => ({
  getEventDetail: async () => state.event,
  applyEventItems: async (_id: string, items: unknown) => {
    state.applied.push(items);
    return true;
  },
}));

import { syncPlansFromSetlist, syncSetlistFromPlan } from "./plan-link";

const song = (arrangementId: string, title: string, key: string | null = null) => ({
  kind: "song" as const,
  key: `k-${arrangementId}`,
  song: { id: `s-${arrangementId}`, title },
  arrangement: { id: arrangementId },
  musicalKey: key,
  themeId: null,
  durationSeconds: null,
  blockKey: null,
  volunteerId: null,
});

describe("plan sync", () => {
  beforeEach(() => {
    state.event = null;
    state.plans = [{ id: "p1" }];
    state.planItems = [];
    state.setItems.length = 0;
    state.applied.length = 0;
  });

  it("the plan takes the songs of the setlist and keeps its other items", async () => {
    state.event = { id: "e1", items: [song("a1", "Áldás", "G"), song("a2", "Hála")] };
    state.planItems = [
      { type: "reading", title: "Olvasmány", arrangementId: null },
      { type: "song", title: "Régi dal", arrangementId: "a2", songId: "s-a2", notes: "szólóval" },
    ];
    await syncPlansFromSetlist("e1");
    const items = state.setItems[0] as {
      type: string;
      title: string;
      arrangementId: string | null;
      notes?: string;
    }[];
    expect(items.map((i) => i.title)).toEqual(["Olvasmány", "Áldás", "Régi dal"]);
    // The song that stays in the plan keeps its details; the new one starts from the setlist.
    expect(items.find((i) => i.arrangementId === "a2")?.notes).toBe("szólóval");
  });

  it("does nothing for an event that is not there", async () => {
    await syncPlansFromSetlist("e1");
    expect(state.setItems).toEqual([]);
  });

  it("the setlist takes the songs of the plan and keeps its text items", async () => {
    state.event = {
      id: "e1",
      items: [
        {
          kind: "text",
          key: "t",
          title: "Köszöntés",
          notes: null,
          scripture: false,
          scriptureTranslation: null,
          imageSetId: null,
          announcementId: null,
          textSlide: false,
          description: null,
          highlight: null,
          themeId: null,
          durationSeconds: null,
          blockKey: null,
          volunteerId: null,
        },
        song("a1", "Áldás"),
      ],
    };
    await syncSetlistFromPlan("e1", [
      { type: "song", title: "Hála", arrangementId: "a2", songId: "s2", keyOverride: "D" },
      { type: "prayer", title: "Ima", arrangementId: null, songId: null },
    ] as never);
    const items = state.applied[0] as {
      kind: string;
      arrangementId?: string;
      musicalKey?: string | null;
    }[];
    expect(items.map((i) => i.kind)).toEqual(["text", "song"]);
    expect(items[1]).toMatchObject({ arrangementId: "a2", musicalKey: "D" });
  });

  it("does nothing without an event", async () => {
    await syncSetlistFromPlan(null, []);
    expect(state.applied).toEqual([]);
  });
});
