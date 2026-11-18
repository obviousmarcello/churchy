import { cache } from "react";
import type { Ctx } from "@churchy/contracts";
import { buildAppNav, type AppArea } from "@/lib/app-nav";
import { filterNav, type PermissionNavItem } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Server helpers of the admin area (D-18). Visibility is decided by `can()` through `filterNav()`,
 * never by role checks.
 */

/** The admin sections the current actor may open, in `buildAppNav()` order. */
export const getAdminSections = cache(async (): Promise<readonly PermissionNavItem[]> => {
  const [actor, ctx, nav] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common.nav"),
  ]);
  const area: AppArea = "admin";
  return filterNav(buildAppNav(nav), actor, ctx).find((i) => i.id === area)?.children ?? [];
});

/** Whether the actor may open the admin section `id` (see `buildAppNav()`). */
export async function canOpenAdminSection(id: string): Promise<boolean> {
  return (await getAdminSections()).some((s) => s.id === id);
}

/**
 * Repository ctx of the current admin request: the church from the request and the acting user.
 * Reads that must not leak (drafts, requests) rely on the adapter treating anonymous ctx as public.
 */
export const getAdminCtx = cache(async (): Promise<Ctx> => {
  const [actor, context] = await Promise.all([getActor(), getRequestContext()]);
  const who: Ctx["actor"] =
    actor.kind === "tenant" || actor.kind === "org"
      ? { userId: actor.userId, personId: actor.personId }
      : { userId: null, personId: null };
  return context.orgId !== undefined
    ? { orgId: context.orgId, actor: who }
    : { tenantId: context.tenantId, actor: who };
});
