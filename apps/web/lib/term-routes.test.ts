import { describe, expect, it } from "vitest";
import { termsForDenomination } from "@/i18n/terms";
import {
  TERM_ROUTES,
  isTermRouteCandidate,
  isTermRouteKey,
  termRoutePath,
  termRouteTarget,
} from "./term-routes";

describe("term routes", () => {
  const rk = termsForDenomination("rk");
  const ref = termsForDenomination("ref");

  it("uses the denomination's slug as the public path", () => {
    expect(termRoutePath(rk, "serviceSchedule")).toBe("/miserend");
    expect(termRoutePath(ref, "serviceSchedule")).toBe("/istentiszteleti-rend");
  });

  it("rewrites exactly the tenant's slug to the internal page", () => {
    expect(termRouteTarget("/miserend", rk)).toEqual({
      key: "serviceSchedule",
      target: TERM_ROUTES.serviceSchedule,
    });
    expect(termRouteTarget("/istentiszteleti-rend", ref)?.target).toBe(TERM_ROUTES.serviceSchedule);
    // Another denomination's slug is not this tenant's route.
    expect(termRouteTarget("/istentiszteleti-rend", rk)).toBeNull();
    expect(termRouteTarget("/miserend", ref)).toBeNull();
    for (const path of ["/", "/miserend/", "/miserend/x", "/Miserend", "/term/service-schedule"]) {
      expect(termRouteTarget(path, rk), path).toBeNull();
    }
  });

  it("routes the announcements section term (D-14)", () => {
    for (const terms of [rk, ref, termsForDenomination("bapt")]) {
      expect(termRoutePath(terms, "announcementsSection")).toBe("/hirdetesek");
      expect(termRouteTarget("/hirdetesek", terms)).toEqual({
        key: "announcementsSection",
        target: TERM_ROUTES.announcementsSection,
      });
    }
    expect(termRouteTarget("/hirdetesek/archivum", rk)).toBeNull();
    expect(termRouteTarget("/term/announcements", rk)).toBeNull();
  });

  it("follows a church's own term override", () => {
    const custom = {
      term: (key: string) => (key === "serviceSchedule" ? { slug: "alkalmaink" } : rk.term(key)),
    };
    expect(termRouteTarget("/alkalmaink", custom)?.key).toBe("serviceSchedule");
    expect(termRouteTarget("/miserend", custom)).toBeNull();
  });

  it("only single-segment slug paths are candidates (the proxy skips the lookup otherwise)", () => {
    for (const path of ["/miserend", "/istentiszteleti-rend", "/alkalmaink", "/a1"]) {
      expect(isTermRouteCandidate(path), path).toBe(true);
    }
    for (const path of ["/", "/miserend/", "/admin/rend", "/Miserend", "/-x", "/a--b", "/a.png"]) {
      expect(isTermRouteCandidate(path), path).toBe(false);
    }
  });

  it("recognises term route keys", () => {
    expect(isTermRouteKey("serviceSchedule")).toBe(true);
    for (const value of [null, "", "toString", "x"]) expect(isTermRouteKey(value)).toBe(false);
  });
});
