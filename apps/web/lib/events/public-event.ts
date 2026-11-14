import type { Event, Location } from "@churchy/contracts";
import { richTextPlain, type IcsEvent } from "@churchy/events";
import { formatAddress, type Address } from "@churchy/hu";
import { LOCATIONS_PATH, osmPlaceUrl, routePlanningUrl, toHuAddress } from "@/lib/locations";

/**
 * Shared mapping of public events for the `.ics` routes, structured data and the pages (D-15):
 * one place decides what a public event exposes.
 */

/** Stable, globally unique iCalendar UID (never changes with the host). */
export const eventUid = (event: Pick<Event, "id" | "tenantId">): string =>
  `${event.tenantId}.${event.id}@churchy.hu`;

/** Contract address → `@churchy/hu` address parts. */
export function huAddress(location: Location): Address | null {
  return location.address === null ? null : toHuAddress(location.address);
}

/** „Szent Tivadar-templom, 1011 Budapest, Fő utca 1.” */
export function locationLine(location: Location | null | undefined): string | null {
  if (!location) return null;
  const address = huAddress(location);
  return address ? `${location.name}, ${formatAddress(address)}` : location.name;
}

/** Map link of a location: its OpenStreetMap place, or route planning by address. */
export function mapUrl(location: Location): string | null {
  return location.geo ? osmPlaceUrl(location.geo) : routePlanningUrl(location);
}

/** The location's own page (D-12). */
export const locationPath = (location: Pick<Location, "slug">): string =>
  `${LOCATIONS_PATH}/${encodeURIComponent(location.slug)}`;

export const eventPath = (event: Pick<Event, "slug">): string =>
  `/esemenyek/${encodeURIComponent(event.slug)}`;

export const eventIcsPath = (event: Pick<Event, "slug">): string =>
  `${eventPath(event)}/naptar.ics`;

/** The iCalendar view of a public event; `members` supplies the overrides of a master. */
export function toIcsEvent(
  event: Event,
  options: {
    origin: string;
    location: Location | null | undefined;
    members: readonly Event[];
  },
): IcsEvent {
  const description = event.body ? richTextPlain(event.body) : "";
  return {
    uid: eventUid(event),
    updatedAt: event.updatedAt,
    createdAt: event.createdAt,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    rrule: event.rrule,
    exdates: event.exdates,
    replacedStarts: options.members
      .filter((m) => m.parentEventId === event.id && m.recurrenceId !== null)
      .map((m) => m.recurrenceId as string),
    summary: event.title,
    description: description === "" ? null : description,
    location: locationLine(options.location),
    geo: options.location?.geo ?? null,
    url: `${options.origin}${eventPath(event)}`,
    categories: event.category ? [event.category] : [],
    status: event.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
  };
}

/** Headers of every `.ics` response: a calendar, cacheable, and never a cookie. */
export function icsHeaders(filename: string, disposition: "inline" | "attachment"): HeadersInit {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `${disposition}; filename="${filename}"`,
    "Cache-Control": "public, max-age=900",
    "X-Content-Type-Options": "nosniff",
  };
}
