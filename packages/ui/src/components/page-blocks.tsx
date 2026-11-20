import type { ReactNode } from "react";
import { cn } from "../cn";
import { buttonClasses } from "./button";
import { embedSource } from "./embed";
import { EmbedFacade } from "./embed-facade";
import { RichTextContent, safeHref, safeImageSrc } from "./rich-text";

/**
 * Block renderer for static and rite pages (FR-007, D-16). Blocks are `PageBlock`s of
 * `@churchy/contracts` (heading, text, image, gallery, quote, embed, CTA, file), rendered through
 * the same allow-list approach as {@link RichTextContent}: every block type is mapped explicitly,
 * unknown block types and malformed blocks are dropped, links and image sources must pass
 * `safeHref` / `safeImageSrc`, and embeds must pass the provider allow-list (`embedSource`) and
 * load only after a click.
 *
 * Media are resolved by the caller (only public files it may show): a block whose image or file
 * is missing from `images` / `files` is dropped. All visible text arrives through props.
 */

export interface BlockImage {
  src: string;
  /** Alt text; empty for decorative images. */
  alt: string;
  width?: number | null;
  height?: number | null;
}

export interface BlockFile {
  href: string;
  filename: string;
  kilobytes: number;
}

export interface PageBlocksLabels {
  /** Accessible name of a gallery list. */
  gallery: string;
  /** Text after a download link, e.g. `PDF, 48 kB`. */
  fileInfo: (file: BlockFile) => string;
  embed: {
    /** Notice before loading: which provider gets a request. */
    notice: (providerName: string) => string;
    load: string;
    frameTitle: (providerName: string) => string;
  };
}

export interface PageBlocksProps {
  /** Page blocks as stored; anything that is not a known, well-formed block is dropped. */
  blocks: readonly unknown[];
  images: Readonly<Record<string, BlockImage>>;
  files: Readonly<Record<string, BlockFile>>;
  labels: PageBlocksLabels;
  className?: string;
}

type Block = Record<string, unknown>;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function Img({ image, className }: { image: BlockImage; className?: string }) {
  const src = safeImageSrc(image.src);
  if (src === null) return null;
  return (
    <img
      src={src}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading="lazy"
      decoding="async"
      className={cn("h-auto w-full rounded-md bg-surface-sunken object-cover", className)}
    />
  );
}

function renderBlock(block: Block, key: number, props: PageBlocksProps): ReactNode {
  const { images, files, labels } = props;
  switch (block.type) {
    case "heading": {
      const text = str(block.text);
      if (text === null) return null;
      return block.level === 3 ? (
        <h3 key={key} className="font-heading text-fs-4 font-bold" data-block="heading">
          {text}
        </h3>
      ) : (
        <h2 key={key} className="font-heading text-fs-5 font-bold" data-block="heading">
          {text}
        </h2>
      );
    }
    case "text":
      return (
        <div key={key} data-block="text">
          <RichTextContent doc={block.content} />
        </div>
      );
    case "image": {
      const image = typeof block.mediaId === "string" ? images[block.mediaId] : undefined;
      if (image === undefined || safeImageSrc(image.src) === null) return null;
      const caption = str(block.caption);
      return (
        <figure key={key} className="flex flex-col gap-2" data-block="image">
          <Img image={image} />
          {caption ? <figcaption className="text-fs-2 text-muted">{caption}</figcaption> : null}
        </figure>
      );
    }
    case "gallery": {
      const ids = Array.isArray(block.mediaIds) ? block.mediaIds : [];
      const shown = ids
        .map((id) => (typeof id === "string" ? images[id] : undefined))
        .filter((img): img is BlockImage => img !== undefined && safeImageSrc(img.src) !== null);
      if (shown.length === 0) return null;
      return (
        <ul
          key={key}
          aria-label={labels.gallery}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          data-block="gallery"
        >
          {shown.map((image, i) => (
            <li key={i}>
              <Img image={image} className="aspect-[4/3]" />
            </li>
          ))}
        </ul>
      );
    }
    case "quote": {
      const text = str(block.text);
      if (text === null) return null;
      const source = str(block.source);
      return (
        <figure
          key={key}
          className="flex flex-col gap-2 border-l-4 border-accent pl-4"
          data-block="quote"
        >
          <blockquote className="font-heading text-fs-5 leading-snug italic">
            <p>{text}</p>
          </blockquote>
          {source ? <figcaption className="text-fs-2 text-muted">{source}</figcaption> : null}
        </figure>
      );
    }
    case "embed": {
      const embed = embedSource(block.provider, block.url);
      if (embed === null) return null;
      return (
        <div key={key} data-block="embed" data-provider={embed.provider}>
          <EmbedFacade
            src={embed.src}
            frameTitle={labels.embed.frameTitle(embed.providerName)}
            notice={labels.embed.notice(embed.providerName)}
            loadLabel={labels.embed.load}
          />
        </div>
      );
    }
    case "cta": {
      const label = str(block.label);
      const href = safeHref(block.href);
      if (label === null || href === null) return null;
      const external = /^https?:/i.test(href);
      return (
        <p key={key} data-block="cta">
          <a
            href={href}
            className={buttonClasses({ size: "lg" })}
            {...(external ? { rel: "noopener noreferrer nofollow" } : {})}
          >
            {label}
          </a>
        </p>
      );
    }
    case "file": {
      const file = typeof block.mediaId === "string" ? files[block.mediaId] : undefined;
      const label = str(block.label);
      const href = file ? safeHref(file.href) : null;
      if (file === undefined || label === null || href === null) return null;
      return (
        <p key={key} className="flex flex-wrap items-baseline gap-x-2 text-fs-3" data-block="file">
          <a
            href={href}
            download={file.filename}
            className="font-semibold text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
          >
            {label}
          </a>
          <span className="text-fs-2 text-muted">{labels.fileInfo(file)}</span>
        </p>
      );
    }
    default:
      // Unknown block types are dropped.
      return null;
  }
}

/** Renders page blocks through the allow-list (see module comment). */
export function PageBlocks(props: PageBlocksProps) {
  const rendered = props.blocks
    .map((block, i) =>
      block !== null && typeof block === "object" ? renderBlock(block as Block, i, props) : null,
    )
    .filter((node) => node !== null);
  if (rendered.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-6", props.className)} data-page-blocks="">
      {rendered}
    </div>
  );
}
