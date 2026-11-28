import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (run: () => void) => run }));
vi.mock("@/server/session", () => ({ getActor: vi.fn() }));
vi.mock("@/server/music/db", () => ({ getMusicSupabase: vi.fn() }));

const enqueued: Record<string, unknown>[] = [];
vi.mock("@/server/music/outbox", () => ({
  enqueueMusicOutbox: async (message: Record<string, unknown>) => {
    enqueued.push(message);
  },
  eventLink: (eventId: string) => `/munkater/esemenyek/${eventId}`,
  outboxSessionId: async () => null,
}));
vi.mock("@/server/music/push", () => ({ isPushEnabled: () => false, sendPush: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyEventAdded, sendDueNotifications, toldWhenAdded } from "./notifications";

const EVENT = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";
const TENANT = "44444444-4444-4444-8444-444444444444";
const HOUR = 3_600_000;

type Table = Record<string, unknown>[];

/** A tiny stand-in for the query builder: a table answers every select/in/eq with all its rows. */
function fakeDb(tables: {
  events: Table;
  notification_preferences: Table;
  notification_deliveries: Table;
  due: Table;
}) {
  const claims: Record<string, unknown>[] = [];
  const builder = (rows: Table, onUpsert?: (row: Record<string, unknown>) => void) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "in", "eq", "not", "delete"]) chain[name] = () => chain;
    chain.upsert = (row: Record<string, unknown>) => {
      onUpsert?.(row);
      return { select: async () => ({ data: [{ kind: row.kind }], error: null }) };
    };
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
    return chain;
  };
  const db = {
    from: (table: keyof typeof tables) =>
      builder(
        tables[table] as Table,
        table === "notification_deliveries" ? (row) => claims.push(row) : undefined,
      ),
    rpc: async () => ({ data: tables.due, error: null }),
  };
  return { db: db as unknown as SupabaseClient, claims };
}

beforeEach(() => {
  enqueued.length = 0;
});

describe("the notifications of the events", () => {
  it("tells a user who was added by an outbox entry with the start time, and marks it", async () => {
    const startsAt = new Date(Date.now() + 48 * HOUR).toISOString();
    const { db, claims } = fakeDb({
      events: [{ id: EVENT, starts_at: startsAt }],
      notification_preferences: [],
      notification_deliveries: [],
      due: [],
    });
    expect(await notifyEventAdded(db, TENANT, EVENT, [USER_A])).toBe(1);
    expect(enqueued).toEqual([
      {
        tenantId: TENANT,
        profileId: USER_A,
        template: "music.eventAdded",
        eventId: EVENT,
        startsAt,
        channel: "email",
      },
    ]);
    expect(claims).toEqual([{ event_id: EVENT, user_id: USER_A, kind: "event_added" }]);
  });

  it("sends nothing for an event that has started", async () => {
    const { db } = fakeDb({
      events: [{ id: EVENT, starts_at: new Date(Date.now() - HOUR).toISOString() }],
      notification_preferences: [],
      notification_deliveries: [],
      due: [],
    });
    expect(await notifyEventAdded(db, TENANT, EVENT, [USER_A])).toBe(0);
    expect(enqueued).toEqual([]);
  });

  it("sends the due reminders and the setlist once each, with no name and no title", async () => {
    const startsAt = new Date(Date.now() + HOUR).toISOString();
    const { db, claims } = fakeDb({
      events: [{ id: EVENT, starts_at: startsAt }],
      notification_preferences: [
        {
          user_id: USER_B,
          email: false,
          event_added: true,
          event_reminder: true,
          reminder_days: 5,
          setlist: true,
          setlist_hours: 2,
          live_session: true,
        },
      ],
      notification_deliveries: [],
      due: [
        { kind: "event_reminder", event_id: EVENT, user_id: USER_A },
        { kind: "setlist", event_id: EVENT, user_id: USER_A },
        { kind: "setlist", event_id: EVENT, user_id: USER_B },
      ],
    });
    expect(await sendDueNotifications(db, TENANT)).toEqual({ sent: 2, failed: 0 });
    // USER_B turned the emails off and has no device: marked, nothing sent.
    expect(claims).toHaveLength(3);
    expect(enqueued.map((m) => [m.template, m.profileId])).toEqual([
      ["music.eventReminder", USER_A],
      ["music.setlist", USER_A],
    ]);
    for (const message of enqueued) {
      expect(Object.keys(message).sort()).toEqual(
        ["channel", "eventId", "profileId", "startsAt", "template", "tenantId"].sort(),
      );
    }
  });

  it("skips the reminder when the added notice went out within its time", () => {
    const startsAt = new Date(Date.UTC(2026, 11, 20, 10)).toISOString();
    const prefs = { reminderDays: 5 };
    expect(toldWhenAdded(startsAt, prefs, undefined)).toBe(false);
    expect(toldWhenAdded(startsAt, prefs, "2026-12-16T10:00:00Z")).toBe(true);
    expect(toldWhenAdded(startsAt, prefs, "2026-12-01T10:00:00Z")).toBe(false);
  });
});
