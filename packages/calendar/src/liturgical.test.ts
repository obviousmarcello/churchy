import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "./date";
import { moveableFeasts } from "./easter";
import { feastsInRange, liturgicalDay, MAX_RANGE_DAYS, sundayName } from "./liturgical";
import type { LiturgicalFamily } from "./types";

/**
 * Reference dates, derived by hand from the Easter and Advent dates of each year
 * (2026: Easter Apr 5, Advent 1 Nov 29; 2025: Advent 1 Nov 30) and the naming
 * scheme in README.md. Columns: date, expected `name`, expected `sundayName`.
 */
type Row = readonly [date: string, name: string | null, sundayName: string | null];

const CATHOLIC_REFERENCE: readonly Row[] = [
  ["2025-11-30", "Advent 1. vasárnapja", "Advent 1. vasárnapja"],
  ["2025-12-21", "Advent 4. vasárnapja", "Advent 4. vasárnapja"],
  ["2025-12-25", "Karácsony, Urunk születése", null],
  ["2025-12-28", "A Szent Család ünnepe", "A Szent Család ünnepe"],
  ["2026-01-01", "Szűz Mária, Isten Anyja", null],
  ["2026-01-04", "Karácsony utáni 2. vasárnap", "Karácsony utáni 2. vasárnap"],
  ["2026-01-06", "Urunk megjelenése (Vízkereszt)", null],
  ["2026-01-11", "Urunk megkeresztelkedése", "Urunk megkeresztelkedése"],
  ["2026-01-18", "Évközi 2. vasárnap", "Évközi 2. vasárnap"],
  ["2026-02-15", "Évközi 6. vasárnap", "Évközi 6. vasárnap"],
  ["2026-02-18", "Hamvazószerda", null],
  ["2026-02-22", "Nagyböjt 1. vasárnapja", "Nagyböjt 1. vasárnapja"],
  ["2026-03-01", "Nagyböjt 2. vasárnapja", "Nagyböjt 2. vasárnapja"],
  ["2026-03-19", "Szent József, a Boldogságos Szűz Mária jegyese", null],
  ["2026-03-25", "Urunk születésének hírüladása (Gyümölcsoltó Boldogasszony)", null],
  ["2026-03-29", "Virágvasárnap", "Virágvasárnap"],
  ["2026-04-02", "Nagycsütörtök", null],
  ["2026-04-03", "Nagypéntek", null],
  ["2026-04-04", "Nagyszombat", null],
  ["2026-04-05", "Húsvétvasárnap", "Húsvétvasárnap"],
  ["2026-04-06", "Húsvéthétfő", null],
  ["2026-04-19", "Húsvét 3. vasárnapja", "Húsvét 3. vasárnapja"],
  ["2026-05-14", "Urunk mennybemenetele (Áldozócsütörtök)", null],
  ["2026-05-17", "Húsvét 7. vasárnapja", "Húsvét 7. vasárnapja"],
  ["2026-05-24", "Pünkösdvasárnap", "Pünkösdvasárnap"],
  ["2026-05-25", "Pünkösdhétfő", null],
  ["2026-05-31", "Szentháromság vasárnapja", "Szentháromság vasárnapja"],
  [
    "2026-06-07",
    "Krisztus Szent Teste és Vére (Úrnapja)",
    "Krisztus Szent Teste és Vére (Úrnapja)",
  ],
  ["2026-06-12", "Jézus Szentséges Szíve", null],
  ["2026-06-14", "Évközi 11. vasárnap", "Évközi 11. vasárnap"],
  ["2026-08-15", "Szűz Mária mennybevétele (Nagyboldogasszony)", null],
  ["2026-08-20", "Szent István király, Magyarország fővédőszentje", null],
  ["2026-11-01", "Mindenszentek", "Évközi 31. vasárnap"],
  ["2026-11-15", "Évközi 33. vasárnap", "Évközi 33. vasárnap"],
  ["2026-11-17", null, null],
  ["2026-11-22", "Krisztus Király", "Krisztus Király"],
  ["2026-11-29", "Advent 1. vasárnapja", "Advent 1. vasárnapja"],
  ["2026-12-08", "A Boldogságos Szűz Mária szeplőtelen fogantatása", null],
  ["2026-12-24", "Szenteste", null],
  // Sundays displaced by feasts of the Lord / solemnities.
  ["2025-02-02", "Urunk bemutatása (Gyertyaszentelő Boldogasszony)", "Évközi 4. vasárnap"],
  ["2025-11-02", "Halottak napja (Minden megholt hívek emléknapja)", "Évközi 31. vasárnap"],
  // Advent Sunday outranks Christmas Eve and Immaculate Conception (transferred to Monday).
  ["2023-12-24", "Advent 4. vasárnapja", "Advent 4. vasárnapja"],
  ["2024-12-08", "Advent 2. vasárnapja", "Advent 2. vasárnapja"],
  ["2024-12-09", "A Boldogságos Szűz Mária szeplőtelen fogantatása", null],
  // Szent József on a Lent Sunday → Monday.
  ["2023-03-19", "Nagyböjt 4. vasárnapja", "Nagyböjt 4. vasárnapja"],
  ["2023-03-20", "Szent József, a Boldogságos Szűz Mária jegyese", null],
  // 2008: Szent József in Holy Week → Saturday before Palm Sunday; Annunciation in the
  // Easter octave → Monday after the 2nd Sunday of Easter.
  ["2008-03-15", "Szent József, a Boldogságos Szűz Mária jegyese", null],
  ["2008-03-19", "Nagyszerda", null],
  ["2008-03-25", null, null],
  ["2008-03-31", "Urunk születésének hírüladása (Gyümölcsoltó Boldogasszony)", null],
  // 2022: Jézus Szíve on Jun 24 → Keresztelő Szent János on Jun 23.
  ["2022-06-23", "Keresztelő Szent János születése", null],
  ["2022-06-24", "Jézus Szentséges Szíve", null],
  // 2057 (Easter Apr 22): Úrnapja on Jun 24 and Jézus Szíve on Jun 29 push both fixed
  // solemnities to the previous day; Annunciation on a Lent Sunday → Monday.
  ["2057-06-23", "Keresztelő Szent János születése", null],
  [
    "2057-06-24",
    "Krisztus Szent Teste és Vére (Úrnapja)",
    "Krisztus Szent Teste és Vére (Úrnapja)",
  ],
  ["2057-06-28", "Szent Péter és Szent Pál apostolok", null],
  ["2057-06-29", "Jézus Szentséges Szíve", null],
  ["2057-03-25", "Nagyböjt 3. vasárnapja", "Nagyböjt 3. vasárnapja"],
  ["2057-03-26", "Urunk születésének hírüladása (Gyümölcsoltó Boldogasszony)", null],
  // Christmas on a Sunday → Szent Család on Friday Dec 30; Újév on Sunday.
  ["2022-12-25", "Karácsony, Urunk születése", "Karácsony, Urunk születése"],
  ["2022-12-30", "A Szent Család ünnepe", null],
  ["2023-01-01", "Szűz Mária, Isten Anyja", "Szűz Mária, Isten Anyja"],
  // Dec 26 on a Sunday → Szent Család outranks Szent István első vértanú.
  ["2027-12-26", "A Szent Család ünnepe", "A Szent Család ünnepe"],
  ["2026-12-26", "Szent István első vértanú", null],
];

