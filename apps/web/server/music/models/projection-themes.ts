import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { PROJECTION_FONT_IDS, isProjectionFontId } from "@/lib/music/projection/fonts";
import {
  BACKGROUND_DIM_MAX,
  colorSchema,
  FALLBACK_LOOK,
  MARGIN_MAX,
  NAME_MAX_LENGTH,
  REFERENCE_SIZE_MAX,
  REFERENCE_SIZE_MIN,
  TEXT_ALIGNS,
  TEXT_SHADOWS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TRANSITION_MS_MAX,
  TRANSITIONS,
  VERTICAL_ALIGNS,
  type ProjectionLook,
  type ProjectionThemeDTO,
} from "@/lib/music/projection/themes";
import {
  isProjectionVideoType,
  PROJECTION_VIDEO_EXTENSIONS,
  PROJECTION_VIDEO_HEADER_BYTES,
  PROJECTION_VIDEO_MAX_BYTES,
  projectionVideoTypeOf,
} from "@/lib/music/projection/videos";
import { getRequestI18n } from "@/i18n/music/server";
import {
  requireEventAdmin,
  requirePrivateFileAccess,
  requireThemeDefaultAdmin,
  requireUser,
} from "@/server/music/auth";
import { ConflictError, ValidationError, type Text } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { readImageSource, storedImage } from "./images";
import { databaseError, isId, isStorageNotFound, parseInput, requiredText } from "./shared";
import { readStoredFileStart } from "./stored-files";
import {
  listOldRows,
  removeFilesWithRows,
  removeUnusedFiles,
  removeUploadedFiles,
  startStrayFileUpload,
} from "./stray-files";

// Projection themes: the look of the projection screens, a shared library
// (see the migration `projection_themes` and `src/lib/projection/themes.ts`).
// An event item uses its own theme, else the theme of its event, else the
// default theme. The event admins and the superadmins change the library;
// only the superadmins choose the default theme. The users who can project an
// event read the themes with it (see `projections.ts`).
//
// A background image goes through a Server Action, as an image page of a
// song: the server stores it as WebP without metadata in the private
// `projection-backgrounds` bucket, and serves it to signed-in users only
// (`src/app/projection-backgrounds/[...path]/route.ts`). A replaced or
// deleted image goes to `stray_files` (a trigger adds it).
//
// A background video does not go through the app, as a sound file: the
// browser puts it to a signed upload URL (`startProjectionVideoUpload`), and
// `setProjectionThemeVideo` checks the stored file before the theme uses it,
// with its poster, a still frame that the browser makes, as the image. The
// screens get it from a signed URL (`src/app/projection-videos/[...path]/route.ts`).

const PROJECTION_THEMES_MAX = 100;
/** The longest side of a stored background, in pixels: a 4K screen. */
const BACKGROUND_MAX_SIDE_PX = 3840;

const BACKGROUND_BUCKET = "projection-backgrounds";

// `<theme id>/<random id>.webp`, as `setProjectionThemeBackground` makes it.
const BACKGROUND_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

const VIDEO_BUCKET = "projection-videos";
// `<theme id>/<random id>.mp4` (or `.webm`), as `startProjectionVideoUpload` makes it.
const VIDEO_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:mp4|webm)$/;
/** The uploads of videos that one user can start in 2 hours and not finish (see `start_projection_video_upload`). */
export const PROJECTION_VIDEO_OPEN_UPLOADS_PER_USER_MAX = 5;
/** A screen plays the video for a whole service, and asks for parts of it again. */
const VIDEO_URL_SECONDS = 12 * 60 * 60;

/** The fields of a theme in the editor. The background image has its own actions. */
const themeInputSchema = z.strictObject({
  name: requiredText(NAME_MAX_LENGTH),
  backgroundColor: colorSchema,
  backgroundDim: z.number().int().min(0).max(BACKGROUND_DIM_MAX),
  font: z.enum(PROJECTION_FONT_IDS),
  textColor: colorSchema,
  // Null: none (see `ProjectionLook.accentColor`). Left out: none, for an editor of the previous version.
  accentColor: colorSchema.nullable().default(null),
  textSize: z.number().int().min(TEXT_SIZE_MIN).max(TEXT_SIZE_MAX),
  // Left out: the saved size stays, for an editor of the previous version. A new theme gets 100 from the database.
  referenceSize: z.number().int().min(REFERENCE_SIZE_MIN).max(REFERENCE_SIZE_MAX).optional(),
  textAlign: z.enum(TEXT_ALIGNS),
  verticalAlign: z.enum(VERTICAL_ALIGNS),
  textShadow: z.enum(TEXT_SHADOWS),
  margin: z.number().int().min(0).max(MARGIN_MAX),
  transition: z.enum(TRANSITIONS),
  transitionMs: z.number().int().min(0).max(TRANSITION_MS_MAX),
  // Left out: the saved time stays, for an editor of the previous version. A new theme gets 600 from the database.
  rollTransitionMs: z.number().int().min(0).max(TRANSITION_MS_MAX).optional(),
});

