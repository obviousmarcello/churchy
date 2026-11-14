/**
 * Plain text from Tiptap/ProseMirror JSON (`RichText` of `@churchy/contracts`), for `.ics`
 * descriptions, meta descriptions and structured data. Only text nodes are read; marks, attributes
 * and unknown nodes never produce markup, so the result is safe anywhere.
 */

interface Node {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock"]);

function inlineText(node: Node): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  return Array.isArray(node.content) ? (node.content as Node[]).map(inlineText).join("") : "";
}

function collect(node: Node, out: string[], bullet: string): void {
  if (typeof node.type === "string" && BLOCKS.has(node.type)) {
    const text = inlineText(node).trim();
    if (text !== "") out.push(bullet + text);
    return;
  }
  if (!Array.isArray(node.content)) return;
  const listItem = node.type === "listItem";
  (node.content as Node[]).forEach((child, i) =>
    // A list item's first block carries the bullet.
    collect(child, out, listItem && i === 0 ? "– " : bullet),
  );
}

/** The document's paragraphs (and list items, prefixed with „– ”) as plain strings. */
export function richTextParagraphs(doc: unknown): string[] {
  if (doc === null || typeof doc !== "object") return [];
  const out: string[] = [];
  collect(doc as Node, out, "");
  return out;
}

/** The whole document as plain text, paragraphs separated by a blank line. */
export function richTextPlain(doc: unknown): string {
  return richTextParagraphs(doc).join("\n\n");
}
