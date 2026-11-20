import type { ReactNode } from "react";
import { cn } from "../cn";

export interface CardImage {
  src: string;
  /** Required; an empty string marks a decorative image. */
  alt: string;
  width?: number;
  height?: number;
}

/**
 * - `flat` (default): hairline border, no shadow. Lists of similar items, panels in forms.
 * - `raised`: soft shadow. One featured item or a summary that should stand off the page.
 * - `interactive`: the whole card is a link (implied by `href`); lifts on hover.
 */
export type CardVariant = "flat" | "raised" | "interactive";

export interface CardProps {
  /** Optional: a card without a title is a plain panel. */
  title?: string;
  /** Heading level of the title; pick the one that fits the page outline. */
  headingLevel?: 2 | 3 | 4;
  /** Short line above the title (category, date). Sentence case, not all caps. */
  eyebrow?: string;
  /** Decorative icon shown in a tinted square before the title, e.g. `<CalendarIcon />`. */
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
  flat: "",
  raised: "shadow-card",
  interactive:
    "shadow-xs transition-[box-shadow,border-color] duration-(--duration) " +
    "hover:border-border-strong hover:shadow-raised",
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
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border",
        variantClasses[resolved],
        tone === "highlight"
          ? "border-accent border-l-4 bg-accent-soft"
          : "border-border bg-surface-raised",
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
      <div className={cn("flex flex-1 flex-col gap-2", paddings[padding])}>
        {hasHeader ? (
          <div className="flex items-start gap-3">
            {icon ? (
              <span
                aria-hidden="true"
                className="inline-grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary [&_svg]:size-5"
              >
                {icon}
              </span>
            ) : null}
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
                      className="text-inherit no-underline after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-(length:--focus-width) focus-visible:after:-outline-offset-(length:--focus-width) focus-visible:after:outline-focus"
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
