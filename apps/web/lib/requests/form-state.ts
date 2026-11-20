import type { FieldValues } from "./form";

/** State of the public request form between the server action and the client component. */
export type RequestFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Record<string, string>;
      /** Set when the consent checkbox was not ticked. */
      consentError: string | null;
      values: FieldValues;
    }
  /** Submitted faster than a human can (time-trap): ask to send again. */
  | { status: "tooFast"; values: FieldValues }
  | { status: "rateLimited"; values: FieldValues }
  | { status: "failed"; values: FieldValues }
  /** `reference` is null when the honeypot caught a bot (nothing was sent). */
  | { status: "sent"; reference: string | null; confirmation: string };

export const INITIAL_REQUEST_STATE: RequestFormState = { status: "idle" };
