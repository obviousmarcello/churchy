import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  IsoWeekdaySchema,
  TextSchema,
} from "../primitives";

export const AbsenceStatusSchema = z.enum(["requested", "approved", "rejected", "cancelled"]);
export type AbsenceStatus = z.infer<typeof AbsenceStatusSchema>;

/**
 * `absences` (SDD §25.1). `period daterange` is modelled as inclusive `startDate`/`endDate`.
 * `type` is the HR category's `absenceType` key (e.g. `rendes_szabadsag`). Calendars show only
 * *Távol*; type/reason visibility is `can()`'s job.
 */
export const AbsenceSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  personId: IdSchema,
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  halfDayStart: z.boolean(),
  halfDayEnd: z.boolean(),
  type: z.string().min(1).max(60),
  /** Computed by `packages/hr` (working-day calculation, SDD §25.3); multiples of 0.5. */
  workingDays: z.number().nonnegative().multipleOf(0.5),
  ticketId: IdSchema.nullable(),
  status: AbsenceStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type Absence = z.infer<typeof AbsenceSchema>;

export const AbsenceInputSchema = AbsenceSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
})
  .extend({
    halfDayStart: z.boolean().default(false),
    halfDayEnd: z.boolean().default(false),
    ticketId: IdSchema.nullable().default(null),
    status: AbsenceStatusSchema.default("requested"),
  })
  .refine((a) => a.endDate >= a.startDate, {
    message: "endDate must not be before startDate",
    path: ["endDate"],
  });
export type AbsenceInput = z.input<typeof AbsenceInputSchema>;

export const EmploymentTypeSchema = z.enum([
  "munkaviszony",
  "egyhazi_szolgalati",
  "megbizasi",
  "onkentes",
]);

/** `staff_profiles` (SDD §25.1, §25.7) — one per person. */
export const StaffProfileSchema = z.object({
  tenantId: IdSchema,
  personId: IdSchema,
  position: TextSchema,
  employmentType: EmploymentTypeSchema,
  employer: z.enum(["parish", "org"]),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema.nullable(),
  managerPersonId: IdSchema.nullable(),
  weeklyHours: z.number().min(0).max(80),
  /** Working weekdays, e.g. sacristan Tue–Sun = [2,3,4,5,6,7]. */
  workPattern: z.object({ weekdays: z.array(IsoWeekdaySchema).min(1) }),
});
export type StaffProfile = z.infer<typeof StaffProfileSchema>;

export const StaffProfileInputSchema = StaffProfileSchema.omit({ tenantId: true }).extend({
  employer: z.enum(["parish", "org"]).default("parish"),
  endDate: IsoDateSchema.nullable().default(null),
  managerPersonId: IdSchema.nullable().default(null),
  workPattern: StaffProfileSchema.shape.workPattern.default({ weekdays: [1, 2, 3, 4, 5] }),
});
export type StaffProfileInput = z.input<typeof StaffProfileInputSchema>;

/** `leave_entitlements` (SDD §25.1) — per person and year. */
export const LeaveEntitlementSchema = z.object({
  tenantId: IdSchema,
  personId: IdSchema,
  year: z.number().int().min(2000).max(2100),
  daysTotal: z.number().nonnegative(),
  carriedOver: z.number(),
  adjustments: z.array(z.object({ days: z.number(), reason: TextSchema })),
  note: z.string().max(1000).nullable(),
});
export type LeaveEntitlement = z.infer<typeof LeaveEntitlementSchema>;

export const LeaveEntitlementInputSchema = LeaveEntitlementSchema.omit({ tenantId: true }).extend({
  carriedOver: z.number().default(0),
  adjustments: LeaveEntitlementSchema.shape.adjustments.default([]),
  note: z.string().max(1000).nullable().default(null),
});
export type LeaveEntitlementInput = z.input<typeof LeaveEntitlementInputSchema>;

/** `workday_calendar` (platform-maintained, L-12). */
export const WorkdayCalendarEntrySchema = z.object({
  date: IsoDateSchema,
  kind: z.enum(["holiday", "swapped_workday", "swapped_restday"]),
  name: TextSchema,
});
export type WorkdayCalendarEntry = z.infer<typeof WorkdayCalendarEntrySchema>;

/**
 * Module `absences` — absences, staff profiles (work pattern, manager), leave entitlements and the
 * platform working-day calendar (D-73). HR tables: an org ctx reads absences of parishes with an
 * `active` org link (read-only); anonymous ctx sees nothing.
 */
export interface AbsenceRepo {
  /** Absences overlapping [from, to] (civil dates), optionally by people/status. */
  list(
    ctx: Ctx,
    query: { from: string; to: string; personIds?: string[]; statuses?: AbsenceStatus[] },
  ): Promise<Absence[]>;
  /** One absence, or null. */
  get(ctx: Ctx, id: string): Promise<Absence | null>;
  /** Tenant ctx: create. NOT_FOUND for a person outside the tenant. */
  create(ctx: Ctx, input: AbsenceInput): Promise<Absence>;
  /** Tenant ctx: change status (approve/reject/cancel). */
  setStatus(ctx: Ctx, id: string, status: AbsenceStatus): Promise<Absence>;

  /** Staff profile of a person, or null. */
  getStaffProfile(ctx: Ctx, personId: string): Promise<StaffProfile | null>;
  /** All staff profiles visible in ctx. */
  listStaffProfiles(ctx: Ctx): Promise<StaffProfile[]>;
  /** Tenant ctx: create/update. NOT_FOUND for a person outside the tenant. */
  upsertStaffProfile(ctx: Ctx, input: StaffProfileInput): Promise<StaffProfile>;

  /** Entitlement of a person for a year, or null. */
  getEntitlement(ctx: Ctx, personId: string, year: number): Promise<LeaveEntitlement | null>;
  /** Tenant ctx: create/update an entitlement. */
  upsertEntitlement(ctx: Ctx, input: LeaveEntitlementInput): Promise<LeaveEntitlement>;

  /** Any ctx: platform working-day calendar entries of a year, by date. */
  listWorkdayCalendar(ctx: Ctx, year: number): Promise<WorkdayCalendarEntry[]>;
}
