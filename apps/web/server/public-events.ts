import { cache } from "react";
import { headers } from "next/headers";
import type { Ctx, Event, Location } from "@churchy/contracts";
import {
  dayWindow,
  expandEvents,
  formatInstant,
  MAX_WINDOW_DAYS,
  type ExpandWindow,
  type Occurrence,
} from "@churchy/events";
import { getPublicCtx as publicSiteCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Data for the public events pages and `.ics` feeds (D-15). Everything goes through the
 * repository interfaces with an anonymous tenant ctx, so only `public` + `published` events are
 * ever read; recurrence is expanded at read time by `@churchy/events` (SDD §10).
 */

export type PublicOccurrence = Occurrence<Event>;

/** Anonymous ctx of the church whose public site is shown (memoized per request). */
const getPublicCtx = cache((): Promise<Ctx> => publicSiteCtx());

export const getPublicTenantName = cache(async (): Promise<string> => {
  const repos = await getRequestRepositories();
  return (await repos.tenants.current(await getPublicCtx()))?.name ?? "";
});

export const getPublicLocations = cache(async (): Promise<Map<string, Location>> => {
  const repos = await getRequestRepositories();
  const list = await repos.locations.list(await getPublicCtx());
  return new Map(list.map((l) => [l.id, l]));
});

/** Public events (masters, override children, single events) that may touch the window. */
export async function listPublicEvents(window: ExpandWindow): Promise<Event[]> {
  const repos = await getRequestRepositories();
  return repos.events.listPublic(await getPublicCtx(), window);
}

/** Occurrences of the public events in the window, sorted by start. */
export async function publicOccurrences(window: ExpandWindow): Promise<PublicOccurrence[]> {
  return expandEvents(await listPublicEvents(window), window);
}

/** Occurrences between two Budapest dates (inclusive). */
export async function publicOccurrencesBetween(
  from: string,
  to: string,
): Promise<PublicOccurrence[]> {
  return publicOccurrences(dayWindow(from, to));
}

/** The window the detail page and the `.ics` files look at: one day back, ~13 months ahead. */
export function aheadWindow(now: Date): ExpandWindow {
  const from = now.getTime() - 86_400_000;
  return {
    from: formatInstant(from),
    to: formatInstant(from + MAX_WINDOW_DAYS * 86_400_000),
  };
}

export interface PublicEventFamily {
  /** The event addressed by the slug (a master, a single event or an override child). */
  event: Event;
  /** Its series: the master plus its override children (or just the event). */
  members: Event[];
  /** The master of the series (the event itself when it has none). */
  master: Event;
}

/** A public event by slug, with the rest of its series. */
export async function getPublicEventFamily(
  slug: string,
  now: Date,
): Promise<PublicEventFamily | null> {
  const repos = await getRequestRepositories();
  const ctx = await getPublicCtx();
  const event = await repos.events.getPublicBySlug(ctx, slug);
  if (event === null) return null;
  const seriesId = event.parentEventId ?? event.id;
  const listed = await repos.events.listPublic(ctx, aheadWindow(now));
  const members = listed.filter((e) => e.id === seriesId || e.parentEventId === seriesId);
  const master =
    members.find((e) => e.id === seriesId) ??
    (event.parentEventId === null ? event : await repos.events.get(ctx, seriesId)) ??
    event;
  if (!members.some((e) => e.id === master.id)) members.unshift(master);
  if (!members.some((e) => e.id === event.id)) members.push(event);
  return { event, members, master };
}

/** `https://host` of the current request, for absolute URLs in feeds and structured data. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
