import type { ItemRow } from "@/components/music/setlist-rows";

// The rehearsal setlist is a draft in `localStorage`, so it stays after a
// reload and is not in the database until an event admin saves it to an event.
// Read it with `useSyncExternalStore(subscribeToDraft, readDraftSnapshot, ...)`
// and `parseDraft()`.

const STORAGE_KEY = "rehearsal-setlist";
const EMPTY = "[]";

// The draft when storage is blocked or full, for example in some private
// windows. It lasts until the next full page load.
let unsavedDraft: string | null = null;

// The "storage" event fires only in other tabs, so this tab notifies its own.
const listeners = new Set<() => void>();

export function subscribeToDraft(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The stored JSON. A string, so the snapshot stays the same until the draft changes. */
export function readDraftSnapshot(): string {
  if (unsavedDraft !== null) return unsavedDraft;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

export function writeDraft(rows: ItemRow[]) {
  const value = JSON.stringify(rows);
  try {
    if (rows.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    unsavedDraft = null;
  } catch {
    unsavedDraft = value;
  }
  listeners.forEach((listener) => listener());
}

/**
 * The rows of a snapshot. Ignores anything that is not a row, e.g. from an
 * older version. The rows have no volunteers: the setlist has no event yet.
 */
export function parseDraft(snapshot: string): ItemRow[] {
  let value: unknown;
  try {
    value = JSON.parse(snapshot);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  return value.flatMap((row): ItemRow[] => {
    if (typeof row !== "object" || row === null) return [];
    if (row.kind === "text") {
      if (typeof row.key !== "string" || typeof row.title !== "string") return [];
      const notes = typeof row.notes === "string" ? row.notes : "";
      // A draft from before the scripture readings has none.
      const scripture = row.scripture === true;
      // A draft from before the translations has none: the default one.
      const scriptureTranslation =
        scripture && typeof row.scriptureTranslation === "string" ? row.scriptureTranslation : null;
      return [
        {
          kind: "text",
          key: row.key,
          title: row.title,
          notes,
          scripture,
          scriptureTranslation,
          volunteerId: null,
        },
      ];
    }
    if (typeof row.songId !== "string" || typeof row.arrangementId !== "string") return [];
    return [
      {
        kind: "song",
        // A draft from before the text items has songs only, without a row id.
        key: typeof row.key === "string" ? row.key : row.arrangementId,
        songId: row.songId,
        arrangementId: row.arrangementId,
        // A draft from before the keys has none: the key of the chart.
        musicalKey: typeof row.musicalKey === "string" ? row.musicalKey : null,
        volunteerId: null,
      },
    ];
  });
}
