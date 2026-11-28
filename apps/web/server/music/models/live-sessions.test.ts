import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/music/auth", () => ({
  requireUser: async () => ({ id: "u1", tenantId: "t1", canEditEvents: false }),
}));
const insert = vi.fn(async () => ({
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    event_id: null,
    arrangement_ids: ["22222222-2222-4222-8222-222222222222"],
    musical_keys: null,
    leader_id: "33333333-3333-4333-8333-333333333333",
    created_at: new Date().toISOString(),
  },
  error: null,
}));
vi.mock("@/server/music/db", () => ({
  getMusicSupabase: async () => ({
    from: () => ({ insert: () => ({ select: () => ({ single: insert }) }) }),
  }),
}));

import { ConflictError } from "@/server/music/errors";
import { REHEARSAL_SESSIONS_PER_HOUR, startRehearsalLiveSession } from "./live-sessions";

describe("rehearsal live sessions", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)["__churchyRehearsalSessionLimiter"] = undefined;
    insert.mockClear();
  });

  it("limits how many a user starts in an hour", async () => {
    const input = { arrangementIds: ["22222222-2222-4222-8222-222222222222"] };
    for (let i = 0; i < REHEARSAL_SESSIONS_PER_HOUR; i++) await startRehearsalLiveSession(input);
    await expect(startRehearsalLiveSession(input)).rejects.toBeInstanceOf(ConflictError);
    expect(insert).toHaveBeenCalledTimes(REHEARSAL_SESSIONS_PER_HOUR);
  });
});
