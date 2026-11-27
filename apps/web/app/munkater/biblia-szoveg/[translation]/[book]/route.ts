import type { NextRequest } from "next/server";

import { UnauthorizedError } from "@/server/music/errors";
import { getDatabaseBook } from "@/server/music/models/scripture-books";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The text of a book of a "database" translation of the church (see `loadBibleBook`), e.g.
// `/munkater/biblia-szoveg/sajat/John`: only for signed-in users of the church, and only while the
// translation is on. The text has the church's own licence, so no cache keeps the response: the app
// keeps it in memory for a short time (see `loadBibleBook`). 409: the translation is not a
// "database" translation now, the page reloads.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ translation: string; book: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await isWorkspaceModuleOn("ws.music.scripture"))) {
    return new Response(null, { status: 409, headers });
  }
  const { translation, book } = await ctx.params;
  let body: string | "off" | null;
  try {
    body = await getDatabaseBook(translation, book);
  } catch (error) {
    if (error instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw error;
  }
  if (body === "off") return new Response(null, { status: 409, headers });
  if (body === null) return new Response(null, { status: 404, headers });
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
