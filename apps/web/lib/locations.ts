import type { Address, GeoPoint, Location, OpeningHours } from "@churchy/contracts";
import { formatAddress, type Address as HuAddress } from "@churchy/hu";

/**
 * Links and structured data for location pages (D-12, SDD §7.5, §15). Plain URLs only: nothing
 * here loads a third-party script or makes a request; the visitor's browser goes to the map
 * provider only when they follow a link or click the map facade.
 */

/**
 * A stored address (`line1` already holds street and house number, `Fő utca 1.`) in the shape the
 * `@churchy/hu` formatter and `<Address>` take: `1011 Budapest, Fő utca 1.`
 */
export function toHuAddress(address: Address): HuAddress {
  return {
    postalCode: address.postalCode,
    city: address.city,
    street: address.line1,
    ...(address.line2 ? { details: address.line2 } : {}),
  };
}

/**
 * Path of the location pages. Fixed by the SDD §6 URL map (`/templomaink/<slug>`); only the page
 * title follows the `locationsSection` term.
 */
export const LOCATIONS_PATH = "/templomaink";

/** The OpenStreetMap host the map facade embeds after the click (and nothing before it). */
export const OSM_EMBED_ORIGIN = "https://www.openstreetmap.org";

/**
 * Route-planning deep link. The Google Maps "directions" URL opens the maps app on phones (Android
 * and iOS) and the website elsewhere; coordinates are preferred, the address is the fallback.
 */
export function routePlanningUrl(place: {
  geo: GeoPoint | null;
  address: Address | null;
}): string | null {
  const destination = place.geo
    ? `${place.geo.lat},${place.geo.lng}`
    : place.address
      ? formatAddress(toHuAddress(place.address))
      : null;
  if (destination === null) return null;
  const params = new URLSearchParams({ api: "1", destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A link to the place on openstreetmap.org (no embed). */
export function osmPlaceUrl(geo: GeoPoint, zoom = 17): string {
  return `${OSM_EMBED_ORIGIN}/?mlat=${geo.lat}&mlon=${geo.lng}#map=${zoom}/${geo.lat}/${geo.lng}`;
}

/** The OpenStreetMap embed URL with a marker, around ±`span` degrees (≈ 400 m). */
export function osmEmbedUrl(geo: GeoPoint, span = 0.004): string {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const bbox = [geo.lng - span, geo.lat - span / 2, geo.lng + span, geo.lat + span / 2]
    .map(round)
    .join(",");
  const params = new URLSearchParams({ bbox, layer: "mapnik", marker: `${geo.lat},${geo.lng}` });
  return `${OSM_EMBED_ORIGIN}/export/embed.html?${params.toString()}`;
}

const SCHEMA_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** schema.org `OpeningHoursSpecification` list: regular hours, then the exceptions. */
export function openingHoursSpecification(hours: OpeningHours): Record<string, unknown>[] {
  const regular = hours.weekly.map((h) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.weekday - 1]}`,
    opens: h.from,
    closes: h.to,
  }));
  const exceptions = hours.exceptions.flatMap((e) =>
    e.closed
      ? [
          {
            "@type": "OpeningHoursSpecification",
            validFrom: e.from,
            validThrough: e.to,
            opens: "00:00",
            closes: "00:00",
          },
        ]
      : (e.hours ?? []).map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.weekday - 1]}`,
          validFrom: e.from,
          validThrough: e.to,
          opens: h.from,
          closes: h.to,
        })),
  );
  return [...regular, ...exceptions];
}

/** schema.org `PlaceOfWorship` (SDD §15) for a location page. */
export function locationJsonLd(location: Location, url: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": location.kind === "egyeb" ? "PlaceOfWorship" : "Church",
    name: location.name,
    url,
    ...(location.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: [location.address.line1, location.address.line2]
              .filter(Boolean)
              .join(", "),
            postalCode: location.address.postalCode,
            addressLocality: location.address.city,
            addressCountry: "HU",
          },
        }
      : {}),
    ...(location.geo
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: location.geo.lat,
            longitude: location.geo.lng,
          },
        }
      : {}),
    ...(location.openingHours.weekly.length > 0 || location.openingHours.exceptions.length > 0
      ? { openingHoursSpecification: openingHoursSpecification(location.openingHours) }
      : {}),
    isAccessibleForFree: true,
  };
}

/** JSON for an inline `<script type="application/ld+json">`; `<` is escaped so it cannot end the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
