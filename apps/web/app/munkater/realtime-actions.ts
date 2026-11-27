"use server";

import { z } from "zod";

import type { RealtimeToken } from "@/lib/music/realtime/client";
import { requireUser } from "@/server/music/auth";
import { getLiveSession } from "@/server/music/models/live-sessions";
import { authorizeRealtimeTopics } from "@/server/music/models/realtime-access";
import { musicEvents } from "@/server/music/policy";
import { mintRealtimeToken } from "@/server/music/realtime";
import { withPolicy, type PolicyScope } from "@/server/policy";

const topicsSchema = z.array(z.string().max(100)).max(20);

/**
 * The access token for Realtime, with exactly the topics of `topics` that the signed-in user may use
 * (`authorizeRealtimeTopics`). Null without a Supabase project (the local transport needs none).
 */
export const realtimeTokenAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope: PolicyScope, topics: string[]): Promise<RealtimeToken | null> => {
    const user = await requireUser();
    const grants = await authorizeRealtimeTopics(topicsSchema.parse(topics), async (sessionId) => {
      // The leader sends; the other participants with access receive.
      const session = await getLiveSession(sessionId);
      if (session === null) return null;
      return session.isLeader ? "lead" : "join";
    });
    const minted = mintRealtimeToken(user, grants);
    return minted && { ...minted, userId: user.id };
  },
);
