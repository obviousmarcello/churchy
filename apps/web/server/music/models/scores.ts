import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { SCORE_KEYS, scoreKey } from "@/lib/music/score/score-key";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError, type Text } from "@/server/music/errors";
import { readMusicXml } from "@/server/music/musicxml";
import { getMusicSupabase } from "@/server/music/db";
import { cleanFileName, databaseError, isId, nameOfFile, optionalText, parseInput } from "./shared";
import { removeUnusedFiles, startStrayFileUpload } from "./stray-files";

// Scores: MusicXML files of a song, e.g. the melody, a flute part or a special
// arrangement, each with its own name. Every signed-in user can see them; only
// song admins and superadmins can change them. The sheet shows a score instead
// of the chords, and moves it to the key of the sheet in the browser.
//
// The files are in the private `scores` bucket. The app serves them to
// signed-in users only (`src/app/scores/[...path]/route.ts`). A file that no
// score uses has a row in `stray_files`, so the cleanup removes it.

/** The largest file. Keep it below `serverActions.bodySizeLimit` in `next.config.ts` and the bucket limit. */
export const SCORE_MAX_BYTES = 5 * 1024 * 1024;
/** The most scores of one song. */
export const SCORES_PER_SONG_MAX = 20;
export const SCORE_NAME_MAX_LENGTH = 100;

const SCORE_BUCKET = "scores";

/** The content type of each stored format. */
export const SCORE_CONTENT_TYPES = {
  mxl: "application/vnd.recordare.musicxml",
  musicxml: "application/vnd.recordare.musicxml+xml",
} as const;

// `<song id>/<random id>.<format>`, as `uploadScore` writes it.
const SCORE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mxl|musicxml)$/;

export type SongScoreDTO = {
  id: string;
  /** What the score is, e.g. "Flute". */
  name: string;
  /** The name of the uploaded file. */
  fileName: string;
  /** The key that the score sounds in, e.g. "Gb": the concert key of a transposing part. Null when the file has none. */
  key: string | null;
  /**
   * A path on this site, as the stored file (`.mxl` compressed or `.musicxml`),
   * with `?v=`. It always serves MusicXML text.
   */
  url: string;
};

/**
 * Part of each score URL. The browser keeps a score file for one year, so
 * raise it when the route gives other content for the same path. 2: the
 * MusicXML text, not the stored archive.
 */
const SCORE_URL_VERSION = 2;

export const SCORE_COLUMNS = "id, name, file_name, path, musical_key";

export const scoreRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  file_name: z.string(),
  path: z.string(),
  musical_key: z.string().nullable(),
});

/** A key from `SCORE_KEYS`, as the key signature writes it. Blank: no key. */
const scoreKeySchema = z
  .union([z.literal(""), z.enum(SCORE_KEYS)])
  .nullish()
  .transform((key) => key || null);

/** `key`: the key that the score sounds in. Blank on an upload: the first key in the file, as it sounds (see `scoreKey`). */
const scoreInputSchema = z.strictObject({
  name: optionalText(SCORE_NAME_MAX_LENGTH),
  key: scoreKeySchema,
});
const scoreFileInputSchema = z.strictObject({ key: scoreKeySchema });

export type ScoreInput = z.input<typeof scoreInputSchema>;

export function toSongScore(row: z.infer<typeof scoreRowSchema>): SongScoreDTO {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    key: row.musical_key,
    url: `/scores/${row.path}?v=${SCORE_URL_VERSION}`,
  };
}

/** By name. `compare` is `i18n.compare` of the request. */
export function sortScores(
  scores: SongScoreDTO[],
  compare: (a: string, b: string) => number,
): SongScoreDTO[] {
  return scores.toSorted((a, b) => compare(a.name, b.name));
}

/** The scores of these songs, by song. Songs without scores are not in the map. */
export async function listScoresOfSongs(songIds: string[]): Promise<Map<string, SongScoreDTO[]>> {
  await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .select(`song_id, ${SCORE_COLUMNS}`)
    .in("song_id", ids);
  if (error) throw databaseError("list scores", error);

  const { compare } = await getRequestI18n();
  const scores = new Map<string, SongScoreDTO[]>();
  for (const row of z.array(scoreRowSchema.extend({ song_id: z.uuid() })).parse(data)) {
    scores.set(row.song_id, [...(scores.get(row.song_id) ?? []), toSongScore(row)]);
  }
  for (const [songId, list] of scores) scores.set(songId, sortScores(list, compare));
  return scores;
}

/**
 * Adds a score to the song. A blank name uses the file name without its
 * extension, a blank key the first key in the file. The sheet moves the score
 * from this key. The file is checked before any change. Returns false if there
 * is no such song.
 */
export async function addSongScore(
  songId: string,
  input: unknown,
  file: File | undefined,
): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(songId)) return false;
  const { name, key } = parseInput(scoreInputSchema, input);
  const score = await readScoreFile(file);
  const fileName = cleanFileName(file!.name, "score");

  const { count, error: countError } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .select("id", { count: "exact", head: true })
    .eq("song_id", songId);
  if (countError) throw databaseError("count scores", countError);
  if ((count ?? 0) >= SCORES_PER_SONG_MAX) {
    throw new ConflictError(({ m, format }) =>
      format(m.server.scores.tooMany, { max: SCORES_PER_SONG_MAX }),
    );
  }

  const path = await uploadScore(songId, score);
  const { error } = await (await getMusicSupabase()).from("song_scores").insert({
    song_id: songId,
    name: name ?? defaultScoreName(fileName),
    file_name: fileName,
    path,
    musical_key: key ?? score.key,
  });
  if (error) {
    // Do not leave a file that no score uses.
    await removeScoreFiles([path]);
    if (error.code === "23503") return false;
    throw databaseError("add score", error, { "23505": () => nameTakenError() });
  }
  return true;
}

