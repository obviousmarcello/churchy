import { validateFormData, type FormField } from "@churchy/contracts";

/**
 * Plumbing of the public request form (D-28): form fields ↔ submitted `FormData`, step split and
 * Hungarian field errors. Pure, shared by the server action, the client form and the tests.
 */

/** Prefix of the HTML control names, so a form key can never clash with a hidden control. */
export const FIELD_PREFIX = "f_";
export const fieldName = (key: string): string => `${FIELD_PREFIX}${key}`;

/** Name of the honeypot control (off-screen; humans never fill it). */
export const REQUEST_HONEYPOT = "weboldal";
/** Name of the hidden control that carries the render time (time-trap). */
export const REQUEST_STARTED_AT = "startedAt";
/** Submissions faster than this after rendering the form are refused (bots; no human is faster). */
export const MIN_FILL_MS = 2000;

/** What the form shows after a refused submission (strings, booleans, selected option values). */
export type FieldValue = string | string[] | boolean;
export type FieldValues = Record<string, FieldValue>;

/** A submitted value as the contract stores it. */
export type SubmittedValue = string | boolean | string[];

interface FormSource {
  get(name: string): unknown;
  getAll(name: string): unknown[];
}

const isFile = (v: unknown): v is { name: string; size: number } =>
  typeof v === "object" && v !== null && "size" in v && "name" in v;

export interface ReadSubmission {
  /** Values for re-populating the form after an error. */
  values: FieldValues;
  /** The data to submit: empty values left out. */
  data: Record<string, SubmittedValue>;
  /** Keys of file fields that exceed their size limit. */
  tooLarge: string[];
}

/** Reads the controls of `fields` from a submitted form. */
export function readSubmission(fields: readonly FormField[], form: FormSource): ReadSubmission {
  const values: FieldValues = {};
  const data: Record<string, SubmittedValue> = {};
  const tooLarge: string[] = [];
  for (const field of fields) {
    const name = fieldName(field.key);
    if (field.type === "checkbox") {
      const on = form.get(name) === "on" || form.get(name) === "true";
      values[field.key] = on;
      if (on) data[field.key] = true;
    } else if (field.type === "select" && field.multiple) {
      const picked = form.getAll(name).filter((v): v is string => typeof v === "string");
      values[field.key] = picked;
      if (picked.length > 0) data[field.key] = picked;
    } else if (field.type === "file") {
      values[field.key] = "";
      const file = form.get(name);
      if (isFile(file) && file.size > 0) {
        if (file.size > field.maxBytes) tooLarge.push(field.key);
        // Demo: only the file name is kept; storing the file is the BE part (media, SDD §8.3).
        else data[field.key] = file.name.slice(0, 200);
      }
    } else {
      const raw = form.get(name);
      const text = typeof raw === "string" ? raw.trim() : "";
      values[field.key] = text;
      if (text !== "") data[field.key] = text;
    }
  }
  return { values, data, tooLarge };
}

export interface FieldMessages {
  required: string;
  invalid: string;
  tooLarge: string;
}

/** Field key → Hungarian message for everything `validateFormData` (and the size limit) refuses. */
export function fieldErrors(
  fields: readonly FormField[],
  submission: Pick<ReadSubmission, "data" | "tooLarge">,
  messages: FieldMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of validateFormData(fields, submission.data)) {
    const key = issue.path[0];
    if (key === undefined || issue.message === "Unknown field") continue;
    errors[key] = issue.message === "Required" ? messages.required : messages.invalid;
  }
  for (const key of submission.tooLarge) errors[key] = messages.tooLarge;
  return errors;
}

const CONTACT_TYPES = new Set(["email", "phone"]);

export interface FormStep {
  id: "contact" | "details";
  fields: FormField[];
}

/**
 * The input steps of a request form: the contact person first (name, e-mail, phone), then
 * everything about the occasion. A form with only one kind has a single step. The summary and
 * consent step is added by the form component.
 */
export function splitSteps(fields: readonly FormField[]): FormStep[] {
  const contact = fields.filter((f) => f.key === "contactName" || CONTACT_TYPES.has(f.type));
  const details = fields.filter((f) => !contact.includes(f));
  const steps: FormStep[] = [];
  if (contact.length > 0) steps.push({ id: "contact", fields: contact });
  if (details.length > 0) steps.push({ id: "details", fields: details });
  return steps;
}

/** Index of the first step that holds a field with an error (0 when none). */
export function firstErrorStep(steps: readonly FormStep[], errors: Record<string, string>): number {
  const index = steps.findIndex((s) => s.fields.some((f) => errors[f.key] !== undefined));
  return Math.max(0, index);
}

/** A readable value of a submitted field for the summary step and the inbox. */
export function displayValue(
  field: FormField,
  value: FieldValue | null | undefined,
  labels: { yes: string; no: string; none: string },
): string {
  if (value === undefined || value === null || value === "" || value === false) {
    return field.type === "checkbox" ? labels.no : labels.none;
  }
  if (value === true) return labels.yes;
  const optionLabel = (v: string) =>
    field.type === "select" ? (field.options.find((o) => o.value === v)?.label ?? v) : v;
  return Array.isArray(value) ? value.map(optionLabel).join(", ") : optionLabel(value);
}
