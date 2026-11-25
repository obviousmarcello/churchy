import type { NextRequest } from "next/server";

import { getEventImageFile } from "@/server/music/models/event-images";
import { privateFileResponse } from "@/server/music/private-file";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The images of the events, for signed-in users only. The bucket is private, so the image URLs of
// Supabase Storage do not work. Each new image gets a new path (see `addEventImage`), so a browser
// can keep a file for a long time. The proxy skips image paths: this handler checks the session.
export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.events.images"))) {
    return new Response(null, { status: 404 });
  }
  const { path } = await ctx.params;
  const key = path.join("/");
  return privateFileResponse(
    () => getEventImageFile(key, { cached: request.headers.has("if-none-match") }),
    { "Content-Type": "image/webp" },
    { etag: `"${key}"` },
  );
}
