import { describe, expect, it } from "vitest";

import {
  narrowestAspectRatio,
  newerProjectionState,
  nextSeq,
  parseOverlayInfo,
  parseProjectionCommand,
  parseProjectionState,
  parseScreenInfo,
  projectionChannelName,
  screenAspectRatio,
  type ProjectionState,
} from "./protocol";
import { FALLBACK_LOOK } from "./themes";

const STATE: ProjectionState = {
  seq: 5,
  mode: "show",
  slide: { kind: "lyrics", paragraphs: [["Lorem", "ipsum"]] },
  position: { itemKey: "a", tileId: "0.0" },
  look: FALLBACK_LOOK,
  preload: null,
  preloadImage: null,
};

const BACKGROUND =
  "/munkater/vetites/fajl/hatter/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";

describe("parseProjectionState", () => {
  it("accepts a valid state", () => {
    expect(parseProjectionState(STATE)).toEqual(STATE);
    expect(
      parseProjectionState({ ...STATE, slide: { kind: "blank" }, position: { end: true } }),
    ).not.toBeNull();
    const captioned = { ...STATE, slide: { kind: "blank", caption: "Prayer" } };
    expect(parseProjectionState(captioned)).toEqual(captioned);
    expect(parseProjectionState({ ...STATE, mode: "black", position: null })).not.toBeNull();
  });

  it("accepts the part of the lyrics for the stream overlay, and drops a bad one", () => {
    const parted = {
      ...STATE,
      position: { itemKey: "a", tileId: "0.0", streamPart: 1 },
      stream: ["ipsum"],
    };
    expect(parseProjectionState(parted)).toEqual(parted);
    const bad = parseProjectionState({
      ...STATE,
      position: { itemKey: "a", tileId: "0.0", streamPart: -1 },
      stream: Array(11).fill("a"),
    });
    expect(bad?.stream).toBeUndefined();
    expect(bad?.position).toEqual({ itemKey: "a", tileId: "0.0" });
    expect(parseProjectionState({ ...STATE, stream: [] })?.stream).toBeUndefined();
  });

  it("accepts the lines of the parts of the lyrics, and drops a bad number", () => {
    expect(parseProjectionState({ ...STATE, streamLines: 2 })?.streamLines).toBe(2);
    expect(parseProjectionState({ ...STATE, streamLines: 0 })?.streamLines).toBeUndefined();
    expect(parseProjectionState({ ...STATE, streamLines: 1.5 })).not.toBeNull();
    expect(parseProjectionState({ ...STATE, streamLines: 1.5 })?.streamLines).toBeUndefined();
  });

  it("accepts the verses of a scripture reading and refuses too many", () => {
    const slide = {
      kind: "scripture",
      verses: [{ label: "16", text: "Lorem ipsum" }],
      reference: "Jn 3,16 (Károli)",
    };
    expect(parseProjectionState({ ...STATE, slide })).toEqual({ ...STATE, slide });
    const verses = Array.from({ length: 201 }, () => ({ label: "1", text: "a" }));
    expect(parseProjectionState({ ...STATE, slide: { ...slide, verses } })).toBeNull();
    expect(
      parseProjectionState({ ...STATE, slide: { ...slide, reference: undefined } }),
    ).toBeNull();
  });

  it("accepts the roll view of the verses, and shows the page for a bad roll", () => {
    const roll = {
      ids: ["3:16"],
      before: [{ id: "3:15", label: "15", text: "Lorem" }],
      after: [],
      textSize: 70,
    };
    const slide = {
      kind: "scripture",
      verses: [{ label: "16", text: "Lorem ipsum" }],
      reference: "Jn 3,16 (Károli)",
      roll,
    };
    expect(parseProjectionState({ ...STATE, slide, scriptureRoll: 70 })).toEqual({
      ...STATE,
      slide,
      scriptureRoll: 70,
    });
    // A text size that the screen does not know: the default one.
    expect(
      parseProjectionState({ ...STATE, slide: { ...slide, roll: { ...roll, textSize: 500 } } })
        ?.slide,
    ).toEqual({
      ...slide,
      roll: { ...roll, textSize: 80 },
    });
    const before = Array.from({ length: 4 }, (_, index) => ({
      id: `3:${index + 1}`,
      label: `${index + 1}`,
      text: "a",
    }));
    const page = parseProjectionState({
      ...STATE,
      slide: { ...slide, roll: { ...roll, before } },
      scriptureRoll: 500,
    });
    expect(page?.slide).toEqual({
      kind: "scripture",
      verses: slide.verses,
      reference: slide.reference,
    });
    expect(page?.scriptureRoll).toBeUndefined();
  });

  it("accepts a text slide and refuses one without its highlighted text", () => {
    const slide = {
      kind: "text",
      paragraphs: [["We pray for", "the sick"]],
      highlight: [["Our families"]],
    };
    expect(parseProjectionState({ ...STATE, slide })).toEqual({ ...STATE, slide });
    expect(
      parseProjectionState({ ...STATE, slide: { ...slide, highlight: undefined } }),
    ).toBeNull();
    expect(
      parseProjectionState({ ...STATE, slide: { ...slide, highlight: [["a".repeat(1001)]] } }),
    ).toBeNull();
  });

  it("accepts the longest texts of the database, also with emoji", () => {
    const title = "🎵".repeat(200);
    expect(
      parseProjectionState({
        ...STATE,
        slide: { kind: "title", title, copyright: "©".repeat(500) },
      }),
    ).not.toBeNull();
    expect(
      parseProjectionState({
        ...STATE,
        slide: { kind: "lyrics", paragraphs: [["a".repeat(5000)]] },
      }),
    ).not.toBeNull();
  });

  it("gives the look from before the themes to a state without one, from an older controller", () => {
    const old = { seq: STATE.seq, mode: STATE.mode, slide: STATE.slide, position: STATE.position };
    expect(parseProjectionState(old)).toEqual(STATE);
  });

  it("accepts an image of an event and refuses an image of another site", () => {
    const url =
      "/munkater/esemenyek/fajl/kep/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";
    const slide = {
      kind: "image",
      url,
      width: 1920,
      height: 1080,
      adjust: {
        fit: "cover",
        scale: 120,
        x: -10,
        y: 5,
        rotation: 90,
        background: "theme",
        backgroundColor: "#000000",
      },
    };
    expect(parseProjectionState({ ...STATE, slide, preloadImage: url })).toEqual({
      ...STATE,
      slide,
      preloadImage: url,
    });
    expect(
      parseProjectionState({ ...STATE, slide: { ...slide, url: "https://example.com/a.webp" } }),
    ).toBeNull();
    expect(
      parseProjectionState({
        ...STATE,
        slide: { ...slide, adjust: { ...slide.adjust, rotation: 45 } },
      }),
    ).toBeNull();
    // The tile of an image is the id of the image.
    const position = { itemKey: "a", tileId: "00000000-0000-0000-0000-000000000002" };
    expect(parseProjectionState({ ...STATE, slide, position })?.position).toEqual(position);
  });

  it("accepts an image with a QR code, and keeps the image without a bad QR code", () => {
    const slide = {
      kind: "image",
      url: "/munkater/esemenyek/fajl/kep/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp",
      width: 1920,
      height: 1080,
      adjust: {
        fit: "contain",
        scale: 100,
        x: 0,
        y: 0,
        rotation: 0,
        background: "color",
        backgroundColor: "#000000",
      },
      qr: { text: "https://example.com", caption: "Register", side: "end" },
    };
    expect(parseProjectionState({ ...STATE, slide })?.slide).toEqual(slide);
    const bad = parseProjectionState({
      ...STATE,
      slide: { ...slide, qr: { text: "", caption: null, side: "left" } },
    });
    expect(bad?.slide).toEqual({ ...slide, qr: undefined });
  });

  it("accepts the slides of announcements and refuses an empty QR code", () => {
    const list = {
      kind: "announcements",
      heading: "Next week",
      range: "Oct 25 – Nov 1",
      entries: [{ when: "Wed", title: "Prayer", details: ["Hall"], accent: true }],
    };
    expect(parseProjectionState({ ...STATE, slide: list })?.slide).toEqual(list);
    const own = {
      kind: "announcement",
      title: "Camp",
      when: null,
      details: ["Bring a sleeping bag."],
    };
    expect(parseProjectionState({ ...STATE, slide: own })?.slide).toEqual(own);
    expect(
      parseProjectionState({
        ...STATE,
        slide: { kind: "qr", text: "https://example.com", caption: null },
      }),
    ).not.toBeNull();
    expect(
      parseProjectionState({ ...STATE, slide: { kind: "qr", text: "", caption: null } }),
    ).toBeNull();
  });

  it("accepts a look with a background image of this site and refuses another one", () => {
    const look = {
      ...FALLBACK_LOOK,
      background: { color: "#102030", image: BACKGROUND, video: null, dim: 40 },
    };
    expect(parseProjectionState({ ...STATE, look, preload: BACKGROUND })).toEqual({
      ...STATE,
      look,
      preload: BACKGROUND,
    });
    const foreign = {
      ...look,
      background: { ...look.background, image: "https://example.com/a.webp" },
    };
    expect(parseProjectionState({ ...STATE, look: foreign })).toBeNull();
  });

  it("keeps the slide but not a preload with a URL of another kind, e.g. from a newer controller", () => {
    const image =
      "/munkater/esemenyek/fajl/kep/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";
    expect(parseProjectionState({ ...STATE, preload: image })).toEqual(STATE);
    expect(parseProjectionState({ ...STATE, preload: "/song-images/a.webp" })).toEqual(STATE);
    expect(parseProjectionState({ ...STATE, preloadImage: BACKGROUND })).toEqual(STATE);
  });

  it("shows a font that the app does not have in Inter, and refuses a bad color", () => {
    expect(
      parseProjectionState({ ...STATE, look: { ...FALLBACK_LOOK, font: "comic-sans" } })?.look.font,
    ).toBe("inter");
    expect(
      parseProjectionState({ ...STATE, look: { ...FALLBACK_LOOK, textColor: "red" } }),
    ).toBeNull();
  });

  it("gives the reference the size from before for a look of an older controller", () => {
    const older: Record<string, unknown> = { ...FALLBACK_LOOK };
    delete older.referenceSize;
    expect(parseProjectionState({ ...STATE, look: older })?.look.referenceSize).toBe(100);
    expect(
      parseProjectionState({ ...STATE, look: { ...FALLBACK_LOOK, referenceSize: 200 } })?.look
        .referenceSize,
    ).toBe(200);
  });

  it("accepts a background video of this site, and shows only the poster for another one or for an older controller", () => {
    const video =
      "/munkater/vetites/fajl/video/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.mp4";
    const look = {
      ...FALLBACK_LOOK,
      background: { color: "#102030", image: BACKGROUND, video, dim: 40 },
    };
    expect(parseProjectionState({ ...STATE, look })?.look.background.video).toBe(video);
    const foreign = {
      ...look,
      background: { ...look.background, video: "https://example.com/a.mp4" },
    };
    expect(parseProjectionState({ ...STATE, look: foreign })?.look.background).toEqual({
      ...look.background,
      video: null,
    });
    const older = { ...look, background: { color: "#102030", image: BACKGROUND, dim: 40 } };
    expect(parseProjectionState({ ...STATE, look: older })?.look.background.video).toBeNull();
  });

  it("gives the roll the time from before for a look of an older controller", () => {
    const older = { ...FALLBACK_LOOK, transition: { kind: "cut", ms: 0 } };
    expect(parseProjectionState({ ...STATE, look: older })?.look.transition).toEqual({
      kind: "cut",
      ms: 0,
      rollMs: 600,
    });
    const look = { ...FALLBACK_LOOK, transition: { kind: "fade", ms: 150, rollMs: 1500 } };
    expect(parseProjectionState({ ...STATE, look })?.look.transition.rollMs).toBe(1500);
  });

  it("refuses a state from an unknown or bad browser", () => {
    expect(parseProjectionState({ ...STATE, mode: "flash" })).toBeNull();
    expect(parseProjectionState({ ...STATE, slide: { kind: "video" } })).toBeNull();
    expect(parseProjectionState({ ...STATE, seq: -1 })).toBeNull();
    expect(parseProjectionState(null)).toBeNull();
  });
});

