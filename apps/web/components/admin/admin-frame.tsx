"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AdminScope, CloseIcon, MenuIcon, SkipLink, cn } from "@churchy/ui";

export interface AdminFrameNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface AdminFrameNavGroup {
  readonly id: string;
  /** Group heading. */
  readonly label: string;
  readonly items: readonly AdminFrameNavItem[];
}

export interface AdminFrameProps {
  brand: { name: string; href: string };
  skipLabel: string;
  labels: {
    navigation: string;
    openMenu: string;
    closeMenu: string;
    dashboard: string;
    viewSite: string;
  };
  /** Permission-filtered sections, already grouped (see `groupAdminNav()`). */
  groups: readonly AdminFrameNavGroup[];
  /** Public site of the church. */
  siteHref: string;
  children: ReactNode;
}

const DASHBOARD_HREF = "/admin";

const linkClasses =
  "flex min-h-11 items-center rounded-md px-3 py-2 text-fs-3 font-semibold text-text no-underline " +
  "hover:bg-primary-soft aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast";

/** `/admin/hirek/uj` belongs to `/admin/hirek`; the dashboard only matches itself. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === DASHBOARD_HREF) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin shell (SDD §11.1): top bar, permission-filtered sidebar and the content column. Below
 * 1024 px the sidebar is a disclosure opened from the top bar (Escape closes it and returns the
 * focus). Everything is at least 44 px tall. Used once, by `app/admin/layout.tsx`.
 */
export function AdminFrame({
  brand,
  skipLabel,
  labels,
  groups,
  siteHref,
  children,
}: AdminFrameProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AdminScope className="min-h-dvh text-fs-3">
      <SkipLink href="#tartalom">{skipLabel}</SkipLink>
      <header className="sticky top-0 z-40 flex min-h-14 items-center gap-3 border-b-2 border-border-strong bg-surface-raised px-(--gutter)">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={navId}
          aria-label={open ? labels.closeMenu : labels.openMenu}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border-2 border-border-strong lg:hidden"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <Link
          href={brand.href}
          className="inline-flex min-h-11 items-center font-heading text-fs-4 font-bold text-primary no-underline"
        >
          {brand.name}
        </Link>
        <span className="flex-1" />
        <a
          href={siteHref}
          className="inline-flex min-h-11 items-center px-2 text-fs-2 font-semibold text-primary"
        >
          {labels.viewSite}
        </a>
      </header>

      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav
          id={navId}
          aria-label={labels.navigation}
          data-testid="admin-nav"
          // Following a link closes the mobile menu.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={cn(
            "border-b-2 border-border-strong bg-surface-sunken px-3 py-4 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-r-2 lg:border-b-0",
            open ? "block" : "hidden",
          )}
        >
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                href={DASHBOARD_HREF}
                aria-current={isCurrent(pathname, DASHBOARD_HREF) ? "page" : undefined}
                className={linkClasses}
              >
                {labels.dashboard}
              </Link>
            </li>
          </ul>
          {groups.map((group) => (
            <section key={group.id} className="mt-5" aria-labelledby={`${navId}-${group.id}`}>
              <h2
                id={`${navId}-${group.id}`}
                className="px-3 pb-1 text-fs-2 font-bold tracking-wide text-muted uppercase"
              >
                {group.label}
              </h2>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      data-nav-item={item.id}
                      aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                      className={linkClasses}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <main id="tartalom" tabIndex={-1} className="min-w-0 px-(--gutter) py-8 focus:outline-none">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </AdminScope>
  );
}
