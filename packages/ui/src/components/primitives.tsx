import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

/* ---- IconTile -------------------------------------------------------------------------------- */

export type IconTileTone =
  "primary" | "accent" | "neutral" | "success" | "warning" | "danger" | "info";
export type IconTileSize = "sm" | "md" | "lg";

const tileTones: Record<IconTileTone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent-text",
  neutral: "bg-surface-sunken text-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

const tileSizes: Record<IconTileSize, string> = {
  sm: "size-9 [&_svg]:size-[18px]",
  md: "size-11 [&_svg]:size-5",
  lg: "size-14 [&_svg]:size-7",
};

export interface IconTileProps {
  /** The icon, e.g. `<CalendarIcon />`. Decorative. */
  icon: ReactNode;
  tone?: IconTileTone;
  size?: IconTileSize;
  className?: string;
}

/**
 * A tinted rounded square (squircle-ish, `--radius-tile`) that holds an icon: section headers,
 * cards, list items, dashboard tiles. Decorative (`aria-hidden`); the text next to it carries the
 * meaning.
 */
export function IconTile({ icon, tone = "primary", size = "md", className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      data-icon-tile={tone}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-tile",
        tileTones[tone],
        tileSizes[size],
        className,
      )}
    >
      {icon}
    </span>
  );
}

/* ---- Avatar ---------------------------------------------------------------------------------- */

export type AvatarSize = "sm" | "md" | "lg";

const avatarSizes: Record<AvatarSize, string> = {
  sm: "size-8 text-fs-1",
  md: "size-11 text-fs-2",
  lg: "size-16 text-fs-4",
};

export interface AvatarProps {
  /** Accessible name, e.g. the person's formatted name. Omit when the name is printed next to it. */
  label?: string;
  /** Initials to show without an image (the app derives them; family name first in Hungarian). */
  initials?: string;
  /** Photo URL. */
  src?: string;
  size?: AvatarSize;
  /** `tile` (rounded square, default) or `circle`. */
  shape?: "tile" | "circle";
  className?: string;
}

/**
 * Person picture or initials in a rounded square (or circle). With `label` it is an image with a
 * name; without, it is decorative.
 */
export function Avatar({
  label,
  initials,
  src,
  size = "md",
  shape = "tile",
  className,
}: AvatarProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span
      {...a11y}
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden bg-primary-soft font-semibold text-primary select-none",
        shape === "circle" ? "rounded-full" : "rounded-tile",
        avatarSizes[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

/* ---- Chip ------------------------------------------------------------------------------------ */

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  children: ReactNode;
  /** Decorative leading icon. */
  icon?: ReactNode;
  /** Makes the chip a link (`<a>`). */
  href?: string;
  /** Pressed / selected filter chip; renders a toggle button (`aria-pressed`) when not a link. */
  selected?: boolean;
  /** Turns the chip into a `<button>` (filter chip). */
  onClick?: () => void;
  /** For a link chip: marks the current filter (`aria-current="page"`). */
  current?: boolean;
}

const chipBase =
  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-fs-2 font-semibold whitespace-nowrap no-underline " +
  "transition-[background-color,border-color,color,translate,scale] duration-(--dur-2) ease-spring " +
  "active:scale-(--motion-press) [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * Filter / quick-choice pill (44 px tall). A static chip is a `span`; with `href` a link (use
 * `current`), with `onClick` a toggle button (use `selected`). For categories without interaction
 * prefer `Badge`.
 */
export function Chip({
  children,
  icon,
  href,
  selected,
  current,
  onClick,
  className,
  ...rest
}: ChipProps) {
  const on = Boolean(selected || current);
  const classes = cn(
    chipBase,
    on
      ? "border-transparent bg-primary text-primary-contrast"
      : "border-hairline bg-surface-raised text-text hover:border-border-strong hover:bg-surface-tint",
    (href || onClick) && "cursor-pointer",
    className,
  );
  if (href) {
    return (
      <a href={href} aria-current={current ? "page" : undefined} className={classes} {...rest}>
        {icon}
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" aria-pressed={on} onClick={onClick} className={classes} {...rest}>
        {icon}
        {children}
      </button>
    );
  }
  return (
    <span className={classes} {...rest}>
      {icon}
      {children}
    </span>
  );
}

/* ---- Reveal / Stagger ------------------------------------------------------------------------ */

type RevealTag = "div" | "section" | "ul" | "ol" | "li" | "article";

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  /** Extra delay before this element starts (ms). */
  delay?: number;
  children?: ReactNode;
}

/**
 * Fades its content up once, on first render (pure CSS, `data-reveal`). For one section or block;
 * for lists use `Stagger`. Never wrap the LCP element (hero image / page title): it would delay it.
 */
export function Reveal({ as: Tag = "div", delay, style, children, ...rest }: RevealProps) {
  const merged = delay ? ({ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties) : style;
  return (
    <Tag data-reveal="" style={merged} {...rest}>
      {children}
    </Tag>
  );
}

export interface StaggerProps extends HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  children?: ReactNode;
}

/**
 * A list / grid whose direct children fade up one after another (`--stagger-step`, 55 ms; capped
 * at 8 steps). Layout stays with the caller: `<Stagger as="ul" className="grid gap-4 md:grid-cols-3">`.
 * Children can set `style={{ "--i": n }}` to control their order.
 */
export function Stagger({ as: Tag = "div", children, ...rest }: StaggerProps) {
  return (
    <Tag data-stagger="" {...rest}>
      {children}
    </Tag>
  );
}

/* ---- Progress -------------------------------------------------------------------------------- */

export interface ProgressProps {
  /** Accessible name ("Feltöltés", "Kitöltöttség"). */
  label: string;
  /** 0…max. Omit for an indeterminate bar. */
  value?: number;
  max?: number;
  /** Human-readable value for assistive technology, e.g. "3 / 5 lépés". */
  valueText?: string;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}

const progressTones = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/**
 * Rounded progress bar (`role="progressbar"`). Value changes glide (transform, `--dur-4`); without a
 * value it shows the indeterminate shimmer.
 */
export function Progress({
  label,
  value,
  max = 100,
  valueText,
  tone = "primary",
  className,
}: ProgressProps) {
  const ratio = value === undefined ? undefined : Math.min(1, Math.max(0, value / max));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
    >
      {ratio === undefined ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 w-1/3 rounded-full motion-safe:animate-[ui-indeterminate_1.4s_var(--ease-standard)_infinite]",
            progressTones[tone],
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ transform: `translateX(${(ratio - 1) * 100}%)` }}
          className={cn(
            "absolute inset-0 rounded-full transition-transform duration-(--dur-4) ease-emphasized",
            progressTones[tone],
          )}
        />
      )}
    </div>
  );
}
