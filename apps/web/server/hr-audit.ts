/**
 * Demo stand-in for the audit log of confidential reads (D-74, NFR-17). The real `audit_log`
 * table is the BE part; this keeps entries in memory for the demo only. Entries hold the ticket
 * reference, the reader's person id, the reason and the time — never ticket content.
 */
export interface ConfidentialRead {
  readonly id: string;
  readonly tenantId: string;
  readonly ticketId: string;
  readonly reference: string;
  readonly personId: string;
  readonly reason: string;
  readonly at: string;
}

const GRANT_MINUTES = 30;

const store = (globalThis as { __churchyHrAudit?: ConfidentialRead[] }).__churchyHrAudit ?? [];
(globalThis as { __churchyHrAudit?: ConfidentialRead[] }).__churchyHrAudit = store;

export function logConfidentialRead(entry: Omit<ConfidentialRead, "id">): ConfidentialRead {
  const row = { ...entry, id: `audit-${store.length + 1}-${Date.parse(entry.at)}` };
  store.push(row);
  return row;
}

/** The reason entry that lets `personId` open the ticket now, if any (30 minutes). */
export function activeGrant(
  grantId: string | undefined,
  ticketId: string,
  personId: string,
  now: Date,
): ConfidentialRead | undefined {
  const row = store.find((r) => r.id === grantId);
  if (!row || row.ticketId !== ticketId || row.personId !== personId) return undefined;
  return now.getTime() - Date.parse(row.at) <= GRANT_MINUTES * 60_000 ? row : undefined;
}

export const readsOfTicket = (tenantId: string, ticketId: string): ConfidentialRead[] =>
  store.filter((r) => r.tenantId === tenantId && r.ticketId === ticketId);
