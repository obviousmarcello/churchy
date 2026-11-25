// Splits events into upcoming and past. The server uses it for fresh data,
// and the browser again for its copy, which can be days old.

type Timed = { startsAt: string; endsAt: string };

/**
 * Upcoming: not ended yet, the earliest first, with `hasStarted` for the
 * events that run now. Past: ended, the latest first.
 */
export function splitEventsByTime<Event extends Timed>(
  events: Event[],
  now: number,
): { upcoming: (Event & { hasStarted: boolean })[]; past: Event[] } {
  const byStart = events.toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcoming = withHasStarted(
    byStart.filter((event) => Date.parse(event.endsAt) > now),
    now,
  );
  const past = byStart.filter((event) => Date.parse(event.endsAt) <= now).toReversed();
  return { upcoming, past };
}

/** Adds `hasStarted` to events that have not ended yet, e.g. the result of a query that sorts and filters them. */
export function withHasStarted<Event extends Timed>(
  events: Event[],
  now: number,
): (Event & { hasStarted: boolean })[] {
  return events.map((event) => ({ ...event, hasStarted: Date.parse(event.startsAt) <= now }));
}

/**
 * The start of a copy of an event: the same weekday and time of day one week
 * later, or a later week if that is not after `now`. In the time zone of the
 * runtime (the browser), so a change to summer time keeps the time of day.
 */
export function nextWeekStart(startsAt: string, now: number): string {
  const date = new Date(startsAt);
  do {
    date.setDate(date.getDate() + 7);
  } while (date.getTime() <= now);
  return date.toISOString();
}
