import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { getScriptureConfig } from "@/server/music/models/scripture-translations";
import { isWorkspaceModuleOn, requireWorkspaceModule } from "@/server/workspace-nav";

// The projection pages (controller, screen, overlay, themes) use the whole screen over the workspace
// shell, as the chord sheet. The module "projection": while it is off, they are not found. The
// child modules reach the copied components under the ids of the music app.
export default async function ProjectionLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.projection");
  const [themes, overlay, countdown, pptxExport, quickAdd, live, scriptureOn, biblePanel, mixer] =
    await Promise.all([
      isWorkspaceModuleOn("ws.music.projection.themes"),
      isWorkspaceModuleOn("ws.music.projection.overlay"),
      isWorkspaceModuleOn("ws.music.projection.countdown"),
      isWorkspaceModuleOn("ws.music.projection.pptx-export"),
      isWorkspaceModuleOn("ws.music.projection.quick-add"),
      isWorkspaceModuleOn("ws.music.sheet.live"),
      isWorkspaceModuleOn("ws.music.scripture"),
      isWorkspaceModuleOn("ws.music.projection.bible-panel"),
      isWorkspaceModuleOn("ws.music.mixer"),
    ]);
  const modules = {
    "projection.themes": themes,
    "projection.overlay": overlay,
    "projection.countdown": countdown,
    "projection.pptx-export": pptxExport,
    scripture: scriptureOn,
    "projection.bible-panel": scriptureOn && biblePanel,
    "projection.quick-add": quickAdd,
    mixer,
    // The controller follows the leader of the event's live session.
    "sheet.live": live,
  };
  const scripture = scriptureOn ? await getScriptureConfig() : undefined;
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-surface">
      <MusicModulesProvider modules={modules} scripture={scripture}>
        {children}
      </MusicModulesProvider>
    </div>
  );
}
