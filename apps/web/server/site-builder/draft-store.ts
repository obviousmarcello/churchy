import { randomUUID } from "node:crypto";
import { SiteDraftSchema, type SiteDraft } from "./draft-schema";

/**
 * Where drafts live between "built" and "applied or purged". The DB implementation (table
 * `site_drafts`, platform role) arrives with the S-c migration; demo mode and tests use the memory
 * store. A draft is operator-owned review data: it expires (`meta.expiresAt`) and `purgeExpired`
 * deletes what was not applied.
 */

export type DraftStatus = "ready" | "applied";

export interface StoredDraft {
  readonly id: string;
  readonly status: DraftStatus;
  /** Existing church the owner applies it to later (null = a new church the operator creates). */
  readonly targetTenantId: string | null;
  readonly appliedTenantId: string | null;
  readonly draft: SiteDraft;
}

export interface DraftStore {
  create(draft: SiteDraft, options?: { targetTenantId?: string | null }): Promise<StoredDraft>;
  get(id: string, now?: Date): Promise<StoredDraft | null>;
  /** Replaces the review state (item switched off, text edited). Applied drafts are immutable. */
  update(id: string, draft: SiteDraft): Promise<StoredDraft | null>;
  markApplied(id: string, tenantId: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  /** Deletes expired, not applied drafts; returns how many. */
  purgeExpired(now?: Date): Promise<number>;
}

export class MemoryDraftStore implements DraftStore {
  private readonly rows = new Map<string, StoredDraft>();

  async create(
    draft: SiteDraft,
    options: { targetTenantId?: string | null } = {},
  ): Promise<StoredDraft> {
    const row: StoredDraft = {
      id: randomUUID(),
      status: "ready",
      targetTenantId: options.targetTenantId ?? null,
      appliedTenantId: null,
      draft: SiteDraftSchema.parse(draft),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async get(id: string, now: Date = new Date()): Promise<StoredDraft | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    // An expired draft is gone even before the purge job runs.
    if (row.status === "ready" && new Date(row.draft.meta.expiresAt) <= now) return null;
    return row;
  }

  async update(id: string, draft: SiteDraft): Promise<StoredDraft | null> {
    const row = await this.get(id);
    if (!row || row.status !== "ready") return null;
    const next = { ...row, draft: SiteDraftSchema.parse(draft) };
    this.rows.set(id, next);
    return next;
  }

  async markApplied(id: string, tenantId: string): Promise<boolean> {
    const row = await this.get(id);
    if (!row || row.status !== "ready") return false;
    this.rows.set(id, { ...row, status: "applied", appliedTenantId: tenantId });
    return true;
  }

  /** Ready drafts prepared for a church (the owner's list). */
  listForTenant(
    tenantId: string,
    now: Date = new Date(),
  ): { id: string; sourceUrl: string; expiresAt: string }[] {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.status === "ready" &&
          r.targetTenantId === tenantId &&
          new Date(r.draft.meta.expiresAt) > now,
      )
      .map((r) => ({
        id: r.id,
        sourceUrl: r.draft.meta.sourceUrl,
        expiresAt: r.draft.meta.expiresAt,
      }));
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.status === "ready" && new Date(row.draft.meta.expiresAt) <= now) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }
}
