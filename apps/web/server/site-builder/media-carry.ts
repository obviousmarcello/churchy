import sharp from "sharp";
import { slugify } from "@churchy/hu";
import type { Ctx } from "@churchy/contracts";
import type { StoredImage } from "./apply-new";
import type { SiteDraft } from "./draft-schema";
import { newMediaId, type MediaSink } from "./media-sink";
import type { SiteFetchResult } from "./site-fetcher";

/**
 * Carrying the images of a draft over when it is applied (SDD ADR-21), in two steps so the slow
 * part (download, re-encode) runs OUTSIDE the platform transaction of a new church:
 *   1. `prepareImages`: download through the SSRF-safe `SiteFetcher` (nothing else fetches), decode,
 *      re-encode as webp (metadata and EXIF stripped, longest side <= 2400 px);
 *   2. `storeImages`: upload to the `MediaSink` under `t/<tenant>/media/<uuid>.webp`.
 * The failure of one image is a counted warning, never an error of the apply. Bytes are only held
 * in memory; nothing here logs, and errors carry no URL or content.
 */

export const MEDIA_MAX_SIDE_PX = 2400;
/** Decoder guard: larger images need too much memory to decode. */
const MAX_INPUT_PIXELS = 50_000_000;
/** Bucket limit of `site-media` (migration 0028). */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const WEBP_QUALITIES = [82, 65, 50];
/** What sharp reports for the allowed inputs (jpeg, png, webp, gif, avif); SVG and the rest never pass. */
const DECODABLE = new Set(["jpeg", "png", "webp", "gif", "heif"]);

export interface PreparedImage {
  readonly draftImageId: string;
  readonly filename: string;
  readonly alt: string | null;
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
}

export interface ImageFetcher {
  fetchImage(url: string): Promise<SiteFetchResult>;
}

/** Re-encodes to webp, or `null` when the bytes are not a decodable allowed image or stay too big. */
export async function reencode(
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !DECODABLE.has(meta.format)) return null;
    for (const quality of WEBP_QUALITIES) {
      // rotate() applies the EXIF orientation; sharp drops all metadata unless asked to keep it.
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({
          width: MEDIA_MAX_SIDE_PX,
          height: MEDIA_MAX_SIDE_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MEDIA_MAX_BYTES) return { data, width: info.width, height: info.height };
    }
    return null;
  } catch {
    return null;
  }
}

/** `templom.webp` from the source URL's file name (no diacritics, no query), else `kep.webp`. */
export function mediaFilename(sourceUrl: string): string {
  let base = "";
  try {
    const last = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    base = decodeURIComponent(last).replace(/\.[a-z0-9]{2,5}$/i, "");
  } catch {
    base = "";
  }
  return `${slugify(base).slice(0, 60) || "kep"}.webp`;
}

export interface PrepareResult {
  readonly prepared: readonly PreparedImage[];
  /** Included images that could not be fetched, decoded or re-encoded. */
  readonly failed: number;
}

/** Downloads and re-encodes the images the operator kept (off-site ones are never downloaded). */
export async function prepareImages(
  draft: SiteDraft,
  fetcher: ImageFetcher,
  signal?: AbortSignal,
): Promise<PrepareResult> {
  const prepared: PreparedImage[] = [];
  let failed = 0;
  for (const image of draft.images.filter((i) => i.include && !i.offsite)) {
    if (signal?.aborted) {
      failed++;
      continue;
    }
    let fetched: SiteFetchResult;
    try {
      fetched = await fetcher.fetchImage(image.sourceUrl);
    } catch {
      failed++;
      continue;
    }
    if (!fetched.ok) {
      failed++;
      continue;
    }
    const encoded = await reencode(fetched.body);
    if (!encoded) {
      failed++;
      continue;
    }
    prepared.push({
      draftImageId: image.id,
      filename: mediaFilename(image.sourceUrl),
      alt: image.alt.trim() === "" ? null : image.alt.trim(),
      width: encoded.width,
      height: encoded.height,
      data: encoded.data,
    });
  }
  return { prepared, failed };
}

export interface StoreResult {
  readonly stored: StoredImage[];
  readonly failed: number;
  /** Every object that now exists in Storage (for cleanup if the apply is rolled back). */
  readonly keys: string[];
}

/** Uploads prepared images for the tenant of `ctx`; a failed upload is counted and skipped. */
export async function storeImages(
  ctx: Ctx,
  prepared: readonly PreparedImage[],
  sink: MediaSink,
  newId: () => string = newMediaId,
): Promise<StoreResult> {
  const stored: StoredImage[] = [];
  const keys: string[] = [];
  let failed = 0;
  for (const image of prepared) {
    const id = newId();
    const storageKey = sink.keyFor(ctx, id);
    try {
      await sink.put(ctx, storageKey, image.data);
    } catch {
      failed++;
      continue;
    }
    keys.push(storageKey);
    stored.push({
      draftImageId: image.draftImageId,
      id,
      filename: image.filename,
      mimeType: "image/webp",
      storageKey,
      bytes: image.data.length,
      width: image.width,
      height: image.height,
      alt: image.alt,
      decorative: image.alt === null,
    });
  }
  return { stored, failed, keys };
}
