/**
 * Types of the notification templates (SDD §4.4 *Kimenő levelek*, §12).
 *
 * The keys are the outbox template keys the mock adapter emits (`packages/data-mock`
 * `OutboxTemplate`); `apps/web/server/data-adapters.ts` asserts at compile time that both lists stay
 * identical. The package is framework-agnostic: text comes from a `Translate` function, which the
 * app builds from `messages/hu.json` (namespace `email`) with the tenant's terminology resolved.
 */

export const EMAIL_TEMPLATE_KEYS = [
  "request.officeNotification",
  "request.confirmation",
  "hr.ticketCreated",
  "hr.ticketReceived",
  "hr.ticketUpdated",
  "assignment.requested",
  "assignment.swapRequested",
  "assignment.swapAccepted",
  "booking.requested",
  "booking.decided",
  "plan.reviewRequested",
  "plan.approved",
  "plan.mention",
  "member.invitation",
  "billing.paymentFailed",
  "contact.message",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

/** Short scalars only — the same shape as the outbox `params` (D-54 AC4). */
export type EmailParams = Readonly<Record<string, string | number | boolean | null>>;

/** Template keys whose message may carry only a reference, a category and a link (CLAUDE.md, §12). */
export const REFERENCE_ONLY_TEMPLATES = [
  "request.officeNotification",
  "request.confirmation",
  "hr.ticketCreated",
  "hr.ticketReceived",
  "hr.ticketUpdated",
] as const satisfies readonly EmailTemplateKey[];

/** Translator scoped to the `email` namespace: `t("request.confirmation.subject", { reference })`. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface EmailContext {
  /** Message lookup with the tenant's terminology already resolved. */
  t: Translate;
  /** Name of the church the message is sent for (shown as a labelled value, never suffixed). */
  churchName: string;
  /** Origin that app-relative links are resolved against, e.g. `https://belvarosi.churchy.hu`. */
  baseUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Plain-text alternative of the same message. */
  text: string;
  /** Absolute link of the call to action, when the message has one. */
  link: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Absolute link opened when the notification is tapped, when the message has one. */
  link: string | null;
}
