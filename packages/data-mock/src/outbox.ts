/**
 * Outbox of the mock adapter (SDD §4.4 *Kimenő levelek*): instead of sending, every repository
 * action that would send an email or a push appends an entry here. The viewer (issue #17)
 * renders entries with the real templates.
 *
 * Privacy (CLAUDE.md, D-54 AC4): `params` are short scalars only and never carry pastoral or HR
 * content — for requests and HR tickets only the reference number and an app link.
 */

export type OutboxChannel = "email" | "push";

/** Role-based mailboxes and recipients whose address is not a person record. */
export type OutboxPersona =
  | "office"
  | "requester"
  | "hrHandlers"
  | "roomManagers"
  | "planApprovers"
  | "team"
  | "billingContact";

/** Who would receive the message: a person record, a login, or a persona. */
export type OutboxRecipient =
  | { kind: "person"; personId: string }
  | { kind: "user"; userId: string }
  | { kind: "persona"; persona: OutboxPersona };

/** Template keys, one per kind of message (rendered by the outbox viewer / `packages/notify`). */
export type OutboxTemplate =
  | "request.officeNotification"
  | "request.confirmation"
  | "hr.ticketCreated"
  | "hr.ticketReceived"
  | "hr.ticketUpdated"
  | "assignment.requested"
  | "assignment.swapRequested"
  | "assignment.swapAccepted"
  | "booking.requested"
  | "booking.decided"
  | "plan.reviewRequested"
  | "plan.approved"
  | "plan.mention"
  | "member.invitation"
  | "billing.paymentFailed";

export type OutboxParams = Record<string, string | number | boolean | null>;

export type OutboxEntry = {
  id: string;
  /** ISO instant when the message would have been sent. */
  at: string;
  channel: OutboxChannel;
  template: OutboxTemplate;
  recipient: OutboxRecipient;
  /** Tenant the message belongs to; null for organization-level messages. */
  tenantId: string | null;
  params: OutboxParams;
};

export type OutboxDraft = Omit<OutboxEntry, "id" | "at">;

/** Filter for `MockStore.listOutbox`. */
export type OutboxFilter = {
  tenantId?: string;
  channel?: OutboxChannel;
  template?: OutboxTemplate;
};

const MAX_PARAM_LENGTH = 200;

/** Rejects non-scalar or long params so no free text can leak into a message (D-54 AC4). */
export function assertSafeParams(params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    const scalar =
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (typeof value === "string" && value.length <= MAX_PARAM_LENGTH);
    if (!scalar) throw new TypeError(`Outbox param "${key}" must be a short scalar`);
  }
}
