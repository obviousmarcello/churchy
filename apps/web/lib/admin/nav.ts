import type { PermissionNavItem } from "@/lib/permissions/nav";

/**
 * Sidebar grouping of the admin sections (SDD §11.1). A section's own definition (route, label,
 * required action) lives in `buildAppNav()` (`lib/app-nav.ts`); this only decides where it is
 * listed. Sections that are not named here (added later by other deliverables) are listed in a
 * trailing group, so a new section never disappears.
 */
export const ADMIN_NAV_GROUPS = [
  { id: "content", items: ["announcements", "news", "events", "pages"] },
  { id: "church", items: ["schedule", "locations", "staff"] },
  { id: "inbox", items: ["requests"] },
  { id: "appearance", items: ["appearance"] },
  { id: "settings", items: ["setup", "users", "modules", "plan", "billing", "domain", "orgLink"] },
] as const;

export type AdminNavGroupId = (typeof ADMIN_NAV_GROUPS)[number]["id"] | "other";

export interface AdminNavGroup {
  readonly id: AdminNavGroupId;
  readonly items: readonly PermissionNavItem[];
}

/** Groups the (already permission-filtered) admin sections; empty groups are dropped. */
export function groupAdminNav(sections: readonly PermissionNavItem[]): AdminNavGroup[] {
  const known = new Set<string>(ADMIN_NAV_GROUPS.flatMap((g) => g.items));
  const groups: AdminNavGroup[] = ADMIN_NAV_GROUPS.map((group) => ({
    id: group.id,
    items: group.items.flatMap((id) => sections.filter((s) => s.id === id)),
  }));
  groups.push({ id: "other", items: sections.filter((s) => !known.has(s.id)) });
  return groups.filter((g) => g.items.length > 0);
}
