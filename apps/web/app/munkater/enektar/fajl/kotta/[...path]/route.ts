import type { NextRequest } from "next/server";

import { isWorkspaceModuleOn } from "@/server/workspace-nav";

import { getScoreFile, SCORE_CONTENT_TYPES } from "@/server/music/models/scores";
import { privateFileResponse } from "@/server/music/private-file";

// The MusicXML scores of the songs, for signed-in users only. The bucket is
// private, so the URLs of Supabase Storage do not work. Each new file gets a
// new path (see `uploadScore`), so a browser can keep a file for a long time.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.songs.scores")))
    return new Response(null, { status: 404 });
  const { path } = await ctx.params;
  return privateFileResponse(() => getScoreFile(path.join("/")), {
    // Always the checked MusicXML text, also for a compressed file (see `getScoreFile`).
    "Content-Type": `${SCORE_CONTENT_TYPES.musicxml}; charset=utf-8`,
    // A browser shows an XML type as a document, and runs the scripts in it.
    // The sheet fetches the file, so it can stay a download with no scripts.
    "Content-Disposition": "attachment",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
}
