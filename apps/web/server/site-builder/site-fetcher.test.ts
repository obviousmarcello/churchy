// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SiteFetcher } from "./site-fetcher";

let server: http.Server;
let port = 0;
let hits: string[] = [];
let robotsStatus = 200;
let robotsBody = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    hits.push(url);
    if (url === "/robots.txt") {
      res.writeHead(robotsStatus, { "content-type": "text/plain" });
      return res.end(robotsBody);
    }
    if (url.startsWith("/img")) {
      res.writeHead(200, { "content-type": url.endsWith("svg") ? "image/svg+xml" : "image/png" });
      return res.end(Buffer.from([1, 2, 3]));
    }
    if (url === "/to-closed") {
      res.writeHead(302, { location: "/private/x" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<p>oldal</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const make = (limits = {}) =>
  new SiteFetcher(`http://127.0.0.1:${port}/`, {
    limits: { minDelayMs: 0, ...limits },
    base: { fixture: { allowLoopback: true, ports: [port] } },
    sleep: async () => {},
  });
const url = (p: string) => `http://127.0.0.1:${port}${p}`;

describe("SiteFetcher", () => {
  it("checks robots.txt first, once per origin, and obeys it", async () => {
    robotsStatus = 200;
    robotsBody = "User-agent: ChurchySiteBuilder\nDisallow: /private\n";
    hits = [];
    const f = make();
    expect((await f.fetchPage(url("/a"))).ok).toBe(true);
    expect(await f.fetchPage(url("/private/x"))).toMatchObject({
      ok: false,
      code: "robots_disallowed",
    });
    expect((await f.fetchPage(url("/b"))).ok).toBe(true);
    expect(hits.filter((h) => h === "/robots.txt")).toHaveLength(1);
    expect(hits).not.toContain("/private/x");
  });

  it("re-checks robots after a redirect", async () => {
    robotsBody = "User-agent: *\nDisallow: /private\n";
    const f = make();
    expect(await f.fetchPage(url("/to-closed"))).toMatchObject({
      ok: false,
      code: "robots_disallowed",
    });
  });

  it("treats a missing robots.txt as allow, 403 and 5xx as closed", async () => {
    robotsBody = "";
    robotsStatus = 404;
    expect((await make().fetchPage(url("/a"))).ok).toBe(true);
    robotsStatus = 403;
    expect(await make().fetchPage(url("/a"))).toMatchObject({
      ok: false,
      code: "robots_disallowed",
    });
    robotsStatus = 503;
    expect(await make().fetchPage(url("/a"))).toMatchObject({
      ok: false,
      code: "robots_disallowed",
    });
    robotsStatus = 200;
  });

  it("caps pages and images per run", async () => {
    robotsBody = "";
    const f = make({ maxPages: 2, maxImages: 1 });
    expect((await f.fetchPage(url("/1"))).ok).toBe(true);
    expect((await f.fetchPage(url("/2"))).ok).toBe(true);
    expect(await f.fetchPage(url("/3"))).toMatchObject({ ok: false, code: "budget_exhausted" });
    expect((await f.fetchImage(url("/img1.png"))).ok).toBe(true);
    expect(await f.fetchImage(url("/img2.png"))).toMatchObject({
      ok: false,
      code: "budget_exhausted",
    });
    expect(f.usage).toMatchObject({ pages: 2, images: 1 });
  });

  it("caps total bytes", async () => {
    const f = make({ maxTotalBytes: 5 });
    expect((await f.fetchPage(url("/1"))).ok).toBe(true);
    expect(await f.fetchPage(url("/2"))).toMatchObject({ ok: false, code: "budget_exhausted" });
  });

  it("accepts raster images only (no SVG) and html only for pages", async () => {
    const f = make();
    expect(await f.fetchImage(url("/img.svg"))).toMatchObject({
      ok: false,
      code: "bad_content_type",
    });
    expect(await f.fetchPage(url("/img1.png"))).toMatchObject({
      ok: false,
      code: "bad_content_type",
    });
  });

  it("spaces requests per origin (Crawl-delay, capped)", async () => {
    robotsBody = "User-agent: *\nCrawl-delay: 2\n";
    const waits: number[] = [];
    let t = 1000;
    const f = new SiteFetcher(url("/"), {
      limits: { minDelayMs: 100, maxCrawlDelayMs: 1500 },
      base: { fixture: { allowLoopback: true, ports: [port] } },
      sleep: async (ms) => {
        waits.push(ms);
        t += ms;
      },
      now: () => t,
    });
    await f.fetchPage(url("/1"));
    await f.fetchPage(url("/2"));
    expect(waits).toEqual([1500]);
  });

  it("stays on the start site", async () => {
    const f = new SiteFetcher("https://www.templom.example.hu/", {
      base: { resolver: async () => [{ address: "93.184.216.34", family: 4 }] },
    });
    expect(f.scope).toBe("example.hu");
    expect(await f.fetchPage("https://other.example.com/")).toMatchObject({
      ok: false,
      code: "off_scope",
    });
  });
});
