import { isoDate, parseIsoDate, type IsoDate } from "./date";
import { moveableFeasts } from "./easter";

/** Stable identifiers of Hungarian public holidays (munkaszüneti napok). */
export type PublicHolidayKey =
  | "newYear"
  | "revolution1848"
  | "goodFriday"
  | "easterMonday"
  | "labourDay"
  | "pentecostMonday"
  | "stateFoundation"
  | "revolution1956"
  | "allSaints"
  | "christmasEve"
  | "christmas"
  | "christmasSecondDay";

export interface PublicHoliday {
  date: IsoDate;
  key: PublicHolidayKey;
  /** Hungarian display name, e.g. „Nemzeti ünnep”. */
  name: string;
  /** True for the Easter-dependent holidays (Nagypéntek, Húsvéthétfő, Pünkösdhétfő). */
  moveable: boolean;
}

interface HolidayRule {
  key: PublicHolidayKey;
  name: string;
  /** Fixed month-day, or a moveable feast from {@link moveableFeasts}. */
  date: readonly [month: number, day: number] | "goodFriday" | "easterMonday" | "pentecostMonday";
  /** First year the day is a public holiday (only recent changes are modelled; see README). */
  since?: number;
}

/**
 * Hungarian public holidays per the Labour Code (2012. évi I. törvény 102. § (1)).
 * Easter Sunday and Pentecost Sunday are not listed separately — they are Sundays anyway.
 * Swapped working days (áthelyezett munkanapok) are out of scope.
 */
const RULES: readonly HolidayRule[] = [
  { key: "newYear", name: "Újév", date: [1, 1] },
  { key: "revolution1848", name: "Nemzeti ünnep", date: [3, 15] },
  { key: "goodFriday", name: "Nagypéntek", date: "goodFriday", since: 2017 },
  { key: "easterMonday", name: "Húsvéthétfő", date: "easterMonday" },
  { key: "labourDay", name: "A munka ünnepe", date: [5, 1] },
  { key: "pentecostMonday", name: "Pünkösdhétfő", date: "pentecostMonday" },
  { key: "stateFoundation", name: "Államalapítás ünnepe", date: [8, 20] },
  { key: "revolution1956", name: "Nemzeti ünnep", date: [10, 23] },
  { key: "allSaints", name: "Mindenszentek", date: [11, 1] },
  { key: "christmasEve", name: "Szenteste", date: [12, 24], since: 2026 },
  { key: "christmas", name: "Karácsony", date: [12, 25] },
  { key: "christmasSecondDay", name: "Karácsony másnapja", date: [12, 26] },
];

const holidayCache = new Map<number, readonly PublicHoliday[]>();

/** All public holidays of a civil year, sorted by date. */
export function publicHolidays(year: number): readonly PublicHoliday[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const moveable = moveableFeasts(year);
  const list = RULES.filter((rule) => rule.since === undefined || year >= rule.since)
    .map((rule): PublicHoliday => {
      const spec = rule.date;
      const date = typeof spec === "string" ? moveable[spec] : isoDate(year, spec[0], spec[1]);
      const isMoveable = typeof spec === "string";
      return Object.freeze({ date, key: rule.key, name: rule.name, moveable: isMoveable });
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const frozen = Object.freeze(list);
  holidayCache.set(year, frozen);
  return frozen;
}

/** The Hungarian public holiday on `date`, or `null` if it is not one. */
export function publicHoliday(date: IsoDate): PublicHoliday | null {
  const { year } = parseIsoDate(date);
  return publicHolidays(year).find((holiday) => holiday.date === date) ?? null;
}
