import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { requireWorkspaceModule } from "@/server/workspace-nav";

// The module "rehearsal": while it is off, the page is not found.
export default async function RehearsalLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.rehearsal");
  return <MusicModulesProvider modules={{}}>{children}</MusicModulesProvider>;
}