export type ThemeInput = z.input<typeof themeInputSchema>;

/** How many events, items and arrangements use a theme, for the warning before a delete. */
export type ThemeUsesDTO = { events: number; items: number; arrangements: number };

const THEME_COLUMNS =
  "id, name, is_default, background_color, background_image_path, background_dim, font, text_color, accent_color, text_size, reference_size, text_align, vertical_align, text_shadow, margin, transition, transition_ms, roll_transition_ms, background_video_path";

const themeRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_default: z.boolean(),
  background_color: z.string(),
  background_image_path: z.string().nullable(),
  background_dim: z.number().int(),
  font: z.string(),
  text_color: z.string(),
  accent_color: z.string().nullable(),
  text_size: z.number().int(),
  reference_size: z.number().int(),
  text_align: z.enum(TEXT_ALIGNS),
  vertical_align: z.enum(VERTICAL_ALIGNS),
  text_shadow: z.enum(TEXT_SHADOWS),
  margin: z.number().int(),
  transition: z.enum(TRANSITIONS),
  transition_ms: z.number().int(),
  roll_transition_ms: z.number().int(),
  background_video_path: z.string().nullable(),
});

const NAME_TAKEN = () =>
  new ValidationError([{ path: "name", message: ({ m }) => m.server.projectionThemes.nameTaken }]);

/** All themes, the default first, then by name. For the editors of the themes and of the events. */
export async function listProjectionThemes(): Promise<ProjectionThemeDTO[]> {
  await requireEventAdmin();
  return readProjectionThemes();
}

/**
 * All themes, the default first, then by name. It does not check the
 * session: the caller does, e.g. the projection of an event.
 */
export async function readProjectionThemes(): Promise<ProjectionThemeDTO[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select(THEME_COLUMNS)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw databaseError("list projection themes", error);
  const rows = z.array(themeRowSchema).parse(data);
  if (rows.length > 0) return rows.map(toTheme);

  // A church starts without themes: its default theme (the look from before the themes) is made
  // on the first read.
  const created = await (await getMusicSupabase()).rpc("default_projection_theme_id");
  if (created.error) throw databaseError("create the default projection theme", created.error);
  const again = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select(THEME_COLUMNS)
    .order("is_default", { ascending: false })
    .order("name");
  if (again.error) throw databaseError("list projection themes", again.error);
  return z.array(themeRowSchema).parse(again.data).map(toTheme);
}

/** The look of the default theme, e.g. for a rehearsal projection. Every signed-in user can read it. */
export async function getDefaultProjectionLook(): Promise<ProjectionLook> {
  await requireUser();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select(THEME_COLUMNS)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw databaseError("get default projection theme", error);
  return data ? toTheme(themeRowSchema.parse(data)).look : FALLBACK_LOOK;
}

/** Creates a theme. Returns its id. */
export async function createProjectionTheme(input: unknown): Promise<string> {
  await requireEventAdmin();
  const theme = parseInput(themeInputSchema, input);

  const { count, error: countError } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select("id", { count: "exact", head: true });
  if (countError) throw databaseError("count projection themes", countError);
  if ((count ?? 0) >= PROJECTION_THEMES_MAX) throw tooManyError();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .insert(toRow(theme))
    .select("id")
    .single();
  if (error) throw databaseError("create projection theme", error, { "23505": NAME_TAKEN });
  return z.object({ id: z.uuid() }).parse(data).id;
}

/** Replaces the fields of a theme, but not its image. Returns false if there is no such theme. */
export async function updateProjectionTheme(id: string, input: unknown): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  const theme = parseInput(themeInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .update(toRow(theme))
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("update projection theme", error, { "23505": NAME_TAKEN });
  return data.length > 0;
}

/**
 * Creates a copy of a theme, e.g. "Worship (copy)", also with a copy of its
 * image. Not the default. Returns the id of the copy, or null if there is no
 * such theme.
 */
