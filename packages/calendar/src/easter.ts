import { addDays, assertYear, isoDate, isoWeekday, type IsoDate } from "./date";

/**
 * Western (Gregorian) Easter Sunday — the anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher). Valid for 1583–9999.
 */
export function easter(year: number): IsoDate {
  assertYear(year);
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

/** First Sunday of Advent: the fourth Sunday before Christmas (Nov 27 – Dec 3). */
export function firstSundayOfAdvent(year: number): IsoDate {
  const christmasEve = isoDate(year, 12, 24);
  // The 4th Sunday of Advent is the last Sunday on or before Dec 24.
  const fourth = addDays(christmasEve, -(isoWeekday(christmasEve) % 7));
  return addDays(fourth, -21);
}

/** Moveable days of one civil year, all derived from Easter and Christmas. */
export interface MoveableFeasts {
  year: number;
  /** Hamvazószerda — Easter − 46. */
  ashWednesday: IsoDate;
  /** Virágvasárnap — Easter − 7. */
  palmSunday: IsoDate;
  /** Nagycsütörtök — Easter − 3. */
  maundyThursday: IsoDate;
  /** Nagypéntek — Easter − 2. */
  goodFriday: IsoDate;
  /** Nagyszombat — Easter − 1. */
  holySaturday: IsoDate;
  /** Húsvétvasárnap. */
  easterSunday: IsoDate;
  /** Húsvéthétfő — Easter + 1. */
  easterMonday: IsoDate;
  /** Áldozócsütörtök (Ascension) — Easter + 39, kept on Thursday in Hungary. */
  ascension: IsoDate;
  /** Pünkösdvasárnap — Easter + 49. */
  pentecostSunday: IsoDate;
  /** Pünkösdhétfő — Easter + 50. */
  pentecostMonday: IsoDate;
  /** Szentháromság vasárnapja — Easter + 56. */
  trinitySunday: IsoDate;
  /**
   * Úrnapja (Corpus Christi) as celebrated in Hungary: the **Sunday** after
   * Trinity Sunday (Easter + 63). The universal calendar date is the Thursday
   * after Trinity (Easter + 60); the Hungarian Catholic Bishops' Conference
   * transferred it to Sunday, which is when parishes hold the Úrnapja
   * procession and when the schedule needs to know about it.
   */
  corpusChristi: IsoDate;
  /** Jézus Szentséges Szíve — Friday after the 2nd Sunday after Pentecost (Easter + 68). */
  sacredHeart: IsoDate;
  /** Krisztus Király — last Sunday before Advent (Advent 1 − 7). */
  christTheKing: IsoDate;
  /** Advent 1.–4. vasárnapja of this civil year's December. */
  adventSundays: readonly [IsoDate, IsoDate, IsoDate, IsoDate];
}

const moveableCache = new Map<number, MoveableFeasts>();

/** All moveable days of `year` (memoised; the returned object is frozen). */
export function moveableFeasts(year: number): MoveableFeasts {
  const cached = moveableCache.get(year);
  if (cached) return cached;
  const e = easter(year);
  const advent1 = firstSundayOfAdvent(year);
  const feasts: MoveableFeasts = Object.freeze({
    year,
    ashWednesday: addDays(e, -46),
    palmSunday: addDays(e, -7),
    maundyThursday: addDays(e, -3),
    goodFriday: addDays(e, -2),
    holySaturday: addDays(e, -1),
    easterSunday: e,
    easterMonday: addDays(e, 1),
    ascension: addDays(e, 39),
    pentecostSunday: addDays(e, 49),
    pentecostMonday: addDays(e, 50),
    trinitySunday: addDays(e, 56),
    corpusChristi: addDays(e, 63),
    sacredHeart: addDays(e, 68),
    christTheKing: addDays(advent1, -7),
    adventSundays: Object.freeze([
      advent1,
      addDays(advent1, 7),
      addDays(advent1, 14),
      addDays(advent1, 21),
    ] as const),
  });
  moveableCache.set(year, feasts);
  return feasts;
}
