import type { NextRequest } from "next/server";

import { getProjectionBackgroundFile } from "@/server/music/models/projection-themes";
import { privateFileResponse } from "@/server/music/private-file";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The background images of the projection themes, for signed-in users only. The bucket is private, so the
// image URLs of Supabase Storage do not work. Each new image gets a new path (see
// `setProjectionThemeBackground`), so a browser can keep a file for a long time.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // The module "projection.themes" is off: no backgrounds.
  if (!(await isWorkspaceModuleOn("ws.music.projection.themes"))) {
    return new Response(null, { status: 404 });
  }
  const { path } = await ctx.params;
  // All backgrounds are WebP: `getProjectionBackgroundFile` serves only `.webp` paths.
  return privateFileResponse(() => getProjectionBackgroundFile(path.join("/")), {
    "Content-Type": "image/webp",
  });
}
