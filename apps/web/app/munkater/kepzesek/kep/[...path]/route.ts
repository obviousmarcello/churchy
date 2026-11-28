import type { NextRequest } from "next/server";

import { getCourseImageFile } from "@/server/music/models/courses";
import { fileEtag, hasEtag, privateFileResponse } from "@/server/music/private-file";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The cover images of the training courses, for signed-in users who can see the course (course
// admins: all). The bucket is private, so the image URLs of Supabase Storage do not work. Each new
// image gets a new path (see `uploadCourseImage`), so the path is its ETag. The proxy skips these
// paths, so this handler checks the session itself.
export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await isWorkspaceModuleOn("ws.music.courses"))) return new Response(null, { status: 404 });
  const { path } = await ctx.params;
  // All course images are WebP: `getCourseImageFile` serves only `.webp` paths.
  // The access can end, so the browser asks each time: a 304 after the check.
  const file = path.join("/");
  const etag = fileEtag(file);
  return privateFileResponse(
    () => getCourseImageFile(file, { cached: hasEtag(request, etag) }),
    { "Content-Type": "image/webp" },
    { etag },
  );
}
