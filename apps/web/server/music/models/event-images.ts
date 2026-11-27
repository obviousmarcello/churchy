import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import {
  DEFAULT_IMAGE_ADJUST,
  EVENT_IMAGES_MAX,
  IMAGE_BACKGROUNDS,
  IMAGE_FITS,
  IMAGE_NAME_MAX_LENGTH,
  IMAGE_ROTATIONS,
  imageAdjustSchema,
  type EventImageDTO,
  type EventImageSetsDTO,
} from "@/lib/music/projection/images";
import { requireEventAdmin, requirePrivateFileAccess, requireUser } from "@/server/music/auth";
import { ConflictError, ForbiddenError } from "@/server/music/errors";
import { NOT_MODIFIED } from "@/server/music/private-file";
import { getMusicSupabase } from "@/server/music/db";
import { canSeeEvent, requireEventAdminOf } from "./event-access";
import { readImageSource, storedImage } from "./images";
import { databaseError, idSchema, isId, optionalText, parseInput, requiredText } from "./shared";
import { removeUnusedFiles, STRAY_FILE_MAX_AGE_MS, startStrayFileUpload } from "./stray-files";

// The images of an event, e.g. announcements or photos, to show on the
// projection screens (see the migrations `event_images` and
// `event_image_items`, and `src/lib/projection/images.ts`). The images are in
// sets: an image item of the event has a set, e.g. one image, or the pages of
// a PDF file. Every signed-in user can see them, as the event. The event
// admins add, reorder and remove them. The users who can project the event
// can also change their adjustments and names on the controller during the
// event, as the projection themes.
//
// An image goes through a Server Action, as a projection background: the
// server stores it as WebP without metadata in the private `event-images`
// bucket, and serves it to signed-in users only
// (`src/app/event-images/[...path]/route.ts`). A deleted image goes to
// `stray_files` (a trigger adds it). A set that no item uses goes some hours
// later, with its images (`removeUnusedEventImageSets`). An entry of an
// announcements item can use a set too, for its attachment (see
// `announcements.ts`). The copy of an event copies the files of its sets
// (`copyEventImageFiles`).

/** The longest side of a stored image, in pixels: a 4K screen. */
const EVENT_IMAGE_MAX_SIDE_PX = 3840;

const EVENT_IMAGE_BUCKET = "event-images";
/** Where the route serves the images (`app/munkater/esemenyek/fajl/kep`). */
const EVENT_IMAGE_URL_PREFIX = "/munkater/esemenyek/fajl/kep/";

// `<event id>/<random id>.webp`, as `addEventImage` makes it.
const EVENT_IMAGE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

const EVENT_IMAGE_COLUMNS =
  "id, set_id, name, path, width, height, fit, scale, offset_x, offset_y, rotation, background, background_color";

const eventImageRowSchema = z.object({
  id: z.uuid(),
  set_id: z.uuid(),
  name: z.string(),
  path: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  fit: z.enum(IMAGE_FITS),
  scale: z.number().int(),
  offset_x: z.number().int(),
  offset_y: z.number().int(),
  rotation: z.literal(IMAGE_ROTATIONS),
  background: z.enum(IMAGE_BACKGROUNDS),
  background_color: z.string(),
});

/** The name and the adjustments of an image. */
const eventImageInputSchema = z.strictObject({
  name: requiredText(IMAGE_NAME_MAX_LENGTH),
  adjust: imageAdjustSchema,
});

export type EventImageInput = z.input<typeof eventImageInputSchema>;

const imageIdsSchema = z.array(idSchema).max(EVENT_IMAGES_MAX);

/** The images of the event by set, each set in order. Empty if there is no such event, or the user cannot see it. */
export async function listEventImageSets(eventId: string): Promise<EventImageSetsDTO> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId))) return {};
  return readEventImageSets(eventId);
}

/**
 * The images of the event by set, each set in order. It does not check the
 * session: the caller does, e.g. the projection of the event.
 */
