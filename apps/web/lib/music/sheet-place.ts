import { z } from "zod";

import { createStoredString } from "./browser";

// The place that the user saw last on a sheet, in this tab. After a reload,
// e.g. when the phone reloads the tab during a service, the sheet opens there
// again. Only in `sessionStorage`, and only for the last sheet: a new tab or a
// link opens at the start, and the viewer removes it when it closes (see `SheetViewer`).

/** A song of the sheet, and a page from the start of that song (as the sheet's anchor). */
export type SheetPlace = { songId: string; page: number };

const placeSchema = z.object({
  sheet: z.string().max(1000),
  songId: z.string().min(1).max(100),
  page: z.number().int().nonnegative().max(10_000),
});

/** The place on the sheet `sheetKey`. Null for nothing kept, another sheet or a value that is not valid. */
export function parseSheetPlace(stored: string | null, sheetKey: string): SheetPlace | null {
  if (!stored) return null;
  try {
    const result = placeSchema.safeParse(JSON.parse(stored));
    return result.success && result.data.sheet === sheetKey
      ? { songId: result.data.songId, page: result.data.page }
      : null;
  } catch {
    return null;
  }
}

/** The value to keep for `place` on the sheet `sheetKey`. */
export function storedSheetPlace(sheetKey: string, place: SheetPlace): string {
  return JSON.stringify({ sheet: sheetKey, ...place });
}

/**
 * The anchor of the kept place in `songs`: the index of the song and the page.
 * Null when the song is not on the sheet anymore.
 */
export function placeAnchor(place: SheetPlace | null, songs: readonly { id: string }[]) {
  if (!place) return null;
  const song = songs.findIndex((item) => item.id === place.songId);
  return song >= 0 ? { song, page: place.page } : null;
}

/** The kept place of the last sheet in this tab. */
export const sheetPlaceStore = createStoredString("sheet-place", "session");