/**
 * Replaces the file of a score, and keeps its name. A blank key is the first
 * key in the new file. Returns false if there is no such score.
 */
export async function replaceSongScore(
  id: string,
  input: unknown,
  file: File | undefined,
): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { key } = parseInput(scoreFileInputSchema, input);
  const score = await readScoreFile(file);

  const old = await getScoreRow(id);
  if (!old) return false;

  const path = await uploadScore(old.song_id, score);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .update({ file_name: cleanFileName(file!.name, "score"), path, musical_key: key ?? score.key })
    .eq("id", id)
    .select("id");
  if (error || data.length === 0) {
    await removeScoreFiles([path]);
    if (error) throw databaseError("replace score", error);
    return false;
  }

  await removeScoreFiles([old.path]);
  return true;
}

/**
 * Changes the name and the key of a score. A blank name uses the file name
 * without its extension; a blank key removes the key. Returns false if there
 * is no such score.
 */
export async function updateSongScore(id: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { name, key } = parseInput(scoreInputSchema, input);

  const old = await getScoreRow(id);
  if (!old) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .update({ name: name ?? defaultScoreName(old.file_name), musical_key: key })
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("update score", error, { "23505": () => nameTakenError() });
  return data.length > 0;
}

/** Removes a score and its file. Returns false if there is no such score. */
export async function removeSongScore(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .delete()
    .eq("id", id)
    .select("path");
  if (error) throw databaseError("remove score", error);

  await removeScoreFiles(
    z
      .array(z.object({ path: z.string() }))
      .parse(data)
      .map((row) => row.path),
  );
  return data.length > 0;
}

/**
 * The MusicXML text of a score file for a signed-in user, or null if there is
 * no such file. `path` is the part of the score URL after `/scores/`.
 *
 * The text is the score that `readMusicXml` checked, also for a compressed
 * file. The browser never gets the archive: Verovio reads an archive in its
 * own way, and could show another file of it than the checked score.
 */
export async function getScoreFile(path: string): Promise<string | null> {
  await requireUser();
  if (!SCORE_PATH_PATTERN.test(path)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(SCORE_BUCKET)
    .download(path);
  if (error) return null;
  return readMusicXml(new Uint8Array(await data.arrayBuffer()))?.xml ?? null;
}

// For the songs model. These do not check the session: the caller does.

/** The paths of the score files of a song, e.g. to remove them after the song. */
export async function listScorePaths(songId: string): Promise<string[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .select("path")
    .eq("song_id", songId);
  if (error) throw databaseError("list score files", error);
  return z
    .array(z.object({ path: z.string() }))
    .parse(data)
    .map((row) => row.path);
}

/**
 * Removes files that no score uses. A file that the app cannot remove stays in
 * `stray_files` for the cleanup.
 */
export async function removeScoreFiles(paths: string[]): Promise<void> {
  await removeUnusedFiles(SCORE_BUCKET, paths);
}

type ScoreFile = {
  bytes: Uint8Array;
  format: keyof typeof SCORE_CONTENT_TYPES;
  key: string | null;
};

/** The checked file: plain or compressed MusicXML of at most `SCORE_MAX_BYTES`. The content decides, not the name. */
async function readScoreFile(file: File | undefined): Promise<ScoreFile> {
  if (!file || file.size === 0) throw scoreError(({ m }) => m.server.scores.chooseFile);
  if (file.size > SCORE_MAX_BYTES) {
    throw scoreError(({ m, format }) =>
      format(m.server.scores.tooLarge, { mb: SCORE_MAX_BYTES / (1024 * 1024) }),
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const score = readMusicXml(bytes);
  if (!score) throw scoreError(({ m }) => m.server.scores.fileType);
  return { bytes, format: score.format, key: scoreKey(score.xml) };
}

/** Stores the file under a new path, and returns the path. */
async function uploadScore(songId: string, score: ScoreFile): Promise<string> {
  const path = `${songId}/${randomUUID()}.${score.format}`;
  // The score takes the file out of `stray_files` when it uses it.
  await startStrayFileUpload(SCORE_BUCKET, path);
  const { error } = await (
    await getMusicSupabase()
  ).storage
    .from(SCORE_BUCKET)
    .upload(path, score.bytes, {
      contentType: SCORE_CONTENT_TYPES[score.format],
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    console.error("[scores] Failed to upload score:", error.message);
    throw new Error("Failed to upload score");
  }
  return path;
}

async function getScoreRow(id: string) {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_scores")
    .select("song_id, path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get score", error);
  return data
    ? z.object({ song_id: z.uuid(), path: z.string(), file_name: z.string() }).parse(data)
    : null;
}

/** For example "Amazing Grace - Flute" for "Amazing Grace - Flute.mxl". */
function defaultScoreName(fileName: string): string {
  return nameOfFile(fileName, /\.(mxl|musicxml|xml)$/i, SCORE_NAME_MAX_LENGTH);
}

function nameTakenError(): ValidationError {
  return new ValidationError([{ path: "name", message: ({ m }) => m.server.scores.nameTaken }]);
}

function scoreError(message: Text): ValidationError {
  return new ValidationError([{ path: "score", message }]);
}
