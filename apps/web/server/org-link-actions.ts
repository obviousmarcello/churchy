"use server";

import type { PolicyScope } from "@/server/policy";
import { withPolicy } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Parish linking and HR delegation (D-84, SDD §25.7). A link becomes active only when **both**
 * the parish owner and the diocesan admin approved it; either side can revoke it, which removes
 * the diocese's access on the next request. Which HR categories are delegated is the parish's
 * decision alone.
 *
 * Diocesan side: `org.links.manage` on the organization. Parish side: `site.orgLink.manage` on the
 * tenant (owner). Both go through `withPolicy`; denials are 404.
 */

type Outcome = "ok" | "conflict";
const CONCEAL = { conceal: true } as const;

const orgResource = (scope: PolicyScope, ..._rest: unknown[]) =>
  scope.context.orgId === undefined ? null : { orgId: scope.context.orgId };

const tenantResource = (scope: PolicyScope, ..._rest: unknown[]) =>
  scope.context.tenantId === undefined ? null : { tenantId: scope.context.tenantId };

async function attempt(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    await run();
    return "ok";
  } catch {
    // Unknown link, wrong side, or a link that already exists: nothing changed.
    return "conflict";
  }
}

// ---------------------------------------------------------------------------------------------
// Diocesan side (*Plébániák*)
// ---------------------------------------------------------------------------------------------

/** The diocesan admin invites a parish; the parish owner still has to approve. */
export const requestParishLink = withPolicy(
  "org.links.manage",
  orgResource,
  async (scope, tenantId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(() => repos.organizations.requestLink(scope.ctx, { tenantId }));
  },
  CONCEAL,
);

/** The diocesan admin approves a link the parish requested. */
export const approveParishLink = withPolicy(
  "org.links.manage",
  orgResource,
  async (scope, linkId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(() => repos.organizations.approveLink(scope.ctx, linkId));
  },
  CONCEAL,
);

/** Either side may end the link; access ends at once. */
export const revokeParishLink = withPolicy(
  "org.links.manage",
  orgResource,
  async (scope, linkId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(() => repos.organizations.revokeLink(scope.ctx, linkId));
  },
  CONCEAL,
);

// ---------------------------------------------------------------------------------------------
// Parish side (*Egyházmegyei kapcsolat* in the admin)
// ---------------------------------------------------------------------------------------------

/** Only keys of the parish's own HR categories can be delegated. */
async function knownKeys(scope: PolicyScope, keys: readonly string[]): Promise<string[]> {
  const repos = await getRequestRepositories();
  const own = new Set((await repos.hr.listCategories(scope.ctx)).map((c) => c.key));
  return [...new Set(keys)].filter((k) => own.has(k));
}

/** The parish owner approves the link and chooses the delegated HR categories. */
export const approveOrgLink = withPolicy(
  "site.orgLink.manage",
  tenantResource,
  async (scope, linkId: string, keys: string[]): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(async () => {
      const link = (await repos.organizations.listLinks(scope.ctx)).find((l) => l.id === linkId);
      if (link === undefined || link.status === "revoked") throw new Error("no link");
      await repos.organizations.setDelegations(scope.ctx, link.orgId, await knownKeys(scope, keys));
      await repos.organizations.approveLink(scope.ctx, linkId);
    });
  },
  CONCEAL,
);

/** The parish changes what it delegates; takes effect on the next request. */
export const saveOrgDelegations = withPolicy(
  "site.orgLink.manage",
  tenantResource,
  async (scope, orgId: string, keys: string[]): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(async () => {
      const link = (await repos.organizations.listLinks(scope.ctx)).find(
        (l) => l.orgId === orgId && l.status !== "revoked",
      );
      if (link === undefined) throw new Error("no link");
      await repos.organizations.setDelegations(scope.ctx, orgId, await knownKeys(scope, keys));
    });
  },
  CONCEAL,
);

/** The parish owner ends the link. */
export const revokeOrgLink = withPolicy(
  "site.orgLink.manage",
  tenantResource,
  async (scope, linkId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    return attempt(() => repos.organizations.revokeLink(scope.ctx, linkId));
  },
  CONCEAL,
);
