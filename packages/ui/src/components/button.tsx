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

/*
 * Design v2: the radius comes from `--radius-button` (14 px Klasszikus, 16 px Letisztult, a pill in
 * Közösségi). Hover lifts by `--motion-lift-sm` with a spring, pressing scales to `--motion-press`
 * quickly; both are 0 / 1 under reduced motion. Only transform, opacity and colours transition.
 */
const base =
  "relative inline-flex items-center justify-center gap-2 rounded-button border " +
  "font-semibold leading-tight no-underline select-none cursor-pointer [-webkit-tap-highlight-color:transparent] " +
  "transition-[background-color,border-color,color,box-shadow,translate,scale,opacity] " +
  "duration-(--dur-2) ease-spring active:duration-(--dur-1) active:ease-standard " +
  "hover:translate-y-(--motion-lift-sm) active:translate-y-0 active:scale-(--motion-press) " +
  "[&_svg]:shrink-0 " +
  "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:not-aria-busy:opacity-55";

const destructive =
  "border-transparent bg-danger text-surface-raised shadow-xs hover:bg-[color-mix(in_oklab,var(--c-danger)_85%,black)] " +
  "hover:shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--c-danger)_70%,transparent)]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-primary text-primary-contrast shadow-xs hover:bg-primary-hover hover:shadow-primary",
  secondary:
    "border-transparent bg-primary-soft text-primary hover:bg-[color-mix(in_oklab,var(--c-primary)_14%,var(--c-surface-raised))]",
  outline:
    "border-border bg-surface-raised text-text shadow-xs hover:border-border-strong hover:bg-surface-raised hover:shadow-card",
  ghost: "border-transparent bg-transparent text-primary hover:bg-primary-soft active:bg-press",
  destructive,
  danger: destructive,
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-(--control-h-sm) min-w-(--control-h-sm) px-4 text-fs-2 [&_svg]:size-4",
  md: "min-h-(--control-h-md) min-w-(--control-h-md) px-(--control-px) text-fs-3 [&_svg]:size-5",
  lg: "min-h-(--control-h-lg) min-w-(--control-h-lg) px-7 text-fs-4 [&_svg]:size-5",
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

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("animate-spin motion-reduce:animate-none", className)}
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
     *
     * Pass it as a boolean from the first render (`loading={pending}`) and the spinner morphs in:
     * it grows out of the gap before the label, or crossfades with `iconStart`.
     */
    loading?: boolean;
  };

/**
 * The loading slot. Present whenever `loading` is a boolean, so switching it animates: without an
 * icon the slot opens from 0 to 1em (grid track 0fr → 1fr) and the spinner fades and scales in;
 * with an icon the two crossfade in the same cell. Width changes stay inside the button.
 */
function LoadingSlot({ loading, icon }: { loading: boolean; icon?: ReactNode }) {
  const spinner = (
    <span
      className={cn(
        "col-start-1 row-start-1 grid place-items-center transition-[opacity,scale] duration-(--dur-2) ease-spring",
        loading ? "scale-100 opacity-100" : "scale-50 opacity-0",
      )}
    >
      <Spinner />
    </span>
  );
  if (icon) {
    return (
      <span data-slot="loading" className="grid place-items-center">
        <span
          className={cn(
            "col-start-1 row-start-1 grid place-items-center transition-[opacity,scale] duration-(--dur-2) ease-standard",
            loading ? "scale-50 opacity-0" : "scale-100 opacity-100",
          )}
        >
          {icon}
        </span>
        {spinner}
      </span>
    );
  }
  return (
    <span
      data-slot="loading"
      aria-hidden="true"
      className={cn(
        "grid transition-[grid-template-columns,margin] duration-(--dur-3) ease-emphasized",
        loading ? "grid-cols-[1fr]" : "-me-2 grid-cols-[0fr]",
      )}
    >
      <span className="grid min-w-0 overflow-hidden">{spinner}</span>
    </span>
  );
}

/** A real `<button>`. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  loading,
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
      data-loading={loading || undefined}
    >
      {loading === undefined ? iconStart : <LoadingSlot loading={loading} icon={iconStart} />}
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
