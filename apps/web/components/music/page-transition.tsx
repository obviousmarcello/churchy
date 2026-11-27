import { ViewTransition } from "react";

// The slide between pages, like a native app: a link deeper into the app
// (e.g. from the events to one event) slides the new page in from the right,
// a back link slides it in from the left. The CSS is in `globals.css`. See
// node_modules/next/dist/docs/01-app/02-guides/view-transitions.md.
//
// Only links with a type slide. The tabs, the menu, the browser's back button
// and `router.refresh()` change the page without an animation.

/** For `<Link transitionTypes>`: a link deeper into the app. */
export const NAV_FORWARD = ["nav-forward"];
/** For `<Link transitionTypes>`: a link back, e.g. the back arrow of the page header. */
export const NAV_BACK = ["nav-back"];

const DIRECTIONS = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/** Put it around the content of a `page.tsx`, not around a layout: a layout stays when the page changes. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONS} exit={DIRECTIONS} default="none">
      {children}
    </ViewTransition>
  );
}
