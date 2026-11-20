import type { ReactNode } from "react";
import { PageShell } from "@churchy/ui";
import { AreaHome } from "@/components/area-home";
import { SiteHeader } from "@/components/site-header";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getT } from "@/i18n/server";
import { getOrgSections } from "@/server/org-nav";

/**
 * Shell of every `/egyhazmegye` route (D-85, SDD §25.7): sidebar / bottom bar with the sections the
 * actor may use (`filterNav()` → `can()`). Anyone without a portal section gets the no-access
 * notice of the area landing page. Pages are private and `noindex`.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const [sections, t, home, common] = await Promise.all([
    getOrgSections(),
    getT("portal.shell"),
    getT("portal.home"),
    getT("common"),
  ]);
  if (sections.length === 0) {
    return <AreaHome area="organization" title={home("title")} lead={home("lead")} />;
  }
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <WorkspaceFrame
        label={t("navigation")}
        homeHref="/egyhazmegye"
        items={sections.map(({ id, label, href }) => ({ id, label, href }))}
      >
        {children}
      </WorkspaceFrame>
    </PageShell>
  );
}
