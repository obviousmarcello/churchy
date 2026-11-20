import { describe, expect, it } from "vitest";
import type { PastoralRequest } from "@churchy/contracts";
import { countByStatus, filterRequests, nextStatuses, parseInboxFilters } from "./admin";

const req = (id: string, over: Partial<PastoralRequest>): PastoralRequest => ({
  id,
  tenantId: "t",
  formId: "f",
  formKey: "keresztelo",
  reference: "KER-2026-0001",
  data: {},
  status: "uj",
  assigneeUserId: null,
  notes: [],
  consentAt: "2026-11-01T10:00:00.000Z",
  consentTextHash: "x".repeat(8),
  createdAt: "2026-11-01T10:00:00.000Z",
  closedAt: null,
  purgeAfter: null,
  ...over,
});

const rows = [
  req("a", {}),
  req("b", { status: "folyamatban", assigneeUserId: "u1", formKey: "hazassag" }),
  // 23:30 UTC on 2 Nov is already 3 Nov in Budapest.
  req("c", { status: "lezart", createdAt: "2026-11-02T23:30:00.000Z" }),
];

describe("inbox filters", () => {
  it("ignores unknown query values", () => {
    expect(parseInboxFilters({ allapot: "x", tol: "holnap", urlap: " hazassag " })).toEqual({
      status: "",
      form: "hazassag",
      assignee: "",
      from: "",
      to: "",
    });
  });

  it("filters by status, form, assignee and Budapest day", () => {
    const f = (q: Record<string, string>) =>
      filterRequests(rows, parseInboxFilters(q)).map((r) => r.id);
    expect(f({})).toEqual(["a", "b", "c"]);
    expect(f({ allapot: "folyamatban" })).toEqual(["b"]);
    expect(f({ urlap: "hazassag" })).toEqual(["b"]);
    expect(f({ felelos: "none" })).toEqual(["a", "c"]);
    expect(f({ felelos: "u1" })).toEqual(["b"]);
    expect(f({ tol: "2026-11-03" })).toEqual(["c"]);
    expect(f({ ig: "2026-11-02" })).toEqual(["a", "b"]);
  });
});

describe("workflow", () => {
  it("offers Új → Folyamatban → Lezárt and reopening", () => {
    expect(nextStatuses("uj")).toEqual(["folyamatban", "lezart"]);
    expect(nextStatuses("folyamatban")).toEqual(["lezart"]);
    expect(nextStatuses("lezart")).toEqual(["folyamatban"]);
    expect(countByStatus(rows)).toEqual({ uj: 1, folyamatban: 1, lezart: 1 });
  });
});
