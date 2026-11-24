import type { NextRequest } from "next/server";

import { isWorkspaceModuleOn } from "@/server/workspace-nav";

import { UnauthorizedError } from "@/server/music/errors";
import { getPdfFileUrl } from "@/server/music/models/pdfs";

// The PDF files of the songs, for signed-in users only. The bucket is private,
// so the URLs of Supabase Storage do not work. A file can be larger than a
// Vercel Function can send (4.5 MB), so this sends the browser to a signed
// URL that works for a short time. `?download=1` saves the file with its
// original name.
//
// The proxy also checks the session for this path (see `src/proxy.ts`).
export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.songs.pdfs")))
    return new Response(null, { status: 404 });
  const { path } = await ctx.params;

  let url: string | null;
  try {
    url = await getPdfFileUrl(path.join("/"), request.nextUrl.searchParams.has("download"));
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
