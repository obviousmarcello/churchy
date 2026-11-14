import { catholicCelebrations, catholicTemporal, lectionaryCycle, weekdayCycle } from "./catholic";
import type { Celebration, CelebrationTable, TemporalPosition } from "./celebration";
import { addDays, daysBetween, isoWeekday, parseIsoDate, type IsoDate } from "./date";
import { protestantCelebrations, protestantTemporal } from "./protestant";
import { LITURGICAL_FAMILIES, type LiturgicalDay, type LiturgicalFamily } from "./types";

interface FamilyCalendar {
  celebrations(year: number): CelebrationTable;
  temporal(date: IsoDate, year: number): TemporalPosition;
}

const FAMILIES: Record<LiturgicalFamily, FamilyCalendar> = {
  catholic: { celebrations: catholicCelebrations, temporal: catholicTemporal },
  protestant: { celebrations: protestantCelebrations, temporal: protestantTemporal },
};

/** Sundays of Advent, Lent and Easter outrank everything except the Triduum and principal feasts. */
const PRIVILEGED_SEASONS = new Set(["advent", "lent", "easter"]);

function assertFamily(family: LiturgicalFamily): void {
  if (!LITURGICAL_FAMILIES.includes(family)) {
    throw new RangeError(`Unknown liturgical family: ${String(family)}`);
  }
}

/**
 * The liturgical day for a civil date in the given tradition.
 *
 * Stable signature consumed by the schedule engine (`packages/schedule`).
 * Pure and timezone-independent; throws `RangeError` for an invalid date or family.
 */
export function liturgicalDay(date: IsoDate, family: LiturgicalFamily): LiturgicalDay {
  assertFamily(family);
  const { year } = parseIsoDate(date);
  const calendar = FAMILIES[family];
  const position = calendar.temporal(date, year);
  const weekday = isoWeekday(date);
  const isSunday = weekday === 7;

  let winner: Celebration | null = null;
  for (const item of calendar.celebrations(year).get(date) ?? []) {
    if (!winner || item.precedence < winner.precedence) winner = item;
  }
  // An ordinal Sunday beats celebrations of equal or lower rank (ties go to the Sunday);
  // temporal celebrations such as Virágvasárnap *are* that Sunday and always stand.
  if (winner && !winner.temporal && isSunday && position.sundayName !== null) {
    const sundayPrecedence = PRIVILEGED_SEASONS.has(position.season) ? 2 : 6;
    if (winner.precedence >= sundayPrecedence) winner = null;
  }

  const sundayName = !isSunday
    ? null
    : winner?.temporal || position.sundayName === null
      ? (winner?.name ?? null)
      : position.sundayName;
  const name = winner?.name ?? sundayName;
  const rank = winner?.rank ?? (isSunday ? "sunday" : "weekday");
  const isCatholic = family === "catholic";

  return {
    date,
    family,
    weekday,
    isSunday,
    name,
    sundayName,
    key: winner?.key ?? (isSunday ? position.sundayKey : null),
    season: position.season,
    seasonName: position.seasonName,
    week: position.week,
    rank,
    isSolemnity: rank === "solemnity",
    isNotable: winner?.notable ?? false,
    liturgicalYear: position.liturgicalYear,
    lectionaryCycle: isCatholic ? lectionaryCycle(position.liturgicalYear) : null,
    weekdayCycle: isCatholic ? weekdayCycle(position.liturgicalYear) : null,
  };
}

/**
 * The Sunday's name in the temporal cycle (e.g. „Évközi 33. vasárnap”,
 * „Szentháromság ünnepe utáni 23. vasárnap”, „Húsvétvasárnap”), or `null` if
 * `date` is not a Sunday.
 */
export function sundayName(date: IsoDate, family: LiturgicalFamily): string | null {
  return liturgicalDay(date, family).sundayName;
}

/** Longest range accepted by {@link feastsInRange} (matches the schedule engine's 400-day window, with slack). */
export const MAX_RANGE_DAYS = 800;

/**
 * Notable liturgical days (`isNotable`) in the inclusive range `[from, to]`, in date order.
 * Throws `RangeError` if `to` is before `from` or the range exceeds {@link MAX_RANGE_DAYS}.
 */
export function feastsInRange(
  from: IsoDate,
  to: IsoDate,
  family: LiturgicalFamily,
): LiturgicalDay[] {
  assertFamily(family);
  const span = daysBetween(from, to);
  if (span < 0) throw new RangeError(`Range end ${to} is before start ${from}`);
  if (span >= MAX_RANGE_DAYS) {
    throw new RangeError(`Range too long: ${span + 1} days (max ${MAX_RANGE_DAYS})`);
  }
  const result: LiturgicalDay[] = [];
  for (let i = 0; i <= span; i++) {
    const day = liturgicalDay(addDays(from, i), family);
    if (day.isNotable) result.push(day);
  }
  return result;
}
