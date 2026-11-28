import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { sortAttachmentKeys } from "@/lib/music/attachments";
import {
  SOUND_FILE_HEADER_BYTES,
  SOUND_FILE_TYPES,
  VIDEO_CONTAINER_TYPES,
  hasVideoTrack,
  soundFileExtensions,
  soundFileHeaderBytes,
  soundFileTypeOf,
} from "@/lib/music/sound-files";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError, type Text } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { attachmentArrangementIdsSchema, attachmentKeysSchema, uploadedFilesSchema } from "./pdfs";
import {
  cleanFileName,
  databaseError,
  downloadFileName,
  isId,
  isStorageNotFound,
  nameOfFile,
  optionalText,
  parseInput,
} from "./shared";
import { readStoredFile, readStoredFileStart } from "./stored-files";
import {
  listOldRows,
  removeFilesWithRows,
  removeUploadedFiles,
  type UploadedFile,
} from "./stray-files";

// Sound files: recordings of a song, e.g. a demo or a practice track for the
// singers, each with its own name. As a PDF, a sound file can be for some
// arrangements of the song and for some keys: none means all arrangements or
// any key. Every signed-in user can play them; only song admins and
// superadmins can change them.
//
// The files are in the private `sound-files` bucket, and do not go through
// the app, as the PDFs:
// - Upload: `startSoundFileUpload` gives the browser a signed upload URL, the
//   browser puts the file there, and `addSongSoundFile` checks the stored
//   file before it adds the sound file.
// - Playback: `getSoundFileUrl` gives a signed URL
//   (`src/app/sound-files/[...path]/route.ts` sends the browser there).

/** The largest file. Keep it in sync with the bucket limit and the check in the migration `song_sound_files`. */
export const SOUND_FILE_MAX_BYTES = 20 * 1024 * 1024;
/** The most sound files of one song. */
export const SOUND_FILES_PER_SONG_MAX = 10;
export const SOUND_FILE_NAME_MAX_LENGTH = 100;
/**
 * The most sound file uploads of one user that started in the last 2 hours
 * and were not added yet. Each signed upload URL can store a file, so this
 * limits the space that one account can take before the cleanup.
 */
export const SOUND_FILE_OPEN_UPLOADS_PER_USER_MAX = 10;

// A signed upload URL works for 2 hours, less than `STRAY_FILE_MAX_AGE_MS`:
// the cleanup removes only the files of older uploads that were not added.
const SOUND_FILE_BUCKET = "sound-files";

// `<song id>/<random id>`, as `startSoundFileUpload` makes it.
const SOUND_FILE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
/**
 * The player of the browser gets the file in parts, from the URL after the
 * redirect, also when the user jumps to a later part of the song. So the
 * signed URL must work for some time, not only until the playback starts.
 * The URL works without a session, so the time is short: when it ends, the
 * player asks the route again (`SoundFilePlayer`).
 */
const PLAY_URL_SECONDS = 30 * 60;
/** A download only needs to start. */
const DOWNLOAD_URL_SECONDS = 60;

export type SongSoundFileDTO = {
  id: string;
  /** What the sound file is, e.g. "Demo". */
  name: string;
  /** The name of the uploaded file. */
  fileName: string;
  sizeBytes: number;
  /** The format of the file, e.g. `audio/mpeg`. */
  contentType: string;
  /** The keys of the sound file, in English note names, in the order of `ATTACHMENT_KEYS`. Empty: any key. */
  keys: string[];
  /** The arrangements of the sound file. Empty: all arrangements of the song. */
  arrangementIds: string[];
  /** A path on this site that serves the file. */
  url: string;
};

export const SOUND_FILE_COLUMNS =
  "id, name, file_name, path, size_bytes, content_type, musical_keys, song_sound_file_arrangements (arrangement_id)";

export const soundFileRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  file_name: z.string(),
  path: z.string(),
  size_bytes: z.number(),
  content_type: z.string(),
  musical_keys: z.array(z.string()),
  song_sound_file_arrangements: z.array(z.object({ arrangement_id: z.uuid() })),
});

/** A blank name uses the file name without its extension. */
const soundFileInputSchema = z.strictObject({
  name: optionalText(SOUND_FILE_NAME_MAX_LENGTH),
  keys: attachmentKeysSchema,
  arrangementIds: attachmentArrangementIdsSchema,
});

