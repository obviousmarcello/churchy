import { describe, expect, it } from "vitest";

import { DEFAULT_IMAGE_ADJUST } from "./images";
import {
  overlayLook,
  overlaySlide,
  parseOverlayBackground,
  streamPartIndex,
  streamParts,
} from "./overlay";
import type { ProjectionSlide } from "./slides";
import { FALLBACK_LOOK, TEXT_SIZE_MIN } from "./themes";

const LYRICS: ProjectionSlide = { kind: "lyrics", paragraphs: [["Lorem", "ipsum"]] };

describe("parseOverlayBackground", () => {
  it("takes a known background, else black", () => {
    expect(parseOverlayBackground("green")).toBe("green");
    expect(parseOverlayBackground("black")).toBe("black");
    expect(parseOverlayBackground(undefined)).toBe("black");
    expect(parseOverlayBackground("transparent")).toBe("black");
  });
});

describe("overlaySlide", () => {
  it("shows the lyrics, the scripture readings, the titles and the text slides", () => {
    expect(overlaySlide({ mode: "show", slide: LYRICS })).toBe(LYRICS);
    const title: ProjectionSlide = { kind: "title", title: "Lorem", copyright: "© 2010" };
    expect(overlaySlide({ mode: "show", slide: title })).toBe(title);
    const scripture: ProjectionSlide = {
      kind: "scripture",
      verses: [{ label: "16", text: "Lorem" }],
      reference: "Jn 3,16",
    };
    expect(overlaySlide({ mode: "show", slide: scripture })).toBe(scripture);
    // The roll is for the room: the overlay shows the page.
    const roll = {
      ids: ["3:16"],
      before: [{ id: "3:15", label: "15", text: "Ipsum" }],
      after: [],
      textSize: 80,
    };
    expect(overlaySlide({ mode: "show", slide: { ...scripture, roll } })).toEqual(scripture);
    const text: ProjectionSlide = { kind: "text", paragraphs: [["Lorem"]], highlight: [["Ipsum"]] };
    expect(overlaySlide({ mode: "show", slide: text })).toBe(text);
  });

  it("shows the title of a text item, which the screens do not show", () => {
    expect(overlaySlide({ mode: "show", slide: { kind: "blank", caption: "Prayer" } })).toEqual({
      kind: "text",
      paragraphs: [["Prayer"]],
      highlight: [],
    });
    expect(overlaySlide({ mode: "clear", slide: { kind: "blank", caption: "Prayer" } })).toBeNull();
  });

  it("shows the part of the lyrics, and the screens keep the whole slide", () => {
    const slide: ProjectionSlide = { kind: "lyrics", paragraphs: [["a", "b", "c"]] };
    expect(overlaySlide({ mode: "show", slide, stream: ["c"] })).toEqual({
      kind: "lyrics",
      paragraphs: [["c"]],
    });
    expect(overlaySlide({ mode: "clear", slide, stream: ["c"] })).toBeNull();
    // Only for lyrics: a part with another slide is from a bad message.
    const title: ProjectionSlide = { kind: "title", title: "Lorem", copyright: null };
    expect(overlaySlide({ mode: "show", slide: title, stream: ["c"] })).toBe(title);
  });

  it("shows nothing in the modes black and clear", () => {
    expect(overlaySlide({ mode: "black", slide: LYRICS })).toBeNull();
    expect(overlaySlide({ mode: "clear", slide: LYRICS })).toBeNull();
  });

  it("shows no slide of the room", () => {
    const slides: ProjectionSlide[] = [
      { kind: "blank" },
      { kind: "qr", text: "https://example.test", caption: null },
      { kind: "announcement", title: "Lorem", when: null, details: [] },
      { kind: "announcements", heading: "Lorem", range: "", entries: [] },
      { kind: "image", url: "/x.webp", width: 10, height: 10, adjust: DEFAULT_IMAGE_ADJUST },
    ];
    for (const slide of slides) expect(overlaySlide({ mode: "show", slide })).toBeNull();
  });
});

describe("streamParts", () => {
  it("splits the lines of a paragraph in parts of 2", () => {
    expect(streamParts({ kind: "lyrics", paragraphs: [["a", "b", "c", "d", "e"]] }, 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(streamParts({ kind: "lyrics", paragraphs: [["a", "b", "c", "d", "e"]] }, 3)).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("never puts the lines of two paragraphs in one part", () => {
    expect(
      streamParts(
        {
          kind: "lyrics",
          paragraphs: [
            ["a", "b", "c"],
            ["d", "e"],
          ],
        },
        2,
      ),
    ).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });

  it("gives no parts for lyrics without lines and for other slides", () => {
    expect(streamParts({ kind: "lyrics", paragraphs: [] }, 2)).toBeNull();
    expect(streamParts({ kind: "lyrics", paragraphs: [["a"]] }, 0)).toBeNull();
    expect(streamParts({ kind: "title", title: "Lorem", copyright: null }, 2)).toBeNull();
    expect(
      streamParts({ kind: "text", paragraphs: [["a", "b", "c"]], highlight: [] }, 2),
    ).toBeNull();
    expect(
      streamParts(
        { kind: "scripture", verses: [{ label: "16", text: "Lorem" }], reference: "Jn 3,16" },
        2,
      ),
    ).toBeNull();
  });
});

describe("streamPartIndex", () => {
  const parts = [["a", "b"], ["c", "d"], ["a", "b"], ["e"]];

  it("finds the part by its lines, also with another index from the state", () => {
    expect(streamPartIndex(parts, ["c", "d"], 1)).toBe(1);
    expect(streamPartIndex(parts, ["e"], 1)).toBe(3);
    expect(streamPartIndex(parts, ["e"], undefined)).toBe(3);
  });

  it("chooses by the index from the state between the same lines", () => {
    expect(streamPartIndex(parts, ["a", "b"], 2)).toBe(2);
    expect(streamPartIndex(parts, ["a", "b"], 1)).toBe(0);
  });

  it("keeps the index from the state in the range without such lines", () => {
    expect(streamPartIndex(parts, ["x"], 1)).toBe(1);
    expect(streamPartIndex(parts, ["x"], 9)).toBe(3);
    expect(streamPartIndex(parts, ["c"], undefined)).toBe(0);
  });
});

describe("overlayLook", () => {
  it("keeps the font and the transition, with white text at the bottom and no background", () => {
    const look = overlayLook({
      ...FALLBACK_LOOK,
      font: "merriweather",
      textColor: "#000000",
      verticalAlign: "top",
      referenceSize: 500,
      background: {
        color: "#123456",
        image: "/munkater/vetites/fajl/hatter/a/b.webp",
        video: "/munkater/vetites/fajl/video/a/b.mp4",
        dim: 40,
      },
      transition: { kind: "cut", ms: 0, rollMs: 900 },
    });
    expect(look.font).toBe("merriweather");
    expect(look.transition).toEqual({ kind: "cut", ms: 0, rollMs: 900 });
    expect(look.textColor).toBe("#ffffff");
    expect(look.verticalAlign).toBe("bottom");
    expect(look.textShadow).toBe("strong");
    expect(look.background.image).toBeNull();
    expect(look.background.video).toBeNull();
    expect(look.textSize).toBe(TEXT_SIZE_MIN);
    expect(look.referenceSize).toBe(100);
  });
});
