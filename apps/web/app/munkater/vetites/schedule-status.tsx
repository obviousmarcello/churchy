"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ClockIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { runSheetWithBlocks } from "@/lib/music/event-blocks";
import { scheduleStatus } from "@/lib/music/event-timing";
import { cn } from "@/lib/music/utils";
import type { EventScheduleDTO } from "@/server/music/models/projections";

/** The clock of the status moves in steps of this time. */
const CLOCK_STEP_MS = 15_000;

/**
 * In the header of the controller of an event: the live item against its
 * planned time in the run sheet of the event (see `scheduleStatus`), e.g.
 * "3 min late". Nothing while no item of the event with a planned time is
 * live, e.g. a quick item or a passage of the Bible panel.
 */
export function ScheduleStatus({
  schedule,
  liveKey,
}: {
  schedule: EventScheduleDTO;
  liveKey: string | null;
}) {
  const { m, format, locale } = useI18n();
  const t = m.project.controller.schedule;
  // Null on the server and in the first render: the clock of the server is not the clock of the browser.
  const now = useSyncExternalStore(subscribeToClock, readClock, () => null);
  const starts = useMemo(
    // A block with a time of its own takes that time. A schedule from an older version has no blocks.
    () => runSheetWithBlocks(schedule.startsAt, schedule.items, schedule.blocks ?? []).starts,
    [schedule],
  );

  const index = liveKey === null ? -1 : schedule.items.findIndex((item) => item.key === liveKey);
  const plan =
    index < 0 ? undefined : { start: starts[index]!, seconds: schedule.items[index]!.seconds };
  const status = now === null ? null : scheduleStatus(plan, now);
  if (!status || !plan) return null;

  const time = new Date(plan.start).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <span
      role="status"
      title={format(t.hint, { time })}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        status.kind === "late"
          ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
          : status.kind === "early"
            ? "bg-sky-500/15 text-sky-900 dark:text-sky-200"
            : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
      )}
    >
      <ClockIcon aria-hidden className="size-3" />
      {status.kind === "onTime"
        ? t.onTime
        : format(status.kind === "late" ? t.late : t.early, { minutes: status.minutes })}
    </span>
  );
}

/** A change at each step of `readClock`, so the shown time is at most a step old. */
function subscribeToClock(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    timer = setTimeout(
      () => {
        onChange();
        next();
      },
      CLOCK_STEP_MS - (Date.now() % CLOCK_STEP_MS),
    );
  };
  next();
  return () => clearTimeout(timer);
}

/** The same value within a step, so React does not render again for each read. */
function readClock(): number {
  return Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
}
