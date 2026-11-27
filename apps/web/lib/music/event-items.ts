// Limits of the text items of an event. Keep them in sync with the checks in
// the `event_items` migration.

export const EVENT_ITEM_TITLE_MAX_LENGTH = 200;
export const EVENT_ITEM_NOTES_MAX_LENGTH = 2000;
/** The description of a text slide (see the `text_slide_items` migration). */
export const EVENT_ITEM_DESCRIPTION_MAX_LENGTH = 2000;
/** The highlighted text of a text slide. */
export const EVENT_ITEM_HIGHLIGHT_MAX_LENGTH = 500;

// `looksLikeScriptureReference` comes with the scripture module (phase 6).

/** The kind of a text item of an event: the projection and the sheet show each kind in its own way. */
export type TextItemKind = "scripture" | "announcements" | "images" | "textSlide" | "text";

export function textItemKind(item: {
  scripture: boolean;
  announcementId: string | null;
  imageSetId: string | null;
  textSlide: boolean;
}): TextItemKind {
  if (item.scripture) return "scripture";
  if (item.announcementId) return "announcements";
  if (item.imageSetId) return "images";
  if (item.textSlide) return "textSlide";
  return "text";
}

/**
 * Whether `text` looks like a scripture reference. Scripture (the reference parser and the Bible
 * texts) is phase 6, so until then nothing is recognised and a text item stays a plain text item.
 */
export function looksLikeScriptureReference(_text: string): boolean {
  return false;
}
