import { z } from "zod";

import type { ProjectionSource } from "./slides";

// Quick items: songs, scripture readings and text slides that the operator
// adds on the controller while the projection runs, e.g. a passage that the
// preacher reads. They are not in the setlist of the event or of the rehearsal: only
// this controller has them, until its tab closes (see `useQuickItems`). The
// quick add of an event admin adds them to the event instead (`QuickItemInput`),
// and can also add image items and announcements items there.
// Each one comes after the item that was live when it was added. A drag can
// move it to another place, also to the start.

export type QuickItem = {
  /**
   * The item that the quick item comes after, or `QUICK_ITEMS_START`. Null,
   * or an item that is not there anymore: at the end.
   */
  afterKey: string | null;
  source: ProjectionSource;
};

/**
 * A quick item as an item of the event: a song (an arrangement), a text item
 * or a scripture reading, a text slide, or for an event admin an image item
 * (a set of images of the event) or an announcements item.
 */
export type QuickItemInput =
  | { kind: "song"; arrangementId: string }
  | { kind: "text"; title: string; scripture: boolean; scriptureTranslation: string | null }
  | { kind: "text"; title: string; textSlide: true; description: string; highlight: string }
  | { kind: "text"; title: string; imageSetId: string }
  | { kind: "text"; title: string; announcementId: string };

/** The `afterKey` of a quick item before the first item. */
export const QUICK_ITEMS_START = "start";

/** A key that the keys of the setlist items (UUIDs) cannot have. */
export function quickItemKey(): string {
  return `quick-${crypto.randomUUID()}`;
}

export function isQuickItemKey(key: string): boolean {
  return key.startsWith("quick-");
}

/**
 * The setlist with the quick items in it. The quick items after the same item
 * keep the order in which they were added, each one with the quick items
 * after it.
 */
export function withQuickItems(
  sources: ProjectionSource[],
  quickItems: QuickItem[],
): ProjectionSource[] {
  if (quickItems.length === 0) return sources;
  const keys = new Set(
    [...sources, ...quickItems.map((item) => item.source)].map((source) => source.key),
  );
  const after = new Map<string | null, ProjectionSource[]>();
  for (const { afterKey, source } of quickItems) {
    const key =
      afterKey === QUICK_ITEMS_START ||
      (afterKey !== null && keys.has(afterKey) && afterKey !== source.key)
        ? afterKey
        : null;
    after.set(key, [...(after.get(key) ?? []), source]);
  }

  const result: ProjectionSource[] = [];
  const added = new Set<string>();
  function add(source: ProjectionSource) {
    // A loop of `afterKey`s cannot come from the controller, only from changed storage.
    if (added.has(source.key)) return;
    added.add(source.key);
    result.push(source);
    for (const next of after.get(source.key) ?? []) add(next);
  }
  for (const source of after.get(QUICK_ITEMS_START) ?? []) add(source);
  for (const source of sources) add(source);
  for (const source of after.get(null) ?? []) add(source);
  // The quick items in a loop of `afterKey`s.
  for (const { source } of quickItems) add(source);
  return result;
}

/**
 * The quick items at their places in `keys`: the keys of the setlist and of
 * the quick items in a new order, e.g. after a drag. Each one comes after the
 * key before it.
 */
export function placeQuickItems(quickItems: QuickItem[], keys: string[]): QuickItem[] {
  return quickItems.map((item) => {
    const index = keys.indexOf(item.source.key);
    if (index === -1) return item;
    return { ...item, afterKey: index === 0 ? QUICK_ITEMS_START : keys[index - 1]! };
  });
}

/** Without the quick item of `key`. The quick items after it then come after its item. */
export function removeQuickItem(quickItems: QuickItem[], key: string): QuickItem[] {
  const removed = quickItems.find((item) => item.source.key === key);
  if (!removed) return quickItems;
  return quickItems.flatMap((item) => {
    if (item === removed) return [];
    return item.afterKey === key ? [{ ...item, afterKey: removed.afterKey }] : [item];
  });
}

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("song"),
    key: z.string(),
    title: z.string(),
    copyright: z.string().nullable(),
    chordpro: z.string(),
    sectionOrder: z.array(z.string()),
    // Left out in a quick item from an older version.
    songbook: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    authors: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("text"),
    key: z.string(),
    title: z.string(),
    scripture: z.boolean().optional(),
    translation: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("textSlide"),
    key: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    highlight: z.string().nullable(),
  }),
]);

const quickItemsSchema = z.array(
  z.object({ afterKey: z.string().nullable(), source: sourceSchema }),
);

/** The quick items in stored JSON. Empty for a value that is not a list of quick items, e.g. from an older version. */
export function parseQuickItems(json: string | null | undefined): QuickItem[] {
  if (!json) return [];
  try {
    const result = quickItemsSchema.safeParse(JSON.parse(json));
    return result.success ? result.data.filter((item) => isQuickItemKey(item.source.key)) : [];
  } catch {
    return [];
  }
}
