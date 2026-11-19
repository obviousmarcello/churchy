import { budapestWallClock, isoWeekday, toIsoDate, type IsoDate } from "@churchy/hu";

const pad = (n: number): string => String(n).padStart(2, "0");

/** The instant (ISO, UTC) of a Budapest wall-clock date (`YYYY-MM-DD`) and `HH:MM` time. */
export function localToInstant(date: IsoDate, time: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  // Correct the wall time (read as UTC) by the Budapest offset found at the guess; twice for DST.
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    const w = budapestWallClock(new Date(guess));
    guess += wall - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  }
  return new Date(guess).toISOString();
}

/** Budapest civil date, `HH:MM`, minutes after midnight and ISO weekday (1 = Monday) of an instant. */
export function localParts(instant: string | number | Date): {
  date: IsoDate;
  time: string;
  minutes: number;
  weekday: number;
} {
  const w = budapestWallClock(new Date(instant));
  const date = toIsoDate(w);
  return {
    date,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
    minutes: w.hour * 60 + w.minute,
    weekday: isoWeekday(date),
  };
}

/** `HH:MM` → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}
