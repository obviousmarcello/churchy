import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import {
  CheckIcon,
  CircleIcon,
  ClockIcon,
  DangerIcon,
  InfoIcon,
  WarningIcon,
  type IconProps,
} from "../icons";

export type BadgeTone =
  "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent text-accent-contrast",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

const pill =
  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-fs-2 leading-snug " +
  "font-semibold whitespace-nowrap";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Leading dot, e.g. for a "live" state. Decorative. */
  dot?: boolean;
  /** Decorative leading icon, e.g. `<LockIcon />`. */
  icon?: ReactNode;
  children: ReactNode;
}

/** Small label (category, count, tag). The text carries the meaning; colour only reinforces it. */
export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cn(pill, tones[tone], "[&_svg]:size-4", className)} {...rest}>
      {dot ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" /> : null}
      {icon}
      {children}
    </span>
  );
}

export type StatusTone = "neutral" | "pending" | "info" | "success" | "warning" | "danger";

const statusTone: Record<StatusTone, { tone: BadgeTone; Icon: (p: IconProps) => ReactNode }> = {
  neutral: { tone: "neutral", Icon: CircleIcon },
  pending: { tone: "info", Icon: ClockIcon },
  info: { tone: "info", Icon: InfoIcon },
  success: { tone: "success", Icon: CheckIcon },
  warning: { tone: "warning", Icon: WarningIcon },
  danger: { tone: "danger", Icon: DangerIcon },
};

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Workflow state: `pending` (beérkezett, folyamatban), `success` (jóváhagyva) ... */
  status?: StatusTone;
  /** Visible status text from messages/hu.json, e.g. "Jóváhagyva". */
  children: ReactNode;
}

/**
 * Status of a record (request, booking, leave, publication). Always text + icon, so the status is
 * never conveyed by colour alone.
 */
export function StatusPill({ status = "neutral", className, children, ...rest }: StatusPillProps) {
  const { tone, Icon } = statusTone[status];
  return (
    <span
      data-status={status}
      className={cn(pill, tones[tone], "pl-2 [&_svg]:size-4", className)}
      {...rest}
    >
      <Icon />
      {children}
    </span>
  );
}
