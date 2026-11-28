import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "../cn";
import { ChevronDownIcon } from "../icons";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";

export interface PopoverProps {
  /** Visible trigger text (or the accessible name when `iconOnly`). */
  triggerLabel: string;
  /** Decorative icon on the trigger. */
  triggerIcon?: ReactNode;
  /** Icon-only trigger (`triggerIcon` required); `triggerLabel` becomes its name and tooltip. */
  iconOnly?: boolean;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  /** Accessible name of the panel (often the same as the trigger label). */
  label: string;
  /** Align the panel with the trigger's start (default) or end edge. */
  align?: "start" | "end";
  /** Panel content: `MenuItem`s, a short form, help text. */
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

const safeId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * Menu / popover on the native Popover API (design v2): no JavaScript, light dismiss (click outside,
 * Escape), focus returns to the trigger, top layer (never clipped). The panel is anchored under its
 * trigger with CSS anchor positioning and flips when there is no room; browsers without anchor
 * positioning show it centred. Opens with a spring pop, closes with a quick fade (motion.css,
 * `[data-ui-popover]`). Server-safe.
 */
export function Popover({
  triggerLabel,
  triggerIcon,
  iconOnly = false,
  triggerVariant = "outline",
  triggerSize = "md",
  label,
  align = "start",
  children,
  className,
  "data-testid": testId,
}: PopoverProps) {
  const id = `ui-popover-${safeId(useId())}`;
  const anchor = `--${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={iconOnly ? triggerLabel : undefined}
        title={iconOnly ? triggerLabel : undefined}
        style={{ anchorName: anchor } as CSSProperties}
        className={buttonClasses({ variant: triggerVariant, size: triggerSize, iconOnly })}
      >
        {triggerIcon}
        {iconOnly ? null : (
          <>
            {triggerLabel}
            <ChevronDownIcon size="sm" />
          </>
        )}
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        data-ui-popover=""
        data-align={align}
        data-testid={testId}
        style={{ positionAnchor: anchor } as CSSProperties}
        className={cn(
          "w-max max-w-[min(22rem,calc(100vw-1rem))] rounded-[20px] border border-hairline bg-surface-raised p-2 text-text shadow-overlay",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  /** Decorative leading icon. */
  icon?: ReactNode;
  /** Renders a link. */
  href?: string;
  /** Marks the current choice (`aria-current`). */
  current?: boolean;
  tone?: "default" | "danger";
  type?: "button" | "submit";
  name?: string;
  value?: string;
  "data-testid"?: string;
}

/** One row of a `Popover` menu: 44 px tall, rounded, highlights on hover / focus. */
export function MenuItem({
  children,
  icon,
  href,
  current,
  tone = "default",
  type = "button",
  name,
  value,
  "data-testid": testId,
}: MenuItemProps) {
  const classes = cn(
    "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[12px] px-3 text-left text-fs-3 no-underline",
    "transition-[background-color,color] duration-(--dur-1) hover:bg-hover active:bg-press [&_svg]:size-5 [&_svg]:shrink-0",
    tone === "danger" ? "text-danger" : "text-text",
    current && "bg-selected font-semibold text-primary",
  );
  if (href) {
    return (
      <a
        href={href}
        aria-current={current ? "page" : undefined}
        className={classes}
        data-testid={testId}
      >
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      name={name}
      value={value}
      aria-current={current ? "true" : undefined}
      className={classes}
      data-testid={testId}
    >
      {icon}
      {children}
    </button>
  );
}
