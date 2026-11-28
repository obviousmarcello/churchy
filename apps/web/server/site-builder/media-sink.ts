import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertTenantStorageKey, tenantStorageKey } from "@churchy/db/storage-keys";
import type { Ctx } from "@churchy/contracts";
import { mintTenantToken } from "@/server/music/tenant-token";

/**
 * Where the images of an applied draft go (SDD ADR-21). Both apply paths use a `MediaSink`:
 * Supabase Storage (live), memory (demo and tests). A sink only stores and removes objects of ONE
 * tenant under `t/<tenant_id>/media/<uuid>.webp`; it never logs object bytes.
 */

/** Private bucket of the sites' media (migration 0028_site_media). */
export const SITE_MEDIA_BUCKET = "site-media";
/** The Postgres role of the Storage token (migration 0028_site_media). */
export const SITE_MEDIA_DB_ROLE = "churchy_site_media";
export const SITE_MEDIA_MIME = "image/webp";

export interface MediaSink {
  /** The object key of a media id for the context's tenant (`t/<tenant_id>/media/<uuid>.webp`). */
  keyFor(ctx: Ctx, mediaId: string): string;
  /** Stores `bytes` (webp) at `key`; throws on failure. `key` must be the tenant's own media key. */
  put(ctx: Ctx, key: string, bytes: Buffer): Promise<void>;
  /** Best-effort removal (rollback cleanup); never throws, returns the keys it could not remove. */
  remove(ctx: Ctx, keys: readonly string[]): Promise<string[]>;
}

/** `t/<tenant_id>/media/<uuid>.webp` for a media id; the tenant must be a UUID. */
export function mediaStorageKey(ctx: Ctx, mediaId: string): string {
  return tenantStorageKey(ctx, "media", `${mediaId}.webp`);
}

const MEDIA_KEY = /^t\/[0-9a-f-]{36}\/media\/[0-9a-f-]{36}\.webp$/;
function checkedKey(ctx: Ctx, key: string): string {
  assertTenantStorageKey(ctx, key);
  if (!MEDIA_KEY.test(key)) throw new Error("media sink: not a site media key");
  return key;
}

/**
 * Demo and tests: objects in memory. The demo churches' ids are not UUIDs, so unlike Storage this
 * sink only requires the `t/<tenant>/media/` prefix of the context's own tenant.
 */
export class MemoryMediaSink implements MediaSink {
  readonly objects = new Map<string, Buffer>();
  keyFor(ctx: Ctx, mediaId: string): string {
    return `t/${ctx.tenantId}/media/${mediaId}.webp`;
  }
  private check(ctx: Ctx, key: string): void {
    if (!ctx.tenantId || !key.startsWith(`t/${ctx.tenantId}/media/`) || key.includes("..")) {
      throw new Error("memory sink: not the tenant's media key");
    }
  }
  /** Keys whose `put` should fail (tests). */
  failOn: ReadonlySet<string> = new Set();
  async put(ctx: Ctx, key: string, bytes: Buffer): Promise<void> {
    this.check(ctx, key);
    if (this.failOn.has(key)) throw new Error("memory sink: put failed");
    this.objects.set(key, Buffer.from(bytes));
  }
  async remove(ctx: Ctx, keys: readonly string[]): Promise<string[]> {
    for (const key of keys) {
      this.check(ctx, key);
      this.objects.delete(key);
    }
    return [];
  }
}

export interface SupabaseSinkEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
  readonly SUPABASE_JWT_SECRET?: string;
}

/** Whether the live Storage sink can be built (else images stay listed candidates). */
export function supabaseSinkConfigured(
  env: SupabaseSinkEnv = process.env as SupabaseSinkEnv,
): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_JWT_SECRET);
}

/**
 * Supabase Storage through its REST API with a server-minted, tenant-scoped JWT (role
 * `churchy_site_media`, claim `tenant_id`): the storage policies of 0028 admit only
 * bucket `site-media`, key `t/<claim tenant>/media/<uuid>.webp`. No service-role key, RLS and
 * policies stay in force. A fresh short-lived token is minted for every call.
 */
export class SupabaseMediaSink implements MediaSink {
  constructor(
    private readonly actorUserId: string,
    private readonly env: SupabaseSinkEnv = process.env as SupabaseSinkEnv,
  ) {}

  keyFor(ctx: Ctx, mediaId: string): string {
    return mediaStorageKey(ctx, mediaId);
  }

  private bucket(ctx: Ctx) {
    const {
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: key,
      SUPABASE_JWT_SECRET: secret,
    } = this.env;
    if (!url || !key || !secret) throw new Error("media sink: Supabase is not configured");
    const tenantId = ctx.tenantId;
    if (!tenantId) throw new Error("media sink: tenant context required");
    const token = mintTenantToken({
      userId: this.actorUserId,
      tenantId,
      role: SITE_MEDIA_DB_ROLE,
      secret,
    });
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return client.storage.from(SITE_MEDIA_BUCKET);
  }

  async put(ctx: Ctx, key: string, bytes: Buffer): Promise<void> {
    const { error } = await this.bucket(ctx).upload(checkedKey(ctx, key), bytes, {
      contentType: SITE_MEDIA_MIME,
      upsert: false,
      cacheControl: "31536000",
    });
    // Never include the response body or the bytes in the error.
    if (error) throw new Error("media sink: upload failed");
  }

  async remove(ctx: Ctx, keys: readonly string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    try {
      const { error } = await this.bucket(ctx).remove(keys.map((k) => checkedKey(ctx, k)));
      return error ? [...keys] : [];
    } catch {
      return [...keys];
    }
  }
}

/** A throwaway media id (uuid). */
export const newMediaId = (): string => randomUUID();
