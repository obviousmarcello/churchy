"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { LocalDateTime } from "@/components/music/local-date-time";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { parseItemDuration, type RunSheet } from "@/lib/music/event-timing";
import { formatMinutesSeconds } from "@/lib/music/format";
import { cn } from "@/lib/music/utils";

// The parts of the run sheet of an event (see `event-timing.ts`): the time
// field of an item, its planned start, and the total time under the items.

const TIME_OF_DAY: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** The planned start of an item, a time of day in the viewer's time zone, e.g. "10:05". */
export function PlannedStart({ start, className }: { start: number; className?: string }) {
  const { m } = useI18n();

  return (
    <span className={cn("text-sm whitespace-nowrap text-muted tabular-nums", className)}>
      <span className="sr-only">{m.events.runSheet.startPrefix}</span>
      <LocalDateTime date={new Date(start).toISOString()} options={TIME_OF_DAY} />
    </span>
  );
}

/** The planned time of an item, read-only, e.g. "4:05". */
export function PlannedDuration({ seconds, className }: { seconds: number; className?: string }) {
  const { m } = useI18n();

  return (
    <span className={cn("text-sm text-muted tabular-nums", className)}>
      <span className="sr-only">{m.events.runSheet.durationPrefix}</span>
      {formatMinutesSeconds(seconds)}
    </span>
  );
}

/**
 * The time field of an item: whole minutes ("5") or minutes and seconds
 * ("4:05"). Empty: no time of its own, e.g. a song then takes the duration of
 * its arrangement (`fallback`), which is the placeholder. A text that is not
 * a time stays in the field, marked, and does not change the item. On blur
 * the field shows the time of the item again.
 */
export function DurationInput({
  value,
  fallback,
  label,
  hint,
  onChange,
  autoFocus,
  onFocus,
  onBlur,
}: {
  /** The time of the item in seconds. Null: none. */
  value: number | null;
  /** The time without a value of its own, e.g. the duration of the arrangement of a song. */
  fallback: number | null;
  label: string;
  /** The tooltip in place of the hint of an item, e.g. for a block. */
  hint?: string;
  onChange: (seconds: number | null) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
  /** After the field shows the time of the item again. */
  onBlur?: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.events.runSheet;
  const [text, setText] = useState(() => toText(value));
  // A new value from outside, e.g. a change of another user, replaces the text, unless the text already means it.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (parseItemDuration(text) !== value) setText(toText(value));
  }
  const invalid = parseItemDuration(text) === undefined;

  return (
    <Input
      aria-label={label}
      title={
        invalid
          ? t.durationInvalid
          : (hint ??
            (fallback === null
              ? t.durationHint
              : format(t.durationHintSong, { duration: formatMinutesSeconds(fallback) })))
      }
      aria-invalid={invalid || undefined}
      placeholder={fallback === null ? t.durationPlaceholder : formatMinutesSeconds(fallback)}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const seconds = parseItemDuration(next);
        if (seconds !== undefined && seconds !== value) onChange(seconds);
      }}
      autoFocus={autoFocus}
      onFocus={onFocus}
      onBlur={() => {
        setText(toText(value));
        onBlur?.();
      }}
      className="w-18 shrink-0 text-right tabular-nums"
    />
  );
}

function toText(seconds: number | null): string {
  return seconds === null ? "" : formatMinutesSeconds(seconds);
}

/**
 * Under the items: the total time and the planned end, the number of items
 * without a time, and a warning when the items take longer than the event.
 * Without any time: the empty state, for event admins how to start.
 */
export function RunSheetSummary({
  sheet,
  startsAt,
  durationMinutes,
  admin,
}: {
  sheet: RunSheet;
  startsAt: string;
  /** The duration of the event. */
  durationMinutes: number;
  /** An event admin: no empty state (the time fields show), and the warning tells how to fix it. */
  admin: boolean;
}) {
  const i18n = useI18n();
  const { m, format, plural } = i18n;
  const t = m.events.runSheet;

  // An event admin sees the time field of each item: no text.
  if (sheet.totalSeconds === 0) {
    return admin ? null : <p className="text-sm text-muted">{t.empty}</p>;
  }

  const minutes = (seconds: number) => i18n.duration(Math.max(1, Math.round(seconds / 60)));
  const end = Date.parse(startsAt) + sheet.totalSeconds * 1000;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {rich(format(t.summary, { duration: minutes(sheet.totalSeconds) }), {
          end: () => (
            <span className="font-medium text-text tabular-nums">
              <LocalDateTime date={new Date(end).toISOString()} options={TIME_OF_DAY} />
            </span>
          ),
        })}
        {sheet.unknown > 0 && <> {plural(t.unknown, sheet.unknown)}</>}
      </p>
      {sheet.totalSeconds > durationMinutes * 60 && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {/* Rounded up, so the total never shows as the duration of the event. */}
          <span>
            {format(t.tooLong, {
              total: i18n.duration(Math.ceil(sheet.totalSeconds / 60)),
              event: i18n.duration(durationMinutes),
            })}
            {admin && <> {t.tooLongAdvice}</>}
          </span>
        </p>
      )}
    </div>
  );
}
