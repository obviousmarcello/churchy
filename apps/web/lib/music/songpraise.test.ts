import { describe, expect, it } from "vitest";

import { parseChordPro, parseChordProSections } from "./chordpro";
import {
  appendChart,
  searchSongpraise,
  searchSongpraiseTitles,
  songbookQuery,
  songpraiseSongbook,
  songpraiseOrder,
  songpraiseToChordPro,
  SONGPRAISE_ID,
} from "./songpraise";

describe("songpraiseToChordPro", () => {
  it("converts the sections and the order", () => {
    const result = songpraiseToChordPro(
      [
        { text: "Első sor\r\nMásodik sor  ", chorus: false, type: 1 },
        { text: "Refrén sor", chorus: true, type: 3 },
        { text: "Harmadik sor", chorus: false, type: 1 },
      ],
      [0, 1, 2, 1],
    );

    expect(result.chordpro).toBe(`{start_of_verse: Verse 1}
Első sor
Második sor
{end_of_verse}

{start_of_chorus: Chorus}
Refrén sor
{end_of_chorus}

{start_of_verse: Verse 2}
Harmadik sor
{end_of_verse}`);
    expect(result.sectionOrder).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("maps each section type", () => {
    const result = songpraiseToChordPro(
      [0, 1, 2, 3, 4, 5, null].map((type) => ({ text: `t${type}`, chorus: false, type })),
      null,
    );

    expect(parseChordProSections(result.chordpro)).toEqual([
      { type: "intro", label: "Intro" },
      { type: "verse", label: "Verse 1" },
      { type: "pre_chorus", label: "Pre-Chorus" },
      { type: "chorus", label: "Chorus" },
      { type: "bridge", label: "Bridge" },
      { type: "outro", label: "Coda" },
      { type: "verse", label: "Verse 2" },
    ]);
  });

  it("takes the chorus flag without a type", () => {
    const result = songpraiseToChordPro([{ text: "a", chorus: true }], null);

    expect(result.chordpro).toBe("{start_of_chorus: Chorus}\na\n{end_of_chorus}");
  });

  it("leaves out the order when it is the order of the chart", () => {
    const verses = [
      { text: "a", chorus: false, type: 1 },
      { text: "b", chorus: false, type: 1 },
    ];

    expect(songpraiseToChordPro(verses, [0, 1]).sectionOrder).toEqual([]);
    expect(songpraiseToChordPro(verses, null).sectionOrder).toEqual([]);
    expect(songpraiseToChordPro(verses, []).sectionOrder).toEqual([]);
  });

  it("puts a repeated section into the chart once and keeps it in the order", () => {
    const result = songpraiseToChordPro(
      [
        { text: "v1", chorus: false, type: 1 },
        { text: "ref", chorus: true, type: 3 },
        { text: "v2", chorus: false, type: 1 },
        { text: "ref\n", chorus: true, type: 3 },
      ],
      null,
    );

    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Verse 1",
      "Chorus",
      "Verse 2",
    ]);
    expect(result.sectionOrder).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("skips empty sections and indexes out of range", () => {
    const result = songpraiseToChordPro(
      [
        { text: " \n", chorus: false, type: 1 },
        { text: "a", chorus: false, type: 1 },
        { text: "b", chorus: true, type: 3 },
      ],
      [1, 2, 0, 7, 2],
    );

    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Verse",
      "Chorus",
    ]);
    expect(result.sectionOrder).toEqual(["Verse", "Chorus", "Chorus"]);
  });

  it("gives an empty chart for a song without lyrics", () => {
    expect(songpraiseToChordPro([], null)).toEqual({ chordpro: "", sectionOrder: [] });
  });

  it("keeps the lyrics lines as lyrics, not as chords, directives or comments", () => {
    const result = songpraiseToChordPro(
      [{ text: "Áldjad [2x]\n{Refrén}\n# sor\n  #2", chorus: false, type: 1 }],
      null,
    );

    expect(result.chordpro).toBe(
      "{start_of_verse: Verse}\nÁldjad (2x)\n(Refrén)\n＃ sor\n  ＃2\n{end_of_verse}",
    );
    expect(parseChordPro(result.chordpro).parts[0]!.lines).toEqual([
      { kind: "lyrics", segments: [{ chord: null, annotation: false, text: "Áldjad (2x)" }] },
      { kind: "lyrics", segments: [{ chord: null, annotation: false, text: "(Refrén)" }] },
      { kind: "lyrics", segments: [{ chord: null, annotation: false, text: "＃ sor" }] },
      { kind: "lyrics", segments: [{ chord: null, annotation: false, text: "  ＃2" }] },
    ]);
  });
});

