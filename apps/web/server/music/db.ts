import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoModeEnabled } from "@/lib/demo/flag";
import { localMusicFetch, localMusicUserId } from "@/server/data-adapters";
import { getDemoState } from "@/server/demo";
import { getActor } from "@/server/session";
import { headers } from "next/headers";
import {
  createMusicSupabaseClient,
  MUSIC_DB_ROLE,
  musicSupabaseConfigured,
  tenantStorageFetch,
} from "./supabase";

/**
 * The music models' database client for this request (replaces Music Sheet DB's
 * `getSupabaseAdmin()`, SDD ADR-20): the per-request tenant-token client of the signed-in actor
 * when a Supabase project is configured; otherwise local mode (demo, Phase A, e2e), the same
 * supabase-js calls answered by the in-process Postgres (`localMusicFetch`), never in staging or
 * production. Authorization is `can()` / `withPolicy` before the call and RLS inside it.
 */
/** The actor's profile id as the music tables store it (`created_by`, `reviewed_by`, …). */
export function musicUserId(userId: string): string {
  return musicSupabaseConfigured() ? userId : localMusicUserId(userId);
}

/**
 * The client of the background jobs (`server/jobs`): a job runs for one church at a time without a
 * request, so there is no actor. `runWithMusicClient` makes the models of that scope use the given
 * tenant client (`getMusicSupabase()` returns it).
 */
const jobClient = new AsyncLocalStorage<SupabaseClient>();

export function runWithMusicClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  return jobClient.run(client, run);
}

export const getMusicSupabase = cache(async (): Promise<SupabaseClient> => {
  const scoped = jobClient.getStore();
  if (scoped) return scoped;
  const actor = await getActor();
  if (musicSupabaseConfigured()) return createMusicSupabaseClient(actor, MUSIC_DB_ROLE);
  const appEnv = process.env.APP_ENV;
  if (appEnv === "staging" || appEnv === "production") {
    throw new Error("music: Supabase is not configured");
  }
  if (actor.kind !== "tenant" || actor.userId === null) {
    throw new Error("music: a signed-in tenant actor is required");
  }
  const sessionId = demoModeEnabled() ? ((await getDemoState())?.sessionId ?? null) : null;
  const local = await localMusicFetch(
    sessionId,
    { tenantId: actor.tenantId, userId: actor.userId },
    MUSIC_DB_ROLE,
  );
  // The client "lives" under an app route of this host, so the signed Storage URLs it hands to
  // the browser (uploads, downloads) reach the local Storage (`fajl/helyi/[...path]/route.ts`).
  // Its other requests never leave the process.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return createClient(`${proto}://${host}${LOCAL_STORAGE_BASE}`, "local", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: tenantStorageFetch(local.tenantId, local.fetch) },
  });
});

/** The base path of the local client (see `getMusicSupabase`). */
export const LOCAL_STORAGE_BASE = "/munkater/enektar/fajl/helyi";
