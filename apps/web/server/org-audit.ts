import { getRequestDemoSessionId } from "@/server/repositories";

/**
 * Demo stand-in for the parish's audit log of diocesan access (D-85 AC3, SDD §25.7): every read
 * and action of the organization on a parish's HR data, with the organization as actor. The real
 * `audit_log` is the BE part. Entries hold the ticket reference, the kind of access and the time
 * — never ticket content or personal data. Kept per demo session.
 */
export type OrgAccessKind = "read" | "take" | "close" | "reply";

export interface OrgAccess {
  readonly id: string;
  readonly sessionId: string | null;
  readonly tenantId: string;
  readonly orgId: string;
  readonly reference: string;
  readonly kind: OrgAccessKind;
  readonly at: string;
}

const g = globalThis as { __churchyOrgAudit?: OrgAccess[] };
const store = (g.__churchyOrgAudit ??= []);

const MAX = 500;

export async function logOrgAccess(
  entry: Omit<OrgAccess, "id" | "sessionId" | "at">,
  now: Date,
): Promise<void> {
  const sessionId = await getRequestDemoSessionId();
  const at = now.toISOString();
  // A page reload is not a new read: one entry per ticket and kind per minute.
  const recent = store.find(
    (r) =>
      r.sessionId === sessionId &&
      r.tenantId === entry.tenantId &&
      r.reference === entry.reference &&
      r.kind === entry.kind &&
      Math.abs(Date.parse(at) - Date.parse(r.at)) < 60_000,
  );
  if (recent !== undefined) return;
  store.push({ ...entry, sessionId, at, id: `org-audit-${store.length + 1}` });
  if (store.length > MAX) store.splice(0, store.length - MAX);
}

/** The diocesan accesses of one parish, newest first. */
export async function orgAccessOf(tenantId: string): Promise<OrgAccess[]> {
  const sessionId = await getRequestDemoSessionId();
  return store
    .filter((r) => r.sessionId === sessionId && r.tenantId === tenantId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
