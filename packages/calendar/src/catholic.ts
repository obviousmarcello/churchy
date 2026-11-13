/**
 * Catholic family: General Roman Calendar (temporal cycle and the solemnities and
 * feasts of the Lord) plus the Hungarian proper solemnities (aug. 20., okt. 8.).
 * Names follow Hungarian Catholic usage; see README for the review list.
 */
import {
  celebration,
  CelebrationTableBuilder,
  type CelebrationTable,
  type TemporalPosition,
} from "./celebration";
import {
  addDays,
  daysBetween,
  isoDate,
  isoWeekday,
  sundayAfter,
  sundayOnOrBefore,
  type IsoDate,
} from "./date";
import { moveableFeasts } from "./easter";

const SEASON_NAMES = {
  advent: "Advent",
  christmas: "Karácsonyi idő",
  ordinary: "Évközi idő",
  lent: "Nagyböjt",
  triduum: "Húsvéti szent háromnap",
  easter: "Húsvéti idő",
} as const;

/** Urunk megkeresztelkedése: the Sunday after Jan 6 (Vízkereszt is kept on Jan 6 in Hungary). */
export function baptismOfTheLord(year: number): IsoDate {
  return sundayAfter(isoDate(year, 1, 6));
}

/** A Szent Család ünnepe: the Sunday within the Christmas octave, or Dec 30 if there is none. */
export function holyFamily(year: number): IsoDate {
  const sunday = sundayAfter(isoDate(year, 12, 25));
  return sunday <= isoDate(year, 12, 31) ? sunday : isoDate(year, 12, 30);
}

const tableCache = new Map<number, CelebrationTable>();

/** Celebrations of one civil year, with the Hungarian/universal transfer rules applied. */
export function catholicCelebrations(year: number): CelebrationTable {
  const cached = tableCache.get(year);
  if (cached) return cached;
  const m = moveableFeasts(year);
  const e = m.easterSunday;
  const t = new CelebrationTableBuilder();
  const temporal = { temporal: true };

  // Temporal cycle.
  t.add(
    baptismOfTheLord(year),
    celebration("baptismOfTheLord", "Urunk megkeresztelkedése", "feast", 5, temporal),
  )
    .add(
      m.ashWednesday,
      celebration("ashWednesday", "Hamvazószerda", "weekday", 2, { notable: true }),
    )
    .add(
      m.palmSunday,
      celebration("palmSunday", "Virágvasárnap", "sunday", 2, { notable: true, temporal: true }),
    )
    .add(addDays(e, -6), celebration("holyMonday", "Nagyhétfő", "weekday", 2))
    .add(addDays(e, -5), celebration("holyTuesday", "Nagykedd", "weekday", 2))
    .add(addDays(e, -4), celebration("holyWednesday", "Nagyszerda", "weekday", 2))
    .add(m.maundyThursday, celebration("maundyThursday", "Nagycsütörtök", "triduum", 1))
    .add(m.goodFriday, celebration("goodFriday", "Nagypéntek", "triduum", 1))
    .add(m.holySaturday, celebration("holySaturday", "Nagyszombat", "triduum", 1))
    .add(e, celebration("easterSunday", "Húsvétvasárnap", "solemnity", 2, temporal))
    .add(m.easterMonday, celebration("easterMonday", "Húsvéthétfő", "solemnity", 2))
    .add(
      m.ascension,
      celebration("ascension", "Urunk mennybemenetele (Áldozócsütörtök)", "solemnity", 2),
    )
    .add(
      m.pentecostSunday,
      celebration("pentecostSunday", "Pünkösdvasárnap", "solemnity", 2, temporal),
    )
    .add(m.pentecostMonday, celebration("pentecostMonday", "Pünkösdhétfő", "memorial", 10))
    .add(
      m.trinitySunday,
      celebration("trinitySunday", "Szentháromság vasárnapja", "solemnity", 3, temporal),
    )
    .add(
      m.corpusChristi,
      celebration(
        "corpusChristi",
        "Krisztus Szent Teste és Vére (Úrnapja)",
        "solemnity",
        3,
        temporal,
      ),
    )
    .add(m.sacredHeart, celebration("sacredHeart", "Jézus Szentséges Szíve", "solemnity", 3))
    .add(m.christTheKing, celebration("christTheKing", "Krisztus Király", "solemnity", 3, temporal))
    .add(
      holyFamily(year),
      celebration("holyFamily", "A Szent Család ünnepe", "feast", 5, temporal),
    );

  // Fixed dates of the Christmas cycle.
  t.add(
    isoDate(year, 1, 1),
    celebration("maryMotherOfGod", "Szűz Mária, Isten Anyja", "solemnity", 3, temporal),
  )
    .add(
      isoDate(year, 1, 6),
      celebration("epiphany", "Urunk megjelenése (Vízkereszt)", "solemnity", 2, temporal),
    )
    .add(
      isoDate(year, 12, 24),
      celebration("christmasEve", "Szenteste", "weekday", 9, { notable: true }),
    )
    .add(
      isoDate(year, 12, 25),
      celebration("christmas", "Karácsony, Urunk születése", "solemnity", 2, temporal),
    )
    .add(
      isoDate(year, 12, 26),
      celebration("stStephenProtomartyr", "Szent István első vértanú", "feast", 7),
    );

  // Solemnities with transfer rules.
  const holyWeekStart = m.palmSunday;
  let joseph = isoDate(year, 3, 19);
  if (joseph >= holyWeekStart && joseph <= e) joseph = addDays(holyWeekStart, -1);
  else if (isoWeekday(joseph) === 7) joseph = addDays(joseph, 1);
  t.add(
    joseph,
    celebration("joseph", "Szent József, a Boldogságos Szűz Mária jegyese", "solemnity", 3),
  );

  let annunciation = isoDate(year, 3, 25);
  if (annunciation >= holyWeekStart && annunciation <= addDays(e, 7)) annunciation = addDays(e, 8);
  else if (isoWeekday(annunciation) === 7) annunciation = addDays(annunciation, 1);
  t.add(
    annunciation,
    celebration(
      "annunciation",
      "Urunk születésének hírüladása (Gyümölcsoltó Boldogasszony)",
      "solemnity",
      3,
    ),
  );

  // When a fixed solemnity coincides with a moveable one it moves to the previous day
  // (precedent: Keresztelő Szent János on 2022-06-23, when Jézus Szíve fell on Jun 24).
  const moveableSolemnities = new Set([m.sacredHeart, m.corpusChristi]);
  const beforeMoveable = (date: IsoDate) =>
    moveableSolemnities.has(date) ? addDays(date, -1) : date;
  t.add(
    beforeMoveable(isoDate(year, 6, 24)),
    celebration("nativityOfJohnTheBaptist", "Keresztelő Szent János születése", "solemnity", 3),
  ).add(
    beforeMoveable(isoDate(year, 6, 29)),
    celebration("peterAndPaul", "Szent Péter és Szent Pál apostolok", "solemnity", 3),
  );

  let immaculate = isoDate(year, 12, 8);
  if (isoWeekday(immaculate) === 7) immaculate = addDays(immaculate, 1);
  t.add(
    immaculate,
    celebration(
      "immaculateConception",
      "A Boldogságos Szűz Mária szeplőtelen fogantatása",
      "solemnity",
      3,
    ),
  );

  t.add(
    isoDate(year, 2, 2),
    celebration("presentation", "Urunk bemutatása (Gyertyaszentelő Boldogasszony)", "feast", 5),
  )
    .add(isoDate(year, 8, 6), celebration("transfiguration", "Urunk színeváltozása", "feast", 5))
    .add(
      isoDate(year, 8, 15),
      celebration("assumption", "Szűz Mária mennybevétele (Nagyboldogasszony)", "solemnity", 3),
    )
    .add(
      isoDate(year, 8, 20),
      celebration(
        "stStephenKing",
        "Szent István király, Magyarország fővédőszentje",
        "solemnity",
        4,
      ),
    )
    .add(
      isoDate(year, 9, 14),
      celebration("exaltationOfTheCross", "A Szent Kereszt felmagasztalása", "feast", 5),
    )
    .add(
      isoDate(year, 10, 8),
      celebration("magyarokNagyasszonya", "Magyarok Nagyasszonya", "solemnity", 4),
    )
    .add(isoDate(year, 11, 1), celebration("allSaints", "Mindenszentek", "solemnity", 3))
    .add(
      isoDate(year, 11, 2),
      celebration("allSouls", "Halottak napja (Minden megholt hívek emléknapja)", "feast", 3),
    )
    .add(
      isoDate(year, 11, 9),
      celebration("lateranBasilica", "A lateráni bazilika felszentelése", "feast", 5),
    );

  const table = t.build();
  tableCache.set(year, table);
  return table;
}

