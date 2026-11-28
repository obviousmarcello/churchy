import { ViewTransition } from "react";

import { LocalDateTime } from "@/components/music/local-date-time";
import { cn } from "@/lib/music/utils";

/**
 * A calendar-style month and day, in the viewer's time zone. With
 * `transitionName`, the badge moves to the badge with the same name on the
 * next page, e.g. from the events list to the event (see `PageTransition`).
 */
export function DateBadge({
  date,
  featured,
  small,
  transitionName,
}: {
  date: string;
  featured?: boolean;
  /** In a list with many rows, e.g. the events next to an open event. */
  small?: boolean;
  transitionName?: string;
}) {
  const badge = (
    <div
      aria-hidden
      className={cn(
        "flex size-14 shrink-0 flex-col items-center justify-center rounded-card bg-surface-sunken",
        featured && "size-16",
        small && "size-11 rounded-control",
      )}
    >
      <span
        className={cn(
          "text-xs font-medium text-muted uppercase",
          small && "text-[0.625rem] leading-tight",
        )}
      >
        <LocalDateTime date={date} options={{ month: "short" }} />
      </span>
      <span
        className={cn(
          "text-xl leading-none font-semibold",
          featured && "text-2xl",
          small && "text-lg",
        )}
      >
        <LocalDateTime date={date} options={{ day: "numeric" }} />
      </span>
    </div>
  );
  if (!transitionName) return badge;

  // `default="none"`: the badge moves only between the two pages, not in other transitions.
  return (
    <ViewTransition name={transitionName} share="auto" default="none">
      {badge}
    </ViewTransition>
  );
}
