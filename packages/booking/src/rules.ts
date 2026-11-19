import type { BookingRules } from "@churchy/contracts";
import { localParts, minutesOf } from "./time";

/** The room rules a request can break (SDD §23.2, D-61 AC2). */
export type RuleKey = "bookableHours" | "minNotice" | "maxDuration" | "horizon" | "blackout";

export interface RuleViolation {
  readonly rule: RuleKey;
  /** `blackout`: the name of the closure; otherwise the limit that was exceeded (hours/minutes/days). */
  readonly detail: string | number | null;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Every rule of `rules` that the slot `[startsAt, endsAt)` breaks at `now`. Bookable hours are
 * Europe/Budapest wall-clock windows per ISO weekday; a slot running past midnight is outside
 * them. An empty list means the rules allow the booking (clashes with other bookings are separate).
 */
export function checkRules(
  rules: BookingRules,
  slot: { startsAt: string; endsAt: string },
  now: Date,
): RuleViolation[] {
  const out: RuleViolation[] = [];
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);

  if (rules.bookableHours && rules.bookableHours.length > 0) {
    const a = localParts(start);
    const endMinutes = a.minutes + (end - start) / 60_000;
    const inside = rules.bookableHours.some(
      (w) =>
        w.weekday === a.weekday &&
        minutesOf(w.from) <= a.minutes &&
        endMinutes <= (minutesOf(w.to) === 0 ? 1440 : minutesOf(w.to)),
    );
    if (!inside) out.push({ rule: "bookableHours", detail: null });
  }
  if (rules.minNoticeHours !== undefined && start - now.getTime() < rules.minNoticeHours * HOUR) {
    out.push({ rule: "minNotice", detail: rules.minNoticeHours });
  }
  if (rules.maxDurationMin !== undefined && (end - start) / 60_000 > rules.maxDurationMin) {
    out.push({ rule: "maxDuration", detail: rules.maxDurationMin });
  }
  if (rules.horizonDays !== undefined && start > now.getTime() + rules.horizonDays * DAY) {
    out.push({ rule: "horizon", detail: rules.horizonDays });
  }
  for (const b of rules.blackout ?? []) {
    if (start < Date.parse(b.to) && Date.parse(b.from) < end) {
      out.push({ rule: "blackout", detail: b.name });
    }
  }
  return out;
}
