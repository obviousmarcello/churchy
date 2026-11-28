// The forms of the page with changes that are not saved yet, e.g. the items
// of an event, which save after a short time without changes. A link to a
// page that shows the same data saves them first (see `savePendingChanges`):
// the next page then loads with the changes.

type PendingSave = {
  /** True with changes that are not saved yet, also during a save. */
  pending: () => boolean;
  /** Saves the changes now. True when they are saved. */
  save: () => Promise<boolean>;
};

const entries = new Set<PendingSave>();

/** Adds a form to the registry. Call the result when the form unmounts. */
export function registerPendingSave(entry: PendingSave): () => void {
  entries.add(entry);
  return () => {
    entries.delete(entry);
  };
}

export function hasPendingSaves(): boolean {
  return [...entries].some((entry) => entry.pending());
}

/** Saves the changes of all forms at once. True when all of them are saved. */
export async function savePendingChanges(): Promise<boolean> {
  const results = await Promise.all(
    [...entries].filter((entry) => entry.pending()).map((entry) => entry.save().catch(() => false)),
  );
  return results.every(Boolean);
}
