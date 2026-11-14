import { describe, expect, it } from "vitest";
import { parseRRule } from "./rrule";
import { dayOfMonthOn, describeRecurrence } from "./text";

// 2026-11-06 is a Friday; 2026-03-15 a Sunday.
const FRIDAY_18 = "2026-11-06T18:00:00+01:00";
const TUESDAY_9 = "2026-11-03T09:30:00+01:00";
const MARCH_15 = "2026-03-15T10:00:00+01:00";

/** D-15 AC2: ≥ 15 rule patterns with their expected Hungarian text. */
const PATTERNS: [rule: string, start: string | undefined, expected: string][] = [
  // daily
  ["FREQ=DAILY", undefined, "minden nap"],
  ["FREQ=DAILY;INTERVAL=2", undefined, "kétnaponta"],
  ["FREQ=DAILY;INTERVAL=15", undefined, "15 naponta"],
  ["FREQ=DAILY;BYDAY=MO,WE", undefined, "minden hétfőn és szerdán"],
  ["FREQ=DAILY;BYMONTH=7,8", undefined, "júliusban és augusztusban minden nap"],
  // weekly
  ["FREQ=WEEKLY", TUESDAY_9, "minden kedden"],
  ["FREQ=WEEKLY", undefined, "minden héten"],
  ["FREQ=WEEKLY;BYDAY=TU,TH", undefined, "minden kedden és csütörtökön"],
  ["FREQ=WEEKLY;BYDAY=FR,MO,WE", undefined, "minden hétfőn, szerdán és pénteken"],
  ["FREQ=WEEKLY;BYDAY=SA,SU", undefined, "minden szombaton és vasárnap"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", undefined, "minden hétköznap"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU", undefined, "minden nap"],
  ["FREQ=WEEKLY;INTERVAL=2", TUESDAY_9, "kéthetente kedden"],
  ["FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH", undefined, "háromhetente kedden és csütörtökön"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR", undefined, "kéthetente, hétköznapokon"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR,SA,SU", undefined, "kéthetente, minden nap"],
  ["FREQ=WEEKLY;INTERVAL=4", undefined, "négyhetente"],
  ["FREQ=WEEKLY;BYDAY=SU;BYMONTH=7,8", undefined, "júliusban és augusztusban minden vasárnap"],
  // monthly — nth weekday
  ["FREQ=MONTHLY;BYDAY=1FR", undefined, "minden hónap első péntekén"],
  ["FREQ=MONTHLY;BYDAY=-1SU", undefined, "minden hónap utolsó vasárnapján"],
  ["FREQ=MONTHLY;BYDAY=2WE", undefined, "minden hónap második szerdáján"],
  ["FREQ=MONTHLY;BYDAY=-1TU", undefined, "minden hónap utolsó keddjén"],
  ["FREQ=MONTHLY;BYDAY=-2SU", undefined, "minden hónap utolsó előtti vasárnapján"],
  ["FREQ=MONTHLY;BYDAY=1FR,3FR", undefined, "minden hónap első és harmadik péntekén"],
  ["FREQ=MONTHLY;BYDAY=1SA,4TH", undefined, "minden hónap első szombatján és negyedik csütörtökén"],
  [
    "FREQ=MONTHLY;BYDAY=5MO,-3TH",
    undefined,
    "minden hónap ötödik hétfőjén és hátulról 3. csütörtökén",
  ],
  ["FREQ=MONTHLY;BYDAY=6MO", undefined, "minden hónap 6. hétfőjén"],
  ["FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO", undefined, "kéthavonta, a hónap első hétfőjén"],
  ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", undefined, "minden hónap utolsó hétköznapján"],
  ["FREQ=MONTHLY;BYDAY=SA;BYSETPOS=1", undefined, "minden hónap első szombatján"],
  ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYSETPOS=-1", undefined, "minden hónap utolsó napján"],
  ["FREQ=MONTHLY;BYDAY=FR", undefined, "minden pénteken"],
  ["FREQ=MONTHLY;INTERVAL=3;BYDAY=FR", undefined, "háromhavonta minden pénteken"],
  ["FREQ=MONTHLY;BYDAY=SU;BYMONTH=6", undefined, "júniusban minden vasárnap"],
  [
    "FREQ=MONTHLY;BYDAY=1SU;BYMONTH=6,7,8",
    undefined,
    "június, július és augusztus első vasárnapján",
  ],
  // monthly — day of month
  ["FREQ=MONTHLY;BYMONTHDAY=15", undefined, "minden hónap 15-én"],
  ["FREQ=MONTHLY;BYMONTHDAY=1,15", undefined, "minden hónap 1-jén és 15-én"],
  ["FREQ=MONTHLY;BYMONTHDAY=-1", undefined, "minden hónap utolsó napján"],
  [
    "FREQ=MONTHLY;BYMONTHDAY=-1,1,-2",
    undefined,
    "minden hónap 1-jén, utolsó előtti napján és utolsó napján",
  ],
  ["FREQ=MONTHLY", FRIDAY_18, "minden hónap 6-án"],
  ["FREQ=MONTHLY", undefined, "minden hónapban"],
  ["FREQ=MONTHLY;INTERVAL=3", undefined, "háromhavonta"],
  ["FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=10", undefined, "háromhavonta, a hónap 10-én"],
  // yearly
  ["FREQ=YEARLY", MARCH_15, "minden évben március 15-én"],
  ["FREQ=YEARLY", undefined, "minden évben"],
  ["FREQ=YEARLY;INTERVAL=2", MARCH_15, "kétévente március 15-én"],
  ["FREQ=YEARLY;BYMONTH=5;BYDAY=1SU", undefined, "minden évben május első vasárnapján"],
  ["FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=23", undefined, "minden évben október 23-án"],
  ["FREQ=YEARLY;BYMONTH=3,9", MARCH_15, "minden évben március és szeptember 15-én"],
  ["FREQ=YEARLY;BYMONTH=8", undefined, "minden évben augusztusban"],
  ["FREQ=YEARLY;BYDAY=-1FR", undefined, "minden év utolsó péntekén"],
  ["FREQ=YEARLY;INTERVAL=2;BYDAY=1SU", undefined, "kétévente, az év első vasárnapján"],
  ["FREQ=YEARLY;BYDAY=SU", undefined, "minden vasárnap"],
  ["FREQ=YEARLY;BYMONTH=12;BYDAY=SU", undefined, "decemberben minden vasárnap"],
  ["FREQ=YEARLY;BYMONTHDAY=1", undefined, "minden hónap 1-jén"],
  // bounds
  ["FREQ=WEEKLY;BYDAY=TU;COUNT=10", undefined, "minden kedden, összesen 10 alkalommal"],
  ["FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231", undefined, "minden kedden, 2026. december 31-ig"],
  [
    "FREQ=MONTHLY;BYDAY=1FR;UNTIL=20270630T215959Z",
    undefined,
    "minden hónap első péntekén, 2027. június 30-ig",
  ],
  ["FREQ=DAILY;UNTIL=20270101T120000", undefined, "minden nap, 2027. január 1-ig"],
];

