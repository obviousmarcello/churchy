"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface RoomsTab {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
}

const linkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border-2 border-border-strong px-3 font-semibold text-text no-underline hover:bg-primary-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast";

/** Sub-navigation of the room booking section; the current page is marked with aria-current. */
export function RoomsTabs({ label, tabs }: { label: string; tabs: readonly RoomsTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} data-testid="rooms-tabs" className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          data-tab={tab.id}
          aria-current={pathname === tab.href ? "page" : undefined}
          className={linkClass}
        >
          {tab.label}
          {tab.count ? <span>({tab.count})</span> : null}
        </Link>
      ))}
    </nav>
  );
}
