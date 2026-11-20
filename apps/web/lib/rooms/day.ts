import { localParts, localToInstant, type Occupancy } from "@churchy/booking";

/** Hours shown on the day timeline (Budapest wall-clock). */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 22;

export interface DayBlock {
  readonly occupancy: Occupancy;
  /** Percent of the timeline width, clipped to the visible hours. */
  readonly left: number;
  readonly width: number;
}

/** The occupancies of `roomId` that touch the civil `date`, positioned on the timeline. */
export function dayBlocks(
  occupancies: readonly Occupancy[],
  roomId: string,
  date: string,
): DayBlock[] {
  const dayStart = Date.parse(localToInstant(date, "00:00"));
  const from = dayStart + DAY_START_HOUR * 3_600_000;
  const to = dayStart + DAY_END_HOUR * 3_600_000;
  const span = to - from;
  const out: DayBlock[] = [];
  for (const o of occupancies) {
    if (o.roomId !== roomId) continue;
    // The shown block is the booking itself; buffers only matter for clashes.
    const [start, end] = [Date.parse(o.startsAt), Date.parse(o.endsAt)];
    if (end <= from || start >= to || localParts(start).date > date) continue;
    if (localParts(end - 1).date < date) continue;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    out.push({
      occupancy: o,
      left: ((a - from) / span) * 100,
      width: Math.max(((b - a) / span) * 100, 1),
    });
  }
  return out.sort((x, y) => x.left - y.left);
}

/** Hour tick labels of the timeline (every 3 hours). */
export function dayTicks(): { hour: number; left: number }[] {
  const out: { hour: number; left: number }[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 3) {
    out.push({ hour: h, left: ((h - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100 });
  }
  return out;
}
