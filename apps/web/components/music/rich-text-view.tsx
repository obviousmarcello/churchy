import { Fragment } from "react";

import type { RichBlock, RichDoc, RichInline, RichListItem } from "@/lib/music/rich-text";
import { cn } from "@/lib/music/utils";

/** The look of a formatted text: the same in the view and in the editor. */
export const RICH_TEXT_CLASS = cn(
  "flex flex-col gap-3 text-base leading-relaxed break-words",
  "[&_h2]:mt-3 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-2 [&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li>p]:my-0",
  "[&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-muted",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
);

/**
 * A formatted text (see `src/lib/rich-text.ts`). It makes the elements
 * itself, from the permitted nodes only: no HTML from the database.
 */
export function RichTextView({ doc, className }: { doc: RichDoc; className?: string }) {
  return <div className={cn(RICH_TEXT_CLASS, className)}>{doc.content.map(renderBlock)}</div>;
}

function renderBlock(block: RichBlock, index: number): React.ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={index}>{block.content?.map(renderInline) ?? <br />}</p>;
    case "heading": {
      const Heading = block.attrs.level === 3 ? "h3" : "h2";
      return <Heading key={index}>{block.content?.map(renderInline)}</Heading>;
    }
    case "bulletList":
      return <ul key={index}>{block.content.map(renderItem)}</ul>;
    case "orderedList":
      return (
        <ol key={index} start={block.attrs.start}>
          {block.content.map(renderItem)}
        </ol>
      );
    case "blockquote":
      return <blockquote key={index}>{block.content.map(renderBlock)}</blockquote>;
  }
}

function renderItem(item: RichListItem, index: number): React.ReactNode {
  return <li key={index}>{item.content.map(renderBlock)}</li>;
}

function renderInline(node: RichInline, index: number): React.ReactNode {
  if (node.type === "hardBreak") return <br key={index} />;

  let content: React.ReactNode = node.text;
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "italic")) content = <em>{content}</em>;
  if (marks.some((mark) => mark.type === "bold")) content = <strong>{content}</strong>;
  const link = marks.find((mark) => mark.type === "link");
  // Links go to other websites in a new tab, as the links of the songs.
  if (link) {
    content = (
      <a href={link.attrs.href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Fragment key={index}>{content}</Fragment>;
}
