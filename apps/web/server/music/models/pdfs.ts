import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { ATTACHMENT_KEYS, sortAttachmentKeys } from "@/lib/music/attachments";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError, type Text } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { playKeySchema } from "./arrangements";
import {
  cleanFileName,
  databaseError,
  downloadFileName,
  idSchema,
  isId,
  nameOfFile,
  optionalText,
  parseInput,
} from "./shared";
import { readStoredFileStart, type StoredFileStart } from "./stored-files";
import {
  listOldRows,
  removeFilesWithRows,
  removeUploadedFiles,
  type UploadedFile,
} from "./stray-files";

// PDFs: sheet music of a song as PDF files, e.g. a scanned lead sheet or a
// choir part, each with its own name. A PDF can be for some arrangements of
// the song and for some keys: none means all arrangements or any key. Every
// signed-in user can see them; only song admins and superadmins can change
// them.
//
// The files are in the private `pdfs` bucket. A Vercel Function accepts at
// most 4.5 MB, so the files do not go through the app:
// - Upload: `startPdfUpload` gives the browser a signed upload URL, the
//   browser puts the file there, and `addSongPdf` checks the stored file
//   before it adds the PDF.
// - Download: `getPdfFileUrl` gives a signed URL that works for a short
//   time (`src/app/pdf-files/[...path]/route.ts` sends the browser there).

/** The largest file. Keep it in sync with the bucket limit and the check in the migration `song_pdfs`. */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
/** The most PDFs of one song. */
export const PDFS_PER_SONG_MAX = 20;
export const PDF_NAME_MAX_LENGTH = 100;
/**
 * The most PDF uploads of one user that started in the last 2 hours and were
 * not added yet. Each signed upload URL can store a file, so this limits the
 * space that one account can take before the cleanup.
 */
export const PDF_OPEN_UPLOADS_PER_USER_MAX = 10;
/** The most arrangements of one PDF or image. A song has far fewer. */
const ATTACHMENT_ARRANGEMENTS_MAX = 50;

// A signed upload URL works for 2 hours, less than `STRAY_FILE_MAX_AGE_MS`:
// the cleanup removes only the files of older uploads that were not added.
const PDF_BUCKET = "pdfs";

// `<song id>/<random id>.pdf`, as `startPdfUpload` makes it.
const PDF_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;
/** A signed URL only needs to work until the browser starts the download. */
const FILE_URL_SECONDS = 60;
/** A PDF file starts with this text, at most after some bytes of other data (as PDF readers accept it). */
const PDF_HEADER = "%PDF-";
const PDF_HEADER_SEARCH_BYTES = 1024;

export type SongPdfDTO = {
  id: string;
  /** What the PDF is, e.g. "Lead sheet". */
  name: string;
  /** The name of the uploaded file. */
  fileName: string;
  sizeBytes: number;
  /** The keys of the PDF, in English note names, in the order of `ATTACHMENT_KEYS`. Empty: any key. */
  keys: string[];
  /** The arrangements of the PDF. Empty: all arrangements of the song. */
  arrangementIds: string[];
  /** A path on this site that serves the file. */
  url: string;
};

export const PDF_COLUMNS =
  "id, name, file_name, path, size_bytes, musical_keys, song_pdf_arrangements (arrangement_id)";

export const pdfRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  file_name: z.string(),
  path: z.string(),
  size_bytes: z.number(),
  musical_keys: z.array(z.string()),
  song_pdf_arrangements: z.array(z.object({ arrangement_id: z.uuid() })),
});

export const attachmentKeysSchema = z
  .array(playKeySchema)
  .max(ATTACHMENT_KEYS.length)
  .nullish()
  .transform((keys) => sortAttachmentKeys(keys ?? []));

export const attachmentArrangementIdsSchema = z
  .array(idSchema)
  .max(ATTACHMENT_ARRANGEMENTS_MAX)
  .nullish()
  .transform((ids) => [...new Set(ids ?? [])]);