/** Season, week and Sunday ordinal for a Catholic date. */
export function catholicTemporal(date: IsoDate, year: number): TemporalPosition {
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

  if (date >= advent1) {
    if (date >= isoDate(year, 12, 25)) return position("christmas", null);
    const week = Math.floor(daysBetween(advent1, date) / 7) + 1;
    return position("advent", week, [`Advent ${week}. vasárnapja`, `advent-${week}`]);
  }
  const baptism = baptismOfTheLord(year);
  if (date <= baptism) {
    return position("christmas", null, ["Karácsony utáni 2. vasárnap", "christmas-2"]);
  }
  if (date < m.ashWednesday) {
    const week = Math.floor(daysBetween(baptism, date) / 7) + 1;
    return position("ordinary", week, [`Évközi ${week}. vasárnap`, `ordinary-${week}`]);
  }
  if (date < m.maundyThursday) {
    const lent1 = addDays(e, -42);
    if (date < lent1) return position("lent", null);
    const week = Math.floor(daysBetween(lent1, date) / 7) + 1;
    return position("lent", week, [`Nagyböjt ${week}. vasárnapja`, `lent-${week}`]);
  }
  if (date < e) return position("triduum", null);
  if (date < m.pentecostSunday) {
    const week = Math.floor(daysBetween(e, date) / 7) + 1;
    return position("easter", week, [`Húsvét ${week}. vasárnapja`, `easter-${week}`]);
  }
  if (date === m.pentecostSunday) return position("easter", null);
  const week = 35 - daysBetween(sundayOnOrBefore(date), advent1) / 7;
  return position("ordinary", week, [`Évközi ${week}. vasárnap`, `ordinary-${week}`]);
}

/** Catholic Sunday lectionary cycle for a liturgical year (2026 → A). */
export function lectionaryCycle(liturgicalYear: number): "A" | "B" | "C" {
  return (["C", "A", "B"] as const)[liturgicalYear % 3] as "A" | "B" | "C";
}

/** Catholic weekday lectionary cycle (odd years I, even years II). */
export function weekdayCycle(liturgicalYear: number): "I" | "II" {
  return liturgicalYear % 2 === 1 ? "I" : "II";
}
