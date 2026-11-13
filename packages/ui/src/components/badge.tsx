import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type BadgeTone =
  "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-sunken text-text",
  primary: "border-primary bg-primary text-primary-contrast",
  accent: "border-accent bg-accent text-accent-contrast",
  success: "border-success bg-success-soft text-success",
  warning: "border-warning bg-warning-soft text-warning",
  danger: "border-danger bg-danger-soft text-danger",
  info: "border-info bg-info-soft text-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Leading dot, e.g. for a "live" state. Decorative. */
  dot?: boolean;
  children: ReactNode;
}

/** Small status label. The text always carries the meaning; colour only reinforces it. */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-fs-2 leading-snug font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden="true" className="size-2 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
