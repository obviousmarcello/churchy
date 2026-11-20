import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

/**
 * - `primary`: the one main action of a view (filled).
 * - `secondary`: other actions (subtle tinted fill, no border).
 * - `outline`: neutral action on busy or tinted backgrounds (hairline border).
 * - `ghost`: low-emphasis / text action, toolbar and row actions.
 * - `destructive`: deletes or cancels something irreversibly (`danger` is the older alias).
 */
export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "destructive" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-md border " +
  "font-semibold leading-tight no-underline select-none cursor-pointer " +
  "transition-[background-color,border-color,color,box-shadow] duration-(--duration) ease-(--ease) " +
  "[&_svg]:shrink-0 " +
  "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55";

const destructive =
  "border-transparent bg-danger text-surface-raised shadow-xs hover:bg-[color-mix(in_oklab,var(--c-danger)_85%,black)]";

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-primary-contrast shadow-xs hover:bg-primary-hover",
  secondary:
    "border-transparent bg-primary-soft text-primary hover:bg-[color-mix(in_oklab,var(--c-primary)_14%,var(--c-surface-raised))]",
  outline: "border-border-strong bg-surface-raised text-text hover:bg-surface-sunken",
  ghost: "border-transparent bg-transparent text-primary hover:bg-primary-soft",
  destructive,
  danger: destructive,
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-(--control-h-sm) min-w-(--control-h-sm) px-3.5 text-fs-2 [&_svg]:size-4",
  md: "min-h-(--control-h-md) min-w-(--control-h-md) px-(--control-px) text-fs-3 [&_svg]:size-5",
  lg: "min-h-(--control-h-lg) min-w-(--control-h-lg) px-6 text-fs-4 [&_svg]:size-5",
};

const iconOnlySizes: Record<ButtonSize, string> = {
  sm: "size-(--control-h-sm) px-0",
  md: "size-(--control-h-md) px-0",
  lg: "size-(--control-h-lg) px-0",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Square button that holds only an icon (see `IconButton`). */
  iconOnly?: boolean;
  className?: string;
}

/** Class string shared by `Button`, `ButtonLink` and `IconButton` (style other elements as buttons). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconOnly = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(
    base,
    variants[variant],
    sizes[size],
    iconOnly && iconOnlySizes[size],
    fullWidth && "w-full",
    className,
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Decorative icon before / after the label, e.g. `<PlusIcon />`. Sized by the button. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * Pending state (e.g. from `useFormStatus().pending`): shows a spinner, sets `aria-busy` and
     * `aria-disabled` (pointer clicks are blocked by CSS). The label stays, so the button keeps its
     * name. Guard the handler / action too if a keyboard repeat must not submit twice.
     */
    loading?: boolean;
  };

/** A real `<button>`. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  loading = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
      // aria-disabled (not `disabled`) keeps the button focusable; the class blocks pointer clicks.
      // No event handler is added here, so a server component can render a loading Button.
      aria-busy={loading || undefined}
      aria-disabled={loading || rest["aria-disabled"] || undefined}
    >
      {loading ? <Spinner /> : iconStart}
      {children}
      {iconEnd}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** A link (`<a>`) that looks like a button, for navigation. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {iconStart}
      {children}
      {iconEnd}
    </a>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Accessible name (from messages/hu.json). Required: the button has no visible text. */
  label: string;
  /** The icon, e.g. `<EditIcon />`. */
  icon: ReactNode;
  /** Default `ghost`. */
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Square, icon-only button (toolbars, row actions, close). At least 44 x 44 px; the `label` is the
 * accessible name and the native tooltip.
 */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={buttonClasses({ variant, size, iconOnly: true, className })}
      {...rest}
    >
      {icon}
    </button>
  );
}
