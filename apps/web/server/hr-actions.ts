"use server";

import { redirect } from "next/navigation";
import type { HrCategory, HrTicket } from "@churchy/contracts";
import {
  canTransition,
  dueAt,
  isHrStep,
  initialStatus,
  workingDays,
  type TicketStatus,
} from "@churchy/hr";
import { fieldErrors, readSubmission } from "@/lib/requests/form";
import type { FormState } from "@/lib/admin/content-form";
import { getT } from "@/i18n/server";
import { logConfidentialRead } from "@/server/hr-audit";
import { accessOf, chainOf, getHrEnv, ticketResource } from "@/server/hr";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Mutations of the HR screens (D-71 … D-74). Every action goes through `withPolicy`:
 * submitting needs `hr.ticket.create` for the category, handling `hr.ticket.handle`, replying and
 * opening `hr.ticket.read`, deciding an approval step `hr.ticket.approveAsManager` or (HR steps)
 * `hr.ticket.handle`. A person never decides or handles their own request: the policy denies
 * `handle`/`approveAsManager` for the requester. Denials are 404 (HR existence is concealed).
 */

type Outcome = "ok" | "invalid" | "conflict";
const CONCEAL = { conceal: true } as const;

async function loadTicket(scope: PolicyScope, id: string) {
  const repos = await getRequestRepositories();
  const ticket = await repos.hr.getTicket(scope.ctx, id);
  if (ticket === null) return null;
  const category = (await repos.hr.listCategories(scope.ctx)).find(
    (c) => c.id === ticket.categoryId,
  );
  return category === undefined ? null : { ticket, category };
}

/** Policy resource of an existing ticket (`null` → 404). */
async function forTicket(scope: PolicyScope, id: string, ..._rest: unknown[]) {
  const loaded = await loadTicket(scope, id);
  const { tenantId } = await getRequestContext();
  return loaded === null || tenantId === undefined
    ? null
    : ticketResource(tenantId, loaded.ticket, loaded.category);
}

// ---------------------------------------------------------------------------------------------
// Submit (D-71, D-73)
// ---------------------------------------------------------------------------------------------

async function forCategory(scope: PolicyScope, categoryId: string, ..._rest: unknown[]) {
  const repos = await getRequestRepositories();
  const category = (await repos.hr.listCategories(scope.ctx)).find(
    (c) => c.id === categoryId && c.active,
  );
  const { tenantId } = await getRequestContext();
  return category === undefined || tenantId === undefined
    ? null
    : {
        tenantId,
        category: {
          id: category.id,
          key: category.key,
          confidential: category.confidential,
          whoCanSubmit: category.whoCanSubmit,
        },
      };
}

/** Demo access code for an anonymous complaint (a real one is random and stored hashed). */
const anonymousCode = (ticketId: string): string => {
  let h = 7;
  for (const ch of ticketId) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000;
  return String(h).padStart(6, "0");
};

export const submitTicket = withPolicy(
  "hr.ticket.create",
  forCategory as (
    scope: PolicyScope,
    categoryId: string,
    previous: FormState,
    form: FormData,
  ) => ReturnType<typeof forCategory>,
  async (
    scope,
    categoryId: string,
    _previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    const repos = await getRequestRepositories();
    const env = await getHrEnv();
    const category = env.categories.find((c) => c.id === categoryId) as HrCategory;
    const t = await getT("munkater.hr.errors");
    const submission = readSubmission(category.fields, {
      get: (n) => form.get(n),
      getAll: (n) => form.getAll(n),
    });
    const errors = fieldErrors(category.fields, submission, {
      required: t("required"),
      invalid: t("invalid"),
      tooLarge: t("tooLarge"),
    });
    const anonymous = category.allowAnonymous && form.get("anonymous") === "on";
    const subject = String(form.get("subject") ?? "").trim() || category.name;
    const personId = scope.ctx.actor.personId;
    if (!anonymous && personId === null) errors["_form"] = t("general");
    const halfStart = form.get("halfStart") === "on";
    const halfEnd = form.get("halfEnd") === "on";
    const from = submission.data["from"];
    const to = submission.data["to"];
    if (
      category.createsAbsence &&
      typeof from === "string" &&
      typeof to === "string" &&
      to < from
    ) {
      errors["to"] = t("endBeforeStart");
    }
    if (Object.keys(errors).length > 0) {
      return { status: "invalid", errors, values: {} };
    }

    const ticket = await repos.hr.createTicket(scope.ctx, {
      categoryId,
      requesterPersonId: anonymous ? null : personId,
      anonymous,
      subject,
      data: submission.data,
    });
    const status = initialStatus({
      createsAbsence: category.createsAbsence,
      chainLength: category.approvalChain.length,
    });
    const created = await repos.hr.updateTicket(scope.ctx, ticket.id, {
      dueAt: dueAt(ticket.createdAt, category.slaHours, env.calendar),
      ...(status === "uj" ? {} : { status, currentStep: 0 }),
    });
    if (
      category.createsAbsence &&
      typeof from === "string" &&
      typeof to === "string" &&
      personId !== null
    ) {
      const weekdays = env.profiles.get(personId)?.workPattern.weekdays ?? [1, 2, 3, 4, 5];
      await repos.absences.create(scope.ctx, {
        personId,
        startDate: from,
        endDate: to,
        halfDayStart: halfStart,
        halfDayEnd: halfEnd,
        type: category.absenceType ?? "egyeb_tavollet",
        workingDays: workingDays({
          weekdays,
          startDate: from,
          endDate: to,
          halfDayStart: halfStart,
          halfDayEnd: halfEnd,
          calendar: env.calendar,
        }),
        ticketId: created.id,
        status: "requested",
      });
    }
    if (anonymous) {
      redirect(`/munkater/hr?nevtelen=${created.reference}&kod=${anonymousCode(created.id)}`);
    }
    redirect(`/munkater/hr/${created.id}?elkuldve=1`);
  },
  CONCEAL,
);

