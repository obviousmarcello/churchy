// A realistic, fictitious 3-location tenant: 2 periods, 25 rules, 20 exceptions.
import type { ScheduleInput, ServiceException, ServiceRule, Weekday } from "../types";
import { exception, location, period, rule } from "./fixtures";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6];

export function benchmarkTenant(): ScheduleInput {
  const rules: ServiceRule[] = [
    // Plébániatemplom, general schedule: 12 weekday + 4 Sunday rules.
    ...WEEKDAYS.map((weekday) =>
      rule(`t-07-${weekday}`, { locationId: "T", weekday, time: "07:00", durationMin: 30 }),
    ),
    ...WEEKDAYS.map((weekday) =>
      rule(`t-18-${weekday}`, { locationId: "T", weekday, time: "18:00", durationMin: 45 }),
    ),
    rule("t-sun-08", { locationId: "T", time: "08:00" }),
    rule("t-sun-10", { locationId: "T", time: "10:00", livestream: true, title: "Családi mise" }),
    rule("t-sun-1130", { locationId: "T", time: "11:30", language: "de", title: "Deutsche Messe" }),
    rule("t-sun-18", { locationId: "T", time: "18:00", note: "Ifjúsági mise" }),
    // Kápolna: Sunday, Wednesday, first Friday.
    rule("k-sun", { locationId: "K", time: "09:00" }),
    rule("k-wed", { locationId: "K", weekday: 3, time: "17:00" }),
    rule("k-1st-fri", {
      locationId: "K",
      weekday: 5,
      nthWeek: 1,
      time: "17:00",
      serviceType: "szentsegimadas",
    }),
    // Filia: Sunday + last Sunday afternoon.
    rule("f-sun", { locationId: "F", time: "11:00" }),
    // Summer schedule for the main church.
    rule("ny-sun-08", { periodId: "nyari", locationId: "T", time: "08:00" }),
    rule("ny-sun-10", { periodId: "nyari", locationId: "T", time: "10:00", livestream: true }),
    rule("ny-sun-19", { periodId: "nyari", locationId: "T", time: "19:00" }),
    rule("ny-wd-19", { periodId: "nyari", locationId: "T", weekday: 3, time: "19:00" }),
  ];
  // One more general rule so there are exactly 25.
  rules.push(
    rule("f-last-sun", { locationId: "F", nthWeek: -1, time: "15:00", serviceType: "litania" }),
  );

  const exceptions: ServiceException[] = [
    exception("e01", { date: "2026-01-01", kind: "modify", locationId: "T", note: "Újév" }),
    exception("e02", { date: "2026-01-06", kind: "add", locationId: "T", time: "10:00" }),
    exception("e03", { date: "2026-03-15", kind: "cancel", locationId: "F" }),
    exception("e04", { date: "2026-03-29", kind: "add", locationId: "T", time: "02:30" }),
    exception("e05", { date: "2026-04-02", kind: "cancel", locationId: "T" }),
    exception("e06", {
      date: "2026-04-02",
      kind: "add",
      locationId: "T",
      time: "18:00",
      serviceType: "nagycsutortok",
    }),
    exception("e07", { date: "2026-04-03", kind: "cancel" }),
    exception("e08", {
      date: "2026-04-03",
      kind: "add",
      locationId: "T",
      time: "15:00",
      serviceType: "nagypentek",
    }),
    exception("e09", {
      date: "2026-04-04",
      kind: "add",
      locationId: "T",
      time: "20:00",
      serviceType: "husveti-vigilia",
    }),
    exception("e10", { date: "2026-05-14", kind: "add", ruleId: "t-sun-10" }),
    exception("e11", { date: "2026-08-20", kind: "modify", ruleId: "t-07-4", time: "09:00" }),
    exception("e12", { date: "2026-10-25", kind: "modify", ruleId: "t-sun-08", time: "02:30" }),
    exception("e13", {
      date: "2026-11-01",
      kind: "add",
      locationId: "F",
      time: "15:00",
      serviceType: "temetoi-litania",
    }),
    exception("e14", {
      date: "2026-11-15",
      kind: "modify",
      ruleId: "t-sun-10",
      time: "08:30",
      reason: "Búcsú",
    }),
    exception("e15", { date: "2026-12-24", kind: "cancel", ruleId: "t-18-4" }),
    exception("e16", {
      date: "2026-12-24",
      kind: "add",
      locationId: "T",
      time: "16:00",
      serviceType: "pasztorjatek",
    }),
    exception("e17", {
      date: "2026-12-24",
      kind: "add",
      locationId: "T",
      time: "23:59",
      serviceType: "ejfeli-mise",
    }),
    exception("e18", { date: "2026-12-25", kind: "cancel", locationId: "K" }),
    exception("e19", {
      date: "2026-12-31",
      kind: "modify",
      ruleId: "t-18-4",
      serviceType: "hálaadás",
    }),
    exception("e20", { date: "2026-12-31", kind: "cancel", ruleId: "t-07-4" }),
  ];

  return {
    locations: [
      { ...location("T", 1), name: "Plébániatemplom" },
      { ...location("K", 2), name: "Szent Anna-kápolna", kind: "kapolna" },
      { ...location("F", 3), name: "Filia", kind: "filia" },
    ],
    periods: [
      period("alt", { name: "Általános" }),
      period("nyari", {
        name: "Nyári miserend",
        yearly: true,
        validFrom: "2000-07-01",
        validTo: "2000-08-31",
        priority: 10,
      }),
    ],
    rules,
    exceptions,
  };
}
