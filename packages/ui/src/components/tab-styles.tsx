import type { ReactNode } from "react";

/*
 * Shared look of `Tabs` (in-page panels) and `NavTabs` (one route per tab), design v2: a tinted,
 * rounded track (`--radius-button`) holding pill-shaped triggers; the current one sits on a raised
 * white "thumb". In `Tabs` the thumb slides between triggers (measured indicator); in `NavTabs` it
 * is drawn on the current link (and can morph across pages with a view transition).
 */
export const tabListClass =
  "relative flex w-fit max-w-full gap-1 overflow-x-auto rounded-button bg-surface-sunken p-1 " +
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const tabTriggerClass =
  "relative z-[1] inline-flex min-h-(--control-h-md) shrink-0 cursor-pointer items-center gap-2 " +
  "rounded-[max(calc(var(--radius-button)_-_4px),6px)] px-4 text-fs-3 font-semibold whitespace-nowrap text-muted no-underline " +
  "transition-[color,background-color,box-shadow,scale] duration-(--dur-2) ease-standard " +
  "hover:bg-hover hover:text-text active:scale-(--motion-press) [&_svg]:size-5";

/** The raised thumb of the current trigger. */
export const tabCurrentClass = "bg-surface-raised text-text shadow-card hover:bg-surface-raised";

export function TabLabel({
  label,
  icon,
  count,
}: {
  label: string;
  icon?: ReactNode;
  count?: number;
}) {
  return (
    <>
      {icon}
      <span>{label}</span>
      {count !== undefined ? " " : null}
      {count !== undefined ? (
        <span className="inline-grid min-w-6 place-items-center rounded-full bg-primary-soft px-1.5 text-fs-1 leading-5 font-semibold text-primary">
          {count}
        </span>
      ) : null}
    </>
  );
}
