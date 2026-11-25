import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/);

// The images of an event, e.g. announcements or photos (see the migrations
// `event_images` and `event_image_items`). They are in sets: an image item of
// the event has a set, e.g. one image, or the pages of a PDF file. The
// controller shows each image of the item as a tile. The adjustments of an
// image set how its slide shows it: the fit, the scale, the position of its
// center, the rotation and the background. The screens, the previews and the
// PowerPoint file place the image with `imageBox`, so all of them agree.

export const IMAGE_FITS = ["contain", "cover"] as const;
/** "color": `backgroundColor`. "theme": the background of the projection theme. "blur": the same image, blurred, fills the screen. */
export const IMAGE_BACKGROUNDS = ["color", "theme", "blur"] as const;
export const IMAGE_ROTATIONS = [0, 90, 180, 270] as const;
/** In percent of the size of the fit. */
export const IMAGE_SCALE_MIN = 10;
export const IMAGE_SCALE_MAX = 400;
/** The center of the image from the center of the screen, in percent of the screen width or height. */
export const IMAGE_OFFSET_MAX = 50;
/** The longest name of an image. */
export const IMAGE_NAME_MAX_LENGTH = 100;
/** The most images of one event, e.g. the pages of some PDF files. */
export const EVENT_IMAGES_MAX = 200;

export type ImageFit = (typeof IMAGE_FITS)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];
export type ImageRotation = (typeof IMAGE_ROTATIONS)[number];

export type ImageAdjust = {
  /** "contain": all of the image shows. "cover": the image fills the screen, and the parts outside it are cut off. */
  fit: ImageFit;
  /** In percent of the size of the fit. */
  scale: number;
  /** The center of the image from the center of the screen, in percent of the screen width. */
  x: number;
  /** The same, in percent of the screen height. Down is positive. */
  y: number;
  /** Clockwise, in degrees. */
  rotation: ImageRotation;
  /** What shows around the image (see `IMAGE_BACKGROUNDS`). */
  background: ImageBackground;
  /** E.g. "#000000", for the background "color". It stays with the other backgrounds, for a change back. */
  backgroundColor: string;
};

export const DEFAULT_IMAGE_ADJUST: ImageAdjust = {
  fit: "contain",
  scale: 100,
  x: 0,
  y: 0,
  rotation: 0,
  background: "color",
  backgroundColor: "#000000",
};

/** The blur of the background "blur", in parts of the screen height. */
export const BACKGROUND_BLUR = 0.04;

/** An image of an event, as the event page and the controller get it. */
export type EventImageDTO = {
  id: string;
  name: string;
  /** A path on this site (see `EVENT_IMAGE_PATH_PATTERN`). */
  url: string;
  /** In pixels. */
  width: number;
  height: number;
  adjust: ImageAdjust;
};

/** The images of an event by set (see `EventImageDTO`), each set in order. An image item of the event has a set. */
export type EventImageSetsDTO = Readonly<Record<string, EventImageDTO[]>>;

/**
 * The images of the events, as `/event-images/<event id>/<random id>.webp`.
 * Only these: a screen must not load a file from another site.
 */
const EVENT_IMAGE_PATH_PATTERN = /^\/event-images\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

export const eventImageUrlSchema = z.string().regex(EVENT_IMAGE_PATH_PATTERN);

export const imageAdjustSchema = z.object({
  fit: z.enum(IMAGE_FITS),
  scale: z.number().int().min(IMAGE_SCALE_MIN).max(IMAGE_SCALE_MAX),
  x: z.number().int().min(-IMAGE_OFFSET_MAX).max(IMAGE_OFFSET_MAX),
  y: z.number().int().min(-IMAGE_OFFSET_MAX).max(IMAGE_OFFSET_MAX),
  rotation: z.literal(IMAGE_ROTATIONS),
  background: z.enum(IMAGE_BACKGROUNDS),
  backgroundColor: colorSchema,
});

/**
 * The place of an image on a screen with the aspect ratio `aspectRatio`
 * (width / height). `centerX` and `width` are parts of the screen width,
 * `centerY` and `height` parts of the screen height. `width` and `height` are
 * the size of the image before the rotation, which turns it around its center.
 */
export type ImageBox = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: ImageRotation;
};

export function imageBox(
  adjust: ImageAdjust,
  imageWidth: number,
  imageHeight: number,
  aspectRatio: number,
): ImageBox {
  const turned = adjust.rotation === 90 || adjust.rotation === 270;
  const imageRatio = Math.max(1, imageWidth) / Math.max(1, imageHeight);
  // The shape of the image on the screen, after the rotation.
  const ratio = turned ? 1 / imageRatio : imageRatio;
  const wider = ratio > aspectRatio;
  // The box of the turned image, in parts of the screen width and height.
  const fullWidth = adjust.fit === "contain" ? wider : !wider;
  const scale = adjust.scale / 100;
  const boxWidth = (fullWidth ? 1 : ratio / aspectRatio) * scale;
  const boxHeight = (fullWidth ? aspectRatio / ratio : 1) * scale;
  return {
    centerX: 0.5 + adjust.x / 100,
    centerY: 0.5 + adjust.y / 100,
    // A turned image is as wide as its box is high.
    width: turned ? boxHeight / aspectRatio : boxWidth,
    height: turned ? boxWidth * aspectRatio : boxHeight,
    rotation: adjust.rotation,
  };
}

/** An offset within the limits, as a whole percent. */
export function clampOffset(value: number): number {
  return Math.max(-IMAGE_OFFSET_MAX, Math.min(IMAGE_OFFSET_MAX, Math.round(value)));
}

/** A scale within the limits, as a whole percent. */
export function clampScale(value: number): number {
  return Math.max(IMAGE_SCALE_MIN, Math.min(IMAGE_SCALE_MAX, Math.round(value)));
}

/** The rotation a quarter turn further: clockwise for 1, counterclockwise for -1. */
export function turnImage(rotation: ImageRotation, direction: 1 | -1): ImageRotation {
  return IMAGE_ROTATIONS[
    (IMAGE_ROTATIONS.indexOf(rotation) + direction + IMAGE_ROTATIONS.length) %
      IMAGE_ROTATIONS.length
  ]!;
}
