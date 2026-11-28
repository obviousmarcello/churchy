import { describe, expect, it } from "vitest";
import type { Location, ScheduleData } from "@churchy/contracts";
import {
  diffServices,
  draftProblems,
  exceptionInputs,
  exceptionProblem,
  holidayExceptions,
  holidayTemplates,
  newDraft,
  previewWeeks,
  resolvePreview,
  ruleToDraft,
  servicesOn,
  withDrafts,
  withExceptions,
  type ExceptionDraft,
} from "./schedule-editor";

const location = {
  id: "loc-1",
  name: "Templom",
  slug: "templom",
  kind: "templom",
  sort: 0,
} as unknown as Location;

const data: ScheduleData = {
  periods: [
    {
      id: "per-1",
      tenantId: "t",
      name: "Általános",
      validFrom: null,
      validTo: null,
      yearly: false,
      priority: 0,
    },
  ],
  rules: [
    {
      id: "rule-1",
      tenantId: "t",
      periodId: "per-1",
      locationId: "loc-1",
      weekday: 7,
      nthWeek: null,
      time: "10:00",
      durationMin: 60,
      serviceType: "szentmise",
      language: "hu",
      title: null,
      note: null,
      livestream: false,
    },
  ],
  exceptions: [],
};

// 2026-11-18 is a Wednesday; the preview starts on Monday 2026-11-16.
const TODAY = "2026-11-18";

describe("previewWeeks", () => {
  it("lists 8 Monday-first weeks from the current one", () => {
    const weeks = previewWeeks(TODAY);
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ monday: "2026-11-16", sunday: "2026-11-22" });
    expect(weeks[7]?.monday).toBe("2027-01-04");
  });
});

describe("rule drafts", () => {
  it("flags a bad time, a missing type and duplicates", () => {
    const a = { ...newDraft(7, { serviceType: "szentmise" }), key: "a", time: "25:00" };
    const b = { ...newDraft(7, { serviceType: "" }), key: "b" };
    const c = { ...newDraft(7, { serviceType: "szentmise" }), key: "c" };
    const d = { ...newDraft(7, { serviceType: "szentmise" }), key: "d" };
    const problems = draftProblems([a, b, c, d]);
    expect(problems.get("a")).toBe("time");
    expect(problems.get("b")).toBe("type");
    expect(problems.has("c")).toBe(false);
    expect(problems.get("d")).toBe("duplicate");
  });

  it("round-trips a stored rule", () => {
    const [rule] = data.rules;
    expect(rule && ruleToDraft(rule).time).toBe("10:00");
  });
});

describe("preview and diff", () => {
  const source = { locations: [location], data };

  it("resolves Sundays with the real engine", () => {
    const days = resolvePreview(source, TODAY);
    const services = days.flatMap((d) => d.services);
    expect(services).toHaveLength(8);
    expect(services[0]?.date).toBe("2026-11-22");
  });

  it("highlights what a new draft adds and what it removes", () => {
    const before = resolvePreview(source, TODAY);
    const rule = data.rules[0];
    if (!rule) throw new Error("fixture");
    const moved = { ...ruleToDraft(rule), time: "11:00" };
    const extra = { ...newDraft(6, { serviceType: "szentmise" }), time: "18:00" };
    const after = resolvePreview(
      { locations: [location], data: withDrafts(data, "per-1", "loc-1", [moved, extra]) },
      TODAY,
    );
    const diff = diffServices(before, after);
    expect(diff.added).toHaveLength(16); // 8 moved Sundays + 8 new Saturdays
    expect(diff.removed).toHaveLength(8); // the 10:00 Sundays
    expect(diffServices(before, before)).toEqual({ added: [], removed: [] });
  });
});

describe("exceptions", () => {
  const source = { locations: [location], data };
  const services = servicesOn(source, "2026-11-22");

  const draft = (patch: Partial<ExceptionDraft>): ExceptionDraft => ({
    action: "cancel",
    date: "2026-11-22",
    selected: services,
    reason: "Búcsú",
    note: "",
    time: "10:00",
    serviceType: "",
    locationId: "loc-1",
    ...patch,
  });

  it("offers the engine's services for the date", () => {
    expect(services).toHaveLength(1);
    expect(services[0]?.ruleId).toBe("rule-1");
  });

  it("builds cancel, modify and add exceptions the engine understands", () => {
    const cancel = exceptionInputs(draft({}));
    expect(cancel).toMatchObject([{ kind: "cancel", ruleId: "rule-1", reason: "Búcsú" }]);
    const gone = resolvePreview(
      { locations: [location], data: withExceptions(data, cancel) },
      TODAY,
    )
      .flatMap((d) => d.services)
      .find((s) => s.date === "2026-11-22");
    expect(gone?.status).toBe("cancelled");

    const modify = exceptionInputs(draft({ action: "modify", time: "9:00".padStart(5, "0") }));
    expect(modify[0]).toMatchObject({ kind: "modify", time: "09:00", serviceType: null });

    const add = exceptionInputs(
      draft({ action: "add", selected: [], time: "18:00", serviceType: "litania" }),
    );
    expect(add[0]).toMatchObject({ kind: "add", locationId: "loc-1", time: "18:00" });
  });

  it("requires a reason, services and valid details", () => {
    expect(exceptionProblem(draft({}))).toBeNull();
    expect(exceptionProblem(draft({ reason: " " }))).toBe("reason");
    expect(exceptionProblem(draft({ selected: [] }))).toBe("services");
    expect(exceptionProblem(draft({ action: "modify", time: "" }))).toBe("time");
    expect(exceptionProblem(draft({ action: "add", selected: [], serviceType: "" }))).toBe("type");
    expect(exceptionProblem(draft({ date: "nem dátum" }))).toBe("date");
  });
});

describe("holiday templates", () => {
  it("covers Holy Week, Christmas and New Year on or after today", () => {
    const [holyWeek, christmas, newYear] = holidayTemplates("2026-11-18");
    expect(holyWeek?.dates).toEqual([
      "2027-03-25",
      "2027-03-26",
      "2027-03-27",
      "2027-03-28",
      "2027-03-29",
    ]);
    expect(christmas?.dates).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
    expect(newYear?.dates).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("makes one cancel-all exception per date", () => {
    const inputs = holidayExceptions(["2026-12-24", "2026-12-25"], " Karácsony ");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({ kind: "cancel", locationId: null, reason: "Karácsony" });
  });
});
