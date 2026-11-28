import type { ReactNode } from "react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { requireWorkspaceModule } from "@/server/workspace-nav";

// The training courses (module `ws.music.courses`): while it is off, the pages are not found.
export default async function CoursesLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.courses");
  return <MusicModulesProvider modules={{}}>{children}</MusicModulesProvider>;
}
