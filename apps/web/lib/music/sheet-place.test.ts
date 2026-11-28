import { describe, expect, it } from "vitest";

import { parseSheetPlace, placeAnchor, storedSheetPlace } from "./sheet-place";

const SONGS = [{ id: "song-1" }, { id: "song-2" }, { id: "song-3" }];

describe("parseSheetPlace", () => {
  it("reads a kept place of the sheet", () => {
    expect(
      parseSheetPlace(storedSheetPlace("sheet-a", { songId: "song-2", page: 1 }), "sheet-a"),
    ).toEqual({
      songId: "song-2",
      page: 1,
    });
  });

  it("gives no place for another sheet", () => {
    expect(
      parseSheetPlace(storedSheetPlace("sheet-a", { songId: "song-2", page: 1 }), "sheet-b"),
    ).toBeNull();
  });

  it("gives no place for nothing kept or a broken value", () => {
    expect(parseSheetPlace(null, "sheet-a")).toBeNull();
    expect(parseSheetPlace("{", "sheet-a")).toBeNull();
    expect(
      parseSheetPlace(JSON.stringify({ sheet: "sheet-a", songId: "song-2", page: -1 }), "sheet-a"),
    ).toBeNull();
    expect(
      parseSheetPlace(JSON.stringify({ sheet: "sheet-a", songId: "song-2", page: 1.5 }), "sheet-a"),
    ).toBeNull();
    expect(parseSheetPlace(JSON.stringify({ sheet: "sheet-a", page: 0 }), "sheet-a")).toBeNull();
    expect(parseSheetPlace(JSON.stringify({ songId: "song-2", page: 0 }), "sheet-a")).toBeNull();
  });
});

describe("placeAnchor", () => {
  it("finds the song of the place", () => {
    expect(placeAnchor({ songId: "song-3", page: 2 }, SONGS)).toEqual({ song: 2, page: 2 });
  });

  it("gives no anchor when the song is not on the sheet anymore", () => {
    expect(placeAnchor({ songId: "song-9", page: 0 }, SONGS)).toBeNull();
    expect(placeAnchor(null, SONGS)).toBeNull();
  });
});