export async function duplicateProjectionTheme(id: string): Promise<string | null> {
  await requireEventAdmin();
  if (!isId(id)) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select(THEME_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get projection theme", error);
  if (!data) return null;
  const source = themeRowSchema.parse(data);

  const { m, format } = await getRequestI18n();
  const names = new Set((await readProjectionThemes()).map((theme) => theme.name));
  if (names.size >= PROJECTION_THEMES_MAX) throw tooManyError();
  // E.g. "Worship (copy)", then "Worship (copy) 2". Cut to the longest name.
  const base = format(m.server.projectionThemes.copyName, { name: source.name }).trim();
  let name = base.slice(0, NAME_MAX_LENGTH).trimEnd();
  for (let number = 2; names.has(name); number++) {
    const suffix = ` ${number}`;
    name = base.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
  }

  const sourcePath = source.background_image_path;
  const { look } = toTheme(source);
  const { data: created, error: createError } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .insert(
      toRow({
        name,
        backgroundColor: look.background.color,
        backgroundDim: look.background.dim,
        font: look.font,
        textColor: look.textColor,
        accentColor: look.accentColor,
        textSize: look.textSize,
        referenceSize: look.referenceSize,
        textAlign: look.textAlign,
        verticalAlign: look.verticalAlign,
        textShadow: look.textShadow,
        margin: look.margin,
        transition: look.transition.kind,
        transitionMs: look.transition.ms,
        rollTransitionMs: look.transition.rollMs,
      }),
    )
    .select("id")
    .single();
  if (createError)
    throw databaseError("duplicate projection theme", createError, { "23505": NAME_TAKEN });
  const copyId = z.object({ id: z.uuid() }).parse(created).id;

  if (sourcePath) {
    // The copy gets its own files: the background of each theme can change on its own.
    const path = await copyBackgroundFile(
      BACKGROUND_BUCKET,
      sourcePath,
      `${copyId}/${randomUUID()}.webp`,
    );
    // A video only with its poster.
    const videoSource = source.background_video_path;
    const videoPath =
      path && videoSource
        ? await copyBackgroundFile(
            VIDEO_BUCKET,
            videoSource,
            `${copyId}/${randomUUID()}${videoSource.slice(videoSource.lastIndexOf("."))}`,
          )
        : null;
    if (path) {
      const { error: updateError } = await (
        await getMusicSupabase()
      )
        .from("projection_themes")
        .update({ background_image_path: path, background_video_path: videoPath })
        .eq("id", copyId);
      if (updateError) throw databaseError("set copied projection background", updateError);
    }
  }
  return copyId;
}

/**
 * Copies a background file for a copy of a theme. The copy is in
 * `stray_files` until the theme has it. Null when it fails: the copy of the
 * theme stays without it.
 */
async function copyBackgroundFile(
  bucket: "projection-backgrounds" | "projection-videos",
  from: string,
  to: string,
): Promise<string | null> {
  await startStrayFileUpload(bucket, to);
  const { error } = await (await getMusicSupabase()).storage.from(bucket).copy(from, to);
  if (!error) return to;
  console.error(`[projection-themes] Failed to copy a ${bucket} file:`, error.message);
  return null;
}

/**
 * Deletes a theme and its image. The events and the items that used it then
 * use the theme of the event, or the default theme. The default theme cannot
 * be deleted. Returns false if there is no such theme.
 */
export async function deleteProjectionTheme(id: string): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;

  const { data: theme, error: readError } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw databaseError("get projection theme", readError);
  if (!theme) return false;
  if (z.object({ is_default: z.boolean() }).parse(theme).is_default) throw defaultThemeError();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .delete()
    .eq("id", id)
    .select("background_image_path, background_video_path");
  // The database checks the default too, e.g. when another request moved the mark meanwhile.
  if (error)
    throw databaseError("delete projection theme", error, {
      "P0001:default_theme": defaultThemeError,
    });

  const rows = z.array(backgroundPathsSchema).parse(data);
  await removeOldBackground(rows);
  return data.length > 0;
}

