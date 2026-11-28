import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import { registrableDomain } from "./domain";
import { checkUrl, isPublicAddress, type BlockReason } from "./ssrf";

/**
 * The SSRF-safe HTTP fetcher of the site builder. Every hop (first request and each redirect) is
 * checked syntactically (`checkUrl`) and the socket connects only to an address this module
 * validated itself: the check runs inside the connection's own `lookup`, so DNS is resolved once
 * per connection and a rebinding answer between "check" and "connect" cannot exist. Mixed answers
 * (one public, one private address) are refused. No cookies, no credentials, no auth headers.
 */

export const USER_AGENT = "ChurchySiteBuilder/1.0";

export type FetchFailureCode =
  | "blocked_url"
  | "blocked_address"
  | "off_scope"
  | "dns"
  | "timeout"
  | "too_large"
  | "too_many_redirects"
  | "bad_status"
  | "bad_content_type"
  | "network";

export type FetchResult =
  | {
      readonly ok: true;
      /** The final URL after redirects. */
      readonly url: string;
      readonly status: number;
      readonly contentType: string;
      readonly body: Buffer;
      readonly redirects: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: FetchFailureCode;
      /** The URL where it failed. */
      readonly url: string;
      readonly status?: number;
      readonly detail?: BlockReason;
    };

export interface FetchLimits {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
}

export const DEFAULT_LIMITS: FetchLimits = {
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 5,
};

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => ({
    address: a.address,
    family: a.family === 6 ? 6 : 4,
  }));

/**
 * The only way to reach a loopback fixture server (unit and e2e tests). It is refused when
 * NODE_ENV is production, allows 127.0.0.0/8 and ::1 (nothing else private) and the listed ports.
 */
export interface FixtureOverride {
  readonly allowLoopback: true;
  readonly ports: readonly number[];
}

export interface FetchOptions extends Partial<FetchLimits> {
  /** Accepted `Content-Type` prefixes, e.g. `["text/html"]`; unset accepts any. */
  readonly accept?: readonly string[];
  /** Registrable domains every hop must belong to; unset means any public site. */
  readonly scope?: readonly string[];
  readonly resolver?: Resolver;
  readonly fixture?: FixtureOverride;
  readonly userAgent?: string;
}

class SsrfError extends Error {
  constructor(readonly code: "blocked_address" | "dns") {
    super(code);
  }
}

function assertFixtureAllowed(fixture: FixtureOverride | undefined): void {
  if (fixture && process.env.NODE_ENV === "production") {
    throw new Error("The fetcher fixture override is not available in production.");
  }
}

function inScope(host: string, scope: readonly string[] | undefined): boolean {
  if (!scope) return true;
  if (isIP(host)) return scope.includes(host);
  const reg = registrableDomain(host);
  return reg !== null && scope.includes(reg);
}

function makeLookup(resolver: Resolver, allowLoopback: boolean): LookupFunction {
  const fn = (
    hostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    resolver(hostname).then(
      (answers) => {
        if (
          answers.length === 0 ||
          answers.some((a) => !isPublicAddress(a.address, { allowLoopback }))
        ) {
          callback(new SsrfError(answers.length === 0 ? "dns" : "blocked_address"), "", 4);
          return;
        }
        if (options.all) {
          callback(
            null,
            answers.map((a) => ({ address: a.address, family: a.family })),
          );
        } else {
          callback(null, answers[0]!.address, answers[0]!.family);
        }
      },
      () => callback(new SsrfError("dns"), "", 4),
    );
  };
  return fn as unknown as LookupFunction;
}

interface Hop {
  readonly status: number;
  readonly location: string | null;
  readonly contentType: string;
  readonly body: Buffer | null;
}

