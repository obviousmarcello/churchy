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
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: tenantStorageFetch(actor.tenantId),
    },
  });
}

/** The Postgres role of the music tables (migration 0007_music_rls). */
export const MUSIC_DB_ROLE = "churchy_music";

/** Whether a Supabase project is configured for the music module (else: local mode). */
export function musicSupabaseConfigured(env: MusicSupabaseEnv = process.env as MusicSupabaseEnv) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_JWT_SECRET);
}

/**
 * Storage keys are `t/<tenant_id>/<path>` (SUPABASE-SETUP.md "Storage"); the music models keep
 * using their tenant-relative paths. Rewrites the object path of every Storage request (and the
 * `prefixes` of a bulk delete), so no model builds a key itself.
 */
export function tenantStorageFetch(tenantId: string, base: typeof fetch = fetch): typeof fetch {
  const prefix = `t/${tenantId}/`;
  return async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(href).pathname.includes("/storage/v1/")) return base(input, init);
    const request = new Request(input, init);
    const url = new URL(request.url);
    const match =
      /^(.*\/storage\/v1\/object\/(?:sign\/|upload\/sign\/|public\/|authenticated\/|info\/)?)([^/]+)\/(.+)$/.exec(
        url.pathname,
      );
    if (match) {
      url.pathname = `${match[1]}${match[2]}/${prefix}${match[3]}`;
      return base(new Request(url, request));
    }
    if (request.method === "DELETE" && /\/storage\/v1\/object\/[^/]+$/.test(url.pathname)) {
      const body = (await request.json()) as { prefixes: string[] };
      return base(
        new Request(url, {
          method: "DELETE",
          headers: request.headers,
          body: JSON.stringify({ prefixes: body.prefixes.map((p) => prefix + p) }),
        }),
      );
    }
    throw new Error(`music storage: unsupported request ${request.method} ${url.pathname}`);
  };
}
