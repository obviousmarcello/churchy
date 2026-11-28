import type { ReactNode } from "react";
import { PageShell } from "@churchy/ui";
import { AreaHome } from "@/components/area-home";
import { SiteHeader } from "@/components/site-header";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { Toaster } from "@/components/music/ui/toast";
import { MusicModuleFlags } from "@/components/music/app-config";
import { getT } from "@/i18n/server";
import { getWorkspaceSections, isWorkspaceModuleOn } from "@/server/workspace-nav";

/**
 * Shell of every `/munkater` route (D-53, SDD §20): bottom bar on phones, sidebar on desktop, with
 * the sections the actor may use (`filterNav()` → `can()`) and whose module is on. Anyone without
 * a workspace section gets the no-access notice of the area landing page instead. Pages are
 * private, never cached (`next.config.ts` headers) and `noindex` (metadata of the pages).
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [sections, t, home, common, ocr] = await Promise.all([
    getWorkspaceSections(),
    getT("munkater.shell"),
    getT("munkater.home"),
    getT("common"),
    isWorkspaceModuleOn("ws.music.songs.ocr"),
  ]);
  if (sections.length === 0) {
    return <AreaHome area="workspace" title={home("title")} lead={home("lead")} />;
  }
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <WorkspaceFrame
        label={t("navigation")}
        items={sections.map(({ id, label, href }) => ({ id, label, href }))}
      >
        {/* Flags of the copied music components that are not tied to one page (D-phase 7: OCR reads on the device). */}
        <MusicModuleFlags modules={{ "songs.ocr": ocr }}>{children}</MusicModuleFlags>
        {/* The toasts of the copied music forms ("Elmentve." …); the one stack of the workspace. */}
        <Toaster />
      </WorkspaceFrame>
    </PageShell>
  );
}
