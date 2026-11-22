import { ViewTransition, type ReactNode } from "react";

/** The React transition type that marks a page navigation (`<Link transitionTypes>`). */
export const PAGE_TRANSITION_TYPE = "ui-page";

/**
 * Pass to Next's `<Link transitionTypes={pageTransitionTypes}>` (or `router.push(href,
 * { transitionTypes })`) so a client-side navigation plays the page transition.
 */
export const pageTransitionTypes: string[] = [PAGE_TRANSITION_TYPE];

export interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Page transitions on the View Transitions API (design v2).
 *
 * - Client navigations tagged with `pageTransitionTypes`: the old content fades out quickly, the new
 *   content fades up into place (React `<ViewTransition>`; classes `ui-page*` in motion.css).
 * - Untagged transitions (server actions, `router.refresh()`, Suspense reveals) do not animate, so
 *   saving a form never makes the page jump.
 * - Plain `<a>` navigations are animated by the browser's cross-document view transition
 *   (`@view-transition` in motion.css); nothing to do here.
 *
 * Browsers without the API, and `prefers-reduced-motion: reduce`, get an instant swap. Wrap the
 * page content once (the root layout does); it renders no element of its own, so layout is
 * unaffected.
 */
export function PageTransition({ children }: PageTransitionProps) {
  return (
    <ViewTransition
      enter={{ [PAGE_TRANSITION_TYPE]: "ui-page-enter", default: "none" }}
      exit={{ [PAGE_TRANSITION_TYPE]: "ui-page-exit", default: "none" }}
      update={{ [PAGE_TRANSITION_TYPE]: "ui-page", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
