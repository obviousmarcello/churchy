# @churchy/events

Pure event logic (SDD §10, deliverable D-15): RRULE expansion with `exdates` and
single-occurrence overrides, Hungarian recurrence text, iCalendar output and month-view
helpers. Never mocked; used by the web app with either data adapter, and later by the
workspace calendar (SDD §22).

## Conventions

- Everything is evaluated in **Europe/Budapest** with an explicit-zone `Intl.DateTimeFormat`;
  the process time zone is never read (`timezone.test.ts` checks four other `TZ` values).
- Instants are ISO strings with an offset (`2026-11-20T18:00:00+01:00`); civil dates are
  `YYYY-MM-DD`. All-day events carry local midnight instants, as in `@churchy/contracts`.
- Runtime dependency: `@churchy/hu` only. `ical.js` is a dev dependency, used as an
  independent RFC 5545 implementation in the round-trip test.

## API

```ts
expandEvents(events, { from, to }); // occurrences overlapping the window (≤ 400 days)
upcomingOccurrences(events, from, n); // the next n
dayWindow("2026-11-01", "2026-11-30"); // whole Budapest days as an instant window
describeRecurrence("FREQ=MONTHLY;BYDAY=1FR", { start, withTime: true, capitalize: true });
// → "Minden hónap első péntekén 18:00-kor"
buildICalendar({ name, events }); // VCALENDAR with VTIMEZONE Europe/Budapest
googleCalendarUrl(event);
monthGrid({ year, month }); // Monday-first weeks
occurrencesByDay(occurrences, first, last);
parseRRule / formatRRule / tryParseRRule;
richTextPlain(doc); // Tiptap JSON → plain text (never HTML)
```

## Recurrence semantics

- Supported RRULE parts: `FREQ` (DAILY, WEEKLY, MONTHLY, YEARLY), `INTERVAL`, `COUNT`,
  `UNTIL` (date, UTC or floating local), `BYDAY` (ordinals with MONTHLY/YEARLY), `BYMONTHDAY`,
  `BYMONTH`, `BYSETPOS`, `WKST`. Anything else is rejected by `parseRRule()`; the expansion
  then shows the event once instead of guessing.
- `startsAt` is always the first occurrence (RFC 5545), and `COUNT` counts occurrences before
  `exdates` and overrides remove them.
- Occurrences keep the wall-clock time across DST changes. A time skipped in spring is moved
  forward by the gap (02:30 → 03:30 CEST); an ambiguous autumn time is the first one (CEST).
- Timed occurrences keep the exact duration of the master; all-day ones keep its day count.
- Override children (`parentEventId` + `recurrenceId`) replace the occurrence starting at
  `recurrenceId`; a `cancelled` child only removes it.

## Hungarian text

Implemented in-house (no inflection of user text; numbers get digit + suffix, e.g. `15-én`,
`1-jén`). Rules without a precise wording return `null` and the UI shows a generic label.
See `text.test.ts` for the full list of patterns.

## iCalendar

Masters keep their `RRULE` (with `UNTIL` normalized to UTC, or DATE for all-day events) and get
an `EXDATE` for each exdate **and** for each occurrence replaced by an override child. Override
children are separate `VEVENT`s, which imports the same way into Google, Apple and Outlook.
Lines are folded at 75 octets without splitting UTF-8 characters; text is escaped per
RFC 5545 §3.3.11.

Known difference: ical.js resolves an ambiguous autumn wall time to the _second_ occurrence
(CET); RFC 5545 §3.3.5 and this package use the first (CEST).