/** A blank name uses the file name without `.pdf`. */
const pdfInputSchema = z.strictObject({
  name: optionalText(PDF_NAME_MAX_LENGTH),
  keys: attachmentKeysSchema,
  arrangementIds: attachmentArrangementIdsSchema,
});

/** `path` comes from `startPdfUpload`, `fileName` is the name of the file on the user's device. */
const newPdfInputSchema = pdfInputSchema.extend({
  path: z.string(),
  fileName: z.string(),
});

export function toSongPdf(row: z.infer<typeof pdfRowSchema>): SongPdfDTO {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    keys: sortAttachmentKeys(row.musical_keys),
    arrangementIds: row.song_pdf_arrangements.map((link) => link.arrangement_id),
    url: `/munkater/enektar/fajl/pdf/${row.path}`,
  };
}

/** By name. `compare` is `i18n.compare` of the request. */
export function sortPdfs(
  pdfs: SongPdfDTO[],
  compare: (a: string, b: string) => number,
): SongPdfDTO[] {
  return pdfs.toSorted((a, b) => compare(a.name, b.name));
}

/** The PDFs of these songs, by song. Songs without PDFs are not in the map. */
export async function listPdfsOfSongs(songIds: string[]): Promise<Map<string, SongPdfDTO[]>> {
  await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .select(`song_id, ${PDF_COLUMNS}`)
    .in("song_id", ids);
  if (error) throw databaseError("list pdfs", error);

  const { compare } = await getRequestI18n();
  const pdfs = new Map<string, SongPdfDTO[]>();
  for (const row of z.array(pdfRowSchema.extend({ song_id: z.uuid() })).parse(data)) {
    pdfs.set(row.song_id, [...(pdfs.get(row.song_id) ?? []), toSongPdf(row)]);
  }
  for (const [songId, list] of pdfs) pdfs.set(songId, sortPdfs(list, compare));
  return pdfs;
}

