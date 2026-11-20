import {
  EmailSchema,
  FormDefinitionInputSchema,
  type FormDefinitionInput,
  type FormField,
  type FormFieldInput,
} from "@churchy/contracts";

/**
 * Form builder plumbing (D-28 AC1): the editable draft of a field, its conversion to the contract
 * and the parsing/validation of the builder's submission into a `FormDefinitionInput`. Pure; used
 * by the client builder and the server action.
 */

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "date",
  "checkbox",
  "select",
  "file",
] as const satisfies readonly FormField["type"][];
export type FieldType = (typeof FIELD_TYPES)[number];

/** A field as edited in the builder (all values are plain strings/booleans). */
export interface FieldDraft {
  type: FieldType;
  key: string;
  label: string;
  required: boolean;
  help: string;
  /** One option per line (select only). */
  optionsText: string;
  multiple: boolean;
  /** New fields may still change their key; saved ones keep it (submitted data refers to it). */
  isNew: boolean;
}

export function draftsFromFields(fields: readonly FormField[]): FieldDraft[] {
  return fields.map((f) => ({
    type: f.type,
    key: f.key,
    label: f.label,
    required: f.required,
    help: f.help ?? "",
    optionsText: f.type === "select" ? f.options.map((o) => o.label).join("\n") : "",
    multiple: f.type === "select" ? f.multiple : false,
    isNew: false,
  }));
}

const optionLines = (text: string): string[] => [
  ...new Set(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== ""),
  ),
];

/** The contract field of a draft (the option value is its label). */
export function fieldFromDraft(d: FieldDraft): FormFieldInput {
  const base = {
    key: d.key.trim(),
    label: d.label.trim(),
    required: d.required,
    help: d.help.trim() === "" ? null : d.help.trim(),
  };
  if (d.type === "select") {
    return {
      ...base,
      type: "select",
      multiple: d.multiple,
      options: optionLines(d.optionsText).map((o) => ({ value: o, label: o })),
    };
  }
  return { ...base, type: d.type };
}

/** `mezo1`, `mezo2` … the first key not used by the drafts. */
export function nextFieldKey(drafts: readonly Pick<FieldDraft, "key">[]): string {
  const used = new Set(drafts.map((d) => d.key));
  let n = drafts.length + 1;
  while (used.has(`mezo${n}`)) n += 1;
  return `mezo${n}`;
}

export function newDraft(drafts: readonly Pick<FieldDraft, "key">[]): FieldDraft {
  return {
    type: "text",
    key: nextFieldKey(drafts),
    label: "",
    required: false,
    help: "",
    optionsText: "",
    multiple: false,
    isNew: true,
  };
}

/** The validation messages of `admin.requests.forms.errors`. */
export interface BuilderMessages {
  title: string;
  key: string;
  keyTaken: string;
  prefix: string;
  emails: string;
  retention: string;
  fieldLabel: string;
  fieldKey: string;
  fieldKeyTaken: string;
  options: string;
  general: string;
}

export const BUILDER_FIELDS = [
  "title",
  "key",
  "referencePrefix",
  "notifyEmails",
  "confirmationText",
  "retentionDays",
  "active",
  "fieldsJson",
] as const;
export type BuilderValues = Record<(typeof BUILDER_FIELDS)[number], string>;

export type BuilderResult =
  { ok: true; input: FormDefinitionInput } | { ok: false; errors: Record<string, string> };

/** Splits an e-mail list typed with commas, semicolons or line breaks. */
export function splitEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e !== "");
}

function readDrafts(json: string): FieldDraft[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as FieldDraft[]) : [];
  } catch {
    return [];
  }
}

/**
 * Validates the builder's submission. `existing` carries the id and (locked) key of a saved form;
 * `takenKeys` the keys of the church's other forms.
 */
export function parseBuilder(
  values: BuilderValues,
  existing: { id: string; key: string } | null,
  takenKeys: readonly string[],
  messages: BuilderMessages,
): BuilderResult {
  const errors: Record<string, string> = {};
  const key = existing?.key ?? values.key.trim();
  if (values.title.trim() === "") errors["title"] = messages.title;
  if (existing === null) {
    if (!/^[a-z0-9-]{1,60}$/.test(key)) errors["key"] = messages.key;
    else if (takenKeys.includes(key)) errors["key"] = messages.keyTaken;
  }
  if (!/^[A-Z]{2,5}$/.test(values.referencePrefix.trim()))
    errors["referencePrefix"] = messages.prefix;
  const emails = splitEmails(values.notifyEmails);
  if (!emails.every((e) => EmailSchema.safeParse(e).success))
    errors["notifyEmails"] = messages.emails;
  const retention = Number(values.retentionDays);
  if (!Number.isInteger(retention) || retention <= 0) errors["retentionDays"] = messages.retention;

  const drafts = readDrafts(values.fieldsJson);
  const seen = new Set<string>();
  drafts.forEach((d, i) => {
    const slot = `field.${i}`;
    if (d.label.trim() === "") errors[slot] = messages.fieldLabel;
    else if (!/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(d.key.trim())) errors[slot] = messages.fieldKey;
    else if (seen.has(d.key.trim())) errors[slot] = messages.fieldKeyTaken;
    else if (d.type === "select" && optionLines(d.optionsText).length === 0) {
      errors[slot] = messages.options;
    }
    seen.add(d.key.trim());
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = FormDefinitionInputSchema.safeParse({
    ...(existing === null ? {} : { id: existing.id }),
    key,
    title: values.title.trim(),
    referencePrefix: values.referencePrefix.trim(),
    fields: drafts.map(fieldFromDraft),
    notifyEmails: emails,
    confirmationText: values.confirmationText.trim(),
    retentionDays: retention,
    active: values.active === "on",
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, errors: { _form: messages.general } };
}
