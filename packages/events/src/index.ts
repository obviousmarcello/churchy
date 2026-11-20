// @churchy/events — event recurrence (RRULE expansion with exdates and overrides), Hungarian
// recurrence text, iCalendar output and month-view helpers (SDD §10, D-15). Pure TypeScript,
// evaluated in Europe/Budapest; used by both data adapters and the web app. See README.md.
export {
  dayWindow,
  expandEvents,
  MAX_WINDOW_DAYS,
  recurrenceDays,
  upcomingOccurrences,
  type ExpandableEvent,
  type ExpandWindow,
  type Occurrence,
} from "./expand";
export {
  formatRRule,
  parseRRule,
  RecurrenceError,
  tryParseRRule,
  WEEKDAY_CODES,
  type ByDay,
  type Frequency,
  type RecurrenceErrorCode,
  type RecurrenceRule,
  type Until,
  type Weekday,
} from "./rrule";
export { dayOfMonthOn, describeRecurrence, type DescribeOptions } from "./text";
export {
  buildICalendar,
  escapeText,
  foldLine,
  googleCalendarUrl,
  PRODUCT_ID,
  type IcsCalendar,
  type IcsEvent,
} from "./ical";
export { richTextParagraphs, richTextPlain } from "./rich-text";
export {
  addMonths,
  formatYearMonth,
  monthGrid,
  occurrencesByDay,
  parseYearMonth,
  yearMonthOf,
  type MonthGrid,
  type YearMonth,
} from "./month";
export {
  budapestDate,
  formatInstant,
  startOfDay,
  TIME_ZONE,
  type IsoDate,
  type IsoDateTime,
} from "./time";
