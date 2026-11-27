import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { id: "u1", tenantId: "t1", canEditEvents: false, canManageIn: async () => true } as Record<
    string,
    unknown
  >,
  ors: [] as string[],
  inserts: [] as Record<string, unknown>[],
  rows: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/music/auth", () => ({
  requireUser: async () => db.user,
  requireEventAdminIn: async () => db.user,
}));
vi.mock("@/server/music/db", () => ({
  getMusicSupabase: async () => {
    const query: Record<string, unknown> = {};
    const self = () => query;
    Object.assign(query, {
      select: self,
      eq: self,
      order: async () => ({ data: db.rows, error: null }),
      or: (filter: string) => {
        db.ors.push(filter);
        return query;
      },
      insert: (values: Record<string, unknown>) => {
        db.inserts.push(values);
        return query;
      },
      single: async () => ({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          title: db.inserts.at(-1)?.title,
          starts_at: db.inserts.at(-1)?.starts_at,
          ends_at: db.inserts.at(-1)?.ends_at,
          youtube_url: null,
          is_private: false,
          area_ids: [],
          rrule: db.inserts.at(-1)?.rrule ?? null,
          exdates: [],
          parent_event_id: null,
          recurrence_id: null,
          setlist_id: null,
          projection_theme_id: null,
          created_by: null,
        },
        error: null,
      }),
    });
    return {
      from: () => query,
      rpc: async (name: string) => ({
        data:
          name === "event_member_access"
            ? { area_ids: ["33333333-3333-4333-8333-333333333333"], extra_event_ids: [] }
            : "22222222-2222-4222-8222-222222222222",
        error: null,
      }),
    };
  },
}));

import { createEvent, listEvents } from "./events";

describe("music events", () => {
  beforeEach(() => {
    db.ors.length = 0;
    db.inserts.length = 0;
    db.user = { id: "u1", tenantId: "t1", canEditEvents: false, canManageIn: async () => true };
  });

  it("hides private events of others from a member, not from an event admin", async () => {
    await listEvents();
    expect(db.ors).toEqual([
      "and(is_private.is.false,area_ids.ov.{33333333-3333-4333-8333-333333333333}),created_by.eq.u1",
    ]);
    db.ors.length = 0;
    db.user = { id: "u1", tenantId: "t1", canEditEvents: true, canManageIn: async () => true };
    await listEvents();
    expect(db.ors).toEqual([]);
  });

  it("creates an event in the music calendar with the default duration", async () => {
    const event = await createEvent({
      title: "Vasárnapi próba",
      startsAt: "2026-11-29T17:00:00+01:00",
    });
    expect(db.inserts[0]).toMatchObject({
      calendar_id: "22222222-2222-4222-8222-222222222222",
      visibility: "staff",
      starts_at: "2026-11-29T16:00:00.000Z",
      ends_at: "2026-11-29T17:30:00.000Z",
      created_by: "u1",
    });
    expect(String(db.inserts[0]?.slug)).toMatch(/^vasarnapi-proba-2026-11-29-[0-9a-f]{8}$/);
    expect(event.durationMinutes).toBe(90);
  });

  it("makes a series from a valid rrule and refuses an invalid one", async () => {
    const event = await createEvent({
      title: "Heti próba",
      startsAt: "2026-11-29T17:00:00+01:00",
      rrule: "FREQ=WEEKLY;BYDAY=SU",
    });
    expect(event.rrule).toBe("FREQ=WEEKLY;BYDAY=SU");
    await expect(
      createEvent({ title: "x", startsAt: "2026-11-29T17:00:00+01:00", rrule: "nonsense" }),
    ).rejects.toThrow();
  });
});
