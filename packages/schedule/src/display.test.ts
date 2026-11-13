import { describe, expect, it } from "vitest";
import { isInProgress, nextServices, upcomingExceptions, type NextService } from "./display";
import { resolve } from "./resolve";
import { exception, rule, scheduleInput } from "./testing/fixtures";
import type { ServiceException } from "./types";

// 2026-11-13 is a Friday.
const weekdayRules = [1, 2, 3, 4, 5, 6].map((wd) =>
  rule(`r07-${wd}`, { weekday: wd as 1, time: "07:00", durationMin: 30 }),
);
const tenant = scheduleInput({
  rules: [
    ...weekdayRules,
    ...[1, 2, 3, 4, 5, 6, 7].map((wd) => rule(`r18-${wd}`, { weekday: wd as 1, time: "18:00" })),
    rule("r10", { time: "10:00", livestream: true }),
    rule("r09", { locationId: "L2", time: "09:00" }),
  ],
});

function view(items: NextService[]): string[] {
  return items.map(
    (s) => `${s.label} ${s.date} ${s.time} ${s.locationId}${s.inProgress ? " LIVE" : ""}`,
  );
}

describe("nextServices", () => {
  it.each<[string, string, string[]]>([
    [
      "morning: rest of today and all of tomorrow",
      "2026-11-13T08:00:00+01:00",
      ["today 2026-11-13 18:00 L1", "tomorrow 2026-11-14 07:00 L1", "tomorrow 2026-11-14 18:00 L1"],
    ],
    [
      "a service starting exactly now is included",
      "2026-11-13T18:00:00+01:00",
      ["today 2026-11-13 18:00 L1", "tomorrow 2026-11-14 07:00 L1", "tomorrow 2026-11-14 18:00 L1"],
    ],
    [
      "late evening: nothing left today",
      "2026-11-13T23:30:00+01:00",
      ["tomorrow 2026-11-14 07:00 L1", "tomorrow 2026-11-14 18:00 L1"],
    ],
    [
      "just after midnight: Saturday becomes today, Sunday tomorrow",
      "2026-11-14T00:10:00+01:00",
      [
        "today 2026-11-14 07:00 L1",
        "today 2026-11-14 18:00 L1",
        "tomorrow 2026-11-15 09:00 L2",
        "tomorrow 2026-11-15 10:00 L1",
        "tomorrow 2026-11-15 18:00 L1",
      ],
    ],
    [
      "`now` in UTC is interpreted in Budapest (23:10Z = 00:10 next day)",
      "2026-11-13T23:10:00Z",
      [
        "today 2026-11-14 07:00 L1",
        "today 2026-11-14 18:00 L1",
        "tomorrow 2026-11-15 09:00 L2",
        "tomorrow 2026-11-15 10:00 L1",
        "tomorrow 2026-11-15 18:00 L1",
      ],
    ],
    [
      "livestreamed service started 30 min ago is in progress; others that started are not shown",
      "2026-11-15T10:30:00+01:00",
      [
        "today 2026-11-15 10:00 L1 LIVE",
        "today 2026-11-15 18:00 L1",
        "tomorrow 2026-11-16 07:00 L1",
        "tomorrow 2026-11-16 18:00 L1",
      ],
    ],
    [
      "in-progress window ends after 60 minutes",
      "2026-11-15T11:00:00+01:00",
      ["today 2026-11-15 18:00 L1", "tomorrow 2026-11-16 07:00 L1", "tomorrow 2026-11-16 18:00 L1"],
    ],
  ])("%s", (_name, now, expected) => {
    expect(view(nextServices(tenant, now))).toEqual(expected);
  });

  it("flags a livestreamed service starting exactly now as in progress", () => {
    const items = nextServices(tenant, "2026-11-15T10:00:00+01:00");
    expect(items[0]).toMatchObject({ time: "10:00", locationId: "L1", inProgress: true });
  });

  describe("days without services (fallback: next 3 within 14 days)", () => {
    const sundayOnly = scheduleInput({ rules: [rule("sun")] });

    it("falls back to the next services, labelled by weekday", () => {
      // Thursday noon: nothing today or tomorrow; Sundays Nov 15 and 22 are within 14 days (≤ Nov 26).
      expect(view(nextServices(sundayOnly, "2026-11-12T12:00:00+01:00"))).toEqual([
        "weekday 2026-11-15 10:00 L1",
        "weekday 2026-11-22 10:00 L1",
      ]);
    });

    it("falls back after the last service of tomorrow has passed", () => {
      // Sunday 11:00: today's 10:00 is over, Monday has nothing → next Sundays.
      expect(view(nextServices(sundayOnly, "2026-11-15T11:00:00+01:00"))).toEqual([
        "weekday 2026-11-22 10:00 L1",
        "weekday 2026-11-29 10:00 L1",
      ]);
    });

    it("returns at most 3 services", () => {
      const three = scheduleInput({
        rules: [rule("a", { time: "08:00" }), rule("b"), rule("c", { time: "18:00" })],
      });
      expect(view(nextServices(three, "2026-11-12T12:00:00+01:00"))).toEqual([
        "weekday 2026-11-15 08:00 L1",
        "weekday 2026-11-15 10:00 L1",
        "weekday 2026-11-15 18:00 L1",
      ]);
    });

    it("returns nothing when no service falls within 14 days", () => {
      const monthly = scheduleInput({ rules: [rule("first-sun", { nthWeek: 1 })] });
      expect(nextServices(monthly, "2026-11-02T12:00:00+01:00")).toEqual([]);
      expect(nextServices(scheduleInput(), "2026-11-02T12:00:00+01:00")).toEqual([]);
    });
  });

  it("skips cancelled services and shows modified ones", () => {
    const withExceptions = scheduleInput({
      ...tenant,
      exceptions: [
        exception("c", { date: "2026-11-13", kind: "cancel", ruleId: "r18-5" }),
        exception("m", { date: "2026-11-14", kind: "modify", ruleId: "r07-6", time: "08:00" }),
      ],
    });
    const items = nextServices(withExceptions, "2026-11-13T08:00:00+01:00");
    expect(view(items)).toEqual(["tomorrow 2026-11-14 08:00 L1", "tomorrow 2026-11-14 18:00 L1"]);
    expect(items[0]).toMatchObject({ status: "modified", original: { time: "07:00" } });
  });

  it("honours the location filter and day context", () => {
    const items = nextServices(tenant, "2026-11-14T08:00:00+01:00", {
      locationIds: ["L2"],
      dayContext: (d) => (d === "2026-11-15" ? { liturgicalDayName: "Évközi 33. vasárnap" } : {}),
    });
    expect(view(items)).toEqual(["tomorrow 2026-11-15 09:00 L2"]);
    expect(items[0]?.dayContext).toEqual({ liturgicalDayName: "Évközi 33. vasárnap" });
  });

  it("rejects a `now` without offset", () => {
    expect(() => nextServices(tenant, "2026-11-13T08:00:00")).toThrow(
      expect.objectContaining({ code: "INVALID_DATETIME" }),
    );
  });
});