/** `path` comes from `startSoundFileUpload`, `fileName` is the name of the file on the user's device. */
const newSoundFileInputSchema = soundFileInputSchema.extend({
  path: z.string(),
  fileName: z.string(),
});

export function toSongSoundFile(row: z.infer<typeof soundFileRowSchema>): SongSoundFileDTO {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    keys: sortAttachmentKeys(row.musical_keys),
    arrangementIds: row.song_sound_file_arrangements.map((link) => link.arrangement_id),
    url: `/munkater/enektar/fajl/hang/${row.path}`,
  };
}

/** By name. `compare` is `i18n.compare` of the request. */
export function sortSoundFiles(
  soundFiles: SongSoundFileDTO[],
  compare: (a: string, b: string) => number,
): SongSoundFileDTO[] {
  return soundFiles.toSorted((a, b) => compare(a.name, b.name));
}

/** The sound files of these songs, by song. Songs without sound files are not in the map. */
export async function listSoundFilesOfSongs(
  songIds: string[],
): Promise<Map<string, SongSoundFileDTO[]>> {
  await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_sound_files")
    .select(`song_id, ${SOUND_FILE_COLUMNS}`)
    .in("song_id", ids);
  if (error) throw databaseError("list sound files", error);

  const { compare } = await getRequestI18n();
  const rows = z.array(soundFileRowSchema.extend({ song_id: z.uuid() })).parse(data);
  const soundFiles = Map.groupBy(rows, (row) => row.song_id);
  return new Map(
    [...soundFiles].map(([songId, list]) => [
      songId,
      sortSoundFiles(list.map(toSongSoundFile), compare),
    ]),
  );
}

/**
 * Starts the upload of a sound file for the song: the browser puts the file
 * to `uploadUrl` (HTTP PUT), then calls `addSongSoundFile` with `path`.
 * Returns null if there is no such song.
 */
