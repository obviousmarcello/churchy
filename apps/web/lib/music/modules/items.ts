import { textItemKind, type TextItemKind } from "@/lib/music/event-items";
import type { ModuleId } from "./registry";

// The text items of an event whose kind belongs to a module (see "Items of a
// type that is off" in `docs/modules-plan.md`). While the module is off, its
// items stay in the setlist: the editor shows them as locked rows, the
// server keeps them as they are, and the views hide them.

const ITEM_MODULES: Partial<Record<TextItemKind, ModuleId>> = {
  scripture: "scripture",
  images: "projection.images",
  announcements: "projection.announcements",
  textSlide: "projection.text-slides",
};

/** The module of the kind of a text item, or null for a plain text item. */
export function itemKindModule(kind: TextItemKind): ModuleId | null {
  return ITEM_MODULES[kind] ?? null;
}

type TextItemFields = {
  scripture: boolean;
  announcementId: string | null;
  imageSetId: string | null;
  textSlide: boolean;
};

/** True when the item shows: a song, a plain text item, or a text item of a module that is on. */
export function isItemOn(
  item: { kind: "song" } | ({ kind: "text" } & TextItemFields),
  modules: readonly ModuleId[],
): boolean {
  if (item.kind === "song") return true;
  const itemModule = itemKindModule(textItemKind(item));
  return itemModule === null || modules.includes(itemModule);
}

/** The items that show (see `isItemOn`), for the views. */
export function itemsOn<Item extends { kind: "song" } | ({ kind: "text" } & TextItemFields)>(
  items: readonly Item[],
  modules: readonly ModuleId[],
): Item[] {
  return items.filter((item) => isItemOn(item, modules));
}