describe("isInProgress", () => {
  const [live] = resolve(tenant, "2026-11-15", "2026-11-15").filter((s) => s.livestream);

  it.each<[string, boolean]>([
    ["2026-11-15T09:59:59+01:00", false],
    ["2026-11-15T10:00:00+01:00", true],
    ["2026-11-15T10:59:59+01:00", true],
    ["2026-11-15T11:00:00+01:00", false],
  ])("at %s → %s", (now, expected) => {
    expect(isInProgress(live!, now)).toBe(expected);
  });

  it("is false for cancelled or non-livestreamed services", () => {
    const cancelledInput = scheduleInput({
      ...tenant,
      exceptions: [exception("c", { date: "2026-11-15", kind: "cancel", ruleId: "r10" })],
    });
    const services = resolve(cancelledInput, "2026-11-15", "2026-11-15", {
      includeCancelled: true,
    });
    const cancelled = services.find((s) => s.ruleId === "r10")!;
    const plain = services.find((s) => s.ruleId === "r09")!;
    expect(cancelled.status).toBe("cancelled");
    expect(isInProgress(cancelled, "2026-11-15T10:10:00+01:00")).toBe(false);
    expect(isInProgress(plain, "2026-11-15T09:10:00+01:00")).toBe(false);
  });
});

