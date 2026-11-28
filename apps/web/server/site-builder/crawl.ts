import { extractPage, type ExtractedPage } from "./extract";
import type { SiteFetcher } from "./site-fetcher";

/**
 * Same-site crawl of at most `maxPages` pages (the fetcher's budget is the hard limit): nav links
 * and pages with church-typical paths first, depth <= 2, no files, no pages that say `noindex`.
 */

export type CrawlWarning =
  | { readonly code: "robots_blocked" | "page_failed"; readonly url: string }
  | { readonly code: "page_budget"; readonly url: null };

export interface CrawlResult {
  readonly pages: readonly ExtractedPage[];
  readonly warnings: readonly CrawlWarning[];
  /** The start page could not be read at all. */
  readonly startFailure: "robots_blocked" | "unreachable" | null;
}

const FILE_EXT =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|zip|docx?|xlsx?|pptx?|mp3|mp4|mov|avi|wav|ics|xml|json|rss)(\?|$)/i;
const PRIORITY =
  /(miserend|istentisztelet|rolunk|rolunk|kapcsolat|hirek|esemeny|hitelet|szentseg|kereszteles|hittan|csoport|tortenet|plebania|gyulekezet|templom|hirdetes|ifjusag|karitasz|kozosseg|programok)/i;
const SKIP_PATH =
  /(login|belepes|admin|wp-login|wp-admin|feed|cart|kosar|shop|webshop|tag\/|author\/|search|kereses|print|calendar\/\d)/i;

export function score(link: { href: string; nav: boolean }): number {
  let s = link.nav ? 10 : 0;
  try {
    const u = new URL(link.href);
    const path = u.pathname.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (PRIORITY.test(path)) s += 5;
    s -= Math.min(u.pathname.split("/").filter(Boolean).length, 5);
    s -= [...u.searchParams.keys()].length;
  } catch {
    return -100;
  }
  return s;
}

export function shouldVisit(href: string): boolean {
  if (FILE_EXT.test(href)) return false;
  try {
    const u = new URL(href);
    if ([...u.searchParams.keys()].length > 2) return false;
    return !SKIP_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

export async function crawlSite(
  startUrl: string,
  fetcher: SiteFetcher,
  opts: { maxDepth?: number; signal?: AbortSignal; onPage?: (count: number) => void } = {},
): Promise<CrawlResult> {
  const maxDepth = opts.maxDepth ?? 2;
  const pages: ExtractedPage[] = [];
  const warnings: CrawlWarning[] = [];
  const seen = new Set<string>();
  let frontier: string[] = [startUrl];
  seen.add(startUrl);
  let startFailure: CrawlResult["startFailure"] = null;
  let budgetHit = false;

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    const next = new Map<string, number>();
    for (const url of frontier) {
      if (opts.signal?.aborted) return { pages, warnings, startFailure };
      const res = await fetcher.fetchPage(url);
      if (!res.ok) {
        if (res.code === "budget_exhausted") {
          budgetHit = true;
          break;
        }
        if (depth === 0 && url === startUrl) {
          startFailure = res.code === "robots_disallowed" ? "robots_blocked" : "unreachable";
        }
        warnings.push({
          code: res.code === "robots_disallowed" ? "robots_blocked" : "page_failed",
          url,
        });
        continue;
      }
      seen.add(res.url);
      const page = extractPage(res.body.toString("utf8"), res.url);
      if (page.noindex) continue;
      pages.push(page);
      opts.onPage?.(pages.length);
      for (const link of page.links) {
        if (seen.has(link.href) || !shouldVisit(link.href)) continue;
        const sc = score(link);
        const prev = next.get(link.href);
        if (prev === undefined || sc > prev) next.set(link.href, sc);
      }
    }
    if (budgetHit) break;
    frontier = [...next.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([href]) => href)
      .filter((href) => !seen.has(href));
    for (const f of frontier) seen.add(f);
    if (depth === maxDepth && frontier.length > 0)
      budgetHit = fetcher.usage.pages >= fetcher.limits.maxPages;
  }
  if (budgetHit) warnings.push({ code: "page_budget", url: null });
  return { pages, warnings, startFailure };
}
