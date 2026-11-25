import { describe, expect, it } from "vitest";

import { takeSongs, type SongRef } from "./plan-sync";

type Item = { kind: "song" | "text"; a?: string; note?: string };

const rules = {
  isSong: (item: Item) => item.kind === "song",
  arrangementOf: (item: Item) => item.a ?? "",
  withSong: (song: SongRef, previous: Item | null): Item =>
    previous ?? { kind: "song", a: song.arrangementId },
};
const song = (a: string): SongRef => ({
  arrangementId: a,
  songId: `s-${a}`,
  title: a,
  musicalKey: null,
});
const ids = (items: Item[]) => items.map((item) => (item.kind === "song" ? item.a : "-"));

describe("takeSongs", () => {
  it("keeps text items in place and takes the song order of the source", () => {
    const target: Item[] = [
      { kind: "text" },
      { kind: "song", a: "1" },
      { kind: "text" },
      { kind: "song", a: "2" },
    ];
    expect(ids(takeSongs(target, [song("2"), song("1")], rules))).toEqual(["-", "2", "-", "1"]);
  });

  it("keeps the details of a song that stays", () => {
    const target: Item[] = [{ kind: "song", a: "1", note: "szóló" }];
    expect(takeSongs(target, [song("1")], rules)).toEqual([
      { kind: "song", a: "1", note: "szóló" },
    ]);
  });

  it("adds extra songs after the last song slot and removes missing ones", () => {
    const target: Item[] = [
      { kind: "song", a: "1" },
      { kind: "text" },
      { kind: "song", a: "2" },
      { kind: "text" },
    ];
    expect(ids(takeSongs(target, [song("1"), song("2"), song("3")], rules))).toEqual([
      "1",
      "-",
      "2",
      "3",
      "-",
    ]);
    expect(ids(takeSongs(target, [song("2")], rules))).toEqual(["2", "-", "-"]);
  });

  it("appends all songs to a target without song slots, and handles the same song twice", () => {
    expect(ids(takeSongs([{ kind: "text" }], [song("1"), song("1")], rules))).toEqual([
      "-",
      "1",
      "1",
    ]);
  });
});