describe("upcomingExceptions", () => {
  const exceptions: ServiceException[] = [
    exception("yesterday", { date: "2026-11-12", kind: "cancel" }),
    exception("add-sun", { date: "2026-11-15", kind: "add", locationId: "L2", time: "15:00" }),
    exception("move-sun", {
      date: "2026-11-15",
      kind: "modify",
      ruleId: "r10",
      time: "08:30",
      reason: "Búcsú",
    }),
    exception("noop", { date: "2026-11-15", kind: "cancel", ruleId: "r07-1" }),
    exception("sat-off", {
      date: "2026-11-14",
      kind: "cancel",
      locationId: "L1",
      reason: "Felújítás",
    }),
    exception("fri-off", { date: "2026-11-13", kind: "cancel", ruleId: "r18-5" }),
    exception("beyond", { date: "2026-11-20", kind: "cancel" }),
  ];
  const input = scheduleInput({ ...tenant, exceptions });
  const NOW = "2026-11-13T20:00:00+01:00";

  it("lists exceptions with an effect from today for `days` days, sorted", () => {
    const items = upcomingExceptions(input, NOW, 7);
    expect(items.map((e) => [e.exception.id, e.kind, e.date])).toEqual([
      ["fri-off", "cancel", "2026-11-13"],
      ["sat-off", "cancel", "2026-11-14"],
      ["move-sun", "modify", "2026-11-15"],
      ["add-sun", "add", "2026-11-15"],
    ]);
    expect(items[1]?.services.map((s) => `${s.time} ${s.status} ${s.reason}`)).toEqual([
      "07:00 cancelled Felújítás",
      "18:00 cancelled Felújítás",
    ]);
    expect(items[2]?.services).toEqual([
      expect.objectContaining({
        time: "08:30",
        status: "modified",
        original: { time: "10:00", serviceType: "szentmise", note: null },
      }),
    ]);
    expect(items[3]?.services).toEqual([
      expect.objectContaining({ id: "x:add-sun", status: "added", locationId: "L2" }),
    ]);
  });

  it("includes the last day of the window and excludes the day after", () => {
    expect(upcomingExceptions(input, NOW, 8).map((e) => e.exception.id)).toContain("beyond");
    expect(upcomingExceptions(input, NOW, 1).map((e) => e.exception.id)).toEqual(["fri-off"]);
  });

  it("honours the location filter", () => {
    expect(
      upcomingExceptions(input, NOW, 7, { locationIds: ["L2"] }).map((e) => e.exception.id),
    ).toEqual(["add-sun"]);
  });

  it("orders same-day exceptions by location sort, then id", () => {
    const sameTime = scheduleInput({
      ...tenant,
      exceptions: [
        exception("z", { date: "2026-11-15", kind: "add", locationId: "L1", time: "12:00" }),
        exception("y", { date: "2026-11-15", kind: "add", locationId: "L2", time: "12:00" }),
        exception("x", { date: "2026-11-15", kind: "add", locationId: "L1", time: "12:00" }),
      ],
    });
    expect(upcomingExceptions(sameTime, NOW, 7).map((e) => e.exception.id)).toEqual([
      "x",
      "z",
      "y",
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects days = %s", (days) => {
    expect(() => upcomingExceptions(input, NOW, days)).toThrow(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
  });
});
