import type { ReactNode } from "react";
import { cn } from "../cn";
import { DangerIcon, InfoIcon, SuccessIcon, WarningIcon } from "../icons";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: typeof InfoIcon }> = {
  info: { box: "border-info bg-info-soft text-info", icon: InfoIcon },
  success: { box: "border-success bg-success-soft text-success", icon: SuccessIcon },
  warning: { box: "border-warning bg-warning-soft text-warning", icon: WarningIcon },
  danger: { box: "border-danger bg-danger-soft text-danger", icon: DangerIcon },
};

export interface AlertProps {
  tone?: AlertTone;
  /** `inline` is a boxed message; `banner` spans the full width (site-wide notices). */
  variant?: "inline" | "banner";
  title?: string;
  /** Message body. */
  children?: ReactNode;
  /** Optional action, e.g. a link or button. */
  action?: ReactNode;
  /**
   * Live-region role. Leave unset for static content that is part of the page; pass `"alert"` or
   * `"status"` only for messages that appear dynamically.
   */
  role?: "alert" | "status";
  className?: string;
}

/** Notice with icon + text (never colour alone). */
export function Alert({
  tone = "info",
  variant = "inline",
  title,
  children,
  action,
  role,
  className,
}: AlertProps) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 border-2 px-4 py-3 text-fs-3",
        variant === "inline"
          ? "rounded-md"
          : "justify-center rounded-none border-x-0 border-t-0 px-(--gutter) py-3",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 flex-1 text-text">
        {title ? <p className="font-bold text-current">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
