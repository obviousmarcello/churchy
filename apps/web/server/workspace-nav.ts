import { cache } from "react";
import { notFound } from "next/navigation";
import type { WorkspaceModuleKey } from "@churchy/contracts";
import { buildAppNav } from "@/lib/app-nav";
import { filterNav, type PermissionNavItem } from "@/lib/permissions/nav";
import { moduleEnabled } from "@/lib/workspace/plan-tier";
import { getT } from "@/i18n/server";
import { getWorkspaceEnv } from "@/server/workspace";

/**
 * Workspace navigation (D-53 AC1): the sections the actor may use (`filterNav()` → `can()`) and
 * whose module is enabled for the church's workspace tier (`ws_tier` + module switches).
 */

/** Whether the church's workspace has `key` on. */
export const isWorkspaceModuleOn = cache(async (key: WorkspaceModuleKey): Promise<boolean> => {
  const { tenant } = await getWorkspaceEnv();
  return tenant === null
    ? false
    : moduleEnabled(tenant.wsTier, tenant.siteConfig.workspaceModules, key);
});

/** The workspace sections of the current actor, in `buildAppNav()` order (empty: no access). */
export const getWorkspaceSections = cache(async (): Promise<readonly PermissionNavItem[]> => {
  const [env, nav] = await Promise.all([getWorkspaceEnv(), getT("common.nav")]);
  if (env.me === null || env.tenant === null) return [];
  const { tenant } = env;
  const items = filterNav(buildAppNav(nav), env.actor, {
    tenantId: env.tenantId,
    isModuleEnabled: (module) =>
      !module.startsWith("ws.") ||
      moduleEnabled(
        tenant.wsTier,
        tenant.siteConfig.workspaceModules,
        module as WorkspaceModuleKey,
      ),
  });
  return items.find((i) => i.id === "workspace")?.children ?? [];
});

/** 404 unless the workspace module is on (the nav hides it, the route must not work either). */
export async function requireWorkspaceModule(key: WorkspaceModuleKey): Promise<void> {
  if (!(await isWorkspaceModuleOn(key))) notFound();
}
