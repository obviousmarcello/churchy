import { describe, expect, it } from "vitest";

import {
  bibleBookItem,
  bibleItemKey,
  buildProjectionItems,
  DEFAULT_ASPECT_RATIO,
  findTile,
  fits,
  HIGHLIGHT_SCALE,
  isBibleItemKey,
  lyricSections,
  presentationSlides,
  ROLL_CONTEXT,
  ROLL_TEXT_SIZE_DEFAULT,
  SCRIPTURE_TEXT_SPACE,
  SCRIPTURE_REFERENCE_MAX_LENGTH,
  scriptureRollSlide,
  scriptureSlide,
  SLIDE_LAYOUT,
  splitSection,
  splitVerses,
  slideLayout,
  textParagraphs,
  textSlideParts,
  tileOfAnchor,
  tileSequence,
  type ProjectionPassage,
  type ProjectionSource,
} from "./slides";
import { MAX_PASSAGE_VERSES } from "@/lib/music/scripture/passage";
import { referenceStyle } from "@/lib/music/scripture/reference";
import { parseProjectionState } from "./protocol";
import { FALLBACK_LOOK } from "./themes";

const CHART = `{title: Lorem}
{comment: Capo 2}
{start_of_verse: Verse 1}
[G]Lorem ip[C]sum dolor
[D]sit amet

con[G]sectetur
{end_of_verse}
{start_of_chorus}
[C]Adipiscing [G]elit
{end_of_chorus}
{start_of_verse: Verse 2}
Sed do eiusmod
{end_of_verse}`;

function song(
  overrides: Partial<Extract<ProjectionSource, { kind: "song" }>> = {},
): ProjectionSource {
  return {
    kind: "song",
    key: "a",
    title: "Lorem",
    copyright: "© Ipsum",
    chordpro: CHART,
    sectionOrder: [],
    ...overrides,
  };
}

describe("lyricSections", () => {
  it("keeps the lyrics without the chords, the comments and the directives", () => {
    expect(lyricSections(CHART, [])).toEqual([
      {
        label: "Verse 1",
        anchor: "verse 1#1",
        paragraphs: [["Lorem ipsum dolor", "sit amet"], ["consectetur"]],
      },
      { label: "Chorus", anchor: "chorus#1", paragraphs: [["Adipiscing elit"]] },
      { label: "Verse 2", anchor: "verse 2#1", paragraphs: [["Sed do eiusmod"]] },
    ]);
  });

  it("uses the section order, with the repeats", () => {
    const sections = lyricSections(CHART, ["Chorus", "Verse 2", "Chorus"]);
    expect(sections.map((section) => [section.label, section.anchor])).toEqual([
      ["Chorus", "chorus#1"],
      ["Verse 2", "verse 2#1"],
      ["Chorus", "chorus#2"],
    ]);
  });

  it("makes a section of `{chorus}`", () => {
    const chart = "{soc}\nAmet\n{eoc}\n{sov: Verse}\nLorem\n{eov}\n{chorus}";
    expect(lyricSections(chart, []).map((section) => [section.label, section.paragraphs])).toEqual([
      ["Chorus", [["Amet"]]],
      ["Verse", [["Lorem"]]],
      ["Chorus", [["Amet"]]],
    ]);
  });

  it("keeps a section without lyrics, and leaves out lines of chords", () => {
    expect(lyricSections("{sov: Intro}\n[G] [C] [D]\n{eov}", [])).toEqual([
      { label: "Intro", anchor: "intro#1", paragraphs: [] },
    ]);
  });

  it("puts the lyrics outside the sections with the section before them", () => {
    const chart = "Lorem\n{sov: Verse}\nIpsum\n{eov}\nDolor";
    expect(lyricSections(chart, []).map((section) => [section.label, section.paragraphs])).toEqual([
      [null, [["Lorem"]]],
      ["Verse", [["Ipsum"], ["Dolor"]]],
    ]);
  });

  it("leaves out the remarks in the chord line", () => {
    expect(lyricSections("[*Riff]Lorem [G]ipsum", [])[0]!.paragraphs).toEqual([["Lorem ipsum"]]);
  });
});

