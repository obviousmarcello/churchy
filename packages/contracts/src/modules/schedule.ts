import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  IsoTimeSchema,
  IsoWeekdaySchema,
  TextSchema,
} from "../primitives";

/**
 * Schedule domain (SDD §8.2, §9). Field names are fixed — `packages/schedule` (the engine)
 * consumes exactly these shapes.
 */

/** nth week of month: 1–5, -1 = last, null = every week. */
export const NthWeekSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(-1)])
  .nullable();
export type NthWeek = z.infer<typeof NthWeekSchema>;

/** `schedule_periods` — if `yearly`, only the month-day of validFrom/validTo matters. */
export const SchedulePeriodSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: TextSchema,
  validFrom: IsoDateSchema.nullable(),
  validTo: IsoDateSchema.nullable(),
  yearly: z.boolean(),
  priority: z.number().int(),
});
export type SchedulePeriod = z.infer<typeof SchedulePeriodSchema>;

export const SchedulePeriodInputSchema = SchedulePeriodSchema.omit({ tenantId: true })
  .extend({
    id: IdSchema.optional(),
    validFrom: IsoDateSchema.nullable().default(null),
    validTo: IsoDateSchema.nullable().default(null),
    yearly: z.boolean().default(false),
    priority: z.number().int().default(0),
  })
  .superRefine((p, issue) => {
    if (p.yearly && (p.validFrom === null || p.validTo === null)) {
      issue.addIssue({
        code: "custom",
        path: ["validFrom"],
        message: "A yearly period needs both validFrom and validTo",
      });
    }
    // Non-yearly ranges must be ordered; yearly ranges may wrap around New Year.
    if (!p.yearly && p.validFrom !== null && p.validTo !== null && p.validTo < p.validFrom) {
      issue.addIssue({
        code: "custom",
        path: ["validTo"],
        message: "validTo must not be before validFrom",
      });
    }
  });
export type SchedulePeriodInput = z.input<typeof SchedulePeriodInputSchema>;

/** `service_rules`. */
export const ServiceRuleSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  periodId: IdSchema,
  locationId: IdSchema,
  weekday: IsoWeekdaySchema,
  nthWeek: NthWeekSchema,
  time: IsoTimeSchema,
  durationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  /** Preset service-type key (e.g. `szentmise`, `istentisztelet`). */
  serviceType: z.string().min(1).max(60),
  /** BCP-47-ish language code, e.g. `hu`, `la`, `de`. */
  language: z.string().min(2).max(12),
  title: z.string().max(200).nullable(),
  note: z.string().max(500).nullable(),
  livestream: z.boolean(),
});
export type ServiceRule = z.infer<typeof ServiceRuleSchema>;

export const ServiceRuleInputSchema = ServiceRuleSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  nthWeek: NthWeekSchema.default(null),
  durationMin: ServiceRuleSchema.shape.durationMin.default(60),
  language: ServiceRuleSchema.shape.language.default("hu"),
  title: ServiceRuleSchema.shape.title.default(null),
  note: ServiceRuleSchema.shape.note.default(null),
  livestream: z.boolean().default(false),
});
export type ServiceRuleInput = z.input<typeof ServiceRuleInputSchema>;

export const ServiceExceptionKindSchema = z.enum(["cancel", "modify", "add"]);
export type ServiceExceptionKind = z.infer<typeof ServiceExceptionKindSchema>;

/**
 * `service_exceptions`. Semantics for the engine:
 * - `cancel`: with `ruleId` cancels that rule's service on `date`; without, cancels every service
 *   at `locationId` (or at all locations if `locationId` is null) on `date`;
 * - `modify`: changes the `ruleId` service on `date` (`time`, `serviceType`, `note` override);
 * - `add`: an extra service at `locationId`, `time`, `serviceType`.
 */
export const ServiceExceptionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  locationId: IdSchema.nullable(),
  date: IsoDateSchema,
  kind: ServiceExceptionKindSchema,
  ruleId: IdSchema.nullable(),
  time: IsoTimeSchema.nullable(),
  serviceType: z.string().min(1).max(60).nullable(),
  note: z.string().max(500).nullable(),
  /** Public reason, e.g. *„Nagyhét”*. */
  reason: z.string().max(300).nullable(),
});
export type ServiceException = z.infer<typeof ServiceExceptionSchema>;

