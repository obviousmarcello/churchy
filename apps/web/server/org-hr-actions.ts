"use server";

import { redirect } from "next/navigation";
import type { HrCategory, HrTicket } from "@churchy/contracts";
import { canTransition, type TicketStatus } from "@churchy/hr";
import { getT } from "@/i18n/server";
import type { FormState } from "@/lib/admin/content-form";
import { getRequestNow } from "@/server/clock";
import { isConfidential, orgTicketResource } from "@/server/org-hr";
import { logOrgAccess, type OrgAccessKind } from "@/server/org-audit";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Mutations of the diocesan HR portal (D-85). A diocesan handler takes, answers and closes
 * tickets of linked parishes in delegated categories: every action goes through `withPolicy` with
 * the same `hr.ticket.*` actions as the parish side, evaluated for an organization actor (active
 * link, delegated category, the actor's own scopes). Confidential tickets are never reachable
 * here (404). Each action is written to the parish's access log with the organization as actor.
 * Approval-chain decisions stay with the parish: the diocesan actor has no person in the parish.
 */

type Outcome = "ok" | "invalid" | "conflict";
const CONCEAL = { conceal: true } as const;

async function loadTicket(
  scope: PolicyScope,
  id: string,
): Promise<{ ticket: HrTicket; category: HrCategory } | null> {
  const repos = await getRequestRepositories();
  const ticket = await repos.hr.getTicket(scope.ctx, id);
  if (ticket === null) return null;
  const category = (await repos.hr.listCategories(scope.ctx)).find(
    (c) => c.id === ticket.categoryId,
  );
  if (category === undefined || isConfidential(ticket, category)) return null;
  return { ticket, category };
}

/** Policy resource of a ticket of a linked parish (`null` → 404). */
async function forTicket(scope: PolicyScope, id: string, ..._rest: unknown[]) {
  const loaded = await loadTicket(scope, id);
  return loaded === null ? null : orgTicketResource(loaded.ticket, loaded.category);
}

async function audit(scope: PolicyScope, ticket: HrTicket, kind: OrgAccessKind): Promise<void> {
  if (scope.context.orgId === undefined) return;
  await logOrgAccess(
    { tenantId: ticket.tenantId, orgId: scope.context.orgId, reference: ticket.reference, kind },
    await getRequestNow(),
  );
}

async function move(
  scope: PolicyScope,
  id: string,
  to: TicketStatus,
  kind: OrgAccessKind,
): Promise<Outcome> {
  const loaded = await loadTicket(scope, id);
  if (loaded === null || !canTransition(loaded.ticket.status, to)) return "conflict";
  const repos = await getRequestRepositories();
  await repos.hr.updateTicket(scope.ctx, id, { status: to });
  await audit(scope, loaded.ticket, kind);
  return "ok";
}

/** *Átvétel*: a new ticket becomes in progress. */
export const takeOrgTicket = withPolicy(
  "hr.ticket.handle",
  forTicket,
  (scope, id: string): Promise<Outcome> => move(scope, id, "folyamatban", "take"),
  CONCEAL,
);

/** *Lezárás*: closes a ticket that is in progress or decided. */
export const closeOrgTicket = withPolicy(
  "hr.ticket.handle",
  forTicket,
  (scope, id: string): Promise<Outcome> => move(scope, id, "lezart", "close"),
  CONCEAL,
);

/** A reply to the requester or an internal note (handlers only). */
export const replyOrgTicket = withPolicy(
  "hr.ticket.reply",
  forTicket,
  async (
    scope,
    id: string,
    previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    void previous;
    const t = await getT("munkater.hr.errors");
    const body = String(form.get("body") ?? "").trim();
    if (body === "") {
      return { status: "invalid", errors: { body: t("required") }, values: { body } };
    }
    const loaded = (await loadTicket(scope, id))!;
    const repos = await getRequestRepositories();
    await repos.hr.addMessage(scope.ctx, id, {
      body,
      internal: form.get("internal") === "on",
      attachmentMediaIds: [],
    });
    await audit(scope, loaded.ticket, "reply");
    // A different URL (not just a hash) so the page is rendered afresh with the new message.
    redirect(`/egyhazmegye/kerelmek/${id}?valasz=1#uzenetek`);
  },
  CONCEAL,
);