describe("splitSection", () => {
  it("keeps a short section on one slide", () => {
    expect(splitSection([["Lorem", "Ipsum"], ["Dolor"]], DEFAULT_ASPECT_RATIO)).toEqual([
      [["Lorem", "Ipsum"], ["Dolor"]],
    ]);
  });

  it("spreads a long section evenly, with each part fitting at the smallest text", () => {
    const lines = Array.from({ length: 20 }, (_, index) => `Lorem ipsum ${index}`);
    const parts = splitSection([lines], DEFAULT_ASPECT_RATIO);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat(2)).toEqual(lines);
    for (const part of parts)
      expect(fits(part, DEFAULT_ASPECT_RATIO, SLIDE_LAYOUT.minFont)).toBe(true);
    const sizes = parts.map((part) => part.flat().length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("needs more slides on a narrower screen", () => {
    // One row each at 16:9, two at 4:3.
    const lines = Array.from({ length: 10 }, () => "Lorem ipsum dolor sit amet, consectetur adip");
    expect(splitSection([lines], 4 / 3).length).toBeGreaterThan(
      splitSection([lines], 16 / 9).length,
    );
  });

  it("needs more slides for a wider margin, and fewer for a narrow font", () => {
    const count = (lines: string[], overrides: Partial<typeof FALLBACK_LOOK>) =>
      splitSection([lines], DEFAULT_ASPECT_RATIO, slideLayout({ ...FALLBACK_LOOK, ...overrides }))
        .length;
    // One row each: 10 on a slide, 8 with the widest margin.
    const short = Array.from({ length: 20 }, () => "Lorem ipsum dolor sit amet, consectetur");
    expect(count(short, {})).toBe(2);
    expect(count(short, { margin: 15 })).toBe(3);
    // Two rows each in Inter, one in Oswald.
    const long = Array.from(
      { length: 10 },
      () => "Lorem ipsum dolor sit amet, consectetur adipiscing elit",
    );
    expect(count(long, {})).toBe(2);
    expect(count(long, { font: "oswald" })).toBe(1);
  });

  it("starts a part at a paragraph when one is near", () => {
    const first = Array.from({ length: 6 }, (_, index) => `Lorem ${index}`);
    const second = Array.from({ length: 7 }, (_, index) => `Ipsum ${index}`);
    expect(splitSection([first, second], DEFAULT_ASPECT_RATIO)).toEqual([[first], [second]]);
  });
});

describe("buildProjectionItems", () => {
  it("starts a song with its title slide", () => {
    const [item] = buildProjectionItems([song()], DEFAULT_ASPECT_RATIO);
    expect(item!.hasLyrics).toBe(true);
    expect(item!.tiles.map((tile) => [tile.id, tile.label])).toEqual([
      ["title", null],
      ["0.0", "Verse 1"],
      ["1.0", "Chorus"],
      ["2.0", "Verse 2"],
    ]);
    expect(item!.tiles[0]!.slide).toEqual({ kind: "title", title: "Lorem", copyright: "© Ipsum" });
  });

  it("gives a text item one blank slide with its title as the caption", () => {
    const [item] = buildProjectionItems(
      [{ kind: "text", key: "b", title: "Prayer" }],
      DEFAULT_ASPECT_RATIO,
    );
    expect(item).toMatchObject({ kind: "text", title: "Prayer", hasLyrics: false });
    expect(item!.tiles.map((tile) => tile.id)).toEqual(["blank"]);
    expect(item!.tiles.map((tile) => tile.slide)).toEqual([{ kind: "blank", caption: "Prayer" }]);
  });

  it("gives a text slide a blank slide, then its description and its highlighted text, but not its title", () => {
    const [item] = buildProjectionItems(
      [
        {
          kind: "textSlide",
          key: "c",
          title: "Prayer theme",
          description: "We pray for\n\nthe sick",
          highlight: "Our families",
        },
      ],
      DEFAULT_ASPECT_RATIO,
    );
    expect(item).toMatchObject({
      kind: "textSlide",
      title: "Prayer theme",
      scripture: false,
      hasLyrics: false,
    });
    expect(item!.tiles.map((tile) => tile.id)).toEqual(["blank", "text.0"]);
    expect(item!.tiles[1]!.slide).toEqual({
      kind: "text",
      paragraphs: [["We pray for"], ["the sick"]],
      highlight: [["Our families"]],
    });
  });

  it("gives a text slide without text only the blank slide", () => {
    const [item] = buildProjectionItems(
      [{ kind: "textSlide", key: "c", title: "Prayer theme", description: null, highlight: null }],
      DEFAULT_ASPECT_RATIO,
    );
    expect(item!.tiles.map((tile) => tile.slide)).toEqual([{ kind: "blank" }]);
  });

  it("gives a scripture reading one slide with its reference", () => {
    const [item] = buildProjectionItems(
      [{ kind: "text", key: "b", title: "John 3:16-21", scripture: true }],
      DEFAULT_ASPECT_RATIO,
    );
    expect(item).toMatchObject({ kind: "text", scripture: true, hasLyrics: false });
    expect(item!.tiles.map((tile) => tile.slide)).toEqual([
      { kind: "title", title: "John 3:16-21", copyright: null },
    ]);
  });

  it("gives a scripture reading the verses after the title, with the translation", () => {
    const passage: ProjectionPassage = {
      translation: {
        id: "x",
        language: "hu",
        name: "Lorem fordítás",
        shortName: "Lorem",
        notice: "© Ipsum",
        deuterocanon: false,
        source: "files",
      },
      verses: [
        { chapter: 3, verse: 35, text: "Lorem ipsum." },
        { chapter: 3, verse: 36, text: "Dolor sit amet." },
        { chapter: 4, verse: 1, text: "Consectetur." },
      ],
    };
    const [item] = buildProjectionItems(
      [{ kind: "text", key: "b", title: "Jn 3,35-4,1", scripture: true, translation: "x" }],
      DEFAULT_ASPECT_RATIO,
      new Map([["b", passage]]),
    );
    expect(item!.tiles.map((tile) => [tile.id, tile.label])).toEqual([
      ["title", null],
      ["3:35", "3,35"],
      ["3:36", "3,36"],
      ["4:1", "4,1"],
    ]);
    expect(item!.tiles[0]!.slide).toEqual({
      kind: "title",
      title: "Jn 3,35-4,1",
      copyright: "Lorem fordítás\n© Ipsum",
    });
    expect(item!.tiles[3]!.slide).toEqual({
      kind: "scripture",
      verses: [{ label: "1", text: "Consectetur." }],
      reference: "Jn 4,1 (Lorem)",
    });
    // The controller shows more verses together, and a file has them on as few slides as fit.
    const together = scriptureSlide(item!.scriptureFormat!, passage.verses);
    expect(together).toEqual({
      kind: "scripture",
      verses: [
        { label: "35", text: "Lorem ipsum." },
        { label: "36", text: "Dolor sit amet." },
        { label: "4,1", text: "Consectetur." },
      ],
      reference: "Jn 3,35–36; 4,1 (Lorem)",
    });
    expect(presentationSlides([item!], DEFAULT_ASPECT_RATIO).map(({ slide }) => slide)).toEqual([
      item!.tiles[0]!.slide,
      together,
    ]);
  });

  it("gives a book of the Bible panel a tile for each verse, in the style of the translation", () => {
    const translation = {
      id: "x",
      language: "hu",
      name: "Lorem fordítás",
      shortName: "Lorem",
      notice: null,
      deuterocanon: false,
      source: "files" as const,
    };
    const text = { chapters: [["Lorem ipsum.", ""], ["Dolor sit amet."]] };
    const item = bibleBookItem(translation, "Acts", text, FALLBACK_LOOK);
    expect(item).toMatchObject({
      kind: "text",
      key: "bible:x/Acts",
      scripture: true,
      hasLyrics: false,
    });
    expect(isBibleItemKey(item.key)).toBe(true);
    expect(item.tiles.map((tile) => [tile.id, tile.label])).toEqual([
      ["1:1", "1,1"],
      ["2:1", "2,1"],
    ]);
    expect(item.tiles[1]!.slide).toEqual({
      kind: "scripture",
      verses: [{ label: "1", text: "Dolor sit amet." }],
      reference: "ApCsel 2,1 (Lorem)",
    });
    expect(
      scriptureSlide(
        item.scriptureFormat!,
        item.tiles.map((tile) => tile.verse!),
      ),
    ).toMatchObject({
      reference: "ApCsel 1,1; 2,1 (Lorem)",
    });

    const english = bibleBookItem(
      { ...translation, id: "y", language: "en" },
      "1Cor",
      text,
      FALLBACK_LOOK,
    );
    expect(english.key).toBe(bibleItemKey("y", "1Cor"));
    expect(english.tiles[0]!.slide).toMatchObject({ reference: "1 Cor 1:1 (Lorem)" });
  });

  it("keeps a slide of many verses within the limits of the screens", () => {
    // Every second verse: the reference lists each of them.
    const verses = Array.from({ length: 250 }, (_, index) => ({
      chapter: 1,
      verse: 2 * index + 1,
      text: "Lorem.",
    }));
    const slide = scriptureSlide({ ...referenceStyle("Jn 1,1")!, translation: "Lorem" }, verses);
    if (slide.kind !== "scripture") throw new Error("Not a scripture slide");
    expect(slide.verses).toHaveLength(MAX_PASSAGE_VERSES);
    expect(slide.verses.at(-1)).toEqual({ label: "499", text: "Lorem." });
    expect(Array.from(slide.reference)).toHaveLength(SCRIPTURE_REFERENCE_MAX_LENGTH);
    expect(slide.reference.endsWith("…")).toBe(true);
    const state = {
      seq: 1,
      mode: "show",
      slide,
      position: { itemKey: "a", tileId: "1:499" },
      look: FALLBACK_LOOK,
      preload: null,
    };
    expect(parseProjectionState(state)).not.toBeNull();
  });

  it("marks a song without lyrics", () => {
    const [empty, chords] = buildProjectionItems(
      [song({ chordpro: "" }), song({ key: "b", chordpro: "{sov: Intro}\n[G] [C]\n{eov}" })],
      DEFAULT_ASPECT_RATIO,
    );
    expect(empty!.hasLyrics).toBe(false);
    expect(empty!.tiles.map((tile) => tile.id)).toEqual(["title"]);
    expect(chords!.hasLyrics).toBe(false);
  });

  it("numbers the parts of a long section", () => {
    const verse = Array.from({ length: 24 }, (_, index) => `Lorem ipsum ${index}`).join("\n");
    const [item] = buildProjectionItems(
      [song({ chordpro: `{sov: Verse}\n${verse}\n{eov}` })],
      DEFAULT_ASPECT_RATIO,
    );
    const parts = item!.tiles.slice(1);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((tile, index) =>
      expect(tile).toMatchObject({
        id: `0.${index}`,
        part: index,
        parts: parts.length,
        anchor: "verse#1",
      }),
    );
  });
});

describe("scriptureRollSlide", () => {
  const translation = {
    id: "x",
    language: "hu",
    name: "Lorem fordítás",
    shortName: "Lorem",
    notice: null,
    deuterocanon: false,
    source: "files" as const,
  };
  // 1,1 to 1,6, then 2,1 and 2,2.
  const text = {
    chapters: [
      ["A.", "B.", "C.", "D.", "E.", "F."],
      ["G.", "H."],
    ],
  };
  const item = bibleBookItem(translation, "Acts", text, FALLBACK_LOOK);
  const tile = (id: string) => item.tiles.find((candidate) => candidate.id === id)!;

  it("has the verses around the live verses, muted, with the ids of their tiles", () => {
    const slide = scriptureRollSlide(item, [tile("1:5")]);
    expect(ROLL_CONTEXT).toBe(3);
    expect(slide).toEqual({
      kind: "scripture",
      verses: [{ label: "5", text: "E." }],
      reference: "ApCsel 1,5 (Lorem)",
      roll: {
        ids: ["1:5"],
        before: [
          { id: "1:2", label: "2", text: "B." },
          { id: "1:3", label: "3", text: "C." },
          { id: "1:4", label: "4", text: "D." },
        ],
        after: [
          { id: "1:6", label: "6", text: "F." },
          { id: "2:1", label: "2,1", text: "G." },
          { id: "2:2", label: "2", text: "H." },
        ],
        textSize: ROLL_TEXT_SIZE_DEFAULT,
      },
    });
  });

  it("has fewer verses around them at the start and at the end", () => {
    expect(scriptureRollSlide(item, [tile("1:1")])).toMatchObject({
      roll: { before: [], after: [{ id: "1:2" }, { id: "1:3" }, { id: "1:4" }] },
    });
    expect(scriptureRollSlide(item, [tile("2:2")])).toMatchObject({
      roll: { before: [{ id: "1:5" }, { id: "1:6" }, { id: "2:1" }], after: [] },
    });
  });

  it("gives a verse the same label in each place", () => {
    // The first verse of a chapter has its chapter, also as the first live verse.
    expect(scriptureRollSlide(item, [tile("2:1")])).toMatchObject({ verses: [{ label: "2,1" }] });
    expect(scriptureRollSlide(item, [tile("1:1")])).toMatchObject({ verses: [{ label: "1" }] });
    // After a gap in the live verses too: 2,2 is "2" as after 2,1.
    expect(scriptureRollSlide(item, [tile("1:6"), tile("2:2")])).toMatchObject({
      verses: [{ label: "6" }, { label: "2" }],
    });
    expect(scriptureRollSlide(item, [tile("2:1")])).toMatchObject({
      roll: { after: [{ id: "2:2", label: "2" }] },
    });
  });

  it("has more live verses, also when they are not next to each other", () => {
    expect(scriptureRollSlide(item, [tile("2:1"), tile("1:4")])).toMatchObject({
      verses: [{ label: "4" }, { label: "2,1" }],
      reference: "ApCsel 1,4; 2,1 (Lorem)",
      roll: {
        ids: ["1:4", "2:1"],
        before: [{ id: "1:1" }, { id: "1:2" }, { id: "1:3" }],
        after: [{ id: "2:2" }],
      },
    });
  });

  it("is null without verses", () => {
    const [song] = buildProjectionItems(
      [{ kind: "text", key: "b", title: "Jn 3,16", scripture: true }],
      DEFAULT_ASPECT_RATIO,
    );
    expect(scriptureRollSlide(song!, song!.tiles)).toBeNull();
    expect(scriptureRollSlide(item, [])).toBeNull();
  });

  it("makes a state that the screens accept, with the text size of the roll", () => {
    const slide = scriptureRollSlide(item, [tile("1:5")], 60);
    expect(slide).toMatchObject({ roll: { textSize: 60 } });
    const state = {
      seq: 1,
      mode: "show",
      slide,
      position: { itemKey: item.key, tileId: "1:5" },
      look: FALLBACK_LOOK,
      preload: null,
      scriptureRoll: 60,
    };
    expect(parseProjectionState(state)).toMatchObject({ slide, scriptureRoll: 60 });
  });
});

describe("buildProjectionItems with themes", () => {
  it("gives each item its look and splits it for that look", () => {
    const long = `{sov: Verse}\n${Array.from({ length: 20 }, () => "Lorem ipsum dolor sit amet, consectetur").join("\n")}\n{eov}`;
    const look = { ...FALLBACK_LOOK, margin: 15 };
    const [plain, themed] = buildProjectionItems(
      [song({ key: "a", chordpro: long }), song({ key: "b", chordpro: long, themeId: "t" })],
      DEFAULT_ASPECT_RATIO,
      new Map(),
      (source) => (source.themeId === "t" ? look : FALLBACK_LOOK),
    );
    expect(plain!.look).toBe(FALLBACK_LOOK);
    expect(themed!.look).toBe(look);
    expect(themed!.tiles.length).toBeGreaterThan(plain!.tiles.length);
  });
});

describe("splitVerses", () => {
  it("puts as many whole verses on a slide as fit at the smallest text size", () => {
    const verses = Array.from({ length: 12 }, (_, index) => ({
      label: `${index + 1}`,
      text: "Lorem ipsum dolor sit amet, ".repeat(5),
    }));
    const parts = splitVerses(verses, DEFAULT_ASPECT_RATIO);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat()).toEqual(verses);
    for (const part of parts) {
      const prose = part.map(({ label, text }) => `${label} ${text}`).join(" ");
      expect(
        part.length === 1 ||
          fits([[prose]], DEFAULT_ASPECT_RATIO, SLIDE_LAYOUT.minFont, SCRIPTURE_TEXT_SPACE),
      ).toBe(true);
    }
  });

  it("gives a verse that does not fit alone its own slide", () => {
    const long = { label: "1", text: "Lorem ipsum ".repeat(500) };
    expect(
      splitVerses(
        [{ label: "0", text: "a" }, long, { label: "2", text: "b" }],
        DEFAULT_ASPECT_RATIO,
      ),
    ).toHaveLength(3);
  });
});

describe("finding tiles", () => {
  const [item] = buildProjectionItems([song()], DEFAULT_ASPECT_RATIO);

  it("goes through all the tiles in order", () => {
    const sequence = tileSequence(
      buildProjectionItems([song(), { kind: "text", key: "b", title: "Prayer" }], 16 / 9),
    );
    expect(sequence.map(({ item, tile }) => `${item.key}/${tile.id}`)).toEqual([
      "a/title",
      "a/0.0",
      "a/1.0",
      "a/2.0",
      "b/blank",
    ]);
  });

  it("finds the nearest part of another split", () => {
    expect(findTile(item!, "1.0")?.label).toBe("Chorus");
    expect(findTile(item!, "1.3")?.label).toBe("Chorus");
    expect(findTile(item!, "9.0")).toBeNull();
  });

  it("finds the section of a live session, else the title", () => {
    expect(tileOfAnchor(item!, "chorus#1").label).toBe("Chorus");
    expect(tileOfAnchor(item!, "bridge#1").id).toBe("title");
    expect(tileOfAnchor(item!, null).id).toBe("title");
  });

  it("finds the next repeat for a leader who sees the sections as written", () => {
    const [ordered] = buildProjectionItems(
      [song({ sectionOrder: ["Verse 1", "Chorus", "Verse 2", "Chorus", "Chorus"] })],
      DEFAULT_ASPECT_RATIO,
    );
    const tile = (id: string) => findTile(ordered!, id);
    expect(tileOfAnchor(ordered!, "chorus#1").id).toBe("1.0");
    expect(tileOfAnchor(ordered!, "chorus#1", { written: true }).id).toBe("1.0");
    expect(tileOfAnchor(ordered!, "chorus#1", { written: true, from: tile("2.0") }).id).toBe("3.0");
    expect(tileOfAnchor(ordered!, "chorus#1", { written: true, from: tile("4.0") }).id).toBe("4.0");
    expect(tileOfAnchor(ordered!, "verse 1#1", { written: true, from: tile("4.0") }).id).toBe(
      "0.0",
    );
  });
});

describe("buildProjectionItems with the gallery", () => {
  it("has an image slide for each image, in order, with its name", () => {
    const adjust = {
      fit: "contain",
      scale: 100,
      x: 0,
      y: 0,
      rotation: 0,
      background: "color",
      backgroundColor: "#000000",
    } as const;
    const url = (n: number) =>
      `/munkater/esemenyek/fajl/kep/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-00000000000${n}.webp`;
    const [item] = buildProjectionItems(
      [
        {
          kind: "images",
          key: "item",
          title: "Images",
          imageSetId: "set",
          images: [
            { id: "b", name: "Welcome", url: url(2), width: 1920, height: 1080, adjust },
            { id: "a", name: "Notices", url: url(3), width: 800, height: 600, adjust },
          ],
        },
      ],
      DEFAULT_ASPECT_RATIO,
    );
    expect(item!.kind).toBe("images");
    expect(item!.hasLyrics).toBe(false);
    expect(item!.tiles.map((tile) => [tile.id, tile.label])).toEqual([
      ["b", "Welcome"],
      ["a", "Notices"],
    ]);
    expect(item!.tiles[1]!.slide).toEqual({
      kind: "image",
      url: url(3),
      width: 800,
      height: 600,
      adjust,
    });
    // The screens accept the slide.
    expect(
      parseProjectionState({
        seq: 1,
        mode: "show",
        slide: item!.tiles[1]!.slide,
        position: null,
        look: FALLBACK_LOOK,
        preload: null,
      }),
    ).not.toBeNull();
  });
});

describe("textParagraphs", () => {
  it("starts a paragraph at an empty line and drops the empty lines and the spaces at the ends", () => {
    expect(textParagraphs("  Lorem \nipsum\n \n\n dolor ")).toEqual([
      ["Lorem", "ipsum"],
      ["dolor"],
    ]);
    expect(textParagraphs("")).toEqual([]);
    expect(textParagraphs(null)).toEqual([]);
  });
});

describe("textSlideParts", () => {
  it("puts the highlighted text on the last part when it fits there", () => {
    expect(textSlideParts([["Lorem"]], [["Ipsum"]], DEFAULT_ASPECT_RATIO)).toEqual([
      { kind: "text", paragraphs: [["Lorem"]], highlight: [["Ipsum"]] },
    ]);
  });

  it("gives the highlighted text a part of its own when it does not fit after the description", () => {
    // 11 lines fill a slide at the smallest text size.
    const description = [Array.from({ length: 11 }, (_, index) => `Line ${index + 1}`)];
    expect(fits(description, DEFAULT_ASPECT_RATIO, SLIDE_LAYOUT.minFont)).toBe(true);
    const parts = textSlideParts(description, [["Ipsum dolor sit amet"]], DEFAULT_ASPECT_RATIO);
    expect(parts.at(-1)).toEqual({
      kind: "text",
      paragraphs: [],
      highlight: [["Ipsum dolor sit amet"]],
    });
    expect(parts.slice(0, -1).flatMap((part) => part.paragraphs.flat())).toEqual(description[0]);
  });

  it("splits a long description as a long section", () => {
    const description = [Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`)];
    const parts = textSlideParts(description, [], DEFAULT_ASPECT_RATIO);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((part) => part.paragraphs.flat())).toEqual(description[0]);
    expect(parts.every((part) => part.highlight.length === 0)).toBe(true);
  });

  it("splits a long highlighted text at its larger size, within the limits of the message", () => {
    // Under the 500 characters of the database, but 120 lines and 120 paragraphs.
    for (const highlight of [
      [Array.from({ length: 120 }, () => "a")],
      Array.from({ length: 120 }, () => ["a"]),
    ]) {
      const parts = textSlideParts([["Lorem"]], highlight, DEFAULT_ASPECT_RATIO);
      expect(parts.length).toBeGreaterThan(2);
      expect(parts.flatMap((part) => part.highlight.flat())).toEqual(highlight.flat());
      const highlightLayout = { ...SLIDE_LAYOUT, minFont: SLIDE_LAYOUT.minFont * HIGHLIGHT_SCALE };
      for (const part of parts) {
        expect(
          fits(
            part.highlight,
            DEFAULT_ASPECT_RATIO,
            highlightLayout.minFont,
            undefined,
            highlightLayout,
          ),
        ).toBe(true);
        expect(
          parseProjectionState({
            seq: 1,
            mode: "show",
            slide: part,
            position: null,
            look: FALLBACK_LOOK,
            preload: null,
          }),
        ).not.toBeNull();
      }
    }
  });

  it("has the highlighted text alone without a description, and nothing without either", () => {
    expect(textSlideParts([], [["Ipsum"]], DEFAULT_ASPECT_RATIO)).toEqual([
      { kind: "text", paragraphs: [], highlight: [["Ipsum"]] },
    ]);
    expect(textSlideParts([], [], DEFAULT_ASPECT_RATIO)).toEqual([]);
  });
});
