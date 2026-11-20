import { getTranslations } from "next-intl/server";
import { buildICalendar, dayWindow, expandEvents } from "@churchy/events";
import { addDays, todayInBudapest } from "@churchy/hu";
import { LOCALE } from "@/i18n/request";
import { icsHeaders, toIcsEvent } from "@/lib/events/public-event";
import {
  getPublicLocations,
  getPublicTenantName,
  listPublicEvents,
  requestOrigin,
} from "@/server/public-events";

export const dynamic = "force-dynamic";

/** Days back and ahead the feed covers (within the 400-day expansion limit, SDD §10). */
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;

/**
 * `/esemenyek.ics` — the church's public events as an iCalendar subscription feed (D-15, SDD §10).
 * The same expansion as the pages decides which series and events are in it. Public hosts set no
 * cookies: the response carries none, and the proxy skips `.ics` paths.
 */
export async function GET(): Promise<Response> {
  const today = todayInBudapest(new Date());
  const window = dayWindow(addDays(today, -PAST_DAYS), addDays(today, FUTURE_DAYS));
  const [events, locations, church, origin, t] = await Promise.all([
    listPublicEvents(window),
    getPublicLocations(),
    getPublicTenantName(),
    requestOrigin(),
    getTranslations({ locale: LOCALE, namespace: "public.events" }),
  ]);
  const shown = new Set(expandEvents(events, window).map((o) => o.event.id));
  const body = buildICalendar({
    name: t("icsCalendarName", { church }),
    description: t("icsCalendarDescription", { church }),
    events: events
      .filter((e) => shown.has(e.id))
      .map((e) =>
        toIcsEvent(e, {
          origin,
          location: e.locationId ? locations.get(e.locationId) : undefined,
          members: events,
        }),
      ),
  });
  return new Response(body, { headers: icsHeaders("esemenyek.ics", "inline") });
}
