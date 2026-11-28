import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { requireWorkspaceModule } from "@/server/workspace-nav";

// The module "scripture" (a child of the events module): while it is off, the page is not found.
export default async function BibleTranslationsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.scripture");
  return <MusicModulesProvider modules={{}}>{children}</MusicModulesProvider>;
}
