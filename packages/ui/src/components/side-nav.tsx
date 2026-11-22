import type { ReactNode } from "react";
import { cn } from "../cn";
import { ChevronDownIcon } from "../icons";

export interface SideNavItem {
  label: string;
  href: string;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  /** The item of the current route (`aria-current="page"`). */
  current?: boolean;
  /** Count after the label (part of the accessible name). */
  count?: number;
}

export interface SideNavProps {
  /** Accessible name of the `nav` landmark. */
  label: string;
  items: SideNavItem[];
  /**
   * Optional `view-transition-name` of the current item's highlight, e.g. `"workspace-nav"`: the
   * highlight then glides from the old item to the new one when the page changes. Unique per page.
   */
  transitionName?: string;
  className?: string;
}

/**
 * Vertical app navigation (admin / workspace sidebars), design v2: rounded 44 px items, the current
 * one on a soft brand-tinted pill with a small accent bar; on hover the item tints and its content
 * slides 2 px to the right. Plain links, server-safe.
 */
export function SideNav({ label, items, transitionName, className }: SideNavProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              style={
                item.current && transitionName ? { viewTransitionName: transitionName } : undefined
              }
              className={cn(
                "group/side relative flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2 text-fs-3 font-semibold no-underline",
                "transition-[background-color,color] duration-(--dur-2) ease-standard [&_svg]:size-5 [&_svg]:shrink-0",
                item.current
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-hover hover:text-text active:bg-press",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-primary transition-[scale,opacity] duration-(--dur-3) ease-spring",
                  item.current ? "scale-100 opacity-100" : "scale-y-0 opacity-0",
                )}
              />
              <span className="flex min-w-0 flex-1 items-center gap-3 transition-transform duration-(--dur-2) ease-spring group-hover/side:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/side:translate-x-0">
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count !== undefined ? (
                  <span className="inline-grid min-w-6 place-items-center rounded-full bg-surface-raised px-1.5 text-fs-1 leading-5 font-semibold text-text shadow-xs">
                    {item.count}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface DisclosureProps {
  /** The always-visible summary line. */
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** `card` (default): a tinted rounded panel. `plain`: no surface (FAQ lists inside a card). */
  variant?: "card" | "plain";
  className?: string;
  "data-testid"?: string;
}

/**
 * Show / hide more content (FAQ, details, advanced options) on native `<details>`: works without
 * JavaScript, the summary is the button. The content glides open and closed where the browser
 * supports `::details-content` (motion.css, `[data-disclosure]`), the chevron turns.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  variant = "card",
  className,
  "data-testid": testId,
}: DisclosureProps) {
  return (
    <details
      data-disclosure=""
      open={defaultOpen}
      data-testid={testId}
      className={cn(
        "group/disclosure",
        variant === "card" && "rounded-[18px] bg-surface-tint",
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-fs-3 font-semibold text-text",
          "transition-colors duration-(--dur-2) hover:bg-hover [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="min-w-0">{summary}</span>
        <ChevronDownIcon className="size-5 shrink-0 text-muted transition-transform duration-(--dur-3) ease-spring group-open/disclosure:rotate-180" />
      </summary>
      <div className="px-4 pt-1 pb-4 text-fs-3 text-text">{children}</div>
    </details>
  );
}
