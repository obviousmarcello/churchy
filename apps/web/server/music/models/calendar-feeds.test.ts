import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/music/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/server/music/db", () => ({ getMusicSupabase: async () => ({}) }));

import { readCalendarFeed } from "./calendar-feeds";

const TOKEN = "a".repeat(64);
const USER = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";

function client(tables: Record<string, unknown[]>, hashes: string[]) {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    Object.assign(q, {
      select: self,
      eq: (column: string, value: string) => {
        if (column === "token_hash") hashes.push(value);
        return q;
      },
      not: self,
      in: self,
      gte: self,
      order: async () => ({ data: tables[table], error: null }),
      maybeSingle: async () => ({ data: tables[table]?.[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: tables[table], error: null }),
    });
    return q;
  };
  return { from: builder } as never;
}

describe("readCalendarFeed", () => {
  it("refuses a malformed token without a query", async () => {
    expect(await readCalendarFeed(client({}, []), "nope", "https://x.hu")).toBeNull();
  });

  it("looks the token up by its hash and lists only yes or unanswered events", async () => {
    const hashes: string[] = [];
    const ics = await readCalendarFeed(
      client(
        {
          calendar_feeds: [{ user_id: USER }],
          event_volunteers: [
            { event_id: EVENT, reply: null },
            { event_id: "33333333-3333-4333-8333-333333333333", reply: "no" },
          ],
          events: [
            {
              id: EVENT,
              title: "Vasárnapi próba",
              starts_at: "2031-03-02T16:00:00Z",
              ends_at: "2031-03-02T17:30:00Z",
              youtube_url: null,
              setlist_id: null,
            },
          ],
        },
        hashes,
      ),
      TOKEN,
      "https://x.hu",
    );
    expect(hashes).toEqual([createHash("sha256").update(TOKEN).digest("hex")]);
    expect(ics).toContain("SUMMARY:Vasárnapi próba");
    expect(ics).toContain(`URL:https://x.hu/munkater/esemenyek/${EVENT}`);
    expect(ics).toContain("DTSTART:20310302T160000Z");
  });

  it("is null for an unknown token", async () => {
    expect(
      await readCalendarFeed(client({ calendar_feeds: [] }, []), TOKEN, "https://x.hu"),
    ).toBeNull();
  });
});
