import { describe, expect, it } from "vitest";
import {
  formatRRule,
  formatUtc,
  parseRRule,
  RecurrenceError,
  tryParseRRule,
  untilInstant,
} from "./rrule";

describe("parseRRule", () => {
  it("parses every supported part, with or without the RRULE: prefix", () => {
    expect(parseRRule("RRULE:freq=monthly;interval=2;byday=1FR,-1su;bymonth=3,9;wkst=SU")).toEqual({
      freq: "MONTHLY",
      interval: 2,
      count: null,
      until: null,
      byDay: [
        { weekday: 5, ordinal: 1 },
        { weekday: 7, ordinal: -1 },
      ],
      byMonthDay: [],
      byMonth: [3, 9],
      bySetPos: [],
      wkst: 7,
    });
    expect(parseRRule("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10")).toMatchObject({
      freq: "WEEKLY",
      count: 10,
      byDay: [
        { weekday: 2, ordinal: null },
        { weekday: 4, ordinal: null },
      ],
    });
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=1,-1;BYDAY=MO;BYSETPOS=+1")).toMatchObject({
      byMonthDay: [1, -1],
      bySetPos: [1],
    });
  });

  it("parses the three UNTIL forms", () => {
    expect(parseRRule("FREQ=DAILY;UNTIL=20261231").until).toEqual({
      kind: "date",
      date: { year: 2026, month: 12, day: 31 },
    });
    expect(parseRRule("FREQ=DAILY;UNTIL=20261231T225959Z").until).toEqual({
      kind: "utc",
      ms: Date.parse("2026-12-31T22:59:59Z"),
    });
    expect(parseRRule("FREQ=DAILY;UNTIL=20261231T180000").until).toEqual({
      kind: "local",
      date: { year: 2026, month: 12, day: 31 },
      msOfDay: 18 * 3_600_000,
    });
  });

  it.each([
    ["", "SYNTAX"],
    ["INTERVAL=2", "SYNTAX"],
    ["FREQ=FORTNIGHTLY", "SYNTAX"],
    ["FREQ=HOURLY", "UNSUPPORTED"],
    ["FREQ=DAILY;BYHOUR=9", "UNSUPPORTED"],
    ["FREQ=DAILY;FOO=1", "SYNTAX"],
    ["FREQ=DAILY;FREQ=WEEKLY", "SYNTAX"],
    ["FREQ=DAILY;;", "SYNTAX"],
    ["FREQ=DAILY;INTERVAL=0", "INVALID"],
    ["FREQ=DAILY;COUNT=x", "INVALID"],
    ["FREQ=DAILY;COUNT=2;UNTIL=20261231", "INVALID"],
    ["FREQ=DAILY;UNTIL=2026-12-31", "SYNTAX"],
    ["FREQ=DAILY;UNTIL=20260230", "INVALID"],
    ["FREQ=DAILY;UNTIL=20261231T250000Z", "INVALID"],
    ["FREQ=WEEKLY;BYDAY=XX", "SYNTAX"],
    ["FREQ=WEEKLY;BYDAY=MON", "SYNTAX"],
    ["FREQ=MONTHLY;BYDAY=0FR", "INVALID"],
    ["FREQ=MONTHLY;BYDAY=60FR", "INVALID"],
    ["FREQ=WEEKLY;BYDAY=1FR", "INVALID"],
    ["FREQ=YEARLY;BYDAY=1FR;BYMONTHDAY=1", "UNSUPPORTED"],
    ["FREQ=WEEKLY;BYMONTHDAY=1", "INVALID"],
    ["FREQ=MONTHLY;BYMONTHDAY=32", "INVALID"],
    ["FREQ=MONTHLY;BYMONTHDAY=a", "SYNTAX"],
    ["FREQ=MONTHLY;BYMONTH=-1", "INVALID"],
    ["FREQ=MONTHLY;BYSETPOS=1", "INVALID"],
    ["FREQ=MONTHLY;WKST=XX", "SYNTAX"],
  ])("rejects %j (%s)", (rule, code) => {
    let error: unknown;
    try {
      parseRRule(rule);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecurrenceError);
    expect((error as RecurrenceError).code).toBe(code);
    expect(tryParseRRule(rule)).toBeNull();
  });
});

describe("formatRRule", () => {
  it("writes a canonical rule", () => {
    expect(
      formatRRule(
        parseRRule(
          "BYDAY=1FR,3FR;FREQ=MONTHLY;INTERVAL=2;WKST=SU;BYSETPOS=1;BYMONTHDAY=1;BYMONTH=1",
        ),
      ),
    ).toBe("FREQ=MONTHLY;INTERVAL=2;BYMONTH=1;BYMONTHDAY=1;BYDAY=1FR,3FR;BYSETPOS=1;WKST=SU");
    expect(formatRRule(parseRRule("FREQ=WEEKLY;COUNT=5"))).toBe("FREQ=WEEKLY;COUNT=5");
  });

  it("normalizes UNTIL: UTC for zoned events, DATE for all-day events", () => {
    const date = parseRRule("FREQ=DAILY;UNTIL=20260731");
    expect(formatRRule(date)).toBe("FREQ=DAILY;UNTIL=20260731T215959Z");
    expect(formatRRule(date, { allDay: true })).toBe("FREQ=DAILY;UNTIL=20260731");
    const local = parseRRule("FREQ=DAILY;UNTIL=20261231T180000");
    expect(formatRRule(local)).toBe("FREQ=DAILY;UNTIL=20261231T170000Z");
    expect(formatRRule(local, { allDay: true })).toBe("FREQ=DAILY;UNTIL=20261231");
    const utc = parseRRule("FREQ=DAILY;UNTIL=20261231T233000Z");
    expect(formatRRule(utc)).toBe("FREQ=DAILY;UNTIL=20261231T233000Z");
    // 23:30 UTC is already 1 January in Budapest.
    expect(formatRRule(utc, { allDay: true })).toBe("FREQ=DAILY;UNTIL=20270101");
  });

  it("untilInstant and formatUtc", () => {
    expect(formatUtc(untilInstant({ kind: "date", date: { year: 2026, month: 1, day: 31 } }))).toBe(
      "20260131T225959Z",
    );
    expect(formatUtc(Date.parse("1999-01-02T03:04:05Z"))).toBe("19990102T030405Z");
  });
});
