// Two-way sync of the songs of a service plan and the setlist of its event (PLAN §17, owner
// decision "service_plans.setlist_id with two-way song sync"). Pure functions: the side that was
// just edited wins ("last edit wins", no merge of two parallel edits), the other side takes its
// song sequence over and keeps everything else:
//   * the k-th song slot of the target gets the k-th song of the source, in the source's order;
//   * a song that stays (same arrangement) keeps the target item with all its details;
//   * extra source songs are added after the target's last song slot (or at its end);
//   * target song slots without a source song are removed;
//   * items that are not songs (readings, prayers, text items, blocks) never move or change.
// Fields that exist on one side only (plan: responsible person, verses; setlist: block, time,
// theme) stay with the item that keeps them; a replaced slot starts with defaults.

export type SongRef = {
  arrangementId: string;
  songId: string;
  title: string;
  musicalKey: string | null;
};

type Slot<T> = { isSong: (item: T) => boolean };

/** Replaces the song items of `target` by `source` songs (see the rules above). */
export function takeSongs<T>(
  target: readonly T[],
  sourceSongs: readonly SongRef[],
  rules: Slot<T> & {
    arrangementOf: (item: T) => string;
    withSong: (song: SongRef, previous: T | null) => T;
  },
): T[] {
  const unused = new Map<string, T[]>();
  for (const item of target) {
    if (!rules.isSong(item)) continue;
    const list = unused.get(rules.arrangementOf(item)) ?? [];
    list.push(item);
    unused.set(rules.arrangementOf(item), list);
  }
  const songItems = sourceSongs.map((song) => {
    const same = unused.get(song.arrangementId)?.shift() ?? null;
    return rules.withSong(song, same);
  });

  const result: T[] = [];
  let next = 0;
  let lastSongSlot = -1;
  for (const item of target) {
    if (!rules.isSong(item)) {
      result.push(item);
      continue;
    }
    const song = songItems[next++];
    if (song !== undefined) {
      result.push(song);
      lastSongSlot = result.length - 1;
    }
  }
  const extra = songItems.slice(next);
  if (extra.length > 0) {
    result.splice(lastSongSlot < 0 ? result.length : lastSongSlot + 1, 0, ...extra);
  }
  return result;
}
