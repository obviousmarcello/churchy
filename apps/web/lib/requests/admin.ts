import { toIsoDateString } from "@churchy/hu";
import type { PastoralRequest, RequestStatus } from "@churchy/contracts";

/** Filters and workflow of the requests inbox (D-29). Pure; the page parses the query string. */

export interface InboxFilters {
  status: RequestStatus | "";
  form: string;
  /** A user id, `"none"` (unassigned) or empty (anyone). */
  assignee: string;
  /** `YYYY-MM-DD` (Budapest day) or empty. */
  from: string;
  to: string;
}

const STATUSES: readonly RequestStatus[] = ["uj", "folyamatban", "lezart"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseInboxFilters(
  params: Record<string, string | string[] | undefined>,
): InboxFilters {
  const one = (name: string) => {
    const v = params[name];
    return typeof v === "string" ? v.trim() : "";
  };
  const status = one("allapot");
  return {
    status: STATUSES.find((s) => s === status) ?? "",
    form: one("urlap"),
    assignee: one("felelos"),
    from: DAY.test(one("tol")) ? one("tol") : "",
    to: DAY.test(one("ig")) ? one("ig") : "",
  };
}

/** The requests matching the filters; days are compared as Budapest calendar days. */
export function filterRequests(
  requests: readonly PastoralRequest[],
  filters: InboxFilters,
): PastoralRequest[] {
  return requests.filter((r) => {
    if (filters.status !== "" && r.status !== filters.status) return false;
    if (filters.form !== "" && r.formKey !== filters.form) return false;
    if (filters.assignee === "none" && r.assigneeUserId !== null) return false;
    if (
      filters.assignee !== "" &&
      filters.assignee !== "none" &&
      r.assigneeUserId !== filters.assignee
    ) {
      return false;
    }
    const day = toIsoDateString(r.createdAt);
    if (filters.from !== "" && day < filters.from) return false;
    if (filters.to !== "" && day > filters.to) return false;
    return true;
  });
}

export function countByStatus(
  requests: readonly Pick<PastoralRequest, "status">[],
): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { uj: 0, folyamatban: 0, lezart: 0 };
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

/** The workflow transitions offered for a status: *Új → Folyamatban → Lezárt*, and reopening. */
export function nextStatuses(status: RequestStatus): readonly RequestStatus[] {
  switch (status) {
    case "uj":
      return ["folyamatban", "lezart"];
    case "folyamatban":
      return ["lezart"];
    case "lezart":
      return ["folyamatban"];
  }
}

export const isFiltered = (f: InboxFilters): boolean =>
  f.status !== "" || f.form !== "" || f.assignee !== "" || f.from !== "" || f.to !== "";
