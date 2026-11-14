/**
 * Relative time for the demo seed. Everything is derived from one injected `now` and evaluated
 * in Europe/Budapest, so the demo always looks current (SDD §4.4, D-91 AC2) and never depends
 * on the process time zone.
 */
import { addDays, budapestWallClock, startOfIsoWeek, todayInBudapest } from "@churchy/hu";

export type IsoDate = string;
export type IsoTime = string;
export type IsoDateTime = string;

const pad = (n: number): string => String(n).padStart(2, "0");

/** UTC offset of Europe/Budapest (minutes) at an instant. */
function offsetMinutesAt(utcMs: number): number {
  const w = budapestWallClock(new Date(utcMs));
  return (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - utcMs) / 60_000;
}

/** Local Europe/Budapest wall-clock date + time → ISO-8601 instant with the correct offset. */
export function localToIso(date: IsoDate, time: IsoTime): IsoDateTime {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle the hours around the DST switches.
  const first = naive - offsetMinutesAt(naive) * 60_000;
  const offset = offsetMinutesAt(first);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${date}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Adds minutes to a local wall-clock time on a date and returns the resulting instant. */
export function localPlusMinutes(date: IsoDate, time: IsoTime, minutes: number): IsoDateTime {
  const start = Date.parse(localToIso(date, time));
  const end = new Date(start + minutes * 60_000);
  const w = budapestWallClock(end);
  return localToIso(`${w.year}-${pad(w.month)}-${pad(w.day)}`, `${pad(w.hour)}:${pad(w.minute)}`);
}

/** An instant shifted by whole minutes, re-expressed with the Budapest offset. */
export function plusMinutesIso(instant: IsoDateTime, minutes: number): IsoDateTime {
  const w = budapestWallClock(new Date(Date.parse(instant) + minutes * 60_000));
  return localToIso(`${w.year}-${pad(w.month)}-${pad(w.day)}`, `${pad(w.hour)}:${pad(w.minute)}`);
}

export interface Clock {
  readonly now: Date;
  /** Budapest civil date of `now`. */
  readonly today: IsoDate;
  /** `now` as an ISO instant with the Budapest offset (minute precision). */
  readonly nowIso: IsoDateTime;
  /** Monday of the current week. */
  readonly monday: IsoDate;
  /** The coming Sunday; today when today is Sunday. */
  readonly sunday: IsoDate;
  /** Civil date `n` days from today. */
  day(n: number): IsoDate;
  /** Weekday (1 = Monday … 7 = Sunday) of the current week, shifted by `weekOffset` weeks. */
  weekday(weekday: number, weekOffset?: number): IsoDate;
  /** Sunday `k` weeks after the coming Sunday. */
  sundayPlus(k: number): IsoDate;
  /** Local date + time → instant. */
  at(date: IsoDate, time?: IsoTime): IsoDateTime;
  /** Instant `days` days ago at `time` (a past "created at"). */
  ago(days: number, time?: IsoTime): IsoDateTime;
  /** Instant `days` days from today at `time`. */
  ahead(days: number, time?: IsoTime): IsoDateTime;
  /** Civil date of the instant. */
  dateOf(instant: IsoDateTime): IsoDate;
}

export function createClock(now: Date): Clock {
  const today = todayInBudapest(now);
  const w = budapestWallClock(now);
  const nowIso = localToIso(today, `${pad(w.hour)}:${pad(w.minute)}`);
  const monday = startOfIsoWeek(today);
  const sunday = addDays(monday, 6) >= today ? addDays(monday, 6) : addDays(monday, 13);
  const day = (n: number): IsoDate => addDays(today, n);
  return {
    now,
    today,
    nowIso,
    monday,
    sunday,
    day,
    weekday: (wd, weekOffset = 0) => addDays(monday, wd - 1 + 7 * weekOffset),
    sundayPlus: (k) => addDays(sunday, 7 * k),
    at: (date, time = "12:00") => localToIso(date, time),
    ago: (days, time = "09:00") => localToIso(day(-days), time),
    ahead: (days, time = "09:00") => localToIso(day(days), time),
    dateOf: (instant) => todayInBudapest(new Date(instant)),
  };
}
