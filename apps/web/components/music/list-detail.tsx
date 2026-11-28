"use client";

import { createContext, Suspense, use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";

import { LinkPending } from "@/components/music/link-pending";
import { DetailPaneContext, PageHeader } from "@/components/music/page-header";
import { useAppPathname } from "@/i18n/music/client";
import { useMediaQuery } from "@/lib/music/browser";
import { cn } from "@/lib/music/utils";

// The list-detail layout of a page with a list, e.g. Configuration (its
// parts) or Events (the events): the list and the open item.
// - Large screens (`lg`): the title and the list at the left, the open item
//   in a card at the right.
// - Small screens: the list on the root path of the page (`rootHref`), only
//   the open item on the other paths, with a back link to the list (the
//   `PageHeader` of the item adds it, see `DetailPaneContext`).
// - Without a list (e.g. a user without the role: the list shows only for
//   the users who can open the items), the title and the item.
// The `layout.tsx` of the page renders `ListDetail` with the list in `nav`:
// `ListDetailNav` for a list of links, or another list in an element with
// `data-list-detail-nav`. The visibility rules are in `globals.css`
// (`[data-list-detail]`): the list can come from the server after the
// session check, and the path can suspend, so CSS decides (with the marker of
// `RootMarker`), not React state. Then the item never waits for them.

export type ListDetailItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Only on small screens, below the label. */
  description?: string;
};

type ListDetailContext = { title: string; rootHref: string };

const Context = createContext<ListDetailContext | null>(null);

const LARGE_SCREEN = "(min-width: 64rem)";

export function ListDetail({
  title,
  rootHref,
  header,
  nav,
  size = "narrow",
  open,
  supporting = false,
  children,
}: {
  title: string;
  /** The path of the list on small screens, and of the back link of an item. */
  rootHref: string;
  /** The top of the list (`ListPaneHeader`). Default: the title. False: the list has its own, e.g. with actions that need its data. */
  header?: React.ReactNode | false;
  nav: React.ReactNode;
  /**
   * `narrow`: a list of links. `wide`: rows with two lines of details, e.g.
   * the events. `primary`: the list is the main part of the page and takes
   * the room, the item is a narrower card, e.g. the songs.
   */
  size?: "narrow" | "wide" | "primary";
  /**
   * Whether an item is open, for a page that keeps the open item in the
   * query, not in the path (e.g. `?song=`). Without it, the path decides.
   */
  open?: boolean;
  /**
   * The list only helps the main part, e.g. the songs next to the rehearsal
   * setlist: small screens show only the main part, without a back link.
   * Use it with `open`.
   */
  supporting?: boolean;
  children: React.ReactNode;
}) {
  const context = { title, rootHref };
  const paneContext = supporting ? { title, rootHref: null } : context;
  const primary = size === "primary";

  return (
    <Context value={context}>
      {/* The `main` landmark has the list and the item: the list is the main part of a root page, e.g. the songs. */}
      <main
        data-list-detail
        className="flex flex-1 flex-col lg:flex-row lg:items-start lg:gap-4 lg:p-4 xl:gap-6 xl:p-6"
      >
        {open === undefined ? (
          // `usePathname()` can suspend: only the marker waits, not the item.
          <Suspense fallback={null}>
            <RootMarker rootHref={rootHref} />
          </Suspense>
        ) : (
          !open && <span hidden data-list-detail-root />
        )}
        <div
          data-list-detail-list
          className={cn(
            "flex flex-col",
            primary
              ? "min-w-0 lg:flex-1"
              : supporting
                ? // The full height: the list scrolls in it, below a part that stays (e.g. a search).
                  "shrink-0 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:overflow-hidden xl:top-6 xl:h-[calc(100dvh-3rem)]"
                : "shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto xl:top-6 xl:max-h-[calc(100dvh-3rem)]",
            size === "wide" && "lg:w-80 xl:w-88",
            size === "narrow" && "lg:w-60 xl:w-64",
          )}
        >
          {header === undefined ? <ListPaneHeader title={title} /> : header}
          {nav}
        </div>
        <DetailPaneContext value={paneContext}>
          <div
            data-list-detail-detail
            className={cn(
              // `@container`: the parts of the item fit their content to the width of the card.
              "@container flex min-w-0 flex-1 flex-col lg:rounded-card lg:border lg:bg-surface-raised lg:text-text",
              // The card stays in view while the list scrolls.
              primary
                ? "lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:w-96 lg:flex-none lg:overflow-y-auto xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:w-[28rem]"
                : "lg:min-h-[calc(100dvh-2rem)] xl:min-h-[calc(100dvh-3rem)]",
            )}
          >
            {children}
          </div>
        </DetailPaneContext>
      </main>
    </Context>
  );
}

