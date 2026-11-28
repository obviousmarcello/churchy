import { describe, expect, it } from "vitest";

import {
  isQuickItemKey,
  parseQuickItems,
  placeQuickItems,
  QUICK_ITEMS_START,
  quickItemKey,
  removeQuickItem,
  withQuickItems,
  type QuickItem,
} from "./quick-items";
import type { ProjectionSource } from "./slides";

function text(key: string): ProjectionSource {
  return { kind: "text", key, title: key };
}

function quick(key: string, afterKey: string | null): QuickItem {
  return { afterKey, source: text(key) };
}

const SETLIST = [text("a"), text("b"), text("c")];

function keys(sources: ProjectionSource[]) {
  return sources.map((source) => source.key);
}

describe("withQuickItems", () => {
  it("keeps the setlist without quick items", () => {
    expect(withQuickItems(SETLIST, [])).toBe(SETLIST);
  });

  it("puts each quick item after its item, in the order of adding", () => {
    const items = [
      quick("quick-1", "a"),
      quick("quick-2", null),
      quick("quick-3", "a"),
      quick("quick-4", "quick-1"),
    ];
    expect(keys(withQuickItems(SETLIST, items))).toEqual([
      "a",
      "quick-1",
      "quick-4",
      "quick-3",
      "b",
      "c",
      "quick-2",
    ]);
  });

  it("puts a quick item after an item that is not there anymore at the end", () => {
    expect(keys(withQuickItems(SETLIST, [quick("quick-1", "gone")]))).toEqual([
      "a",
      "b",
      "c",
      "quick-1",
    ]);
  });

  it("keeps the quick items in a loop", () => {
    const items = [
      quick("quick-1", "quick-2"),
      quick("quick-2", "quick-1"),
      quick("quick-3", "quick-3"),
    ];
    expect(keys(withQuickItems(SETLIST, items))).toEqual([
      "a",
      "b",
      "c",
      "quick-3",
      "quick-1",
      "quick-2",
    ]);
  });
});

describe("placeQuickItems", () => {
  it("puts each quick item after the key before it, also at the start", () => {
    const items = [quick("quick-1", "a"), quick("quick-2", null), quick("quick-3", "c")];
    const order = ["quick-2", "b", "quick-1", "quick-3", "a", "c"];
    const result = placeQuickItems(items, order);
    expect(result).toEqual([
      quick("quick-1", "b"),
      quick("quick-2", QUICK_ITEMS_START),
      quick("quick-3", "quick-1"),
    ]);
    expect(keys(withQuickItems([text("b"), text("a"), text("c")], result))).toEqual(order);
  });
});

describe("removeQuickItem", () => {
  it("moves the quick items after the removed one to its place", () => {
    const items = [quick("quick-1", "a"), quick("quick-2", "quick-1"), quick("quick-3", "b")];
    const result = removeQuickItem(items, "quick-1");
    expect(result).toEqual([quick("quick-2", "a"), quick("quick-3", "b")]);
    expect(keys(withQuickItems(SETLIST, result))).toEqual(["a", "quick-2", "b", "quick-3", "c"]);
  });

  it("keeps the list for an unknown key", () => {
    const items = [quick("quick-1", "a")];
    expect(removeQuickItem(items, "a")).toBe(items);
  });
});

describe("parseQuickItems", () => {
  it("reads stored quick items", () => {
    const items: QuickItem[] = [
      {
        afterKey: "a",
        source: {
          kind: "text",
          key: "quick-1",
          title: "John 3:16",
          scripture: true,
          translation: "kjv",
        },
      },
      {
        afterKey: null,
        source: {
          kind: "song",
          key: "quick-2",
          title: "Lorem",
          copyright: null,
          chordpro: "Ipsum",
          sectionOrder: [],
        },
      },
      {
        afterKey: "quick-2",
        source: {
          kind: "textSlide",
          key: "quick-3",
          title: "Prayer",
          description: "Dolor",
          highlight: null,
        },
      },
    ];
    expect(parseQuickItems(JSON.stringify(items))).toEqual(items);
  });

  it("ignores values that are not quick items", () => {
    expect(parseQuickItems(null)).toEqual([]);
    expect(parseQuickItems("{")).toEqual([]);
    expect(
      parseQuickItems(
        JSON.stringify([{ afterKey: null, source: { kind: "song", key: "quick-1" } }]),
      ),
    ).toEqual([]);
    // A setlist key would show the item twice.
    expect(parseQuickItems(JSON.stringify([quick("a", null)]))).toEqual([]);
    // Only songs, texts and text slides: an announcements item belongs to its event.
    const announcements = {
      kind: "announcements",
      key: "quick-1",
      title: "Lorem",
      sections: [],
      own: [],
    };
    expect(parseQuickItems(JSON.stringify([{ afterKey: null, source: announcements }]))).toEqual(
      [],
    );
  });
});

describe("quickItemKey", () => {
  it("makes keys that are quick item keys", () => {
    const key = quickItemKey();
    expect(isQuickItemKey(key)).toBe(true);
    expect(key).not.toBe(quickItemKey());
    expect(isQuickItemKey("3f6c7a1e-0000-4000-8000-000000000000")).toBe(false);
  });
});
