import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@churchy/policy";
import { mintTenantToken } from "./tenant-token";

/**
 * Per-request supabase-js client for the music module's server models (SDD ADR-20). Replaces the
 * music app's `getSupabaseAdmin()` (secret key, bypasses RLS) for data access: every request gets
 * a client whose JWT carries the actor's tenant, so the `tenant_isolation` policies apply.
 *
 * `dbRole` is the Postgres role the token asks PostgREST to switch to. Which role the music
 * tables are granted to is still open (docs/music-merge/PLAN.md, phase 1b), so callers pass it.
 * Configuration: docs/music-merge/SUPABASE-SETUP.md.
 */
export interface MusicSupabaseEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
  readonly SUPABASE_JWT_SECRET?: string;
}

export function createMusicSupabaseClient(
  actor: Actor,
  dbRole: string,
  env: MusicSupabaseEnv = process.env as MusicSupabaseEnv,
  now: Date = new Date(),
): SupabaseClient {
  if (actor.kind !== "tenant" || actor.userId === null) {
    throw new Error("music: a signed-in tenant actor is required");
  }
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_JWT_SECRET: secret } = env;
  if (!url || !key || !secret) throw new Error("music: Supabase is not configured");
  const token = mintTenantToken({
    userId: actor.userId,
    tenantId: actor.tenantId,
    role: dbRole,
    secret,
    now,
  });
  return createClient(url, key, {
    // No stored session: nothing is kept or refreshed, nothing leaks between requests.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
