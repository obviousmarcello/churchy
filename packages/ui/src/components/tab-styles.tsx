import type { ReactNode } from "react";

/** Shared look of `Tabs` (in-page panels) and `NavTabs` (one route per tab). */
export const tabListClass =
  "flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--c-border)] [scrollbar-width:thin]";

export const tabTriggerClass =
  "inline-flex min-h-(--control-h-md) shrink-0 cursor-pointer items-center gap-2 " +
  "border-b-2 border-transparent px-4 text-fs-3 font-semibold whitespace-nowrap text-muted no-underline " +
  "transition-colors duration-(--duration) hover:border-border-strong hover:text-text [&_svg]:size-5";

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
        <span className="inline-grid min-w-6 place-items-center rounded-full bg-surface-sunken px-1.5 text-fs-1 leading-5 font-semibold text-text">
          {count}
        </span>
      ) : null}
    </>
  );
}
