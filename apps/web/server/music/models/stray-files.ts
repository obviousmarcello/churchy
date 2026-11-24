import "server-only";

import { z } from "zod";

import { getMusicSupabase } from "@/server/music/db";

// Files in Storage that no row may use (see the migration `stray_files`): an
// upload of a score or an avatar before its row has it, the file of a removed
// PDF, score or sound file, the old file of a replaced score, a replaced
// avatar, a replaced or deleted projection background or video, a deleted event image, and
// an unused course image. The app removes
// such a file, and its row, at once when it can, and `removeStrayFiles`
// removes the rest later. The image pages and the uploads of
// PDFs and sound files have their own tables, with the same helpers.
//
// These do not check the session: the caller does.

export type StrayFileBucket =
  | "pdfs"
  | "scores"
  | "avatars"
  | "sound-files"
  | "projection-backgrounds"
  | "event-images"
  | "course-images"
  | "projection-videos"
  | "branding";

/** A stray file this old is not of a running upload any more. */
export const STRAY_FILE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
/** The most files of one table that one cleanup run removes. */
const FILES_PER_RUN = 100;
/**
 * The most paths in one `.in()` filter. PostgREST gets the filter in the URL,
 * and a URL of some kilobytes fails.
 */
const PATHS_PER_FILTER = 20;

/**
 * Adds an upload to `stray_files` before the upload starts, so the cleanup
 * knows the file even if the request stops after the upload. The row that
 * uses the file then takes it out (a trigger does it).
 */
export async function startStrayFileUpload(bucket: StrayFileBucket, path: string): Promise<void> {
  const { error } = await (await getMusicSupabase()).from("stray_files").insert({ bucket, path });
  if (error) {
    console.error(`[files] Failed to start a ${bucket} upload:`, error.message);
    throw new Error("Failed to start an upload");
  }
}

/**
 * Removes files that no row uses, and their rows in `stray_files`. A file that
 * the app cannot remove stays in `stray_files`, and `removeStrayFiles` tries
 * again later. A failure is only logged.
 *
 * With `keepRows`, the rows stay (or are added) after the removal, so
 * `removeStrayFiles` removes the path again some hours later. This is for a
 * file whose signed upload URL can still work: a new upload to that URL would
 * else be a file that no table knows.
 */
export async function removeUnusedFiles(
  bucket: StrayFileBucket,
  paths: string[],
  { keepRows = false }: { keepRows?: boolean } = {},
): Promise<void> {
  if (paths.length === 0) return;
  if (keepRows) await removeFiles(bucket, paths);
  else if (await removeFilesWithRows(bucket, "stray_files", paths, bucket)) return;

  const { error } = await (await getMusicSupabase()).from("stray_files").upsert(
    paths.map((path) => ({ bucket, path })),
    { onConflict: "bucket,path", ignoreDuplicates: true },
  );
  if (error)
    console.error(`[files] Failed to keep the ${bucket} files for a later removal:`, error.message);
}

/** A file of an upload, with the time of the row that uses it, if any (see `removeUploadedFiles`). */
export type UploadedFile = { path: string; createdAt?: string };

/**
 * Removes uploaded files that no row uses (see `removeUnusedFiles`). With
 * `keepRows` for the files without `createdAt` or younger than
 * `STRAY_FILE_MAX_AGE_MS`: their signed upload URL can still work. The row of
 * an older file came after its upload URL, and that URL works no more.
 */
export async function removeUploadedFiles(
  bucket: StrayFileBucket,
  files: UploadedFile[],
): Promise<void> {
  const before = Date.now() - STRAY_FILE_MAX_AGE_MS;
  const { old = [], recent = [] } = Object.groupBy(files, (file) =>
    file.createdAt && Date.parse(file.createdAt) < before ? "old" : "recent",
  );
  await Promise.all([
    removeUnusedFiles(
      bucket,
      old.map((file) => file.path),
    ),
    removeUnusedFiles(
      bucket,
      recent.map((file) => file.path),
      { keepRows: true },
    ),
  ]);
}

/**
 * Removes the stray files (see `stray_files`) that are some hours old. The
 * scheduled job calls it.
 */
export async function removeStrayFiles(): Promise<void> {
  const rows = await listOldRows("stray_files", "bucket, path");
  const byBucket = Map.groupBy(
    z
      .array(
        z.object({
          bucket: z.enum([
            "pdfs",
            "scores",
            "avatars",
            "sound-files",
            "projection-backgrounds",
            "event-images",
            "course-images",
            "projection-videos",
            "branding",
          ]),
          path: z.string(),
        }),
      )
      .parse(rows),
    (row) => row.bucket,
  );
  await Promise.all(
    [...byBucket].map(([bucket, files]) =>
      removeUnusedFiles(
        bucket,
        files.map((file) => file.path),
      ),
    ),
  );
}

/**
 * The rows of a table of files (`stray_files`, `song_image_stray_files`,
 * `song_pdf_uploads`, `song_sound_file_uploads`, `projection_video_uploads`) that are
 * `STRAY_FILE_MAX_AGE_MS` old, at most `FILES_PER_RUN`. Empty when the query
 * fails: the next run tries again.
 */
export async function listOldRows(table: string, columns: string): Promise<unknown[]> {
  const before = new Date(Date.now() - STRAY_FILE_MAX_AGE_MS).toISOString();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from(table)
    .select(columns)
    .lt("created_at", before)
    .limit(FILES_PER_RUN);
  if (error) {
    console.error(`[files] Failed to list the old rows of ${table}:`, error.message);
    return [];
  }
  return data;
}

/**
 * Removes the files from the bucket, then their rows from `table` (with
 * `bucket` in its `bucket` column, when given). Returns false, after a log,
 * when the files stay.
 */
export async function removeFilesWithRows(
  storageBucket: string,
  table: string,
  paths: string[],
  bucket?: StrayFileBucket,
): Promise<boolean> {
  if (paths.length === 0) return true;
  if (!(await removeFiles(storageBucket, paths))) return false;

  for (let start = 0; start < paths.length; start += PATHS_PER_FILTER) {
    let query = (await getMusicSupabase())
      .from(table)
      .delete()
      .in("path", paths.slice(start, start + PATHS_PER_FILTER));
    if (bucket) query = query.eq("bucket", bucket);
    const { error: deleteError } = await query;
    if (deleteError) {
      // The files are gone, so the next run only deletes the rows.
      console.error(`[files] Failed to delete the rows of ${table}:`, deleteError.message);
      return true;
    }
  }
  return true;
}

/** Removes the files from the bucket. Returns false, after a log, when the files stay. */
async function removeFiles(storageBucket: string, paths: string[]): Promise<boolean> {
  const { error } = await (await getMusicSupabase()).storage.from(storageBucket).remove(paths);
  if (error) {
    console.error(`[files] Failed to remove ${storageBucket} files:`, error.message);
    return false;
  }
  return true;
}
