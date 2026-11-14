/**
 * Protestant family: the Hungarian Lutheran/Reformed church year.
 *
 * Scheme (documented in README):
 * Advent 1–4 → Karácsony → Karácsony utáni vasárnap → Újév → Újév utáni vasárnap →
 * Vízkereszt → Vízkereszt utáni N. vasárnap → Hetvened/Hatvanad/Ötvened vasárnap
 * (böjtelő) → Hamvazószerda → Böjt 1.–5. vasárnapja (Invocavit … Judica) →
 * Virágvasárnap → Nagyhét → Húsvét → Húsvét utáni 1.–6. vasárnap (Quasimodogeniti …
 * Exaudi) → Pünkösd → Szentháromság ünnepe → Szentháromság ünnepe utáni N. vasárnap
 * (up to 27) → Advent.
 */
import {
  celebration,
  CelebrationTableBuilder,
  type CelebrationTable,
  type TemporalPosition,
} from "./celebration";
import { addDays, daysBetween, isoDate, isoWeekday, sundayAfter, type IsoDate } from "./date";
import { moveableFeasts } from "./easter";

const SEASON_NAMES = {
  advent: "Advent",
  christmas: "Karácsonyi idő",
  epiphany: "Vízkereszt utáni idő",
  preLent: "Böjtelő",
  lent: "Böjti idő",
  easter: "Húsvéti idő",
  trinity: "Szentháromság ünnepe utáni idő",
} as const;

const PRE_LENT_SUNDAYS = [
  "Hetvened vasárnap (Septuagesimae)",
  "Hatvanad vasárnap (Sexagesimae)",
  "Ötvened vasárnap (Esto mihi)",
] as const;

const LENT_SUNDAY_LATIN = ["Invocavit", "Reminiscere", "Oculi", "Laetare", "Judica"] as const;

const EASTER_SUNDAY_LATIN = [
  "Quasimodogeniti",
  "Misericordias Domini",
  "Jubilate",
  "Cantate",
  "Rogate",
  "Exaudi",
] as const;

const tableCache = new Map<number, CelebrationTable>();

export function protestantCelebrations(year: number): CelebrationTable {
  const cached = tableCache.get(year);
  if (cached) return cached;
  const m = moveableFeasts(year);
  const temporal = { temporal: true };
  const table = new CelebrationTableBuilder()
    .add(isoDate(year, 1, 1), celebration("newYear", "Újév", "feast", 3, temporal))
    .add(isoDate(year, 1, 6), celebration("epiphany", "Vízkereszt ünnepe", "feast", 3, temporal))
    .add(
      m.ashWednesday,
      celebration("ashWednesday", "Hamvazószerda", "weekday", 2, { notable: true }),
    )
    .add(
      m.palmSunday,
      celebration("palmSunday", "Virágvasárnap (Palmarum)", "sunday", 2, {
        notable: true,
        temporal: true,
      }),
    )
    .add(m.maundyThursday, celebration("maundyThursday", "Nagycsütörtök", "feast", 1))
    .add(m.goodFriday, celebration("goodFriday", "Nagypéntek", "solemnity", 1))
    .add(
      m.holySaturday,
      celebration("holySaturday", "Nagyszombat", "weekday", 1, { notable: true }),
    )
    .add(m.easterSunday, celebration("easterSunday", "Húsvétvasárnap", "solemnity", 1, temporal))
    .add(m.easterMonday, celebration("easterMonday", "Húsvéthétfő", "feast", 2))
    .add(
      m.ascension,
      celebration("ascension", "Mennybemenetel ünnepe (Áldozócsütörtök)", "feast", 2),
    )
    .add(
      m.pentecostSunday,
      celebration("pentecostSunday", "Pünkösdvasárnap", "solemnity", 1, temporal),
    )
    .add(m.pentecostMonday, celebration("pentecostMonday", "Pünkösdhétfő", "feast", 2))
    .add(
      m.trinitySunday,
      celebration("trinitySunday", "Szentháromság ünnepe", "feast", 2, temporal),
    )
    .add(isoDate(year, 10, 31), celebration("reformation", "Reformáció ünnepe", "feast", 5))
    .add(
      isoDate(year, 12, 24),
      celebration("christmasEve", "Szenteste", "weekday", 9, { notable: true }),
    )
    .add(
      isoDate(year, 12, 25),
      celebration("christmas", "Karácsony ünnepe", "solemnity", 1, temporal),
    )
    .add(isoDate(year, 12, 26), celebration("christmasSecondDay", "Karácsony 2. napja", "feast", 3))
    .build();
  tableCache.set(year, table);
  return table;
}

/** Season, week and Sunday ordinal for a Protestant date. */
export function protestantTemporal(date: IsoDate, year: number): TemporalPosition {
  const m = moveableFeasts(year);
  const e = m.easterSunday;
  const advent1 = m.adventSundays[0];
  const isSunday = isoWeekday(date) === 7;
  const liturgicalYear = date >= advent1 ? year + 1 : year;
  const position = (
    season: keyof typeof SEASON_NAMES,
    week: number | null,
    sunday: [name: string, key: string] | null = null,
  ): TemporalPosition => ({
    season,
    seasonName: SEASON_NAMES[season],
    week,
    sundayName: isSunday && sunday ? sunday[0] : null,
    sundayKey: isSunday && sunday ? sunday[1] : null,
    liturgicalYear,
  });
  /** Ordinal of the Sunday on or before `date`, counting `firstSunday` as 1 (null before it). */
  const ordinal = (firstSunday: IsoDate): number | null =>
    date < firstSunday ? null : Math.floor(daysBetween(firstSunday, date) / 7) + 1;

  if (date >= advent1) {
    if (date >= isoDate(year, 12, 25)) {
      return position("christmas", null, ["Karácsony utáni vasárnap", "christmas-1"]);
    }
    const week = ordinal(advent1) as number;
    return position("advent", week, [`Advent ${week}. vasárnapja`, `advent-${week}`]);
  }
  const epiphany = isoDate(year, 1, 6);
  if (date < epiphany) return position("christmas", null, ["Újév utáni vasárnap", "christmas-2"]);
  const septuagesima = addDays(e, -63);
  if (date < septuagesima) {
    const week = ordinal(sundayAfter(epiphany));
    return position(
      "epiphany",
      week,
      week === null ? null : [`Vízkereszt utáni ${week}. vasárnap`, `epiphany-${week}`],
    );
  }
  if (date < m.ashWednesday) {
    const week = ordinal(septuagesima) as number;
    return position("preLent", week, [PRE_LENT_SUNDAYS[week - 1] as string, `preLent-${week}`]);
  }
  if (date < e) {
    const week = ordinal(addDays(e, -42));
    const latin = week === null ? undefined : LENT_SUNDAY_LATIN[week - 1];
    return position(
      "lent",
      week,
      latin ? [`Böjt ${week}. vasárnapja (${latin})`, `lent-${week}`] : null,
    );
  }
  if (date < m.trinitySunday) {
    const week = ordinal(addDays(e, 7));
    const latin = week === null ? undefined : EASTER_SUNDAY_LATIN[week - 1];
    return position(
      "easter",
      week,
      latin ? [`Húsvét utáni ${week}. vasárnap (${latin})`, `easter-${week}`] : null,
    );
  }
  const week = ordinal(addDays(m.trinitySunday, 7));
  return position(
    "trinity",
    week,
    week === null ? null : [`Szentháromság ünnepe utáni ${week}. vasárnap`, `trinity-${week}`],
  );
}
