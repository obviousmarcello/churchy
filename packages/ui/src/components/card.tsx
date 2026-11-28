import type { ReactNode } from "react";
import { cn } from "../cn";
import { IconTile } from "./primitives";

export interface CardImage {
  src: string;
  /** Required; an empty string marks a decorative image. */
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Design v2: large radii (`--radius-card`), layered surfaces and diffuse shadows instead of outlined
 * boxes.
 * - `flat` (default): white surface with a faint ring. Lists of similar items, panels in forms.
 * - `raised`: soft diffuse shadow. One featured item or a summary that should stand off the page.
 * - `interactive`: the whole card is a link (implied by `href`); lifts and deepens its shadow on
 *   hover, presses down on click, its image zooms slightly.
 * - `tinted`: a brand-tinted surface without ring or shadow, for secondary panels and bands.
 */
export type CardVariant = "flat" | "raised" | "interactive" | "tinted";

export interface CardProps {
  /** Optional: a card without a title is a plain panel. */
  title?: string;
  /** Heading level of the title; pick the one that fits the page outline. */
  headingLevel?: 2 | 3 | 4;
  /** Short line above the title (category, date). Sentence case, not all caps. */
  eyebrow?: string;
  /** Decorative icon shown in a tinted rounded tile (`IconTile`) before the title, e.g. `<CalendarIcon />`. */
  icon?: ReactNode;
  /** Makes the whole card one link (the title is the link text). Implies `variant="interactive"`. */
  href?: string;
  image?: CardImage;
  variant?: CardVariant;
  /** `highlight` marks something that needs attention, e.g. a schedule exception. */
  tone?: "default" | "highlight";
  /** Inner padding; `none` for cards that hold a table or a full-bleed list. */
  padding?: "none" | "sm" | "md";
  /** Top-right slot next to the title (a badge, an icon button). Stays clickable over a card link. */
  actions?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Actions / meta row at the bottom. Interactive elements here stay clickable above a card link. */
  footer?: ReactNode;
  as?: "article" | "div" | "li" | "section";
  className?: string;
  "data-testid"?: string;
}

const variantClasses: Record<CardVariant, string> = {
  flat: "border-hairline bg-surface-raised shadow-xs",
  raised: "border-transparent bg-surface-raised shadow-card",
  interactive:
    "group/card border-transparent bg-surface-raised shadow-card " +
    "transition-[box-shadow,translate,scale] duration-(--dur-3) ease-spring " +
    "hover:translate-y-(--motion-lift) hover:shadow-raised has-[a:focus-visible]:translate-y-(--motion-lift) " +
    "active:translate-y-0 active:scale-[0.99] active:duration-(--dur-1)",
  tinted: "border-transparent bg-surface-tint",
};

const paddings = { none: "", sm: "p-4", md: "p-(--space-card) sm:p-6" } as const;

/** Content card / panel: optional image, eyebrow, icon, title, actions, body and footer. */
export function Card({
  title,
  headingLevel = 3,
  eyebrow,
  icon,
  href,
  image,
  variant,
  tone = "default",
  padding = "md",
  actions,
  children,
  footer,
  as: Tag = "article",
  className,
  "data-testid": testId,
}: CardProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const resolved: CardVariant = variant ?? (href ? "interactive" : "flat");
  const hasHeader = Boolean(title || eyebrow || icon || actions);
  return (
    <Tag
      data-testid={testId}
      data-card={resolved}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-card border",
        tone === "highlight"
          ? "border-[color-mix(in_oklab,var(--c-accent)_45%,transparent)] bg-accent-soft"
          : variantClasses[resolved],
        className,
      )}
    >
      {image ? (
        // Inset image with its own rounded corners (design v2); zooms gently on a card link's hover.
        <div className="p-2 pb-0">
          <div className="overflow-hidden rounded-[calc(var(--radius-card)_-_0.5rem)] bg-surface-sunken">
            <img
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              className="aspect-[16/10] w-full object-cover transition-transform duration-(--dur-4) ease-emphasized group-hover/card:scale-[1.04] motion-reduce:transition-none"
            />
          </div>
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-2", paddings[padding])}>
        {hasHeader ? (
          <div className="flex items-start gap-3">
            {icon ? <IconTile icon={icon} /> : null}
            <div className="min-w-0 flex-1">
              {eyebrow ? (
                <p className="mb-1 text-fs-2 leading-snug font-semibold text-accent-text">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <Heading
                  className={cn(
                    "font-heading text-card-title [font-weight:var(--fw-heading-sm,var(--fw-heading))] text-pretty",
                    href ? "text-primary" : "text-text",
                  )}
                >
                  {href ? (
                    <a
                      href={href}
                      className="text-inherit no-underline after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:after:rounded-card focus-visible:after:outline-(length:--focus-width) focus-visible:after:-outline-offset-(length:--focus-width) focus-visible:after:outline-focus"
                    >
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                </Heading>
              ) : null}
            </div>
            {actions ? (
              <div className="relative z-10 flex shrink-0 items-center gap-1">{actions}</div>
            ) : null}
          </div>
        ) : null}
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
