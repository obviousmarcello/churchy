import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { requireWorkspaceModule } from "@/server/workspace-nav";

// The module "mixer": while it is off, the page is not found.
export default async function MixerLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.mixer");
  return <MusicModulesProvider modules={{}}>{children}</MusicModulesProvider>;
}
