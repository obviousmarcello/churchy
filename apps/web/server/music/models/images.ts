import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { sortAttachmentKeys } from "@/lib/music/attachments";
import { requirePrivateFileAccess, requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError, type Text } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { attachmentArrangementIdsSchema, attachmentKeysSchema } from "./pdfs";
import { databaseError, idSchema, isId, optionalText, parseInput } from "./shared";
import { listOldRows, removeFilesWithRows } from "./stray-files";

// Images: sheet music of a song as photos or scans, e.g. a photo of a
// handwritten chord sheet, each with its own name and one or more pages. Like
// a PDF, an image can be for some arrangements of the song and for some keys:
// none means all arrangements or any key. Every signed-in user can see them;
// only song admins and superadmins can change them.
//
// The browser makes each photo smaller before the upload, so a page goes
// through a Server Action (`serverActions.bodySizeLimit` in `next.config.ts`).
// The server stores each page as a WebP image without metadata in the private
// `song-images` bucket, and serves it to signed-in users only
// (`src/app/song-images/[...path]/route.ts`).
//
// A file that no page may use has a row in `song_image_stray_files`: an upload
// before its page exists, and the file of a removed page (a trigger adds it).
// The app removes the file and the row at once when it can, and
// `removeStrayImageFiles` removes the rest later.

/** The most images of one song. */
export const IMAGES_PER_SONG_MAX = 20;
/** The most pages of one image. */
export const IMAGE_PAGES_MAX = 12;
/**
 * The largest upload of one page. The server makes each page a smaller WebP
 * image, so this limit applies only to the uploaded file. Keep it below
 * `serverActions.bodySizeLimit` in `next.config.ts`.
 */
export const IMAGE_PAGE_MAX_BYTES = 8 * 1024 * 1024;
/**
 * The largest page that the browser sends after it made the photo smaller. A
 * Vercel Function accepts at most 4.5 MB in a request, with the other fields.
 */
export const IMAGE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_NAME_MAX_LENGTH = 100;
/** The longest side of a stored page, in pixels. Enough to read small chord names. */
export const IMAGE_MAX_SIDE_PX = 2560;

// A larger image takes too much memory to decode. Phone photos are smaller.
const IMAGE_MAX_INPUT_PIXELS = 50_000_000;
/** The largest stored page. The file route sends it through the Vercel Function, which sends at most 4.5 MB. */
const STORED_MAX_BYTES = 4 * 1024 * 1024;
/** The WebP qualities to try, from the best. A lower quality makes a smaller file. */
const WEBP_QUALITIES = [82, 65, 50];

const IMAGE_BUCKET = "song-images";

// `<song id>/<image id>/<random id>.webp`, as `addSongImagePage` makes it.
const PAGE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

// The uploads that the server decodes. The file content decides, not its
// name, so the image library never sees other formats (e.g. SVG).
const SOURCE_TYPES: ((bytes: Uint8Array) => boolean)[] = [
  // PNG
  (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // JPEG
  (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  // WebP: "RIFF", the file size, then "WEBP".
  (b) =>
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
];

export type SongImagePageDTO = {
  id: string;
  /** A path on this site that serves the file. */
  url: string;
  /** In pixels, so that a page that is not loaded yet takes its place. */
  width: number;
  height: number;
};

export type SongImageDTO = {
  id: string;
  /** What the image is, e.g. "Chord sheet". */
  name: string;
  /** The keys of the image, in English note names, in the order of `ATTACHMENT_KEYS`. Empty: any key. */
  keys: string[];
  /** The arrangements of the image. Empty: all arrangements of the song. */
  arrangementIds: string[];
  /** In order. Empty only when all uploads of the pages failed. */
  pages: SongImagePageDTO[];
};

export const IMAGE_COLUMNS =
  "id, name, musical_keys, song_image_arrangements (arrangement_id), song_image_pages (id, position, path, width, height)";

export const imageRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  musical_keys: z.array(z.string()),
  song_image_arrangements: z.array(z.object({ arrangement_id: z.uuid() })),
  song_image_pages: z.array(
    z.object({
      id: z.uuid(),
      position: z.number(),
      path: z.string(),
      width: z.number(),
      height: z.number(),
    }),
  ),
});