function requestOnce(
  url: URL,
  host: string,
  opts: Required<Pick<FetchOptions, "userAgent">> & {
    limits: FetchLimits;
    accept: readonly string[] | undefined;
    lookup: LookupFunction;
    deadline: number;
  },
): Promise<Hop | { failure: FetchFailureCode }> {
  return new Promise((resolve) => {
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (v: Hop | { failure: FetchFailureCode }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const remaining = opts.deadline - Date.now();
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        lookup: opts.lookup,
        agent: false, // no connection reuse across hops or runs
        headers: {
          "user-agent": opts.userAgent,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.8,image/*;q=0.8,text/plain;q=0.5,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "hu,en;q=0.5",
          host: url.host,
        },
        servername: isIP(host) ? undefined : host,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400 && location) {
          res.resume();
          done({ status, location, contentType, body: null });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          done({ status, location: null, contentType, body: null });
          return;
        }
        if (opts.accept && !opts.accept.some((p) => contentType.startsWith(p))) {
          res.destroy();
          done({ failure: "bad_content_type" });
          return;
        }
        const declared = Number(res.headers["content-length"]);
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        if (!enc && Number.isFinite(declared) && declared > opts.limits.maxBytes) {
          res.destroy();
          done({ failure: "too_large" });
          return;
        }
        let stream: Readable = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        else if (enc && enc !== "identity") {
          res.destroy();
          done({ failure: "network" });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.limits.maxBytes) {
            res.destroy();
            stream.destroy();
            done({ failure: "too_large" });
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          done({ status, location: null, contentType, body: Buffer.concat(chunks) }),
        );
        stream.on("error", () => done({ failure: "network" }));
        res.on("error", () => done({ failure: "network" }));
      },
    );
    const timer = setTimeout(
      () => {
        req.destroy();
        done({ failure: "timeout" });
      },
      Math.max(1, remaining),
    );
    req.on("error", (err) => {
      const cause = err as Error & { code?: string };
      if (err instanceof SsrfError) done({ failure: err.code });
      else done({ failure: cause.code === "ENOTFOUND" ? "dns" : "network" });
    });
    req.end();
  });
}

/** One guarded GET with redirects. Never throws for network or policy outcomes. */
export async function fetchPublic(input: string, options: FetchOptions = {}): Promise<FetchResult> {
  assertFixtureAllowed(options.fixture);
  const limits: FetchLimits = {
    maxBytes: options.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    timeoutMs: options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    maxRedirects: options.maxRedirects ?? DEFAULT_LIMITS.maxRedirects,
  };
  const policy = {
    allowLoopback: options.fixture?.allowLoopback === true,
    extraPorts: options.fixture?.ports,
  };
  const lookup = makeLookup(options.resolver ?? systemResolver, policy.allowLoopback);
  const deadline = Date.now() + limits.timeoutMs;
  const redirects: string[] = [];
  let current = input;
  for (let hops = 0; ; hops++) {
    const checked = checkUrl(current, policy);
    if (!checked.ok) {
      return { ok: false, code: "blocked_url", url: current, detail: checked.reason };
    }
    if (!inScope(checked.host, options.scope))
      return { ok: false, code: "off_scope", url: current };
    const hop = await requestOnce(checked.url, checked.host, {
      userAgent: options.userAgent ?? USER_AGENT,
      limits,
      accept: options.accept,
      lookup,
      deadline,
    });
    if ("failure" in hop) return { ok: false, code: hop.failure, url: current };
    if (hop.location !== null) {
      if (hops >= limits.maxRedirects)
        return { ok: false, code: "too_many_redirects", url: current };
      let next: URL;
      try {
        next = new URL(hop.location, checked.url);
      } catch {
        return { ok: false, code: "blocked_url", url: current, detail: "malformed" };
      }
      next.hash = "";
      redirects.push(next.href);
      current = next.href;
      continue;
    }
    if (hop.body === null)
      return { ok: false, code: "bad_status", url: current, status: hop.status };
    return {
      ok: true,
      url: checked.url.href,
      status: hop.status,
      contentType: hop.contentType,
      body: hop.body,
      redirects,
    };
  }
}
