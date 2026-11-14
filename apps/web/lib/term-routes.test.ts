import { describe, expect, it } from "vitest";
import { termsForDenomination } from "@/i18n/terms";
import { TERM_ROUTES, termRoutePath, termRouteTarget } from "./term-routes";

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

  it("follows a church's own term override", () => {
    const custom = {
      term: (key: string) => (key === "serviceSchedule" ? { slug: "alkalmaink" } : rk.term(key)),
    };
    expect(termRouteTarget("/alkalmaink", custom)?.key).toBe("serviceSchedule");
    expect(termRouteTarget("/miserend", custom)).toBeNull();
  });
});