export async function readEventImageSets(eventId: string): Promise<EventImageSetsDTO> {
  if (!isId(eventId)) return {};
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .select(EVENT_IMAGE_COLUMNS)
    .eq("event_id", eventId)
    .order("position");
  if (error) throw databaseError("list event images", error);
  const sets: Record<string, EventImageDTO[]> = {};
  for (const row of z.array(eventImageRowSchema).parse(data))
    (sets[row.set_id] ??= []).push(toEventImage(row));
  return sets;
}

/**
 * A new set of images of the event, for a new image item. Returns its id, or
 * null if there is no such event, or the user cannot see it.
 */
export async function createEventImageSet(eventId: string): Promise<string | null> {
  if (!(await requireEventAdminOf(eventId))) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_image_sets")
    .insert({ event_id: eventId })
    .select("id")
    .single();
  if (error?.code === "23503") return null;
  if (error) throw databaseError("create event image set", error);
  return z.object({ id: z.uuid() }).parse(data).id;
}

/**
 * Adds a PNG, JPEG or WebP image of at most `IMAGE_PAGE_MAX_BYTES` as the last
 * image of the set, with the default adjustments. A blank name becomes
 * `m.server.eventImages.defaultName`. The stored image is at most
 * `EVENT_IMAGE_MAX_SIDE_PX` on its longest side, as WebP, without metadata.
 * Returns the new image, or null if there is no such set, or the user cannot
 * see its event.
 */
export async function addEventImage(
  setId: string,
  file: File | undefined,
  name: unknown,
): Promise<EventImageDTO | null> {
  const user = await requireEventAdmin();
  if (!isId(setId)) return null;
  const imageName =
    parseInput(optionalText(IMAGE_NAME_MAX_LENGTH), name) ??
    (await getRequestI18n()).m.server.eventImages.defaultName;
  const source = await readImageSource(file);

  // Before the conversion: it costs much more than these queries.
  const eventId = await eventOfSet(setId);
  if (!eventId || !(await canSeeEvent(user.id, eventId))) return null;
  const unusedBefore = new Date(Date.now() - STRAY_FILE_MAX_AGE_MS).toISOString();
  const { data: count, error: countError } = await (
    await getMusicSupabase()
  ).rpc("count_event_images_for_limit", {
    p_set_id: setId,
    p_unused_before: unusedBefore,
  });
  if (countError) throw databaseError("count event images", countError);
  if (z.number().int().parse(count) >= EVENT_IMAGES_MAX) throw tooManyError();

  const image = await storedImage(source, EVENT_IMAGE_MAX_SIDE_PX);
  const path = `${eventId}/${randomUUID()}.webp`;
  // First the row, so that the cleanup knows the file even if this request stops after the upload.
  await startStrayFileUpload(EVENT_IMAGE_BUCKET, path);
  const { error: uploadError } = await (
    await getMusicSupabase()
  ).storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(path, image.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    console.error("[event-images] Failed to upload an image:", uploadError.message);
    throw new Error("Failed to upload an event image");
  }

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_event_image", {
    p_set_id: setId,
    p_name: imageName,
    p_path: path,
    p_width: image.width,
    p_height: image.height,
    p_size_bytes: image.bytes.length,
    p_max: EVENT_IMAGES_MAX,
    p_unused_before: unusedBefore,
  });
  if (error || data === null) {
    // Do not leave a file that no image uses.
    await removeUnusedFiles(EVENT_IMAGE_BUCKET, [path]);
    if (!error) return null;
    throw databaseError("add event image", error, { "P0001:too_many_event_images": tooManyError });
  }
  return {
    id: z.uuid().parse(data),
    name: imageName,
    url: `${EVENT_IMAGE_URL_PREFIX}${path}`,
    width: image.width,
    height: image.height,
    adjust: DEFAULT_IMAGE_ADJUST,
  };
}

/**
 * Changes the name and the adjustments of an image. For the event admins and
 * the users who can project its event. Returns false if there is no such image.
 */
