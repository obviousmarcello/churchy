import { describe, expect, it } from "vitest";
import type { Location, ScheduleData } from "@churchy/contracts";
import {
  capitalize,
  exceptionBadge,
  firstParam,
  languageName,
  parseDateParam,
  periodValidity,
  regularSchedule,
  resolveWeek,
  scheduleHref,
  serviceTypeLabel,
  weekOf,
  weekRangeLabel,
} from "./view";

const T = "t-1";
const stamp = { createdAt: "2026-01-01T00:00:00+01:00", updatedAt: "2026-01-01T00:00:00+01:00" };

function location(id: string, sort: number): Location {
  return {
    id,
    tenantId: T,
    name: `Hely ${id}`,
    slug: `hely-${id}`,
    kind: "templom",
    address: null,
    geo: null,
    openingHours: { weekly: [], exceptions: [] },
    accessibility: {
      wheelchair: false,
      accessibleToilet: false,
      hearingLoop: false,
      parking: false,
      note: null,
    },
    photoMediaId: null,
    sort,
    ...stamp,
  };
}

const rule = (
  id: string,
  periodId: string,
  locationId: string,
  weekday: number,
  time: string,
  extra: Partial<ScheduleData["rules"][number]> = {},
): ScheduleData["rules"][number] => ({
  id,
  tenantId: T,
  periodId,
  locationId,
  weekday,
  nthWeek: null,
  time,
  durationMin: 60,
  serviceType: "szentmise",
  language: "hu",
  title: null,
  note: null,
  livestream: false,
  ...extra,
});

const locations = [location("a", 1), location("b", 2), location("c", 3)];
const data: ScheduleData = {
  periods: [
    {
      id: "rendes",
      tenantId: T,
      name: "Rendes",
      validFrom: null,
      validTo: null,
      yearly: false,
      priority: 0,
    },
    {
      id: "nyari",
      tenantId: T,
      name: "Nyári",
      validFrom: "2026-06-15",
      validTo: "2026-08-31",
      yearly: true,
      priority: 10,
    },
  ],
  rules: [
    rule("a-sun-10", "rendes", "a", 7, "10:00"),
    rule("a-sun-08", "rendes", "a", 7, "08:00"),
    rule("a-wed", "rendes", "a", 3, "07:00"),
    rule("a-summer", "nyari", "a", 7, "09:00"),
    rule("b-sun", "rendes", "b", 7, "11:00", { language: "de" }),
    rule("c-fri", "rendes", "c", 5, "17:00"),
  ],
  exceptions: [
    {
      id: "x-cancel",
      tenantId: T,
      locationId: "a",
      date: "2026-11-18",
      kind: "cancel",
      ruleId: "a-wed",
      time: null,
      serviceType: null,
      note: null,
      reason: "Lelkigyakorlat",
    },
    {
      id: "x-modify",
      tenantId: T,
      locationId: "a",
      date: "2026-11-22",
      kind: "modify",
      ruleId: "a-sun-10",
      time: "09:45",
      serviceType: null,
      note: null,
      reason: "Püspöki látogatás",
    },
    {
      id: "x-add",
      tenantId: T,
      locationId: "c",
      date: "2026-11-19",
      kind: "add",
      ruleId: null,
      time: "18:00",
      serviceType: "szentmise",
      note: null,
      reason: "Búcsú",
    },
  ],
};