describe("songpraiseOrder", () => {
  const chart =
    "{start_of_verse: Verse 1}\na\n{end_of_verse}\n\n{start_of_chorus: Chorus}\nb\n{end_of_chorus}";

  it("keeps the order while the chart has its labels", () => {
    expect(songpraiseOrder(chart, ["Verse 1", "chorus", "Verse 1"])).toEqual([
      "Verse 1",
      "chorus",
      "Verse 1",
    ]);
  });

  it("gives the order of the chart when the chart lost a label of the order", () => {
    expect(songpraiseOrder(chart.replace("Chorus}", "Refrén}"), ["Verse 1", "Chorus"])).toEqual([]);
  });
});

describe("appendChart", () => {
  const verse = (label: string, text: string) =>
    `{start_of_verse: ${label}}\n${text}\n{end_of_verse}`;
  const chorus = "{start_of_chorus}\nc\n{end_of_chorus}";

  it("gives the labels that the chart has the next free numbers", () => {
    const result = appendChart(
      {
        chordpro: `${verse("Verse 1", "a")}\n\n${verse("Verse 2", "b")}\n\n${chorus}`,
        sectionOrder: [],
      },
      {
        chordpro: `${verse("Verse 1", "x")}\n\n${verse("Verse 3", "y")}\n\n{start_of_chorus: chorus}\nz\n{end_of_chorus}`,
        sectionOrder: [],
      },
    );

    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Verse 1",
      "Verse 2",
      "Chorus",
      "Verse 4",
      "Verse 3",
      "chorus 2",
    ]);
    expect(result.sectionOrder).toEqual([]);
  });

  it("goes on with the order of the added chart", () => {
    const current = { chordpro: `${verse("Verse", "a")}\n\n${chorus}`, sectionOrder: [] };
    const added = {
      chordpro: `${verse("Verse", "x")}\n\n{start_of_chorus: Chorus}\nz\n{end_of_chorus}`,
      sectionOrder: ["Verse", "Chorus", "Chorus"],
    };

    expect(appendChart(current, added).sectionOrder).toEqual([
      "Verse",
      "Chorus",
      "Verse 2",
      "Chorus 2",
      "Chorus 2",
    ]);
    expect(
      appendChart({ ...current, sectionOrder: ["Chorus", "Verse"] }, { ...added, sectionOrder: [] })
        .sectionOrder,
    ).toEqual(["Chorus", "Verse", "Verse 2", "Chorus 2"]);
  });

  it("takes the added chart alone after an empty chart", () => {
    expect(
      appendChart(
        { chordpro: " \n", sectionOrder: [] },
        { chordpro: chorus, sectionOrder: ["Chorus"] },
      ),
    ).toEqual({
      chordpro: chorus,
      sectionOrder: ["Chorus"],
    });
  });
});

describe("songpraiseSongbook", () => {
  it("joins the books with the numbers of the song, without leading zeros", () => {
    expect(
      songpraiseSongbook([
        { name: "Hit hangjai", number: "012" },
        { name: " Baptista  Gyülekezeti Énekeskönyv ", number: "343" },
        { name: "Hit hangjai", number: "12" },
        { name: "Zero", number: "0" },
        { name: "Without number", number: null },
      ]),
    ).toBe("Hit hangjai 12; Baptista Gyülekezeti Énekeskönyv 343; Zero 0; Without number");
  });

  it("leaves out the books that do not fit the field", () => {
    const long = "x".repeat(190);
    expect(
      songpraiseSongbook([
        { name: "Hit hangjai", number: "12" },
        { name: long, number: "1" },
      ]),
    ).toBe("Hit hangjai 12");
  });

  it("gives null without a book", () => {
    expect(songpraiseSongbook([])).toBeNull();
    expect(songpraiseSongbook([{ name: " ", number: null }])).toBeNull();
  });
});

