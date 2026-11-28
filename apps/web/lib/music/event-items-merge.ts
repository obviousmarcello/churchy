// The merge of two changes of the items of an event, e.g. an event admin on the
// page of the event and an event admin at the projection, at the same time.
// Each item has a key that stays the same while it moves and changes (see the
// `event_sync` migration). A client saves its list with the setlist that it
// knows (the base). When the event has another list now (theirs), the client
// merges its own list (mine) with it, by key, and saves again:
//
// - Both lists keep the items that they added, also the same song twice.
// - A remove wins over a change: a changed item that the other side removed
//   is not in the result, and the result tells it (`removed`).
// - The order of theirs, then each item that I moved goes after the item
//   before it in my list.
// - A field that only one side changed gets that change. A field that both
//   sides changed gets mine: mine is the later save. The result tells it
//   (`overwritten`).

/** An item of a list: its key and its fields. */
export type MergeItem = { key: string };

export type MergeConflict<Item extends MergeItem> =
  /** I changed or moved the item, and the other side removed it. */
  | { kind: "removed"; item: Item }
  /** Both sides changed these fields of the item: it has my values. */
  | { kind: "overwritten"; item: Item; fields: string[] };

export type MergeResult<Item extends MergeItem> = {
  items: Item[];
  conflicts: MergeConflict<Item>[];
};

/** The merge of `mine` and `theirs`, two changes of `base`. */
export function mergeItems<Item extends MergeItem>(
  base: Item[],
  mine: Item[],
  theirs: Item[],
): MergeResult<Item> {
  const baseByKey = byKey(base);
  const mineByKey = byKey(mine);
  const theirsByKey = byKey(theirs);
  const conflicts: MergeConflict<Item>[] = [];

  const order = mergeOrder(
    base.map((item) => item.key),
    mine.map((item) => item.key),
    theirs.map((item) => item.key),
  );

  const moved = movedKeys(
    base.map((item) => item.key),
    mine.map((item) => item.key),
  );
  for (const item of mine) {
    const old = baseByKey.get(item.key);
    if (old && !theirsByKey.has(item.key) && (!sameValue(old, item) || moved.has(item.key))) {
      conflicts.push({ kind: "removed", item });
    }
  }

  const items = order.flatMap((key): Item[] => {
    const own = mineByKey.get(key);
    const other = theirsByKey.get(key);
    const old = baseByKey.get(key);
    if (!own) return other ? [other] : [];
    if (!other || !old) return [own];

    const merged: Record<string, unknown> = {};
    const overwritten: string[] = [];
    for (const field of new Set([
      ...Object.keys(own),
      ...Object.keys(other),
      ...Object.keys(old),
    ])) {
      const mineValue = (own as Record<string, unknown>)[field];
      const theirValue = (other as Record<string, unknown>)[field];
      const baseValue = (old as Record<string, unknown>)[field];
      const mineChanged = !sameValue(mineValue, baseValue);
      if (mineChanged && !sameValue(theirValue, baseValue) && !sameValue(mineValue, theirValue))
        overwritten.push(field);
      const value = mineChanged ? mineValue : theirValue;
      if (value !== undefined) merged[field] = value;
    }
    if (overwritten.length > 0)
      conflicts.push({ kind: "overwritten", item: own, fields: overwritten });
    return [merged as Item];
  });

  return { items, conflicts };
}

/**
 * The merge of two orders of the keys of `base`: the keys of `theirs` in their
 * order, without the keys that I removed, and with the keys that I added or
 * moved after the key before them in `mine`. A key moved when it is not in
 * the longest common order of `base` and `mine`.
 */
export function mergeOrder(base: string[], mine: string[], theirs: string[]): string[] {
  const baseSet = new Set(base);
  const mineSet = new Set(mine);
  const theirsSet = new Set(theirs);
  const moved = movedKeys(base, mine);
  // Mine to place: the keys that I added, and the keys that I moved and the other side kept.
  const placed = new Set(
    mine.filter((key) => !baseSet.has(key) || (moved.has(key) && theirsSet.has(key))),
  );

  const order = theirs.filter((key) => !placed.has(key) && (!baseSet.has(key) || mineSet.has(key)));
  for (const [index, key] of mine.entries()) {
    if (!placed.has(key)) continue;
    let before = index - 1;
    while (before >= 0 && !order.includes(mine[before]!)) before--;
    order.splice(before < 0 ? 0 : order.indexOf(mine[before]!) + 1, 0, key);
  }
  return order;
}

/** The keys of `base` that `mine` moved: not in the longest common order of both. */
function movedKeys(base: string[], mine: string[]): Set<string> {
  const baseSet = new Set(base);
  const mineSet = new Set(mine);
  const kept = new Set(
    longestCommonOrder(
      base.filter((key) => mineSet.has(key)),
      mine.filter((key) => baseSet.has(key)),
    ),
  );
  return new Set(mine.filter((key) => baseSet.has(key) && !kept.has(key)));
}

/** What changed from `before` to `after`, e.g. for a notice of a change of another user. */
export type ItemChanges<Item extends MergeItem> = {
  added: Item[];
  removed: Item[];
  changed: Item[];
  /** True when the items that stayed have another order. */
  moved: boolean;
};

export function itemChanges<Item extends MergeItem>(
  before: Item[],
  after: Item[],
): ItemChanges<Item> {
  const beforeByKey = byKey(before);
  const afterKeys = new Set(after.map((item) => item.key));
  const stayed = after.filter((item) => beforeByKey.has(item.key)).map((item) => item.key);
  return {
    added: after.filter((item) => !beforeByKey.has(item.key)),
    removed: before.filter((item) => !afterKeys.has(item.key)),
    changed: after.filter((item) => {
      const old = beforeByKey.get(item.key);
      return old !== undefined && !sameValue(old, item);
    }),
    moved:
      stayed.join() !==
      before
        .filter((item) => afterKeys.has(item.key))
        .map((item) => item.key)
        .join(),
  };
}

export function hasChanges(changes: ItemChanges<MergeItem>): boolean {
  return (
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.changed.length > 0 ||
    changes.moved
  );
}

function byKey<Item extends MergeItem>(items: Item[]): Map<string, Item> {
  return new Map(items.map((item) => [item.key, item]));
}

/** The same JSON: the order of the fields does not count, `undefined` is no field. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => [key, sorted(field)]),
  );
}

/** The longest list of keys in the order of both lists. Both have the same keys. */
function longestCommonOrder(a: string[], b: string[]): string[] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const result: string[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      result.push(a[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }
  return result;
}
