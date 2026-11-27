import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { isWorkspaceModuleOn, requireWorkspaceModule } from "@/server/workspace-nav";

// The projection pages (controller, screen, overlay, themes) use the whole screen over the workspace
// shell, as the chord sheet. The module "projection": while it is off, they are not found. The
// child modules reach the copied components under the ids of the music app.
export default async function ProjectionLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.projection");
  const [themes, overlay, countdown, pptxExport, live] = await Promise.all([
    isWorkspaceModuleOn("ws.music.projection.themes"),
    isWorkspaceModuleOn("ws.music.projection.overlay"),
    isWorkspaceModuleOn("ws.music.projection.countdown"),
    isWorkspaceModuleOn("ws.music.projection.pptx-export"),
    isWorkspaceModuleOn("ws.music.sheet.live"),
  ]);
  const modules = {
    "projection.themes": themes,
    "projection.overlay": overlay,
    "projection.countdown": countdown,
    "projection.pptx-export": pptxExport,
    // The Bible panel and the quick add come with scripture (phase 6) and the event editor (5c).
    "projection.bible-panel": false,
    "projection.quick-add": false,
    // The controller follows the leader of the event's live session.
    "sheet.live": live,
  };
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-surface">
      <MusicModulesProvider modules={modules}>{children}</MusicModulesProvider>
    </div>
  );
}
