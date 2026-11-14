import { describe, expect, it } from "vitest";
import type { Location } from "@churchy/contracts";
import {
  jsonLdScript,
  locationJsonLd,
  osmEmbedUrl,
  osmPlaceUrl,
  routePlanningUrl,
  toHuAddress,
} from "./locations";
import { formatAddress } from "@churchy/hu";

const geo = { lat: 47.6521, lng: 19.0612 };
const address = { postalCode: "2999", city: "Dunaliget", line1: "Templom tér 3.", line2: null };

const location: Location = {
  id: "loc-1",
  tenantId: "t-1",
  name: "Szent Tivadar-templom",
  slug: "szent-tivadar-templom",
  kind: "templom",
  address,
  geo,
  openingHours: {
    weekly: [{ weekday: 7, from: "07:30", to: "19:00" }],
    exceptions: [
      { from: "2026-12-24", to: "2026-12-26", closed: true, note: null },
      {
        from: "2027-01-02",
        to: "2027-01-03",
        closed: false,
        hours: [{ weekday: 6, from: "10:00", to: "12:00" }],
        note: null,
      },
    ],
  },
  accessibility: {
    wheelchair: true,
    accessibleToilet: false,
    hearingLoop: false,
    parking: true,
    note: null,
  },
  photoMediaId: null,
  sort: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("location links", () => {
  it("formats stored addresses in Hungarian order", () => {
    expect(formatAddress(toHuAddress(address))).toBe("2999 Dunaliget, Templom tér 3.");
    expect(formatAddress(toHuAddress({ ...address, line2: "Kertváros" }))).toBe(
      "2999 Dunaliget, Templom tér 3. Kertváros",
    );
  });

  it("builds a route-planning deep link from coordinates, else from the address", () => {
    expect(routePlanningUrl({ geo, address })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=47.6521%2C19.0612",
    );
    expect(routePlanningUrl({ geo: null, address })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=2999+Dunaliget%2C+Templom+t%C3%A9r+3.",
    );
    expect(routePlanningUrl({ geo: null, address: null })).toBeNull();
  });

  it("builds OpenStreetMap place and embed URLs", () => {
    expect(osmPlaceUrl(geo)).toBe(
      "https://www.openstreetmap.org/?mlat=47.6521&mlon=19.0612#map=17/47.6521/19.0612",
    );
    const embed = new URL(osmEmbedUrl(geo));
    expect(embed.origin + embed.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(embed.searchParams.get("bbox")).toBe("19.0572,47.6501,19.0652,47.6541");
    expect(embed.searchParams.get("marker")).toBe("47.6521,19.0612");
  });
});

describe("structured data", () => {
  it("describes the place with address, geo and opening hours (incl. exceptions)", () => {
    const data = locationJsonLd(location, "/templomaink/szent-tivadar-templom");
    expect(data).toMatchObject({
      "@type": "Church",
      name: "Szent Tivadar-templom",
      address: { streetAddress: "Templom tér 3.", postalCode: "2999", addressCountry: "HU" },
      geo: { latitude: 47.6521, longitude: 19.0612 },
    });
    expect(data["openingHoursSpecification"]).toEqual([
      expect.objectContaining({ dayOfWeek: "https://schema.org/Sunday", opens: "07:30" }),
      expect.objectContaining({ validFrom: "2026-12-24", opens: "00:00", closes: "00:00" }),
      expect.objectContaining({
        dayOfWeek: "https://schema.org/Saturday",
        validFrom: "2027-01-02",
      }),
    ]);
    const bare = locationJsonLd(
      {
        ...location,
        kind: "egyeb",
        address: { ...address, line2: "Kertváros" },
        geo: null,
        openingHours: { weekly: [], exceptions: [] },
      },
      "/x",
    );
    expect(bare["@type"]).toBe("PlaceOfWorship");
    expect(bare).not.toHaveProperty("geo");
    expect(bare).not.toHaveProperty("openingHoursSpecification");
    expect(bare).toMatchObject({ address: { streetAddress: "Templom tér 3., Kertváros" } });
    expect(locationJsonLd({ ...location, address: null }, "/x")).not.toHaveProperty("address");
  });

  it("escapes < so the JSON cannot close the script tag", () => {
    expect(jsonLdScript({ name: "</script><b>" })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });
});
