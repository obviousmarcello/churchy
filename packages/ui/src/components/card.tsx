import type { ReactNode } from "react";
import { cn } from "../cn";

export interface CardImage {
  src: string;
  /** Required; an empty string marks a decorative image. */
  alt: string;
  width?: number;
  height?: number;
}

export interface CardProps {
  title: string;
  /** Heading level of the title; pick the one that fits the page outline. */
  headingLevel?: 2 | 3 | 4;
  /** Small line above the title (category, date). */
  eyebrow?: string;
  /** Makes the whole card one link (the title is the link text). */
  href?: string;
  image?: CardImage;
  /** `highlight` marks something that needs attention, e.g. a schedule exception. */
  tone?: "default" | "highlight";
  /** Body content. */
  children?: ReactNode;
  /** Actions / meta row at the bottom. Interactive elements here stay clickable above a card link. */
  footer?: ReactNode;
  as?: "article" | "div" | "li";
  className?: string;
}

/** Content card: optional image, eyebrow, title, body and footer. */
export function Card({
  title,
  headingLevel = 3,
  eyebrow,
  href,
  image,
  tone = "default",
  children,
  footer,
  as: Tag = "article",
  className,
}: CardProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <Tag
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border shadow-card",
        tone === "highlight"
          ? "border-accent border-l-[6px] bg-accent-soft"
          : "border-border bg-surface-raised",
        href &&
          "transition-shadow duration-(--duration) hover:shadow-raised has-[a:hover]:border-accent",
        className,
      )}
    >
      {image ? (
        <img
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10] w-full object-cover"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5 sm:p-6">
        {eyebrow ? (
          <p className="text-fs-1 font-bold tracking-[0.14em] text-accent-text uppercase">
            {eyebrow}
          </p>
        ) : null}
        <Heading className="font-heading text-fs-5 leading-[1.1] font-bold text-primary">
          {href ? (
            <a
              href={href}
              className="text-inherit no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-(length:--focus-width) focus-visible:after:-outline-offset-(length:--focus-width) focus-visible:after:outline-focus"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </Heading>
        {children ? <div className="text-fs-3 text-text">{children}</div> : null}
        {footer ? (
          <div className="relative z-10 mt-auto flex flex-wrap items-center gap-3 pt-3 text-fs-2 text-muted">
            {footer}
          </div>
        ) : null}
      </div>
    </Tag>
  );
}
