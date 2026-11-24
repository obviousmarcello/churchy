"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/music/utils";

/**
 * A small dot that pulses while the navigation of its `<Link>` waits for the
 * server, e.g. before the page is prefetched. Put it inside the link. It
 * always takes its place, so the link does not move, and it shows only after
 * 100 ms, so a fast navigation does not flash it.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-current opacity-0 transition-opacity",
        pending && "animate-pulse opacity-60 delay-100 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
