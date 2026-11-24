import type { NextRequest } from "next/server";

import { isWorkspaceModuleOn } from "@/server/workspace-nav";

import { UnauthorizedError } from "@/server/music/errors";
import { getSoundFileUrl } from "@/server/music/models/sound-files";

// The sound files of the songs, for signed-in users only. As for the PDF files
// (`src/app/pdf-files/[...path]/route.ts`), the bucket is private and a file
// can be larger than a Vercel Function can send, so this sends the browser to
// a signed URL. The player of the browser then gets the file in parts from
// that URL. `?download=1` saves the file with its original name.
//
// The proxy also checks the session for this path (see `src/proxy.ts`).
export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.songs.sound-files")))
    return new Response(null, { status: 404 });
  const { path } = await ctx.params;

  let url: string | null;
  try {
    url = await getSoundFileUrl(path.join("/"), request.nextUrl.searchParams.has("download"));
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
