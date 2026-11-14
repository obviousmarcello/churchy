import { getTranslations } from "next-intl/server";
import { buildICalendar } from "@churchy/events";
import { LOCALE } from "@/i18n/request";
import { icsHeaders, toIcsEvent } from "@/lib/events/public-event";
import {
  getPublicEventFamily,
  getPublicLocations,
  getPublicTenantName,
  requestOrigin,
} from "@/server/public-events";

export const dynamic = "force-dynamic";

/**
 * `/esemenyek/<slug>/naptar.ics` — one public event as an iCalendar file (D-15): a single event,
 * an override child, or a series with its `RRULE`, `EXDATE`s and moved occurrences. No cookies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventSlug: string }> },
): Promise<Response> {
  const { eventSlug } = await params;
  const family = await getPublicEventFamily(decodeURIComponent(eventSlug), new Date());
  if (family === null) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const [locations, church, origin, t] = await Promise.all([
    getPublicLocations(),
    getPublicTenantName(),
    requestOrigin(),
    getTranslations({ locale: LOCALE, namespace: "public.events" }),
  ]);
  const { event, master, members } = family;
  // A series page exports the master with its moved occurrences; an override child only itself.
  const exported = event.id === master.id ? members : [event];
  const body = buildICalendar({
    name: t("icsCalendarName", { church }),
    events: exported.map((e) =>
      toIcsEvent(e, {
        origin,
        location: e.locationId ? locations.get(e.locationId) : undefined,
        members,
      }),
    ),
  });
  return new Response(body, { headers: icsHeaders(`${event.slug}.ics`, "attachment") });
}