// ---------------------------------------------------------------------------------------------
// Handling (D-71, D-72)
// ---------------------------------------------------------------------------------------------

async function move(
  scope: PolicyScope,
  ticket: HrTicket,
  to: TicketStatus,
  extra: { assigneePersonId?: string | null; currentStep?: number } = {},
): Promise<Outcome> {
  if (!canTransition(ticket.status, to)) return "conflict";
  const repos = await getRequestRepositories();
  await repos.hr.updateTicket(scope.ctx, ticket.id, { status: to, ...extra });
  return "ok";
}

export const takeTicket = withPolicy(
  "hr.ticket.handle",
  forTicket,
  async (scope, id: string): Promise<Outcome> => {
    const loaded = (await loadTicket(scope, id))!;
    return move(scope, loaded.ticket, "folyamatban", {
      assigneePersonId: scope.ctx.actor.personId,
    });
  },
  CONCEAL,
);

export const startApproval = withPolicy(
  "hr.ticket.handle",
  forTicket,
  async (scope, id: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const env = await getHrEnv();
    const { ticket, category } = (await loadTicket(scope, id))!;
    if (category.approvalChain.length === 0) return "conflict";
    const { steps } = chainOf(env, ticket, category, []);
    const result = await move(scope, ticket, "jovahagyasra_var", { currentStep: 0 });
    if (result !== "ok") return result;
    // Auto-delegation is logged as a `delegated` record (SDD §25.2).
    for (const step of steps.filter((s) => s.outcome === "delegated")) {
      const deputy = step.approverIds[0];
      if (deputy !== undefined) {
        await repos.hr.recordApproval(scope.ctx, id, {
          step: step.index,
          approverPersonId: deputy,
          decision: "delegated",
          comment: null,
        });
      }
    }
    return "ok";
  },
  CONCEAL,
);

async function decide(
  scope: PolicyScope,
  id: string,
  decision: "approved" | "rejected",
  comment: string,
  route: "manager" | "hr",
): Promise<Outcome> {
  const repos = await getRequestRepositories();
  const env = await getHrEnv();
  const { ticket, category } = (await loadTicket(scope, id))!;
  if (ticket.status !== "jovahagyasra_var") return "conflict";
  const approvals = await repos.hr.listApprovals(scope.ctx, id);
  const { progress } = chainOf(env, ticket, category, approvals);
  if (progress.state !== "waiting") return "conflict";
  const step = progress.step;
  const me = scope.ctx.actor.personId;
  const hrStep = isHrStep(step);
  // Only an approver of this very step, through the matching policy action, may decide it.
  if (me === null || !step.approverIds.includes(me) || hrStep !== (route === "hr"))
    return "conflict";
  await repos.hr.recordApproval(scope.ctx, id, {
    step: step.index,
    approverPersonId: me,
    decision,
    comment: comment.trim() === "" ? null : comment.trim().slice(0, 2000),
  });
  const after = chainOf(env, ticket, category, [
    ...approvals,
    { step: step.index, decision } as never,
  ]).progress;
  const absence = (
    await repos.absences.list(scope.ctx, { from: "2000-01-01", to: "2100-01-01" })
  ).find((a) => a.ticketId === id);
  if (decision === "rejected") {
    await move(scope, ticket, "elutasitva");
    if (absence) await repos.absences.setStatus(scope.ctx, absence.id, "rejected");
  } else if (after.state === "approved") {
    await move(scope, ticket, "jovahagyva");
    if (absence) await repos.absences.setStatus(scope.ctx, absence.id, "approved");
  } else if (after.state === "waiting") {
    await repos.hr.updateTicket(scope.ctx, id, { currentStep: after.step.index });
  }
  return "ok";
}

