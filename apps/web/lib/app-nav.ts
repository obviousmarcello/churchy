import messages from "@messages/hu.json";
import type { PermissionNavItem } from "./permissions/nav";

const t = messages.nav;

/**
 * App-shell navigation. Each item declares the action it needs; `filterNav()` decides visibility
 * with `can()` (never role checks). Public items (always visible) arrive with the public site
 * modules; until then anonymous visitors see no navigation.
 */
export const APP_NAV: readonly PermissionNavItem[] = [
  {
    id: "workspace",
    label: t.workspace,
    href: "/munkater",
    requires: { action: "directory.open" },
  },
  { id: "admin", label: t.admin, href: "/admin", requires: { action: "site.navigation.edit" } },
  {
    id: "organization",
    label: t.organization,
    href: "/egyhazmegye",
    requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
  },
];

function orgIdOf(ctx: object): string {
  return "orgId" in ctx && typeof ctx.orgId === "string" ? ctx.orgId : "";
}
