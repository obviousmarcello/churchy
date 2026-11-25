import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createMusicSupabaseClient, MUSIC_DB_ROLE, musicSupabaseConfigured } from "./supabase";

/** The nil uuid: the `sub` of a feed request that is not a user (the token names the user). */
const FEED_SUBJECT = "00000000-0000-0000-0000-000000000000";

/**
 * The database client of a calendar feed request: a calendar app sends no session, so the client
 * carries only the tenant of the request (the host's church). Null without a configured Supabase
 * project: the demo's data lives in a session, which a calendar app does not have.
 */
export function feedClient(tenantId: string): SupabaseClient | null {
  if (!musicSupabaseConfigured()) return null;
  return createMusicSupabaseClient(
    {
      kind: "tenant",
      tenantId,
      userId: FEED_SUBJECT,
      personId: null,
      websiteRoles: [],
      workspaceRoles: [],
    },
    MUSIC_DB_ROLE,
  );
}
