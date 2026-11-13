import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  EmailSchema,
  IdSchema,
  IsoDateTimeSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";

const FieldBase = {
  /** Stable key used in submitted data. */
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/),
  label: TextSchema,
  required: z.boolean().default(false),
  help: z.string().max(500).nullable().default(null),
};

/** A form field (D-28: text, date, select, checkbox, textarea, file ≤ 10 MB, plus email/phone). */
export const FormFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...FieldBase, type: z.literal("text") }),
  z.object({ ...FieldBase, type: z.literal("textarea") }),
  z.object({ ...FieldBase, type: z.literal("email") }),
  z.object({ ...FieldBase, type: z.literal("phone") }),
  z.object({ ...FieldBase, type: z.literal("date") }),
  z.object({ ...FieldBase, type: z.literal("checkbox") }),
  z.object({
    ...FieldBase,
    type: z.literal("select"),
    options: z.array(z.object({ value: z.string().min(1), label: TextSchema })).min(1),
    multiple: z.boolean().default(false),
  }),
  z.object({
    ...FieldBase,
    type: z.literal("file"),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(10 * 1024 * 1024),
  }),
]);
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormFieldInput = z.input<typeof FormFieldSchema>;

/** Submitted value: text/date/email/phone → string, checkbox → boolean, multi-select → string[], file → media id. */
export const FormValueSchema = z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]);
export type FormData = Record<string, z.infer<typeof FormValueSchema>>;

/**
 * Checks submitted data against form fields: required fields present, value types match, no
 * unknown keys. Returns issues (empty = valid). Shared by both adapters and the UI.
 */
export function validateFormData(
  fields: readonly FormField[],
  data: Record<string, unknown>,
): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) issues.push({ path: [key], message: "Unknown field" });
  }
  for (const field of fields) {
    const value = data[field.key];
    const empty =
      value === undefined ||
      value === null ||
      value === "" ||
      value === false ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required) issues.push({ path: [field.key], message: "Required" });
      continue;
    }
    const ok =
      field.type === "checkbox"
        ? typeof value === "boolean"
        : field.type === "select" && field.multiple
          ? Array.isArray(value) && value.every((v) => field.options.some((o) => o.value === v))
          : field.type === "select"
            ? typeof value === "string" && field.options.some((o) => o.value === value)
            : field.type === "email"
              ? EmailSchema.safeParse(value).success
              : field.type === "date"
                ? z.iso.date().safeParse(value).success
                : typeof value === "string";
    if (!ok) issues.push({ path: [field.key], message: "Invalid value" });
  }
  return issues;
}

/** `form_definitions` (SDD §8.2) — unique `key` per tenant (e.g. `keresztelo`). */
export const FormDefinitionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  key: z.string().regex(/^[a-z0-9-]{1,60}$/),
  title: TextSchema,
  fields: z.array(FormFieldSchema),
  notifyEmails: z.array(EmailSchema),
  confirmationText: z.string().max(2000),
  /** Days after closure until the request is purged (default 12 months, FR-204). */
  retentionDays: z.number().int().positive(),
  /** Reference prefix, e.g. `KER` → `KER-2026-0042`. */
  referencePrefix: z.string().regex(/^[A-Z]{2,5}$/),
  active: z.boolean(),
  ...TimestampsShape,
});
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

export const FormDefinitionInputSchema = FormDefinitionSchema.omit({
  tenantId: true,
  createdAt: true,
  updatedAt: true,
})
  .extend({
    id: IdSchema.optional(),
    notifyEmails: z.array(EmailSchema).default([]),
    confirmationText: z.string().max(2000).default(""),
    retentionDays: z.number().int().positive().default(365),
    active: z.boolean().default(true),
  })
  .refine((f) => new Set(f.fields.map((x) => x.key)).size === f.fields.length, {
    message: "Field keys must be unique",
    path: ["fields"],
  });
export type FormDefinitionInput = z.input<typeof FormDefinitionInputSchema>;

export const RequestStatusSchema = z.enum(["uj", "folyamatban", "lezart"]);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

/**
 * `pastoral_requests` (SDD §8.2, §12). `data` and `notes` are plaintext in the contract; the DB
 * adapter stores them as `data_enc` / `notes_enc` (AES-256-GCM, SDD §8.3).
 */
export const PastoralRequestSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  formId: IdSchema,
  formKey: z.string(),
  reference: z.string().regex(/^[A-Z]{2,5}-\d{4}-\d{4,}$/),
  data: z.record(z.string(), FormValueSchema),
  status: RequestStatusSchema,
  assigneeUserId: IdSchema.nullable(),
  notes: z.array(
    z.object({
      id: IdSchema,
      authorUserId: IdSchema.nullable(),
      body: z.string().min(1).max(4000),
      createdAt: IsoDateTimeSchema,
    }),
  ),
  consentAt: IsoDateTimeSchema,
  consentTextHash: z.string().min(8).max(128),
  createdAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.nullable(),
  purgeAfter: IsoDateTimeSchema.nullable(),
});
export type PastoralRequest = z.infer<typeof PastoralRequestSchema>;

export const RequestSubmissionSchema = z.object({
  formKey: z.string().min(1),
  data: z.record(z.string(), FormValueSchema),
  /** The required consent checkbox (FR-204). */
  consent: z.literal(true),
  consentTextHash: z.string().min(8).max(128),
});
export type RequestSubmission = z.input<typeof RequestSubmissionSchema>;

/**
 * Module `requests` — rite request forms and the requests inbox (D-28, D-29). Requests are
 * special-category data: anonymous ctx may **submit** but never read them back.
 */
export interface RequestRepo {
  /** @public Active forms of the tenant. */
  listForms(ctx: Ctx): Promise<FormDefinition[]>;
  /** @public An active form by key (anonymous) / any form (authenticated), or null. */
  getForm(ctx: Ctx, key: string): Promise<FormDefinition | null>;
  /** Tenant ctx: create/update a form. CONFLICT on duplicate key. */
  upsertForm(ctx: Ctx, input: FormDefinitionInput): Promise<FormDefinition>;
  /** Tenant ctx: delete a form. CONFLICT while requests still reference it. */
  deleteForm(ctx: Ctx, id: string): Promise<void>;

  /**
   * @public Submit a request (anonymous allowed). NOT_FOUND for an unknown/inactive form;
   * VALIDATION if `data` fails `validateFormData`. Returns only id and reference number.
   */
  submit(ctx: Ctx, input: RequestSubmission): Promise<{ id: string; reference: string }>;
  /** Inbox, newest first (anonymous: empty). */
  list(
    ctx: Ctx,
    filter?: { status?: RequestStatus; formKey?: string; from?: string; to?: string },
  ): Promise<PastoralRequest[]>;
  /** One request (anonymous: null). */
  get(ctx: Ctx, id: string): Promise<PastoralRequest | null>;
  /** Tenant ctx: change status; `lezart` sets `closedAt` and `purgeAfter = closedAt + retentionDays`. */
  setStatus(ctx: Ctx, id: string, status: RequestStatus): Promise<PastoralRequest>;
  /** Tenant ctx: set or clear the assignee. */
  assign(ctx: Ctx, id: string, userId: string | null): Promise<PastoralRequest>;
  /** Tenant ctx: append an internal note authored by the ctx actor. */
  addNote(ctx: Ctx, id: string, body: string): Promise<PastoralRequest>;
  /** Tenant ctx: delete requests with `purgeAfter < now`; returns the count only. */
  purgeExpired(ctx: Ctx, now: string): Promise<number>;
}
