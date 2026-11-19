import type {
  Location,
  NthWeek,
  ScheduleData,
  ServiceExceptionInput,
  ServiceRule,
  ServiceRuleInput,
} from "@churchy/contracts";
import { moveableFeasts } from "@churchy/calendar";
import { addDays, startOfIsoWeek } from "@churchy/hu";
import { resolveDays, type DayContextFn, type Service, type Weekday } from "@churchy/schedule";
import { scheduleInput } from "@/lib/service-schedule/view";

/**
 * Pure logic of the schedule editor (D-22, SDD §9, §11.2): rule drafts of the weekly grid, the
 * 8-week preview with its changes, and the exception flow. The preview resolves the *draft* data
 * with the real `@churchy/schedule` engine, so what the editor shows is what visitors will see.
 */

/** Weeks shown in the preview before saving (FR-311). */
export const PREVIEW_WEEKS = 8;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const NTH_WEEKS: readonly NthWeek[] = [null, 1, 2, 3, 4, 5, -1];

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------------------------
// Rule drafts
// ---------------------------------------------------------------------------------------------

/** A rule as edited in the grid: strings and numbers, plus a client-side key. */
export interface RuleDraft {
  key: string;
  weekday: Weekday;
  time: string;
  serviceType: string;
  language: string;
  nthWeek: NthWeek;
  durationMin: number;
  title: string;
  note: string;
  livestream: boolean;
}

export function ruleToDraft(rule: ServiceRule): RuleDraft {
  return {
    key: rule.id,
    weekday: rule.weekday as Weekday,
    time: rule.time,
    serviceType: rule.serviceType,
    language: rule.language,
    nthWeek: rule.nthWeek,
    durationMin: rule.durationMin,
    title: rule.title ?? "",
    note: rule.note ?? "",
    livestream: rule.livestream,
  };
}

