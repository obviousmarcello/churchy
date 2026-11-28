import "server-only";

import { randomUUID } from "node:crypto";
import { SiteDraftSchema, type SiteDraft } from "@/server/site-builder/draft-schema";
import type { DraftStatus, DraftStore, StoredDraft } from "@/server/site-builder/draft-store";
import { getPlatformDb, type PlatformDb, type PlatformQueryable } from "./client";

/**
 * Drafts of the site builder in `site_drafts` (0027_site_builder), through the platform role. The
 * table is platform-scope: only this role can touch it. `operatorId` of a store instance is the
 * `profiles.id` that owns the rows it creates.
 */

interface Row {
  id: string;
  status: DraftStatus;
  target_tenant_id: string | null;
  applied_tenant_id: string | null;
  draft: unknown;
}

const toStored = (row: Row): StoredDraft => ({
  id: row.id,
  status: row.status,
  targetTenantId: row.target_tenant_id,
  appliedTenantId: row.applied_tenant_id,
  draft: SiteDraftSchema.parse(row.draft),
});

export class DbDraftStore implements DraftStore {
  constructor(
    private readonly operatorId: string,
    private readonly dbOverride?: Pick<PlatformDb, "query">,
  ) {}

  private db(): Promise<Pick<PlatformDb, "query">> | Pick<PlatformDb, "query"> {
    return this.dbOverride ?? getPlatformDb();
  }

  async create(
    draft: SiteDraft,
    options: { targetTenantId?: string | null } = {},
  ): Promise<StoredDraft> {
    const parsed = SiteDraftSchema.parse(draft);
    const db = await this.db();
    const res = await db.query<Row>(
      `insert into site_drafts (id, created_by, source_url, target_tenant_id, draft, expires_at)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       returning id, status, target_tenant_id, applied_tenant_id, draft`,
      [
        randomUUID(),
        this.operatorId,
        parsed.meta.sourceUrl,
        options.targetTenantId ?? null,
        JSON.stringify(parsed),
        parsed.meta.expiresAt,
      ],
    );
    return toStored(res.rows[0]!);
  }

  async get(id: string, now: Date = new Date()): Promise<StoredDraft | null> {
    const db = await this.db();
    const res = await db.query<Row>(
      `select id, status, target_tenant_id, applied_tenant_id, draft from site_drafts
       where id = $1 and (status = 'applied' or expires_at > $2)`,
      [id, now.toISOString()],
    );
    return res.rows[0] ? toStored(res.rows[0]) : null;
  }

  async update(id: string, draft: SiteDraft): Promise<StoredDraft | null> {
    const parsed = SiteDraftSchema.parse(draft);
    const db = await this.db();
    const res = await db.query<Row>(
      `update site_drafts set draft = $2::jsonb, updated_at = now()
       where id = $1 and status = 'ready' and expires_at > now()
       returning id, status, target_tenant_id, applied_tenant_id, draft`,
      [id, JSON.stringify(parsed)],
    );
    return res.rows[0] ? toStored(res.rows[0]) : null;
  }

  async markApplied(id: string, tenantId: string): Promise<boolean> {
    const db = await this.db();
    const res = await db.query(
      `update site_drafts set status = 'applied', applied_tenant_id = $2, updated_at = now()
       where id = $1 and status = 'ready' and expires_at > now()`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.db();
    const res = await db.query("delete from site_drafts where id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const db = await this.db();
    const res = await db.query(
      "delete from site_drafts where status = 'ready' and expires_at <= $1",
      [now.toISOString()],
    );
    return res.rowCount ?? 0;
  }
}

/** Drafts waiting for a church's owner (ready, not expired), newest first; no draft body. */
export async function listDraftsForTenant(
  tenantId: string,
  now: Date = new Date(),
  dbOverride?: Pick<PlatformDb, "query">,
): Promise<{ id: string; sourceUrl: string; expiresAt: string }[]> {
  const db = dbOverride ?? (await getPlatformDb());
  const res = await db.query<{ id: string; source_url: string; expires_at: string }>(
    `select id, source_url, expires_at from site_drafts
     where target_tenant_id = $1 and status = 'ready' and expires_at > $2 order by created_at desc`,
    [tenantId, now.toISOString()],
  );
  return res.rows.map((r) => ({
    id: r.id,
    sourceUrl: r.source_url,
    expiresAt: String(r.expires_at),
  }));
}

/** The draft for this church only (`target_tenant_id` must match); null otherwise. */
export async function getDraftForTenant(
  id: string,
  tenantId: string,
  now: Date = new Date(),
  dbOverride?: Pick<PlatformDb, "query">,
): Promise<StoredDraft | null> {
  const db = dbOverride ?? (await getPlatformDb());
  const res = await db.query<Row>(
    `select id, status, target_tenant_id, applied_tenant_id, draft from site_drafts
     where id = $1 and target_tenant_id = $2 and status = 'ready' and expires_at > $3`,
    [id, tenantId, now.toISOString()],
  );
  return res.rows[0] ? toStored(res.rows[0]) : null;
}

/** Audit entry of a site builder action: ids and non-personal facts only. */
export async function writeSiteBuilderAudit(
  actorUserId: string,
  action: "site_builder.build" | "site_builder.apply",
  entityId: string,
  diff: Record<string, unknown>,
  tenantId: string | null = null,
  db?: PlatformQueryable,
): Promise<void> {
  const source = db ?? (await getPlatformDb());
  await source.query(
    `insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id, diff)
     values ($1, $2, $3, 'site_draft', $4, $5::jsonb)`,
    [tenantId, actorUserId, action, entityId, JSON.stringify(diff)],
  );
}