describe("parseScreenInfo", () => {
  it("accepts a screen and refuses a bad aspect ratio", () => {
    expect(parseScreenInfo({ id: "x", aspectRatio: 16 / 9 })).toEqual({
      id: "x",
      aspectRatio: 16 / 9,
    });
    expect(parseScreenInfo({ id: "x", aspectRatio: 0 })).toBeNull();
    expect(parseScreenInfo({ id: "", aspectRatio: 1 })).toBeNull();
  });

  it("accepts the aspect ratio of a very wide or tall window", () => {
    expect(screenAspectRatio(1600, 900)).toBe(16 / 9);
    expect(parseScreenInfo({ id: "x", aspectRatio: screenAspectRatio(4800, 900) })).not.toBeNull();
    expect(parseScreenInfo({ id: "x", aspectRatio: screenAspectRatio(100, 900) })).not.toBeNull();
    expect(parseScreenInfo({ id: "x", aspectRatio: screenAspectRatio(1600, 0) })).not.toBeNull();
  });
});

describe("parseProjectionCommand", () => {
  it("accepts a command and refuses an unknown one", () => {
    expect(parseProjectionCommand({ command: "next", baseSeq: 5 })).toEqual({
      command: "next",
      baseSeq: 5,
    });
    expect(parseProjectionCommand({ command: "black", baseSeq: null })).not.toBeNull();
    expect(parseProjectionCommand({ command: "reload", baseSeq: 5 })).toBeNull();
    expect(parseProjectionCommand({ command: "next" })).toBeNull();
    expect(parseProjectionCommand({ command: "next", baseSeq: -1 })).toBeNull();
  });
});

