import "server-only";

import type { RealtimeConnection } from "@/lib/music/realtime/client";
import { tenantTopic } from "@/lib/music/realtime/client";
import { type CurrentUser } from "./auth";
import { MUSIC_REALTIME_ROLE, musicSupabaseConfigured, type MusicSupabaseEnv } from "./supabase";
import { mintTenantToken } from "./tenant-token";

// The server side of the music module's realtime transport (PLAN §19, owner decision 2026-11-25:
// Supabase Realtime with the tenant JWT). The browser asks for a short-lived token for the topics
// it uses; `authorizeRealtimeTopics` (realtime-access) decides which of them the user may receive
// and send on, and the policies on `realtime.messages` only compare the topic with the claims.
// Without a Supabase project (the in-process demo database) the transport is the local one.

/** The token lives this long; the client asks again shortly before. */
export const REALTIME_TOKEN_TTL_SECONDS = 300;

/** What the browser needs to connect (not secret: the policies check the token, not the key). */
export function getRealtimeConnection(
  user: Pick<CurrentUser, "id" | "tenantId">,
  env: MusicSupabaseEnv = process.env as MusicSupabaseEnv,
): RealtimeConnection {
  if (!musicSupabaseConfigured(env)) {
    return { mode: "local", tenantId: user.tenantId, userId: user.id };
  }
  return {
    mode: "supabase",
    url: env.SUPABASE_URL!,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY!,
    tenantId: user.tenantId,
    userId: user.id,
  };
}

export type RealtimeGrants = {
  /** Topics (without the tenant prefix) the token may receive on and track presence on. */
  receive: readonly string[];
  /** Topics the token may broadcast on. */
  send: readonly string[];
};

/** At most this many topics in one token. */
export const REALTIME_TOKEN_MAX_TOPICS = 20;

/** The access token for Realtime, with the topics of `grants`. Null without a Supabase project. */
export function mintRealtimeToken(
  user: Pick<CurrentUser, "id" | "tenantId">,
  grants: RealtimeGrants,
  env: MusicSupabaseEnv = process.env as MusicSupabaseEnv,
  now: Date = new Date(),
): { token: string; expiresInMs: number } | null {
  if (!musicSupabaseConfigured(env)) return null;
  const receive = grants.receive.slice(0, REALTIME_TOKEN_MAX_TOPICS);
  const token = mintTenantToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: MUSIC_REALTIME_ROLE,
    secret: env.SUPABASE_JWT_SECRET!,
    now,
    ttlSeconds: REALTIME_TOKEN_TTL_SECONDS,
    realtime: {
      topics: receive.map((topic) => tenantTopic(user.tenantId, topic)),
      send: grants.send
        .filter((topic) => receive.includes(topic))
        .map((topic) => tenantTopic(user.tenantId, topic)),
    },
  });
  return { token, expiresInMs: REALTIME_TOKEN_TTL_SECONDS * 1000 };
}
