import { isContractError } from "@churchy/contracts";
import { huZodErrorMap } from "@churchy/i18n";
import type { z } from "zod";

/**
 * Form plumbing of the content admin (D-21), shared by the server actions and the client form:
 * field descriptors, the action state and the mapping of validation problems to Hungarian
 * messages per field.
 */

export type FieldDef = { name: string; label: string; help?: string; required?: boolean } & (
  | { kind: "text" | "email" | "tel" | "number" | "date" | "datetime-local" }
  | { kind: "content"; rows?: number }
  | { kind: "textarea"; rows?: number }
  | { kind: "select"; options: readonly { value: string; label: string }[]; placeholder?: string }
  | { kind: "checkbox" }
  | { kind: "heading" }
);

export type FormValues = Record<string, string>;

export type FormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Record<string, string>; values: FormValues }
  | { status: "denied" };

export const INITIAL_FORM_STATE: FormState = { status: "idle" };

/** Every named field of a submitted form as a string (checkboxes: `"on"` or `""`). */
export function formValues(form: FormData, names: readonly string[]): FormValues {
  const out: FormValues = {};
  for (const name of names) {
    const value = form.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

/** The validation messages of `admin.content.errors`. */
export interface ErrorMessages {
  required: string;
  slugTaken: string;
  slugFormat: string;
  sunday: string;
  weekTaken: string;
  announcementEmpty: string;
  endBeforeStart: string;
  phone: string;
  postalCode: string;
  address: string;
  notFound: string;
  general: string;
}

const KNOWN: Record<string, keyof ErrorMessages> = {
  "Expected a lowercase slug": "slugFormat",
  "Expected a Sunday": "sunday",
  "An announcement needs a text or a PDF": "announcementEmpty",
  "endsAt must not be before startsAt": "endBeforeStart",
  "Expected a phone number": "phone",
  "Expected a 4-digit postal code": "postalCode",
};

/** The form field an issue belongs to: the last path element that is a field, else `_form`. */
function fieldOf(path: readonly PropertyKey[], fields: ReadonlySet<string>): string {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const key = path[i];
    if (typeof key === "string" && fields.has(key)) return key;
  }
  return "_form";
}

export function issueErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  fields: readonly string[],
  messages: ErrorMessages,
): Record<string, string> {
  const known = new Set(fields);
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = fieldOf(issue.path, known);
    const key = KNOWN[issue.message];
    errors[field] ??= key ? messages[key] : issue.message;
  }
  return errors;
}

/** Validates `input` with the contract schema, Hungarian messages per field. */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
  fields: readonly string[],
  messages: ErrorMessages,
): { ok: true; data: z.output<S> } | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(input, { error: huZodErrorMap });
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: issueErrors(result.error.issues, fields, messages) };
}

/** Maps what a repository throws to field errors; unknown errors are rethrown. */
export function repositoryErrors(
  error: unknown,
  fields: readonly string[],
  messages: ErrorMessages,
): Record<string, string> {
  if (isContractError(error, "CONFLICT")) {
    const field = typeof error.details["field"] === "string" ? error.details["field"] : "_form";
    return { [fields.includes(field) ? field : "_form"]: conflictMessage(field, messages) };
  }
  if (isContractError(error, "VALIDATION")) return issueErrors(error.issues, fields, messages);
  if (isContractError(error, "NOT_FOUND")) return { _form: messages.notFound };
  throw error;
}

function conflictMessage(field: string, messages: ErrorMessages): string {
  return field === "slug"
    ? messages.slugTaken
    : field === "weekSunday"
      ? messages.weekTaken
      : messages.general;
}
