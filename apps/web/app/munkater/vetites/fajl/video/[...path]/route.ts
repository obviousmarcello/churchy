import type { NextRequest } from "next/server";

import { UnauthorizedError } from "@/server/music/errors";
import { getProjectionVideoUrl } from "@/server/music/models/projection-themes";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The background videos of the projection themes, for signed-in users only. As for the sound files, the bucket
// is private and a video can be larger than a Vercel Function can send, so this sends the browser to
// a signed URL. The player of the browser then gets the video in parts from that URL.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // The module "projection.themes" is off: no videos.
  if (!(await isWorkspaceModuleOn("ws.music.projection.themes"))) {
    return new Response(null, { status: 404 });
  }
  const { path } = await ctx.params;

  let url: string | null;
  try {
    url = await getProjectionVideoUrl(path.join("/"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw error;
  }
  if (!url) return new Response(null, { status: 404 });

  return new Response(null, {
    status: 302,
    // The signed URL expires, so no cache keeps the redirect.
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
}
