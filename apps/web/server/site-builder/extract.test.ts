// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractPage, normalizeUrl, timesIn, weekdaysIn } from "./extract";
import { FIXTURE_PAGES, FIXTURE_ORIGIN } from "./fixtures";

const U = (p: string) => `${FIXTURE_ORIGIN}${p}`;

describe("extractPage", () => {
  it("reads meta, OpenGraph, theme colour and JSON-LD", () => {
    const p = extractPage(FIXTURE_PAGES["/"]!, U("/"));
    expect(p.title).toBe("Mintavárosi Szent Példa Plébánia");
    expect(p.lang).toBe("hu");
    expect(p.themeColor).toBe("#7a1f2b");
    expect(p.siteName).toBe("Szent Példa Plébánia");
    expect(p.jsonLd[0]).toMatchObject({ "@type": "Church" });
    expect(p.images.map((i) => i.hint)).toContain("og");
    expect(p.images.find((i) => i.src.endsWith("logo.png"))?.hint).toBe("logo");
  });

  it("keeps the main text and drops navigation and footer from the blocks", () => {
    const p = extractPage(FIXTURE_PAGES["/rolunk"]!, U("/rolunk"));
    const texts = p.blocks.flatMap((b) =>
      b.type === "paragraph" || b.type === "heading" ? [b.text] : [],
    );
    expect(texts[0]).toBe("Rólunk");
    expect(texts.join(" ")).not.toContain("Belépés");
    expect(texts.join(" ")).not.toContain("1234 Mintaváros, Példa utca 5. |");
  });

  it("separates nav links from body links and strips tracking params", () => {
    const p = extractPage(FIXTURE_PAGES["/"]!, U("/"));
    expect(p.links.filter((l) => l.nav).map((l) => l.href)).toContain(U("/miserend"));
    expect(normalizeUrl("/a?utm_source=x&b=1#frag", "https://x.hu/")).toBe("https://x.hu/a?b=1");
    expect(normalizeUrl("mailto:a@b.hu", "https://x.hu/")).toBeNull();
    expect(normalizeUrl("javascript:void(0)", "https://x.hu/")).toBeNull();
  });

  it("finds schedule lines from table rows, with weekday and time", () => {
    const p = extractPage(FIXTURE_PAGES["/miserend"]!, U("/miserend"));
    expect(p.schedule).toContainEqual(expect.objectContaining({ weekdays: [7], times: ["10:00"] }));
    expect(p.schedule.some((s) => s.times.includes("18:30") && s.weekdays.includes(1))).toBe(true);
  });

  it("finds Hungarian addresses, e-mails and phones (including the footer)", () => {
    const p = extractPage(FIXTURE_PAGES["/kapcsolat"]!, U("/kapcsolat"));
    expect(p.addresses[0]).toMatchObject({ postalCode: "1234", city: "Mintaváros" });
    expect(p.emails).toContain("iroda@plebania.example.hu");
    expect(p.phones.length).toBeGreaterThan(0);
  });

  it("reads the published date of an article and survives hostile markup", () => {
    expect(extractPage(FIXTURE_PAGES["/hirek/majus-1"]!, U("/x")).publishedAt).toBe("2026-05-01");
    const deep = "<div>".repeat(5000) + "x" + "</div>".repeat(5000);
    expect(() => extractPage(`<html><body>${deep}<p>vége</p></body></html>`, U("/"))).not.toThrow();
    expect(() => extractPage("<<<>>> not html \u0000", U("/"))).not.toThrow();
  });

  it("honours noindex", () => {
    expect(
      extractPage(
        '<html><head><meta name="robots" content="noindex"></head><body></body></html>',
        U("/"),
      ).noindex,
    ).toBe(true);
  });

  it("ignores script and style content, comments and hidden elements", () => {
    const p = extractPage(
      '<html><body><main><script>var secret="x@y.hu"</script><style>.a{}</style><p hidden>rejtett</p><div style="display:none">elrejtve</div><p>Látható szöveg a közösségről, elég hosszan, hogy főtartalomnak számítson, és a rendszer ne dobja el.</p></main></body></html>',
      U("/"),
    );
    const all = JSON.stringify(p.blocks);
    expect(all).toContain("Látható");
    expect(all).not.toMatch(/secret|rejtett|elrejtve/);
  });
});

describe("pattern helpers", () => {
  it("reads times and weekdays", () => {
    expect(timesIn("Vasárnap 9.30 és 18 órakor, hétfőn 7:00")).toEqual(["09:30", "18:00", "07:00"]);
    expect(timesIn("2026.11.28")).toEqual([]);
    expect(weekdaysIn("Hétfőn és szombaton")).toEqual([1, 6]);
  });
});
