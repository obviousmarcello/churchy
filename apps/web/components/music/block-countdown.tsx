"use client";

import { useSyncExternalStore } from "react";
import { TimerIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import {
  blockCountdown,
  formatCountdown,
  type BlockCountdown,
  type EventBlock,
} from "@/lib/music/event-blocks";
import { ServerClock } from "@/lib/music/live/clock-sync";
import { cn } from "@/lib/music/utils";

// The countdown of a block of the items of an event (see `@/lib/event-blocks`),
// on the projection controller and on the chord sheet. The clock is the clock
// of the server, so all devices show the same time, also a device with a
// wrong clock.

/** The clock of the countdowns moves each second. */
const TICK_MS = 1000;

let clock: ServerClock | null = null;
let users = 0;
let stopSync: (() => void) | null = null;

/** One server clock for all the countdowns of the page: it syncs while one of them shows. */
function subscribeToClock(onChange: () => void) {
  clock ??= new ServerClock();
  if (users++ === 0) stopSync = clock.start();
  const unsubscribe = clock.subscribe(onChange);
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    timer = setTimeout(
      () => {
        onChange();
        next();
      },
      // Just after the next whole second of the server clock: `readClock()` is always whole.
      TICK_MS - (rawClock() % TICK_MS) + 5,
    );
  };
  next();
  return () => {
    clearTimeout(timer);
    unsubscribe();
    if (--users === 0) {
      stopSync?.();
      stopSync = null;
    }
  };
}

/** The time of the server now, in milliseconds. */
function rawClock(): number {
  return clock ? clock.now() : Date.now();
}

/** The same value within a second, so React does not render again for each read. */
function readClock(): number {
  return Math.floor(rawClock() / TICK_MS) * TICK_MS;
}

/** The time of the server now, in whole seconds. Null on the server and in the first render. */
export function useCountdownClock(): number | null {
  return useSyncExternalStore(subscribeToClock, readClock, () => null);
}

/**
 * The countdown of the block, e.g. "12:40 left" or "3:05 until 10:00", with
 * the name of the block unless `hideName`. Nothing for a block without a
 * countdown. `plannedSeconds`: the planned time of its items (see `blockPlan`).
 */
export function BlockCountdownBadge({
  block,
  plannedSeconds,
  eventStartsAt,
  hideName = false,
  className,
}: {
  block: EventBlock;
  plannedSeconds: number;
  eventStartsAt: string;
  hideName?: boolean;
  className?: string;
}) {
  const now = useCountdownClock();
  const { m, format } = useI18n();
  const t = m.components.eventBlocks;
  const countdown = now === null ? null : blockCountdown(block, plannedSeconds, eventStartsAt, now);
  if (!countdown) return null;

  const status = countdownText(countdown, block.until ?? "", t, format);
  const over = countdown.kind !== "notStarted" && countdown.seconds < 0;
  // Screen readers hear the countdown each minute, not each second.
  const minute = countdownText(
    { ...countdown, seconds: Math.round(countdown.seconds / 60) * 60 },
    block.until ?? "",
    t,
    format,
  );
  return (
    <span
      role="timer"
      aria-label={format(t.timerLabel, { name: block.name, status: minute })}
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        countdown.kind === "notStarted"
          ? "bg-muted text-muted-foreground"
          : over
            ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
            : "bg-sky-500/15 text-sky-900 dark:text-sky-200",
        className,
      )}
    >
      <TimerIcon aria-hidden className="size-3 shrink-0" />
      {!hideName && <span className="truncate">{block.name} ·</span>}
      <span aria-hidden className="shrink-0">
        {status}
      </span>
    </span>
  );
}

type Texts = ReturnType<typeof useI18n>["m"]["components"]["eventBlocks"];

function countdownText(
  countdown: BlockCountdown,
  until: string,
  t: Texts,
  format: ReturnType<typeof useI18n>["format"],
): string {
  const { text, over } = formatCountdown(countdown.seconds);
  // Before the start: only the planned time.
  if (countdown.kind === "notStarted") return text;
  if (countdown.kind === "until")
    return format(over ? t.afterUntil : t.until, { time: text, clock: until });
  return format(over ? t.over : t.left, { time: text });
}
