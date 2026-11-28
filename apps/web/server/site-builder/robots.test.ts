// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRobots } from "./robots";

describe("parseRobots", () => {
  it("allows everything without rules", () => {
    expect(parseRobots("").isAllowed("/anything")).toBe(true);
  });

  it("applies the * group", () => {
    const r = parseRobots("User-agent: *\nDisallow: /admin\nDisallow: /private/");
    expect(r.isAllowed("/admin")).toBe(false);
    expect(r.isAllowed("/admin/x")).toBe(false);
    expect(r.isAllowed("/private/a")).toBe(false);
    expect(r.isAllowed("/news")).toBe(true);
  });

  it("prefers the ChurchySiteBuilder group over *", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: churchysitebuilder\nDisallow: /secret\n",
    );
    expect(r.isAllowed("/news")).toBe(true);
    expect(r.isAllowed("/secret/x")).toBe(false);
  });

  it("can close the site to the builder only", () => {
    const r = parseRobots("User-agent: ChurchySiteBuilder\nDisallow: /\n");
    expect(r.isAllowed("/")).toBe(false);
  });

  it("longest match wins, Allow wins a tie", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /files\nAllow: /files/public\nDisallow: /tie\nAllow: /tie",
    );
    expect(r.isAllowed("/files/x")).toBe(false);
    expect(r.isAllowed("/files/public/x")).toBe(true);
    expect(r.isAllowed("/tie")).toBe(true);
  });

  it("supports * and $", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /calendar/*/edit");
    expect(r.isAllowed("/a/b.pdf")).toBe(false);
    expect(r.isAllowed("/a/b.pdf?x=1")).toBe(true);
    expect(r.isAllowed("/calendar/2026/edit")).toBe(false);
    expect(r.isAllowed("/calendar/2026/view")).toBe(true);
  });

  it("matches the query string and ignores comments and empty Disallow", () => {
    const r = parseRobots("User-agent: *  # all\nDisallow: /search?\nDisallow:\n");
    expect(r.isAllowed("/search?q=1")).toBe(false);
    expect(r.isAllowed("/search")).toBe(true);
  });

  it("merges stacked user-agent lines and reads Crawl-delay and sitemaps", () => {
    const r = parseRobots(
      "User-agent: googlebot\nUser-agent: ChurchySiteBuilder\nCrawl-delay: 3\nDisallow: /x\nSitemap: https://a.example.hu/s.xml",
    );
    expect(r.isAllowed("/x")).toBe(false);
    expect(r.crawlDelaySeconds).toBe(3);
    expect(r.sitemaps).toEqual(["https://a.example.hu/s.xml"]);
  });

  it("compares percent-encodings case-insensitively", () => {
    expect(parseRobots("User-agent: *\nDisallow: /%c3%a1").isAllowed("/%C3%A1")).toBe(false);
  });
});
