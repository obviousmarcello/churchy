import "server-only";

import { z } from "zod";

import { clampView, fileViewSchema, isFitView, type FileView } from "@/lib/music/file-view";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, isId, parseInput } from "./shared";

// The signed-in user's zoom of each PDF file and image on the sheet (see
// `file-view.ts`). Every function is scoped to the signed-in user.

export type FileKind = "pdf" | "image";

const COLUMN = { pdf: "pdf_id", image: "image_id" } as const;
const FILE_TABLE = { pdf: "song_pdfs", image: "song_images" } as const;

const rowSchema = z.object({
  pdf_id: z.uuid().nullable(),
  image_id: z.uuid().nullable(),
  zoom: z.number(),
  x: z.number(),
  y: z.number(),
});

/**
 * The signed-in user's view of each PDF file and image of these songs that
 * has one, by file id. By the songs, so it does not wait for the lists of the files.
 */
export async function getMyFileViews(songIds: string[]): Promise<Map<string, FileView>> {
  const user = await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();
  const admin = await getMusicSupabase();

  const results = await Promise.all(
    (["pdf", "image"] as const).map(async (kind) => {
      const { data, error } = await admin
        .from("user_file_views")
        .select(`pdf_id, image_id, zoom, x, y, ${FILE_TABLE[kind]}!inner()`)
        .eq("user_id", user.id)
        .in(`${FILE_TABLE[kind]}.song_id`, ids);
      if (error) throw databaseError("load file views", error);
      return z.array(rowSchema).parse(data);
    }),
  );

  const views = new Map<string, FileView>();
  for (const row of results.flat()) {
    const id = row.pdf_id ?? row.image_id;
    // The stored numbers are less exact: the view stays in its range.
    const view = clampView(row);
    if (id && !isFitView(view)) views.set(id, view);
  }
  return views;
}

/**
 * Sets the signed-in user's view of a PDF file or an image. Null or the whole
 * page removes it. Returns false if there is no such file.
 */
export async function setMyFileView(
  kind: unknown,
  fileId: string,
  view: unknown,
): Promise<boolean> {
  const user = await requireUser();
  if (!isId(fileId)) return false;
  const column = COLUMN[parseInput(z.enum(["pdf", "image"]), kind)];
  const parsed = parseInput(fileViewSchema.nullable(), view);
  const values = parsed && clampView(parsed);
  const admin = await getMusicSupabase();

  if (!values || isFitView(values)) {
    const { error } = await admin
      .from("user_file_views")
      .delete()
      .eq("user_id", user.id)
      .eq(column, fileId);
    if (error) throw databaseError("clear file view", error);
    return true;
  }

  const { error } = await admin
    .from("user_file_views")
    .upsert(
      { user_id: user.id, [column]: fileId, ...values },
      { onConflict: `tenant_id,${column},user_id` },
    );
  if (error?.code === "23503") return false;
  if (error) throw databaseError("set file view", error);
  return true;
}
