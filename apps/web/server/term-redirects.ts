import { ANONYMOUS_ACTOR, type Redirect } from "@churchy/contracts";
import { demoStateFrom, type CookieReader } from "@/server/demo";
import { repositoriesForDemo } from "@/server/repositories";
import { requestContextFrom } from "@/server/session";

/**
 * The stored redirect of a request path for the request's church (FR-102, D-23 AC2): when a term
 * is renamed, its old URL answers 301 to the new one. Public data, read as an anonymous visitor.
 * Used by the proxy, which has the request's cookies but no `next/headers`.
 */
export async function redirectForRequest(
  cookie: CookieReader,
  pathname: string,
): Promise<Redirect | null> {
  const demo = demoStateFrom(cookie);
  const { tenantId } = requestContextFrom(demo);
  if (tenantId === undefined) return null;
  return repositoriesForDemo(demo).tenants.findRedirect(
    { tenantId, actor: ANONYMOUS_ACTOR },
    pathname,
  );
}
