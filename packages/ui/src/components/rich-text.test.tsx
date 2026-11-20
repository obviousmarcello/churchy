import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextContent, safeHref, safeImageSrc } from "../index";

const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, marks });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });

function html(value: unknown): string {
  const { container } = render(<RichTextContent doc={value} />);
  return container.innerHTML;
}

describe("safeHref", () => {
  it.each([
    "https://example.org/a?b=1",
    "http://example.org",
    "mailto:iroda@example.org",
    "tel:+3612345678",
    "/hirek/adventi-lelkinap",
    "#reszletek",
  ])("allows %s", (href) => {
    expect(safeHref(href)).toBe(href);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "//evil.example",
    "/\\evil.example",
    "nem url",
    "",
    42,
    null,
    undefined,
  ])("rejects %s", (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it("images accept only https and site-relative sources", () => {
    expect(safeImageSrc("https://cdn.example.org/a.jpg")).toBe("https://cdn.example.org/a.jpg");
    expect(safeImageSrc("/media/a.jpg")).toBe("/media/a.jpg");
    expect(safeImageSrc("http://cdn.example.org/a.jpg")).toBeNull();
    expect(safeImageSrc("#a")).toBeNull();
    expect(safeImageSrc("mailto:a@example.org")).toBeNull();
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBeNull();
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
  });
});

describe("RichTextContent", () => {
  it("renders the allow-listed nodes and marks", () => {
    const { container } = render(
      <RichTextContent
        doc={doc(
          { type: "heading", attrs: { level: 2 }, content: [text("Cím")] },
          { type: "heading", attrs: { level: 3 }, content: [text("Alcím")] },
          { type: "heading", attrs: { level: 5 }, content: [text("Kisebb")] },
          { type: "heading", attrs: { level: 1 }, content: [text("Nem h1")] },
          { type: "heading", content: [text("Szint nélkül")] },
          p(
            text("Félkövér", [{ type: "bold" }]),
            text(" és "),
            text("dőlt", [{ type: "italic" }]),
            { type: "hardBreak" },
            text("hivatkozás", [{ type: "link", attrs: { href: "https://example.org" } }]),
            text(" és "),
            text("belső", [{ type: "bold" }, { type: "link", attrs: { href: "/hirek" } }]),
          ),
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [p(text("Első"))] }],
          },
          {
            type: "orderedList",
            attrs: { start: 3 },
            content: [{ type: "listItem", content: [p(text("Harmadik"))] }],
          },
          { type: "orderedList", attrs: { start: 1 }, content: [] },
          { type: "blockquote", content: [p(text("Idézet"))] },
          { type: "horizontalRule" },
          {
            type: "image",
            attrs: { src: "/media/kep.jpg", alt: "A templom", width: 800, height: 600 },
          },
          { type: "image", attrs: { src: "https://cdn.example.org/b.jpg" } },
        )}
        className="extra"
      />,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("extra");
    expect(root.querySelectorAll("h2")).toHaveLength(3);
    expect(root.querySelectorAll("h3")).toHaveLength(1);
    expect(root.querySelector("h4")).toHaveTextContent("Kisebb");
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelector("strong")).toHaveTextContent("Félkövér");
    expect(root.querySelector("em")).toHaveTextContent("dőlt");
    expect(root.querySelector("br")).not.toBeNull();
    const external = root.querySelector('a[href="https://example.org"]')!;
    expect(external).toHaveAttribute("rel", "noopener noreferrer nofollow");
    const internal = root.querySelector('a[href="/hirek"]')!;
    expect(internal).not.toHaveAttribute("rel");
    expect(internal.querySelector("strong")).toHaveTextContent("belső");
    expect(root.querySelector("ul li")).toHaveTextContent("Első");
    expect(root.querySelectorAll("ol")[0]).toHaveAttribute("start", "3");
    expect(root.querySelectorAll("ol")[1]).not.toHaveAttribute("start");
    expect(root.querySelector("blockquote")).toHaveTextContent("Idézet");
    expect(root.querySelector("hr")).not.toBeNull();
    const images = root.querySelectorAll("img");
    expect(images[0]).toHaveAttribute("alt", "A templom");
    expect(images[0]).toHaveAttribute("width", "800");
    // No alt attribute in the document: rendered as decorative.
    expect(images[1]).toHaveAttribute("alt", "");
  });

  it("drops unknown nodes, unknown marks and unsafe URLs", () => {
    const out = html(
      doc(
        { type: "html", content: [text("<script>alert(1)</script>")] },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "script", text: "alert(1)" },
        p(
          text("aláhúzott", [
            { type: "underline" },
            { type: "textStyle", attrs: { color: "red" } },
          ]),
          text(" rossz", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
          text(" adat", [{ type: "link", attrs: { href: "data:text/html,x" } }]),
          text(" üres", [{ type: "link" }]),
          { type: "mention", attrs: { id: "x" } },
          text(""),
          { type: "text", text: 5 },
          null,
        ),
        { type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
        { type: "paragraph", attrs: { onclick: "alert(1)", style: "x" }, content: "nem tömb" },
        "nem csomópont",
      ),
    );
    expect(out).not.toMatch(/script|iframe|javascript|data:|onclick|style=|<img|<a /);
    expect(out).toContain("aláhúzott");
    expect(out).toContain(" rossz");
    expect(out).toContain(" adat");
    expect(out).not.toContain("<u>");
  });

  it("renders nothing for a value that is not a document", () => {
    expect(html(null)).toBe("");
    expect(html("szöveg")).toBe("");
    expect(html({ type: "paragraph", content: [] })).toBe("");
  });

  it("renders text as text, never as markup", () => {
    const out = html(doc(p(text("<b>nem félkövér</b>"))));
    expect(out).toContain("&lt;b&gt;nem félkövér&lt;/b&gt;");
    expect(out).not.toContain("<b>");
  });
});