/** One PDF with the id of its song, or null if there is no such PDF. */
export async function getSongPdf(id: string): Promise<(SongPdfDTO & { songId: string }) | null> {
  await requireUser();
  if (!isId(id)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .select(`song_id, ${PDF_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get pdf", error);
  if (!data) return null;

  const row = pdfRowSchema.extend({ song_id: z.uuid() }).parse(data);
  return { ...toSongPdf(row), songId: row.song_id };
}

/**
 * Starts the upload of a PDF for the song: the browser puts the file to
 * `uploadUrl` (HTTP PUT), then calls `addSongPdf` with `path`. Returns null
 * if there is no such song.
 */
export async function startPdfUpload(
  songId: string,
): Promise<{ path: string; uploadUrl: string } | null> {
  const user = await requireSongAdmin();
  if (!isId(songId)) return null;

  const { count, error: countError } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .select("id", { count: "exact", head: true })
    .eq("song_id", songId);
  if (countError) throw databaseError("count pdfs", countError);
  if ((count ?? 0) >= PDFS_PER_SONG_MAX) throw tooManyError();

  const { data: song, error: songError } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .select("id")
    .eq("id", songId)
    .maybeSingle();
  if (songError) throw databaseError("get song", songError);
  if (!song) return null;

  const path = `${songId}/${randomUUID()}.pdf`;
  // First the row, so that the cleanup knows the file even if this request stops after the signing.
  // A refused or failed upload counts for `PDF_OPEN_UPLOADS_PER_USER_MAX` too, until its signed URL
  // stops working (2 hours): the URL can still put a file.
  const { error: insertError } = await (
    await getMusicSupabase()
  ).rpc("start_song_pdf_upload", {
    p_user_id: user.id,
    p_path: path,
    p_max: PDF_OPEN_UPLOADS_PER_USER_MAX,
  });
  if (insertError) {
    throw databaseError("start pdf upload", insertError, {
      "P0001:too_many_pdf_uploads": () =>
        new ConflictError(({ m, format }) =>
          format(m.server.pdfs.tooManyUploads, { max: PDF_OPEN_UPLOADS_PER_USER_MAX }),
        ),
    });
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(PDF_BUCKET)
    .createSignedUploadUrl(path);
  if (error) {
    console.error("[pdfs] Failed to sign the upload:", error.message);
    throw new Error("Failed to sign the pdf upload");
  }
  return { path, uploadUrl: data.signedUrl };
}

/**
 * Adds the uploaded file `path` (see `startPdfUpload`) as a PDF of the song.
 * It checks the stored file first, and removes it when it is not a PDF.
 * Returns false if there is no such song.
 */
export async function addSongPdf(songId: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(songId)) return false;
  const { name, keys, arrangementIds, path, fileName } = parseInput(newPdfInputSchema, input);
  if (!PDF_PATH_PATTERN.test(path) || !path.startsWith(`${songId}/`)) {
    throw pdfError(({ m }) => m.server.pdfs.uploadMissing);
  }

  const file = await readStoredFileStart(PDF_BUCKET, path, PDF_HEADER_SEARCH_BYTES);
  if (!file) throw pdfError(({ m }) => m.server.pdfs.uploadMissing);
  const problem = checkPdf(file);
  if (problem) {
    await removePdfFiles([{ path }]);
    throw pdfError(problem);
  }

  const cleanName = cleanFileName(fileName, "sheet.pdf");
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_song_pdf", {
    p_song_id: songId,
    p_name: name ?? defaultPdfName(cleanName),
    p_file_name: cleanName,
    p_path: path,
    p_size_bytes: file.sizeBytes,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
    p_max: PDFS_PER_SONG_MAX,
  });
  if (error || data === null) {
    // Do not leave a file that no PDF uses, but only when the database refused
    // it. Without its upload row, the file is not of this call: an earlier
    // call added it (e.g. a second submit), or the cleanup removed it. After
    // another error, e.g. a lost response, the PDF can exist: the cleanup
    // removes the file if its upload was not added.
    if (!error || error.hint === "too_many_pdfs" || error.hint === "pdf_arrangement") {
      await removePdfFiles([{ path }]);
    }
    if (!error) return false;
    throw databaseError("add pdf", error, {
      "P0001:pdf_upload_missing": () => pdfError(({ m }) => m.server.pdfs.uploadMissing),
      "P0001:too_many_pdfs": () => tooManyError(),
      "P0001:pdf_arrangement": () => arrangementError(),
    });
  }
  return true;
}

/**
 * Changes the name, the keys and the arrangements of a PDF. A blank name uses
 * the file name without `.pdf`. Returns false if there is no such PDF.
 */
export async function updateSongPdf(id: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { name, keys, arrangementIds } = parseInput(pdfInputSchema, input);

  let newName = name;
  if (newName === null) {
    const { data: old, error: oldError } = await (
      await getMusicSupabase()
    )
      .from("song_pdfs")
      .select("file_name")
      .eq("id", id)
      .maybeSingle();
    if (oldError) throw databaseError("get pdf", oldError);
    if (!old) return false;
    newName = defaultPdfName(z.object({ file_name: z.string() }).parse(old).file_name);
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("update_song_pdf", {
    p_id: id,
    p_name: newName,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
  });
  if (error)
    throw databaseError("update pdf", error, { "P0001:pdf_arrangement": () => arrangementError() });
  return data === true;
}

/** Removes a PDF and its file. Returns false if there is no such PDF. */
export async function removeSongPdf(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .delete()
    .eq("id", id)
    .select("path, created_at");
  if (error) throw databaseError("remove pdf", error);

  await removePdfFiles(uploadedFilesSchema.parse(data));
  return data.length > 0;
}

/**
 * A signed URL of a PDF file for a signed-in user, or null if no PDF has
 * this file. `path` is the part of the PDF URL after `/munkater/enektar/fajl/pdf/`. With
 * `download`, the browser saves the file with its original name, always with
 * `.pdf` at the end (see `downloadFileName`).
 */
export async function getPdfFileUrl(path: string, download: boolean): Promise<string | null> {
  await requireUser();
  if (!PDF_PATH_PATTERN.test(path)) return null;

  // Only the files of PDFs: not an upload that was not added.
  const { data: row, error: rowError } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .select("file_name")
    .eq("path", path)
    .maybeSingle();
  if (rowError) throw databaseError("get pdf file", rowError);
  if (!row) return null;

  const fileName = z.object({ file_name: z.string() }).parse(row).file_name;
  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(PDF_BUCKET)
    .createSignedUrl(
      path,
      FILE_URL_SECONDS,
      download ? { download: downloadFileName(fileName, ["pdf"]) } : undefined,
    );
  if (error) {
    console.error("[pdfs] Failed to sign the file URL:", error.message);
    return null;
  }
  return data.signedUrl;
}

// For the songs model. These do not check the session: the caller does.

/** The files of the PDFs of a song, with the times of their rows, e.g. to remove them after the song. */
export async function listPdfPaths(songId: string): Promise<UploadedFile[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_pdfs")
    .select("path, created_at")
    .eq("song_id", songId);
  if (error) throw databaseError("list pdf files", error);
  return uploadedFilesSchema.parse(data);
}

/**
 * Removes files that no PDF uses. The rows of the recent ones stay in
 * `stray_files`: the signed upload URL of such a file can still work, and the
 * cleanup then removes a file that it stores again (see `removeUploadedFiles`).
 */
export async function removePdfFiles(files: UploadedFile[]): Promise<void> {
  await removeUploadedFiles(PDF_BUCKET, files);
}

/** The rows of PDFs or sound files with their path and time, as `UploadedFile`. */
export const uploadedFilesSchema = z
  .array(z.object({ path: z.string(), created_at: z.string() }))
  .transform((rows) =>
    rows.map((row): UploadedFile => ({ path: row.path, createdAt: row.created_at })),
  );

/**
 * Removes the files of the uploads that started long ago but were not added,
 * e.g. when the browser closed during an upload. The scheduled job calls it.
 * It does not check the session. A failure is only logged: the next run
 * tries again.
 */
export async function removeUnfinishedPdfUploads(): Promise<void> {
  const rows = await listOldRows("song_pdf_uploads", "path");
  const paths = z
    .array(z.object({ path: z.string() }))
    .parse(rows)
    .map((row) => row.path);
  await removeFilesWithRows(PDF_BUCKET, "song_pdf_uploads", paths);
}

/** The problem of the file, or null for a PDF of at most `PDF_MAX_BYTES`. The content decides, not the name. */
function checkPdf({ sizeBytes, start }: StoredFileStart): Text | null {
  if (sizeBytes === 0) return ({ m }) => m.server.pdfs.chooseFile;
  if (sizeBytes > PDF_MAX_BYTES) {
    return ({ m, format }) => format(m.server.pdfs.tooLarge, { mb: PDF_MAX_BYTES / (1024 * 1024) });
  }
  if (!new TextDecoder("latin1").decode(start).includes(PDF_HEADER))
    return ({ m }) => m.server.pdfs.fileType;
  return null;
}

/** For example "Amazing Grace - Choir" for "Amazing Grace - Choir.pdf". */
function defaultPdfName(fileName: string): string {
  return nameOfFile(fileName, /\.pdf$/i, PDF_NAME_MAX_LENGTH);
}

function tooManyError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.pdfs.tooMany, { max: PDFS_PER_SONG_MAX }),
  );
}

function arrangementError(): ValidationError {
  return new ValidationError([
    { path: "arrangementIds", message: ({ m }) => m.server.pdfs.unknownArrangement },
  ]);
}

function pdfError(message: Text): ValidationError {
  return new ValidationError([{ path: "pdf", message }]);
}
