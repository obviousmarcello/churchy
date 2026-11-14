import type { Event, Location } from "@churchy/contracts";
import type { Occurrence } from "@churchy/events";
import { huAddress } from "./public-event";

/**
 * schema.org `Event` structured data for the event detail page (D-15 AC4). Dates are the shown
 * occurrence's, in Budapest time with offset (all-day: plain dates). Only public fields are used.
 */
export interface EventJsonLdInput {
  occurrence: Occurrence<Event>;
  location: Location | null | undefined;
  /** Church name (organizer, and the place when the event has no location). */
  organizerName: string;
  /** `https://host` of the public site. */
  origin: string;
  /** Absolute URL of the event page. */
  url: string;
  description: string | null;
}

export function eventJsonLd({
  occurrence,
  location,
  organizerName,
  origin,
  url,
  description,
}: EventJsonLdInput): Record<string, unknown> {
  const { event } = occurrence;
  const address = location ? huAddress(location) : null;
  const place: Record<string, unknown> = {
    "@type": "Place",
    name: location?.name ?? organizerName,
  };
  if (address) {
    place.address = {
      "@type": "PostalAddress",
      streetAddress: [address.street, address.details].filter(Boolean).join(", "),
      addressLocality: address.city,
      postalCode: address.postalCode,
      addressCountry: "HU",
    };
  }
  if (location?.geo) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: location.geo.lat,
      longitude: location.geo.lng,
    };
  }

  const moved =
    occurrence.isOverride &&
    occurrence.recurrenceId !== null &&
    Date.parse(occurrence.recurrenceId) !== occurrence.startMs;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: occurrence.allDay ? occurrence.date : occurrence.start,
    endDate: occurrence.allDay ? occurrence.lastDate : occurrence.end,
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : moved
          ? "https://schema.org/EventRescheduled"
          : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    organizer: { "@type": "Organization", name: organizerName, url: origin },
    url,
    inLanguage: "hu-HU",
  };
  if (moved) data.previousStartDate = occurrence.recurrenceId;
  if (description) data.description = description;
  return data;
}

/** JSON for a `<script type="application/ld+json">`; `<` is escaped so it cannot close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