/** A blank name uses `m.server.images.defaultName`. */
const imageInputSchema = z.strictObject({
  name: optionalText(IMAGE_NAME_MAX_LENGTH),
  keys: attachmentKeysSchema,
  arrangementIds: attachmentArrangementIdsSchema,
});

const pageIdsSchema = z.array(idSchema).max(IMAGE_PAGES_MAX);

export function toSongImage(row: z.infer<typeof imageRowSchema>): SongImageDTO {
  return {
    id: row.id,
    name: row.name,
    keys: sortAttachmentKeys(row.musical_keys),
    arrangementIds: row.song_image_arrangements.map((link) => link.arrangement_id),
    pages: row.song_image_pages
      .toSorted((a, b) => a.position - b.position)
      .map((page) => ({
        id: page.id,
        url: `/song-images/${page.path}`,
        width: page.width,
        height: page.height,
      })),
  };
}

/** By name. `compare` is `i18n.compare` of the request. */
export function sortImages(
  images: SongImageDTO[],
  compare: (a: string, b: string) => number,
): SongImageDTO[] {
  return images.toSorted((a, b) => compare(a.name, b.name));
}

/** The images of these songs, by song. Songs without images are not in the map. */
export async function listImagesOfSongs(songIds: string[]): Promise<Map<string, SongImageDTO[]>> {
  await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_images")
    .select(`song_id, ${IMAGE_COLUMNS}`)
    .in("song_id", ids);
  if (error) throw databaseError("list images", error);

  const { compare } = await getRequestI18n();
  const images = new Map<string, SongImageDTO[]>();
  for (const row of z.array(imageRowSchema.extend({ song_id: z.uuid() })).parse(data)) {
    images.set(row.song_id, [...(images.get(row.song_id) ?? []), toSongImage(row)]);
  }
  for (const [songId, list] of images) images.set(songId, sortImages(list, compare));
  return images;
}

