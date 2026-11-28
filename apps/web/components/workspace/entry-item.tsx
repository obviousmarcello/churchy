import Link from "next/link";
import { Badge, FormattedTime } from "@churchy/ui";
import type { CalendarEntry } from "@/lib/workspace/calendar";
import type { EntryLabels } from "./entry-labels";

const PLAN_TONE = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  locked: "info",
} as const;

/** Layer colour used when the entry has none of its own (calendar events carry their calendar's). */
const LAYER_COLOR: Record<CalendarEntry["layer"], string> = {
  events: "var(--c-primary)",
  services: "var(--c-accent)",
  bookings: "var(--c-info)",
  assignments: "var(--c-success)",
  absences: "var(--c-warning)",
  holidays: "var(--c-danger)",
};

function timeText(entry: CalendarEntry, labels: EntryLabels) {
  if (entry.allDay || entry.start === null) {
    return (
      <span className="text-fs-2 text-muted">
        {entry.layer === "absences" ? null : labels.allDay}
      </span>
    );
  }
  return (
    <FormattedTime
      value={entry.start}
      end={entry.end ?? undefined}
      className="text-fs-2 font-semibold whitespace-nowrap text-text"
    />
  );
}

/** Detail line and badges of an entry (what the viewer may see, decided when it was built). */
function Details({ entry, labels }: { entry: CalendarEntry; labels: EntryLabels }) {
  const m = entry.meta;
  switch (m.kind) {
    case "event":
      return (
        <>
          <span className="text-fs-2 text-muted">
            {[m.calendarName, m.location].filter((x) => x !== null && x !== "").join(" · ")}
          </span>
          {m.visibility !== "public" ? <Badge>{labels.visibility[m.visibility]}</Badge> : null}
          {m.status === "draft" ? <Badge tone="warning">{labels.draft}</Badge> : null}
        </>
      );
    case "service":
      return (
        <>
          <span className="text-fs-2 text-muted">
            {[m.location, ...m.teams].filter((x) => x !== null && x !== "").join(" · ")}
          </span>
          {m.cancelled ? <Badge tone="danger">{labels.cancelled}</Badge> : null}
          {m.planStatus !== null ? (
            <Badge tone={PLAN_TONE[m.planStatus]}>{labels.planStatus[m.planStatus]}</Badge>
          ) : null}
        </>
      );
    case "booking":
      return (
        <>
          <span className="text-fs-2 text-muted">{m.room}</span>
          <Badge tone={m.status === "approved" ? "success" : "warning"}>
            {labels.bookingStatus[m.status]}
          </Badge>
        </>
      );
    case "assignment":
      return (
        <>
          <span className="text-fs-2 text-muted">{m.team}</span>
          <Badge tone={m.status === "accepted" ? "success" : "warning"}>
            {labels.assignmentStatus[m.status]}
          </Badge>
        </>
      );
    case "absence":
      return m.detail === null ? null : <Badge>{m.detail}</Badge>;
    case "holiday":
      return m.publicHoliday ? <Badge tone="danger">{labels.publicHoliday}</Badge> : null;
  }
}

/**
 * One calendar entry as a list row: colour dot, time, title, details. The dot colour is
 * decorative — the layer name is always in the row's text (`data-layer`, and the badges).
 */
export function EntryItem({ entry, labels }: { entry: CalendarEntry; labels: EntryLabels }) {
  const title =
    entry.meta.kind === "absence"
      ? [entry.meta.person, labels.absent].filter((x) => x !== "").join(" – ")
      : (entry.title ?? "");
  const body = (
    <>
      <span
        aria-hidden="true"
        className="mt-1.5 size-3 shrink-0 rounded-full"
        style={{ backgroundColor: entry.color ?? LAYER_COLOR[entry.layer] }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {timeText(entry, labels)}
          <span
            className={
              entry.meta.kind === "service" && entry.meta.cancelled
                ? "font-semibold text-muted line-through"
                : "font-semibold"
            }
          >
            {title}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sr-only">{labels.layers[entry.layer]}</span>
          <Details entry={entry} labels={labels} />
        </span>
      </span>
    </>
  );
  const className = "flex min-h-11 items-start gap-3 rounded-control px-3 py-2";
  return (
    <li data-layer={entry.layer} data-testid="calendar-entry">
      {entry.href === null ? (
        <div className={className}>{body}</div>
      ) : (
        <Link
          href={entry.href}
          className={`${className} text-text no-underline hover:bg-primary-soft`}
        >
          {body}
        </Link>
      )}
    </li>
  );
}