describe("states", () => {
  it("keeps the newer state, and ignores the same state twice", () => {
    const newer = { ...STATE, seq: 6 };
    expect(newerProjectionState(STATE, newer)).toBe(newer);
    expect(newerProjectionState(newer, STATE)).toBe(newer);
    expect(newerProjectionState(STATE, { ...STATE })).toBe(STATE);
    expect(newerProjectionState(null, STATE)).toBe(STATE);
  });

  it("numbers the next state after the current one, also with a slow clock", () => {
    expect(nextSeq(null, 1000.4)).toBe(1000);
    expect(nextSeq(STATE, 1000)).toBe(1000);
    expect(nextSeq({ ...STATE, seq: 2000 }, 1000)).toBe(2001);
  });
});

describe("screens", () => {
  it("uses the narrowest screen", () => {
    expect(narrowestAspectRatio([])).toBeNull();
    expect(
      narrowestAspectRatio([
        { id: "a", aspectRatio: 16 / 9 },
        { id: "b", aspectRatio: 4 / 3 },
      ]),
    ).toBe(4 / 3);
  });

  it("names one channel per event, and one for the rehearsal", () => {
    expect(projectionChannelName("e1")).toBe("projection:event:e1");
    expect(projectionChannelName(null)).toBe("projection:rehearsal");
  });
});

describe("parseOverlayInfo", () => {
  it("accepts an overlay with an id", () => {
    expect(parseOverlayInfo({ id: "a1" })).toEqual({ id: "a1" });
  });

  it("refuses a message without a valid id", () => {
    expect(parseOverlayInfo({})).toBeNull();
    expect(parseOverlayInfo({ id: "" })).toBeNull();
    expect(parseOverlayInfo({ id: "x".repeat(101) })).toBeNull();
    expect(parseOverlayInfo(null)).toBeNull();
  });
});