describe("describeRecurrence — Hungarian rule text (D-15 AC2)", () => {
  it("covers at least 15 distinct rule patterns", () => {
    expect(new Set(PATTERNS.map(([rule]) => rule)).size).toBeGreaterThanOrEqual(15);
  });

  it.each(PATTERNS)("%s → %s", (rule, start, expected) => {
    expect(describeRecurrence(rule, { start })).toBe(expected);
  });

  it("appends the start time and capitalizes (SDD §7.5 example)", () => {
    expect(
      describeRecurrence("FREQ=MONTHLY;BYDAY=1FR", {
        start: FRIDAY_18,
        withTime: true,
        capitalize: true,
      }),
    ).toBe("Minden hónap első péntekén 18:00-kor");
    expect(
      describeRecurrence("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231", {
        start: TUESDAY_9,
        withTime: true,
      }),
    ).toBe("minden kedden 09:30-kor, 2026. december 31-ig");
    // The time is read in Budapest, also across DST.
    expect(
      describeRecurrence("FREQ=WEEKLY", { start: "2026-07-07T16:00:00Z", withTime: true }),
    ).toBe("minden kedden 18:00-kor");
    // No time for all-day series.
    expect(
      describeRecurrence("FREQ=YEARLY", {
        start: "2026-12-24T00:00:00+01:00",
        allDay: true,
        withTime: true,
      }),
    ).toBe("minden évben december 24-én");
  });

  it("accepts a parsed rule", () => {
    expect(describeRecurrence(parseRRule("RRULE:FREQ=WEEKLY;BYDAY=WE"))).toBe("minden szerdán");
  });

  it("returns null for invalid rules and rules without a precise wording", () => {
    for (const rule of [
      "minden kedden",
      "FREQ=HOURLY",
      "FREQ=DAILY;BYSETPOS=1;BYMONTH=1",
      "FREQ=DAILY;BYMONTHDAY=1",
      "FREQ=DAILY;INTERVAL=2;BYDAY=MO",
      "FREQ=WEEKLY;BYDAY=MO,TU;BYSETPOS=1",
      "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13",
      "FREQ=MONTHLY;BYDAY=1FR,SU",
      "FREQ=MONTHLY;BYDAY=MO,WE;BYSETPOS=2",
      "FREQ=MONTHLY;BYDAY=1FR,2FR;BYSETPOS=1",
      "FREQ=MONTHLY;INTERVAL=2;BYDAY=SU;BYMONTH=6",
      "FREQ=MONTHLY;INTERVAL=2;BYDAY=1SU;BYMONTH=6",
      "FREQ=MONTHLY;BYMONTH=6",
      "FREQ=YEARLY;BYDAY=1SU;BYSETPOS=1",
      "FREQ=YEARLY;INTERVAL=2;BYDAY=SU",
      "FREQ=YEARLY;BYDAY=1SU,MO",
      "FREQ=YEARLY;INTERVAL=2;BYMONTHDAY=1",
      "FREQ=YEARLY;INTERVAL=2;BYMONTH=6;BYDAY=SU",
      "FREQ=YEARLY;BYMONTH=6;BYDAY=1SU,MO",
      "FREQ=YEARLY;BYMONTH=6;BYDAY=FR;BYMONTHDAY=13",
    ]) {
      expect(describeRecurrence(rule), rule).toBeNull();
    }
  });
});

describe("dayOfMonthOn", () => {
  it("follows the spoken ordinal", () => {
    const expected = [
      "1-jén",
      "2-án",
      "3-án",
      "4-én",
      "5-én",
      "6-án",
      "7-én",
      "8-án",
      "9-én",
      "10-én",
      "11-én",
      "12-én",
      "13-án",
      "14-én",
      "15-én",
      "16-án",
      "17-én",
      "18-án",
      "19-én",
      "20-án",
      "21-én",
      "22-én",
      "23-án",
      "24-én",
      "25-én",
      "26-án",
      "27-én",
      "28-án",
      "29-én",
      "30-án",
      "31-én",
    ];
    expect(Array.from({ length: 31 }, (_, i) => dayOfMonthOn(i + 1))).toEqual(expected);
  });
});
