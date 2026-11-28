import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { requireWorkspaceModule } from "@/server/workspace-nav";

// The module "projection.themes" (a child of "projection"): while it is off, the page is not found.
export default async function ProjectionThemesLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.projection");
  await requireWorkspaceModule("ws.music.projection.themes");
  return <MusicModulesProvider modules={{}}>{children}</MusicModulesProvider>;
}