describe("parseDateParam", () => {
  it("is empty without a value", () => {
    expect(parseDateParam(undefined)).toEqual({ kind: "none" });
    expect(parseDateParam("  ")).toEqual({ kind: "none" });
  });

  it("accepts the canonical ISO date", () => {
    expect(parseDateParam("2026-12-24")).toEqual({
      kind: "date",
      date: "2026-12-24",
      canonical: true,
    });
    expect(parseDateParam(["2026-12-24", "2027-01-01"])).toMatchObject({ date: "2026-12-24" });
  });

  it("accepts the Hungarian way of typing a date (not canonical → redirect)", () => {
    for (const raw of ["2026. 12. 24.", "2026.12.24", "2026. 12. 24", "2026/12/24", "2026-12-4"]) {
      const parsed = parseDateParam(raw);
      expect(parsed.kind, raw).toBe("date");
      expect(parsed.kind === "date" && parsed.canonical, raw).toBe(false);
    }
    expect(parseDateParam("2026-1-5")).toEqual({
      kind: "date",
      date: "2026-01-05",
      canonical: false,
    });
  });

  it("rejects non-dates and impossible dates", () => {
    for (const raw of [
      "holnap",
      "24.12.2026",
      "2026-02-30",
      "2026-13-01",
      "1850-01-01",
      "2026-00-10",
    ]) {
      expect(parseDateParam(raw), raw).toEqual({ kind: "invalid", raw });
    }
  });
});

describe("URL state", () => {
  it("builds shareable links and leaves defaults out", () => {
    expect(scheduleHref("/miserend", {})).toBe("/miserend");
    expect(scheduleHref("/miserend", { date: "2026-11-16" })).toBe("/miserend?datum=2026-11-16");
    expect(scheduleHref("/miserend", { date: null, location: "kapolna" })).toBe(
      "/miserend?hely=kapolna",
    );
    expect(scheduleHref("/istentiszteleti-rend", { date: "2026-11-16", location: "x" })).toBe(
      "/istentiszteleti-rend?datum=2026-11-16&hely=x",
    );
  });

  it("reads the first value of a parameter", () => {
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam("")).toBeUndefined();
    expect(firstParam(["a", "b"])).toBe("a");
  });
});

describe("weekOf", () => {
  it("starts on Monday and links the neighbouring weeks", () => {
    expect(weekOf("2026-11-14", "2026-11-14")).toEqual({
      monday: "2026-11-09",
      sunday: "2026-11-15",
      previous: "2026-11-02",
      next: "2026-11-16",
      isCurrentWeek: true,
    });
    // A Sunday belongs to the week that started on the Monday before.
    expect(weekOf("2026-11-15", "2026-11-16")).toMatchObject({
      monday: "2026-11-09",
      isCurrentWeek: false,
    });
  });

  it("crosses month and year boundaries", () => {
    expect(weekOf("2027-01-01", "2026-11-14")).toMatchObject({
      monday: "2026-12-28",
      sunday: "2027-01-03",
    });
  });

  it("labels the week with its year", () => {
    expect(weekRangeLabel(weekOf("2026-11-12", "2026-11-12"))).toBe("2026. nov. 9–15.");
    expect(weekRangeLabel(weekOf("2026-12-01", "2026-12-01"))).toBe("2026. nov. 30. – dec. 6.");
    expect(weekRangeLabel(weekOf("2027-01-01", "2027-01-01"))).toBe(
      "2026. dec. 28. – 2027. jan. 3.",
    );
  });
});

describe("resolveWeek (real schedule engine)", () => {
  it("returns 7 days with cancelled services kept and every exception status", () => {
    const days = resolveWeek({ locations, data }, weekOf("2026-11-16", "2026-11-14"));
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    const services = days.flatMap((d) => d.services);
    const status = (id: string) => services.find((s) => s.id === id)?.status;
    expect(status("r:a-wed:2026-11-18")).toBe("cancelled");
    expect(status("r:a-sun-10:2026-11-22")).toBe("modified");
    expect(status("x:x-add")).toBe("added");
    expect(status("r:a-sun-08:2026-11-22")).toBe("regular");
    // Sorted by time within the day.
    expect(days[6]!.services.map((s) => s.time)).toEqual(["08:00", "09:45", "11:00"]);
  });

  it("filters by location and passes the feast context through", () => {
    const days = resolveWeek({ locations, data }, weekOf("2026-11-16", "2026-11-14"), {
      locationIds: ["b"],
      dayContext: (date) => (date === "2026-11-22" ? { liturgicalDayName: "Krisztus Király" } : {}),
    });
    const services = days.flatMap((d) => d.services);
    expect(services.map((s) => s.locationId)).toEqual(["b"]);
    expect(services[0]!.language).toBe("de");
    expect(days[6]!.dayContext).toEqual({ liturgicalDayName: "Krisztus Király" });
  });

  it("uses the summer period in summer (Europe/Budapest dates)", () => {
    const days = resolveWeek({ locations, data }, weekOf("2026-07-12", "2026-11-14"), {
      locationIds: ["a"],
    });
    expect(days.flatMap((d) => d.services).map((s) => s.ruleId)).toEqual(["a-summer"]);
  });

  it("maps statuses to badges", () => {
    expect(exceptionBadge("regular")).toBeNull();
    expect(exceptionBadge("cancelled")).toBe("cancelled");
    expect(exceptionBadge("modified")).toBe("modified");
    expect(exceptionBadge("added")).toBe("added");
  });
});

