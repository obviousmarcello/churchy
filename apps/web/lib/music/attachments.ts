import { COMMON_NAMES, MINOR_NAMES } from "./chords/chord-name";

// The PDFs and images of a song. Each can be for some arrangements of the song
// and for some keys: none means all arrangements or any key.
//
// The keys are the usual English names (`canonicalKey()`). Keep them in sync
// with the checks of `song_pdfs.musical_keys` and `song_images.musical_keys`.

export const ATTACHMENT_MAJOR_KEYS: readonly string[] = COMMON_NAMES;
export const ATTACHMENT_MINOR_KEYS: readonly string[] = MINOR_NAMES.map((name) => `${name}m`);
export const ATTACHMENT_KEYS: readonly string[] = [
  ...ATTACHMENT_MAJOR_KEYS,
  ...ATTACHMENT_MINOR_KEYS,
];

/** The arrangements and the keys of a PDF or an image. */
export type Attachment = {
  /** Empty: all arrangements of the song. */
  arrangementIds: string[];
  /** In English note names, in the order of `ATTACHMENT_KEYS`. Empty: any key. */
  keys: string[];
};

/** The keys without repeats, in the order of `ATTACHMENT_KEYS`: the major keys from C, then the minor keys. */
export function sortAttachmentKeys(keys: readonly string[]): string[] {
  return ATTACHMENT_KEYS.filter((key) => keys.includes(key));
}

/** True when the PDF or the image is for this arrangement: it names it, or it names none. */
export function isForArrangement(
  attachment: Pick<Attachment, "arrangementIds">,
  arrangementId: string,
): boolean {
  return (
    attachment.arrangementIds.length === 0 || attachment.arrangementIds.includes(arrangementId)
  );
}
