import "server-only";

import { createHash } from "node:crypto";

import { UnauthorizedError } from "./errors";

/** `load` gives this when the browser has the file already (`If-None-Match`) and may still see it. */
export const NOT_MODIFIED = Symbol("not modified");

/**
 * The response of a route for a file of a private bucket, e.g. an avatar or
 * a score. Only signed-in users get it: `load` throws `UnauthorizedError`
 * otherwise, and gives null for a file that does not exist. Each new file
 * gets a new path, so a browser can keep a file for a long time. `headers`
 * add to the headers of all files, e.g. the `Content-Type`.
 *
 * With `etag` (see `fileEtag()`): for files whose access can end, e.g. the
 * images of a private event. The browser keeps the file, but asks each time
 * (`no-cache`), so a user who lost access does not see it again from the
 * cache. `load` checks the access and gives `NOT_MODIFIED` for a 304.
 */
export async function privateFileResponse(
  load: () => Promise<BodyInit | null | typeof NOT_MODIFIED>,
  headers: Record<string, string>,
  { etag }: { etag?: string } = {},
): Promise<Response> {
  let body: BodyInit | null | typeof NOT_MODIFIED;
  try {
    body = await load();
  } catch (error) {
    if (error instanceof UnauthorizedError) return new Response(null, { status: 401 });
    throw error;
  }
  if (body === null) return new Response(null, { status: 404 });

  const cache: Record<string, string> = etag
    ? { "Cache-Control": "private, no-cache", ETag: etag }
    : { "Cache-Control": "private, max-age=31536000, immutable" };
  if (body === NOT_MODIFIED) return new Response(null, { status: 304, headers: cache });

  return new Response(body, {
    headers: {
      ...cache,
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** The ETag of a file. A storage path holds one file only, so the path is enough. */
export function fileEtag(path: string): string {
  return `"${createHash("sha256").update(path).digest("base64url").slice(0, 32)}"`;
}

/** True when the `If-None-Match` header of the request names `etag`. */
export function hasEtag(request: Request, etag: string): boolean {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header.split(",").some((value) => {
    const tag = value.trim();
    return tag === "*" || tag === etag || tag === `W/${etag}`;
  });
}
