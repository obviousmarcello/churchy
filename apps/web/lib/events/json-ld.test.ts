import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Event, Location } from "@churchy/contracts";
import { dayWindow, expandEvents } from "@churchy/events";
import { eventJsonLd, jsonLdScript } from "./json-ld";
import {
  eventIcsPath,
  eventPath,
  eventUid,
  locationLine,
  locationPath,
  mapUrl,
  toIcsEvent,
} from "./public-event";

/**
 * D-15 AC4: the `Event` structured data is valid — the schema.org types and the properties
 * Google's Event rich result requires (name, startDate, location with address) or recommends
 * (endDate, eventStatus, eventAttendanceMode, organizer, description), with ISO-8601 dates.
 */
const IsoDateTimeWithOffset = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SchemaUrl = (name: string) => z.literal(`https://schema.org/${name}`);

const PlaceSchema = z.object({
  "@type": z.literal("Place"),
  name: z.string().min(1),
  address: z
    .object({
      "@type": z.literal("PostalAddress"),
      streetAddress: z.string().min(1),
      addressLocality: z.string().min(1),
      postalCode: z.string().regex(/^\d{4}$/),
      addressCountry: z.literal("HU"),
    })
    .strict()
    .optional(),
  geo: z
    .object({ "@type": z.literal("GeoCoordinates"), latitude: z.number(), longitude: z.number() })
    .strict()
    .optional(),
});

const EventJsonLdSchema = z
  .object({
    "@context": z.literal("https://schema.org"),
    "@type": z.literal("Event"),
    name: z.string().min(1),
    startDate: z.union([IsoDateTimeWithOffset, IsoDate]),
    endDate: z.union([IsoDateTimeWithOffset, IsoDate]),
    eventStatus: z.union([
      SchemaUrl("EventScheduled"),
      SchemaUrl("EventCancelled"),
      SchemaUrl("EventRescheduled"),
    ]),
    eventAttendanceMode: SchemaUrl("OfflineEventAttendanceMode"),
    location: PlaceSchema,
    organizer: z.object({
      "@type": z.literal("Organization"),
      name: z.string().min(1),
      url: z.url(),
    }),
    url: z.url(),
    inLanguage: z.literal("hu-HU"),
    description: z.string().min(1).optional(),
    previousStartDate: IsoDateTimeWithOffset.optional(),
  })
  .strict()
  .refine((d) => d.endDate >= d.startDate, { message: "endDate before startDate" });

