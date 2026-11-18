import { describe, expect, it } from "vitest";
import type { PageBlock } from "@churchy/contracts";
import {
  blocksFromText,
  bodyFromText,
  docFromText,
  instantFromLocalInput,
  localInputValue,
  publishState,
  textFromBlocks,
  textFromDoc,
  uniqueSlug,
} from "./content";

const now = new Date("2026-11-18T10:00:00Z");

describe("publishState", () => {
  it("tells draft, scheduled, published and expired apart", () => {
    expect(publishState({ status: "draft", publishedAt: null }, now)).toBe("draft");
    expect(publishState({ status: "published", publishedAt: "2026-11-20T10:00:00Z" }, now)).toBe(
      "scheduled",
    );
    expect(publishState({ status: "published", publishedAt: "2026-11-01T10:00:00Z" }, now)).toBe(
      "published",
    );
    expect(
      publishState(
        {
          status: "published",
          publishedAt: "2026-11-01T10:00:00Z",
          expiresAt: "2026-11-10T00:00:00Z",
        },
        now,
      ),
    ).toBe("expired");
  });
});

describe("plain text <-> rich text", () => {
  it("round-trips paragraphs and line breaks", () => {
    const text = "Első bekezdés\nmásodik sor\n\nMásodik bekezdés";
    // `richTextPlain` joins hard-broken lines with a newline inside the paragraph.
    expect(textFromDoc(docFromText(text))).toBe(text);
  });

  it("keeps the original document when the text did not change", () => {
    const original = {
      type: "doc" as const,
      content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Cím" }] }],
    };
    expect(bodyFromText(original, "Cím")).toBe(original);
    expect(bodyFromText(original, "Más")).not.toBe(original);
    expect(bodyFromText(original, "  ")).toBeNull();
  });
});

describe("page blocks as text", () => {
  const blocks: PageBlock[] = [
    { type: "heading", text: "Történetünk", level: 2 },
    { type: "text", content: docFromText("Régi templom.") },
    { type: "image", mediaId: "m1", caption: null },
  ];

  it("shows headings and text and keeps other blocks", () => {
    expect(textFromBlocks(blocks)).toBe("## Történetünk\n\nRégi templom.");
    expect(blocksFromText(blocks, textFromBlocks(blocks))).toEqual(blocks);
    const edited = blocksFromText(blocks, "## Új\n\nEgy\n\nKettő\n\n### Alcím\n\nHárom");
    expect(edited.map((b) => b.type)).toEqual(["heading", "text", "heading", "text", "image"]);
  });
});

describe("uniqueSlug", () => {
  it("strips diacritics and appends a counter on conflict", () => {
    expect(uniqueSlug("Őszi búcsú", [])).toBe("oszi-bucsu");
    expect(uniqueSlug("Őszi búcsú", ["oszi-bucsu", "oszi-bucsu-2"])).toBe("oszi-bucsu-3");
    expect(uniqueSlug("!!!", [])).toBe("tartalom");
  });
});

describe("datetime-local in Europe/Budapest", () => {
  it("converts both ways, summer and winter time", () => {
    expect(instantFromLocalInput("2026-11-22T18:30")).toBe("2026-11-22T17:30:00.000Z");
    expect(instantFromLocalInput("2026-07-01T18:30")).toBe("2026-07-01T16:30:00.000Z");
    expect(localInputValue("2026-11-22T17:30:00.000Z")).toBe("2026-11-22T18:30");
    expect(instantFromLocalInput("")).toBeNull();
    expect(localInputValue(null)).toBe("");
  });
});
