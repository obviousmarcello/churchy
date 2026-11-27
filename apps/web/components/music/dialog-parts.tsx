"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/music/utils";

// The layout of a centered dialog: a fixed `DialogHeader`, a `DialogBody`
// that scrolls, and a fixed `DialogFooter`. Put them directly in the popup,
// or in a `<form className={DIALOG_FORM_CLASS}>` that holds the body and the
// footer. Add the width to the popup: `cn(DIALOG_POPUP_CLASS, "w-lg")`.
// The buttons go in a `DialogActions` in the footer.

export const DIALOG_BACKDROP_CLASS =
  "fixed inset-0 z-50 min-h-dvh bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute";

// Usually only the body scrolls. The popup scrolls too, so that the footer
// stays reachable when the header and the footer alone are higher than the
// screen (a phone in landscape, an open keyboard, a long description).
export const DIALOG_POPUP_CLASS =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-xl border bg-surface-raised text-text shadow-lg transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";

/** A `<form>` (or a `<div>`) in the popup that holds a `DialogBody` and a `DialogFooter`. */
export const DIALOG_FORM_CLASS = "flex min-h-0 flex-1 flex-col";

/**
 * The title, the description and the close button. It does not scroll.
 * A column by default; `flex-row items-start` puts a close button next to the title.
 */
export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-2 px-4 pt-4 pb-2 sm:px-6 sm:pt-6", className)}
      {...props}
    />
  );
}

/**
 * The content between the header and the footer. Only this part scrolls.
 * A line shows under the header and above the footer while content is
 * hidden above or below. `className` is for the content, e.g. `gap-8`.
 */
export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      outer.toggleAttribute("data-overflow-top", outer.scrollTop > 0);
      outer.toggleAttribute(
        "data-overflow-bottom",
        outer.scrollTop + outer.clientHeight < outer.scrollHeight - 1,
      );
    };
    update();
    outer.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => {
      outer.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={outerRef}
      data-slot="dialog-body"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-transparent px-4 py-2 last:pb-4 data-overflow-top:border-t-border not-last:data-overflow-bottom:border-b-border sm:px-6 sm:last:pb-6"
    >
      <div ref={innerRef} className={cn("flex flex-col gap-4", className)}>
        {children}
      </div>
    </div>
  );
}

/** The buttons of the dialog, with the error of the last action above them. It does not scroll. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex shrink-0 flex-col gap-2 px-4 pt-2 pb-4 sm:px-6 sm:pb-6", className)}
      {...props}
    />
  );
}

/** The buttons in the footer, right-aligned, with the affirmative action last. */
export function DialogActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-actions"
      className={cn("flex flex-wrap justify-end gap-2", className)}
      {...props}
    />
  );
}
