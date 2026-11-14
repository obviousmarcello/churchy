import { Fragment, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * Allow-list renderer for Tiptap/ProseMirror JSON (`RichText` of `@churchy/contracts`, SDD §7.5).
 * User content is never rendered as HTML: every node and mark type is mapped to a React element
 * explicitly, attributes are copied only when they are on the allow-list, and anything unknown is
 * dropped (unknown nodes with their content, unknown marks leave plain text). Links and images
 * accept only safe URL schemes, so `javascript:`/`data:` URLs can never reach the page.
 *
 * Supported: paragraph, heading (h2–h4; the page title is the h1), text with bold/italic/link
 * marks, hard break, bullet and ordered lists, blockquote, horizontal rule and image. Page blocks
 * (D-16) extend this renderer.
 */

interface Mark {
  type?: unknown;
  attrs?: unknown;
}

interface Node {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
}

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function attrsOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * A link target that is safe to render: `http(s):`, `mailto:`, `tel:`, a site-relative path
 * (`/…`, not `//…`) or a fragment (`#…`). Anything else (incl. `javascript:`) is `null`.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  // Control characters and whitespace inside a URL are a classic scheme-smuggling trick.
  // eslint-disable-next-line no-control-regex
  if (href === "" || /[\u0000- \u007f]/.test(href)) return null;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) return href.startsWith("//") || href.startsWith("/\\") ? null : href;
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

/** An image source that is safe to render: `https:` or a site-relative path. */
export function safeImageSrc(value: unknown): string | null {
  const href = safeHref(value);
  if (href === null || href.startsWith("#")) return null;
  if (href.startsWith("/")) return href;
  return href.startsWith("https:") ? href : null;
}

function isExternal(href: string): boolean {
  return /^https?:/i.test(href);
}

const LINK_CLASS =
  "font-semibold text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

function renderText(node: Node, key: number): ReactNode {
  if (typeof node.text !== "string" || node.text === "") return null;
  let out: ReactNode = node.text;
  const marks = Array.isArray(node.marks) ? (node.marks as Mark[]) : [];
  // Links wrap outermost so bold/italic stay inside the anchor.
  let href: string | null = null;
  for (const mark of marks) {
    if (mark?.type === "bold") out = <strong>{out}</strong>;
    else if (mark?.type === "italic") out = <em>{out}</em>;
    else if (mark?.type === "link") href = safeHref(attrsOf(mark.attrs).href);
  }
  if (href !== null) {
    out = isExternal(href) ? (
      <a href={href} rel="noopener noreferrer nofollow" className={LINK_CLASS}>
        {out}
      </a>
    ) : (
      <a href={href} className={LINK_CLASS}>
        {out}
      </a>
    );
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function children(node: Node): ReactNode[] {
  if (!Array.isArray(node.content)) return [];
  return (node.content as Node[]).map((child, i) => renderNode(child, i));
}

function headingLevel(value: unknown): 2 | 3 | 4 {
  const n = typeof value === "number" ? value : 2;
  return n <= 2 ? 2 : n === 3 ? 3 : 4;
}

const HEADING_CLASS: Record<2 | 3 | 4, string> = {
  2: "font-heading text-fs-5 font-bold",
  3: "font-heading text-fs-4 font-bold",
  4: "text-fs-4 font-bold",
};

function renderNode(node: Node | null | undefined, key: number): ReactNode {
  if (node === null || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{children(node)}</p>;
    case "heading": {
      const level = headingLevel(attrsOf(node.attrs).level);
      const Tag = `h${level}` as const;
      return (
        <Tag key={key} className={HEADING_CLASS[level]}>
          {children(node)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="flex list-disc flex-col gap-1 pl-6">
          {children(node)}
        </ul>
      );
    case "orderedList": {
      const start = attrsOf(node.attrs).start;
      return (
        <ol
          key={key}
          className="flex list-decimal flex-col gap-1 pl-6"
          {...(typeof start === "number" && Number.isInteger(start) && start !== 1
            ? { start }
            : {})}
        >
          {children(node)}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children(node)}</li>;
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="flex flex-col gap-3 border-l-4 border-accent pl-4 text-muted italic"
        >
          {children(node)}
        </blockquote>
      );
    case "horizontalRule":
      return <hr key={key} className="border-border" />;
    case "image": {
      const attrs = attrsOf(node.attrs);
      const src = safeImageSrc(attrs.src);
      if (src === null) return null;
      const alt = typeof attrs.alt === "string" ? attrs.alt : "";
      const width = typeof attrs.width === "number" && attrs.width > 0 ? attrs.width : undefined;
      const height =
        typeof attrs.height === "number" && attrs.height > 0 ? attrs.height : undefined;
      return (
        <img
          key={key}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          className="h-auto max-w-full rounded-md"
        />
      );
    }
    default:
      // Unknown node types (incl. raw HTML nodes) are dropped with their content.
      return null;
  }
}

export interface RichTextContentProps {
  /** A Tiptap JSON document (`{ type: "doc", content: [...] }`); anything else renders nothing. */
  doc: unknown;
  className?: string;
}

/** Renders a rich-text document through the allow-list (see module comment). */
export function RichTextContent({ doc, className }: RichTextContentProps) {
  const root = doc as Node | null;
  if (root === null || typeof root !== "object" || root.type !== "doc") return null;
  return (
    <div className={cn("flex flex-col gap-4 text-fs-4", className)} data-rich-text="">
      {children(root)}
    </div>
  );
}