describe("searchSongpraiseTitles", () => {
  const titles = [
    { id: "1", title: "Te vagy a nagy Isten", views: 10 },
    { id: "2", title: "Nagy vagy Te", views: 5 },
    { id: "3", title: "Nagy vagy, Te, Uram", views: 50 },
    { id: "4", title: "Áldjad lelkem", views: 100 },
  ];

  it("ranks the same title, then the titles that start with the query, then by views", () => {
    expect(searchSongpraiseTitles(titles, "nagy vagy te", 10).map((song) => song.id)).toEqual([
      "2",
      "3",
    ]);
    expect(searchSongpraiseTitles(titles, "nagy", 10).map((song) => song.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });

  it("ignores accents and punctuation, and keeps the limit", () => {
    expect(searchSongpraiseTitles(titles, "aldjad", 10).map((song) => song.id)).toEqual(["4"]);
    expect(searchSongpraiseTitles(titles, "nagy", 1).map((song) => song.id)).toEqual(["3"]);
  });

  it("finds nothing for an empty query", () => {
    expect(searchSongpraiseTitles(titles, " ,. ", 10)).toEqual([]);
  });
});

describe("SONGPRAISE_ID", () => {
  it("takes the ids of SongPraise only", () => {
    expect(SONGPRAISE_ID.test("5a2d253b8c270b37345af0c3")).toBe(true);
    expect(SONGPRAISE_ID.test("6af972e9-e9b9-48a9-aaa5-ecebfbd38a95")).toBe(true);
    expect(SONGPRAISE_ID.test("../admin")).toBe(false);
    expect(SONGPRAISE_ID.test("5a2d253b8c270b37345af0c3/x")).toBe(false);
  });
});

describe("searchSongpraise", () => {
  const titles = [
    { id: "a", title: "Áldjad lelkem", views: 10 },
    { id: "b", title: "Nagy vagy Te", views: 50 },
    { id: "c", title: "Zsoltár 324", views: 1 },
  ];
  const entries = [
    { songId: "a", book: "Hit hangjai", number: "324" },
    { songId: "b", book: "Baptista Gyülekezeti Énekeskönyv", number: "324" },
    { songId: "b", book: "Hit hangjai", number: "12" },
    { songId: "gone", book: "Hit hangjai", number: "324" },
  ];

  it("finds a songbook number first, then the titles", () => {
    expect(searchSongpraise(titles, entries, "324", 10)).toEqual([
      {
        id: "b",
        title: "Nagy vagy Te",
        views: 50,
        songbook: "Baptista Gyülekezeti Énekeskönyv 324",
      },
      { id: "a", title: "Áldjad lelkem", views: 10, songbook: "Hit hangjai 324" },
      { id: "c", title: "Zsoltár 324", views: 1, songbook: null },
    ]);
  });

  it("takes a part of the name or the initials of the book, and leading zeros", () => {
    const ids = (query: string) =>
      searchSongpraise(titles, entries, query, 10).map((song) => song.id);
    expect(ids("Hit hangjai 324")).toEqual(["a"]);
    expect(ids("hangjai 0324")).toEqual(["a"]);
    expect(ids("HH 12")).toEqual(["b"]);
    expect(ids("BGE 324")).toEqual(["b"]);
    expect(ids("Zsoltár 324")).toEqual(["c"]);
  });

  it("takes the volume of a book as a number", () => {
    const volumes = [
      { songId: "a", book: "Dicsérem Neved III", number: "12" },
      { songId: "b", book: "Dicsérem Neved I", number: "12" },
    ];
    const ids = (query: string) =>
      searchSongpraise(titles, volumes, query, 10).map((song) => song.id);
    expect(ids("Dicsérem Neved 3 12")).toEqual(["a"]);
    expect(ids("DN3 12")).toEqual(["a"]);
    expect(ids("dn iii 12")).toEqual(["a"]);
    expect(ids("DN 12")).toEqual(["b", "a"]);
  });

  it("takes a volume number as a whole number", () => {
    const volumes = [
      { songId: "a", book: "Dicsérem Neved 1", number: "5" },
      { songId: "b", book: "Dicsérem Neved 10", number: "5" },
      { songId: "c", book: "Dicsérem Neved 11", number: "5" },
    ];
    const ids = (query: string) =>
      searchSongpraise(titles, volumes, query, 10).map((song) => song.id);
    expect(ids("DN1 5")).toEqual(["a"]);
    expect(ids("Dicsérem Neved 1 5")).toEqual(["a"]);
    expect(ids("DN10 5")).toEqual(["b"]);
  });

  it("searches only the titles without the songbooks", () => {
    expect(searchSongpraise(titles, null, "nagy", 10)).toEqual([
      { id: "b", title: "Nagy vagy Te", views: 50, songbook: null },
    ]);
  });
});

describe("songbookQuery", () => {
  it("splits the book and the number", () => {
    expect(songbookQuery(" 012 ")).toEqual({ book: "", number: "12" });
    expect(songbookQuery("Hit hangjai, 324.")).toEqual({ book: "Hit hangjai", number: "324" });
    expect(songbookQuery("HH#5")).toEqual({ book: "HH", number: "5" });
    expect(songbookQuery("Nagy vagy Te")).toBeNull();
  });
});
