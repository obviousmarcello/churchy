import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AreaHome } from "@/components/area-home";
import { groupAdminNav } from "@/lib/admin/nav";
import { getT } from "@/i18n/server";
import { getAdminSections } from "@/server/admin";

/**
 * Shell of every `/admin` route (D-18, SDD §11.1): top bar, sidebar with the sections the actor
 * may open (`filterNav()` → `can()`), mobile menu. An actor without any admin section gets the
 * no-access notice of the area landing page instead.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [sections, t, shell, common] = await Promise.all([
    getAdminSections(),
    getT("admin.dashboard"),
    getT("admin.shell"),
    getT("common"),
  ]);
  if (sections.length === 0) {
    return <AreaHome area="admin" title={t("title")} lead={t("lead")} />;
  }
  const groups = groupAdminNav(sections).map((group) => ({
    id: group.id,
    label: shell(`groups.${group.id}`),
    items: group.items.map(({ id, label, href }) => ({ id, label, href })),
  }));
  return (
    <AdminFrame
      brand={{ name: common("appName"), href: "/admin" }}
      skipLabel={common("skipToContent")}
      labels={{
        navigation: shell("navigation"),
        openMenu: shell("openMenu"),
        closeMenu: shell("closeMenu"),
        dashboard: shell("dashboard"),
        viewSite: shell("viewSite"),
      }}
      groups={groups}
      siteHref="/"
    >
      {children}
    </AdminFrame>
  );
}
