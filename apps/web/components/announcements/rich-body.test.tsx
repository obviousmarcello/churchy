import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichBody } from "./rich-body";

const text = (value: string, marks?: string[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe("<RichBody> (allow-list renderer)", () => {
  it("renders paragraphs, headings, lists, marks and hard breaks", () => {
    const { container } = render(
      <RichBody
        doc={{
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [text("Alcím")] },
            { type: "heading", attrs: { level: 3 }, content: [text("Kisebb alcím")] },
            {
              type: "paragraph",
              content: [
                text("Félkövér", ["bold"]),
                { type: "hardBreak" },
                text("dőlt", ["italic"]),
              ],
            },
            {
              type: "bulletList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [text("A")] }] },
              ],
            },
            {
              type: "orderedList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [text("B")] }] },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Alcím");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Kisebb alcím");
    expect(container.querySelector("strong")).toHaveTextContent("Félkövér");
    expect(container.querySelector("em")).toHaveTextContent("dőlt");
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.querySelector("ul > li")).toHaveTextContent("A");
    expect(container.querySelector("ol > li")).toHaveTextContent("B");
  });

  it("never renders markup from content or unknown node types", () => {
    const { container } = render(
      <RichBody
        doc={{
          type: "doc",
          content: [
            { type: "paragraph", content: [text("<img src=x onerror=alert(1)>")] },
            { type: "html", html: "<script>alert(1)</script>" },
            { type: "blockquote", content: [{ type: "paragraph", content: [text("Idézet")] }] },
            { type: "paragraph", content: [{ type: "text", text: 42 }] },
          ],
        }}
      />,
    );
    expect(container.querySelector("img, script")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container).toHaveTextContent("Idézet");
    expect(container).not.toHaveTextContent("alert(1)</script>");
  });
});