const PROTESTANT_REFERENCE: readonly Row[] = [
  ["2025-11-30", "Advent 1. vasárnapja", "Advent 1. vasárnapja"],
  ["2025-12-24", "Szenteste", null],
  ["2025-12-25", "Karácsony ünnepe", null],
  ["2025-12-26", "Karácsony 2. napja", null],
  ["2025-12-28", "Karácsony utáni vasárnap", "Karácsony utáni vasárnap"],
  ["2026-01-01", "Újév", null],
  ["2026-01-04", "Újév utáni vasárnap", "Újév utáni vasárnap"],
  ["2026-01-06", "Vízkereszt ünnepe", null],
  ["2026-01-11", "Vízkereszt utáni 1. vasárnap", "Vízkereszt utáni 1. vasárnap"],
  ["2026-01-25", "Vízkereszt utáni 3. vasárnap", "Vízkereszt utáni 3. vasárnap"],
  ["2026-02-01", "Hetvened vasárnap (Septuagesimae)", "Hetvened vasárnap (Septuagesimae)"],
  ["2026-02-08", "Hatvanad vasárnap (Sexagesimae)", "Hatvanad vasárnap (Sexagesimae)"],
  ["2026-02-15", "Ötvened vasárnap (Esto mihi)", "Ötvened vasárnap (Esto mihi)"],
  ["2026-02-18", "Hamvazószerda", null],
  ["2026-02-22", "Böjt 1. vasárnapja (Invocavit)", "Böjt 1. vasárnapja (Invocavit)"],
  ["2026-03-01", "Böjt 2. vasárnapja (Reminiscere)", "Böjt 2. vasárnapja (Reminiscere)"],
  ["2026-03-08", "Böjt 3. vasárnapja (Oculi)", "Böjt 3. vasárnapja (Oculi)"],
  ["2026-03-15", "Böjt 4. vasárnapja (Laetare)", "Böjt 4. vasárnapja (Laetare)"],
  ["2026-03-22", "Böjt 5. vasárnapja (Judica)", "Böjt 5. vasárnapja (Judica)"],
  ["2026-03-29", "Virágvasárnap (Palmarum)", "Virágvasárnap (Palmarum)"],
  ["2026-04-02", "Nagycsütörtök", null],
  ["2026-04-03", "Nagypéntek", null],
  ["2026-04-04", "Nagyszombat", null],
  ["2026-04-05", "Húsvétvasárnap", "Húsvétvasárnap"],
  ["2026-04-06", "Húsvéthétfő", null],
  [
    "2026-04-12",
    "Húsvét utáni 1. vasárnap (Quasimodogeniti)",
    "Húsvét utáni 1. vasárnap (Quasimodogeniti)",
  ],
  ["2026-05-10", "Húsvét utáni 5. vasárnap (Rogate)", "Húsvét utáni 5. vasárnap (Rogate)"],
  ["2026-05-14", "Mennybemenetel ünnepe (Áldozócsütörtök)", null],
  ["2026-05-17", "Húsvét utáni 6. vasárnap (Exaudi)", "Húsvét utáni 6. vasárnap (Exaudi)"],
  ["2026-05-24", "Pünkösdvasárnap", "Pünkösdvasárnap"],
  ["2026-05-25", "Pünkösdhétfő", null],
  ["2026-05-31", "Szentháromság ünnepe", "Szentháromság ünnepe"],
  [
    "2026-06-07",
    "Szentháromság ünnepe utáni 1. vasárnap",
    "Szentháromság ünnepe utáni 1. vasárnap",
  ],
  [
    "2026-11-08",
    "Szentháromság ünnepe utáni 23. vasárnap",
    "Szentháromság ünnepe utáni 23. vasárnap",
  ],
  [
    "2026-11-22",
    "Szentháromság ünnepe utáni 25. vasárnap",
    "Szentháromság ünnepe utáni 25. vasárnap",
  ],
  ["2026-10-31", "Reformáció ünnepe", null],
  ["2026-11-17", null, null],
  // Reformation Day on a Sunday keeps the Sunday's ordinal as sundayName.
  ["2027-10-31", "Reformáció ünnepe", "Szentháromság ünnepe utáni 23. vasárnap"],
  // Karácsony 2. napja on a Sunday.
  ["2027-12-26", "Karácsony 2. napja", "Karácsony utáni vasárnap"],
  // Advent 4 on Christmas Eve.
  ["2023-12-24", "Advent 4. vasárnapja", "Advent 4. vasárnapja"],
  // Early Easter (2008-03-23): 27 Sundays after Trinity, Septuagesima on Jan 20.
  [
    "2008-11-23",
    "Szentháromság ünnepe utáni 27. vasárnap",
    "Szentháromság ünnepe utáni 27. vasárnap",
  ],
  ["2008-01-13", "Vízkereszt utáni 1. vasárnap", "Vízkereszt utáni 1. vasárnap"],
  ["2008-01-20", "Hetvened vasárnap (Septuagesimae)", "Hetvened vasárnap (Septuagesimae)"],
];

