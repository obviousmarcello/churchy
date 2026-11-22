import { describe, expect, it } from "vitest";
import type { Location, ScheduleData } from "@churchy/contracts";
import {
  EXCEPTION_LINES,
  SERVICE_ROWS,
  buildNextServices,
  groupByDate,
  serviceWhen,
} from "./next-services";

describe("serviceWhen", () => {
  const now = new Date("2026-11-18T12:00:00+01:00"); // Wednesday
  it("says ma / holnap, the weekday within a week, else the date", () => {
    expect(serviceWhen({ date: "2026-11-18", time: "18:00" }, now)).toEqual({
      day: "ma",
      time: "18:00",
    });
    expect(serviceWhen({ date: "2026-11-19", time: "07:00" }, now).day).toBe("holnap");
    expect(serviceWhen({ date: "2026-11-22", time: "10:00" }, now).day).toBe("vasárnap");
    expect(serviceWhen({ date: "2026-11-30", time: "10:00" }, now).day).toBe("nov. 30.");
  });
});

const T = "t-1";
const stamp = { createdAt: "2026-01-01T00:00:00+01:00", updatedAt: "2026-01-01T00:00:00+01:00" };

const location = (id: string): Location => ({
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
  sort: 1,
  ...stamp,
});

const rule = (id: string, weekday: number, time: string, livestream = false) => ({
  id,
  tenantId: T,
  periodId: "p",
  locationId: "a",
  weekday,
  nthWeek: null,
  time,
  durationMin: 60,
  serviceType: "szentmise",
  language: "hu",
  title: null,
  note: null,
  livestream,
});

// 2026-11-18 is a Wednesday, 2026-11-19 Thursday.
const data: ScheduleData = {
  periods: [
    {
      id: "p",
      tenantId: T,
      name: "Rendes",
      validFrom: null,
      validTo: null,
      yearly: false,
      priority: 0,
    },
  ],
  rules: [rule("wed", 3, "18:00", true), rule("thu", 4, "07:00"), rule("sun", 7, "10:00")],
  exceptions: [
    {
      id: "x1",
      tenantId: T,
      locationId: "a",
      date: "2026-11-22",
      kind: "modify",
      ruleId: "sun",
      time: "08:30",
      serviceType: null,
      note: null,
      reason: "Búcsú",
    },
  ],
};
const source = { locations: [location("a")], data };

describe("buildNextServices (mocked clock)", () => {
  it("labels today and tomorrow, then flips at Budapest midnight with no data change", () => {
    const evening = buildNextServices(source, new Date("2026-11-18T17:30:00+01:00"));
    expect(evening.today).toBe("2026-11-18");
    expect(evening.days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19"]);

    const afterMidnight = buildNextServices(source, new Date("2026-11-18T23:30:00+00:00"));
    // 00:30 Budapest on the 19th: the 18th is gone, the 19th is today.
    expect(afterMidnight.today).toBe("2026-11-19");
    expect(afterMidnight.days[0]?.date).toBe("2026-11-19");
    expect(afterMidnight.days.map((d) => d.date)).not.toContain("2026-11-18");
  });

  it("falls back to the next 3 services when nothing is left today or tomorrow", () => {
    const view = buildNextServices(source, new Date("2026-11-20T12:00:00+01:00"));
    const all = view.days.flatMap((d) => d.services);
    expect(all.length).toBeLessThanOrEqual(3);
    expect(all[0]?.date).toBe("2026-11-22");
  });

  it("highlights upcoming exceptions within 14 days", () => {
    const view = buildNextServices(source, new Date("2026-11-18T12:00:00+01:00"));
    expect(view.exceptions).toHaveLength(1);
    expect(view.exceptions[0]).toMatchObject({ date: "2026-11-22", kind: "modify" });
    expect(view.exceptions[0]?.service.reason).toBe("Búcsú");
    expect(view.moreExceptions).toBe(0);
  });

  it("reports a livestreamed service that started within the last hour", () => {
    const live = buildNextServices(source, new Date("2026-11-18T18:20:00+01:00"));
    expect(live.live?.id).toContain("wed");
    expect(buildNextServices(source, new Date("2026-11-18T19:30:00+01:00")).live).toBeNull();
  });

  it("caps the rows and names the next service that has not started", () => {
    const many: ScheduleData = {
      ...data,
      rules: ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "18:00"].map((time, i) =>
        rule(`r${i}`, 4, time),
      ),
      exceptions: [],
    };
    const view = buildNextServices(
      { locations: [location("a")], data: many },
      new Date("2026-11-18T12:00:00+01:00"),
    );
    expect(view.days.flatMap((d) => d.services)).toHaveLength(SERVICE_ROWS);
    expect(view.moreServices).toBe(7 - SERVICE_ROWS);
    expect(view.next?.time).toBe("07:00");
    expect(EXCEPTION_LINES).toBe(2);
  });

  it("is empty without rules", () => {
    const view = buildNextServices(
      { locations: [location("a")], data: { ...data, rules: [], exceptions: [] } },
      new Date("2026-11-18T12:00:00+01:00"),
    );
    expect(view.days).toEqual([]);
    expect(view.exceptions).toEqual([]);
    expect(groupByDate([])).toEqual([]);
  });
});