const stamp = "2026-10-01T10:00:00+02:00";
function event(overrides: Partial<Event>): Event {
  return {
    id: "ev-1",
    tenantId: "t-1",
    calendarId: "cal-1",
    visibility: "public",
    slug: "ifjusagi-est",
    title: "Ifjúsági est",
    body: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Játék és ima." }] }],
    },
    startsAt: "2026-11-06T19:00:00+01:00",
    endsAt: "2026-11-06T21:00:00+01:00",
    allDay: false,
    rrule: null,
    exdates: [],
    parentEventId: null,
    recurrenceId: null,
    locationId: "loc-1",
    groupId: null,
    teamId: null,
    category: "Ifjúság",
    coverMediaId: null,
    status: "published",
    createdBy: null,
    externalRef: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

const location: Location = {
  id: "loc-1",
  tenantId: "t-1",
  name: "Szent Tivadar-templom",
  slug: "szent-tivadar-templom",
  kind: "templom",
  address: { postalCode: "1011", city: "Budapest", line1: "Fő utca 1.", line2: null },
  geo: { lat: 47.5, lng: 19.04 },
  openingHours: { weekly: [], exceptions: [] },
  accessibility: {
    wheelchair: true,
    accessibleToilet: false,
    hearingLoop: false,
    parking: false,
    note: null,
  },
  photoMediaId: null,
  sort: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

const origin = "https://szent-tivadar.churchy.hu";
const occurrencesOf = (events: Event[]) =>
  expandEvents(events, dayWindow("2026-11-01", "2026-12-31"));

describe("eventJsonLd", () => {
  it("is a valid schema.org Event for a timed occurrence with a location", () => {
    const [occ] = occurrencesOf([event({ rrule: "FREQ=MONTHLY;BYDAY=1FR" })]).slice(1);
    const data = eventJsonLd({
      occurrence: occ!,
      location,
      organizerName: "Szent Tivadar Plébánia",
      origin,
      url: `${origin}/esemenyek/ifjusagi-est`,
      description: "Játék és ima.",
    });
    expect(EventJsonLdSchema.parse(data)).toMatchObject({
      startDate: "2026-12-04T19:00:00+01:00",
      endDate: "2026-12-04T21:00:00+01:00",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        name: "Szent Tivadar-templom",
        address: { streetAddress: "Fő utca 1.", addressLocality: "Budapest", postalCode: "1011" },
        geo: { latitude: 47.5, longitude: 19.04 },
      },
    });
  });

  it("uses plain dates for all-day events and the church as place without a location", () => {
    const [occ] = occurrencesOf([
      event({
        allDay: true,
        startsAt: "2026-12-24T00:00:00+01:00",
        endsAt: "2026-12-26T00:00:00+01:00",
        locationId: null,
      }),
    ]);
    const data = eventJsonLd({
      occurrence: occ!,
      location: null,
      organizerName: "Szent Tivadar Plébánia",
      origin,
      url: `${origin}/esemenyek/karacsony`,
      description: null,
    });
    expect(EventJsonLdSchema.parse(data)).toMatchObject({
      startDate: "2026-12-24",
      endDate: "2026-12-25",
      location: { "@type": "Place", name: "Szent Tivadar Plébánia" },
    });
    expect(data).not.toHaveProperty("description");
  });

  it("marks moved and cancelled occurrences", () => {
    const master = event({ id: "m", rrule: "FREQ=MONTHLY;BYDAY=1FR" });
    const moved = event({
      id: "m-1",
      slug: "ifjusagi-est-2026-12-04",
      startsAt: "2026-12-05T19:00:00+01:00",
      endsAt: "2026-12-05T21:00:00+01:00",
      parentEventId: "m",
      recurrenceId: "2026-12-04T19:00:00+01:00",
    });
    const occ = occurrencesOf([master, moved]).find((o) => o.isOverride)!;
    const input = { location, organizerName: "X", origin, url: `${origin}/x`, description: null };
    const data = EventJsonLdSchema.parse(eventJsonLd({ ...input, occurrence: occ }));
    expect(data.eventStatus).toBe("https://schema.org/EventRescheduled");
    expect(data.previousStartDate).toBe("2026-12-04T19:00:00+01:00");
    const cancelled = { ...occ, event: { ...occ.event, status: "cancelled" as const } };
    expect(eventJsonLd({ ...input, occurrence: cancelled }).eventStatus).toBe(
      "https://schema.org/EventCancelled",
    );
  });

  it("serializes safely inside a script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).toBe(
      '{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}',
    );
  });
});

describe("public event mapping", () => {
  it("builds UIDs, paths, location lines and map links", () => {
    const e = event({});
    expect(eventUid(e)).toBe("t-1.ev-1@churchy.hu");
    expect(eventPath(e)).toBe("/esemenyek/ifjusagi-est");
    expect(eventIcsPath(e)).toBe("/esemenyek/ifjusagi-est/naptar.ics");
    expect(locationLine(location)).toBe("Szent Tivadar-templom, 1011 Budapest, Fő utca 1.");
    expect(locationLine({ ...location, address: null })).toBe("Szent Tivadar-templom");
    expect(locationLine(null)).toBeNull();
    expect(mapUrl(location)).toBe(
      "https://www.openstreetmap.org/?mlat=47.5&mlon=19.04#map=17/47.5/19.04",
    );
    expect(mapUrl({ ...location, geo: null })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=1011+Budapest%2C+F%C5%91+utca+1.",
    );
    expect(mapUrl({ ...location, geo: null, address: null })).toBeNull();
    expect(locationPath(location)).toBe("/templomaink/szent-tivadar-templom");
  });

  it("maps a master with its overrides to an iCalendar event", () => {
    const master = event({ id: "m", rrule: "FREQ=MONTHLY;BYDAY=1FR", exdates: ["2027-01-01"] });
    const child = event({ id: "c", parentEventId: "m", recurrenceId: "2026-12-04T19:00:00+01:00" });
    expect(toIcsEvent(master, { origin, location, members: [master, child] })).toMatchObject({
      uid: "t-1.m@churchy.hu",
      rrule: "FREQ=MONTHLY;BYDAY=1FR",
      exdates: ["2027-01-01"],
      replacedStarts: ["2026-12-04T19:00:00+01:00"],
      summary: "Ifjúsági est",
      description: "Játék és ima.",
      location: "Szent Tivadar-templom, 1011 Budapest, Fő utca 1.",
      geo: { lat: 47.5, lng: 19.04 },
      url: `${origin}/esemenyek/ifjusagi-est`,
      categories: ["Ifjúság"],
      status: "CONFIRMED",
    });
    const bare = toIcsEvent(event({ body: null, category: null, status: "cancelled" }), {
      origin,
      location: undefined,
      members: [],
    });
    expect(bare).toMatchObject({
      description: null,
      location: null,
      geo: null,
      categories: [],
      status: "CANCELLED",
    });
  });
});
