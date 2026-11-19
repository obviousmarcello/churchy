"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface WorkspaceNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

const HOME_HREF = "/munkater";

/** `/munkater/naptar/uj` belongs to `/munkater/naptar`; *Ma* only matches itself. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === HOME_HREF) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The workspace shell (SDD §20.2): a bottom bar on phones (scrolls sideways when the church has
 * many modules), a sidebar from 768 px. Items are already filtered by `can()` and module switches;
 * every target is at least 56 px (bottom bar) / 44 px (sidebar) tall.
 */
export function WorkspaceFrame({
  label,
  items,
  children,
}: {
  label: string;
  items: readonly WorkspaceNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col md:flex-row md:gap-8 md:px-(--gutter)">
      <nav
        aria-label={label}
        data-testid="workspace-nav"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised md:sticky md:top-4 md:z-auto md:my-8 md:h-fit md:w-56 md:shrink-0 md:rounded-md md:border"
      >
        <ul
          data-testid="area-sections"
          className="flex overflow-x-auto md:flex-col md:gap-1 md:overflow-visible md:p-2"
        >
          {items.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <li key={item.id} data-section={item.id} className="shrink-0 md:shrink">
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className="flex min-h-14 min-w-20 items-center justify-center rounded-md px-3 py-2 text-center text-fs-2 leading-tight font-semibold text-text no-underline hover:bg-primary-soft aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast md:min-h-11 md:justify-start md:text-left md:text-fs-3"
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 px-(--gutter) pt-6 pb-28 md:px-0 md:pt-8 md:pb-12">
        {children}
      </div>
    </div>
  );
}