// On the root path: the CSS of `globals.css` then shows the list on small screens.
function RootMarker({ rootHref }: { rootHref: string }) {
  return useAppPathname() === rootHref ? <span hidden data-list-detail-root /> : null;
}

/**
 * The top of the list: on small screens the top bar of the app, on large
 * screens the title above the list. The actions show next to the title.
 */
export function ListPaneHeader({
  title,
  details,
  actions,
  heading = false,
}: {
  title: string;
  /** Below the title, e.g. the number of songs. */
  details?: React.ReactNode;
  actions?: React.ReactNode;
  /** The title is the heading of the page, e.g. of the songs, where the list is the main part. */
  heading?: boolean;
}) {
  // Else not a heading: the open item has the heading of the page.
  const Title = heading ? "h1" : "p";
  return (
    <>
      <PageHeader title={title} details={details} actions={actions} className="lg:hidden" />
      <div className="hidden items-center justify-between gap-2 px-3 pt-2 pb-4 lg:flex">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Title className="min-w-0 truncate font-heading text-2xl font-semibold tracking-tight">
            {title}
          </Title>
          {details && <p className="text-sm text-muted">{details}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </>
  );
}

/**
 * A list of links, e.g. the parts of Configuration. On the root path of a
 * large screen, the page opens `defaultHref`: a large screen always shows an
 * item next to the list.
 */
export function ListDetailNav({
  label,
  items,
  defaultHref,
}: {
  /** The accessible name of the list. */
  label: string;
  items: ListDetailItem[];
  defaultHref: string;
}) {
  return (
    <Suspense fallback={<Nav label={label} items={items} pathname={null} />}>
      <RoutedNav label={label} items={items} defaultHref={defaultHref} />
    </Suspense>
  );
}

function RoutedNav({
  defaultHref,
  ...props
}: Omit<React.ComponentProps<typeof Nav>, "pathname"> & { defaultHref: string }) {
  const pathname = useAppPathname();
  const router = useRouter();
  const rootHref = use(Context)?.rootHref;
  const atRoot = pathname === rootHref;
  // Also when the window becomes large later.
  const large = useMediaQuery(LARGE_SCREEN);

  useEffect(() => {
    if (atRoot && large) router.replace(defaultHref);
  }, [atRoot, large, defaultHref, router]);

  return <Nav {...props} pathname={pathname} />;
}

function Nav({
  label,
  items,
  pathname,
}: {
  label: string;
  items: ListDetailItem[];
  pathname: string | null;
}) {
  return (
    <nav data-list-detail-nav aria-label={label} className="px-4 pb-6 sm:px-6 lg:px-0 lg:pb-0">
      <ul className="flex flex-col overflow-hidden rounded-card bg-surface-raised text-text max-lg:mt-4 lg:gap-1 lg:overflow-visible lg:rounded-none lg:bg-transparent">
        {items.map(({ href, label: itemLabel, icon, description }) => (
          <li key={href} className="flex">
            <Link
              href={href}
              // Also on the pages below the item, e.g. a user of Users.
              aria-current={
                pathname === href ? "page" : pathname?.startsWith(`${href}/`) ? "true" : undefined
              }
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-sm font-medium outline-none transition-colors select-none hover:bg-hover hover:text-text focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset",
                "lg:rounded-full lg:py-2.5 lg:text-muted",
                "lg:aria-[current]:bg-surface-sunken lg:aria-[current]:text-text",
                "[&_svg]:size-4 [&_svg]:shrink-0",
              )}
            >
              <span aria-hidden className="flex">
                {icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{itemLabel}</span>
                {description && (
                  <span className="text-xs font-normal text-muted lg:hidden">{description}</span>
                )}
              </span>
              <LinkPending />
              <ChevronRightIcon aria-hidden className="text-muted lg:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
