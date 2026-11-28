"use server";

import { z } from "zod";
import { withPolicy, type PolicyScope } from "@/server/policy";
import {
  applyForOwner,
  applyToNewChurch,
  SelectionSchema,
  withSelection,
  type ApplyNewResult,
  type ApplyOwnerResult,
} from "@/server/site-builder-admin";
import { draftStoreFor, mediaFor, siteBuilderMode } from "@/server/site-builder-run";
import { getActor, getRequestContext } from "@/server/session";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Server actions of the site builder. The operator's actions need `platform.siteBuilder.use`
 * (platform operators only); the owner's apply needs the right to manage the site's modules in
 * their own church. All go through `withPolicy`.
 */

const PLATFORM = { kind: "platform" } as const;
const DraftIdSchema = z.string().min(1).max(100);

async function operatorId(): Promise<string> {
  const actor = await getActor();
  return actor.kind === "platform" ? actor.userId : "";
}

/** Saves which items the operator keeps (the rest is switched off). */
export const saveDraftSelectionAction = withPolicy(
  "platform.siteBuilder.use",
  (_scope: PolicyScope, _draftId: string, _off: z.input<typeof SelectionSchema>) => PLATFORM,
  async (_scope, draftId: string, off: z.input<typeof SelectionSchema>): Promise<boolean> => {
    const id = DraftIdSchema.safeParse(draftId);
    const sel = SelectionSchema.safeParse(off);
    const store = draftStoreFor(siteBuilderMode(), await operatorId());
    if (!id.success || !sel.success || !store) return false;
    const row = await store.get(id.data);
    if (!row || row.status !== "ready") return false;
    return (await store.update(id.data, withSelection(row.draft, sel.data))) !== null;
  },
);

/** Creates the church from the draft (platform role, one transaction) and marks the draft applied. */
export const applyDraftNewChurchAction = withPolicy(
  "platform.siteBuilder.use",
  (_scope: PolicyScope, _draftId: string, _input: unknown) => PLATFORM,
  async (_scope, draftId: string, input: unknown): Promise<ApplyNewResult> => {
    const id = DraftIdSchema.safeParse(draftId);
    const mode = siteBuilderMode();
    const operator = await operatorId();
    const store = draftStoreFor(mode, operator);
    if (!id.success || !store) return { ok: false, reason: "not_found" };
    return applyToNewChurch({
      store,
      draftId: id.data,
      input,
      mode,
      operatorId: operator,
      mediaFor: mediaFor(mode, operator || null),
    });
  },
);

export const discardDraftAction = withPolicy(
  "platform.siteBuilder.use",
  (_scope: PolicyScope, _draftId: string) => PLATFORM,
  async (_scope, draftId: string): Promise<boolean> => {
    const id = DraftIdSchema.safeParse(draftId);
    const store = draftStoreFor(siteBuilderMode(), await operatorId());
    return id.success && store ? store.delete(id.data) : false;
  },
);

/** The church owner applies a draft prepared for their church (additive, unpublished). */
export const applyDraftOwnerAction = withPolicy(
  "site.modules.manage",
  async (_scope: PolicyScope, _draftId: string) => {
    const { tenantId } = await getRequestContext();
    return tenantId === undefined ? null : { tenantId };
  },
  async (scope, draftId: string): Promise<ApplyOwnerResult> => {
    const id = DraftIdSchema.safeParse(draftId);
    const tenantId = scope.resource.tenantId;
    if (!id.success) return { ok: false, reason: "not_found" };
    const mode = siteBuilderMode();
    const userId = scope.actor.kind === "tenant" ? scope.actor.userId : null;
    return applyForOwner({
      mode,
      draftId: id.data,
      tenantId,
      userId,
      ctx: scope.ctx,
      repos: await getRequestRepositories(),
      store: draftStoreFor(mode, userId ?? ""),
      mediaFor: mediaFor(mode, userId),
    });
  },
);
