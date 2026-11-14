import { ContactMessageInputSchema, type ContactMessageInput } from "@churchy/contracts";
import { huZodErrorMap } from "@churchy/i18n";

/**
 * Contact form parsing (D-12): raw form fields → a validated `ContactMessageInput` or Hungarian
 * error messages per field. Shared by the server action and its tests; the repository validates
 * again (defense in depth).
 */

export const CONTACT_FIELDS = ["name", "email", "phone", "subject", "message", "consent"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/**
 * Name of the honeypot input. Humans never see or fill it (it is off-screen and out of the tab
 * order); bots that fill every field do. A filled honeypot is dropped silently.
 */
export const HONEYPOT_FIELD = "weboldal";

const REQUIRED = ["name", "email", "subject", "message"] as const;

export type ContactValues = Record<Exclude<ContactField, "consent">, string> & { consent: boolean };

/** The messages this module needs (from `public.contact.form.errors`). */
export interface ContactErrorMessages {
  required: string;
  phone: string;
  consent: string;
}

export type ContactParseResult =
  | { ok: true; input: ContactMessageInput; values: ContactValues }
  | { ok: false; errors: Partial<Record<ContactField, string>>; values: ContactValues };

/** The visible fields of a submitted form, as strings (consent as a boolean). */
export function contactValues(form: { get(name: string): unknown }): ContactValues {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    email: text("email").trim(),
    phone: text("phone").trim(),
    subject: text("subject"),
    message: text("message"),
    consent: form.get("consent") === "on" || form.get("consent") === "true",
  };
}

/** True when the honeypot field carries anything but whitespace. */
export function isBot(form: { get(name: string): unknown }): boolean {
  const value = form.get(HONEYPOT_FIELD);
  return typeof value === "string" && value.trim() !== "";
}

export function parseContactForm(
  values: ContactValues,
  messages: ContactErrorMessages,
): ContactParseResult {
  const errors: Partial<Record<ContactField, string>> = {};
  for (const field of REQUIRED) {
    if (values[field].trim() === "") errors[field] = messages.required;
  }
  if (!values.consent) errors.consent = messages.consent;

  const parsed = ContactMessageInputSchema.safeParse(values, { error: huZodErrorMap });
  if (parsed.success && Object.keys(errors).length === 0) {
    return { ok: true, input: { ...values, consent: true }, values };
  }
  for (const issue of parsed.error?.issues ?? []) {
    const field = issue.path[0] as ContactField;
    if (errors[field] !== undefined) continue;
    // The schema's own phone message is English; the form explains the expected format.
    errors[field] = field === "phone" ? messages.phone : issue.message;
  }
  return { ok: false, errors, values };
}
