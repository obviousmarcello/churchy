import { describe, expect, it } from "vitest";
import { leaveBalance, REGULAR_LEAVE, type AbsenceInput } from "./leave";
import {
  TICKET_STATUSES,
  allowedTransitions,
  canTransition,
  initialStatus,
  isOpen,
} from "./lifecycle";

const absence = (over: Partial<AbsenceInput>): AbsenceInput => ({
  type: REGULAR_LEAVE,
  status: "approved",
  startDate: "2026-03-02",
  workingDays: 5,
  ...over,
});

describe("leaveBalance", () => {
  const entitlement = { daysTotal: 25, carriedOver: 2, adjustments: [{ days: 1 }, { days: -0.5 }] };

  it("is entitlement + carry-over + adjustments − approved regular leave", () => {
    const b = leaveBalance(2026, entitlement, [
      absence({}),
      absence({ startDate: "2026-07-01", workingDays: 2.5 }),
    ]);
    expect(b).toMatchObject({
      entitlement: 25,
      carriedOver: 2,
      adjustments: 0.5,
      total: 27.5,
      used: 7.5,
      planned: 0,
      remaining: 20,
    });
  });

  it("counts only approved regular leave of that year; requested days are planned", () => {
    const b = leaveBalance(2026, entitlement, [
      absence({ type: "betegszabadsag", workingDays: 3 }),
      absence({ status: "rejected" }),
      absence({ status: "cancelled" }),
      absence({ status: "requested", workingDays: 4 }),
      absence({ startDate: "2025-12-29", workingDays: 3 }),
    ]);
    expect(b.used).toBe(0);
    expect(b.planned).toBe(4);
    expect(b.remaining).toBe(27.5);
  });

  it("treats a missing entitlement as zero", () => {
    expect(leaveBalance(2026, null, [absence({ workingDays: 2 })]).remaining).toBe(-2);
  });
});

describe("ticket lifecycle", () => {
  it("allows exactly the transitions of SDD §25.2", () => {
    const allowed: [string, string][] = [
      ["uj", "folyamatban"],
      ["folyamatban", "jovahagyasra_var"],
      ["folyamatban", "lezart"],
      ["jovahagyasra_var", "jovahagyva"],
      ["jovahagyasra_var", "elutasitva"],
      ["jovahagyva", "lezart"],
      ["elutasitva", "lezart"],
    ];
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        expect(canTransition(from, to)).toBe(allowed.some(([f, t]) => f === from && t === to));
      }
    }
    expect(allowedTransitions("lezart")).toEqual([]);
  });

  it("leave requests with a chain skip Folyamatban", () => {
    expect(initialStatus({ createsAbsence: true, chainLength: 2 })).toBe("jovahagyasra_var");
    expect(initialStatus({ createsAbsence: true, chainLength: 0 })).toBe("uj");
    expect(initialStatus({ createsAbsence: false, chainLength: 2 })).toBe("uj");
  });

  it("only a closed ticket is not open", () => {
    expect(TICKET_STATUSES.filter((s) => !isOpen(s))).toEqual(["lezart"]);
  });
});
