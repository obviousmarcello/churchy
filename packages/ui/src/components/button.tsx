import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md border-2 font-semibold leading-tight " +
  "no-underline select-none transition-colors duration-(--duration) " +
  "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-primary-contrast hover:border-primary-hover hover:bg-primary-hover",
  secondary: "border-primary bg-transparent text-primary hover:bg-primary-soft",
  ghost: "border-transparent bg-transparent text-primary hover:bg-primary-soft",
  danger: "border-danger bg-danger text-surface-raised hover:brightness-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-(--control-h-sm) min-w-(--control-h-sm) px-4 text-fs-2",
  md: "min-h-(--control-h-md) min-w-(--control-h-md) px-(--control-px) text-fs-3",
  lg: "min-h-(--control-h-lg) min-w-(--control-h-lg) px-8 text-fs-4",
};

/** Class string shared by `Button` and `ButtonLink` (use it to style other elements as buttons). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Decorative icon before / after the label. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** A real `<button>`. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
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
    >
      {iconStart}
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