/** How many events, items and arrangements use the theme now. Zero for a theme that does not exist. */
export async function countProjectionThemeUses(id: string): Promise<ThemeUsesDTO> {
  await requireEventAdmin();
  if (!isId(id)) return { events: 0, items: 0, arrangements: 0 };

  const [events, items, arrangements] = await Promise.all([
    (await getMusicSupabase())
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("projection_theme_id", id),
    (await getMusicSupabase())
      .from("setlist_item_themes")
      .select("setlist_item_id", { count: "exact", head: true })
      .eq("theme_id", id),
    (await getMusicSupabase())
      .from("arrangements")
      .select("id", { count: "exact", head: true })
      .eq("projection_theme_id", id),
  ]);
  if (events.error) throw databaseError("count projection theme events", events.error);
  if (items.error) throw databaseError("count projection theme items", items.error);
  if (arrangements.error)
    throw databaseError("count projection theme arrangements", arrangements.error);
  return {
    events: events.count ?? 0,
    items: items.count ?? 0,
    arrangements: arrangements.count ?? 0,
  };
}

/** Makes the theme the default. Only for superadmins. Returns false if there is no such theme. */
export async function setDefaultProjectionTheme(id: string): Promise<boolean> {
  await requireThemeDefaultAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_default_projection_theme", { p_id: id });
  if (error) throw databaseError("set default projection theme", error);
  return z.boolean().parse(data);
}

/**
 * Sets the background image of a theme: a PNG, JPEG or WebP image of at most
 * `IMAGE_PAGE_MAX_BYTES`. The stored image is at most `BACKGROUND_MAX_SIDE_PX`
 * on its longest side, as WebP, without metadata. It replaces a video too.
 * Returns false if there is no such theme.
 */
export async function setProjectionThemeBackground(
  id: string,
  file: File | undefined,
): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  const source = await readImageSource(file);

  // Before the conversion: it costs much more than this query.
  const old = await readBackgroundPaths(id);
  if (!old) return false;

  const path = await storeBackgroundImage(id, source);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .update({ background_image_path: path, background_video_path: null })
    .eq("id", id)
    .select("id");
  if (error) {
    // The theme can use the file, e.g. after a lost response. The file stays
    // in `stray_files` until the theme has it, so the cleanup removes it if
    // the update did not happen.
    throw databaseError("set projection background", error);
  }
  if (data.length === 0) {
    // Do not leave a file that no theme uses.
    await removeUnusedFiles(BACKGROUND_BUCKET, [path]);
    return false;
  }

  // A trigger moved the old files to `stray_files`.
  await removeOldBackground([old]);
  return true;
}

/** Removes the background image or video of a theme. Returns false if there is no such theme. */
export async function removeProjectionThemeBackground(id: string): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  const old = await readBackgroundPaths(id);
  if (!old) return false;

  const { error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .update({ background_image_path: null, background_video_path: null })
    .eq("id", id);
  if (error) throw databaseError("remove projection background", error);
  await removeOldBackground([old]);
  return true;
}

/**
 * Starts the upload of a background video for the theme: the browser puts
 * the file to `uploadUrl` (HTTP PUT, with the `type` as its content type),
 * then calls `setProjectionThemeVideo` with `path`. Returns null if there is
 * no such theme.
 */
