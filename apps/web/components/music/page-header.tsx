"use client";

import { createContext, use } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { buttonVariants } from "@/components/music/ui/button";
import { cn } from "@/lib/music/utils";

/**
 * Set in the detail pane of `ListDetail` (`src/components/list-detail.tsx`):
 * the title and the root path of the list. A `PageHeader` there is the top
 * bar on small screens, with a back link to the list when it has no other,
 * and the title of the card on large screens.
 */
export const DetailPaneContext = createContext<{ title: string; rootHref: string | null } | null>(
  null,
);

export function PageHeader({
  title,
  details,
  back,
  actions,
  className,
}: {
  title: string;
  /** What the page shows, e.g. the song of a PDF file. Not a description of the page. */
  details?: React.ReactNode;
  /** With `onClick`, e.g. a page that keeps the open item in the query: the click can do the navigation itself. */
  back?: {
    href: string;
    label: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  };
  actions?: React.ReactNode;
  /** E.g. `lg:hidden`: on the header itself, so it stays sticky. */
  className?: string;
}) {
  const pane = use(DetailPaneContext);
  // In a detail pane: back to the list, only on small screens (large screens show the list).
  // A page in a pane without a list (`PagePane`, rootHref null) has no such link.
  const listBack = !back && pane?.rootHref ? { href: pane.rootHref, label: pane.title } : null;
  const backLink = back ?? listBack;

  return (
    // On phones the header is the top bar of the app: it starts below the status bar of the installed app.
    <header
      className={cn(
        "sticky top-0 z-10 flex items-end justify-between gap-4 border-b bg-surface/80 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 backdrop-blur sm:px-6 sm:pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:pb-4",
        // The card of the detail pane: the title of the card, not a bar.
        pane &&
          "lg:static lg:z-auto lg:border-b-0 lg:bg-transparent lg:pt-6 lg:pb-2 lg:backdrop-blur-none",
        className,
      )}
    >
      {/* Phones: the back link is an icon next to the title, so the sticky header stays low. */}
      <div className="flex min-w-0 items-center gap-1 sm:block">
        {backLink && (
          <Link
            href={backLink.href}
            onClick={back?.onClick}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: cn("-ml-2.5 max-sm:size-9 max-sm:px-0 sm:mb-2", listBack && "lg:hidden"),
            })}
          >
            <ArrowLeftIcon />
            <span className="max-sm:sr-only">{backLink.label}</span>
          </Link>
        )}
        <h1 className="min-w-0 truncate font-heading text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {/* Small screens have no room for it: the header is sticky. */}
        {details && <p className="hidden text-sm text-muted md:block">{details}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
