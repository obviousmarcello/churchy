/** Tiny builders for ProseMirror/Tiptap JSON (`RichText` of @churchy/contracts). Never HTML. */
import type { RichText } from "@churchy/contracts";

type Node = { type: string; [key: string]: unknown };

const text = (value: string): Node => ({ type: "text", text: value });

/** `**bold**` segments become bold text marks; everything else stays plain. */
function inline(value: string): Node[] {
  const parts = value.split("**");
  const nodes: Node[] = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    nodes.push(i % 2 === 1 ? { ...text(part), marks: [{ type: "bold" }] } : text(part));
  });
  return nodes.length > 0 ? nodes : [text(value)];
}

export const p = (value: string): Node => ({ type: "paragraph", content: inline(value) });

export const h = (level: 2 | 3, value: string): Node => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});

export const ul = (items: string[]): Node => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});

export const ol = (items: string[]): Node => ({
  type: "orderedList",
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});

export const doc = (...content: Node[]): RichText => ({ type: "doc", content });

/** A document of plain paragraphs. */
export const paragraphs = (values: string[]): RichText => doc(...values.map(p));
