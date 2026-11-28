import { fetchPublic, USER_AGENT, type FetchOptions, type FetchResult } from "./fetcher";
import { registrableDomain } from "./domain";
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, ROBOTS_MAX_BYTES, type Robots } from "./robots";

/**
 * The polite crawler on top of `fetchPublic`: one site per instance (same registrable domain),
 * robots.txt first (cached per origin), per-origin request spacing (`Crawl-delay`, capped),
 * and hard budgets for pages, images and total bytes of one run.
 */

export interface SiteFetcherLimits {
  readonly maxPages: number;
  readonly maxImages: number;
  readonly maxTotalBytes: number;
  readonly maxPageBytes: number;
  readonly maxImageBytes: number;
  readonly minDelayMs: number;
  readonly maxCrawlDelayMs: number;
}

export const DEFAULT_SITE_LIMITS: SiteFetcherLimits = {
  maxPages: 30,
  maxImages: 60,
  maxTotalBytes: 64 * 1024 * 1024,
  maxPageBytes: 2 * 1024 * 1024,
  maxImageBytes: 8 * 1024 * 1024,
  minDelayMs: 500,
  maxCrawlDelayMs: 5_000,
};

export type SiteFetchFailureCode = FetchResultFailure | "robots_disallowed" | "budget_exhausted";
type FetchResultFailure = Exclude<FetchResult, { ok: true }>["code"];

export type SiteFetchResult =
  | Extract<FetchResult, { ok: true }>
  | {
      readonly ok: false;
      readonly code: SiteFetchFailureCode;
      readonly url: string;
      readonly status?: number;
    };

export const PAGE_TYPES = ["text/html", "application/xhtml+xml"] as const;
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export interface SiteFetcherOptions {
  readonly limits?: Partial<SiteFetcherLimits>;
  /** Passed to every request (resolver, fixture override, timeouts). */
  readonly base?: Pick<FetchOptions, "resolver" | "fixture" | "timeoutMs" | "maxRedirects">;
  /**
   * Replaces the network (demo mode and tests serve fixture pages from memory through it). It
   * receives the same options as `fetchPublic` and must return the same result shape.
   */
  readonly transport?: typeof fetchPublic;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export class SiteFetcher {
  readonly scope: string;
  readonly limits: SiteFetcherLimits;
  private pages = 0;
  private images = 0;
  private bytes = 0;
  private readonly robots = new Map<string, Promise<Robots>>();
  private readonly lastRequest = new Map<string, number>();
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly transport: typeof fetchPublic;

  constructor(
    startUrl: string,
    private readonly options: SiteFetcherOptions = {},
  ) {
    const host = new URL(startUrl).hostname;
    const reg = registrableDomain(host) ?? host.toLowerCase();
    this.scope = reg;
    this.limits = { ...DEFAULT_SITE_LIMITS, ...options.limits };
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
    this.transport = options.transport ?? fetchPublic;
  }

  get usage() {
    return { pages: this.pages, images: this.images, bytes: this.bytes };
  }

  private fetchOptions(extra: FetchOptions): FetchOptions {
    return { ...this.options.base, scope: [this.scope], userAgent: USER_AGENT, ...extra };
  }

  private async robotsFor(url: URL): Promise<Robots> {
    const origin = url.origin;
    let cached = this.robots.get(origin);
    if (!cached) {
      cached = this.loadRobots(origin);
      this.robots.set(origin, cached);
    }
    return cached;
  }

  private async loadRobots(origin: string): Promise<Robots> {
    const res = await this.transport(`${origin}/robots.txt`, {
      ...this.fetchOptions({ maxBytes: ROBOTS_MAX_BYTES, timeoutMs: 10_000 }),
    });
    if (res.ok) return parseRobots(res.body.toString("utf8"));
    if (res.code === "bad_status") {
      // RFC 9309: "unavailable" (4xx) means no rules; 401/403 are treated as a closed door.
      if (res.status === 401 || res.status === 403) return DISALLOW_ALL;
      if (res.status !== undefined && res.status >= 400 && res.status < 500) return ALLOW_ALL;
    }
    if (res.code === "too_large") return parseRobots("");
    return DISALLOW_ALL; // 5xx or unreachable: do not crawl
  }

  private async pace(origin: string, robots: Robots): Promise<void> {
    const wanted = Math.min(
      Math.max(this.limits.minDelayMs, (robots.crawlDelaySeconds ?? 0) * 1000),
      this.limits.maxCrawlDelayMs,
    );
    const last = this.lastRequest.get(origin);
    if (last !== undefined) {
      const wait = last + wanted - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequest.set(origin, this.now());
  }

  private async guarded(url: string, kind: "page" | "image"): Promise<SiteFetchResult> {
    const over =
      this.bytes >= this.limits.maxTotalBytes ||
      (kind === "page" ? this.pages >= this.limits.maxPages : this.images >= this.limits.maxImages);
    if (over) return { ok: false, code: "budget_exhausted", url };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, code: "blocked_url", url };
    }
    const reg = registrableDomain(parsed.hostname) ?? parsed.hostname.toLowerCase();
    if (reg !== this.scope) return { ok: false, code: "off_scope", url };
    const robots = await this.robotsFor(parsed);
    if (!robots.isAllowed(parsed.pathname + parsed.search)) {
      return { ok: false, code: "robots_disallowed", url };
    }
    await this.pace(parsed.origin, robots);
    if (kind === "page") this.pages++;
    else this.images++;
    const res = await this.transport(
      url,
      this.fetchOptions(
        kind === "page"
          ? { accept: PAGE_TYPES, maxBytes: this.limits.maxPageBytes }
          : { accept: IMAGE_TYPES, maxBytes: this.limits.maxImageBytes },
      ),
    );
    if (!res.ok) return res;
    this.bytes += res.body.length;
    // A redirect may have landed on a path robots.txt forbids.
    if (res.url !== url) {
      const landed = new URL(res.url);
      const landedRobots = await this.robotsFor(landed);
      if (!landedRobots.isAllowed(landed.pathname + landed.search)) {
        return { ok: false, code: "robots_disallowed", url: res.url };
      }
    }
    return res;
  }

  fetchPage(url: string): Promise<SiteFetchResult> {
    return this.guarded(url, "page");
  }

  fetchImage(url: string): Promise<SiteFetchResult> {
    return this.guarded(url, "image");
  }
}