export async function startSoundFileUpload(
  songId: string,
): Promise<{ path: string; uploadUrl: string } | null> {
  const user = await requireSongAdmin();
  if (!isId(songId)) return null;

  const { count, error: countError } = await (
    await getMusicSupabase()
  )
    .from("song_sound_files")
    .select("id", { count: "exact", head: true })
    .eq("song_id", songId);
  if (countError) throw databaseError("count sound files", countError);
  if ((count ?? 0) >= SOUND_FILES_PER_SONG_MAX) throw tooManyError();

  const { data: song, error: songError } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .select("id")
    .eq("id", songId)
    .maybeSingle();
  if (songError) throw databaseError("get song", songError);
  if (!song) return null;

  const path = `${songId}/${randomUUID()}`;
  // First the row, so that the cleanup knows the file even if this request stops after the signing.
  // A refused or failed upload counts for `SOUND_FILE_OPEN_UPLOADS_PER_USER_MAX` too, until its signed URL
  // stops working (2 hours): the URL can still put a file.
  const { error: insertError } = await (
    await getMusicSupabase()
  ).rpc("start_song_sound_file_upload", {
    p_user_id: user.id,
    p_path: path,
    p_max: SOUND_FILE_OPEN_UPLOADS_PER_USER_MAX,
  });
  if (insertError) {
    throw databaseError("start sound file upload", insertError, {
      "P0001:too_many_sound_file_uploads": () =>
        new ConflictError(({ m, format }) =>
          format(m.server.soundFiles.tooManyUploads, { max: SOUND_FILE_OPEN_UPLOADS_PER_USER_MAX }),
        ),
    });
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(SOUND_FILE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) {
    console.error("[sound-files] Failed to sign the upload:", error.message);
    throw new Error("Failed to sign the sound file upload");
  }
  return { path, uploadUrl: data.signedUrl };
}

/**
 * Adds the uploaded file `path` (see `startSoundFileUpload`) as a sound file
 * of the song. It checks the stored file first, and removes it when it is not
 * a sound file. Returns false if there is no such song.
 */
export async function addSongSoundFile(songId: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(songId)) return false;
  const { name, keys, arrangementIds, path, fileName } = parseInput(newSoundFileInputSchema, input);
  if (!SOUND_FILE_PATH_PATTERN.test(path) || !path.startsWith(`${songId}/`)) {
    throw soundFileError(({ m }) => m.server.soundFiles.uploadMissing);
  }

  let file = await readStoredFileStart(SOUND_FILE_BUCKET, path, SOUND_FILE_HEADER_BYTES);
  if (!file) throw soundFileError(({ m }) => m.server.soundFiles.uploadMissing);
  // After ID3 tags, the format shows only after the tags: read the start up to
  // there. Not past the end of the file: the size in the tags comes from the uploader.
  if (file.sizeBytes <= SOUND_FILE_MAX_BYTES) {
    const headerBytes = Math.min(soundFileHeaderBytes(file.start), file.sizeBytes);
    if (headerBytes > SOUND_FILE_HEADER_BYTES) {
      file = await readStoredFileStart(SOUND_FILE_BUCKET, path, headerBytes);
      if (!file) throw soundFileError(({ m }) => m.server.soundFiles.uploadMissing);
    }
  }
  const checked = checkSoundFile(file);
  if ("problem" in checked) {
    await removeSoundFiles([{ path }]);
    throw soundFileError(checked.problem);
  }
  // The form refuses a video too, but this call can come without the form.
  if (VIDEO_CONTAINER_TYPES.includes(checked.contentType)) {
    const content = await readStoredFile(SOUND_FILE_BUCKET, path);
    if (!content) throw soundFileError(({ m }) => m.server.soundFiles.uploadMissing);
    if (hasVideoTrack(content)) {
      await removeSoundFiles([{ path }]);
      throw soundFileError(({ m }) => m.server.soundFiles.video);
    }
  }

  const cleanName = cleanFileName(fileName, "recording");
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_song_sound_file", {
    p_song_id: songId,
    p_name: name ?? defaultSoundFileName(cleanName),
    p_file_name: cleanName,
    p_path: path,
    p_size_bytes: file.sizeBytes,
    p_content_type: checked.contentType,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
    p_max: SOUND_FILES_PER_SONG_MAX,
  });
  if (error || data === null) {
    // Do not leave a file that no sound file uses, but only when the database
    // refused it. Without its upload row, the file is not of this call: an
    // earlier call added it (e.g. a second submit), or the cleanup removed it.
    // After another error, e.g. a lost response, the sound file can exist: the
    // cleanup removes the file if its upload was not added.
    if (
      !error ||
      error.hint === "too_many_sound_files" ||
      error.hint === "sound_file_arrangement"
    ) {
      await removeSoundFiles([{ path }]);
    }
    if (!error) return false;
    throw databaseError("add sound file", error, {
      "P0001:sound_file_upload_missing": () =>
        soundFileError(({ m }) => m.server.soundFiles.uploadMissing),
      "P0001:too_many_sound_files": () => tooManyError(),
      "P0001:sound_file_arrangement": () => arrangementError(),
    });
  }
  return true;
}

/**
 * Changes the name, the keys and the arrangements of a sound file. A blank
 * name uses the file name without its extension. Returns false if there is
 * no such sound file.
 */
