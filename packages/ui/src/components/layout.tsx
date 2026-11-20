import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export interface SkipLinkProps {
  /** Anchor of the main landmark. */
  href?: string;
  /** Visible text once focused, e.g. the message-catalog "skip to content" string. */
  children: ReactNode;
}

/** First focusable element on every page; invisible until it receives keyboard focus. */
export function SkipLink({ href = "#tartalom", children }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]",
        "focus:inline-flex focus:min-h-(--control-h-md) focus:items-center focus:rounded-md",
        "focus:bg-primary focus:px-6 focus:font-semibold focus:text-primary-contrast",
        "focus:no-underline focus:shadow-raised focus:outline-offset-4",
      )}
    >
      {children}
    </a>
  );
}

/** Centred column, max 1200 px, with the responsive page gutter. */
export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-(--content-max) px-(--gutter)", className)}
      {...rest}
    />
  );
}

export interface PageShellProps {
  /** Text of the skip link. */
  skipLinkLabel: string;
  /** id of the main landmark (and the skip link target). */
  mainId?: string;
  /** Usually a `<Header>`. Optional: a page may render its own. */
  header?: ReactNode;
  /** Usually a `<Footer>`. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Page skeleton with the landmarks every page needs: skip link, banner (header), main, contentinfo
 * (footer). The footer sticks to the bottom on short pages.
 */
export function PageShell({
  skipLinkLabel,
  mainId = "tartalom",
  header,
  footer,
  children,
}: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <SkipLink href={`#${mainId}`}>{skipLinkLabel}</SkipLink>
      {header}
      <main id={mainId} tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      {footer}
    </div>
  );
}