function checkReference(family: LiturgicalFamily, rows: readonly Row[]) {
  for (const [date, name, sunday] of rows) {
    const day = liturgicalDay(date, family);
    expect({ date, name: day.name, sundayName: day.sundayName }).toEqual({
      date,
      name,
      sundayName: sunday,
    });
    expect(sundayName(date, family)).toBe(sunday);
  }
}

describe("liturgicalDay — catholic", () => {
  it(`names ${CATHOLIC_REFERENCE.length} reference dates correctly`, () => {
    checkReference("catholic", CATHOLIC_REFERENCE);
  });

  it("returns the full structure for an Ordinary Time Sunday", () => {
    expect(liturgicalDay("2026-11-15", "catholic")).toEqual({
      date: "2026-11-15",
      family: "catholic",
      weekday: 7,
      isSunday: true,
      name: "Évközi 33. vasárnap",
      sundayName: "Évközi 33. vasárnap",
      key: "ordinary-33",
      season: "ordinary",
      seasonName: "Évközi idő",
      week: 33,
      rank: "sunday",
      isSolemnity: false,
      isNotable: false,
      liturgicalYear: 2026,
      lectionaryCycle: "A",
      weekdayCycle: "II",
    });
  });

  it("ranks Krisztus Király as a solemnity in week 34", () => {
    const day = liturgicalDay("2026-11-22", "catholic");
    expect(day).toMatchObject({
      key: "christTheKing",
      rank: "solemnity",
      isSolemnity: true,
      isNotable: true,
      week: 34,
      season: "ordinary",
    });
  });

  it("starts a new liturgical year (and lectionary cycle) on Advent 1", () => {
    expect(liturgicalDay("2026-11-28", "catholic")).toMatchObject({
      liturgicalYear: 2026,
      lectionaryCycle: "A",
      weekdayCycle: "II",
    });
    expect(liturgicalDay("2026-11-29", "catholic")).toMatchObject({
      liturgicalYear: 2027,
      lectionaryCycle: "B",
      weekdayCycle: "I",
      season: "advent",
      week: 1,
    });
    expect(liturgicalDay("2025-06-01", "catholic").lectionaryCycle).toBe("C");
  });

  it("assigns seasons, weeks and ranks", () => {
    const pick = (date: string) => {
      const d = liturgicalDay(date, "catholic");
      return [d.season, d.week, d.rank, d.key];
    };
    expect(pick("2025-12-10")).toEqual(["advent", 2, "weekday", null]);
    expect(pick("2025-12-30")).toEqual(["christmas", null, "weekday", null]);
    expect(pick("2026-01-11")).toEqual(["christmas", null, "feast", "baptismOfTheLord"]);
    expect(pick("2026-01-12")).toEqual(["ordinary", 1, "weekday", null]);
    expect(pick("2026-02-17")).toEqual(["ordinary", 6, "weekday", null]);
    expect(pick("2026-02-18")).toEqual(["lent", null, "weekday", "ashWednesday"]);
    expect(pick("2026-02-21")).toEqual(["lent", null, "weekday", null]);
    expect(pick("2026-03-30")).toEqual(["lent", 6, "weekday", "holyMonday"]);
    expect(pick("2026-04-03")).toEqual(["triduum", null, "triduum", "goodFriday"]);
    expect(pick("2026-04-05")).toEqual(["easter", 1, "solemnity", "easterSunday"]);
    expect(pick("2026-04-08")).toEqual(["easter", 1, "weekday", null]);
    expect(pick("2026-05-24")).toEqual(["easter", null, "solemnity", "pentecostSunday"]);
    expect(pick("2026-05-25")).toEqual(["ordinary", 8, "memorial", "pentecostMonday"]);
    expect(pick("2026-06-14")).toEqual(["ordinary", 11, "sunday", "ordinary-11"]);
    expect(pick("2026-11-01")).toEqual(["ordinary", 31, "solemnity", "allSaints"]);
    expect(pick("2026-12-26")).toEqual(["christmas", null, "feast", "stStephenProtomartyr"]);
  });

  it("flags notable days", () => {
    expect(liturgicalDay("2026-02-18", "catholic").isNotable).toBe(true); // Hamvazószerda
    expect(liturgicalDay("2026-03-29", "catholic").isNotable).toBe(true); // Virágvasárnap
    expect(liturgicalDay("2026-03-30", "catholic").isNotable).toBe(false); // Nagyhétfő
    expect(liturgicalDay("2026-12-24", "catholic").isNotable).toBe(true); // Szenteste
    expect(liturgicalDay("2026-11-29", "catholic").isNotable).toBe(false); // Advent 1
  });
});