export const ServiceExceptionInputSchema = ServiceExceptionSchema.omit({ tenantId: true })
  .extend({
    id: IdSchema.optional(),
    locationId: IdSchema.nullable().default(null),
    ruleId: IdSchema.nullable().default(null),
    time: IsoTimeSchema.nullable().default(null),
    serviceType: ServiceExceptionSchema.shape.serviceType.default(null),
    note: ServiceExceptionSchema.shape.note.default(null),
    reason: ServiceExceptionSchema.shape.reason.default(null),
  })
  .superRefine((e, issue) => {
    if (e.kind === "modify" && e.ruleId === null) {
      issue.addIssue({ code: "custom", path: ["ruleId"], message: "modify needs ruleId" });
    }
    if (e.kind === "add") {
      for (const key of ["locationId", "time", "serviceType"] as const) {
        if (e[key] === null) {
          issue.addIssue({ code: "custom", path: [key], message: `add needs ${key}` });
        }
      }
    }
  });
export type ServiceExceptionInput = z.input<typeof ServiceExceptionInputSchema>;

/**
 * `service_occurrences` (SDD §24.1) — lazily materialized services with stable ids.
 * Unique per `(tenantId, locationId, startsAt, serviceType)`.
 */
export const ServiceOccurrenceSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  locationId: IdSchema,
  startsAt: IsoDateTimeSchema,
  serviceType: z.string().min(1).max(60),
  ruleId: IdSchema.nullable(),
  exceptionId: IdSchema.nullable(),
  status: z.enum(["scheduled", "cancelled", "moved"]),
  movedToId: IdSchema.nullable(),
});
export type ServiceOccurrence = z.infer<typeof ServiceOccurrenceSchema>;

export const EnsureOccurrenceInputSchema = ServiceOccurrenceSchema.pick({
  locationId: true,
  startsAt: true,
  serviceType: true,
}).extend({
  ruleId: IdSchema.nullable().default(null),
  exceptionId: IdSchema.nullable().default(null),
});
export type EnsureOccurrenceInput = z.input<typeof EnsureOccurrenceInputSchema>;

/** Everything the schedule engine needs for one tenant. */
export type ScheduleData = {
  periods: SchedulePeriod[];
  rules: ServiceRule[];
  exceptions: ServiceException[];
};

export type DateRange = { from: string; to: string };

/**
 * Module `schedule` — periods, weekly rules, exceptions (all public data) and materialized
 * service occurrences. Referenced ids (`periodId`, `locationId`, `ruleId`) must belong to the ctx
 * tenant, otherwise NOT_FOUND.
 */
export interface ScheduleRepo {
  /** @public Periods, rules and exceptions of the tenant (input for `packages/schedule`). */
  getScheduleData(ctx: Ctx): Promise<ScheduleData>;
  /** @public Exceptions with `date` in [from, to] (inclusive civil dates). */
  listExceptions(ctx: Ctx, range: DateRange): Promise<ServiceException[]>;

  /** Tenant ctx: create/update a period. */
  upsertPeriod(ctx: Ctx, input: SchedulePeriodInput): Promise<SchedulePeriod>;
  /** Tenant ctx: delete a period and its rules. */
  deletePeriod(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: create/update a rule. */
  upsertRule(ctx: Ctx, input: ServiceRuleInput): Promise<ServiceRule>;
  /** Tenant ctx: delete a rule. */
  deleteRule(ctx: Ctx, id: string): Promise<void>;
  /**
   * Tenant ctx: atomically replace all rules of one period at one location (weekly-grid save,
   * D-22). Returns the new rules.
   */
  replaceRules(
    ctx: Ctx,
    periodId: string,
    locationId: string,
    rules: Omit<ServiceRuleInput, "id" | "periodId" | "locationId">[],
  ): Promise<ServiceRule[]>;
  /** Tenant ctx: create/update an exception. */
  upsertException(ctx: Ctx, input: ServiceExceptionInput): Promise<ServiceException>;
  /** Tenant ctx: delete an exception. */
  deleteException(ctx: Ctx, id: string): Promise<void>;

  /** Tenant ctx: return the occurrence with this unique key, creating it if needed (idempotent). */
  ensureOccurrence(ctx: Ctx, input: EnsureOccurrenceInput): Promise<ServiceOccurrence>;
  /** Materialized occurrences with `startsAt` in [from, to] (instants); anonymous: empty. */
  listOccurrences(
    ctx: Ctx,
    range: DateRange & { locationId?: string },
  ): Promise<ServiceOccurrence[]>;
  /** Tenant ctx: record that an occurrence was cancelled or moved (D-63). */
  updateOccurrence(
    ctx: Ctx,
    id: string,
    patch: Pick<ServiceOccurrence, "status"> & { movedToId?: string | null },
  ): Promise<ServiceOccurrence>;
}
