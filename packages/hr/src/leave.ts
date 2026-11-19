/**
 * Leave balance (SDD §25.3): entitlement + carry-over + adjustments − Σ approved working days of
 * type *rendes szabadság*. Requested (not yet approved) days are reported separately as planned.
 */

export const REGULAR_LEAVE = "rendes_szabadsag";

export interface EntitlementInput {
  readonly daysTotal: number;
  readonly carriedOver: number;
  readonly adjustments: readonly { readonly days: number }[];
}

export interface AbsenceInput {
  readonly type: string;
  readonly status: "requested" | "approved" | "rejected" | "cancelled";
  readonly startDate: string;
  readonly workingDays: number;
}

export interface LeaveBalance {
  readonly year: number;
  readonly entitlement: number;
  readonly carriedOver: number;
  readonly adjustments: number;
  /** entitlement + carry-over + adjustments */
  readonly total: number;
  /** Approved regular-leave working days of the year. */
  readonly used: number;
  /** Requested, not yet decided. */
  readonly planned: number;
  /** total − used */
  readonly remaining: number;
}

/** The balance of one person for `year`; absences count in the year they start. */
export function leaveBalance(
  year: number,
  entitlement: EntitlementInput | null,
  absences: readonly AbsenceInput[],
): LeaveBalance {
  const e = entitlement ?? { daysTotal: 0, carriedOver: 0, adjustments: [] };
  const adjustments = e.adjustments.reduce((sum, a) => sum + a.days, 0);
  const total = e.daysTotal + e.carriedOver + adjustments;
  const ofYear = absences.filter(
    (a) => a.type === REGULAR_LEAVE && a.startDate.startsWith(`${year}-`),
  );
  const sum = (status: AbsenceInput["status"]) =>
    ofYear.filter((a) => a.status === status).reduce((s, a) => s + a.workingDays, 0);
  const used = sum("approved");
  return {
    year,
    entitlement: e.daysTotal,
    carriedOver: e.carriedOver,
    adjustments,
    total,
    used,
    planned: sum("requested"),
    remaining: total - used,
  };
}