describe("regularSchedule", () => {
  it("groups rules per location and period, weekdays Monday first, rules by time", () => {
    const regular = regularSchedule(locations, data, "2026-11-14");
    expect(regular.map((r) => r.location.id)).toEqual(["a", "b", "c"]);
    const a = regular[0]!;
    expect(a.periods.map((p) => [p.period.id, p.current])).toEqual([
      ["rendes", true],
      ["nyari", false],
    ]);
    expect(a.periods[0]!.rows.map((r) => r.weekday)).toEqual([3, 7]);
    expect(a.periods[0]!.rows[1]!.rules.map((r) => r.time)).toEqual(["08:00", "10:00"]);
    // A location without summer rules keeps only its regular period.
    expect(regular[1]!.periods.map((p) => p.period.id)).toEqual(["rendes"]);
  });

  it("marks the summer period as current in summer", () => {
    const [a] = regularSchedule(locations, data, "2026-07-01");
    expect(a!.periods.map((p) => p.current)).toEqual([false, true]);
  });

  it("describes validity", () => {
    const base = data.periods[0]!;
    expect(periodValidity(base)).toEqual({ kind: "always" });
    expect(periodValidity(data.periods[1]!)).toEqual({
      kind: "yearly",
      from: "2026-06-15",
      to: "2026-08-31",
    });
    expect(periodValidity({ ...base, validFrom: "2026-09-01", validTo: "2027-06-14" })).toEqual({
      kind: "range",
      from: "2026-09-01",
      to: "2027-06-14",
    });
    expect(periodValidity({ ...base, validFrom: "2026-09-01" })).toEqual({
      kind: "from",
      from: "2026-09-01",
    });
    expect(periodValidity({ ...base, validTo: "2027-06-14" })).toEqual({
      kind: "until",
      to: "2027-06-14",
    });
  });
});

describe("labels", () => {
  const presetTypes = [
    { key: "szentmise", forms: { nom: "Szentmise", lower: "szentmise" } },
    { key: "szentsegimadas", forms: { nom: "Szentségimádás", lower: "szentségimádás" } },
  ];

  it("names service types from the preset, else shows the stored wording", () => {
    expect(serviceTypeLabel("szentmise", presetTypes)).toBe("Szentmise");
    expect(serviceTypeLabel("szentségimádás", presetTypes)).toBe("Szentségimádás");
    expect(serviceTypeLabel("Szentségimádás", presetTypes)).toBe("Szentségimádás");
    expect(serviceTypeLabel("családi szentmise", presetTypes)).toBe("Családi szentmise");
    expect(serviceTypeLabel("istentisztelet", [])).toBe("Istentisztelet");
  });

  it("names languages in Hungarian", () => {
    expect(languageName("de")).toBe("német");
    expect(languageName("la")).toBe("latin");
    expect(languageName("not a code!")).toBe("not a code!");
  });

  it("capitalizes Hungarian text", () => {
    expect(capitalize("német nyelvű")).toBe("Német nyelvű");
    expect(capitalize("ünnepi")).toBe("Ünnepi");
    expect(capitalize("")).toBe("");
  });
});
