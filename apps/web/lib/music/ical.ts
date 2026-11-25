// iCalendar files (RFC 5545) for the calendar feeds: the events that a user
// volunteers for, in the calendar app of the user. No dependencies and no
// server APIs, so the tests run in Node.

export type CalendarEvent = {
  /** Stays the same for the event, so the calendar app updates it in place. */
  uid: string;
  /** ISO 8601 timestamps. */
  start: string;
  end: string;
  title: string;
  description?: string;
  /** An absolute URL. */
  url?: string;
};

/** The calendar as the text of an `.ics` file. `now` is the time of the file, in milliseconds. */
export function buildCalendar({
  name,
  events,
  now,
}: {
  name: string;
  events: CalendarEvent[];
  now: number;
}): string {
  const stamp = formatUtc(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Music Sheet DB//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    // Asks the calendar apps to fetch the file again each hour. Many apps
    // fetch it less often, e.g. Google Calendar about twice a day.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // No SEQUENCE and no LAST-MODIFIED: a feed (METHOD:PUBLISH) is not an
    // invitation, so the calendar apps take each fetch as the current state
    // of its events (RFC 5546). DTSTAMP is the time of the file.
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(Date.parse(event.start))}`,
      `DTEND:${formatUtc(Date.parse(event.end))}`,
      `SUMMARY:${escapeText(event.title)}`,
      ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
      ...(event.url ? [`URL:${removeLineBreaks(event.url)}`] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A time in UTC, e.g. "20261011T083000Z". */
export function formatUtc(time: number): string {
  return new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** A TEXT value: a backslash before `\`, `;` and `,`, and `\n` for a line break. Other control characters go. */
export function escapeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\\;,]/g, (char) => `\\${char}`)
    .replace(/\n/g, "\\n")
    // eslint-disable-next-line no-control-regex -- control characters are what it removes
    .replace(/[\u0000-\u001f\u007f]/g, "");
}

function removeLineBreaks(text: string): string {
  return text.replace(/[\r\n]/g, "");
}

// A line has at most 75 octets. A longer line goes on in lines that start with
// a space. A character with more than one octet in UTF-8 stays in one piece.
const LINE_MAX_OCTETS = 75;

export function foldLine(line: string): string {
  const parts: string[] = [];
  let part = "";
  let octets = 0;
  for (const char of line) {
    const size = utf8Length(char);
    // The space at the start of each later line counts too.
    const max = parts.length === 0 ? LINE_MAX_OCTETS : LINE_MAX_OCTETS - 1;
    if (octets + size > max) {
      parts.push(part);
      part = "";
      octets = 0;
    }
    part += char;
    octets += size;
  }
  parts.push(part);
  return parts.join("\r\n ");
}

function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}