describe("liturgicalDay — protestant", () => {
  it(`names ${PROTESTANT_REFERENCE.length} reference dates correctly`, () => {
    checkReference("protestant", PROTESTANT_REFERENCE);
  });

  it("returns the full structure for a Sunday after Trinity", () => {
    expect(liturgicalDay("2026-11-08", "protestant")).toEqual({
      date: "2026-11-08",
      family: "protestant",
      weekday: 7,
      isSunday: true,
      name: "Szentháromság ünnepe utáni 23. vasárnap",
      sundayName: "Szentháromság ünnepe utáni 23. vasárnap",
      key: "trinity-23",
      season: "trinity",
      seasonName: "Szentháromság ünnepe utáni idő",
      week: 23,
      rank: "sunday",
      isSolemnity: false,
      isNotable: false,
      liturgicalYear: 2026,
      lectionaryCycle: null,
      weekdayCycle: null,
    });
  });

  it("assigns seasons, weeks and ranks", () => {
    const pick = (date: string) => {
      const d = liturgicalDay(date, "protestant");
      return [d.season, d.week, d.rank, d.key];
    };
    expect(pick("2025-12-02")).toEqual(["advent", 1, "weekday", null]);
    expect(pick("2025-12-25")).toEqual(["christmas", null, "solemnity", "christmas"]);
    expect(pick("2026-01-03")).toEqual(["christmas", null, "weekday", null]);
    expect(pick("2026-01-07")).toEqual(["epiphany", null, "weekday", null]);
    expect(pick("2026-01-13")).toEqual(["epiphany", 1, "weekday", null]);
    expect(pick("2026-02-01")).toEqual(["preLent", 1, "sunday", "preLent-1"]);
    expect(pick("2026-02-19")).toEqual(["lent", null, "weekday", null]);
    expect(pick("2026-04-03")).toEqual(["lent", 6, "solemnity", "goodFriday"]);
    expect(pick("2026-04-05")).toEqual(["easter", null, "solemnity", "easterSunday"]);
    expect(pick("2026-05-24")).toEqual(["easter", 7, "solemnity", "pentecostSunday"]);
    expect(pick("2026-05-31")).toEqual(["trinity", null, "feast", "trinitySunday"]);
    expect(pick("2026-06-03")).toEqual(["trinity", null, "weekday", null]);
    expect(pick("2026-06-07")).toEqual(["trinity", 1, "sunday", "trinity-1"]);
    expect(pick("2026-10-31")).toEqual(["trinity", 21, "feast", "reformation"]); // Saturday after the 21st Sunday
  });
});

