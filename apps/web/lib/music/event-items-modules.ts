import { textItemKind, type TextItemKind } from "@/lib/music/event-items";

// The text items of an event whose kind belongs to a module. While the module is off, its items
// stay in the setlist: the editor shows them locked, the server keeps them as they are, and the
// views hide them (Music Sheet DB `lib/modules/items.ts`). Churchy's workspace modules decide which
// kinds are on; the callers pass the kinds that are on (`images`, `announcements`, `textSlide`,
// `scripture`).

const ITEM_KINDS_WITH_MODULE: readonly TextItemKind[] = [
  "scripture",
  "images",
  "announcements",
  "textSlide",
];

type TextItemFields = {
  scripture: boolean;
  announcementId: string | null;
  imageSetId: string | null;
  textSlide: boolean;
};

/** True when the item shows: a song, a plain text item, or a text item of a kind that is on. */
export function isItemOn(
  item: { kind: "song" } | ({ kind: "text" } & TextItemFields),
  kindsOn: readonly string[],
): boolean {
  if (item.kind === "song") return true;
  const kind = textItemKind(item);
  return !ITEM_KINDS_WITH_MODULE.includes(kind) || kindsOn.includes(kind);
}

/** The items that show (see `isItemOn`), for the views. */
export function itemsOn<Item extends { kind: "song" } | ({ kind: "text" } & TextItemFields)>(
  items: readonly Item[],
  kindsOn: readonly string[],
): Item[] {
  return items.filter((item) => isItemOn(item, kindsOn));
}