export const decideAsManager = withPolicy(
  "hr.ticket.approveAsManager",
  forTicket,
  (scope, id: string, decision: "approved" | "rejected", comment: string) =>
    decide(scope, id, decision, comment, "manager"),
  CONCEAL,
);

export const decideAsHr = withPolicy(
  "hr.ticket.handle",
  forTicket,
  (scope, id: string, decision: "approved" | "rejected", comment: string) =>
    decide(scope, id, decision, comment, "hr"),
  CONCEAL,
);

export const closeTicket = withPolicy(
  "hr.ticket.handle",
  forTicket,
  async (scope, id: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const { ticket, category } = (await loadTicket(scope, id))!;
    const result = await move(scope, ticket, "lezart");
    if (result !== "ok") return result;
    // A chain-less absence category (e.g. a sick-leave notice) is recorded when the handler closes.
    if (category.createsAbsence && category.approvalChain.length === 0) {
      const absence = (
        await repos.absences.list(scope.ctx, { from: "2000-01-01", to: "2100-01-01" })
      ).find((a) => a.ticketId === id);
      if (absence && absence.status === "requested") {
        await repos.absences.setStatus(scope.ctx, absence.id, "approved");
      }
    }
    return "ok";
  },
  CONCEAL,
);

export const handOverTicket = withPolicy(
  "hr.ticket.handle",
  forTicket,
  async (
    scope,
    id: string,
    previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    void previous;
    const repos = await getRequestRepositories();
    const t = await getT("munkater.hr.errors");
    const recipient = String(form.get("recipient") ?? "").trim();
    const summary = String(form.get("summary") ?? "").trim();
    if (recipient === "") {
      return {
        status: "invalid",
        errors: { recipient: t("required") },
        values: { recipient, summary },
      };
    }
    const env = await getHrEnv();
    await repos.hr.handOver(scope.ctx, id, { recipient, date: env.today, summary });
    redirect(`/munkater/hr/${id}`);
  },
  CONCEAL,
);

// ---------------------------------------------------------------------------------------------
// Messages and confidential access
// ---------------------------------------------------------------------------------------------

export const replyTicket = withPolicy(
  "hr.ticket.reply",
  forTicket,
  async (
    scope,
    id: string,
    previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    void previous;
    const repos = await getRequestRepositories();
    const t = await getT("munkater.hr.errors");
    const body = String(form.get("body") ?? "").trim();
    if (body === "")
      return { status: "invalid", errors: { body: t("required") }, values: { body } };
    const env = await getHrEnv();
    const { ticket, category } = (await loadTicket(scope, id))!;
    const access = accessOf(env, ticket, category);
    // Internal notes: handlers only, never the requester (also enforced when listing).
    const internal = form.get("internal") === "on" && access.handle;
    let attachmentMediaIds: string[] = [];
    if (form.get("attach") === "on") {
      // Demo: the mock attaches an existing library document; storing real files is the BE part.
      const docs = await repos.media.list(scope.ctx, { kind: "pdf" });
      attachmentMediaIds = docs.items.slice(0, 1).map((m) => m.id);
    }
    await repos.hr.addMessage(scope.ctx, id, { body, internal, attachmentMediaIds });
    redirect(`/munkater/hr/${id}${await grantSuffix(form)}#uzenetek`);
  },
  CONCEAL,
);

async function grantSuffix(form: FormData): Promise<string> {
  const grant = form.get("grant");
  return typeof grant === "string" && grant !== ""
    ? `?betekintes=${encodeURIComponent(grant)}`
    : "";
}

/** *Betekintés oka*: every opening of a confidential ticket needs a reason and is logged. */
export const openConfidential = withPolicy(
  "hr.ticket.read",
  forTicket,
  async (
    scope,
    id: string,
    previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    void previous;
    const t = await getT("munkater.hr.errors");
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 5) {
      return { status: "invalid", errors: { reason: t("reasonRequired") }, values: { reason } };
    }
    const env = await getHrEnv();
    const { ticket } = (await loadTicket(scope, id))!;
    const row = logConfidentialRead({
      tenantId: env.tenantId,
      ticketId: id,
      reference: ticket.reference,
      personId: scope.ctx.actor.personId ?? "",
      reason: reason.slice(0, 300),
      at: env.now.toISOString(),
    });
    redirect(`/munkater/hr/${id}?betekintes=${encodeURIComponent(row.id)}`);
  },
  CONCEAL,
);
