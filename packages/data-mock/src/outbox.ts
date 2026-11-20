/**
 * Outbox of the mock adapter (SDD §4.4 *Kimenő levelek*): instead of sending, every repository
 * action that would send an email or a push appends an entry here. The viewer (issue #17)
 * renders entries with the real templates.
 *
 * Privacy (CLAUDE.md, D-54 AC4): `params` are short scalars only and never carry pastoral or HR
 * content — for requests and HR tickets only the reference number and an app link. The one
 * exception is the contact form (D-12): its email to the office IS the delivery of the visitor's
 * message, so `contact.message` may carry the message text (see `LONG_TEXT_PARAMS`).
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
  | "billing.paymentFailed"
  | "contact.message";

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
const MAX_LONG_PARAM_LENGTH = 3000;

/**
 * Params that may carry longer free text, per template. Only the contact form's message: the
 * visitor writes to the office, and the email is how the message reaches it (D-12, SDD §7.5).
 * Request and HR templates never appear here.
 */
export const LONG_TEXT_PARAMS: Partial<Record<OutboxTemplate, readonly string[]>> = {
  "contact.message": ["message"],
};

/**
 * Rejects non-scalar or long params so no free text can leak into a message (D-54 AC4).
 * `longTextKeys` (from `LONG_TEXT_PARAMS`) may be strings of up to 3,000 characters.
 */
export function assertSafeParams(
  params: Record<string, unknown>,
  longTextKeys: readonly string[] = [],
): void {
  for (const [key, value] of Object.entries(params)) {
    const max = longTextKeys.includes(key) ? MAX_LONG_PARAM_LENGTH : MAX_PARAM_LENGTH;
    const scalar =
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (typeof value === "string" && value.length <= max);
    if (!scalar) throw new TypeError(`Outbox param "${key}" must be a short scalar`);
  }
}
