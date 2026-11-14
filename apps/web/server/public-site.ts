import { ANONYMOUS_ACTOR, type Ctx } from "@churchy/contracts";
import { demoDirectory } from "@/server/data-adapters";
import { getRequestContext } from "@/server/session";

/**
 * Repository context for public pages: the current church, read as an anonymous visitor (public
 * pages show public data only, whoever is looking). In the diocesan demo context, which has no
 * public site, the default demo church is shown.
 */
export async function getPublicCtx(): Promise<Ctx> {
  const { tenantId } = await getRequestContext();
  return { tenantId: tenantId ?? demoDirectory().defaultTenantId, actor: ANONYMOUS_ACTOR };
}
