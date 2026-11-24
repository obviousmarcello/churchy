import type { NextRequest } from "next/server";

import { isWorkspaceModuleOn } from "@/server/workspace-nav";

import { getSongImageFile } from "@/server/music/models/images";
import { privateFileResponse } from "@/server/music/private-file";

// The pages of the song images, for signed-in users only. The bucket is
// private, so the image URLs of Supabase Storage do not work. Each new page
// gets a new path (see `addSongImagePage`), so a browser can keep a file for a
// long time.
//
// The proxy skips image paths (see `src/proxy.ts`), so this handler checks
// the session itself.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.songs.images")))
    return new Response(null, { status: 404 });
  const { path } = await ctx.params;
  // All pages are WebP: `getSongImageFile` serves only `.webp` paths.
  return privateFileResponse(() => getSongImageFile(path.join("/")), {
    "Content-Type": "image/webp",
  });
}
