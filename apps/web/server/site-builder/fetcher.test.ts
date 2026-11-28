// @vitest-environment node
import { gzipSync } from "node:zlib";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchPublic, type FixtureOverride, type Resolver } from "./fetcher";

let server: http.Server;
let port = 0;
let hits: string[] = [];
const fixture = (): FixtureOverride => ({ allowLoopback: true, ports: [port] });
const base = () => `http://127.0.0.1:${port}`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    hits.push(url);
    const send = (status: number, headers: Record<string, string>, body = "") => {
      res.writeHead(status, headers);
      res.end(body);
    };
    if (url === "/ok")
      return send(200, { "content-type": "text/html; charset=utf-8" }, "<p>szia</p>");
    if (url === "/gz") {
      return send(
        200,
        { "content-type": "text/html", "content-encoding": "gzip" },
        gzipSync("<p>tömörített</p>") as unknown as string,
      );
    }
    if (url === "/bomb") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(gzipSync("a".repeat(5_000_000)));
    }
    if (url === "/big") return send(200, { "content-type": "text/html" }, "x".repeat(50_000));
    if (url === "/json") return send(200, { "content-type": "application/json" }, "{}");
    if (url === "/r1") return send(302, { location: "/r2" });
    if (url === "/r2") return send(301, { location: "/ok" });
    if (url === "/loop") return send(302, { location: "/loop" });
    if (url === "/to-metadata")
      return send(302, { location: "http://169.254.169.254/latest/meta-data/" });
    if (url === "/to-ftp") return send(302, { location: "ftp://example.hu/x" });
    if (url === "/to-port") return send(302, { location: "http://127.0.0.1:22/" });
    if (url === "/to-private-name") return send(302, { location: "http://intranet/x" });
    if (url === "/slow") return; // never answers
    if (url === "/404") return send(404, {}, "no");
    return send(200, { "content-type": "text/plain" }, "default");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("fetchPublic with the fixture override", () => {
  it("fetches, follows redirects and reports them", async () => {
    hits = [];
    const res = await fetchPublic(`${base()}/r1`, { fixture: fixture() });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body.toString()).toContain("szia");
      expect(res.redirects).toEqual([`${base()}/r2`, `${base()}/ok`]);
      expect(res.url).toBe(`${base()}/ok`);
    }
  });

  it("decompresses gzip", async () => {
    const res = await fetchPublic(`${base()}/gz`, { fixture: fixture() });
    expect(res.ok && res.body.toString()).toBe("<p>tömörített</p>");
  });

  it("caps the decompressed size (zip bomb)", async () => {
    const res = await fetchPublic(`${base()}/bomb`, { fixture: fixture(), maxBytes: 100_000 });
    expect(res).toMatchObject({ ok: false, code: "too_large" });
  });

  it("caps the body size", async () => {
    const res = await fetchPublic(`${base()}/big`, { fixture: fixture(), maxBytes: 1000 });
    expect(res).toMatchObject({ ok: false, code: "too_large" });
  });

  it("rejects content types outside the accept list", async () => {
    const res = await fetchPublic(`${base()}/json`, { fixture: fixture(), accept: ["text/html"] });
    expect(res).toMatchObject({ ok: false, code: "bad_content_type" });
  });

  it("limits redirects", async () => {
    const res = await fetchPublic(`${base()}/loop`, { fixture: fixture(), maxRedirects: 3 });
    expect(res).toMatchObject({ ok: false, code: "too_many_redirects" });
  });

  it("times out on a server that never answers", async () => {
    const res = await fetchPublic(`${base()}/slow`, { fixture: fixture(), timeoutMs: 200 });
    expect(res).toMatchObject({ ok: false, code: "timeout" });
  });

  it("reports bad statuses", async () => {
    const res = await fetchPublic(`${base()}/404`, { fixture: fixture() });
    expect(res).toMatchObject({ ok: false, code: "bad_status", status: 404 });
  });

  it.each([
    ["/to-metadata", "address"],
    ["/to-ftp", "scheme"],
    ["/to-port", "port"],
    ["/to-private-name", "hostname"],
  ])("re-checks every redirect hop: %s", async (path, detail) => {
    const res = await fetchPublic(`${base()}${path}`, { fixture: fixture() });
    expect(res).toMatchObject({ ok: false, code: "blocked_url", detail });
  });
});

describe("fetchPublic without the override (production policy)", () => {
  it("refuses loopback, private and metadata targets before connecting", async () => {
    hits = [];
    for (const url of [
      `${base()}/ok`,
      "http://10.0.0.5/",
      "http://169.254.169.254/",
      "http://[::1]/",
    ]) {
      const res = await fetchPublic(url);
      expect(res.ok).toBe(false);
    }
    expect(hits).toEqual([]);
  });

  it("refuses a hostname that resolves to a private address (DNS pointing inward)", async () => {
    hits = [];
    const resolver: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    const res = await fetchPublic("http://evil.example.hu/ok", { resolver });
    expect(res).toMatchObject({ ok: false, code: "blocked_address" });
    expect(hits).toEqual([]);
  });

  it("refuses mixed answers (public + private), the rebinding trick", async () => {
    const resolver: Resolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ];
    const res = await fetchPublic("https://evil.example.hu/", { resolver });
    expect(res).toMatchObject({ ok: false, code: "blocked_address" });
  });

  it("resolves exactly once per connection, inside the connection's own lookup", async () => {
    // There is no separate pre-resolution whose result could differ from the connect-time answer
    // (DNS rebinding): the validated answer is the one the socket uses.
    let calls = 0;
    hits = [];
    const res = await fetchPublic("http://rebind.example.hu/ok", {
      resolver: async () => {
        calls++;
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });
    expect(res).toMatchObject({ ok: false, code: "blocked_address" });
    expect(calls).toBe(1);
    expect(hits).toEqual([]);
  });

  it("reports unresolvable hosts", async () => {
    const res = await fetchPublic("http://nope.example.hu/", { resolver: async () => [] });
    expect(res).toMatchObject({ ok: false, code: "dns" });
  });

  it("enforces the registrable-domain scope on the first URL", async () => {
    const res = await fetchPublic("https://other.example.com/", {
      scope: ["templom.hu"],
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(res).toMatchObject({ ok: false, code: "off_scope" });
  });

  it("refuses the fixture override in production", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      await expect(fetchPublic(`${base()}/ok`, { fixture: fixture() })).rejects.toThrow(
        /production/,
      );
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });
});

describe("fixture override cannot be switched on from outside", () => {
  it("is a code-level option only: environment variables and config do not enable loopback", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: "production",
      SITE_BUILDER_FIXTURE: "1",
      SITE_BUILDER_ALLOW_LOOPBACK: "1",
      ALLOW_LOOPBACK: "1",
      DEMO_MODE: "1",
    });
    try {
      hits = [];
      const res = await fetchPublic(`${base()}/ok`);
      expect(res).toMatchObject({ ok: false, code: "blocked_url" });
      expect(hits).toEqual([]);
      await expect(fetchPublic(`${base()}/ok`, { fixture: fixture() })).rejects.toThrow(
        /production/,
      );
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });

  it("is used by no production source file (static scan)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name === "e2e") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          !/\.test\.tsx?$/.test(name) &&
          p !== join(__dirname, "fetcher.ts")
        ) {
          const src = readFileSync(p, "utf8");
          if (/\bfixture\s*:\s*\{/.test(src) || /allowLoopback\s*:\s*true/.test(src))
            offenders.push(p.replace(root, ""));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
