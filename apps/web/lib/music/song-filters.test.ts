import { describe, expect, it } from "vitest";

import { hasSongFilters, parseSongFilters, parseSongSort } from "./song-filters";

describe("parseSongSort", () => {
  it("reads a known sort", () => {
    expect(parseSongSort({ sort: "recent" })).toBe("recent");
    expect(parseSongSort({ sort: ["oldest", "recent"] })).toBe("oldest");
  });

  it("gives the title sort for no value or an unknown value", () => {
    expect(parseSongSort({})).toBe("title");
    expect(parseSongSort({ sort: "" })).toBe("title");
    expect(parseSongSort({ sort: "RECENT" })).toBe("title");
    expect(parseSongSort({ sort: "toString" })).toBe("title");
  });

  it("is not a filter", () => {
    expect(hasSongFilters(parseSongFilters({ sort: "recent" }))).toBe(false);
  });
});
