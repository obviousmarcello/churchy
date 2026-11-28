import { describe, expect, it } from "vitest";

import { isRichTextEmpty, normalizeRichText, richTextLength } from "./rich-text";

const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });

describe("normalizeRichText", () => {
  it("keeps the permitted nodes and marks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Cables")] },
        paragraph(
          text("Plug in "),
          text("the SDI", [{ type: "bold" }, { type: "italic" }]),
          { type: "hardBreak" },
          text("cable."),
        ),
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("One"))] }] },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [paragraph(text("Three"))] }],
        },
        { type: "blockquote", content: [paragraph(text("Quote"))] },
      ],
    };
    expect(normalizeRichText(doc)).toEqual(doc);
  });

  it("drops unknown attributes and makes the links safe", () => {
    const result = normalizeRichText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            text("site", [
              { type: "link", attrs: { href: "example.com/a", target: "_blank", class: "x" } },
            ]),
            text("bad", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
          ],
        },
        { type: "heading", attrs: { level: 1 }, content: [text("Big")] },
      ],
    });
    expect(result).toEqual({
      type: "doc",
      content: [
        paragraph(
          text("site", [{ type: "link", attrs: { href: "https://example.com/a" } }]),
          text("bad"),
        ),
        { type: "heading", attrs: { level: 2 }, content: [text("Big")] },
      ],
    });
  });

  it("refuses other nodes, marks and shapes", () => {
    expect(normalizeRichText(null)).toBeNull();
    expect(normalizeRichText({ type: "paragraph" })).toBeNull();
    expect(
      normalizeRichText({ type: "doc", content: [{ type: "image", attrs: { src: "x" } }] }),
    ).toBeNull();
    expect(
      normalizeRichText({ type: "doc", content: [paragraph({ type: "html", text: "<script>" })] }),
    ).toBeNull();
    expect(
      normalizeRichText({ type: "doc", content: [paragraph(text("x", [{ type: "code" }]))] }),
    ).toBeNull();
    expect(normalizeRichText({ type: "doc", content: "text" })).toBeNull();
  });

  it("refuses a very deep nesting", () => {
    let block: unknown = paragraph(text("deep"));
    for (let i = 0; i < 20; i++) block = { type: "blockquote", content: [block] };
    expect(normalizeRichText({ type: "doc", content: [block] })).toBeNull();
  });

  it("makes an empty text the same as no text", () => {
    expect(normalizeRichText({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({
      type: "doc",
      content: [],
    });
    expect(
      normalizeRichText({ type: "doc", content: [paragraph(text("a")), { type: "paragraph" }] }),
    ).toEqual({
      type: "doc",
      content: [paragraph(text("a"))],
    });
  });
});

describe("richTextLength", () => {
  it("counts the characters of the text", () => {
    const doc = normalizeRichText({
      type: "doc",
      content: [
        paragraph(text("abc")),
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("de"))] }] },
      ],
    })!;
    expect(richTextLength(doc)).toBe(5);
    expect(isRichTextEmpty(doc)).toBe(false);
    expect(isRichTextEmpty({ type: "doc", content: [] })).toBe(true);
  });
});
