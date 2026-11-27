import { IMAGE_BRANDS } from "@/lib/music/sound-files";

// The video backgrounds of the projection themes (see the migration
// `theme_background_video`). The browser of the editor puts the file
// directly to Storage; the server checks its first bytes before a theme uses it.

/** The bucket allows at most this too. */
export const PROJECTION_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const PROJECTION_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export type ProjectionVideoType = (typeof PROJECTION_VIDEO_TYPES)[number];
/** The extension of the stored file, in its path. */
export const PROJECTION_VIDEO_EXTENSIONS: Record<ProjectionVideoType, "mp4" | "webm"> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};
/** The bytes at the start of a file that `projectionVideoTypeOf` needs. */
export const PROJECTION_VIDEO_HEADER_BYTES = 12;

export function isProjectionVideoType(value: string): value is ProjectionVideoType {
  return PROJECTION_VIDEO_TYPES.some((type) => type === value);
}

/**
 * The format of a video, from its first bytes: MP4 (also MOV with H.264,
 * which starts the same) or WebM. Null for another file, also for an image
 * in the MP4 container, e.g. a HEIC photo. The first bytes do not tell a
 * video from a sound: the browser of the editor checks that it shows a picture.
 */
export function projectionVideoTypeOf(start: Uint8Array): ProjectionVideoType | null {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...start.subarray(offset, offset + length));
  if (start.length >= 12 && text(4, 4) === "ftyp" && !IMAGE_BRANDS.has(text(8, 4)))
    return "video/mp4";
  if (start[0] === 0x1a && start[1] === 0x45 && start[2] === 0xdf && start[3] === 0xa3)
    return "video/webm";
  return null;
}