export async function startProjectionVideoUpload(
  themeId: string,
  type: string,
): Promise<{ path: string; uploadUrl: string } | null> {
  const user = await requireEventAdmin();
  if (!isId(themeId)) return null;
  if (!isProjectionVideoType(type))
    throw videoError(({ m }) => m.server.projectionThemes.videoType);
  if ((await readBackgroundPaths(themeId)) === undefined) return null;

  const path = `${themeId}/${randomUUID()}.${PROJECTION_VIDEO_EXTENSIONS[type]}`;
  // First the row, so that the cleanup knows the file even if this request stops after the signing.
  const { error: insertError } = await (
    await getMusicSupabase()
  ).rpc("start_projection_video_upload", {
    p_user_id: user.id,
    p_path: path,
    p_max: PROJECTION_VIDEO_OPEN_UPLOADS_PER_USER_MAX,
  });
  if (insertError) {
    throw databaseError("start projection video upload", insertError, {
      "P0001:too_many_projection_video_uploads": () =>
        new ConflictError(({ m, format }) =>
          format(m.server.projectionThemes.tooManyVideoUploads, {
            max: PROJECTION_VIDEO_OPEN_UPLOADS_PER_USER_MAX,
          }),
        ),
    });
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(path);
  if (error) {
    console.error("[projection-themes] Failed to sign the video upload:", error.message);
    throw new Error("Failed to sign the projection video upload");
  }
  return { path, uploadUrl: data.signedUrl };
}

/**
 * Sets the uploaded video `path` (see `startProjectionVideoUpload`) as the
 * background of the theme, with `poster`, a still frame of it, as the image
 * (see `setProjectionThemeBackground`). It checks the stored file first, and
 * removes it when it is not an MP4 or WebM video of at most
 * `PROJECTION_VIDEO_MAX_BYTES`. Returns false if there is no such theme.
 */
export async function setProjectionThemeVideo(
  id: string,
  path: string,
  poster: File | undefined,
): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  if (typeof path !== "string" || !VIDEO_PATH_PATTERN.test(path) || !path.startsWith(`${id}/`)) {
    throw videoError(({ m }) => m.server.projectionThemes.videoUploadMissing);
  }
  const source = await readImageSource(poster);

  const file = await readStoredFileStart(VIDEO_BUCKET, path, PROJECTION_VIDEO_HEADER_BYTES);
  if (!file) throw videoError(({ m }) => m.server.projectionThemes.videoUploadMissing);
  const problem = checkVideo(file.sizeBytes, file.start, path);
  if (problem) {
    await removeUploadedFiles(VIDEO_BUCKET, [{ path }]);
    throw videoError(problem);
  }

  const old = await readBackgroundPaths(id);
  if (!old) {
    await removeUploadedFiles(VIDEO_BUCKET, [{ path }]);
    return false;
  }

  const posterPath = await storeBackgroundImage(id, source);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_projection_theme_video", {
    p_theme_id: id,
    p_video_path: path,
    p_poster_path: posterPath,
  });
  if (error || data === false) {
    // The poster: in `stray_files` until a theme has it. The video: only when
    // the database refused it. Without its upload row, the video is not of
    // this call: an earlier call set it (e.g. a second click), or the cleanup
    // removed it. After another error, e.g. a lost response, the theme can
    // have both: the cleanup removes them if it does not.
    if (!error || error.hint === "projection_video_upload_missing")
      await removeUnusedFiles(BACKGROUND_BUCKET, [posterPath]);
    if (!error) {
      await removeUploadedFiles(VIDEO_BUCKET, [{ path }]);
      return false;
    }
    throw databaseError("set projection video", error, {
      "P0001:projection_video_upload_missing": () =>
        videoError(({ m }) => m.server.projectionThemes.videoUploadMissing),
    });
  }

  // A trigger moved the old files to `stray_files`.
  await removeOldBackground([old]);
  return true;
}

/**
 * A signed URL of a background video for a signed-in user, or null if no
 * theme has this file. `path` is the part of the URL after `/projection-videos/`.
 */
export async function getProjectionVideoUrl(path: string): Promise<string | null> {
  await requireUser();
  if (!VIDEO_PATH_PATTERN.test(path)) return null;

  const { data: row, error: rowError } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select("id")
    .eq("background_video_path", path)
    .maybeSingle();
  if (rowError) throw databaseError("get projection video", rowError);
  if (!row) return null;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(path, VIDEO_URL_SECONDS);
  if (error) {
    // A file that is not in Storage is not found. Another error is a failure
    // (500), so a short outage of Storage does not look like a missing file.
    if (isStorageNotFound(error)) return null;
    console.error("[projection-themes] Failed to sign the video URL:", error.message);
    throw new Error("Failed to sign the projection video URL");
  }
  return data.signedUrl;
}

/**
 * Removes the files of the video uploads that started long ago but were not
 * set, e.g. when the browser closed during an upload. The scheduled job
 * calls it. It does not check the session. A failure is only logged: the
 * next run tries again.
 */
export async function removeUnfinishedProjectionVideoUploads(): Promise<void> {
  const rows = await listOldRows("projection_video_uploads", "path");
  const paths = z
    .array(z.object({ path: z.string() }))
    .parse(rows)
    .map((row) => row.path);
  await removeFilesWithRows(VIDEO_BUCKET, "projection_video_uploads", paths);
}

/**
 * The file of a background for a signed-in user, or null if there is no such
 * file. `path` is the part of the URL after `/projection-backgrounds/`.
 */
export async function getProjectionBackgroundFile(path: string): Promise<Blob | null> {
  if (!BACKGROUND_PATH_PATTERN.test(path)) return null;
  if (!(await requirePrivateFileAccess(BACKGROUND_BUCKET, path))) return null;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(BACKGROUND_BUCKET)
    .download(path);
  if (error) return null;
  return data;
}

/** For the foreign key error of a theme that another request deleted meanwhile. */
export function themeMissingError(): ConflictError {
  return new ConflictError(({ m }) => m.server.projectionThemes.themeMissing);
}

const backgroundPathsSchema = z.object({
  background_image_path: z.string().nullable(),
  background_video_path: z.string().nullable(),
});

type BackgroundPaths = z.infer<typeof backgroundPathsSchema>;

