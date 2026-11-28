import type { ContactField, ContactValues } from "./contact-form";

/** State of the contact form between the server action and the client component. */
export type ContactFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Partial<Record<ContactField, string>>;
      values: ContactValues;
    }
  | { status: "failed"; values: ContactValues }
  /** `reference` is null when the honeypot caught a bot (nothing was sent). */
  | { status: "sent"; reference: string | null };

export const INITIAL_CONTACT_STATE: ContactFormState = { status: "idle" };
