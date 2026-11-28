import {
  addDays,
  feastsInRange,
  isoWeekday,
  publicHoliday,
  type IsoDate,
  type LiturgicalFamily,
} from "@churchy/calendar";

/**
 * Dashboard warnings (D-18 AC3, SDD §11.1). Pure: every input is passed in, "today" is a Budapest
 * civil date, so the rules are unit-testable and never read the clock.
 */

/** From this ISO weekday (Thursday) on, a missing announcement for the coming Sunday is flagged. */
export const ANNOUNCEMENT_WARNING_FROM_WEEKDAY = 4;
/** How far ahead feasts and holidays without a schedule exception are flagged. */
export const HOLIDAY_LOOKAHEAD_DAYS = 14;

/** The Sunday of the current week; on a Sunday, that day itself. */
export function comingSunday(today: IsoDate): IsoDate {
  return addDays(today, 7 - isoWeekday(today));
}

/** True when `today` is Thursday or later in the week. */
export function announcementDue(today: IsoDate): boolean {
  return isoWeekday(today) >= ANNOUNCEMENT_WARNING_FROM_WEEKDAY;
}

export interface SpecialDay {
  readonly date: IsoDate;
  /** Hungarian display name from `@churchy/calendar` (a calendar fact, not a UI string). */
  readonly name: string;
}

/** Public holidays and solemnities / feasts in `[today, today + days]`, in date order. */
export function specialDays(
  today: IsoDate,
  family: LiturgicalFamily,
  days: number = HOLIDAY_LOOKAHEAD_DAYS,
): SpecialDay[] {
  const to = addDays(today, days);
  const byDate = new Map<IsoDate, string>();
  for (const day of feastsInRange(today, to, family)) {
    if (day.name !== null && ["triduum", "solemnity", "feast"].includes(day.rank)) {
      byDate.set(day.date, day.name);
    }
  }
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const holiday = publicHoliday(date);
    if (holiday !== null && !byDate.has(date)) byDate.set(date, holiday.name);
  }
  return [...byDate]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The special days that no schedule exception covers yet. */
export function daysWithoutException(
  days: readonly SpecialDay[],
  exceptionDates: ReadonlySet<string>,
): SpecialDay[] {
  return days.filter((d) => !exceptionDates.has(d.date));
}

/** Setup steps of a new church site; the dashboard nags until all are done. */
export const ONBOARDING_STEPS = ["location", "schedule", "page"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function missingOnboardingSteps(done: Record<OnboardingStep, boolean>): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => !done[step]);
}

export type DashboardWarning =
  | { readonly kind: "announcement"; readonly sunday: IsoDate }
  | { readonly kind: "holidays"; readonly days: readonly SpecialDay[] }
  | { readonly kind: "onboarding"; readonly missing: readonly OnboardingStep[] }
  | { readonly kind: "requests"; readonly count: number };

export interface WarningInput {
  readonly today: IsoDate;
  /** `null` when the actor may not manage announcements (no warning then). */
  readonly announcementForSunday: boolean | null;
  /** `null` when the actor may not edit the schedule. */
  readonly uncoveredDays: readonly SpecialDay[] | null;
  /** `null` when the actor may not manage the site's setup. */
  readonly missingSteps: readonly OnboardingStep[] | null;
  /** `null` when the actor may not read requests. */
  readonly newRequests: number | null;
}

/** All warnings that apply, in the order the dashboard shows them. */
export function dashboardWarnings(input: WarningInput): DashboardWarning[] {
  const out: DashboardWarning[] = [];
  if (input.newRequests !== null && input.newRequests > 0) {
    out.push({ kind: "requests", count: input.newRequests });
  }
  if (input.announcementForSunday === false && announcementDue(input.today)) {
    out.push({ kind: "announcement", sunday: comingSunday(input.today) });
  }
  if (input.uncoveredDays !== null && input.uncoveredDays.length > 0) {
    out.push({ kind: "holidays", days: input.uncoveredDays });
  }
  if (input.missingSteps !== null && input.missingSteps.length > 0) {
    out.push({ kind: "onboarding", missing: input.missingSteps });
  }
  return out;
}
