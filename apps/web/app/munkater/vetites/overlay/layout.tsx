import type { ReactNode } from "react";

import { requireWorkspaceModule } from "@/server/workspace-nav";

// The module "projection.overlay": while it is off, the overlay is not found.
export default async function ProjectionOverlayLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.music.projection.overlay");
  return children;
}
