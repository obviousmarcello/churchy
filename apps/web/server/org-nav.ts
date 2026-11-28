import { cache } from "react";
import { buildAppNav } from "@/lib/app-nav";
import { filterNav, type PermissionNavItem } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Navigation of the diocesan portal (D-85): the sections the actor may use, decided by `can()`
 * through `filterNav()` — never by role checks.
 */
export const getOrgSections = cache(async (): Promise<readonly PermissionNavItem[]> => {
  const [actor, ctx, nav] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common.nav"),
  ]);
  return (
    filterNav(buildAppNav(nav), actor, ctx).find((i) => i.id === "organization")?.children ?? []
  );
});

/** Whether the actor may open the portal section `id` (see `buildAppNav()`). */
export async function canOpenOrgSection(id: string): Promise<boolean> {
  return (await getOrgSections()).some((s) => s.id === id);
}