export function newDraft(weekday: Weekday, defaults: { serviceType: string }): RuleDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2, 10)}`,
    weekday,
    time: "10:00",
    serviceType: defaults.serviceType,
    language: "hu",
    nthWeek: null,
    durationMin: 60,
    title: "",
    note: "",
    livestream: false,
  };
}

/** The payload of `replaceRules()` for a draft. */
export function draftToInput(
  d: RuleDraft,
): Omit<ServiceRuleInput, "id" | "periodId" | "locationId"> {
  return {
    weekday: d.weekday,
    nthWeek: d.nthWeek,
    time: d.time,
    durationMin: d.durationMin,
    serviceType: d.serviceType,
    language: d.language,
    title: d.title.trim() === "" ? null : d.title.trim(),
    note: d.note.trim() === "" ? null : d.note.trim(),
    livestream: d.livestream,
  };
}

export type DraftProblem = "time" | "duration" | "type" | "duplicate";

/** Problems per draft key: bad time, no type, or the same weekday/time/type/nth twice. */
export function draftProblems(drafts: readonly RuleDraft[]): Map<string, DraftProblem> {
  const out = new Map<string, DraftProblem>();
  const seen = new Set<string>();
  for (const d of drafts) {
    if (!TIME_RE.test(d.time)) out.set(d.key, "time");
    else if (!Number.isInteger(d.durationMin) || d.durationMin < 1 || d.durationMin > 1440)
      out.set(d.key, "duration");
    else if (d.serviceType.trim() === "") out.set(d.key, "type");
    else {
      const id = [d.weekday, d.nthWeek, d.time, d.serviceType].join("|");
      if (seen.has(id)) out.set(d.key, "duplicate");
      seen.add(id);
    }
  }
  return out;
}

/** The schedule data with the rules of one period at one location replaced by the drafts. */
export function withDrafts(
  data: ScheduleData,
  periodId: string,
  locationId: string,
  drafts: readonly RuleDraft[],
  tenantId = "draft",
): ScheduleData {
  const kept = data.rules.filter((r) => !(r.periodId === periodId && r.locationId === locationId));
  const rules: ServiceRule[] = drafts.map((d) => ({
    // Stored rules keep their id, so exceptions that point at them still apply in the preview.
    id: d.key.startsWith("new-") ? `draft-${d.key}` : d.key,
    tenantId,
    periodId,
    locationId,
    weekday: d.weekday,
    nthWeek: d.nthWeek,
    time: d.time,
    durationMin: d.durationMin,
    serviceType: d.serviceType,
    language: d.language,
    title: d.title.trim() === "" ? null : d.title.trim(),
    note: d.note.trim() === "" ? null : d.note.trim(),
    livestream: d.livestream,
  }));
  return { ...data, rules: [...kept, ...rules] };
}

// ---------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------

export interface PreviewWeek {
  monday: string;
  sunday: string;
}

/** The weeks of the preview: this one and the next seven, Monday first. */
export function previewWeeks(today: string, count = PREVIEW_WEEKS): PreviewWeek[] {
  const first = startOfIsoWeek(today);
  return Array.from({ length: count }, (_, i) => {
    const monday = addDays(first, i * 7);
    return { monday, sunday: addDays(monday, 6) };
  });
}

export interface PreviewSource {
  locations: readonly Location[];
  data: ScheduleData;
}

/** The services of the 8 weeks by the real engine (cancelled ones included, flagged). */
export function resolvePreview(
  source: PreviewSource,
  today: string,
  dayContext?: DayContextFn,
  weeks = PREVIEW_WEEKS,
) {
  const range = previewWeeks(today, weeks);
  const first = range[0]?.monday ?? today;
  const last = range[range.length - 1]?.sunday ?? today;
  return resolveDays(scheduleInput(source), first, last, {
    includeCancelled: true,
    ...(dayContext ? { dayContext } : {}),
  });
}

/** What makes two services "the same" for the before/after comparison. */
export function serviceKey(
  s: Pick<Service, "date" | "locationId" | "time" | "serviceType" | "language" | "status">,
) {
  return [s.date, s.locationId, s.time, s.serviceType, s.language, s.status].join("|");
}

export interface PreviewDiff {
  /** Services that exist after the change and did not before (highlighted). */
  added: Service[];
  /** Services that existed before and are gone. */
  removed: Service[];
}

export function diffServices(
  before: readonly { services: readonly Service[] }[],
  after: readonly { services: readonly Service[] }[],
): PreviewDiff {
  const flat = (days: readonly { services: readonly Service[] }[]) =>
    days.flatMap((d) => d.services).filter((s) => s.status !== "cancelled");
  const b = flat(before);
  const a = flat(after);
  const beforeKeys = new Set(b.map(serviceKey));
  const afterKeys = new Set(a.map(serviceKey));
  return {
    added: a.filter((s) => !beforeKeys.has(serviceKey(s))),
    removed: b.filter((s) => !afterKeys.has(serviceKey(s))),
  };
}

// ---------------------------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------------------------

export type ExceptionAction = "cancel" | "modify" | "add";

/** Services of one date by the engine (the candidates the exception flow offers). */
export function servicesOn(source: PreviewSource, date: string): Service[] {
  const [day] = resolveDays(scheduleInput(source), date, date, {});
  return day?.services ?? [];
}

/** Whether an exception can target the service (it comes from a rule). */
export const isRuleService = (s: Service): boolean => s.ruleId !== null && s.id.startsWith("r:");

export interface ExceptionDraft {
  action: ExceptionAction;
  date: string;
  /** Services chosen from the engine output (cancel / modify). */
  selected: readonly Service[];
  reason: string;
  note: string;
  /** Modify / add. */
  time: string;
  /** Modify / add; empty for "unchanged" when modifying. */
  serviceType: string;
  /** Add. */
  locationId: string;
}

const nullIfEmpty = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** The exceptions to store for the flow's choices. */
export function exceptionInputs(d: ExceptionDraft): ServiceExceptionInput[] {
  const base = { date: d.date, reason: nullIfEmpty(d.reason), note: nullIfEmpty(d.note) };
  if (d.action === "add") {
    return [
      {
        ...base,
        kind: "add",
        locationId: d.locationId,
        ruleId: null,
        time: d.time,
        serviceType: d.serviceType,
      },
    ];
  }
  return d.selected.filter(isRuleService).map((s) =>
    d.action === "cancel"
      ? { ...base, note: null, kind: "cancel", locationId: s.locationId, ruleId: s.ruleId }
      : {
          ...base,
          kind: "modify",
          locationId: s.locationId,
          ruleId: s.ruleId,
          time: d.time,
          serviceType: d.serviceType === s.serviceType ? null : nullIfEmpty(d.serviceType),
        },
  );
}

/** Whether a draft can be saved (a reason for cancellations, a time for change / add). */
export function exceptionProblem(
  d: ExceptionDraft,
): "date" | "services" | "time" | "type" | "location" | "reason" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return "date";
  if (d.action !== "add" && d.selected.filter(isRuleService).length === 0) return "services";
  if (d.action !== "cancel" && !TIME_RE.test(d.time)) return "time";
  if (d.action === "add" && d.serviceType.trim() === "") return "type";
  if (d.action === "add" && d.locationId === "") return "location";
  if (d.reason.trim() === "") return "reason";
  return null;
}

/** The data with exceptions applied (ids are synthetic), for the result preview. */
export function withExceptions(
  data: ScheduleData,
  inputs: readonly ServiceExceptionInput[],
  tenantId = "draft",
): ScheduleData {
  return {
    ...data,
    exceptions: [
      ...data.exceptions,
      ...inputs.map((e, i) => ({
        id: `draft-x-${i}`,
        tenantId,
        locationId: e.locationId ?? null,
        date: e.date,
        kind: e.kind,
        ruleId: e.ruleId ?? null,
        time: e.time ?? null,
        serviceType: e.serviceType ?? null,
        note: e.note ?? null,
        reason: e.reason ?? null,
      })),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Holiday templates (FR-312)
// ---------------------------------------------------------------------------------------------

export type HolidayTemplateKey = "holyWeek" | "christmas" | "newYear";

export interface HolidayTemplate {
  key: HolidayTemplateKey;
  /** Dates the template covers, in order. */
  dates: string[];
}

/** Holiday periods of the next occurrence on or after `today`. */
export function holidayTemplates(today: string): HolidayTemplate[] {
  const year = Number(today.slice(0, 4));
  const pick = (build: (y: number) => string[]): string[] => {
    const thisYear = build(year);
    const last = thisYear[thisYear.length - 1] ?? "";
    return last >= today ? thisYear : build(year + 1);
  };
  return [
    {
      key: "holyWeek",
      dates: pick((y) => {
        const f = moveableFeasts(y);
        return [f.maundyThursday, f.goodFriday, f.holySaturday, f.easterSunday, f.easterMonday];
      }),
    },
    { key: "christmas", dates: pick((y) => [`${y}-12-24`, `${y}-12-25`, `${y}-12-26`]) },
    { key: "newYear", dates: pick((y) => [`${y}-12-31`, `${y + 1}-01-01`]) },
  ];
}

/** Cancellations of every service on the dates (all locations), one exception per date. */
export function holidayExceptions(
  dates: readonly string[],
  reason: string,
): ServiceExceptionInput[] {
  return dates.map((date) => ({
    date,
    kind: "cancel" as const,
    locationId: null,
    ruleId: null,
    reason: reason.trim() === "" ? null : reason.trim(),
  }));
}
