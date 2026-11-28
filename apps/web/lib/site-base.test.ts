import { describe, expect, it } from "vitest";
import { demoSiteBase, isSitePath, siteHref, splitDemoSitePath } from "./site-base";

describe("siteHref", () => {
  const base = demoSiteBase("szent-tivadar");

  it("adds no prefix on a site's own host", () => {
    expect(siteHref("", "/kapcsolat")).toBe("/kapcsolat");
    expect(siteHref("", "/")).toBe("/");
  });

  it("prefixes absolute site paths", () => {
    expect(siteHref(base, "/")).toBe("/demo/szent-tivadar");
    expect(siteHref(base, "/kapcsolat")).toBe("/demo/szent-tivadar/kapcsolat");
    expect(siteHref(base, "/hirek?oldal=2")).toBe("/demo/szent-tivadar/hirek?oldal=2");
    expect(siteHref(base, "/esemenyek.ics")).toBe("/demo/szent-tivadar/esemenyek.ics");
  });

  it("leaves other links alone", () => {
    expect(siteHref(base, "https://example.test/x")).toBe("https://example.test/x");
    expect(siteHref(base, "mailto:iroda@pelda.hu")).toBe("mailto:iroda@pelda.hu");
    expect(siteHref(base, "#tartalom")).toBe("#tartalom");
    expect(siteHref(base, "?het=2026-11-22")).toBe("?het=2026-11-22");
    expect(siteHref(base, "//cdn.example.test/a")).toBe("//cdn.example.test/a");
  });

  it("does not prefix twice", () => {
    expect(siteHref(base, "/demo/szent-tivadar/kapcsolat")).toBe("/demo/szent-tivadar/kapcsolat");
    expect(siteHref(base, base)).toBe(base);
  });
});

describe("splitDemoSitePath", () => {
  it("splits the slug from the church-relative path", () => {
    expect(splitDemoSitePath("/demo/szent-tivadar")).toEqual({ slug: "szent-tivadar", rest: "/" });
    expect(splitDemoSitePath("/demo/szent-tivadar/")).toEqual({ slug: "szent-tivadar", rest: "/" });
    expect(splitDemoSitePath("/demo/dunaligeti-baptista/miserend")).toEqual({
      slug: "dunaligeti-baptista",
      rest: "/miserend",
    });
  });

  it("ignores everything that is not a church prefix", () => {
    expect(splitDemoSitePath("/")).toBeNull();
    expect(splitDemoSitePath("/demo")).toBeNull();
    expect(splitDemoSitePath("/demo/templom.svg")).toBeNull();
    expect(splitDemoSitePath("/kapcsolat")).toBeNull();
  });
});

describe("isSitePath", () => {
  it("keeps the platform areas out of a church prefix", () => {
    expect(isSitePath("/")).toBe(true);
    expect(isSitePath("/hirek/x")).toBe(true);
    expect(isSitePath("/admin")).toBe(false);
    expect(isSitePath("/munkater/naptar")).toBe(false);
    expect(isSitePath("/belepes")).toBe(false);
    expect(isSitePath("/site-home")).toBe(false);
  });
});