export async function updateEventImage(imageId: string, input: unknown): Promise<boolean> {
  const user = await requireUser();
  if (!isId(imageId)) return false;
  const { name, adjust } = parseInput(eventImageInputSchema, input);

  const eventId = await eventOfImage(imageId);
  if (!eventId) return false;
  // As `canChooseThemes` in `projections.ts`: an event admin who can see the event, or a user who can project it.
  const allowed = user.canEditEvents
    ? await canSeeEvent(user.id, eventId)
    : await isEventVolunteer(eventId, user.id);
  if (!allowed) throw new ForbiddenError();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .update({
      name,
      fit: adjust.fit,
      scale: adjust.scale,
      offset_x: adjust.x,
      offset_y: adjust.y,
      rotation: adjust.rotation,
      background: adjust.background,
      background_color: adjust.backgroundColor,
    })
    .eq("id", imageId)
    .select("id");
  if (error) throw databaseError("update event image", error);
  return data.length > 0;
}

/**
 * Puts the images of the set in the order of `imageIds`, which must have each
 * image of the set once. Returns false if there is no such set, or the user
 * cannot see its event.
 */
export async function moveEventImages(setId: string, imageIds: unknown): Promise<boolean> {
  const user = await requireEventAdmin();
  const ids = parseInput(imageIdsSchema, imageIds);
  const eventId = await eventOfSet(setId);
  if (!eventId || !(await canSeeEvent(user.id, eventId))) return false;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("move_event_set_images", { p_set_id: setId, p_image_ids: ids });
  if (error) {
    throw databaseError("move event images", error, {
      "P0001:event_images": () => new ConflictError(({ m }) => m.server.eventImages.imagesChanged),
    });
  }
  return data === true;
}

/** Removes an image and its file. Returns false if there is no such image, or the user cannot see its event. */
export async function removeEventImage(imageId: string): Promise<boolean> {
  const user = await requireEventAdmin();
  const eventId = await eventOfImage(imageId);
  if (!eventId || !(await canSeeEvent(user.id, eventId))) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .delete()
    .eq("id", imageId)
    .select("path");
  if (error) throw databaseError("remove event image", error);

  // A trigger moved the file to `stray_files`.
  await removeUnusedFiles(
    EVENT_IMAGE_BUCKET,
    z
      .array(z.object({ path: z.string() }))
      .parse(data)
      .map((row) => row.path),
  );
  return data.length > 0;
}

/**
 * The file of an image for a signed-in user, or null if there is no such
 * file. `path` is the part of the URL after `/event-images/`.
 */
export async function getEventImageFile(
  path: string,
  { cached = false }: { cached?: boolean } = {},
): Promise<Blob | typeof NOT_MODIFIED | null> {
  if (!EVENT_IMAGE_PATH_PATTERN.test(path)) return null;
  if (!(await requirePrivateFileAccess(EVENT_IMAGE_BUCKET, path))) return null;
  // The browser has the file (`If-None-Match`): after the check of the access, no download.
  if (cached) return NOT_MODIFIED;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(EVENT_IMAGE_BUCKET)
    .download(path);
  if (error) return null;
  return data;
}

/** The event of a set, or null if there is no such set. */
async function eventOfSet(setId: string): Promise<string | null> {
  if (!isId(setId)) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_image_sets")
    .select("event_id")
    .eq("id", setId)
    .maybeSingle();
  if (error) throw databaseError("get event image set", error);
  return data ? z.object({ event_id: z.uuid() }).parse(data).event_id : null;
}

/** The event of an image, or null if there is no such image. */
async function eventOfImage(imageId: string): Promise<string | null> {
  if (!isId(imageId)) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .select("event_id")
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw databaseError("get event image", error);
  return data ? z.object({ event_id: z.uuid() }).parse(data).event_id : null;
}

// For the events model. These do not check the session: the caller does.

/** The paths of the image files of an event, e.g. to remove them after the event. */
export async function listEventImagePaths(eventId: string): Promise<string[]> {
  if (!isId(eventId)) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .select("path")
    .eq("event_id", eventId);
  if (error) throw databaseError("list event image files", error);
  return z
    .array(z.object({ path: z.string() }))
    .parse(data)
    .map((row) => row.path);
}

/** The paths of the image files of the sets. */
export async function listSetImagePaths(setIds: string[]): Promise<string[]> {
  const ids = setIds.filter(isId);
  if (ids.length === 0) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_images")
    .select("path")
    .in("set_id", ids);
  if (error) throw databaseError("list image files of sets", error);
  return z
    .array(z.object({ path: z.string() }))
    .parse(data)
    .map((row) => row.path);
}