describe("invariants over 1900–2100", () => {
  for (const family of ["catholic", "protestant"] as const) {
    it(`gives every ${family} Sunday a name and keeps week numbers in range`, () => {
      for (let year = 1900; year <= 2100; year++) {
        let date = `${year}-01-01`;
        while (isoWeekday(date) !== 7) date = addDays(date, 1);
        for (; date <= `${year}-12-31`; date = addDays(date, 7)) {
          const day = liturgicalDay(date, family);
          expect(day.sundayName, date).toBeTruthy();
          expect(day.name, date).toBeTruthy();
          expect(day.sundayName, date).not.toMatch(/null|undefined|NaN/);
          if (family === "catholic" && day.season === "ordinary") {
            expect(day.week, date).toBeGreaterThanOrEqual(2);
            expect(day.week, date).toBeLessThanOrEqual(34);
          }
          if (family === "protestant" && day.season === "trinity" && day.week !== null) {
            expect(day.week, date).toBeLessThanOrEqual(27);
          }
        }
        if (family === "catholic") {
          // The last Sunday before Advent is always Évközi 34. vasárnap / Krisztus Király.
          const ctk = liturgicalDay(moveableFeasts(year).christTheKing, family);
          expect(ctk.week).toBe(34);
          expect(ctk.key).toBe("christTheKing");
        }
      }
    });
  }

  it("keeps catholic Ordinary Time week numbers contiguous after Pentecost", () => {
    for (let year = 1900; year <= 2100; year++) {
      const m = moveableFeasts(year);
      let previous = liturgicalDay(addDays(m.pentecostSunday, 1), "catholic").week as number;
      for (let d = addDays(m.pentecostSunday, 8); d < m.adventSundays[0]; d = addDays(d, 7)) {
        const week = liturgicalDay(d, "catholic").week as number;
        expect(week, d).toBe(previous + 1);
        previous = week;
      }
      expect(previous).toBe(34);
    }
  });
});