export async function updateSongSoundFile(id: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { name, keys, arrangementIds } = parseInput(soundFileInputSchema, input);

  let newName = name;
  if (newName === null) {
    const { data: old, error: oldError } = await (
      await getMusicSupabase()
    )
      .from("song_sound_files")
      .select("file_name")
      .eq("id", id)
      .maybeSingle();
    if (oldError) throw databaseError("get sound file", oldError);
    if (!old) return false;
    newName = defaultSoundFileName(z.object({ file_name: z.string() }).parse(old).file_name);
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("update_song_sound_file", {
    p_id: id,
    p_name: newName,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
  });
  if (error)
    throw databaseError("update sound file", error, {
      "P0001:sound_file_arrangement": () => arrangementError(),
    });
  return data === true;
}

/** Removes a sound file and its file. Returns false if there is no such sound file. */
export async function removeSongSoundFile(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_sound_files")
    .delete()
    .eq("id", id)
    .select("path, created_at");
  if (error) throw databaseError("remove sound file", error);

  await removeSoundFiles(uploadedFilesSchema.parse(data));
  return data.length > 0;
}

/**
 * A signed URL of a sound file for a signed-in user, or null if no sound file
 * has this file. `path` is the part of the URL after `/munkater/enektar/fajl/hang/`. With
 * `download`, the browser saves the file with its original name, always with
 * an extension of its checked format (see `downloadFileName`).
 */
export async function getSoundFileUrl(path: string, download: boolean): Promise<string | null> {
  await requireUser();
  if (!SOUND_FILE_PATH_PATTERN.test(path)) return null;

  // Only the files of sound files: not an upload that was not added.
  const { data: row, error: rowError } = await (
    await getMusicSupabase()
  )
    .from("song_sound_files")
    .select("file_name, content_type")
    .eq("path", path)
    .maybeSingle();
  if (rowError) throw databaseError("get sound file", rowError);
  if (!row) return null;

  const file = z
    .object({ file_name: z.string(), content_type: z.enum(SOUND_FILE_TYPES) })
    .parse(row);
  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(SOUND_FILE_BUCKET)
    .createSignedUrl(
      path,
      download ? DOWNLOAD_URL_SECONDS : PLAY_URL_SECONDS,
      download
        ? { download: downloadFileName(file.file_name, soundFileExtensions(file.content_type)) }
        : undefined,
    );
  if (error) {
    // A file that is not in Storage is not found. Another error is a failure
    // (500), so a short outage of Storage does not look like a missing file.
    if (isStorageNotFound(error)) return null;
    console.error("[sound-files] Failed to sign the file URL:", error.message);
    throw new Error("Failed to sign the sound file URL");
  }
  return data.signedUrl;
}

// For the songs model. These do not check the session: the caller does.

/** The files of the sound files of a song, with the times of their rows, e.g. to remove them after the song. */
export async function listSoundFilePaths(songId: string): Promise<UploadedFile[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_sound_files")
    .select("path, created_at")
    .eq("song_id", songId);
  if (error) throw databaseError("list sound files", error);
  return uploadedFilesSchema.parse(data);
}

/**
 * Removes files that no sound file uses. The rows of the recent ones stay in
 * `stray_files`: the signed upload URL of such a file can still work, and the
 * cleanup then removes a file that it stores again (see `removeUploadedFiles`).
 */
export async function removeSoundFiles(files: UploadedFile[]): Promise<void> {
  await removeUploadedFiles(SOUND_FILE_BUCKET, files);
}

/**
 * Removes the files of the uploads that started long ago but were not added,
 * e.g. when the browser closed during an upload. The scheduled job calls it.
 * It does not check the session. A failure is only logged: the next run
 * tries again.
 */
export async function removeUnfinishedSoundFileUploads(): Promise<void> {
  const rows = await listOldRows("song_sound_file_uploads", "path");
  const paths = z
    .array(z.object({ path: z.string() }))
    .parse(rows)
    .map((row) => row.path);
  await removeFilesWithRows(SOUND_FILE_BUCKET, "song_sound_file_uploads", paths);
}

/**
 * The format of the file, or the problem of a file that is not a sound file
 * of at most `SOUND_FILE_MAX_BYTES`. The content decides, not the name.
 */
function checkSoundFile({
  sizeBytes,
  start,
}: {
  sizeBytes: number;
  start: Uint8Array;
}): { contentType: (typeof SOUND_FILE_TYPES)[number] } | { problem: Text } {
  if (sizeBytes === 0) return { problem: ({ m }) => m.server.soundFiles.chooseFile };
  if (sizeBytes > SOUND_FILE_MAX_BYTES) {
    return {
      problem: ({ m, format }) =>
        format(m.server.soundFiles.tooLarge, { mb: SOUND_FILE_MAX_BYTES / (1024 * 1024) }),
    };
  }
  const contentType = soundFileTypeOf(start);
  if (!contentType) return { problem: ({ m }) => m.server.soundFiles.fileType };
  return { contentType };
}

/** For example "Amazing Grace - Demo" for "Amazing Grace - Demo.mp3". */
function defaultSoundFileName(fileName: string): string {
  return nameOfFile(fileName, /\.[a-z0-9]{1,5}$/i, SOUND_FILE_NAME_MAX_LENGTH);
}

function tooManyError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.soundFiles.tooMany, { max: SOUND_FILES_PER_SONG_MAX }),
  );
}

function arrangementError(): ValidationError {
  return new ValidationError([
    { path: "arrangementIds", message: ({ m }) => m.server.soundFiles.unknownArrangement },
  ]);
}

function soundFileError(message: Text): ValidationError {
  return new ValidationError([{ path: "soundFile", message }]);
}