/** The most copies of files at the same time. */
const COPIES_AT_ONCE = 5;

/**
 * Copies image files to the folder of the event `eventId`, for a copy of
 * their items (see the migration `copy_event_media`). Returns the path of each
 * copy by the path of its source; a file that did not copy is left out. A
 * copy is a stray file until an image takes it, so the cleanup removes the
 * copies that no image takes.
 */
export async function copyEventImageFiles(
  eventId: string,
  paths: string[],
): Promise<Record<string, string>> {
  const copies: Record<string, string> = {};
  const queue = [...new Set(paths)];
  async function work() {
    for (let source = queue.shift(); source !== undefined; source = queue.shift()) {
      const path = `${eventId}/${randomUUID()}.webp`;
      try {
        await startStrayFileUpload(EVENT_IMAGE_BUCKET, path);
        const { error } = await (
          await getMusicSupabase()
        ).storage
          .from(EVENT_IMAGE_BUCKET)
          .copy(source, path);
        if (error) console.error("[event-images] Failed to copy an image:", error.message);
        else copies[source] = path;
      } catch (error) {
        console.error(
          "[event-images] Failed to copy an image:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: COPIES_AT_ONCE }, work));
  return copies;
}

/** Removes the files of deleted images, e.g. after their event. A failure is only logged: the cleanup tries again later. */
export async function removeEventImageFiles(paths: string[]): Promise<void> {
  await removeUnusedFiles(EVENT_IMAGE_BUCKET, paths);
}

/**
 * Removes at once the copies of `copyEventImageFiles` for the event that no
 * image took, e.g. of an entry that ended before the event and so stayed
 * behind. Else they wait for the cleanup.
 */
export async function removeUntakenCopies(
  eventId: string,
  copies: Record<string, string>,
): Promise<void> {
  const paths = Object.values(copies);
  if (paths.length === 0) return;
  const taken = new Set(await listEventImagePaths(eventId));
  await removeEventImageFiles(paths.filter((path) => !taken.has(path)));
}

/**
 * Deletes the sets of images that no item uses and that are
 * `STRAY_FILE_MAX_AGE_MS` old, with their images and files: e.g. of a removed
 * item, or of an upload whose item was never saved. The scheduled job calls
 * it. It does not check the session.
 */
export async function removeUnusedEventImageSets(): Promise<void> {
  const before = new Date(Date.now() - STRAY_FILE_MAX_AGE_MS).toISOString();
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("delete_unused_event_image_sets", { p_before: before });
  if (error) {
    console.error("[event-images] Failed to delete the unused image sets:", error.message);
    return;
  }
  await removeUnusedFiles(EVENT_IMAGE_BUCKET, z.array(z.string()).parse(data));
}

function toEventImage(row: z.infer<typeof eventImageRowSchema>): EventImageDTO {
  return {
    id: row.id,
    name: row.name,
    url: `${EVENT_IMAGE_URL_PREFIX}${row.path}`,
    width: row.width,
    height: row.height,
    adjust: {
      fit: row.fit,
      scale: row.scale,
      x: row.offset_x,
      y: row.offset_y,
      rotation: row.rotation,
      background: row.background,
      backgroundColor: row.background_color,
    },
  };
}

function tooManyError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.eventImages.tooMany, { max: EVENT_IMAGES_MAX }),
  );
}

/** Whether the user volunteers for the event (they may then adjust its images). */
async function isEventVolunteer(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_volunteers")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw databaseError("check volunteer", error);
  return data !== null;
}

/** The ids of the image sets of the event, also those without images yet. For the event page. */
export async function listEventImageSetIds(eventId: string): Promise<string[]> {
  const user = await requireUser();
  if (!isId(eventId) || !(await canSeeEvent(user.id, eventId))) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_image_sets")
    .select("id")
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw databaseError("list event image sets", error);
  return z
    .array(z.object({ id: z.uuid() }))
    .parse(data)
    .map((row) => row.id);
}