describe("feastsInRange", () => {
  it("lists the notable catholic days of Holy Week 2026", () => {
    expect(
      feastsInRange("2026-03-28", "2026-04-06", "catholic").map((d) => [d.date, d.name]),
    ).toEqual([
      ["2026-03-29", "Virágvasárnap"],
      ["2026-04-02", "Nagycsütörtök"],
      ["2026-04-03", "Nagypéntek"],
      ["2026-04-04", "Nagyszombat"],
      ["2026-04-05", "Húsvétvasárnap"],
      ["2026-04-06", "Húsvéthétfő"],
    ]);
  });

  it("lists the notable protestant days around Christmas 2026", () => {
    expect(
      feastsInRange("2026-12-20", "2027-01-06", "protestant").map((d) => [d.date, d.name]),
    ).toEqual([
      ["2026-12-24", "Szenteste"],
      ["2026-12-25", "Karácsony ünnepe"],
      ["2026-12-26", "Karácsony 2. napja"],
      ["2027-01-01", "Újév"],
      ["2027-01-06", "Vízkereszt ünnepe"],
    ]);
  });

  it("handles single-day and maximal ranges", () => {
    expect(feastsInRange("2026-11-01", "2026-11-01", "catholic")).toHaveLength(1);
    expect(feastsInRange("2026-11-03", "2026-11-03", "catholic")).toEqual([]);
    const lastDay = addDays("2026-01-01", MAX_RANGE_DAYS - 1);
    expect(feastsInRange("2026-01-01", lastDay, "protestant").length).toBeGreaterThan(20);
  });

  it("rejects reversed or too long ranges and unknown families", () => {
    expect(() => feastsInRange("2026-02-01", "2026-01-01", "catholic")).toThrow(RangeError);
    expect(() =>
      feastsInRange("2026-01-01", addDays("2026-01-01", MAX_RANGE_DAYS), "catholic"),
    ).toThrow(RangeError);
    expect(() => feastsInRange("2026-01-01", "2026-01-02", "orthodox" as LiturgicalFamily)).toThrow(
      RangeError,
    );
  });
});

describe("input validation", () => {
  it("rejects invalid dates and families", () => {
    expect(() => liturgicalDay("2026-02-30", "catholic")).toThrow(RangeError);
    expect(() => liturgicalDay("2026-11-15", "anglican" as LiturgicalFamily)).toThrow(RangeError);
    expect(() => sundayName("15/11/2026", "protestant")).toThrow(RangeError);
  });
});
