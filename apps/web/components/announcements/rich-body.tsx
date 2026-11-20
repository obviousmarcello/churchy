import type { ReactNode } from "react";
import type { RichText } from "@churchy/contracts";

/**
 * Allow-list renderer for the Tiptap JSON body of an announcement (CLAUDE.md: rich text is stored
 * as JSON and never rendered as raw HTML). Only paragraphs, headings, lists, hard breaks and the
 * bold / italic marks are rendered; any other node renders its children (or nothing), and text is
 * always a React text node, so user content can never inject markup.
 *
 * Scoped to the announcements page (D-14); the shared block renderer arrives with D-16.
 */

type Node = { type?: unknown; text?: unknown; content?: unknown; marks?: unknown; attrs?: unknown };

function children(node: Node, key: string): ReactNode[] {
  return Array.isArray(node.content)
    ? node.content.map((child, i) => renderNode(child as Node, `${key}.${i}`))
    : [];
}

function markTypes(node: Node): Set<string> {
  if (!Array.isArray(node.marks)) return new Set();
  return new Set(
    node.marks
      .map((m) => (m !== null && typeof m === "object" ? (m as { type?: unknown }).type : null))
      .filter((t): t is string => typeof t === "string"),
  );
}

function renderNode(node: Node, key: string): ReactNode {
  if (node === null || typeof node !== "object") return null;
  switch (node.type) {
    case "text": {
      if (typeof node.text !== "string") return null;
      const marks = markTypes(node);
      let out: ReactNode = node.text;
      if (marks.has("italic")) out = <em>{out}</em>;
      if (marks.has("bold")) out = <strong>{out}</strong>;
      return <span key={key}>{out}</span>;
    }
    case "paragraph":
      return (
        <p key={key} className="max-w-prose">
          {children(node, key)}
        </p>
      );
    case "heading": {
      const level = (node.attrs as { level?: unknown } | undefined)?.level;
      // The page heading is the h1; body headings start at h2.
      const Tag = level === 3 || level === 4 ? "h3" : "h2";
      return (
        <Tag key={key} className="font-heading text-fs-5 font-bold text-primary">
          {children(node, key)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="flex max-w-prose list-disc flex-col gap-2 ps-6">
          {children(node, key)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="flex max-w-prose list-decimal flex-col gap-2 ps-6">
          {children(node, key)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children(node, key)}</li>;
    case "hardBreak":
      return <br key={key} />;
    default:
      return Array.isArray(node.content) ? <span key={key}>{children(node, key)}</span> : null;
  }
}

export function RichBody({ doc, className }: { doc: RichText; className?: string }) {
  return (
    <div className={className} data-testid="announcement-body">
      {doc.content.map((node, i) => renderNode(node as Node, String(i)))}
    </div>
  );
}