/** One image with the id of its song, or null if there is no such image. */
export async function getSongImage(
  id: string,
): Promise<(SongImageDTO & { songId: string }) | null> {
  await requireUser();
  if (!isId(id)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_images")
    .select(`song_id, ${IMAGE_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get image", error);
  if (!data) return null;

  const row = imageRowSchema.extend({ song_id: z.uuid() }).parse(data);
  return { ...toSongImage(row), songId: row.song_id };
}

/**
 * Adds an image without pages to the song. The browser then adds the pages
 * one by one with `addSongImagePage`. Returns the id of the image, or null if
 * there is no such song.
 */
export async function addSongImage(songId: string, input: unknown): Promise<string | null> {
  await requireSongAdmin();
  if (!isId(songId)) return null;
  const { name, keys, arrangementIds } = parseInput(imageInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_song_image", {
    p_song_id: songId,
    p_name: name ?? (await defaultName()),
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
    p_max: IMAGES_PER_SONG_MAX,
  });
  if (error) {
    throw databaseError("add image", error, {
      "P0001:too_many_images": () =>
        new ConflictError(({ m, format }) =>
          format(m.server.images.tooMany, { max: IMAGES_PER_SONG_MAX }),
        ),
      "P0001:image_arrangement": () => arrangementError(),
    });
  }
  return z.uuid().nullable().parse(data);
}

/**
 * Changes the name, the keys and the arrangements of an image. Returns false
 * if there is no such image.
 */
export async function updateSongImage(id: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { name, keys, arrangementIds } = parseInput(imageInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("update_song_image", {
    p_id: id,
    p_name: name ?? (await defaultName()),
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
  });
  if (error)
    throw databaseError("update image", error, {
      "P0001:image_arrangement": () => arrangementError(),
    });
  return data === true;
}

/** Removes an image with its pages and their files. Returns false if there is no such image. */
export async function removeSongImage(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  // A page that is added after this list goes with the image too: its file
  // then stays in `song_image_stray_files` for the cleanup.
  const { data: pages, error: pagesError } = await (
    await getMusicSupabase()
  )
    .from("song_image_pages")
    .select("path")
    .eq("image_id", id);
  if (pagesError) throw databaseError("list image pages", pagesError);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_images")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("remove image", error);

  await removeImageFiles(
    z
      .array(z.object({ path: z.string() }))
      .parse(pages)
      .map((page) => page.path),
  );
  return data.length > 0;
}

/**
 * Adds a PNG, JPEG or WebP image of at most `IMAGE_PAGE_MAX_BYTES` as the last
 * page of the image. The stored page is at most `IMAGE_MAX_SIDE_PX` on its
 * longest side, as WebP, without metadata (e.g. without the GPS position of a
 * phone photo). Returns false if there is no such image.
 */
export async function addSongImagePage(imageId: string, file: File | undefined): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(imageId)) return false;
  const source = await readImageSource(file);

  // Before the conversion: it costs much more than this query.
  const { data: image, error: imageError } = await (
    await getMusicSupabase()
  )
    .from("song_images")
    .select("song_id")
    .eq("id", imageId)
    .maybeSingle();
  if (imageError) throw databaseError("get image", imageError);
  if (!image) return false;

  const page = await storedImage(source);
  const songId = z.object({ song_id: z.uuid() }).parse(image).song_id;
  const path = `${songId}/${imageId}/${randomUUID()}.webp`;
  // First the row, so that the cleanup knows the file even if this request stops after the upload.
  const { error: strayError } = await (
    await getMusicSupabase()
  )
    .from("song_image_stray_files")
    .insert({ path });
  if (strayError) throw databaseError("start image page upload", strayError);
  const { error: uploadError } = await (
    await getMusicSupabase()
  ).storage
    .from(IMAGE_BUCKET)
    .upload(path, page.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    console.error("[images] Failed to upload a page:", uploadError.message);
    throw new Error("Failed to upload an image page");
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_song_image_page", {
    p_image_id: imageId,
    p_path: path,
    p_width: page.width,
    p_height: page.height,
    p_size_bytes: page.bytes.length,
    p_max: IMAGE_PAGES_MAX,
  });
  if (error || data === null) {
    // Do not leave a file that no page uses.
    await removeImageFiles([path]);
    if (!error) return false;
    throw databaseError("add image page", error, {
      "P0001:too_many_image_pages": () => tooManyPagesError(),
    });
  }
  return true;
}

/**
 * Puts the pages of an image in the order of `pageIds`, which must have each
 * page of the image once. Returns false if there is no such image.
 */
export async function moveSongImagePages(imageId: string, pageIds: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(imageId)) return false;
  const ids = parseInput(pageIdsSchema, pageIds);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("move_song_image_pages", {
    p_image_id: imageId,
    p_page_ids: ids,
  });
  if (error) {
    throw databaseError("move image pages", error, {
      "P0001:image_pages": () => new ConflictError(({ m }) => m.server.images.pagesChanged),
    });
  }
  return data === true;
}

/** Removes one page of an image and its file. Returns false if there is no such page. */
export async function removeSongImagePage(pageId: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(pageId)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_image_pages")
    .delete()
    .eq("id", pageId)
    .select("path");
  if (error) throw databaseError("remove image page", error);

  await removeImageFiles(
    z
      .array(z.object({ path: z.string() }))
      .parse(data)
      .map((row) => row.path),
  );
  return data.length > 0;
}

/**
 * The file of a page for a signed-in user, or null if there is no such file.
 * `path` is the part of the page URL after `/song-images/`.
 */
export async function getSongImageFile(path: string): Promise<Blob | null> {
  if (!PAGE_PATH_PATTERN.test(path)) return null;
  // As for avatars: a full session check for each page would make a long image
  // slow. One database call checks the session and that a page has the file.
  if (!(await requirePrivateFileAccess("song-images", path))) return null;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(IMAGE_BUCKET)
    .download(path);
  if (error) return null;
  return data;
}

// For the songs model. These do not check the session: the caller does.

/** The paths of the image files of a song, e.g. to remove them after the song. */
export async function listImagePaths(songId: string): Promise<string[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_image_pages")
    .select("path, song_images!inner (song_id)")
    .eq("song_images.song_id", songId);
  if (error) throw databaseError("list image files", error);
  return z
    .array(z.object({ path: z.string() }))
    .parse(data)
    .map((row) => row.path);
}

/**
 * Removes the files and their rows in `song_image_stray_files`. Only for files
 * that no page uses. A failure is only logged: `removeStrayImageFiles` tries
 * again later.
 */
export async function removeImageFiles(paths: string[]): Promise<void> {
  await removeFilesWithRows(IMAGE_BUCKET, "song_image_stray_files", paths);
}

/**
 * Removes the stray files (see `song_image_stray_files`) that are some hours
 * old, e.g. of an upload that stopped before its page, or of a removed page
 * whose file the app could not remove. The scheduled job calls it. It does not
 * check the session.
 */
export async function removeStrayImageFiles(): Promise<void> {
  const rows = await listOldRows("song_image_stray_files", "path");
  await removeImageFiles(
    z
      .array(z.object({ path: z.string() }))
      .parse(rows)
      .map((row) => row.path),
  );
}

/**
 * The bytes of an uploaded image, e.g. also of a projection background. The
 * file content decides its type, not its name.
 */
export async function readImageSource(file: File | undefined): Promise<Uint8Array> {
  if (!file || file.size === 0) throw pageError(({ m }) => m.server.images.chooseImage);
  if (file.size > IMAGE_PAGE_MAX_BYTES) {
    throw pageError(({ m, format }) =>
      format(m.server.images.tooLarge, { mb: IMAGE_PAGE_MAX_BYTES / (1024 * 1024) }),
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!SOURCE_TYPES.some((matches) => matches(bytes)))
    throw pageError(({ m }) => m.server.images.imageType);
  return bytes;
}

/**
 * The page as stored: at most `maxSide` (by default `IMAGE_MAX_SIDE_PX`) on
 * its longest side, turned as the photo was taken, as WebP of at most
 * `STORED_MAX_BYTES`. The new file has no metadata and only the first frame
 * of an animation.
 */
export async function storedImage(
  bytes: Uint8Array,
  maxSide = IMAGE_MAX_SIDE_PX,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  try {
    // Decoded, turned and resized once: only the encoding changes with the quality.
    const { data: pixels, info } = await sharp(bytes, {
      limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
      failOn: "error",
      autoOrient: true,
    })
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = { width: info.width, height: info.height, channels: info.channels };
    for (const quality of WEBP_QUALITIES) {
      const data = await sharp(pixels, { raw }).webp({ quality }).toBuffer();
      if (data.length <= STORED_MAX_BYTES)
        return { bytes: data, width: info.width, height: info.height };
    }
  } catch (error) {
    // A damaged file, or an image with too many pixels.
    console.error(
      "[images] Failed to convert a page:",
      error instanceof Error ? error.message : error,
    );
  }
  throw pageError(({ m }) => m.server.images.imageUnusable);
}

async function defaultName(): Promise<string> {
  return (await getRequestI18n()).m.server.images.defaultName;
}

function arrangementError(): ValidationError {
  return new ValidationError([
    { path: "arrangementIds", message: ({ m }) => m.server.images.unknownArrangement },
  ]);
}

function tooManyPagesError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.images.tooManyPages, { max: IMAGE_PAGES_MAX }),
  );
}

function pageError(message: Text): ValidationError {
  return new ValidationError([{ path: "image", message }]);
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
