import type { Media, MediaCreateInput } from "@churchy/contracts";
import type { MediaItem, MediaUploadInput } from "@churchy/ui";

/** Demo storage quota shown next to the usage (the real one comes from the plan, D-87). */
export const DEMO_MEDIA_QUOTA_BYTES = 1024 * 1024 * 1024;

/** Phase A serves only the demo placeholders under `public/demo/` (see `lib/pages/public-pages.ts`). */
const DEMO_KEY = /^demo\/[a-z0-9][a-z0-9.-]*$/;

/** The library's view of a media row; `src` is set only for images the app can serve. */
export function toMediaItem(media: Media): MediaItem {
  return {
    id: media.id,
    filename: media.filename,
    kind: media.kind,
    src: media.kind === "image" && DEMO_KEY.test(media.storageKey) ? `/${media.storageKey}` : null,
    alt: media.alt,
    decorative: media.decorative,
    caption: media.caption,
    peopleConsent: media.peopleConsent,
    width: media.width,
    height: media.height,
    bytes: media.bytes,
  };
}

const PLACEHOLDER_IMAGE = "demo/templom.svg";
const PLACEHOLDER_PDF = "demo/minta-dokumentum.pdf";

/**
 * Metadata row for a "fake upload": the demo does not store the file, so it points at the
 * placeholder asset of the same kind (the real pipeline creates AVIF/WebP/JPEG variants, D-19 BE).
 */
export function toCreateInput(upload: MediaUploadInput): MediaCreateInput {
  const image = upload.mimeType.startsWith("image/");
  const pdf = upload.mimeType === "application/pdf";
  return {
    kind: image ? "image" : pdf ? "pdf" : "other",
    filename: upload.filename,
    mimeType: upload.mimeType,
    storageKey: image ? PLACEHOLDER_IMAGE : PLACEHOLDER_PDF,
    variants: [],
    width: upload.width,
    height: upload.height,
    bytes: upload.bytes,
    alt: upload.alt,
    decorative: upload.decorative,
    caption: upload.caption,
    peopleConsent: upload.peopleConsent,
    visibility: "public",
  };
}
