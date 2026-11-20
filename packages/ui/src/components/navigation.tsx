import type { ReactNode } from "react";
import { cn } from "../cn";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { TabLabel, tabListClass, tabTriggerClass } from "./tab-styles";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last item (the current page). */
  href?: string;
}

export interface BreadcrumbsProps {
  /** Accessible name of the landmark, e.g. "Morzsamenü". */
  label: string;
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Where am I: an ordered list of ancestors, the last item is the current page
 * (`aria-current="page"`). Below 40rem only the parent is shown, as a back link.
 */
export function Breadcrumbs({ label, items, className }: BreadcrumbsProps) {
  const last = items.length - 1;
  return (
    <nav aria-label={label} className={cn("text-fs-2", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-muted">
        {items.map((item, index) => {
          const current = index === last;
          const parent = index === last - 1;
          return (
            <li
              key={`${index}-${item.label}`}
              className={cn(
                "items-center gap-1",
                parent || (current && last === 0) ? "flex" : "hidden sm:flex",
              )}
            >
              {index > 0 ? (
                <ChevronRightIcon size="sm" className="hidden shrink-0 text-muted sm:block" />
              ) : null}
              {parent ? <ChevronLeftIcon size="sm" className="shrink-0 sm:hidden" /> : null}
              {current || !item.href ? (
                <span aria-current={current ? "page" : undefined} className="text-text">
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-sm text-muted underline-offset-4 hover:text-primary hover:underline sm:min-h-8"
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface NavTabItem {
  label: string;
  href: string;
  /** The tab of the current route; rendered with `aria-current="page"`. */
  current?: boolean;
  icon?: ReactNode;
  count?: number;
}

export interface NavTabsProps {
  /** Accessible name of the navigation landmark. */
  label: string;
  items: NavTabItem[];
  className?: string;
}

/**
 * Tabs that are links (one route per tab), e.g. the sections of a settings page. Looks like `Tabs`
 * but is a `nav` with `aria-current`, so it works without JavaScript and keeps the URL.
 */
export function NavTabs({ label, items, className }: NavTabsProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className={tabListClass}>
        {items.map((item) => (
          <li key={item.href} className="flex">
            <a
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                tabTriggerClass,
                "aria-[current=page]:border-primary aria-[current=page]:text-text",
              )}
            >
              <TabLabel label={item.label} icon={item.icon} count={item.count} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface PageHeaderProps {
  title: string;
  /** One or two sentences under the title. */
  description?: ReactNode;
  /** Usually `<Breadcrumbs>`; rendered above the title. */
  breadcrumbs?: ReactNode;
  /** Page-level actions (one primary button at most), right-aligned on wide screens. */
  actions?: ReactNode;
  /** Status or meta line under the title (badges, last saved). */
  meta?: ReactNode;
  /** Tabs (`<NavTabs>`) attached to the bottom of the header. */
  tabs?: ReactNode;
  /** id of the `h1`, for `aria-labelledby`. */
  id?: string;
  className?: string;
}

/**
 * Top of an admin / workspace page: breadcrumbs, the one `h1` (page-title size), description,
 * actions and optional tabs. Public pages with a hero don't need it.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  tabs,
  id,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn("grid grid-cols-[minmax(0,1fr)] gap-3", tabs ? "mb-6" : "mb-8", className)}
    >
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="grid max-w-(--measure) min-w-0 gap-2">
          <h1
            id={id}
            className="font-heading text-page-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-balance text-text"
          >
            {title}
          </h1>
          {description ? <div className="text-fs-3 text-muted">{description}</div> : null}
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-3 min-w-0">{tabs}</div> : null}
    </header>
  );
}
