import { toLinkUrl } from "./links";

// The formatted text of a lesson of a training course: Tiptap JSON (see
// `src/app/[lang]/courses/rich-text-editor.tsx`). The database keeps only the
// nodes and marks below, never HTML. The page shows the text with its own
// renderer (`src/components/rich-text-view.tsx`), so a lesson cannot add a
// script or a style to the page.

export type RichMark =
  { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };

export type RichListItem = { type: "listItem"; content: RichBlock[] };

export type RichBlock =
  | { type: "paragraph"; content?: RichInline[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: RichInline[] }
  | { type: "bulletList"; content: RichListItem[] }
  | { type: "orderedList"; attrs: { start: number }; content: RichListItem[] }
  | { type: "blockquote"; content: RichBlock[] };

export type RichDoc = { type: "doc"; content: RichBlock[] };

export const EMPTY_RICH_TEXT: RichDoc = { type: "doc", content: [] };

/** The most characters of text in a lesson. */
export const RICH_TEXT_MAX_LENGTH = 50_000;

/** The most nodes in a text, and the deepest nesting of blocks, e.g. lists in lists. */
const MAX_NODES = 20_000;
const MAX_DEPTH = 12;

type Budget = { nodes: number };

/**
 * The text with only the permitted nodes, marks and attributes, or null when
 * it has another node or is not a Tiptap document. A link to something other
 * than a web page loses its link mark. Empty paragraphs at the end go, so an
 * empty text is always `{ type: "doc", content: [] }`.
 */
export function normalizeRichText(value: unknown): RichDoc | null {
  if (!isObject(value) || value.type !== "doc") return null;
  const budget: Budget = { nodes: 0 };
  const content = blocks(value.content, 0, budget);
  if (!content) return null;

  while (content.length > 0 && isEmptyBlock(content[content.length - 1]!)) content.pop();
  return { type: "doc", content };
}

/** The number of characters of text, for `RICH_TEXT_MAX_LENGTH`. */
export function richTextLength(doc: RichDoc): number {
  let length = 0;
  const visit = (nodes: readonly (RichBlock | RichListItem | RichInline)[]) => {
    for (const node of nodes) {
      if (node.type === "text") length += node.text.length;
      else if ("content" in node && node.content) visit(node.content);
    }
  };
  visit(doc.content);
  return length;
}

/** True for a text without a character. */
export function isRichTextEmpty(doc: RichDoc): boolean {
  return richTextLength(doc) === 0;
}

function blocks(value: unknown, depth: number, budget: Budget): RichBlock[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || depth > MAX_DEPTH) return null;
  const result: RichBlock[] = [];
  for (const node of value) {
    const block = toBlock(node, depth, budget);
    if (!block) return null;
    result.push(block);
  }
  return result;
}

function toBlock(node: unknown, depth: number, budget: Budget): RichBlock | null {
  if (!isObject(node) || ++budget.nodes > MAX_NODES) return null;
  const attrs = isObject(node.attrs) ? node.attrs : {};

  switch (node.type) {
    case "paragraph": {
      const content = inlines(node.content, budget);
      if (!content) return null;
      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
    }
    case "heading": {
      const content = inlines(node.content, budget);
      if (!content) return null;
      const level = attrs.level === 3 ? 3 : 2;
      return content.length > 0
        ? { type: "heading", attrs: { level }, content }
        : { type: "heading", attrs: { level } };
    }
    case "bulletList":
    case "orderedList": {
      const items = listItems(node.content, depth + 1, budget);
      if (!items) return null;
      if (node.type === "bulletList") return { type: "bulletList", content: items };
      const start =
        Number.isInteger(attrs.start) && Number(attrs.start) >= 1 && Number(attrs.start) <= 10_000
          ? Number(attrs.start)
          : 1;
      return { type: "orderedList", attrs: { start }, content: items };
    }
    case "blockquote": {
      const content = blocks(node.content, depth + 1, budget);
      return content ? { type: "blockquote", content } : null;
    }
    default:
      return null;
  }
}

function listItems(value: unknown, depth: number, budget: Budget): RichListItem[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: RichListItem[] = [];
  for (const node of value) {
    if (!isObject(node) || node.type !== "listItem" || ++budget.nodes > MAX_NODES) return null;
    const content = blocks(node.content, depth + 1, budget);
    if (!content) return null;
    result.push({ type: "listItem", content });
  }
  return result;
}

function inlines(value: unknown, budget: Budget): RichInline[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: RichInline[] = [];
  for (const node of value) {
    if (!isObject(node) || ++budget.nodes > MAX_NODES) return null;
    if (node.type === "hardBreak") {
      result.push({ type: "hardBreak" });
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") return null;
    if (node.text === "") continue;
    const marks = toMarks(node.marks);
    if (!marks) return null;
    result.push(
      marks.length > 0
        ? { type: "text", text: node.text, marks }
        : { type: "text", text: node.text },
    );
  }
  return result;
}

function toMarks(value: unknown): RichMark[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: RichMark[] = [];
  for (const mark of value) {
    if (!isObject(mark)) return null;
    if (mark.type === "bold" || mark.type === "italic") {
      if (!result.some((other) => other.type === mark.type)) result.push({ type: mark.type });
    } else if (mark.type === "link") {
      const href =
        isObject(mark.attrs) && typeof mark.attrs.href === "string"
          ? toLinkUrl(mark.attrs.href)
          : null;
      if (href && !result.some((other) => other.type === "link"))
        result.push({ type: "link", attrs: { href } });
    } else {
      return null;
    }
  }
  return result;
}

function isEmptyBlock(block: RichBlock): boolean {
  return block.type === "paragraph" && (block.content?.length ?? 0) === 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
