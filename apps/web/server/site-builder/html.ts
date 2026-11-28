import { parse } from "parse5";

/**
 * The only file that imports the HTML parser (parse5, a spec-compliant HTML5 parser without
 * dependencies; no DOM, no scripting, nothing is executed or fetched). It converts the parse5 tree
 * into a small plain tree so the extractor does not depend on parse5's types and a parser swap
 * stays local.
 */

export interface El {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly Node[];
}
export type Node = El | string;

/** Deeper nesting is dropped (a hostile page cannot overflow the recursive walkers). */
const MAX_DEPTH = 120;

interface P5 {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: P5[];
  content?: P5;
}

function convert(node: P5, depth: number): Node | null {
  if (node.nodeName === "#text") return node.value ?? "";
  if (!node.tagName) return null;
  if (depth > MAX_DEPTH) return null;
  const source = node.nodeName === "template" && node.content ? node.content : node;
  const children: Node[] = [];
  for (const child of source.childNodes ?? []) {
    const c = convert(child, depth + 1);
    if (c !== null) children.push(c);
  }
  const attrs: Record<string, string> = {};
  for (const a of node.attrs ?? []) attrs[a.name.toLowerCase()] = a.value;
  return { tag: node.tagName.toLowerCase(), attrs, children };
}

/** Parses a document; returns the `<html>` element. */
export function parseHtml(html: string): El {
  const doc = parse(html) as unknown as P5;
  for (const child of doc.childNodes ?? []) {
    const c = convert(child, 0);
    if (c && typeof c !== "string" && c.tag === "html") return c;
  }
  return { tag: "html", attrs: {}, children: [] };
}

export const isEl = (n: Node): n is El => typeof n !== "string";

/** Depth-first elements below `root` (not `root` itself); `skip` prunes a subtree. */
export function* elements(root: El, skip?: (e: El) => boolean): Generator<El> {
  for (const child of root.children) {
    if (!isEl(child)) continue;
    if (skip?.(child)) continue;
    yield child;
    yield* elements(child, skip);
  }
}

export function findFirst(root: El, pred: (e: El) => boolean): El | null {
  for (const e of elements(root)) if (pred(e)) return e;
  return null;
}

/** All text below an element, whitespace collapsed. `skip` prunes subtrees. */
export function textOf(root: El | Node, skip?: (e: El) => boolean): string {
  const parts: string[] = [];
  const visit = (n: Node) => {
    if (!isEl(n)) {
      parts.push(n);
      return;
    }
    if (skip?.(n)) return;
    if (n.tag === "br") parts.push(" ");
    for (const c of n.children) visit(c);
  };
  visit(root);
  return parts.join("").replace(/\s+/g, " ").trim();
}
