import { describe, expect, it } from "vitest";
import { termsForDenomination } from "@/i18n/terms";
import {
  TERM_ROUTES,
  TERM_SECTION_ROUTES,
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

  it("routes the staff section term (D-16)", () => {
    for (const terms of [rk, ref, termsForDenomination("bapt")]) {
      expect(termRouteTarget("/munkatarsaink", terms)).toEqual({
        key: "staffSection",
        target: TERM_ROUTES.staffSection,
      });
    }
    expect(termRouteTarget("/munkatarsaink/x", rk)).toBeNull();
  });

  it("routes the rites section and its sub-pages per denomination (D-16)", () => {
    const bapt = termsForDenomination("bapt");
    expect(termRoutePath(rk, "ritesSection")).toBe("/szentsegek");
    expect(termRoutePath(ref, "ritesSection")).toBe("/alkalmak");
    expect(termRoutePath(bapt, "ritesSection")).toBe("/eletesemenyek");
    expect(termRouteTarget("/szentsegek", rk)).toEqual({
      key: "ritesSection",
      target: TERM_SECTION_ROUTES.ritesSection,
    });
    expect(termRouteTarget("/szentsegek/keresztelo", rk)?.target).toBe("/term/rites/keresztelo");
    expect(termRouteTarget("/alkalmak/keresztelo/bejelentes", ref)?.target).toBe(
      "/term/rites/keresztelo/bejelentes",
    );
    expect(termRouteTarget("/eletesemenyek/bemerites", bapt)?.key).toBe("ritesSection");
    // Another denomination's section, look-alike prefixes and deeper paths are not rewritten.
    for (const path of [
      "/alkalmak/keresztelo",
      "/szentsegekx",
      "/szentsegek-x/keresztelo",
      "/szentsegek/",
      "/szentsegek/a/b/c",
      "/szentsegek/Keresztelo",
    ]) {
      expect(termRouteTarget(path, rk), path).toBeNull();
    }
  });

  it("only slug paths of up to three segments are candidates (the proxy skips the lookup otherwise)", () => {
    for (const path of [
      "/miserend",
      "/istentiszteleti-rend",
      "/alkalmaink",
      "/a1",
      "/admin/rend",
      "/szentsegek/keresztelo/bejelentes",
    ]) {
      expect(isTermRouteCandidate(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/miserend/",
      "/Miserend",
      "/-x",
      "/a--b",
      "/a.png",
      "/a/b/c/d",
      "/a//b",
    ]) {
      expect(isTermRouteCandidate(path), path).toBe(false);
    }
  });

  it("recognises term route keys", () => {
    expect(isTermRouteKey("serviceSchedule")).toBe(true);
    expect(isTermRouteKey("ritesSection")).toBe(true);
    for (const value of [null, "", "toString", "x"]) expect(isTermRouteKey(value)).toBe(false);
  });
});
