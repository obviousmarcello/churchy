import { describe, expect, it } from "vitest";

import { hasChanges, itemChanges, mergeItems, mergeOrder } from "./event-items-merge";

type Item = { key: string; title: string; musicalKey?: string | null; themeId?: string | null };

const item = (key: string, fields: Partial<Item> = {}): Item => ({
  key,
  title: key.toUpperCase(),
  ...fields,
});
const keys = (items: Item[]) => items.map((entry) => entry.key);

const BASE = [item("a"), item("b"), item("c")];

describe("mergeItems", () => {
  it("keeps the adds of both sides, also the same song twice", () => {
    const mine = [...BASE, item("d", { title: "Song" })];
    const theirs = [...BASE, item("e", { title: "Song" })];
    const result = mergeItems(BASE, mine, theirs);
    expect(keys(result.items)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.conflicts).toEqual([]);
  });

  it("puts my add after the item before it in my list", () => {
    const mine = [item("a"), item("d"), item("b"), item("c")];
    const theirs = [item("c"), item("a"), item("b")];
    expect(keys(mergeItems(BASE, mine, theirs).items)).toEqual(["c", "a", "d", "b"]);
  });

  it("puts my add at the start when no item is before it", () => {
    const mine = [item("d"), ...BASE];
    expect(keys(mergeItems(BASE, mine, BASE).items)).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps their order and moves the items that I moved after their item before", () => {
    // I moved "c" to the start, they moved "a" to the end.
    const mine = [item("c"), item("a"), item("b")];
    const theirs = [item("b"), item("c"), item("a")];
    expect(keys(mergeItems(BASE, mine, theirs).items)).toEqual(["c", "b", "a"]);
  });

  it("keeps their order when I did not move anything", () => {
    const theirs = [item("c"), item("b"), item("a")];
    expect(keys(mergeItems(BASE, BASE, theirs).items)).toEqual(["c", "b", "a"]);
  });

  it("removes the items that either side removed", () => {
    const mine = [item("a"), item("c")];
    const theirs = [item("a"), item("b")];
    const result = mergeItems(BASE, mine, theirs);
    expect(keys(result.items)).toEqual(["a"]);
    expect(result.conflicts).toEqual([]);
  });

  it("lets a remove win over a change, and tells it", () => {
    const changed = item("b", { musicalKey: "D" });
    const mine = [item("a"), changed, item("c")];
    const theirs = [item("a"), item("c")];
    const result = mergeItems(BASE, mine, theirs);
    expect(keys(result.items)).toEqual(["a", "c"]);
    expect(result.conflicts).toEqual([{ kind: "removed", item: changed }]);
  });

  it("lets a remove win over a move, and tells it", () => {
    // I moved "c" to the start; they removed it.
    const mine = [item("c"), item("a"), item("b")];
    const theirs = [item("a"), item("b")];
    const result = mergeItems(BASE, mine, theirs);
    expect(keys(result.items)).toEqual(["a", "b"]);
    expect(result.conflicts).toEqual([{ kind: "removed", item: item("c") }]);
  });

  it("removes the item that I removed, also when they changed it", () => {
    const mine = [item("a"), item("c")];
    const theirs = [item("a"), item("b", { themeId: "t" }), item("c")];
    expect(keys(mergeItems(BASE, mine, theirs).items)).toEqual(["a", "c"]);
  });

  it("takes the fields that only one side changed", () => {
    const mine = [item("a", { musicalKey: "D" }), item("b"), item("c")];
    const theirs = [item("a", { themeId: "t" }), item("b"), item("c")];
    const result = mergeItems(BASE, mine, theirs);
    expect(result.items[0]).toEqual(item("a", { musicalKey: "D", themeId: "t" }));
    expect(result.conflicts).toEqual([]);
  });

  it("takes my value of a field that both sides changed, and tells it", () => {
    const mine = [item("a", { musicalKey: "D" }), item("b"), item("c")];
    const theirs = [item("a", { musicalKey: "E" }), item("b"), item("c")];
    const result = mergeItems(BASE, mine, theirs);
    expect(result.items[0]!.musicalKey).toBe("D");
    expect(result.conflicts).toEqual([
      { kind: "overwritten", item: mine[0], fields: ["musicalKey"] },
    ]);
  });

  it("has no conflict when both sides made the same change", () => {
    const mine = [item("a", { musicalKey: "D" }), item("b"), item("c")];
    const theirs = [item("a", { musicalKey: "D" }), item("b"), item("c")];
    expect(mergeItems(BASE, mine, theirs).conflicts).toEqual([]);
  });

  it("gives their list when I changed nothing", () => {
    const theirs = [item("b", { title: "New" }), item("d")];
    expect(mergeItems(BASE, BASE, theirs).items).toEqual(theirs);
  });

  it("gives my list when they changed nothing", () => {
    const mine = [item("c"), item("d"), item("a", { musicalKey: "F" })];
    expect(mergeItems(BASE, mine, BASE).items).toEqual(mine);
  });
});

describe("mergeOrder", () => {
  it("keeps an item that I moved in its new place after a remove of the item before it", () => {
    // I moved "a" after "c"; they removed "c".
    expect(mergeOrder(["a", "b", "c"], ["b", "c", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });
});

describe("itemChanges", () => {
  it("lists the adds, the removes and the changes", () => {
    const after = [item("a", { title: "New" }), item("c"), item("d")];
    const changes = itemChanges(BASE, after);
    expect(keys(changes.added)).toEqual(["d"]);
    expect(keys(changes.removed)).toEqual(["b"]);
    expect(keys(changes.changed)).toEqual(["a"]);
    expect(changes.moved).toBe(false);
    expect(hasChanges(changes)).toBe(true);
  });

  it("tells a new order", () => {
    const changes = itemChanges(BASE, [item("b"), item("a"), item("c")]);
    expect(changes.moved).toBe(true);
  });

  it("has no changes for the same list", () => {
    expect(
      hasChanges(
        itemChanges(
          BASE,
          BASE.map((entry) => ({ ...entry })),
        ),
      ),
    ).toBe(false);
  });
});
