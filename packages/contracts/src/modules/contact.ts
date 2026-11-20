import { z } from "zod";
import type { Ctx } from "../ctx";
import { EmailSchema, PhoneSchema } from "../primitives";

/** Longest message the contact form accepts (characters). */
export const CONTACT_MESSAGE_MAX = 3000;

/**
 * What a visitor sends through the contact form (*Kapcsolat*, FR-008, D-12). The honeypot field
 * and rate limiting are handled before the repository is called (web layer / BE part); the
 * repository only ever sees a validated, human submission.
 */
export const ContactMessageInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: EmailSchema.max(200),
  /** Optional; an empty string counts as not given. */
  phone: z
    .union([z.literal("").transform(() => null), PhoneSchema, z.null()])
    .optional()
    .transform((v) => v ?? null),
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(CONTACT_MESSAGE_MAX),
  /** The visitor accepted the privacy notice (required). */
  consent: z.literal(true),
});
export type ContactMessageInput = z.input<typeof ContactMessageInputSchema>;
export type ContactMessage = z.output<typeof ContactMessageInputSchema>;

/** Reference number of a contact message, e.g. `KAP-2026-0042`. */
export const ContactReferenceSchema = z.string().regex(/^KAP-\d{4}-\d{4,}$/);

/**
 * Module `contact` — the public contact form. The message is delivered by email to the church's
 * configured office address (`siteConfig.contact.email`). Nothing is readable back through the
 * repository: there is no inbox, the email is the delivery.
 */
export interface ContactRepo {
  /**
   * @public Any tenant ctx (also anonymous) may send. VALIDATION on bad input; organization and
   * platform contexts are rejected (CONTEXT). Returns the reference number shown to the visitor.
   */
  submit(ctx: Ctx, input: ContactMessageInput): Promise<{ reference: string }>;
}
