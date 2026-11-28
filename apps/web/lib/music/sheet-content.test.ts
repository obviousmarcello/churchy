import { describe, expect, it } from "vitest";

import { findScore, isInKey, sheetContent } from "./sheet-content";

const SCORE = "00000000-0000-4000-8000-000000000001";
const PDF_G = "00000000-0000-4000-8000-000000000002";
const PDF_ANY = "00000000-0000-4000-8000-000000000003";
const IMAGE_A = "00000000-0000-4000-8000-000000000004";
const IMAGE_EMPTY = "00000000-0000-4000-8000-000000000005";
const GONE = "00000000-0000-4000-8000-000000000009";

const scores = [{ id: SCORE, name: "Flute" }];
const pdfs = [
  { id: PDF_G, keys: ["G"] },
  { id: PDF_ANY, keys: [] },
];
const images = [
  { id: IMAGE_EMPTY, keys: ["A"], pages: [] },
  { id: IMAGE_A, keys: ["A"], pages: [{}] },
];

const base = {
  choice: undefined,
  scoreName: null,
  hasChords: true,
  scores,
  pdfs,
  images,
  shownKey: "G",
};

/** The kind and the id of what shows. */
function shown(options: Partial<Parameters<typeof sheetContent>[0]>) {
  const content = sheetContent({ ...base, ...options });
  if (content.kind === "chords") return "chords";
  if (content.kind === "score") return `score ${content.score.id}`;
  if (content.kind === "pdf") return `pdf ${content.pdf.id}`;
  return `image ${content.image.id}`;
}

describe("sheetContent", () => {
  it("shows the user's choice", () => {
    expect(shown({ choice: { kind: "chords" }, scoreName: "flute" })).toBe("chords");
    expect(shown({ choice: { kind: "score", id: SCORE } })).toBe(`score ${SCORE}`);
    expect(shown({ choice: { kind: "pdf", id: PDF_ANY } })).toBe(`pdf ${PDF_ANY}`);
    expect(shown({ choice: { kind: "image", id: IMAGE_A } })).toBe(`image ${IMAGE_A}`);
  });

  it("shows the chords for the choice of chords also without chords", () => {
    expect(shown({ choice: { kind: "chords" }, hasChords: false })).toBe("chords");
  });

  it("ignores a choice of a file that is gone, or of an image without pages", () => {
    expect(shown({ choice: { kind: "pdf", id: GONE } })).toBe("chords");
    expect(shown({ choice: { kind: "score", id: GONE }, scoreName: "Flute" })).toBe(
      `score ${SCORE}`,
    );
    expect(shown({ choice: { kind: "image", id: IMAGE_EMPTY }, hasChords: false })).toBe(
      `pdf ${PDF_G}`,
    );
  });

  it("shows the score of the device's score name, without case", () => {
    expect(shown({ scoreName: "FLUTE" })).toBe(`score ${SCORE}`);
    expect(shown({ scoreName: "Violin" })).toBe("chords");
  });

  it("shows the chords when the song has them", () => {
    expect(shown({})).toBe("chords");
  });

  it("without chords, shows the file in the shown key, then a file for any key, then the others", () => {
    expect(shown({ hasChords: false, shownKey: "G" })).toBe(`pdf ${PDF_G}`);
    expect(shown({ hasChords: false, shownKey: "A" })).toBe(`image ${IMAGE_A}`);
    expect(shown({ hasChords: false, shownKey: "D" })).toBe(`pdf ${PDF_ANY}`);
    expect(shown({ hasChords: false, shownKey: null })).toBe(`pdf ${PDF_ANY}`);
    expect(shown({ hasChords: false, pdfs: [] })).toBe(`image ${IMAGE_A}`);
  });

  it("without chords and files, shows the first score", () => {
    expect(shown({ hasChords: false, pdfs: [], images: [] })).toBe(`score ${SCORE}`);
  });

  it("shows the chords when the song has nothing else", () => {
    expect(shown({ hasChords: false, scores: [], pdfs: [], images: [] })).toBe("chords");
  });
});

describe("findScore", () => {
  it("finds the score by its name, without case", () => {
    expect(findScore(scores, "flute")?.id).toBe(SCORE);
    expect(findScore(scores, "Oboe")).toBeNull();
    expect(findScore(scores, null)).toBeNull();
  });
});

describe("isInKey", () => {
  it("is true only for a file that names the key", () => {
    expect(isInKey({ keys: ["G"] }, "G")).toBe(true);
    expect(isInKey({ keys: ["G"] }, "Gm")).toBe(false);
    expect(isInKey({ keys: [] }, "G")).toBe(false);
    expect(isInKey({ keys: ["G"] }, null)).toBe(false);
  });
});