/** The paths of the image and the video of a theme, undefined if there is no such theme. */
async function readBackgroundPaths(id: string): Promise<BackgroundPaths | undefined> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("projection_themes")
    .select("background_image_path, background_video_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get projection background", error);
  if (!data) return undefined;
  return backgroundPathsSchema.parse(data);
}

/** Removes the files of old backgrounds: a trigger moved them to `stray_files`. */
async function removeOldBackground(old: BackgroundPaths[]): Promise<void> {
  const images = old.flatMap((row) =>
    row.background_image_path ? [row.background_image_path] : [],
  );
  const videos = old.flatMap((row) =>
    row.background_video_path ? [row.background_video_path] : [],
  );
  await Promise.all([
    removeUnusedFiles(BACKGROUND_BUCKET, images),
    removeUnusedFiles(VIDEO_BUCKET, videos),
  ]);
}

/** Stores the image as a new background file of the theme, and returns its path. No theme has it yet. */
async function storeBackgroundImage(
  id: string,
  source: Awaited<ReturnType<typeof readImageSource>>,
): Promise<string> {
  const image = await storedImage(source, BACKGROUND_MAX_SIDE_PX);
  const path = `${id}/${randomUUID()}.webp`;
  // First the row, so that the cleanup knows the file even if this request stops after the upload.
  await startStrayFileUpload(BACKGROUND_BUCKET, path);
  const { error } = await (
    await getMusicSupabase()
  ).storage
    .from(BACKGROUND_BUCKET)
    .upload(path, image.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    console.error("[projection-themes] Failed to upload a background:", error.message);
    throw new Error("Failed to upload a projection background");
  }
  return path;
}

/** The problem of a stored file that is not a video of the format of its path, or null. */
function checkVideo(sizeBytes: number, start: Uint8Array, path: string): Text | null {
  if (sizeBytes === 0) return ({ m }) => m.server.projectionThemes.videoType;
  if (sizeBytes > PROJECTION_VIDEO_MAX_BYTES) {
    return ({ m, format }) =>
      format(m.server.projectionThemes.videoTooLarge, {
        mb: PROJECTION_VIDEO_MAX_BYTES / (1024 * 1024),
      });
  }
  const type = projectionVideoTypeOf(start);
  if (!type || !path.endsWith(`.${PROJECTION_VIDEO_EXTENSIONS[type]}`))
    return ({ m }) => m.server.projectionThemes.videoType;
  return null;
}

function videoError(message: Text): ValidationError {
  return new ValidationError([{ path: "video", message }]);
}

function toTheme(row: z.infer<typeof themeRowSchema>): ProjectionThemeDTO {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    look: {
      background: {
        color: row.background_color,
        image: row.background_image_path
          ? `/munkater/vetites/fajl/hatter/${row.background_image_path}`
          : null,
        video: row.background_video_path
          ? `/munkater/vetites/fajl/video/${row.background_video_path}`
          : null,
        dim: row.background_dim,
      },
      // A font that the app does not have anymore.
      font: isProjectionFontId(row.font) ? row.font : FALLBACK_LOOK.font,
      textColor: row.text_color,
      accentColor: row.accent_color,
      textSize: row.text_size,
      referenceSize: row.reference_size,
      textAlign: row.text_align,
      verticalAlign: row.vertical_align,
      textShadow: row.text_shadow,
      margin: row.margin,
      transition: { kind: row.transition, ms: row.transition_ms, rollMs: row.roll_transition_ms },
    },
  };
}

function toRow(theme: z.output<typeof themeInputSchema>) {
  return {
    name: theme.name,
    background_color: theme.backgroundColor,
    background_dim: theme.backgroundDim,
    font: theme.font,
    text_color: theme.textColor,
    accent_color: theme.accentColor,
    text_size: theme.textSize,
    ...(theme.referenceSize !== undefined && { reference_size: theme.referenceSize }),
    text_align: theme.textAlign,
    vertical_align: theme.verticalAlign,
    text_shadow: theme.textShadow,
    margin: theme.margin,
    transition: theme.transition,
    transition_ms: theme.transitionMs,
    ...(theme.rollTransitionMs !== undefined && { roll_transition_ms: theme.rollTransitionMs }),
  };
}

function tooManyError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.projectionThemes.tooMany, { max: PROJECTION_THEMES_MAX }),
  );
}

function defaultThemeError(): ConflictError {
  return new ConflictError(({ m }) => m.server.projectionThemes.defaultTheme);
}
