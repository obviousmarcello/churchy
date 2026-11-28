import "server-only";

import type { Ctx, Repositories } from "@churchy/contracts";
import { z } from "zod";
import { huZodErrorMap } from "@churchy/i18n";
import {
  createTenant,
  getDraftForTenant,
  writeSiteBuilderAudit,
  type CreateTenantInput,
  type CreateTenantResult,
  type PlatformDb,
} from "@/server/platform-db";
import { applyDraftWithRepositories } from "@/server/site-builder/apply-existing";
import {
  attribution,
  seedStatements,
  siteConfigFromDraft,
  type ApplySummary,
} from "@/server/site-builder/apply-new";
import type { SiteDraft } from "@/server/site-builder/draft-schema";
import type { DraftStore, StoredDraft } from "@/server/site-builder/draft-store";
import type { SiteBuilderMode } from "@/server/site-builder-mode";

/**
 * The operator's and the owner's apply paths of a draft (SDD ADR-21). The wrappers that decide who
 * may call them are in `site-builder-actions.ts` (`withPolicy`); this module has the logic so it can
 * be tested with a fake database and the mock repositories.
 */

/** Ids the operator switched off in the review, per kind of item. */
export const SelectionSchema = z.object({
  pages: z.array(z.string()).max(100),
  posts: z.array(z.string()).max(100),
  announcements: z.array(z.string()).max(100),
  locations: z.array(z.string()).max(100),
  serviceTimes: z.array(z.string()).max(200),
  images: z.array(z.string()).max(200),
});
export type Selection = z.infer<typeof SelectionSchema>;

/** The draft with the listed items switched off (`include: false`); everything else is kept. */
export function withSelection(draft: SiteDraft, off: Selection): SiteDraft {
  const flip = <T extends { id: string; include: boolean }>(
    items: readonly T[],
    ids: readonly string[],
  ) => items.map((i) => ({ ...i, include: !ids.includes(i.id) }));
  return {
    ...draft,
    pages: flip(draft.pages, off.pages),
    posts: flip(draft.posts, off.posts),
    announcements: flip(draft.announcements, off.announcements),
    locations: flip(draft.locations, off.locations),
    serviceTimes: flip(draft.serviceTimes, off.serviceTimes),
    images: draft.images.map((i) => ({ ...i, include: !off.images.includes(i.id) && !i.offsite })),
  };
}

export const NewChurchInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  owner: z.object({
    authUserId: z.uuid(),
    email: z.string().trim().max(254),
    name: z.string().trim().min(1).max(200),
  }),
});
export type NewChurchInput = z.infer<typeof NewChurchInputSchema>;

export type ApplyNewResult =
  | {
      readonly ok: true;
      readonly slug: string;
      readonly summary: ApplySummary;
      readonly imagesNotApplied: number;
    }
  | { readonly ok: false; readonly reason: "not_found" | "invalid" | CreateTenantResultFailure };
type CreateTenantResultFailure = Exclude<CreateTenantResult, { ok: true }>["reason"];

const countImages = (draft: SiteDraft) => draft.images.filter((i) => i.include).length;

export async function applyToNewChurch(args: {
  readonly store: DraftStore;
  readonly draftId: string;
  readonly input: unknown;
  readonly mode: SiteBuilderMode;
  readonly operatorId: string;
  readonly db?: Pick<PlatformDb, "transaction">;
}): Promise<ApplyNewResult> {
  const parsed = NewChurchInputSchema.safeParse(args.input, { error: huZodErrorMap });
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const stored = await args.store.get(args.draftId);
  if (!stored || stored.status !== "ready") return { ok: false, reason: "not_found" };
  const draft = stored.draft;
  const input = parsed.data;

  if (args.mode === "demo") {
    // No database in demo mode: the draft is marked applied and the summary is what would be created.
    const { summary } = seedStatements(draft, "00000000-0000-4000-8000-000000000000");
    await args.store.markApplied(args.draftId, `demo-${input.slug}`);
    return { ok: true, slug: input.slug, summary, imagesNotApplied: countImages(draft) };
  }

  let summary: ApplySummary | null = null;
  const created = await createTenant(
    {
      name: input.name,
      slug: input.slug,
      denomination: draft.church.denomination.value,
      owner: input.owner,
      actorUserId: args.operatorId,
    } as CreateTenantInput,
    {
      allowReserved: true,
      siteConfig: siteConfigFromDraft(draft),
      ...(args.db ? { db: args.db } : {}),
      seed: async (tx, tenantId) => {
        const seeded = seedStatements(draft, tenantId);
        summary = seeded.summary;
        for (const s of seeded.statements) await tx.query(s.text, s.values);
        // In the same transaction: the draft is applied and the audit entry (ids and counts, no texts;
        // the source URLs are the church's own public pages) exists, or none of it does.
        await tx.query(
          `update site_drafts set status = 'applied', applied_tenant_id = $2, updated_at = now() where id = $1 and status = 'ready'`,
          [args.draftId, tenantId],
        );
        await writeSiteBuilderAudit(
          args.operatorId,
          "site_builder.apply",
          args.draftId,
          {
            mode: "new_church",
            consent: draft.meta.consent.confirmed,
            summary,
            sources: attribution(draft),
          },
          tenantId,
          tx,
        );
      },
    },
  );
  if (!created.ok) return { ok: false, reason: created.reason };
  return { ok: true, slug: created.slug, summary: summary!, imagesNotApplied: countImages(draft) };
}

export type ApplyOwnerResult =
  | { readonly ok: true; readonly summary: ApplySummary }
  | { readonly ok: false; readonly reason: "not_found" };

/** The church owner applies a draft the operator prepared for this church, under their own context. */
export async function applyForOwner(args: {
  readonly mode: SiteBuilderMode;
  readonly draftId: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly ctx: Ctx;
  readonly repos: Repositories;
  readonly store: DraftStore | null;
  readonly now?: Date;
  readonly dbQuery?: Pick<PlatformDb, "query">;
}): Promise<ApplyOwnerResult> {
  let stored: StoredDraft | null = null;
  if (args.mode === "live") {
    stored = await getDraftForTenant(args.draftId, args.tenantId, args.now, args.dbQuery);
  } else if (args.store) {
    const row = await args.store.get(args.draftId, args.now);
    stored = row && row.status === "ready" && row.targetTenantId === args.tenantId ? row : null;
  }
  if (!stored) return { ok: false, reason: "not_found" };
  const summary = await applyDraftWithRepositories(args.ctx, args.repos, stored.draft);
  if (args.store) await args.store.markApplied(args.draftId, args.tenantId);
  if (args.mode === "live" && args.userId) {
    await writeSiteBuilderAudit(
      args.userId,
      "site_builder.apply",
      args.draftId,
      {
        mode: "existing_church",
        consent: stored.draft.meta.consent.confirmed,
        summary,
        sources: attribution(stored.draft),
      },
      args.tenantId,
      args.dbQuery as never,
    );
  }
  return { ok: true, summary };
}
